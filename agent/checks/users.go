package checks

import (
	"bufio"
	"io"
	"os"
	"strconv"
	"strings"
)

// PasswdEntry is a parsed line from /etc/passwd.
type PasswdEntry struct {
	Username string
	UID      int
	HomeDir  string
	Shell    string
}

// realUsers returns passwd entries worth auditing: root, plus human
// accounts (UID >= 1000) with an interactive shell. Service/system accounts
// with a nologin-style shell are excluded — they don't have SSH keys or
// crontabs worth diffing. Shared by ssh-authorized-keys-diff, cron-user-jobs,
// and shell-profile-tampering.
func realUsers() ([]PasswdEntry, error) {
	f, err := os.Open("/etc/passwd")
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return parsePasswd(f)
}

// parsePasswd is split out from realUsers so the parsing logic is testable
// without depending on the real /etc/passwd (which doesn't exist on the
// dev machine this was written on, and shouldn't be faked on a real one).
func parsePasswd(r io.Reader) ([]PasswdEntry, error) {
	var users []PasswdEntry
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		fields := strings.Split(scanner.Text(), ":")
		if len(fields) < 7 {
			continue
		}
		uid, err := strconv.Atoi(fields[2])
		if err != nil {
			continue
		}
		if uid != 0 && uid < 1000 {
			continue
		}
		shell := strings.TrimSpace(fields[6])
		if isNologinShell(shell) {
			continue
		}
		users = append(users, PasswdEntry{
			Username: fields[0],
			UID:      uid,
			HomeDir:  fields[5],
			Shell:    shell,
		})
	}
	return users, scanner.Err()
}

func isNologinShell(shell string) bool {
	switch shell {
	case "", "/usr/sbin/nologin", "/sbin/nologin", "/bin/false", "/usr/bin/false":
		return true
	default:
		return false
	}
}
