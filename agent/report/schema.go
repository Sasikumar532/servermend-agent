// Package report defines the wire format the agent sends to the ServerMend backend.
package report

import "time"

// Status is the outcome of a single check. Severity is intentionally NOT part of
// this package: severity, rationale, and fix commands live in the backend's
// versioned CheckDefinition collection so they can be tuned without shipping a
// new agent release. The agent only ever reports what it observed.
type Status string

const (
	StatusPass  Status = "pass"  // check ran, condition is fine
	StatusFail  Status = "fail"  // check ran, condition failed
	StatusInfo  Status = "info"  // informational, not a pass/fail (e.g. open-ports-scan)
	StatusError Status = "error" // check could not run (missing binary, permission denied, ...)
)

// Finding is the result of a single check.
type Finding struct {
	ID       string `json:"id"`       // stable, unique — e.g. "ssh-root-login"
	Category string `json:"category"` // e.g. "ssh", "docker", "persistence"
	Title    string `json:"title"`    // human-readable summary, for local/dry-run display
	Status   Status `json:"status"`
	Detail   string `json:"detail"` // what was actually found
}

// Report is the full payload for a single agent run.
type Report struct {
	ServerID     string    `json:"server_id"`
	AgentVersion string    `json:"agent_version"`
	Findings     []Finding `json:"findings"`
	Timestamp    time.Time `json:"timestamp"`
}
