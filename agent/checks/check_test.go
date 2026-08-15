package checks

import "testing"

// TestNoDuplicateCheckIDs guards against the one mistake that's easy to
// make across 8+ check files and impossible for the compiler to catch: two
// checks accidentally sharing an ID. The backend keys everything off
// Finding.ID, so a collision would silently conflate two unrelated checks'
// results.
func TestNoDuplicateCheckIDs(t *testing.T) {
	seen := make(map[string]bool)
	for _, c := range All() {
		id := c.ID()
		if id == "" {
			t.Errorf("check %T has an empty ID", c)
			continue
		}
		if seen[id] {
			t.Errorf("duplicate check ID: %q", id)
		}
		seen[id] = true
	}
	if len(seen) == 0 {
		t.Fatal("All() returned no checks — registry init() wiring may be broken")
	}
}
