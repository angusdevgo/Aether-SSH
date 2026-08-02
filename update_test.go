package main

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
)

func TestIsSafeUpdateFilename(t *testing.T) {
	valid := []string{
		"Aether-Setup-1.1.7.exe",
		"Aether_portable_v2.exe",
	}
	for _, name := range valid {
		if !isSafeUpdateFilename(name) {
			t.Errorf("expected %q to be a valid update filename", name)
		}
	}

	invalid := []string{
		"",                     // 空
		"..\\evil.exe",         // 路径穿越
		"evil;calc.exe",        // 命令注入
		"a/b.exe",              // 路径分隔符
		"C:\\Windows\\a.exe",   // 绝对路径
		"evil$PATH.exe",        // shell 特殊字符
		"`rm -rf`.exe",         // 反引号
		"a&calc.exe",           // & 注入
		"update (1).exe",       // 含空格/括号：白名单外，拒绝
	}
	for _, name := range invalid {
		if isSafeUpdateFilename(name) {
			t.Errorf("expected %q to be rejected", name)
		}
	}
}

func TestVerifySha256Hex(t *testing.T) {
	// 构造一份已知内容的哈希
	data := []byte("aether update payload")
	sum := sha256.Sum256(data)
	expected := hex.EncodeToString(sum[:])

	// 一致 → 通过
	if err := verifySha256Hex(expected, expected); err != nil {
		t.Fatalf("expected matching checksum to pass: %v", err)
	}

	// 大小写不敏感
	if err := verifySha256Hex(expected, strings.ToUpper(expected)); err != nil {
		t.Fatalf("expected case-insensitive match to pass: %v", err)
	}

	// 不一致 → 报错
	wrong := strings.Repeat("0", len(expected))
	if err := verifySha256Hex(wrong, expected); err == nil {
		t.Fatal("expected checksum mismatch to fail")
	}

	// 缺失预期哈希 → 拒绝
	if err := verifySha256Hex(expected, ""); err == nil {
		t.Fatal("expected missing expected checksum to be refused")
	}
}
