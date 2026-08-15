// Command servermend-sign is a minimal Ed25519 release-signing tool.
// stdlib-only (crypto/ed25519), so signing release binaries never needed
// an external dependency like minisign — the project's zero-dependency
// philosophy extends to its own build tooling, not just the agent binary.
//
// This is a custom (but standard-algorithm) format, not minisign's wire
// format: keys and signatures are base64-encoded raw Ed25519 bytes, one
// line per file. A real minisign keypair isn't interchangeable with this
// tool's keys, and vice versa — pick one and keep build-release.sh and
// install.sh's verification step consistent with it.
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"strings"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}

	var err error
	switch os.Args[1] {
	case "keygen":
		err = keygen(os.Args[2:])
	case "sign":
		err = sign(os.Args[2:])
	case "verify":
		err = verify(os.Args[2:])
	default:
		usage()
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "servermend-sign:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `usage:
  servermend-sign keygen <name>              writes <name>.pub and <name>.key
  servermend-sign sign <key> <file>          writes <file>.sig
  servermend-sign verify <pub> <file> <sig>  exit 0 if valid, 1 otherwise`)
	os.Exit(2)
}

func keygen(args []string) error {
	if len(args) != 1 {
		return fmt.Errorf("keygen requires exactly one argument: <name>")
	}
	name := args[0]

	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return fmt.Errorf("generate key: %w", err)
	}
	if err := os.WriteFile(name+".pub", []byte(encode(pub)+"\n"), 0o644); err != nil {
		return fmt.Errorf("write public key: %w", err)
	}
	// Private key is sensitive: mode 600, and the caller is responsible
	// for keeping it out of git and CI logs (see agent/README.md).
	if err := os.WriteFile(name+".key", []byte(encode(priv)+"\n"), 0o600); err != nil {
		return fmt.Errorf("write private key: %w", err)
	}
	fmt.Printf("wrote %s.pub (public, safe to commit/distribute) and %s.key (private, chmod 600 — keep out of git and CI logs)\n", name, name)
	return nil
}

func sign(args []string) error {
	if len(args) != 2 {
		return fmt.Errorf("sign requires exactly two arguments: <key> <file>")
	}
	keyPath, filePath := args[0], args[1]

	priv, err := readKey(keyPath, ed25519.PrivateKeySize)
	if err != nil {
		return fmt.Errorf("read private key: %w", err)
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("read file to sign: %w", err)
	}

	sig := ed25519.Sign(ed25519.PrivateKey(priv), data)
	sigPath := filePath + ".sig"
	if err := os.WriteFile(sigPath, []byte(encode(sig)+"\n"), 0o644); err != nil {
		return fmt.Errorf("write signature: %w", err)
	}
	fmt.Println("wrote", sigPath)
	return nil
}

func verify(args []string) error {
	if len(args) != 3 {
		return fmt.Errorf("verify requires exactly three arguments: <pub> <file> <sig>")
	}
	pubPath, filePath, sigPath := args[0], args[1], args[2]

	pub, err := readKey(pubPath, ed25519.PublicKeySize)
	if err != nil {
		return fmt.Errorf("read public key: %w", err)
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("read file to verify: %w", err)
	}
	sigContent, err := os.ReadFile(sigPath)
	if err != nil {
		return fmt.Errorf("read signature: %w", err)
	}
	sig, err := decode(string(sigContent))
	if err != nil {
		return fmt.Errorf("decode signature: %w", err)
	}

	if !ed25519.Verify(ed25519.PublicKey(pub), data, sig) {
		return fmt.Errorf("signature verification FAILED for %s", filePath)
	}
	fmt.Println("signature OK for", filePath)
	return nil
}

func readKey(path string, wantLen int) ([]byte, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	key, err := decode(string(content))
	if err != nil {
		return nil, err
	}
	if len(key) != wantLen {
		return nil, fmt.Errorf("expected a %d-byte key, got %d bytes", wantLen, len(key))
	}
	return key, nil
}

func encode(b []byte) string { return base64.StdEncoding.EncodeToString(b) }

func decode(s string) ([]byte, error) { return base64.StdEncoding.DecodeString(strings.TrimSpace(s)) }
