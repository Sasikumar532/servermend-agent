// Anomaly/process-based detection. The catalog frames this category as
// "ties into continuous monitoring" — the honest read is that
// sustained-high-cpu and high-outbound-connection-count really do benefit
// from a daemon watching a trend over time, which the agent's current
// one-shot scan-and-exit model doesn't provide. Rather than block all four
// checks on that architecture decision, the two that are genuinely
// point-in-time facts (a miner binary running right now, an established
// connection to a mining-pool port right now) are implemented for real
// below. The other two are implemented as single-snapshot approximations —
// clearly labeled as such in their Detail text — good enough to be useful,
// not good enough to replace a real daemon mode if that gets built later.
package checks

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/servermend/agent/report"
)

func init() {
	Register(minerProcessSignature{})
	Register(outboundMiningPoolConnection{})
	Register(sustainedHighCPUUnexpectedProcess{})
	Register(highOutboundConnectionCount{})
}

// --- miner-process-signature -------------------------------------------
// A genuine point-in-time fact — no daemon needed.

var minerSignatures = []string{
	"xmrig", "xmr-stak", "cpuminer", "minerd", "ccminer", "ethminer",
	"cgminer", "bfgminer", "nheqminer", "t-rex", "phoenixminer",
	"nanominer", "teamredminer", "gminer", "lolminer", "srbminer", "nbminer",
}

func collectMinerProcesses() ([]string, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, err
	}
	var hits []string
	for _, e := range entries {
		pid, err := strconv.Atoi(e.Name())
		if err != nil || !e.IsDir() {
			continue
		}
		comm, _ := os.ReadFile(fmt.Sprintf("/proc/%d/comm", pid))
		name := strings.ToLower(strings.TrimSpace(string(comm)))

		cmdlineRaw, _ := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
		cmdline := strings.ToLower(strings.ReplaceAll(string(cmdlineRaw), "\x00", " "))

		for _, sig := range minerSignatures {
			if strings.Contains(name, sig) || strings.Contains(cmdline, sig) {
				hits = append(hits, fmt.Sprintf("pid %d (%s)", pid, name))
				break
			}
		}
	}
	return hits, nil
}

type minerProcessSignature struct{}

func (c minerProcessSignature) ID() string       { return "miner-process-signature" }
func (c minerProcessSignature) Category() string { return "anomaly" }
func (c minerProcessSignature) Title() string {
	return "Running process matches known miner binary signatures"
}

func (c minerProcessSignature) Run(rc *RunContext) report.Finding {
	hits, err := collectMinerProcesses()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("process(es) matching known miner signatures: %v", hits))
	}
	return finding(c, report.StatusPass, "no running process matches known miner binary signatures")
}

// --- outbound-mining-pool-connection ---------------------------------------
// Port-based heuristic (common Stratum protocol ports) — not a live
// threat-intel/domain feed. A real deployment would want the backend to
// pull a maintained IP/domain blocklist; this is what's checkable from the
// host alone.

var miningPoolPorts = map[uint16]bool{
	3333: true, 4444: true, 5555: true, 7777: true, 8080: true,
	9999: true, 14444: true, 14433: true, 20535: true, 45700: true,
}

type outboundMiningPoolConnection struct{}

func (c outboundMiningPoolConnection) ID() string       { return "outbound-mining-pool-connection" }
func (c outboundMiningPoolConnection) Category() string { return "anomaly" }
func (c outboundMiningPoolConnection) Title() string {
	return "Established connections to known mining-pool ports"
}

func (c outboundMiningPoolConnection) Run(rc *RunContext) report.Finding {
	conns, err := EstablishedConnections()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	seen := map[string]bool{}
	var hits []string
	for _, conn := range conns {
		if !miningPoolPorts[conn.RemotePort] {
			continue
		}
		key := fmt.Sprintf("%s:%d", conn.RemoteIP, conn.RemotePort)
		if !seen[key] {
			seen[key] = true
			hits = append(hits, key)
		}
	}
	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf(
			"established connection(s) to common mining-pool (Stratum) ports — port-based heuristic, not a live threat feed: %v", hits))
	}
	return finding(c, report.StatusPass, "no established connections to common mining-pool ports")
}

// --- sustained-high-cpu-unexpected-process -----------------------------------
// Single-snapshot approximation: average CPU% since the process started,
// computed from /proc/[pid]/stat + /proc/uptime. This can't catch a spike
// that already ended, and can't distinguish "sustained" from "just started
// and immediately pegged the CPU" beyond the minAgeSeconds floor below — a
// real daemon sampling over a window would be strictly better. Reported as
// StatusInfo, not StatusFail: the catalog frames this as feeding an AI
// triage layer ("miner, backup job, or traffic burst?"), not as a
// standalone verdict.

const clockTicksPerSecond = 100.0 // USER_HZ — effectively always 100 on modern Linux
const highCPUThreshold = 80.0     // percent, average since process start
const minAgeSeconds = 60.0        // ignore processes too young for "sustained" to mean anything

func systemUptimeSeconds() (float64, error) {
	content, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0, err
	}
	fields := strings.Fields(string(content))
	if len(fields) == 0 {
		return 0, fmt.Errorf("empty /proc/uptime")
	}
	return strconv.ParseFloat(fields[0], 64)
}

// processCPUStats parses /proc/[pid]/stat by hand rather than a naive
// strings.Fields split — the comm field (2nd) is wrapped in parens and can
// itself contain spaces, so field indices only line up correctly once
// counted from the last ')'.
func processCPUStats(pid int, uptimeSeconds float64) (pctCPU, ageSeconds float64, comm string, err error) {
	content, readErr := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if readErr != nil {
		return 0, 0, "", readErr
	}
	line := string(content)
	openParen := strings.Index(line, "(")
	closeParen := strings.LastIndex(line, ")")
	if openParen == -1 || closeParen == -1 || closeParen < openParen {
		return 0, 0, "", fmt.Errorf("malformed /proc/%d/stat", pid)
	}
	comm = line[openParen+1 : closeParen]

	rest := strings.Fields(line[closeParen+1:])
	if len(rest) < 20 {
		return 0, 0, "", fmt.Errorf("unexpected field count in /proc/%d/stat", pid)
	}
	// rest[0] is field 3 (state), so field 14 (utime) is rest[11], field 15
	// (stime) is rest[12], field 22 (starttime) is rest[19].
	utime, _ := strconv.ParseInt(rest[11], 10, 64)
	stime, _ := strconv.ParseInt(rest[12], 10, 64)
	starttime, _ := strconv.ParseInt(rest[19], 10, 64)

	ageSeconds = uptimeSeconds - float64(starttime)/clockTicksPerSecond
	if ageSeconds <= 0 {
		return 0, ageSeconds, comm, nil
	}
	cpuSeconds := float64(utime+stime) / clockTicksPerSecond
	pctCPU = (cpuSeconds / ageSeconds) * 100
	return pctCPU, ageSeconds, comm, nil
}

type sustainedHighCPUUnexpectedProcess struct{}

func (c sustainedHighCPUUnexpectedProcess) ID() string {
	return "sustained-high-cpu-unexpected-process"
}
func (c sustainedHighCPUUnexpectedProcess) Category() string { return "anomaly" }
func (c sustainedHighCPUUnexpectedProcess) Title() string {
	return "Sustained high CPU from a process outside the expected app set"
}

func (c sustainedHighCPUUnexpectedProcess) Run(rc *RunContext) report.Finding {
	uptime, err := systemUptimeSeconds()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
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
		pct, age, comm, statErr := processCPUStats(pid, uptime)
		if statErr != nil || age < minAgeSeconds {
			continue
		}
		if pct >= highCPUThreshold {
			hits = append(hits, fmt.Sprintf("pid %d (%s): %.0f%% avg CPU over %.0fs", pid, comm, pct, age))
		}
	}
	if len(hits) > 0 {
		return finding(c, report.StatusInfo, fmt.Sprintf(
			"process(es) with high average CPU since start (single-snapshot estimate, not a sustained-window measurement): %v", hits))
	}
	return finding(c, report.StatusPass, "no process shows high average CPU since start")
}

// --- high-outbound-connection-count ------------------------------------------
// Also a single snapshot — a real trend (rising over the last hour) would
// be a stronger signal than a one-time count, but the count itself is at
// least a real, honestly-labeled fact.

const highConnectionCountThreshold = 200

type highOutboundConnectionCount struct{}

func (c highOutboundConnectionCount) ID() string       { return "high-outbound-connection-count" }
func (c highOutboundConnectionCount) Category() string { return "anomaly" }
func (c highOutboundConnectionCount) Title() string {
	return "Unusually high number of established outbound connections"
}

func (c highOutboundConnectionCount) Run(rc *RunContext) report.Finding {
	conns, err := EstablishedConnections()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	if len(conns) > highConnectionCountThreshold {
		return finding(c, report.StatusFail, fmt.Sprintf(
			"%d established outbound connection(s) (threshold %d, snapshot at scan time) — possible botnet/DDoS participation, or just a busy proxy",
			len(conns), highConnectionCountThreshold))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("%d established outbound connection(s)", len(conns)))
}
