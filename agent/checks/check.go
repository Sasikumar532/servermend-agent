// Package checks holds one file per category (ssh, firewall, docker, persistence, ...).
// Each check registers itself via init() so cmd/servermend-agent only needs to
// import the package to run everything registered in it.
package checks

import (
	"github.com/servermend/agent/baseline"
	"github.com/servermend/agent/report"
)

// RunContext carries the state a check may need beyond its own logic —
// currently just the baseline. Checks that don't diff against a baseline
// simply ignore it.
type RunContext struct {
	// Baseline is the previously captured state. Nil only if CaptureMode is
	// true (no baseline exists yet, or --update-baseline was passed).
	Baseline *baseline.Baseline

	// CaptureMode is true on a server's first run, or when --update-baseline
	// is explicitly passed. It controls whether a baseline-aware check
	// diffs against Baseline or just records what it observes — see
	// NewBaseline below, which every baseline-aware check populates
	// regardless of CaptureMode.
	CaptureMode bool

	// NewBaseline accumulates what each baseline-aware check currently
	// observes, on every run — not just during CaptureMode. main.go writes
	// it to the local baseline file only when CaptureMode is true (so the
	// write is atomic across all contributing checks), but always pushes
	// it to the backend afterward (best-effort — see baseline.Client),
	// which is how server-side drift detection stays current on ordinary,
	// non-capture runs too.
	NewBaseline *baseline.Baseline
}

// Check is a single, independently runnable audit check.
type Check interface {
	ID() string       // stable, unique — e.g. "redis-unauthenticated-exposed"
	Category() string // e.g. "database", "docker", "persistence"
	Title() string    // human-readable summary
	Run(rc *RunContext) report.Finding
}

var registry []Check

// Register adds a check to the set run by RunAll. Called from each check
// file's init().
func Register(c Check) {
	registry = append(registry, c)
}

// All returns every registered check.
func All() []Check {
	return registry
}

// finding is a small helper so individual checks don't repeat ID/Category/Title wiring.
func finding(c Check, status report.Status, detail string) report.Finding {
	return report.Finding{
		ID:       c.ID(),
		Category: c.Category(),
		Title:    c.Title(),
		Status:   status,
		Detail:   detail,
	}
}
