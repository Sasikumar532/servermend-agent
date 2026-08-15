// Package baseline persists the "known good" state that persistence and
// drift checks diff against. A baseline is captured automatically on the
// first run and is only ever replaced on an explicit re-capture — never
// silently, even when the agent detects drift. This file is the v0,
// local-disk stand-in for a baseline held by the backend: same shape, same
// semantics, so moving baseline ownership server-side later (once B1 exists)
// doesn't change how any check is written.
package baseline

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Baseline holds the observed state each persistence check diffs against.
// Every slice is a set of opaque, comparable strings — each check owns its
// own encoding (e.g. "path:sha256(content)" for a file, "user:fingerprint"
// for a key) so Diff can stay generic.
type Baseline struct {
	CapturedAt        time.Time `json:"captured_at"`
	AuthorizedKeys    []string  `json:"authorized_keys"`     // "user:sha256(key)" per authorized key
	SystemCronEntries []string  `json:"system_cron_entries"` // "path:sha256(content)" under /etc/cron*
	UserCronEntries   []string  `json:"user_cron_entries"`   // "user:sha256(content)" per-user crontab
	SystemdUnits      []string  `json:"systemd_units"`       // enabled .service/.timer unit names
	SuidBinaries      []string  `json:"suid_binaries"`       // "path:mode" for SUID/SGID files
}

// Store reads and writes a single Baseline as JSON on local disk.
type Store struct {
	Path string
}

func NewStore(path string) *Store {
	return &Store{Path: path}
}

// Load reads the baseline from disk. found is false (with a nil error) when
// no baseline has been captured yet — that is the expected state on a
// server's first scan, not an error condition.
func (s *Store) Load() (*Baseline, bool, error) {
	data, err := os.ReadFile(s.Path)
	if os.IsNotExist(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("read baseline: %w", err)
	}
	var b Baseline
	if err := json.Unmarshal(data, &b); err != nil {
		return nil, false, fmt.Errorf("parse baseline %s: %w", s.Path, err)
	}
	return &b, true, nil
}

// Save writes b to disk, creating the parent directory if needed. Callers
// must only invoke this on first capture or an explicit --update-baseline
// run — never automatically when a check observes drift.
func (s *Store) Save(b *Baseline) error {
	if err := os.MkdirAll(filepath.Dir(s.Path), 0o750); err != nil {
		return fmt.Errorf("create baseline dir: %w", err)
	}
	data, err := json.MarshalIndent(b, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal baseline: %w", err)
	}
	if err := os.WriteFile(s.Path, data, 0o640); err != nil {
		return fmt.Errorf("write baseline: %w", err)
	}
	return nil
}

// Diff returns every entry in observed that is not present in known — the
// set a check should report as new/changed since the baseline.
func Diff(known, observed []string) []string {
	knownSet := make(map[string]bool, len(known))
	for _, k := range known {
		knownSet[k] = true
	}
	var newItems []string
	for _, o := range observed {
		if !knownSet[o] {
			newItems = append(newItems, o)
		}
	}
	return newItems
}

// Fingerprint returns a short, stable hash for content that would otherwise
// be too large or too sensitive to store verbatim in the baseline file
// (key material, file contents).
func Fingerprint(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}
