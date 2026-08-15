package checks

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseSshdConfigFollowsInclude(t *testing.T) {
	dir := t.TempDir()
	mainPath := filepath.Join(dir, "sshd_config")
	includeDir := filepath.Join(dir, "sshd_config.d")
	if err := os.Mkdir(includeDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// Models Ubuntu's real layout: Include is the very first directive, and
	// a cloud-init drop-in disables password auth. If Include isn't
	// followed, this looks safe when it isn't.
	mainContent := "Include " + filepath.Join(includeDir, "*.conf") + "\n" +
		"PermitRootLogin yes\n" +
		"PasswordAuthentication yes\n"
	includeContent := "PasswordAuthentication no\n"

	if err := os.WriteFile(filepath.Join(includeDir, "50-cloud-init.conf"), []byte(includeContent), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(mainPath, []byte(mainContent), 0o644); err != nil {
		t.Fatal(err)
	}

	directives, err := parseSshdConfig(mainPath)
	if err != nil {
		t.Fatalf("parseSshdConfig: %v", err)
	}

	if got := directives["passwordauthentication"]; got != "no" {
		t.Errorf("PasswordAuthentication = %q, want %q (the Include'd override should win — sshd honors the first occurrence, and Include comes first in the file)", got, "no")
	}
	if got := directives["permitrootlogin"]; got != "yes" {
		t.Errorf("PermitRootLogin = %q, want %q", got, "yes")
	}
}

func TestParseSshdConfigStopsAtMatchBlock(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sshd_config")
	content := "PermitRootLogin yes\n" +
		"Match User deploy\n" +
		"    PermitRootLogin no\n" // conditional — must not override the global value above

	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	directives, err := parseSshdConfig(path)
	if err != nil {
		t.Fatalf("parseSshdConfig: %v", err)
	}
	if got := directives["permitrootlogin"]; got != "yes" {
		t.Errorf("PermitRootLogin = %q, want %q (a Match-block directive must not leak into the global value)", got, "yes")
	}
}

func TestMatchWeakAlgorithms(t *testing.T) {
	cases := []struct {
		name      string
		directive string
		want      int
	}{
		{"empty directive", "", 0},
		{"no weak algorithms", "chacha20-poly1305@openssh.com,aes256-gcm@openssh.com", 0},
		{"one weak cipher among strong ones", "aes256-gcm@openssh.com,3des-cbc", 1},
		{"leading modifier stripped", "+3des-cbc", 1},
		{"case insensitive", "3DES-CBC", 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := matchWeakAlgorithms(tc.directive, weakCiphers)
			if len(got) != tc.want {
				t.Errorf("matchWeakAlgorithms(%q) = %v, want %d hit(s)", tc.directive, got, tc.want)
			}
		})
	}
}
