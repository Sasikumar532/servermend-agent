package checks

import (
	"os"
	"os/exec"
	"strings"

	"github.com/servermend/agent/report"
)

func init() {
	Register(loggingEnabled{})
	Register(logRotationConfigured{})
	Register(auditdPresent{})
}

// --- logging-enabled ---------------------------------------------------

type loggingEnabled struct{}

func (c loggingEnabled) ID() string       { return "logging-enabled" }
func (c loggingEnabled) Category() string { return "logging" }
func (c loggingEnabled) Title() string {
	return "No meaningful auth.log/journald retention configured"
}

func (c loggingEnabled) Run(rc *RunContext) report.Finding {
	for _, path := range authLogPaths {
		if _, err := os.Stat(path); err == nil {
			return finding(c, report.StatusPass, path+" exists")
		}
	}
	// No traditional auth log file — journald-only hosts are increasingly
	// common (minimal/container-focused distros), so check that instead.
	if _, err := exec.LookPath("journalctl"); err == nil {
		out, jErr := exec.Command("journalctl", "--disk-usage").Output()
		if jErr == nil && strings.TrimSpace(string(out)) != "" {
			return finding(c, report.StatusPass, "no auth.log/secure, but journald is active: "+strings.TrimSpace(string(out)))
		}
	}
	return finding(c, report.StatusFail, "no auth.log, secure log, or active journald found — no meaningful auth retention configured")
}

// --- log-rotation-configured -----------------------------------------------

type logRotationConfigured struct{}

func (c logRotationConfigured) ID() string       { return "log-rotation-configured" }
func (c logRotationConfigured) Category() string { return "logging" }
func (c logRotationConfigured) Title() string    { return "No log rotation set up" }

func (c logRotationConfigured) Run(rc *RunContext) report.Finding {
	if _, err := exec.LookPath("logrotate"); err == nil {
		if _, statErr := os.Stat("/etc/logrotate.conf"); statErr == nil {
			return finding(c, report.StatusPass, "logrotate installed with /etc/logrotate.conf present")
		}
	}
	if content, err := os.ReadFile("/etc/systemd/journald.conf"); err == nil {
		for _, line := range strings.Split(string(content), "\n") {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "SystemMaxUse=") && trimmed != "SystemMaxUse=" {
				return finding(c, report.StatusPass, "journald has a size limit configured: "+trimmed)
			}
		}
	}
	return finding(c, report.StatusFail, "no log rotation mechanism found (logrotate config, or a journald SystemMaxUse limit)")
}

// --- auditd-present ---------------------------------------------------------

type auditdPresent struct{}

func (c auditdPresent) ID() string       { return "auditd-present" }
func (c auditdPresent) Category() string { return "logging" }
func (c auditdPresent) Title() string    { return "auditd not installed" }

func (c auditdPresent) Run(rc *RunContext) report.Finding {
	if _, err := exec.LookPath("auditctl"); err != nil {
		return finding(c, report.StatusFail, "auditd not installed")
	}
	out, err := exec.Command("systemctl", "is-active", "auditd").Output()
	if err == nil && strings.TrimSpace(string(out)) == "active" {
		return finding(c, report.StatusPass, "auditd installed and active")
	}
	return finding(c, report.StatusFail, "auditd installed but not active")
}
