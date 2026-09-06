package main

import (
	"crypto/rand"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// newTestConfigManager 构造指向临时目录的 ConfigManager（绕过用户配置目录）
func newTestConfigManager(t *testing.T) *ConfigManager {
	t.Helper()
	dir := t.TempDir()
	c := &ConfigManager{
		configDir: dir,
		connFile:  filepath.Join(dir, "connections.json"),
		davFile:   filepath.Join(dir, "webdav.json"),
		key:       make([]byte, 32),
	}
	if _, err := rand.Read(c.key); err != nil {
		t.Fatal(err)
	}
	return c
}

func TestSSHKeyGenerateListDelete(t *testing.T) {
	c := newTestConfigManager(t)

	created, err := c.GenerateSSHKey("test-key")
	if err != nil {
		t.Fatalf("GenerateSSHKey: %v", err)
	}
	if created["name"] != "test-key" {
		t.Fatalf("unexpected name: %v", created["name"])
	}
	fp, _ := created["fingerprint"].(string)
	if !strings.HasPrefix(fp, "SHA256:") {
		t.Fatalf("fingerprint should start with SHA256:, got %q", fp)
	}

	keys := c.ListSSHKeys()
	if len(keys) != 1 {
		t.Fatalf("expected 1 key after generate, got %d", len(keys))
	}

	// 私钥不得出现在列表接口返回中
	if _, leaked := keys[0]["privateKey"]; leaked {
		t.Fatal("ListSSHKeys must not expose private key material")
	}

	if !c.DeleteSSHKey(created["id"].(string)) {
		t.Fatal("DeleteSSHKey returned false")
	}
	if keys := c.ListSSHKeys(); len(keys) != 0 {
		t.Fatalf("expected 0 keys after delete, got %d", len(keys))
	}
	if c.DeleteSSHKey("../escape") {
		t.Fatal("path traversal id must be rejected")
	}
}

func TestSSHKeyImportRoundtrip(t *testing.T) {
	c := newTestConfigManager(t)

	// 生成一把密钥 → 读回落盘文件 → 解密私钥 → 再走导入流程，验证解析与加密存储闭环
	created, err := c.GenerateSSHKey("roundtrip")
	if err != nil {
		t.Fatalf("GenerateSSHKey: %v", err)
	}

	raw, err := os.ReadFile(filepath.Join(c.keysDir(), created["id"].(string)+".json"))
	if err != nil {
		t.Fatalf("read stored key: %v", err)
	}
	var stored storedSSHKey
	if err := json.Unmarshal(raw, &stored); err != nil {
		t.Fatalf("unmarshal stored key: %v", err)
	}
	pemText := c.decrypt(stored.PrivateKey)
	if stored.PrivateKey == "" || stored.PrivateKey == pemText {
		t.Fatal("stored private key must be non-empty encrypted text")
	}
	if !strings.HasPrefix(pemText, "-----BEGIN OPENSSH PRIVATE KEY-----") {
		t.Fatalf("decrypted private key should be OpenSSH PEM, got: %.40s", pemText)
	}

	imported, err := c.ImportSSHKey("imported-copy", pemText, "")
	if err != nil {
		t.Fatalf("ImportSSHKey: %v", err)
	}
	if imported["fingerprint"] != created["fingerprint"] {
		t.Fatalf("fingerprint mismatch after import: %v vs %v", imported["fingerprint"], created["fingerprint"])
	}
	if keys := c.ListSSHKeys(); len(keys) != 2 {
		t.Fatalf("expected 2 keys, got %d", len(keys))
	}

	// 导入无效 PEM 必须报错
	if _, err := c.ImportSSHKey("bad", "not a pem", ""); err == nil {
		t.Fatal("expected error importing invalid PEM")
	}
}
