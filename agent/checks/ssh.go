package checks

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/servermend/agent/baseline"
	"github.com/servermend/agent/report"
)

func init() {
	Register(sshAuthorizedKeysDiff{})
	Register(sshRootLogin{})
	Register(sshPasswordAuth{})
	Register(sshEmptyPasswords{})
	Register(sshWeakCiphers{})
	Register(sshProtocolVersion{})
	Register(sshPortDefault{})
	Register(sshFailedLoginRate{})
	Register(sudoNopasswd{})
	Register(sudoBroadEntries{})
}

const sshdConfigPath = "/etc/ssh/sshd_config"

// parseSshdConfig reads sshd_config and follows Include directives (the
// default Ubuntu config is just "Include /etc/ssh/sshd_config.d/*.conf" —
// skipping this would mean silently missing every cloud-image override,
// e.g. the 50-cloud-init.conf that typically disables password auth).
// Directives after the first Match block are conditional, not global, so
// parsing stops there rather than risk misreporting.
func parseSshdConfig(path string) (map[string]string, error) {
	directives := map[string]string{}
	if err := parseSshdConfigInto(path, directives, 0); err != nil {
		return nil, err
	}
	return directives, nil
}

func parseSshdConfigInto(path string, directives map[string]string, depth int) error {
	if depth > 8 {
		return fmt.Errorf("Include recursion too deep at %s", path)
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		keyword := fields[0]

		if strings.EqualFold(keyword, "Match") {
			break
		}
		if strings.EqualFold(keyword, "Include") && len(fields) >= 2 {
			for _, pattern := range fields[1:] {
				matches, _ := filepath.Glob(pattern)
				sort.Strings(matches) // sshd_config.d/*.conf applies in lexical order
				for _, m := range matches {
					_ = parseSshdConfigInto(m, directives, depth+1) // unreadable include — skip, don't fail the whole check
				}
			}
			continue
		}
		if len(fields) < 2 {
			continue
		}
		key := strings.ToLower(keyword)
		if _, exists := directives[key]; exists {
			continue // sshd honors the first occurrence outside Match blocks
		}
		directives[key] = strings.Join(fields[1:], " ")
	}
	return scanner.Err()
}

// sshAuthorizedKeysDiff is #4 in the build order — the classic persistence
// mechanism after a compromise (an attacker appends their own key rather
// than leaving a more obvious backdoor).
type sshAuthorizedKeysDiff struct{}

func (c sshAuthorizedKeysDiff) ID() string       { return "ssh-authorized-keys-diff" }
func (c sshAuthorizedKeysDiff) Category() string { return "ssh" }
func (c sshAuthorizedKeysDiff) Title() string {
	return "authorized_keys contains keys not in known baseline"
}

func (c sshAuthorizedKeysDiff) Run(rc *RunContext) report.Finding {
	users, err := realUsers()
	if err != nil {
		return finding(c, report.StatusError, fmt.Sprintf("read /etc/passwd: %v", err))
	}

	var observed []string
	permIssues := 0
	for _, u := range users {
		path := filepath.Join(u.HomeDir, ".ssh", "authorized_keys")
		content, err := os.ReadFile(path)
		if err != nil {
			if os.IsPermission(err) {
				permIssues++
			}
			continue
		}
		for _, line := range strings.Split(string(content), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			observed = append(observed, u.Username+":"+baseline.Fingerprint([]byte(line)))
		}
	}

	// Never report a clean result when some users' keys couldn't be read —
	// that would hide exactly the compromise this check exists to catch.
	if permIssues > 0 && !rc.CaptureMode {
		return finding(c, report.StatusError, fmt.Sprintf(
			"%d user(s)' authorized_keys unreadable due to permissions — results incomplete, agent likely needs root", permIssues))
	}

	if rc.CaptureMode {
		rc.NewBaseline.AuthorizedKeys = observed
		msg := fmt.Sprintf("baseline captured: %d authorized key(s) across %d user(s)", len(observed), len(users))
		if permIssues > 0 {
			return finding(c, report.StatusError, msg+fmt.Sprintf("; %d user(s) unreadable — baseline may be incomplete", permIssues))
		}
		return finding(c, report.StatusInfo, msg)
	}

	if newKeys := baseline.Diff(rc.Baseline.AuthorizedKeys, observed); len(newKeys) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("key(s) not in baseline: %v", newKeys))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("no changes since baseline (%d key(s))", len(observed)))
}

// --- ssh-root-login ---------------------------------------------------

type sshRootLogin struct{}

func (c sshRootLogin) ID() string       { return "ssh-root-login" }
func (c sshRootLogin) Category() string { return "ssh" }
func (c sshRootLogin) Title() string    { return "PermitRootLogin is yes in sshd_config" }

func (c sshRootLogin) Run(rc *RunContext) report.Finding {
	directives, err := parseSshdConfig(sshdConfigPath)
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	val, ok := directives["permitrootlogin"]
	if !ok {
		return finding(c, report.StatusPass, "PermitRootLogin not set — OpenSSH default (prohibit-password) does not allow full root login")
	}
	if strings.EqualFold(val, "yes") {
		return finding(c, report.StatusFail, "PermitRootLogin yes")
	}
	return finding(c, report.StatusPass, fmt.Sprintf("PermitRootLogin %s", val))
}

// --- ssh-password-auth ---------------------------------------------------
// OpenSSH's compiled-in default for PasswordAuthentication is "yes" — so an
// absent directive is NOT safe here, unlike PermitRootLogin above.

type sshPasswordAuth struct{}

func (c sshPasswordAuth) ID() string       { return "ssh-password-auth" }
func (c sshPasswordAuth) Category() string { return "ssh" }
func (c sshPasswordAuth) Title() string    { return "PasswordAuthentication is yes" }

func (c sshPasswordAuth) Run(rc *RunContext) report.Finding {
	directives, err := parseSshdConfig(sshdConfigPath)
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	val, ok := directives["passwordauthentication"]
	if !ok || strings.EqualFold(val, "yes") {
		return finding(c, report.StatusFail, "PasswordAuthentication yes (or unset — OpenSSH's compiled default is yes)")
	}
	return finding(c, report.StatusPass, fmt.Sprintf("PasswordAuthentication %s", val))
}

// --- ssh-empty-passwords ---------------------------------------------------

type sshEmptyPasswords struct{}

func (c sshEmptyPasswords) ID() string       { return "ssh-empty-passwords" }
func (c sshEmptyPasswords) Category() string { return "ssh" }
func (c sshEmptyPasswords) Title() string {
	return "PermitEmptyPasswords is yes, or an account has an empty password"
}

func (c sshEmptyPasswords) Run(rc *RunContext) report.Finding {
	directives, _ := parseSshdConfig(sshdConfigPath)
	permitEmpty := strings.EqualFold(directives["permitemptypasswords"], "yes")

	emptyAccounts, shadowErr := findEmptyPasswordAccounts()
	switch {
	case shadowErr != nil && os.IsPermission(shadowErr):
		if permitEmpty {
			return finding(c, report.StatusFail, "PermitEmptyPasswords yes in sshd_config (could not also check /etc/shadow — permission denied)")
		}
		return finding(c, report.StatusError, "cannot read /etc/shadow to check for empty passwords — agent likely needs root")
	case len(emptyAccounts) > 0:
		return finding(c, report.StatusFail, fmt.Sprintf("account(s) with empty password hash: %v (PermitEmptyPasswords=%v)", emptyAccounts, permitEmpty))
	case permitEmpty:
		return finding(c, report.StatusFail, "PermitEmptyPasswords yes in sshd_config")
	default:
		return finding(c, report.StatusPass, "PermitEmptyPasswords not enabled, no accounts with an empty password hash")
	}
}

func findEmptyPasswordAccounts() ([]string, error) {
	f, err := os.Open("/etc/shadow")
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var empties []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := strings.Split(scanner.Text(), ":")
		if len(fields) < 2 {
			continue
		}
		if fields[1] == "" {
			empties = append(empties, fields[0])
		}
	}
	return empties, scanner.Err()
}

// --- ssh-weak-ciphers ---------------------------------------------------
// Absent Ciphers/MACs/KexAlgorithms directives are not flagged: modern
// OpenSSH's compiled-in default list already excludes these.

var weakCiphers = []string{"3des-cbc", "arcfour", "arcfour128", "arcfour256", "blowfish-cbc", "cast128-cbc", "des"}
var weakMACs = []string{"hmac-md5", "hmac-md5-96", "hmac-sha1-96", "umac-64"}
var weakKex = []string{"diffie-hellman-group1-sha1", "diffie-hellman-group14-sha1", "diffie-hellman-group-exchange-sha1"}

type sshWeakCiphers struct{}

func (c sshWeakCiphers) ID() string       { return "ssh-weak-ciphers" }
func (c sshWeakCiphers) Category() string { return "ssh" }
func (c sshWeakCiphers) Title() string    { return "Weak ciphers/MACs/KexAlgorithms enabled" }

func (c sshWeakCiphers) Run(rc *RunContext) report.Finding {
	directives, err := parseSshdConfig(sshdConfigPath)
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	var hits []string
	hits = append(hits, matchWeakAlgorithms(directives["ciphers"], weakCiphers)...)
	hits = append(hits, matchWeakAlgorithms(directives["macs"], weakMACs)...)
	hits = append(hits, matchWeakAlgorithms(directives["kexalgorithms"], weakKex)...)
	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("weak algorithm(s) explicitly enabled: %v", hits))
	}
	return finding(c, report.StatusPass, "no weak ciphers/MACs/KexAlgorithms explicitly enabled")
}

func matchWeakAlgorithms(directive string, weak []string) []string {
	if directive == "" {
		return nil
	}
	var hits []string
	for _, alg := range strings.Split(directive, ",") {
		alg = strings.ToLower(strings.TrimLeft(strings.TrimSpace(alg), "+-^"))
		for _, w := range weak {
			if alg == w {
				hits = append(hits, alg)
			}
		}
	}
	return hits
}

// --- ssh-protocol-version --------------------------------------------------

type sshProtocolVersion struct{}

func (c sshProtocolVersion) ID() string       { return "ssh-protocol-version" }
func (c sshProtocolVersion) Category() string { return "ssh" }
func (c sshProtocolVersion) Title() string    { return "Legacy SSHv1 support" }

func (c sshProtocolVersion) Run(rc *RunContext) report.Finding {
	directives, err := parseSshdConfig(sshdConfigPath)
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	val, ok := directives["protocol"]
	if !ok {
		return finding(c, report.StatusPass, "Protocol not set — modern OpenSSH no longer supports SSHv1 at all")
	}
	for _, v := range strings.Split(val, ",") {
		if strings.TrimSpace(v) == "1" {
			return finding(c, report.StatusFail, fmt.Sprintf("Protocol %s includes legacy SSHv1", val))
		}
	}
	return finding(c, report.StatusPass, fmt.Sprintf("Protocol %s", val))
}

// --- ssh-port-default (informational) --------------------------------------

type sshPortDefault struct{}

func (c sshPortDefault) ID() string       { return "ssh-port-default" }
func (c sshPortDefault) Category() string { return "ssh" }
func (c sshPortDefault) Title() string    { return "SSH still listening on port 22" }

func (c sshPortDefault) Run(rc *RunContext) report.Finding {
	sockets, err := ListeningSockets()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	for _, s := range sockets {
		if s.Port == 22 {
			return finding(c, report.StatusInfo, "sshd is listening on the default port (22)")
		}
	}
	return finding(c, report.StatusInfo, "no listener found on port 22 (may be on a non-default port)")
}

// --- ssh-failed-login-rate -------------------------------------------------
// Reads only the tail of the log (bounded to 512KB) rather than the whole
// file — a real resource-cost concern on hosts with large, rarely-rotated
// auth logs.

var authLogPaths = []string{"/var/log/auth.log", "/var/log/secure"}

const failedLoginTailBytes = 512 * 1024
const failedLoginThreshold = 50

type sshFailedLoginRate struct{}

func (c sshFailedLoginRate) ID() string       { return "ssh-failed-login-rate" }
func (c sshFailedLoginRate) Category() string { return "ssh" }
func (c sshFailedLoginRate) Title() string    { return "Elevated failed auth attempts in auth log" }

func (c sshFailedLoginRate) Run(rc *RunContext) report.Finding {
	for _, path := range authLogPaths {
		data, err := tailFile(path, failedLoginTailBytes)
		if err != nil {
			continue
		}
		count := strings.Count(string(data), "Failed password") + strings.Count(string(data), "authentication failure")
		if count > failedLoginThreshold {
			return finding(c, report.StatusFail, fmt.Sprintf("%d failed auth attempt(s) in the recent tail of %s (threshold %d)", count, path, failedLoginThreshold))
		}
		return finding(c, report.StatusPass, fmt.Sprintf("%d failed auth attempt(s) in the recent tail of %s", count, path))
	}
	return finding(c, report.StatusError, fmt.Sprintf("no auth log found at %v — journald-only hosts aren't covered yet (Phase 2)", authLogPaths))
}

func tailFile(path string, maxBytes int64) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	start := int64(0)
	if info.Size() > maxBytes {
		start = info.Size() - maxBytes
	}
	if _, err := f.Seek(start, 0); err != nil {
		return nil, err
	}
	return io.ReadAll(f)
}

// --- sudo-nopasswd / sudo-broad-entries ------------------------------------

func collectSudoersPaths() []string {
	paths := []string{"/etc/sudoers"}
	entries, err := os.ReadDir("/etc/sudoers.d")
	if err != nil {
		return paths
	}
	for _, e := range entries {
		if e.IsDir() || strings.HasPrefix(e.Name(), ".") || strings.HasSuffix(e.Name(), "~") {
			continue
		}
		paths = append(paths, filepath.Join("/etc/sudoers.d", e.Name()))
	}
	return paths
}

type sudoNopasswd struct{}

func (c sudoNopasswd) ID() string       { return "sudo-nopasswd" }
func (c sudoNopasswd) Category() string { return "ssh" }
func (c sudoNopasswd) Title() string    { return "Passwordless sudo (NOPASSWD) on non-service accounts" }

func (c sudoNopasswd) Run(rc *RunContext) report.Finding {
	var hits []string
	readAny := false
	for _, path := range collectSudoersPaths() {
		content, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		readAny = true
		for i, line := range strings.Split(string(content), "\n") {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			if strings.Contains(trimmed, "NOPASSWD") {
				hits = append(hits, fmt.Sprintf("%s:%d: %s", path, i+1, trimmed))
			}
		}
	}
	if !readAny {
		return finding(c, report.StatusError, "could not read /etc/sudoers or /etc/sudoers.d/* — agent likely needs root")
	}
	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("NOPASSWD entries found (review whether these are expected service accounts): %v", hits))
	}
	return finding(c, report.StatusPass, "no NOPASSWD entries found")
}

var broadSudoPattern = regexp.MustCompile(`(?i)ALL\s*=\s*\(ALL(:ALL)?\)\s*ALL`)

type sudoBroadEntries struct{}

func (c sudoBroadEntries) ID() string       { return "sudo-broad-entries" }
func (c sudoBroadEntries) Category() string { return "ssh" }
func (c sudoBroadEntries) Title() string {
	return "Overly broad sudoers rules for individual users"
}

func (c sudoBroadEntries) Run(rc *RunContext) report.Finding {
	var hits []string
	readAny := false
	for _, path := range collectSudoersPaths() {
		content, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		readAny = true
		for i, line := range strings.Split(string(content), "\n") {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			fields := strings.Fields(trimmed)
			principal := fields[0]
			// Group grants (%sudo, %wheel) and root are the expected,
			// standard broad-access pattern — only individually-named
			// users are excess privilege worth flagging.
			if strings.HasPrefix(principal, "%") || principal == "root" || principal == "Defaults" {
				continue
			}
			if broadSudoPattern.MatchString(trimmed) {
				hits = append(hits, fmt.Sprintf("%s:%d: %s", path, i+1, trimmed))
			}
		}
	}
	if !readAny {
		return finding(c, report.StatusError, "could not read /etc/sudoers or /etc/sudoers.d/* — agent likely needs root")
	}
	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("individual user(s) granted ALL=(ALL) ALL directly rather than via an admin group: %v", hits))
	}
	return finding(c, report.StatusPass, "no overly broad per-user sudoers entries found")
}
