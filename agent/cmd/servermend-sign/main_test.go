package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestKeygenSignVerifyRoundTrip(t *testing.T) {
	dir := t.TempDir()
	keyName := filepath.Join(dir, "testkey")

	if err := keygen([]string{keyName}); err != nil {
		t.Fatalf("keygen: %v", err)
	}

	filePath := filepath.Join(dir, "payload.bin")
	if err := os.WriteFile(filePath, []byte("release binary contents go here"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := sign([]string{keyName + ".key", filePath}); err != nil {
		t.Fatalf("sign: %v", err)
	}
	sigPath := filePath + ".sig"
	if _, err := os.Stat(sigPath); err != nil {
		t.Fatalf("expected %s to exist: %v", sigPath, err)
	}

	if err := verify([]string{keyName + ".pub", filePath, sigPath}); err != nil {
		t.Fatalf("verify of a genuinely untampered file/signature failed: %v", err)
	}
}

func TestVerifyRejectsTamperedFile(t *testing.T) {
	dir := t.TempDir()
	keyName := filepath.Join(dir, "testkey")
	if err := keygen([]string{keyName}); err != nil {
		t.Fatal(err)
	}

	filePath := filepath.Join(dir, "payload.bin")
	if err := os.WriteFile(filePath, []byte("original content"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := sign([]string{keyName + ".key", filePath}); err != nil {
		t.Fatal(err)
	}

	// Tamper with the file after signing.
	if err := os.WriteFile(filePath, []byte("original content, but modified"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := verify([]string{keyName + ".pub", filePath, filePath + ".sig"}); err == nil {
		t.Fatal("verify succeeded against a tampered file, want an error")
	}
}

func TestVerifyRejectsWrongPublicKey(t *testing.T) {
	dir := t.TempDir()
	keyA := filepath.Join(dir, "keyA")
	keyB := filepath.Join(dir, "keyB")
	if err := keygen([]string{keyA}); err != nil {
		t.Fatal(err)
	}
	if err := keygen([]string{keyB}); err != nil {
		t.Fatal(err)
	}

	filePath := filepath.Join(dir, "payload.bin")
	if err := os.WriteFile(filePath, []byte("content"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := sign([]string{keyA + ".key", filePath}); err != nil {
		t.Fatal(err)
	}

	// Signed with keyA's private key, verified against keyB's public key.
	if err := verify([]string{keyB + ".pub", filePath, filePath + ".sig"}); err == nil {
		t.Fatal("verify succeeded against a mismatched public key, want an error")
	}
}

func TestReadKeyRejectsWrongLength(t *testing.T) {
	dir := t.TempDir()
	badKey := filepath.Join(dir, "bad.pub")
	// Valid base64, but the wrong decoded length for an Ed25519 public key.
	if err := os.WriteFile(badKey, []byte("aGVsbG8=\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := readKey(badKey, 32); err == nil {
		t.Fatal("readKey accepted a key of the wrong length, want an error")
	}
}

func TestKeygenPrivateKeyFilePermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX file mode bits aren't meaningful on Windows")
	}
	dir := t.TempDir()
	keyName := filepath.Join(dir, "testkey")
	if err := keygen([]string{keyName}); err != nil {
		t.Fatal(err)
	}

	info, err := os.Stat(keyName + ".key")
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("private key mode = %s, want 0600", perm)
	}
}
