// Persistence checks: cron, systemd, LD_PRELOAD, shell-profile tampering,
// world-writable PATH, unexpected SUID/SGID, and deleted-binary-running.
// Per the roadmap, this category is the product's differentiation wedge —
// most competing tools (Lynis, CrowdSec) under-cover it.
package checks

import (
	"bufio"
	"bytes"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/servermend/agent/baseline"
	"github.com/servermend/agent/report"
)

func init() {
	Register(cronSystemJobs{})
	Register(cronUserJobs{})
	Register(systemdUnexpectedUnits{})
	Register(ldPreloadHijack{})
	Register(shellProfileTampering{})
	Register(pathWorldWritable{})
	Register(suidSgidUnexpected{})
	Register(deletedBinaryRunning{})
}

func fingerprintFile(path string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return path + ":" + baseline.Fingerprint(content), nil
}

// --- cron-system-jobs -------------------------------------------------

var systemCronDirs = []string{
	"/etc/cron.d",
	"/etc/cron.daily",
	"/etc/cron.hourly",
	"/etc/cron.weekly",
	"/etc/cron.monthly",
}

var systemCronFiles = []string{"/etc/crontab"}

func collectSystemCronEntries() []string {
	var entries []string
	for _, dir := range systemCronDirs {
		items, err := os.ReadDir(dir)
		if err != nil {
			continue // directory not present on this distro — fine
		}
		for _, item := range items {
			if item.IsDir() || strings.HasPrefix(item.Name(), ".") {
				continue
			}
			if entry, err := fingerprintFile(filepath.Join(dir, item.Name())); err == nil {
				entries = append(entries, entry)
			}
		}
	}
	for _, path := range systemCronFiles {
		if entry, err := fingerprintFile(path); err == nil {
			entries = append(entries, entry)
		}
	}
	sort.Strings(entries)
	return entries
}

type cronSystemJobs struct{}

func (c cronSystemJobs) ID() string       { return "cron-system-jobs" }
func (c cronSystemJobs) Category() string { return "persistence" }
func (c cronSystemJobs) Title() string    { return "Unrecognized/modified entries in /etc/cron.*" }

func (c cronSystemJobs) Run(rc *RunContext) report.Finding {
	observed := collectSystemCronEntries()
	if rc.CaptureMode {
		rc.NewBaseline.SystemCronEntries = observed
		return finding(c, report.StatusInfo, fmt.Sprintf("baseline captured: %d system cron file(s)", len(observed)))
	}
	if changed := baseline.Diff(rc.Baseline.SystemCronEntries, observed); len(changed) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("new or modified since baseline: %v", changed))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("no changes since baseline (%d file(s))", len(observed)))
}

// --- cron-user-jobs -----------------------------------------------------

var userCronDirs = []string{
	"/var/spool/cron/crontabs", // Debian/Ubuntu
	"/var/spool/cron",          // RHEL/CentOS
}

func collectUserCronEntries(users []PasswdEntry) (entries []string, permIssues int) {
	for _, u := range users {
		for _, dir := range userCronDirs {
			content, err := os.ReadFile(filepath.Join(dir, u.Username))
			if err != nil {
				if os.IsPermission(err) {
					permIssues++
				}
				continue
			}
			entries = append(entries, u.Username+":"+baseline.Fingerprint(content))
			break
		}
	}
	sort.Strings(entries)
	return entries, permIssues
}

type cronUserJobs struct{}

func (c cronUserJobs) ID() string       { return "cron-user-jobs" }
func (c cronUserJobs) Category() string { return "persistence" }
func (c cronUserJobs) Title() string    { return "Unrecognized entries in per-user crontabs" }

func (c cronUserJobs) Run(rc *RunContext) report.Finding {
	users, err := realUsers()
	if err != nil {
		return finding(c, report.StatusError, fmt.Sprintf("read /etc/passwd: %v", err))
	}
	observed, permIssues := collectUserCronEntries(users)

	if permIssues > 0 && !rc.CaptureMode {
		return finding(c, report.StatusError, fmt.Sprintf(
			"%d user crontab(s) unreadable due to permissions — results incomplete, agent likely needs root", permIssues))
	}
	if rc.CaptureMode {
		rc.NewBaseline.UserCronEntries = observed
		msg := fmt.Sprintf("baseline captured: %d user crontab(s)", len(observed))
		if permIssues > 0 {
			return finding(c, report.StatusError, msg+fmt.Sprintf("; %d unreadable — baseline may be incomplete", permIssues))
		}
		return finding(c, report.StatusInfo, msg)
	}
	if changed := baseline.Diff(rc.Baseline.UserCronEntries, observed); len(changed) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("new or modified since baseline: %v", changed))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("no changes since baseline (%d crontab(s))", len(observed)))
}

// --- systemd-unexpected-units --------------------------------------------

func collectEnabledSystemdUnits() ([]string, error) {
	out, err := exec.Command("systemctl", "list-unit-files",
		"--type=service,timer", "--state=enabled", "--no-legend", "--no-pager").Output()
	if err != nil {
		return nil, err
	}
	var units []string
	scanner := bufio.NewScanner(bytes.NewReader(out))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) == 0 {
			continue
		}
		units = append(units, fields[0])
	}
	sort.Strings(units)
	return units, scanner.Err()
}

type systemdUnexpectedUnits struct{}

func (c systemdUnexpectedUnits) ID() string       { return "systemd-unexpected-units" }
func (c systemdUnexpectedUnits) Category() string { return "persistence" }
func (c systemdUnexpectedUnits) Title() string {
	return "Unrecognized .timer/.service units set to auto-start"
}

func (c systemdUnexpectedUnits) Run(rc *RunContext) report.Finding {
	observed, err := collectEnabledSystemdUnits()
	if err != nil {
		return finding(c, report.StatusError, fmt.Sprintf("run systemctl: %v", err))
	}
	if rc.CaptureMode {
		rc.NewBaseline.SystemdUnits = observed
		return finding(c, report.StatusInfo, fmt.Sprintf("baseline captured: %d enabled unit(s)", len(observed)))
	}
	if changed := baseline.Diff(rc.Baseline.SystemdUnits, observed); len(changed) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("newly enabled since baseline: %v", changed))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("no changes since baseline (%d enabled unit(s))", len(observed)))
}

// --- ld-preload-hijack ----------------------------------------------------
// No baseline needed: any non-empty /etc/ld.so.preload is inherently
// suspicious on a normal host, not just a change from a prior state.

type ldPreloadHijack struct{}

func (c ldPreloadHijack) ID() string       { return "ld-preload-hijack" }
func (c ldPreloadHijack) Category() string { return "persistence" }
func (c ldPreloadHijack) Title() string    { return "LD_PRELOAD set, or /etc/ld.so.preload non-empty" }

func (c ldPreloadHijack) Run(rc *RunContext) report.Finding {
	content, err := os.ReadFile("/etc/ld.so.preload")
	if err != nil {
		if os.IsNotExist(err) {
			return finding(c, report.StatusPass, "/etc/ld.so.preload does not exist")
		}
		return finding(c, report.StatusError, err.Error())
	}
	trimmed := strings.TrimSpace(string(content))
	if trimmed == "" {
		return finding(c, report.StatusPass, "/etc/ld.so.preload exists but is empty")
	}
	return finding(c, report.StatusFail, fmt.Sprintf("/etc/ld.so.preload is non-empty: %q", trimmed))
}

// --- shell-profile-tampering -----------------------------------------------
// Pattern-based, not baseline-diffed: the point is content (does this line
// look like a reverse shell or miner launcher), not novelty.

var shellProfileSystemFiles = []string{"/etc/profile", "/etc/bash.bashrc"}
var shellProfileUserFiles = []string{".bashrc", ".profile", ".bash_profile"}

var suspiciousShellPatterns = []string{
	"ld_preload=",
	"| sh",
	"|sh",
	"| bash",
	"|bash",
	"/dev/tcp/",
	"/dev/shm/",
	"nc -e",
	"ncat -e",
	"base64 -d",
	"xmrig",
	"mimikatz",
}

func scanShellProfileFile(path string) ([]string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var hits []string
	for i, line := range strings.Split(string(content), "\n") {
		lower := strings.ToLower(line)
		for _, pat := range suspiciousShellPatterns {
			if strings.Contains(lower, pat) {
				hits = append(hits, fmt.Sprintf("%s:%d: %s", path, i+1, strings.TrimSpace(line)))
				break
			}
		}
	}
	return hits, nil
}

type shellProfileTampering struct{}

func (c shellProfileTampering) ID() string       { return "shell-profile-tampering" }
func (c shellProfileTampering) Category() string { return "persistence" }
func (c shellProfileTampering) Title() string {
	return "Suspicious additions to .bashrc/.profile/.bash_profile"
}

func (c shellProfileTampering) Run(rc *RunContext) report.Finding {
	var hits []string
	checked := 0

	for _, path := range shellProfileSystemFiles {
		if found, err := scanShellProfileFile(path); err == nil {
			checked++
			hits = append(hits, found...)
		}
	}

	users, err := realUsers()
	if err != nil {
		return finding(c, report.StatusError, fmt.Sprintf("read /etc/passwd: %v", err))
	}
	for _, u := range users {
		for _, name := range shellProfileUserFiles {
			path := filepath.Join(u.HomeDir, name)
			if found, err := scanShellProfileFile(path); err == nil {
				checked++
				hits = append(hits, found...)
			}
		}
	}

	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("suspicious pattern(s) found: %v", hits))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("no suspicious patterns in %d shell profile file(s) checked", checked))
}

// --- path-world-writable ----------------------------------------------------

type pathWorldWritable struct{}

func (c pathWorldWritable) ID() string       { return "path-world-writable" }
func (c pathWorldWritable) Category() string { return "persistence" }
func (c pathWorldWritable) Title() string    { return "World-writable directories in $PATH" }

func (c pathWorldWritable) Run(rc *RunContext) report.Finding {
	pathEnv := os.Getenv("PATH")
	if pathEnv == "" {
		return finding(c, report.StatusInfo, "PATH is empty in the agent's environment")
	}
	var writable []string
	for _, dir := range filepath.SplitList(pathEnv) {
		info, err := os.Stat(dir)
		if err != nil {
			continue
		}
		if info.Mode().Perm()&0o002 != 0 {
			writable = append(writable, dir)
		}
	}
	if len(writable) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("world-writable director(y/ies) in PATH: %v", writable))
	}
	return finding(c, report.StatusPass, "no world-writable directories in PATH")
}

// --- suid-sgid-unexpected ---------------------------------------------------
// Scoped to conventional binary/library roots rather than a literal
// `find / -perm -4000` — a full "/" walk risks crossing into large or
// network-mounted filesystems, which is a real resource-cost concern noted
// in the roadmap's risk log.

var suidScanRoots = []string{"/usr", "/bin", "/sbin", "/opt", "/lib", "/lib64"}

func collectSuidSgidBinaries() []string {
	var results []string
	for _, root := range suidScanRoots {
		_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil // permission denied, broken symlink, etc — skip and keep walking
			}
			if d.IsDir() {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			mode := info.Mode()
			if mode&os.ModeSetuid != 0 || mode&os.ModeSetgid != 0 {
				results = append(results, fmt.Sprintf("%s:%s", path, mode.Perm()))
			}
			return nil
		})
	}
	sort.Strings(results)
	return results
}

type suidSgidUnexpected struct{}

func (c suidSgidUnexpected) ID() string       { return "suid-sgid-unexpected" }
func (c suidSgidUnexpected) Category() string { return "persistence" }
func (c suidSgidUnexpected) Title() string    { return "Unexpected SUID/SGID binaries" }

func (c suidSgidUnexpected) Run(rc *RunContext) report.Finding {
	observed := collectSuidSgidBinaries()
	if rc.CaptureMode {
		rc.NewBaseline.SuidBinaries = observed
		return finding(c, report.StatusInfo, fmt.Sprintf("baseline captured: %d SUID/SGID binar(y/ies)", len(observed)))
	}
	if changed := baseline.Diff(rc.Baseline.SuidBinaries, observed); len(changed) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("new since baseline: %v", changed))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("no changes since baseline (%d binar(y/ies))", len(observed)))
}

// --- deleted-binary-running --------------------------------------------------
// No baseline needed: a running process whose executable was deleted after
// launch is inherently suspicious, not just a change from a prior state.

type deletedBinaryRunning struct{}

func (c deletedBinaryRunning) ID() string       { return "deleted-binary-running" }
func (c deletedBinaryRunning) Category() string { return "persistence" }
func (c deletedBinaryRunning) Title() string {
	return "Running process whose executable is a deleted file"
}

func (c deletedBinaryRunning) Run(rc *RunContext) report.Finding {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}

	var hits []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(e.Name())
		if err != nil {
			continue // not a pid directory
		}
		target, err := os.Readlink(fmt.Sprintf("/proc/%d/exe", pid))
		if err != nil {
			continue // process exited mid-scan, permission denied, or a kernel thread
		}
		if strings.HasSuffix(target, " (deleted)") {
			hits = append(hits, fmt.Sprintf("pid %d: %s", pid, target))
		}
	}

	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("process(es) running from a deleted binary: %v", hits))
	}
	return finding(c, report.StatusPass, "no running process points to a deleted binary")
}
