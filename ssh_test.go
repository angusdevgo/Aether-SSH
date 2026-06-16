package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRemoveHostKey_EmptyFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "known_hosts")
	os.WriteFile(path, []byte(""), 0600)

	removeHostKey(path, "example.com")

	data, _ := os.ReadFile(path)
	if strings.TrimSpace(string(data)) != "" {
		t.Fatalf("expected empty/whitespace-only file, got %q", string(data))
	}
}

func TestRemoveHostKey_HostnameNotFound(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "known_hosts")
	os.WriteFile(path, []byte("other.com ssh-rsa AAAAB3...\n"), 0600)

	removeHostKey(path, "example.com")

	data, _ := os.ReadFile(path)
	if !strings.Contains(string(data), "other.com") {
		t.Fatalf("unrelated host entry was removed: %q", string(data))
	}
}

func TestRemoveHostKey_RemovesMatchingHost(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "known_hosts")
	os.WriteFile(path, []byte("example.com ssh-ed25519 AAAAC3...\nother.com ssh-rsa AAAAB3...\n"), 0600)

	removeHostKey(path, "example.com")

	data, _ := os.ReadFile(path)
	if strings.Contains(string(data), "example.com") {
		t.Fatalf("host entry was not removed: %q", string(data))
	}
	if !strings.Contains(string(data), "other.com") {
		t.Fatalf("unrelated host entry was removed: %q", string(data))
	}
}

func TestRemoveHostKey_RemovesMultipleMatches(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "known_hosts")
	os.WriteFile(path, []byte("example.com ssh-ed25519 AAAAC3...\nexample.com,1.2.3.4 ssh-rsa AAAAB3...\nother.com ssh-rsa CCC...\n"), 0600)

	removeHostKey(path, "example.com")

	data, _ := os.ReadFile(path)
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	for _, line := range lines {
		if strings.Contains(line, "example.com") {
			t.Fatalf("host entry still present: %q", line)
		}
	}
	if !strings.Contains(string(data), "other.com") {
		t.Fatalf("unrelated host entry was removed")
	}
}

func TestRemoveHostKey_PreservesComments(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "known_hosts")
	os.WriteFile(path, []byte("# This is a comment\nexample.com ssh-rsa AAA...\n# Another comment\n"), 0600)

	removeHostKey(path, "example.com")

	data, _ := os.ReadFile(path)
	if !strings.Contains(string(data), "# This is a comment") {
		t.Fatalf("comment was removed")
	}
	if !strings.Contains(string(data), "# Another comment") {
		t.Fatalf("comment was removed")
	}
	if strings.Contains(string(data), "example.com") {
		t.Fatalf("host entry was not removed")
	}
}

func TestRemoveHostKey_HostnameWithPort(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "known_hosts")
	os.WriteFile(path, []byte("[example.com]:2222 ssh-ed25519 AAAAC3...\nexample.com ssh-rsa AAAAB3...\n"), 0600)

	// Should only remove exact hostname matches (not bracket-port variant)
	removeHostKey(path, "example.com")

	data, _ := os.ReadFile(path)
	if strings.Contains(string(data), "example.com") && !strings.Contains(string(data), "[example.com]") {
		t.Fatalf("unexpected removal result: %q", string(data))
	}
}
