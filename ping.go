package main

import (
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"
)

// isLocalOrPrivateIP checks if the host string points to a local loopback or private subnet
func isLocalOrPrivateIP(host string) bool {
	h := strings.ToLower(strings.TrimSpace(host))
	if h == "127.0.0.1" || h == "localhost" || h == "::1" || h == "0.0.0.0" || h == "[::]" {
		return true
	}
	if strings.HasPrefix(h, "192.168.") || strings.HasPrefix(h, "10.") {
		return true
	}
	for i := 16; i <= 31; i++ {
		prefix := fmt.Sprintf("172.%d.", i)
		if strings.HasPrefix(h, prefix) {
			return true
		}
	}
	return false
}

// measureLatency measures the one-way RTT to the SSH server.
//
// Strategy:
//  1. Record time before Dial (start).
//  2. Wait for Dial to return (connectedAt).
//  3. Wait for the SSH banner to arrive (bannerAt).
//
// With a direct connection: dialMs ≈ real RTT (TCP handshake = 1 RTT).
// With a TUN-mode proxy:   dialMs ≈ 0ms (local TUN accepts immediately),
//
//	bannerMs (connectedAt→bannerAt) ≈ real RTT (proxy→server→back).
//
// In both cases we pick whichever sub-interval best represents the true RTT.
func measureLatency(host string, port int) (int64, bool) {
	// 使用 net.JoinHostPort 兼容 IPv6（[::1]:22 形式），同时兼容 IPv4
	target := net.JoinHostPort(host, strconv.Itoa(port))

	start := time.Now()
	// 快速失败：不可达服务器（防火墙 drop/宕机）在 1.5s 内返回，
	// 避免每次 ping 挂起数秒并持续堆积 TCP 连接尝试，污染本地网络栈
	conn, err := net.DialTimeout("tcp", target, 1500*time.Millisecond)
	if err != nil {
		return 0, false
	}
	connectedAt := time.Now()
	dialMs := connectedAt.Sub(start).Milliseconds()
	defer conn.Close()

	// Try to read the SSH banner — the server sends it immediately after TCP connect.
	conn.SetDeadline(time.Now().Add(1500 * time.Millisecond))
	buf := make([]byte, 64)
	n, err := conn.Read(buf)
	bannerMs := time.Since(connectedAt).Milliseconds()

	// If dial was instant (< 5 ms) and we're talking to a non-private host,
	// a TUN/proxy intercepted the dial locally.
	// In that case bannerMs = proxy→server round-trip ≈ real network RTT.
	isTUN := dialMs < 5 && !isLocalOrPrivateIP(host)

	if err != nil || n == 0 {
		// Could not read banner (firewall drops it, non-SSH port, etc.)
		if isTUN {
			// TUN mode but no banner — fall back to banner wait time as proxy RTT estimate
			return bannerMs, true
		}
		return dialMs, true
	}

	if isTUN {
		// TUN mode: use the time from connection to banner arrival (1 real RTT)
		return bannerMs, true
	}
	// Direct mode: dial already took 1 RTT; total = dial + a few ms for banner
	return dialMs, true
}

// PingServer returns the latency to the SSH port.
func PingServer(host string, port int) map[string]interface{} {
	// 降为 1 个采样：延迟展示无需双采样精确值，
	// 单次即可显著减少不可达服务器（快速失败）的资源占用
	const samples = 1
	var best int64 = -1
	var anyOnline bool

	for i := 0; i < samples; i++ {
		rtt, online := measureLatency(host, port)
		if !online {
			continue
		}
		anyOnline = true
		if best < 0 || rtt < best {
			best = rtt
		}
	}

	if !anyOnline {
		return map[string]interface{}{
			"online":  false,
			"latency": 0,
		}
	}

	return map[string]interface{}{
		"online":  true,
		"latency": best,
	}
}
