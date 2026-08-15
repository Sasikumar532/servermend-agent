package checks

import (
	"fmt"
	"os"
	"os/exec"
	"slices"
	"strings"

	"github.com/servermend/agent/report"
)

func init() {
	Register(sysctlIPForward{})
	Register(sysctlICMPRedirects{})
	Register(sysctlSynCookies{})
	Register(sysctlASLRDisabled{})
	Register(coreDumpsWorldReadable{})
	Register(tmpNoexec{})
}

func readSysctl(key string) (string, error) {
	path := "/proc/sys/" + strings.ReplaceAll(key, ".", "/")
	content, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(content)), nil
}

func dockerInstalled() bool {
	_, err := exec.LookPath("docker")
	return err == nil
}

// --- sysctl-ip-forward -------------------------------------------------
// ip_forward=1 is the normal, expected state on a Docker host — Docker
// requires it for container networking. Flagging it unconditionally would
// be a false positive on most of this product's actual target audience.

type sysctlIPForward struct{}

func (c sysctlIPForward) ID() string       { return "sysctl-ip-forward" }
func (c sysctlIPForward) Category() string { return "sysctl" }
func (c sysctlIPForward) Title() string    { return "net.ipv4.ip_forward enabled unexpectedly" }

func (c sysctlIPForward) Run(rc *RunContext) report.Finding {
	val, err := readSysctl("net.ipv4.ip_forward")
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	if val != "1" {
		return finding(c, report.StatusPass, "net.ipv4.ip_forward = "+val)
	}
	if dockerInstalled() {
		return finding(c, report.StatusInfo, "net.ipv4.ip_forward = 1 (expected — Docker requires IP forwarding for container networking)")
	}
	return finding(c, report.StatusFail, "net.ipv4.ip_forward = 1 with no Docker installation found to explain it")
}

// --- sysctl-icmp-redirects ------------------------------------------------

type sysctlICMPRedirects struct{}

func (c sysctlICMPRedirects) ID() string       { return "sysctl-icmp-redirects" }
func (c sysctlICMPRedirects) Category() string { return "sysctl" }
func (c sysctlICMPRedirects) Title() string    { return "ICMP redirects accepted" }

func (c sysctlICMPRedirects) Run(rc *RunContext) report.Finding {
	val, err := readSysctl("net.ipv4.conf.all.accept_redirects")
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	if val == "1" {
		return finding(c, report.StatusFail, "net.ipv4.conf.all.accept_redirects = 1")
	}
	return finding(c, report.StatusPass, "net.ipv4.conf.all.accept_redirects = "+val)
}

// --- sysctl-syn-cookies -----------------------------------------------------

type sysctlSynCookies struct{}

func (c sysctlSynCookies) ID() string       { return "sysctl-syn-cookies" }
func (c sysctlSynCookies) Category() string { return "sysctl" }
func (c sysctlSynCookies) Title() string    { return "SYN cookies disabled" }

func (c sysctlSynCookies) Run(rc *RunContext) report.Finding {
	val, err := readSysctl("net.ipv4.tcp_syncookies")
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	if val == "0" {
		return finding(c, report.StatusFail, "net.ipv4.tcp_syncookies = 0")
	}
	return finding(c, report.StatusPass, "net.ipv4.tcp_syncookies = "+val)
}

// --- sysctl-aslr-disabled -----------------------------------------------------
// 1 (partial) and 2 (full) both provide meaningful ASLR protection — only 0
// disables it entirely.

type sysctlASLRDisabled struct{}

func (c sysctlASLRDisabled) ID() string       { return "sysctl-aslr-disabled" }
func (c sysctlASLRDisabled) Category() string { return "sysctl" }
func (c sysctlASLRDisabled) Title() string    { return "kernel.randomize_va_space disabled" }

func (c sysctlASLRDisabled) Run(rc *RunContext) report.Finding {
	val, err := readSysctl("kernel.randomize_va_space")
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	if val == "0" {
		return finding(c, report.StatusFail, "kernel.randomize_va_space = 0 (ASLR disabled)")
	}
	return finding(c, report.StatusPass, "kernel.randomize_va_space = "+val)
}

// --- core-dumps-world-readable -----------------------------------------------
// fs.suid_dumpable = 1 ("debug" mode) is the setting most likely to result
// in core dumps landing somewhere readable enough to leak secrets from a
// crashed process's memory. CIS-style guidance recommends 0.

type coreDumpsWorldReadable struct{}

func (c coreDumpsWorldReadable) ID() string       { return "core-dumps-world-readable" }
func (c coreDumpsWorldReadable) Category() string { return "sysctl" }
func (c coreDumpsWorldReadable) Title() string    { return "Core dumps readable by other users" }

func (c coreDumpsWorldReadable) Run(rc *RunContext) report.Finding {
	val, err := readSysctl("fs.suid_dumpable")
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	if val == "1" {
		return finding(c, report.StatusFail, "fs.suid_dumpable = 1 (debug mode — core dumps are not protected)")
	}
	return finding(c, report.StatusPass, "fs.suid_dumpable = "+val)
}

// --- tmp-noexec -----------------------------------------------------------
// A positive control, per the catalog: pass/fail, not just informational.
// If /tmp or /var/tmp aren't separate mounts at all, they inherit the root
// filesystem's exec permission — which can't be restricted independently —
// so that counts as a fail too, not merely "not applicable".

func mountOptions(mountPoint string) (opts []string, found bool, err error) {
	content, err := os.ReadFile("/proc/mounts")
	if err != nil {
		return nil, false, err
	}
	for _, line := range strings.Split(string(content), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		if fields[1] == mountPoint {
			return strings.Split(fields[3], ","), true, nil
		}
	}
	return nil, false, nil
}

type tmpNoexec struct{}

func (c tmpNoexec) ID() string       { return "tmp-noexec" }
func (c tmpNoexec) Category() string { return "sysctl" }
func (c tmpNoexec) Title() string    { return "/tmp and /var/tmp not mounted noexec" }

func (c tmpNoexec) Run(rc *RunContext) report.Finding {
	var problems []string
	for _, mp := range []string{"/tmp", "/var/tmp"} {
		opts, found, err := mountOptions(mp)
		if err != nil {
			return finding(c, report.StatusError, err.Error())
		}
		if !found {
			problems = append(problems, mp+" (not a separate mount — can't be restricted independently of the root filesystem)")
			continue
		}
		if !slices.Contains(opts, "noexec") {
			problems = append(problems, mp+" (mounted without noexec)")
		}
	}
	if len(problems) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("not protected against drive-by script/binary execution: %v", problems))
	}
	return finding(c, report.StatusPass, "/tmp and /var/tmp are both separate mounts with noexec set")
}
