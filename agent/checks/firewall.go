package checks

import (
	"fmt"
	"os/exec"
	"sort"
	"strings"

	"github.com/servermend/agent/report"
)

func init() {
	Register(firewallActive{})
	Register(firewallDefaultPolicy{})
	Register(firewallExposedAdminPorts{})
}

// --- firewall-active -----------------------------------------------------

type firewallActive struct{}

func (c firewallActive) ID() string       { return "firewall-active" }
func (c firewallActive) Category() string { return "firewall" }
func (c firewallActive) Title() string    { return "UFW/iptables/nftables not active at all" }

func (c firewallActive) Run(rc *RunContext) report.Finding {
	if active, detail := ufwActive(); active {
		return finding(c, report.StatusPass, detail)
	}
	if active, detail := nftablesActive(); active {
		return finding(c, report.StatusPass, detail)
	}
	if active, detail := iptablesActive(); active {
		return finding(c, report.StatusPass, detail)
	}
	return finding(c, report.StatusFail, "no active firewall found (checked ufw, nftables, iptables)")
}

func ufwActive() (bool, string) {
	out, err := exec.Command("ufw", "status").Output()
	if err != nil {
		return false, ""
	}
	if strings.Contains(string(out), "Status: active") {
		return true, "ufw is active"
	}
	return false, ""
}

func nftablesActive() (bool, string) {
	out, err := exec.Command("nft", "list", "ruleset").Output()
	if err != nil {
		return false, ""
	}
	if strings.TrimSpace(string(out)) == "" {
		return false, ""
	}
	return true, "nftables has an active ruleset"
}

func iptablesActive() (bool, string) {
	out, err := exec.Command("iptables", "-S").Output()
	if err != nil {
		return false, ""
	}
	text := string(out)
	lines := strings.Split(strings.TrimSpace(text), "\n")
	// A handful of default-ACCEPT policy lines with nothing else isn't
	// meaningfully "active" — require at least one real rule.
	if len(lines) <= 3 && !strings.Contains(text, "DROP") && !strings.Contains(text, "REJECT") {
		return false, ""
	}
	return true, "iptables has active rules"
}

// --- firewall-default-policy -----------------------------------------------

type firewallDefaultPolicy struct{}

func (c firewallDefaultPolicy) ID() string       { return "firewall-default-policy" }
func (c firewallDefaultPolicy) Category() string { return "firewall" }
func (c firewallDefaultPolicy) Title() string {
	return "Default inbound policy is ACCEPT rather than DENY"
}

func (c firewallDefaultPolicy) Run(rc *RunContext) report.Finding {
	out, err := exec.Command("iptables", "-S", "INPUT").Output()
	if err != nil {
		return finding(c, report.StatusError, fmt.Sprintf("run iptables: %v (ufw/nftables-only hosts aren't covered by this check yet)", err))
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) == 0 || lines[0] == "" {
		return finding(c, report.StatusError, "no output from iptables -S INPUT")
	}
	if strings.Contains(lines[0], "-P INPUT ACCEPT") {
		return finding(c, report.StatusFail, "default INPUT policy is ACCEPT")
	}
	return finding(c, report.StatusPass, strings.TrimSpace(lines[0]))
}

// --- firewall-exposed-admin-ports -------------------------------------------
// Bind-address based, like the database exposure checks — whether a bound
// port is actually internet-reachable additionally depends on upstream
// network ACLs (cloud security groups) the agent can't see from the host.

var adminPorts = map[uint16]string{
	22:    "ssh",
	2375:  "docker",
	5432:  "postgres",
	3306:  "mysql",
	6379:  "redis",
	27017: "mongodb",
}

type firewallExposedAdminPorts struct{}

func (c firewallExposedAdminPorts) ID() string       { return "firewall-exposed-admin-ports" }
func (c firewallExposedAdminPorts) Category() string { return "firewall" }
func (c firewallExposedAdminPorts) Title() string {
	return "Admin ports open to 0.0.0.0/0"
}

func (c firewallExposedAdminPorts) Run(rc *RunContext) report.Finding {
	sockets, err := ListeningSockets()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}

	var ports []uint16
	for p := range adminPorts {
		ports = append(ports, p)
	}
	sort.Slice(ports, func(i, j int) bool { return ports[i] < ports[j] })

	var exposed []string
	for _, p := range ports {
		if addrs := PubliclyBoundAddrs(sockets, p); len(addrs) > 0 {
			exposed = append(exposed, fmt.Sprintf("%s(%d) <- %v", adminPorts[p], p, addrs))
		}
	}
	if len(exposed) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("admin port(s) bound to a non-loopback interface: %v", exposed))
	}
	return finding(c, report.StatusPass, "no admin ports bound to a non-loopback interface")
}
