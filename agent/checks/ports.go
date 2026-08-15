package checks

import (
	"fmt"
	"sort"

	"github.com/servermend/agent/report"
)

func init() {
	Register(openPortsScan{})
}

// openPortsScan is informational (— severity in the catalog) and feeds
// drift detection server-side: the backend baselines the listening-port set
// per server and flags new ports the same way it flags new cron entries.
type openPortsScan struct{}

func (c openPortsScan) ID() string       { return "open-ports-scan" }
func (c openPortsScan) Category() string { return "network" }
func (c openPortsScan) Title() string    { return "Enumerate listening ports and bound interfaces" }

func (c openPortsScan) Run(rc *RunContext) report.Finding {
	sockets, err := ListeningSockets()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	if len(sockets) == 0 {
		return finding(c, report.StatusInfo, "no listening TCP sockets found")
	}

	ports := make(map[uint16][]string)
	for _, s := range sockets {
		ports[s.Port] = append(ports[s.Port], s.LocalIP.String())
	}
	var keys []uint16
	for p := range ports {
		keys = append(keys, p)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })

	detail := ""
	for i, p := range keys {
		if i > 0 {
			detail += "; "
		}
		detail += fmt.Sprintf("%d <- %v", p, ports[p])
	}
	return finding(c, report.StatusInfo, detail)
}
