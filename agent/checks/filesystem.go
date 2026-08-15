package checks

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/servermend/agent/report"
)

func init() {
	Register(shadowFilePermissions{})
	Register(sshPrivateKeyPermissions{})
	Register(secretsPlaintextBroadRead{})
}

// --- shadow-file-permissions -----------------------------------------------
// Just a stat() — checking permission bits never requires reading the
// file's content, so this needs no elevated access.

type shadowFilePermissions struct{}

func (c shadowFilePermissions) ID() string       { return "shadow-file-permissions" }
func (c shadowFilePermissions) Category() string { return "filesystem" }
func (c shadowFilePermissions) Title() string    { return "/etc/shadow readable by non-root" }

func (c shadowFilePermissions) Run(rc *RunContext) report.Finding {
	info, err := os.Stat("/etc/shadow")
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	mode := info.Mode().Perm()
	if mode&0o044 != 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("/etc/shadow mode %s is readable by group and/or other", mode))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("/etc/shadow mode %s", mode))
}

// --- ssh-private-key-permissions --------------------------------------------

var privateKeyNames = []string{"id_rsa", "id_ed25519", "id_ecdsa", "id_dsa"}

func isLikelyPrivateKeyName(name string) bool {
	for _, n := range privateKeyNames {
		if name == n || strings.HasPrefix(name, n+"-") {
			return true
		}
	}
	return false
}

type sshPrivateKeyPermissions struct{}

func (c sshPrivateKeyPermissions) ID() string       { return "ssh-private-key-permissions" }
func (c sshPrivateKeyPermissions) Category() string { return "filesystem" }
func (c sshPrivateKeyPermissions) Title() string {
	return "Private keys not mode 600"
}

func (c sshPrivateKeyPermissions) Run(rc *RunContext) report.Finding {
	users, err := realUsers()
	if err != nil {
		return finding(c, report.StatusError, fmt.Sprintf("read /etc/passwd: %v", err))
	}
	var bad []string
	checked := 0
	for _, u := range users {
		sshDir := filepath.Join(u.HomeDir, ".ssh")
		entries, err := os.ReadDir(sshDir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() || strings.HasSuffix(e.Name(), ".pub") || !isLikelyPrivateKeyName(e.Name()) {
				continue
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			checked++
			if info.Mode().Perm() != 0o600 {
				bad = append(bad, fmt.Sprintf("%s (mode %s)", filepath.Join(sshDir, e.Name()), info.Mode().Perm()))
			}
		}
	}
	if len(bad) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("private key(s) not mode 600: %v", bad))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("%d private key(s) checked, all mode 600", checked))
}

// --- secrets-plaintext-broad-read --------------------------------------------
// Scoped to conventional deploy roots and bounded depth, same reasoning as
// the SUID scan — a full filesystem crawl is a real resource-cost risk.

var secretsScanRoots = []string{"/opt", "/srv", "/var/www", "/home"}

func collectWorldReadableEnvFiles() []string {
	var hits []string
	for _, root := range secretsScanRoots {
		rootDepth := strings.Count(root, string(filepath.Separator))
		_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				if d.Name() == "node_modules" || d.Name() == ".git" {
					return filepath.SkipDir
				}
				if strings.Count(path, string(filepath.Separator))-rootDepth > 4 {
					return filepath.SkipDir
				}
				return nil
			}
			if d.Name() != ".env" {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			if info.Mode().Perm()&0o044 != 0 {
				hits = append(hits, fmt.Sprintf("%s (mode %s)", path, info.Mode().Perm()))
			}
			return nil
		})
	}
	sort.Strings(hits)
	return hits
}

type secretsPlaintextBroadRead struct{}

func (c secretsPlaintextBroadRead) ID() string       { return "secrets-plaintext-broad-read" }
func (c secretsPlaintextBroadRead) Category() string { return "filesystem" }
func (c secretsPlaintextBroadRead) Title() string {
	return "Env files with secrets readable by non-owner users"
}

func (c secretsPlaintextBroadRead) Run(rc *RunContext) report.Finding {
	hits := collectWorldReadableEnvFiles()
	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf(".env file(s) readable by group/other: %v", hits))
	}
	return finding(c, report.StatusPass, "no group/other-readable .env files found under common deploy roots")
}
