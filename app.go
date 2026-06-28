package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/gorilla/websocket"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx           context.Context
	sshManager    *SSHManager
	configManager *ConfigManager
	wsPort        int
	wsMu          sync.Mutex
	wsConns       map[string]*websocket.Conn // sessionId -> active WebSocket
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		sshManager:    NewSSHManager(),
		configManager: NewConfigManager(),
		wsConns:       make(map[string]*websocket.Conn),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.sshManager.ctx = ctx // Give SSH manager access to Wails events
	a.sshManager.app = a  // Give SSH manager access to WebSocket registry

	// ── 启动本地 WebSocket 终端服务器 ─────────────────────────────────
	// 不经过 Wails IPC，直接走 TCP loopback，延迟极低
	mux := http.NewServeMux()
	// 允许任何来源（WebView2 内部请求可能没有 Origin 头）
	upgrader := websocket.Upgrader{
		CheckOrigin:     func(r *http.Request) bool { return true },
		ReadBufferSize:  4096,
		WriteBufferSize: 32768,
	}
	mux.HandleFunc("/ws/", func(w http.ResponseWriter, r *http.Request) {
		sessionId := strings.TrimPrefix(r.URL.Path, "/ws/")
		if sessionId == "" {
			http.Error(w, "missing sessionId", http.StatusBadRequest)
			return
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		// 注册当前 WebSocket 连接
		a.wsMu.Lock()
		a.wsConns[sessionId] = conn
		a.wsMu.Unlock()
		defer func() {
			a.wsMu.Lock()
			delete(a.wsConns, sessionId)
			a.wsMu.Unlock()
		}()

		// 读取 WebSocket 消息，直通 SSH stdin
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				break
			}
			a.sshManager.WriteBytes(sessionId, msg)
		}
	})

	// 监听随机端口
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err == nil {
		a.wsPort = listener.Addr().(*net.TCPAddr).Port
		go func() {
			_ = http.Serve(listener, mux)
		}()
	}

	// Clean up old executable from a previous auto-update
	exePath, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(exePath)
		files, err := os.ReadDir(dir)
		if err == nil {
			for _, file := range files {
				if !file.IsDir() && strings.HasSuffix(file.Name(), ".old") {
					os.Remove(filepath.Join(dir, file.Name()))
				}
			}
		}
	}
}

// GetWsPort 返回本地 WebSocket 服务器端口，前端用于连接终端
func (a *App) GetWsPort() int {
	return a.wsPort
}

// WriteWsToSession 将 WebSocket 输出写入给指定 session 的 WS 连接
func (a *App) WriteWsOutput(sessionId string, data []byte) {
	a.wsMu.Lock()
	conn, ok := a.wsConns[sessionId]
	a.wsMu.Unlock()
	if ok {
		_ = conn.WriteMessage(websocket.BinaryMessage, data)
	}
}

// IsPortableVersion checks if the current executable is the portable version
func (a *App) IsPortableVersion() bool {
	exePath, err := os.Executable()
	if err != nil {
		return false
	}
	exeName := strings.ToLower(filepath.Base(exePath))
	return strings.Contains(exeName, "portable")
}

// GetConnections returns all saved SSH connections
func (a *App) GetConnections() []Connection {
	return a.configManager.GetConnections()
}

// SaveConnection saves a new or existing connection
func (a *App) SaveConnection(conn Connection) Connection {
	return a.configManager.SaveConnection(conn)
}

// DeleteConnection removes a connection by ID
func (a *App) DeleteConnection(id string) bool {
	return a.configManager.DeleteConnection(id)
}

// ConnectSSH establishes an SSH connection
func (a *App) ConnectSSH(sessionId string, connId string) error {
	conn := a.configManager.GetConnectionByID(connId)
	if conn == nil {
		return fmt.Errorf("connection not found")
	}
	return a.sshManager.Connect(sessionId, *conn)
}

// DisconnectSSH closes an SSH connection
func (a *App) DisconnectSSH(sessionId string) {
	a.sshManager.Disconnect(sessionId)
}

// WriteTerminal sends input to the SSH PTY (fallback, primary path is WebSocket)
func (a *App) WriteTerminal(sessionId string, data string) {
	a.sshManager.WriteBytes(sessionId, []byte(data))
}

// ResizeTerminal resizes the SSH PTY
func (a *App) ResizeTerminal(sessionId string, cols, rows int) {
	a.sshManager.Resize(sessionId, cols, rows)
}

// SystemInfo retrieves basic system probe info
func (a *App) SystemInfo(sessionId string) (map[string]interface{}, error) {
	return a.sshManager.GetSystemInfo(sessionId)
}

// GetTerminalCwd retrieves current working directory of the shell
func (a *App) GetTerminalCwd(sessionId string) (string, error) {
	return a.sshManager.GetTerminalCwd(sessionId)
}

// ListDir lists directory contents via SFTP
func (a *App) ListDir(sessionId string, path string) ([]map[string]interface{}, error) {
	return a.sshManager.ListDir(sessionId, path)
}

// ReadFile reads a file's content via SFTP
func (a *App) ReadFile(sessionId string, path string) (string, error) {
	return a.sshManager.ReadFile(sessionId, path)
}

// WriteFileBytes writes raw bytes to a file via SFTP (drag-drop uploads)
func (a *App) WriteFileBytes(sessionId string, path string, dataBase64 string) error {
	return a.sshManager.WriteFileBytes(sessionId, path, dataBase64)
}

// EditWithLocalEditor downloads remote file to temp, opens in system editor, auto-syncs changes back
func (a *App) EditWithLocalEditor(sessionId string, remotePath string) (string, error) {
	localPath, err := a.sshManager.EditWithLocalEditor(sessionId, remotePath)
	if err != nil {
		return "", err
	}
	exec.Command("rundll32", "url.dll,FileProtocolHandler", localPath).Start()
	return localPath, nil
}

// WriteFile writes content to a file via SFTP
func (a *App) WriteFile(sessionId string, path string, content string) error {
	return a.sshManager.WriteFile(sessionId, path, content)
}

// DeleteItem deletes a file or directory via SFTP
func (a *App) DeleteItem(sessionId string, path string, isDir bool) error {
	return a.sshManager.DeleteItem(sessionId, path, isDir)
}

// Mkdir creates a directory via SFTP
func (a *App) Mkdir(sessionId string, path string) error {
	return a.sshManager.Mkdir(sessionId, path)
}

// RenameItem renames a file or directory via SFTP
func (a *App) RenameItem(sessionId string, oldPath string, newPath string) error {
	return a.sshManager.RenameItem(sessionId, oldPath, newPath)
}

// CompressItem archives a file or directory on the remote server
func (a *App) CompressItem(sessionId string, remotePath string) error {
	return a.sshManager.CompressItem(sessionId, remotePath)
}

// UncompressItem extracts an archive on the remote server
func (a *App) UncompressItem(sessionId string, remotePath string) error {
	return a.sshManager.UncompressItem(sessionId, remotePath)
}

// UploadFileFromPath uploads a specific local file to the remote dir, no dialog
func (a *App) UploadFileFromPath(sessionId string, localPath string, remoteDir string) error {
	return a.sshManager.UploadFile(sessionId, localPath, remoteDir)
}

// TODO: File upload/download using standard file dialogs in Wails
func (a *App) UploadFile(sessionId string, remotePath string) error {
	filepaths, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select File to Upload",
	})
	if err != nil || filepaths == "" {
		return err
	}
	return a.sshManager.UploadFile(sessionId, filepaths, remotePath)
}

func (a *App) DownloadFile(sessionId string, remotePath string) error {
	filename := filepath.Base(remotePath)
	destPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save File",
		DefaultFilename: filename,
	})
	if err != nil || destPath == "" {
		return err
	}
	return a.sshManager.DownloadFile(sessionId, remotePath, destPath)
}

// ReadPrivateKeyFile opens a file dialog to read a private key file
func (a *App) ReadPrivateKeyFile() (string, error) {
	filepath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择私钥文件",
	})
	if err != nil || filepath == "" {
		return "", err
	}
	content, err := os.ReadFile(filepath)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// ── Port Forwarding ──────────────────────────────────────────────

func (a *App) StartPortForward(sessionId string, localPort int, remoteHost string, remotePort int) (int, error) {
	return a.sshManager.StartPortForward(sessionId, localPort, remoteHost, remotePort)
}

func (a *App) StopPortForward(sessionId string, localPort int) error {
	return a.sshManager.StopPortForward(sessionId, localPort)
}

func (a *App) ListPortForwards(sessionId string) []map[string]interface{} {
	return a.sshManager.ListPortForwards(sessionId)
}

// WebDAV Methods
func (a *App) GetWebdavConfig() map[string]string {
	return a.configManager.GetWebdavConfig()
}

func (a *App) SaveWebdavConfig(config map[string]string) error {
	return a.configManager.SaveWebdavConfig(config)
}

func (a *App) TestWebdavConnection(url, username, password string) error {
	return a.configManager.TestWebdavConnection(url, username, password)
}

func (a *App) BackupToWebdav() (map[string]interface{}, error) {
	return a.configManager.BackupToWebdav()
}

func (a *App) ListWebdavBackups() ([]map[string]interface{}, error) {
	return a.configManager.ListWebdavBackups()
}

func (a *App) RestoreFromWebdavFile(filename string) (map[string]interface{}, error) {
	return a.configManager.RestoreFromWebdavFile(filename)
}

// PingServer pings a server
func (a *App) PingServer(host string, port int) map[string]interface{} {
	return PingServer(host, port)
}

// downloadProgressReader wraps an io.Reader to track download progress and emit Wails events
type downloadProgressReader struct {
	io.Reader
	ctx         context.Context
	total       int64
	downloaded  int64
	lastEmit    time.Time
}

func (pr *downloadProgressReader) Read(p []byte) (int, error) {
	n, err := pr.Reader.Read(p)
	pr.downloaded += int64(n)
	now := time.Now()
	if now.Sub(pr.lastEmit) >= 200*time.Millisecond || err != nil {
		progress := 0
		if pr.total > 0 {
			progress = int(float64(pr.downloaded) / float64(pr.total) * 100)
		}
		runtime.EventsEmit(pr.ctx, "app-update-progress", progress)
		pr.lastEmit = now
	}
	return n, err
}

// detectProxy returns a proxy function that checks Windows system proxy settings
func (a *App) UpdateApp(downloadUrl string, filename string) error {
	resp, err := http.Get(downloadUrl)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	isSetup := strings.Contains(strings.ToLower(filename), "installer") || strings.Contains(strings.ToLower(filename), "setup")
	var targetPath string

	if isSetup {
		targetPath = filepath.Join(os.TempDir(), filename)
	} else {
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		targetPath = exe + ".update"
	}

	out, err := os.Create(targetPath)
	if err != nil {
		return err
	}

	pr := &downloadProgressReader{Reader: resp.Body, ctx: a.ctx, total: resp.ContentLength}
	_, err = io.Copy(out, pr)
	out.Close()
	if err != nil {
		os.Remove(targetPath)
		return err
	}

	if isSetup {
		// 使用 Windows ShellExecute API 启动安装程序，不经过 cmd.exe
		shellExecute := syscall.NewLazyDLL("shell32.dll").NewProc("ShellExecuteW")
		shellExecute.Call(
			0,                          // hwnd
			uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr("open"))),
			uintptr(unsafe.Pointer(syscall.StringToUTF16Ptr(targetPath))),
			0, 0,                       // params, dir
			5,                          // SW_SHOW = 5
		)
		os.Exit(0)
		return nil
	}

	exePath, _ := os.Executable()
	bat := fmt.Sprintf("@echo off\r\nchcp 65001 >nul\r\ntimeout /t 2 /nobreak >nul\r\n:retry\r\ndel \"%s\" 2>nul\r\nif exist \"%s\" (timeout /t 1 /nobreak >nul & goto retry)\r\nmove \"%s\" \"%s\"\r\nstart \"\" \"%s\"\r\ndel \"%%~f0\" & exit", exePath, exePath, targetPath, exePath, exePath)
	tmpBat := filepath.Join(os.TempDir(), "aether_update.bat")
	os.WriteFile(tmpBat, []byte(bat), 0644)
	cmd := exec.Command("cmd.exe", "/C", tmpBat)
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	cmd.Start()
	os.Exit(0)
	return nil
}
