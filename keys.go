package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

// SSH 密钥库（凭据页）：私钥经既有 AES-256-GCM 体系（aether.key）加密后落盘，
// 元数据（算法/公钥/指纹）明文存储用于列表展示。目录 %APPDATA%/Aether/config/keys。

type storedSSHKey struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Algorithm   string `json:"algorithm"`
	PublicKey   string `json:"publicKey"`   // authorized_keys 单行格式
	Fingerprint string `json:"fingerprint"` // SHA256:...
	PrivateKey  string `json:"privateKey"`  // AES-GCM hex（ConfigManager.encrypt）
	CreatedAt   string `json:"createdAt"`
}

func (c *ConfigManager) keysDir() string {
	dir := filepath.Join(c.configDir, "keys")
	os.MkdirAll(dir, 0700)
	return dir
}

func (c *ConfigManager) ListSSHKeys() []map[string]interface{} {
	entries, err := os.ReadDir(c.keysDir())
	if err != nil {
		return []map[string]interface{}{}
	}
	var result []map[string]interface{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(c.keysDir(), e.Name()))
		if err != nil {
			continue
		}
		var k storedSSHKey
		if json.Unmarshal(data, &k) != nil || k.ID == "" {
			continue
		}
		result = append(result, map[string]interface{}{
			"id":          k.ID,
			"name":        k.Name,
			"algorithm":   k.Algorithm,
			"publicKey":   k.PublicKey,
			"fingerprint": k.Fingerprint,
			"createdAt":   k.CreatedAt,
		})
	}
	sort.Slice(result, func(i, j int) bool {
		return fmt.Sprint(result[i]["createdAt"]) > fmt.Sprint(result[j]["createdAt"])
	})
	return result
}

// GenerateSSHKey 生成 ed25519 密钥对并加密保存，返回新密钥的元数据
func (c *ConfigManager) GenerateSSHKey(name string) (map[string]interface{}, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("密钥名称不能为空")
	}
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	sshPub, err := ssh.NewPublicKey(pub)
	if err != nil {
		return nil, err
	}
	block, err := ssh.MarshalPrivateKey(priv, name)
	if err != nil {
		return nil, err
	}
	privPEMText := string(pem.EncodeToMemory(block))
	return c.persistSSHKey(name, "ED25519 (ssh-ed25519)",
		strings.TrimSpace(string(ssh.MarshalAuthorizedKey(sshPub))),
		ssh.FingerprintSHA256(sshPub), privPEMText)
}

// ImportSSHKey 导入 PEM 私钥（支持 RSA/ECDSA/Ed25519），校验并加密保存
func (c *ConfigManager) ImportSSHKey(name string, privateKeyPEM string, passphrase string) (map[string]interface{}, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("密钥名称不能为空")
	}
	privateKeyPEM = strings.TrimSpace(privateKeyPEM)
	if privateKeyPEM == "" {
		return nil, fmt.Errorf("私钥内容不能为空")
	}

	var signer ssh.Signer
	var err error
	if passphrase != "" {
		signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(privateKeyPEM), []byte(passphrase))
	} else {
		signer, err = ssh.ParsePrivateKey([]byte(privateKeyPEM))
	}
	if err != nil {
		return nil, fmt.Errorf("无法解析私钥（请检查内容与密码短语）: %v", err)
	}

	sshPub := signer.PublicKey()
	algo := strings.ToUpper(strings.SplitN(sshPub.Type(), "-", 2)[0])
	return c.persistSSHKey(name, sshPub.Type()+" ("+algo+")",
		strings.TrimSpace(string(ssh.MarshalAuthorizedKey(sshPub))),
		ssh.FingerprintSHA256(sshPub), privateKeyPEM)
}

func (c *ConfigManager) persistSSHKey(name, algorithm, publicKey, fingerprint, privateKeyPEM string) (map[string]interface{}, error) {
	key := storedSSHKey{
		ID:          fmt.Sprintf("key_%d", time.Now().UnixNano()),
		Name:        name,
		Algorithm:   algorithm,
		PublicKey:   publicKey,
		Fingerprint: fingerprint,
		PrivateKey:  c.encrypt(privateKeyPEM),
		CreatedAt:   time.Now().Format("2006-01-02 15:04:05"),
	}
	data, err := json.MarshalIndent(key, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(c.keysDir(), key.ID+".json"), data, 0600); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"id":          key.ID,
		"name":        key.Name,
		"algorithm":   key.Algorithm,
		"publicKey":   key.PublicKey,
		"fingerprint": key.Fingerprint,
		"createdAt":   key.CreatedAt,
	}, nil
}

func (c *ConfigManager) DeleteSSHKey(id string) bool {
	if id == "" || strings.ContainsAny(id, `/\.`) {
		return false
	}
	err := os.Remove(filepath.Join(c.keysDir(), id+".json"))
	return err == nil
}
