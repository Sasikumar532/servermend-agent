package checks

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/servermend/agent/report"
)

func init() {
	Register(appsRunningAsRoot{})
	Register(fail2banInstalled{})
	Register(unattendedUpgradesActive{})
	Register(kernelVersionOutdated{})
}

// --- apps-running-as-root ---------------------------------------------------
// Allowlist-based: only recognizes a fixed set of common app-runtime
// process names. nginx is deliberately excluded — its master process
// running as root in order to bind :80/:443 and then drop privileges for
// worker processes is the standard, correct pattern, not a finding.

var appProcessNames = map[string]bool{
	"node": true, "npm": true, "python": true, "python3": true, "ruby": true,
	"java": true, "php-fpm": true, "gunicorn": true, "uwsgi": true, "pm2": true,
}

type appsRunningAsRoot struct{}

func (c appsRunningAsRoot) ID() string       { return "apps-running-as-root" }
func (c appsRunningAsRoot) Category() string { return "process" }
func (c appsRunningAsRoot) Title() string {
	return "Application/service processes running as root"
}

func (c appsRunningAsRoot) Run(rc *RunContext) report.Finding {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	var hits []string
	for _, e := range entries {
		pid, err := strconv.Atoi(e.Name())
		if err != nil || !e.IsDir() {
			continue
		}
		comm, err := os.ReadFile(fmt.Sprintf("/proc/%d/comm", pid))
		if err != nil {
			continue
		}
		name := strings.TrimSpace(string(comm))
		if !appProcessNames[name] {
			continue
		}
		uid, err := processUID(pid)
		if err != nil || uid != 0 {
			continue
		}
		hits = append(hits, fmt.Sprintf("pid %d (%s)", pid, name))
	}
	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("application process(es) running as root: %v", hits))
	}
	return finding(c, report.StatusPass, "no known application processes running as root")
}

func processUID(pid int) (int, error) {
	content, err := os.ReadFile(fmt.Sprintf("/proc/%d/status", pid))
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(string(content), "\n") {
		if strings.HasPrefix(line, "Uid:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				return strconv.Atoi(fields[1])
			}
		}
	}
	return 0, fmt.Errorf("Uid line not found in /proc/%d/status", pid)
}

// --- fail2ban-installed ---------------------------------------------------

type fail2banInstalled struct{}

func (c fail2banInstalled) ID() string       { return "fail2ban-installed" }
func (c fail2banInstalled) Category() string { return "process" }
func (c fail2banInstalled) Title() string    { return "fail2ban (or equivalent) not installed/running" }

func (c fail2banInstalled) Run(rc *RunContext) report.Finding {
	out, err := exec.Command("systemctl", "is-active", "fail2ban").Output()
	status := strings.TrimSpace(string(out))
	if err == nil && status == "active" {
		return finding(c, report.StatusPass, "fail2ban is active")
	}
	if _, lookErr := exec.LookPath("fail2ban-client"); lookErr != nil {
		return finding(c, report.StatusFail, "fail2ban not installed")
	}
	return finding(c, report.StatusFail, fmt.Sprintf("fail2ban installed but not active (systemctl status: %q)", status))
}

// --- unattended-upgrades-active ---------------------------------------------
// Covers both Debian/Ubuntu (unattended-upgrades) and RHEL/Fedora
// (dnf-automatic) — the two package-manager families the target audience
// actually runs.

type unattendedUpgradesActive struct{}

func (c unattendedUpgradesActive) ID() string       { return "unattended-upgrades-active" }
func (c unattendedUpgradesActive) Category() string { return "process" }
func (c unattendedUpgradesActive) Title() string {
	return "Package installed but not actually enabled/working"
}

func (c unattendedUpgradesActive) Run(rc *RunContext) report.Finding {
	if _, err := exec.LookPath("dpkg"); err == nil {
		return c.runDebian()
	}
	if _, err := exec.LookPath("rpm"); err == nil {
		return c.runRHEL()
	}
	return finding(c, report.StatusInfo, "neither dpkg nor rpm found — this check doesn't cover this distro family yet")
}

func (c unattendedUpgradesActive) runDebian() report.Finding {
	if err := exec.Command("dpkg", "-s", "unattended-upgrades").Run(); err != nil {
		return finding(c, report.StatusFail, "unattended-upgrades package not installed")
	}
	content, err := os.ReadFile("/etc/apt/apt.conf.d/20auto-upgrades")
	if err != nil {
		return finding(c, report.StatusFail, "unattended-upgrades installed but /etc/apt/apt.conf.d/20auto-upgrades is missing — installed but not enabled")
	}
	if strings.Contains(string(content), `Unattended-Upgrade "1"`) {
		return finding(c, report.StatusPass, "unattended-upgrades installed and enabled")
	}
	return finding(c, report.StatusFail, "unattended-upgrades installed but disabled in 20auto-upgrades")
}

func (c unattendedUpgradesActive) runRHEL() report.Finding {
	if err := exec.Command("rpm", "-q", "dnf-automatic").Run(); err != nil {
		return finding(c, report.StatusFail, "dnf-automatic package not installed")
	}
	if c.timerEnabled("dnf-automatic-install.timer") || c.timerEnabled("dnf-automatic.timer") {
		return finding(c, report.StatusPass, "dnf-automatic installed and its timer is enabled")
	}
	return finding(c, report.StatusFail, "dnf-automatic installed but its timer isn't enabled — installed but not enabled")
}

func (c unattendedUpgradesActive) timerEnabled(unit string) bool {
	out, err := exec.Command("systemctl", "is-enabled", unit).Output()
	return err == nil && strings.TrimSpace(string(out)) == "enabled"
}

// --- kernel-version-outdated -------------------------------------------------
// Reports the raw version only. Whether a given kernel is "significantly
// behind" needs a per-distro reference feed the agent doesn't have — that
// judgment belongs server-side, consistent with the agent staying "dumb."

type kernelVersionOutdated struct{}

func (c kernelVersionOutdated) ID() string       { return "kernel-version-outdated" }
func (c kernelVersionOutdated) Category() string { return "process" }
func (c kernelVersionOutdated) Title() string {
	return "Running kernel significantly behind latest for the distro"
}

func (c kernelVersionOutdated) Run(rc *RunContext) report.Finding {
	out, err := exec.Command("uname", "-r").Output()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	return finding(c, report.StatusInfo, fmt.Sprintf("running kernel %s", strings.TrimSpace(string(out))))
}
