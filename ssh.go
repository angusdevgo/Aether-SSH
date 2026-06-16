package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pkg/sftp"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

type SessionData struct {
	Client              *ssh.Client
	Session             *ssh.Session
	SFTP                *sftp.Client
	Stdin               io.WriteCloser
	HistoryStream       *commandHistoryStream
	RemoteHistoryActive bool
}

type SSHManager struct {
	ctx           context.Context
	app           *App // reference to App for WebSocket output delivery
	sessions      map[string]*SessionData
	probeDeployed map[string]bool // tracks which sessions have probe.sh deployed
	portForwards  map[string][]*forwardEntry // sessionId -> active forwards
	mu            sync.Mutex
}

func NewSSHManager() *SSHManager {
	return &SSHManager{
		sessions:      make(map[string]*SessionData),
		probeDeployed: make(map[string]bool),
	}
}

// removeHostKey removes all known_hosts entries for a given hostname
func removeHostKey(path string, hostname string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	lines := strings.Split(string(data), "\n")
	var out []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			out = append(out, line)
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			names := strings.Split(fields[0], ",")
			match := false
			for _, name := range names {
				if name == hostname {
					match = true
					break
				}
			}
			if match {
				continue
			}
		}
		out = append(out, line)
	}
	os.WriteFile(path, []byte(strings.Join(out, "\n")+"\n"), 0600)
}

func (m *SSHManager) Connect(sessionId string, conn Connection) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Setup auth methods
	var authMethods []ssh.AuthMethod
	if conn.AuthMethod == "password" {
		authMethods = append(authMethods, ssh.Password(conn.Password))
		authMethods = append(authMethods, ssh.KeyboardInteractive(func(user, instruction string, questions []string, echos []bool) (answers []string, err error) {
			answers = make([]string, len(questions))
			for i := range answers {
				answers[i] = conn.Password
			}
			return answers, nil
		}))
	} else if conn.AuthMethod == "privateKey" {
		var signer ssh.Signer
		var err error
		if conn.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(conn.PrivateKey), []byte(conn.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(conn.PrivateKey))
		}
		if err != nil {
			return fmt.Errorf("invalid private key: %v", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	knownHostsPath := filepath.Join(os.Getenv("USERPROFILE"), ".ssh", "known_hosts")
	os.MkdirAll(filepath.Dir(knownHostsPath), 0700)
	if _, err := os.Stat(knownHostsPath); os.IsNotExist(err) {
		os.WriteFile(knownHostsPath, []byte(""), 0600)
	}

	hostKeyCallback, err := knownhosts.New(knownHostsPath)
	if err != nil {
		hostKeyCallback = ssh.InsecureIgnoreHostKey()
	}


	customHostKeyCallback := func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		err := hostKeyCallback(hostname, remote, key)
		if err == nil {
			return nil
		}
		
		var keyErr *knownhosts.KeyError
		if errors.As(err, &keyErr) {
			if len(keyErr.Want) == 0 {
				// 未知主机 → 自动信任
				f, fErr := os.OpenFile(knownHostsPath, os.O_APPEND|os.O_WRONLY, 0600)
				if fErr == nil {
					defer f.Close()
					line := knownhosts.Line([]string{hostname}, key)
					f.WriteString(line + "\n")
				}
				return nil
			} else {
				// 主机密钥已变更（如重装系统）→ 移除旧记录并自动信任新密钥
				removeHostKey(knownHostsPath, hostname)
				f, fErr := os.OpenFile(knownHostsPath, os.O_APPEND|os.O_WRONLY, 0600)
				if fErr == nil {
					defer f.Close()
					line := knownhosts.Line([]string{hostname}, key)
					f.WriteString(line + "\n")
				}
				if m.ctx != nil {
					runtime.EventsEmit(m.ctx, "ssh-hostkey-changed", hostname)
				}
				return nil
			}
		}
		return err
	}

	config := &ssh.ClientConfig{
		User:            conn.Username,
		Auth:            authMethods,
		HostKeyCallback: customHostKeyCallback,
		Timeout:         10 * time.Second,
		HostKeyAlgorithms: []string{
			"ssh-ed25519",
			"ecdsa-sha2-nistp256",
			"ecdsa-sha2-nistp384",
			"ecdsa-sha2-nistp521",
			"rsa-sha2-512",
			"rsa-sha2-256",
			"ssh-rsa",
			"ssh-dss",
		},
	}

	target := fmt.Sprintf("%s:%d", strings.TrimSpace(conn.Host), conn.Port)
	client, err := ssh.Dial("tcp", target, config)
	if err != nil {
		return err
	}

	// Create SFTP client
	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		client.Close()
		return fmt.Errorf("failed to start SFTP: %v", err)
	}

	// Create SSH Session for PTY
	session, err := client.NewSession()
	if err != nil {
		sftpClient.Close()
		client.Close()
		return err
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 115200,
		ssh.TTY_OP_OSPEED: 115200,
	}

	if err := session.RequestPty("xterm-256color", 24, 80, modes); err != nil {
		session.Close()
		sftpClient.Close()
		client.Close()
		return err
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		return err
	}

	shellPath := detectRemoteShell(client)
	launchCmd, remoteHistoryActive := buildShellLaunchCommand(shellPath)

	// Start shell
	if remoteHistoryActive {
		err = session.Start(launchCmd)
	} else {
		err = session.Shell()
	}
	if err != nil {
		return err
	}

	var historyStream *commandHistoryStream
	if remoteHistoryActive {
		historyStream = newCommandHistoryStream()
	}

	m.sessions[sessionId] = &SessionData{
		Client:              client,
		Session:             session,
		SFTP:                sftpClient,
		Stdin:               stdin,
		HistoryStream:       historyStream,
		RemoteHistoryActive: remoteHistoryActive,
	}

	// 启动读取 stdout/stderr
	go m.pipeOutput(sessionId, stdout, historyStream)
	go m.pipeOutput(sessionId, stderr, nil)

	// 启动后台连接意外断开监控协程
	go func() {
		_ = client.Wait()
		// 检测是否已被主动移除，若未被移除，说明是意外断开
		m.mu.Lock()
		_, exists := m.sessions[sessionId]
		m.mu.Unlock()
		if exists {
			m.CloseSessionResources(sessionId)
			if m.ctx != nil {
				runtime.EventsEmit(m.ctx, "ssh-disconnected", sessionId)
			}
		}
	}()

	return nil
}

func (m *SSHManager) pipeOutput(sessionId string, r io.Reader, historyStream *commandHistoryStream) {
	buf := make([]byte, 32768)

	// 直接读取并通过 WebSocket 发送，不再批处理缓冲
	// WebSocket 过 TCP loopback 延迟极低，无需批处理
	for {
		n, err := r.Read(buf)
		if n > 0 {
			data := make([]byte, n)
			copy(data, buf[:n])
			if historyStream != nil {
				visible, commands := historyStream.Process(data)
				data = visible
				for _, command := range commands {
					if command == "" || m.ctx == nil {
						continue
					}
					runtime.EventsEmit(m.ctx, "ssh-command-executed", map[string]string{
						"sessionId": sessionId,
						"command":   command,
						"time":      time.Now().Format(time.RFC3339),
						"source":    "remote",
					})
				}
			}
			if len(data) == 0 {
				if err != nil {
					return
				}
				continue
			}
			if m.app != nil {
				m.app.WriteWsOutput(sessionId, data)
			} else if m.ctx != nil {
				// fallback: WebSocket 未初始化时用 Events
				runtime.EventsEmit(m.ctx, "terminal-data-"+sessionId, string(data))
			}
		}
		if err != nil {
			return
		}
	}
}

func (m *SSHManager) Disconnect(sessionId string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[sessionId]; ok {
		// 清理异步输入事件监听
		if m.ctx != nil {
			runtime.EventsOff(m.ctx, "terminal-input-"+sessionId)
		}
		s.Stdin.Close()
		s.Session.Close()
		s.SFTP.Close()
		s.Client.Close()
		delete(m.sessions, sessionId)
	}
}

func (m *SSHManager) CloseSessionResources(sessionId string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	// 清理异步输入事件监听
	if m.ctx != nil {
		runtime.EventsOff(m.ctx, "terminal-input-"+sessionId)
	}
	if s, ok := m.sessions[sessionId]; ok {
		if s.Stdin != nil { s.Stdin.Close() }
		if s.Session != nil { s.Session.Close() }
		if s.SFTP != nil { s.SFTP.Close() }
		if s.Client != nil { s.Client.Close() }
	}
}

func (m *SSHManager) GetTerminalCwd(sessionId string) (string, error) {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if !ok {
		return "", fmt.Errorf("session not found")
	}

	if s.Client == nil {
		return "", fmt.Errorf("client connection is nil")
	}

	localAddr := s.Client.LocalAddr().String()
	parts := strings.Split(localAddr, ":")
	if len(parts) < 2 {
		return "", fmt.Errorf("invalid local address format")
	}
	port := parts[len(parts)-1]

	cmd := fmt.Sprintf(`PORT=%s
# 查找该端口对应的 sshd 进程 PID
SSHD_PID=""
for tool in "ss -ntp" "netstat -ntp" "lsof -ti :$PORT" "fuser $PORT/tcp 2>/dev/null"; do
  case "$tool" in
    ss*) SSHD_PID=$(ss -ntp 2>/dev/null | grep ":$PORT " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | head -n1) ;;
    netstat*) SSHD_PID=$(netstat -ntp 2>/dev/null | grep ":$PORT " | grep -oE '[0-9]+/sshd' | cut -d/ -f1 | head -n1) ;;
    lsof*) SSHD_PID=$(lsof -ti :$PORT 2>/dev/null | head -n1) ;;
    fuser*) SSHD_PID=$(fuser $PORT/tcp 2>/dev/null | tr -d ' ') ;;
  esac
  [ -n "$SSHD_PID" ] && break
done

CWD="/"
if [ -n "$SSHD_PID" ]; then
  # 尝试找到 sshd 下第一个 shell 子进程
  SHELL_PID=$(pgrep -P "$SSHD_PID" 2>/dev/null | head -n1)
  if [ -n "$SHELL_PID" ]; then
    CWD=$(readlink /proc/$SHELL_PID/cwd 2>/dev/null)
  fi
  # 回退：直接用 sshd 的 cwd（通常为 HOME）
  [ -z "$CWD" ] && CWD=$(readlink /proc/$SSHD_PID/cwd 2>/dev/null)
fi
# 最后回退：尝试从 /etc/passwd 找 HOME
[ -z "$CWD" ] && CWD=$(getent passwd $USER 2>/dev/null | cut -d: -f6)
echo "${CWD:-/}"`, port)

	out, err := m.executeCmd(s, cmd)
	if err != nil {
		return "", err
	}
	cwd := strings.TrimSpace(out)
	if cwd == "" {
		cwd = "/"
	}
	return cwd, nil
}

// WriteBytes sends raw bytes to the SSH PTY stdin (used by WebSocket handler)
func (m *SSHManager) WriteBytes(sessionId string, data []byte) {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if ok && s.Stdin != nil {
		_, _ = s.Stdin.Write(data)
	}
}

func (m *SSHManager) Resize(sessionId string, cols, rows int) {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if ok {
		s.Session.WindowChange(rows, cols)
	}
}

// executeCmd executes a command on a separate temporary session to avoid blocking the main PTY
func (m *SSHManager) executeCmd(s *SessionData, cmd string) (string, error) {
	session, err := s.Client.NewSession()
	if err != nil {
		return "", err
	}
	defer session.Close()

	var stdoutBuf bytes.Buffer
	session.Stdout = &stdoutBuf
	err = session.Run(cmd)
	return stdoutBuf.String(), err
}

func parseStatCpus(lines []string) map[string][]uint64 {
	res := make(map[string][]uint64)
	for _, l := range lines {
		if !strings.HasPrefix(l, "cpu") {
			continue
		}
		parts := strings.Fields(l)
		if len(parts) < 5 {
			continue
		}
		vals := make([]uint64, len(parts)-1)
		for i := 1; i < len(parts); i++ {
			v, _ := strconv.ParseUint(parts[i], 10, 64)
			vals[i-1] = v
		}
		res[parts[0]] = vals
	}
	return res
}

func parseNetDev(lines []string) map[string][]uint64 {
	res := make(map[string][]uint64)
	for _, l := range lines {
		if !strings.Contains(l, ":") {
			continue
		}
		parts := strings.Split(l, ":")
		name := strings.TrimSpace(parts[0])
		if name == "lo" {
			continue
		}
		fields := strings.Fields(parts[1])
		if len(fields) < 9 {
			continue
		}
		rx, _ := strconv.ParseUint(fields[0], 10, 64)
		tx, _ := strconv.ParseUint(fields[8], 10, 64)
		res[name] = []uint64{rx, tx}
	}
	return res
}

func parseDiskStats(lines []string) map[string][]uint64 {
	res := make(map[string][]uint64)
	for _, l := range lines {
		fields := strings.Fields(l)
		if len(fields) < 10 {
			continue
		}
		name := fields[2]
		if strings.HasPrefix(name, "loop") || strings.HasPrefix(name, "ram") {
			continue
		}
		readSectors, _ := strconv.ParseUint(fields[5], 10, 64)
		writeSectors, _ := strconv.ParseUint(fields[9], 10, 64)
		res[name] = []uint64{readSectors, writeSectors}
	}
	return res
}

const probeScript = `#!/bin/sh
# AetherSSH Probe Script - auto generated, do not edit
# Collects metrics via /proc - no external dependencies required

cat /proc/uptime
echo ---MEM---
grep -E '^MemTotal:|^MemFree:|^Buffers:|^Cached:|^SReclaimable:|^SwapTotal:|^SwapFree:' /proc/meminfo
echo ---DF---
df -k | grep -vE '^tmpfs|^udev|^devtmpfs|Filesystem'
echo ---OS---
grep PRETTY_NAME /etc/os-release 2>/dev/null || echo 'PRETTY_NAME="Linux"'
grep ^VERSION_ID= /etc/os-release 2>/dev/null
echo ---TZ---
cat /etc/timezone 2>/dev/null || date +'%Z'
echo ---HOSTNAME---
hostname
echo ---IP---
ip route get 1.1.1.1 2>/dev/null | grep -oE 'src [0-9.]+' | awk '{print $2}' || hostname -I 2>/dev/null | awk '{print $1}'
echo ---CPU1---
grep '^cpu' /proc/stat
echo ---NET1---
cat /proc/net/dev
echo ---DISKIO1---
cat /proc/diskstats
sleep 1
echo ---CPU2---
grep '^cpu' /proc/stat
echo ---NET2---
cat /proc/net/dev
echo ---DISKIO2---
cat /proc/diskstats
echo ---PROC---
ps -eo pid,pcpu,rss,comm --sort=-pcpu 2>/dev/null | head -21
echo ---DONE---
`

// deployProbeScript writes probe.sh to ~/.aether/ on the remote server via SFTP.
// It is idempotent: if already deployed for this session it returns immediately.
func (m *SSHManager) deployProbeScript(s *SessionData, sessionId string) error {
	m.mu.Lock()
	already := m.probeDeployed[sessionId]
	m.mu.Unlock()
	if already {
		return nil
	}

	// Ensure ~/.aether directory exists
	if err := s.SFTP.MkdirAll(".aether"); err != nil {
		// Non-fatal: fall back to /tmp/.aether
		_ = s.SFTP.MkdirAll("/tmp/.aether")
	}

	// Write the script file
	scriptPath := ".aether/probe.sh"
	f, err := s.SFTP.Create(scriptPath)
	if err != nil {
		scriptPath = "/tmp/.aether/probe.sh"
		f, err = s.SFTP.Create(scriptPath)
		if err != nil {
			return fmt.Errorf("cannot write probe script: %v", err)
		}
	}
	_, err = f.Write([]byte(probeScript))
	f.Close()
	if err != nil {
		return err
	}

	// Make executable
	_ = s.SFTP.Chmod(scriptPath, 0755)

	m.mu.Lock()
	m.probeDeployed[sessionId] = true
	m.mu.Unlock()
	return nil
}

func (m *SSHManager) GetSystemInfo(sessionId string) (map[string]interface{}, error) {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("session not found")
	}

	// Deploy probe script to ~/.aether/probe.sh (once per session, idempotent)
	_ = m.deployProbeScript(s, sessionId)

	// Execute the deployed script
	out, err := m.executeCmd(s, `sh -c 'f=~/.aether/probe.sh; [ -f "$f" ] && sh "$f" || sh /tmp/.aether/probe.sh'`)
	if err != nil || len(strings.TrimSpace(out)) == 0 {
		return nil, fmt.Errorf("probe script execution failed")
	}

	// ── Split on ---CPU2--- to get two halves ──────────────────────────
	halves := strings.SplitN(out, "---CPU2---", 2)
	if len(halves) < 2 {
		return nil, fmt.Errorf("unexpected output format")
	}
	part1 := halves[0]
	part2 := halves[1] // everything after ---CPU2---

	lines1 := strings.Split(part1, "\n")
	lines2 := strings.Split(part2, "\n")

	// ── Helper: extract a named section from a line slice ─────────────
	extractSection := func(lines []string, startMarker, endMarker string) []string {
		var out []string
		// BUG FIX: if startMarker is empty, strings.Contains(l,"") is always true
		// causing every line to be skipped via `continue`. Fix: start collecting immediately.
		inside := (startMarker == "")
		for _, l := range lines {
			if startMarker != "" && strings.Contains(l, startMarker) {
				inside = true
				continue
			}
			if endMarker != "" && strings.Contains(l, endMarker) {
				break
			}
			if inside {
				out = append(out, l)
			}
		}
		return out
	}

	// ── Parse uptime ──────────────────────────────────────────────────
	uptimeStr := "0 小时"
	if len(lines1) > 0 {
		var uptimeVal float64
		fmt.Sscanf(strings.TrimSpace(lines1[0]), "%f", &uptimeVal)
		days := int(uptimeVal / 86400)
		hours := int((uptimeVal - float64(days*86400)) / 3600)
		mins := int((uptimeVal - float64(days*86400) - float64(hours*3600)) / 60)
		if days > 0 {
			uptimeStr = fmt.Sprintf("%d 天 %d 小时", days, hours)
		} else if hours > 0 {
			uptimeStr = fmt.Sprintf("%d 小时 %d 分", hours, mins)
		} else {
			uptimeStr = fmt.Sprintf("%d 分钟", mins)
		}
	}

	// ── Parse memory ──────────────────────────────────────────────────
	var memTotal, memFree, memBuffers, memCached, memSReclaimable uint64
	for _, l := range lines1 {
		switch {
		case strings.HasPrefix(l, "MemTotal:"):
			fmt.Sscanf(l, "MemTotal: %d", &memTotal)
		case strings.HasPrefix(l, "MemFree:"):
			fmt.Sscanf(l, "MemFree: %d", &memFree)
		case strings.HasPrefix(l, "Buffers:"):
			fmt.Sscanf(l, "Buffers: %d", &memBuffers)
		case strings.HasPrefix(l, "Cached:"):
			fmt.Sscanf(l, "Cached: %d", &memCached)
		case strings.HasPrefix(l, "SReclaimable:"):
			fmt.Sscanf(l, "SReclaimable: %d", &memSReclaimable)
		}
	}
	memTotalMB := float64(memTotal) / 1024.0
	memFreeMB := float64(memFree) / 1024.0
	memCacheMB := float64(memBuffers+memCached+memSReclaimable) / 1024.0
	memUsedMB := memTotalMB - memFreeMB - memCacheMB
	if memUsedMB < 0 {
		memUsedMB = 0
	}

	// ── Parse df (all partitions) ─────────────────────────────────────
	dfLines := extractSection(lines1, "---DF---", "---OS---")
	var diskTotalKB, diskUsedKB uint64
	var diskPercent float64
	diskDevice := "disk"
	type partition struct {
		Mount  string
		Size   string
		Avail  string
		UsedPct int
	}
	var partitions []partition
	for _, l := range dfLines {
		fields := strings.Fields(l)
		if len(fields) < 6 {
			continue
		}
		totalKB, _ := strconv.ParseUint(fields[1], 10, 64)
		usedKB, _ := strconv.ParseUint(fields[2], 10, 64)
		availKB, _ := strconv.ParseUint(fields[3], 10, 64)
		pctStr := strings.TrimSuffix(fields[4], "%")
		pct, _ := strconv.Atoi(pctStr)
		mount := fields[5]
		if mount == "/" {
			diskDevice = filepath.Base(fields[0])
			diskTotalKB = totalKB
			diskUsedKB = usedKB
			if totalKB > 0 {
				diskPercent = float64(usedKB) / float64(totalKB) * 100.0
			}
		}
		formatGB := func(kb uint64) string {
			gb := float64(kb) / (1024.0 * 1024.0)
			if gb < 1 {
				return fmt.Sprintf("%.0fM", float64(kb)/1024.0)
			}
			return fmt.Sprintf("%.1fG", gb)
		}
		partitions = append(partitions, partition{
			Mount:   mount,
			Size:    formatGB(totalKB),
			Avail:   formatGB(availKB),
			UsedPct: pct,
		})
		_ = usedKB
	}
	diskTotalGB := float64(diskTotalKB) / (1024.0 * 1024.0)
	diskUsedGB := float64(diskUsedKB) / (1024.0 * 1024.0)

	// ── Parse OS / timezone / hostname ───────────────────────────────
	osName := "Linux"
	for _, l := range extractSection(lines1, "---OS---", "---TZ---") {
		if strings.HasPrefix(l, "PRETTY_NAME=") {
			osName = strings.Trim(strings.TrimPrefix(l, "PRETTY_NAME="), "\"")
		}
	}
	tzStr := "UTC"
	for _, l := range extractSection(lines1, "---TZ---", "---HOSTNAME---") {
		t := strings.TrimSpace(l)
		if t != "" {
			tzStr = t
			break
		}
	}
	hostname := ""
	for _, l := range extractSection(lines1, "---HOSTNAME---", "---IP---") {
		t := strings.TrimSpace(l)
		if t != "" {
			hostname = t
			break
		}
	}
	ipAddr := ""
	for _, l := range extractSection(lines1, "---IP---", "---CPU1---") {
		t := strings.TrimSpace(l)
		if t != "" {
			ipAddr = t
			break
		}
	}

	// ── Parse CPU (/proc/stat delta, XTerminal method) ────────────────
	cpuLines1 := extractSection(lines1, "---CPU1---", "---NET1---")
	cpuLines2 := extractSection(lines2, "", "---NET2---") // empty startMarker = collect from beginning

	parseStat := func(lines []string) map[string][]uint64 {
		res := make(map[string][]uint64)
		for _, l := range lines {
			if !strings.HasPrefix(l, "cpu") {
				continue
			}
			parts := strings.Fields(l)
			if len(parts) < 5 {
				continue
			}
			// /proc/stat fields: user nice system idle iowait irq softirq steal ...
			getU := func(i int) uint64 {
				if i+1 < len(parts) {
					v, _ := strconv.ParseUint(parts[i+1], 10, 64)
					return v
				}
				return 0
			}
			userN := getU(0) + getU(1)              // user + nice
			sysN := getU(2) + getU(5) + getU(6) + getU(7) // system + irq + softirq + steal
			idleN := getU(3) + getU(4)             // idle + iowait
			total := userN + sysN + idleN
			res[parts[0]] = []uint64{userN, sysN, idleN, total}
		}
		return res
	}

	cpus1 := parseStat(cpuLines1)
	cpus2 := parseStat(cpuLines2)

	computeUsage := func(name string) float64 {
		v1, ok1 := cpus1[name]
		v2, ok2 := cpus2[name]
		if !ok1 || !ok2 || len(v1) < 4 || len(v2) < 4 {
			return 0
		}
		// v = [user+nice, system+irq+softirq+steal, idle+iowait, total]
		dTotal := float64(v2[3]) - float64(v1[3])
		dIdle := float64(v2[2]) - float64(v1[2])
		if dTotal <= 0 {
			return 0
		}
		usage := 100.0 * (1.0 - dIdle/dTotal)
		if usage < 0 {
			return 0
		}
		if usage > 100 {
			return 100
		}
		return usage
	}

	cpuTotalUsage := computeUsage("cpu")

	// Collect core names, sort them (cpu0, cpu1, cpu2...)
	var coreNames []string
	for name := range cpus2 {
		if name != "cpu" && strings.HasPrefix(name, "cpu") {
			coreNames = append(coreNames, name)
		}
	}
	sort.Strings(coreNames)

	var cpuCoreUsages []float64
	for _, name := range coreNames {
		cpuCoreUsages = append(cpuCoreUsages, computeUsage(name))
	}

	// ── Parse Network ─────────────────────────────────────────────────
	parseNetDev2 := func(lines []string) map[string][]uint64 {
		res := make(map[string][]uint64)
		for _, l := range lines {
			if !strings.Contains(l, ":") {
				continue
			}
			parts := strings.SplitN(l, ":", 2)
			name := strings.TrimSpace(parts[0])
			if name == "lo" {
				continue
			}
			fields := strings.Fields(parts[1])
			if len(fields) < 9 {
				continue
			}
			rx, _ := strconv.ParseUint(fields[0], 10, 64)
			tx, _ := strconv.ParseUint(fields[8], 10, 64)
			res[name] = []uint64{rx, tx}
		}
		return res
	}

	netLines1 := extractSection(lines1, "---NET1---", "---DISKIO1---")
	netLines2 := extractSection(lines2, "---NET2---", "---DISKIO2---")
	nets1 := parseNetDev2(netLines1)
	nets2 := parseNetDev2(netLines2)

	var netUpSpeed, netDownSpeed, netUpTotal, netDownTotal float64
	for ifName, v2 := range nets2 {
		v1, ok := nets1[ifName]
		if !ok {
			continue
		}
		netDownTotal += float64(v2[0]) / (1024.0 * 1024.0)
		netUpTotal += float64(v2[1]) / (1024.0 * 1024.0)
		rxSpeed := float64(v2[0]-v1[0]) / 1024.0 // KB/s over 1s
		txSpeed := float64(v2[1]-v1[1]) / 1024.0
		if rxSpeed > netDownSpeed {
			netDownSpeed = rxSpeed
		}
		if txSpeed > netUpSpeed {
			netUpSpeed = txSpeed
		}
	}

	// ── Parse Disk IO ─────────────────────────────────────────────────
	parseDiskIO := func(lines []string) map[string][]uint64 {
		res := make(map[string][]uint64)
		for _, l := range lines {
			fields := strings.Fields(l)
			if len(fields) < 10 {
				continue
			}
			name := fields[2]
			if strings.HasPrefix(name, "loop") || strings.HasPrefix(name, "ram") {
				continue
			}
			r, _ := strconv.ParseUint(fields[5], 10, 64)
			w, _ := strconv.ParseUint(fields[9], 10, 64)
			res[name] = []uint64{r, w}
		}
		return res
	}

	diskIO1 := parseDiskIO(extractSection(lines1, "---DISKIO1---", "---CPU2---"))
	diskIO2 := parseDiskIO(extractSection(lines2, "---DISKIO2---", "---PROC---"))

	var diskReadSpeed, diskWriteSpeed float64
	for dName, v2 := range diskIO2 {
		v1, ok := diskIO1[dName]
		if !ok {
			continue
		}
		rKB := float64(v2[0]-v1[0]) * 0.5 // 512-byte sectors → KB over 1s
		wKB := float64(v2[1]-v1[1]) * 0.5
		if rKB > diskReadSpeed {
			diskReadSpeed = rKB
		}
		if wKB > diskWriteSpeed {
			diskWriteSpeed = wKB
		}
	}

	// Convert partitions to []map for JSON
	var partMaps []map[string]interface{}
	for _, p := range partitions {
		partMaps = append(partMaps, map[string]interface{}{
			"mount":   p.Mount,
			"size":    p.Size,
			"avail":   p.Avail,
			"usedPct": p.UsedPct,
		})
	}

	// ── Parse Processes ───────────────────────────────────────────────
	procLines := extractSection(lines2, "---PROC---", "---DONE---")
	var processes []map[string]interface{}
	for _, l := range procLines {
		fields := strings.Fields(l)
		if len(fields) < 4 {
			continue
		}
		// skip header line
		if fields[0] == "PID" {
			continue
		}
		cpu, _ := strconv.ParseFloat(fields[1], 64)
		rss, _ := strconv.ParseUint(fields[2], 10, 64)
		processes = append(processes, map[string]interface{}{
			"pid":  fields[0],
			"cpu":  cpu,
			"mem":  float64(rss) / 1024.0, // MB
			"cmd":  fields[3],
		})
	}

	return map[string]interface{}{
		"os":       osName,
		"uptime":   uptimeStr,
		"timezone": tzStr,
		"hostname": hostname,
		"ip":       ipAddr,
		"cpu": map[string]interface{}{
			"usage": cpuTotalUsage,
			"cores": cpuCoreUsages,
		},
		"memory": map[string]interface{}{
			"total": memTotalMB,
			"used":  memUsedMB,
			"cache": memCacheMB,
			"free":  memFreeMB,
		},
		"disk": map[string]interface{}{
			"device":     diskDevice,
			"type":       "ext4",
			"total":      diskTotalGB,
			"used":       diskUsedGB,
			"usage":      diskPercent,
			"readSpeed":  diskReadSpeed,
			"writeSpeed": diskWriteSpeed,
			"partitions": partMaps,
		},
		"network": map[string]interface{}{
			"uploadSpeed":   netUpSpeed,
			"downloadSpeed": netDownSpeed,
			"uploadTotal":   netUpTotal,
			"downloadTotal": netDownTotal,
		},
		"processes": processes,
	}, nil
}


// SFTP Methods

func formatFileMode(mode os.FileMode) string {
	return mode.String()
}

func (m *SSHManager) ListDir(sessionId string, path string) ([]map[string]interface{}, error) {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("session not found")
	}

	files, err := s.SFTP.ReadDir(path)
	if err != nil {
		return nil, err
	}

	var results []map[string]interface{}
	for _, f := range files {
		results = append(results, map[string]interface{}{
			"name":        f.Name(),
			"isDirectory": f.IsDir(),
			"size":        f.Size(),
			"modifyTime":  f.ModTime().Format(time.RFC3339),
			"rights":      map[string]string{"user": formatFileMode(f.Mode())},
		})
	}
	return results, nil
}

func (m *SSHManager) ReadFile(sessionId string, path string) (string, error) {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if !ok {
		return "", fmt.Errorf("session not found")
	}

	f, err := s.SFTP.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	buf, err := io.ReadAll(f)
	if err != nil {
		return "", err
	}
	return string(buf), nil
}

func (m *SSHManager) WriteFile(sessionId string, path string, content string) error {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("session not found")
	}

	f, err := s.SFTP.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = f.Write([]byte(content))
	return err
}

func (m *SSHManager) DeleteItem(sessionId string, path string, isDir bool) error {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("session not found")
	}
	if isDir {
		// Use rm -rf for non-empty directories to simulate recursive delete
		_, err := m.executeCmd(s, fmt.Sprintf("rm -rf '%s'", strings.ReplaceAll(path, "'", "'\\''")))
		return err
	}
	return s.SFTP.Remove(path)
}

func (m *SSHManager) Mkdir(sessionId string, path string) error {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("session not found")
	}
	return s.SFTP.MkdirAll(path)
}

func (m *SSHManager) RenameItem(sessionId string, oldPath string, newPath string) error {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("session not found")
	}
	return s.SFTP.Rename(oldPath, newPath)
}

// progressReader wraps an io.Reader and emits progress events via Wails.
type progressReader struct {
	io.Reader
	ctx       context.Context
	sessionId string
	total     int64
	current   int64
	lastEmit  time.Time
}

func (p *progressReader) Read(data []byte) (int, error) {
	n, err := p.Reader.Read(data)
	if n > 0 {
		p.current += int64(n)
		now := time.Now()
		if now.Sub(p.lastEmit) > 200*time.Millisecond || p.current >= p.total {
			pct := float64(0)
			if p.total > 0 {
				pct = float64(p.current) / float64(p.total) * 100
				if pct > 100 { pct = 100 }
			}
			if p.ctx != nil {
				runtime.EventsEmit(p.ctx, "transfer-progress-"+p.sessionId, pct)
			}
			p.lastEmit = now
		}
	}
	return n, err
}

func (m *SSHManager) UploadFile(sessionId string, localPath string, remotePath string) error {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("session not found")
	}

	src, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer src.Close()

	destPath := filepath.ToSlash(filepath.Join(remotePath, filepath.Base(localPath)))
	dst, err := s.SFTP.Create(destPath)
	if err != nil {
		return err
	}
	defer dst.Close()

	var totalSize int64 = 0
	if stat, err := src.Stat(); err == nil {
		totalSize = stat.Size()
	}

	pr := &progressReader{
		Reader:    src,
		ctx:       m.ctx,
		sessionId: sessionId,
		total:     totalSize,
		lastEmit:  time.Now(),
	}

	buf := make([]byte, 2*1024*1024) // 2MB buffer
	_, err = io.CopyBuffer(dst, pr, buf)
	return err
}

func (m *SSHManager) DownloadFile(sessionId string, remotePath string, localPath string) error {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("session not found")
	}

	src, err := s.SFTP.Open(remotePath)
	if err != nil {
		return err
	}
	defer src.Close()

	dst, err := os.Create(localPath)
	if err != nil {
		return err
	}
	defer dst.Close()

	var totalSize int64 = 0
	if stat, err := src.Stat(); err == nil {
		totalSize = stat.Size()
	}

	pr := &progressReader{
		Reader:    src,
		ctx:       m.ctx,
		sessionId: sessionId,
		total:     totalSize,
		lastEmit:  time.Now(),
	}

	buf := make([]byte, 2*1024*1024) // 2MB buffer
	_, err = io.CopyBuffer(dst, pr, buf)
	return err
}

// ── Port Forwarding ─────────────────────────────────────────────────

type forwardEntry struct {
	LocalPort  int
	RemoteHost string
	RemotePort int
	listener   net.Listener
	cancel     chan struct{}
}

// StartPortForward creates a local TCP listener that tunnels to the remote via SSH.
// localPort=0 means pick a random free port.
func (m *SSHManager) StartPortForward(sessionId string, localPort int, remoteHost string, remotePort int) (int, error) {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if !ok {
		return 0, fmt.Errorf("session not found")
	}

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", localPort))
	if err != nil {
		return 0, fmt.Errorf("cannot listen on port %d: %v", localPort, err)
	}
	actualPort := listener.Addr().(*net.TCPAddr).Port

	entry := &forwardEntry{
		LocalPort:  actualPort,
		RemoteHost: remoteHost,
		RemotePort: remotePort,
		listener:   listener,
		cancel:     make(chan struct{}),
	}

	go func() {
		defer listener.Close()
		for {
			select {
			case <-entry.cancel:
				return
			default:
			}
			listener.(*net.TCPListener).SetDeadline(time.Now().Add(1 * time.Second))
			localConn, err := listener.Accept()
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					continue
				}
				return
			}
			go func() {
				defer localConn.Close()
				remoteConn, err := s.Client.Dial("tcp", fmt.Sprintf("%s:%d", remoteHost, remotePort))
				if err != nil {
					return
				}
				defer remoteConn.Close()
				go io.Copy(remoteConn, localConn)
				io.Copy(localConn, remoteConn)
			}()
		}
	}()

	m.mu.Lock()
	if m.portForwards == nil {
		m.portForwards = make(map[string][]*forwardEntry)
	}
	m.portForwards[sessionId] = append(m.portForwards[sessionId], entry)
	m.mu.Unlock()

	return actualPort, nil
}

func (m *SSHManager) StopPortForward(sessionId string, localPort int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	entries := m.portForwards[sessionId]
	for i, e := range entries {
		if e.LocalPort == localPort {
			close(e.cancel)
			e.listener.Close()
			m.portForwards[sessionId] = append(entries[:i], entries[i+1:]...)
			return nil
		}
	}
	return fmt.Errorf("forward not found on port %d", localPort)
}

func (m *SSHManager) ListPortForwards(sessionId string) []map[string]interface{} {
	m.mu.Lock()
	defer m.mu.Unlock()
	var result []map[string]interface{}
	for _, e := range m.portForwards[sessionId] {
		result = append(result, map[string]interface{}{
			"localPort":  e.LocalPort,
			"remoteHost": e.RemoteHost,
			"remotePort": e.RemotePort,
		})
	}
	return result
}

func (m *SSHManager) CompressItem(sessionId string, remotePath string) error {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("session not found")
	}

	dir := filepath.Dir(remotePath)
	base := filepath.Base(remotePath)
	archiveName := base + ".tar.gz"

	dir = strings.ReplaceAll(dir, "\\", "/")
	cmd := fmt.Sprintf("cd '%s' && tar -czf '%s' '%s'", dir, archiveName, base)
	
	out, err := m.executeCmd(s, cmd)
	if err != nil {
		return fmt.Errorf("compress failed: %v, output: %s", err, out)
	}
	return nil
}

func (m *SSHManager) UncompressItem(sessionId string, remotePath string) error {
	m.mu.Lock()
	s, ok := m.sessions[sessionId]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("session not found")
	}

	dir := filepath.Dir(remotePath)
	base := filepath.Base(remotePath)
	dir = strings.ReplaceAll(dir, "\\", "/")
	
	var cmd string
	lowerBase := strings.ToLower(base)
	if strings.HasSuffix(lowerBase, ".zip") {
		cmd = fmt.Sprintf("cd '%s' && unzip -o '%s'", dir, base)
	} else if strings.HasSuffix(lowerBase, ".tar.gz") || strings.HasSuffix(lowerBase, ".tgz") {
		cmd = fmt.Sprintf("cd '%s' && tar -xzf '%s'", dir, base)
	} else if strings.HasSuffix(lowerBase, ".tar") {
		cmd = fmt.Sprintf("cd '%s' && tar -xf '%s'", dir, base)
	} else if strings.HasSuffix(lowerBase, ".tar.bz2") || strings.HasSuffix(lowerBase, ".tbz2") {
		cmd = fmt.Sprintf("cd '%s' && tar -xjf '%s'", dir, base)
	} else if strings.HasSuffix(lowerBase, ".gz") {
		cmd = fmt.Sprintf("cd '%s' && gunzip -f -k '%s'", dir, base)
	} else {
		return fmt.Errorf("unsupported archive format")
	}

	out, err := m.executeCmd(s, cmd)
	if err != nil {
		return fmt.Errorf("uncompress failed: %v, output: %s", err, out)
	}
	return nil
}
