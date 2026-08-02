package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

const testWsToken = "0123456789abcdef0123456789abcdef" // 32 字节 hex，测试用固定值

// newTestApp 构造一个用于鉴权测试的最小 App 实例
func newTestApp() *App {
	return &App{
		sshManager: NewSSHManager(),
		wsToken:    testWsToken,
		wsConns:    make(map[string]*websocket.Conn),
	}
}

func TestCheckWsToken(t *testing.T) {
	app := newTestApp()

	cases := []struct {
		name  string
		token string
		want  bool
	}{
		{"正确 token", testWsToken, true},
		{"错误 token", "ffffffffffffffffffffffffffffffff", false},
		{"空 token", "", false},
		{"长度不同的 token", testWsToken[:16], false},
		{"前缀相同的错误 token", "0123456789abcdef0000000000000000", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := app.checkWsToken(tc.token); got != tc.want {
				t.Fatalf("checkWsToken(%q) = %v, want %v", tc.token, got, tc.want)
			}
		})
	}

	// wsToken 为空时一律拒绝
	emptyApp := &App{wsConns: make(map[string]*websocket.Conn)}
	if emptyApp.checkWsToken(testWsToken) {
		t.Fatal("expected checkWsToken to reject when wsToken is empty")
	}
}

// wsTestServer 启动一个带鉴权 WS handler 的 httptest 服务器
func wsTestServer(t *testing.T, app *App) (*httptest.Server, string) {
	t.Helper()
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/ws/", app.handleWS(upgrader))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	wsBase := "ws" + strings.TrimPrefix(srv.URL, "http")
	return srv, wsBase
}

func TestWSHandlerRejectsMissingToken(t *testing.T) {
	app := newTestApp()
	_, wsBase := wsTestServer(t, app)

	_, resp, err := websocket.DefaultDialer.Dial(wsBase+"/ws/session_test", nil)
	if err == nil {
		t.Fatal("expected dial to fail without token")
	}
	if resp == nil || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %v", resp)
	}
}

func TestWSHandlerRejectsWrongToken(t *testing.T) {
	app := newTestApp()
	_, wsBase := wsTestServer(t, app)

	_, resp, err := websocket.DefaultDialer.Dial(wsBase+"/ws/session_test?token=deadbeefdeadbeefdeadbeefdeadbeef", nil)
	if err == nil {
		t.Fatal("expected dial to fail with wrong token")
	}
	if resp == nil || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %v", resp)
	}
}

func TestWSHandlerAcceptsValidToken(t *testing.T) {
	app := newTestApp()
	_, wsBase := wsTestServer(t, app)

	conn, resp, err := websocket.DefaultDialer.Dial(wsBase+"/ws/session_test?token="+testWsToken, nil)
	if err != nil {
		t.Fatalf("expected dial to succeed with valid token: %v", err)
	}
	defer conn.Close()
	if resp == nil || resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("expected 101 Switching Protocols, got %v", resp)
	}
}
