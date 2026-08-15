package baseline

import (
	"path/filepath"
	"testing"
	"time"
)

func TestDiff(t *testing.T) {
	cases := []struct {
		name     string
		known    []string
		observed []string
		want     []string
	}{
		{"no changes", []string{"a", "b"}, []string{"a", "b"}, nil},
		{"new item", []string{"a"}, []string{"a", "b"}, []string{"b"}},
		{"empty known", nil, []string{"a"}, []string{"a"}},
		{"removed item not flagged", []string{"a", "b"}, []string{"a"}, nil},
		{"reordered, unchanged", []string{"a", "b"}, []string{"b", "a"}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Diff(tc.known, tc.observed)
			if !equalStringSlices(got, tc.want) {
				t.Errorf("Diff(%v, %v) = %v, want %v", tc.known, tc.observed, got, tc.want)
			}
		})
	}
}

func equalStringSlices(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestFingerprint(t *testing.T) {
	f1 := Fingerprint([]byte("hello"))
	f2 := Fingerprint([]byte("hello"))
	f3 := Fingerprint([]byte("world"))
	if f1 != f2 {
		t.Errorf("Fingerprint not deterministic: %q != %q", f1, f2)
	}
	if f1 == f3 {
		t.Error("Fingerprint collision for different content")
	}
	if len(f1) != 64 { // sha256 hex = 64 chars
		t.Errorf("Fingerprint length = %d, want 64", len(f1))
	}
}

func TestStoreRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "baseline.json")
	store := NewStore(path)

	_, found, err := store.Load()
	if err != nil {
		t.Fatalf("Load on missing file: %v", err)
	}
	if found {
		t.Fatal("Load reported found=true for a baseline that was never captured")
	}

	want := &Baseline{
		CapturedAt:     time.Now().UTC().Truncate(time.Second),
		AuthorizedKeys: []string{"alice:abc123"},
		SystemdUnits:   []string{"nginx.service"},
	}
	if err := store.Save(want); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, found, err := store.Load()
	if err != nil {
		t.Fatalf("Load after Save: %v", err)
	}
	if !found {
		t.Fatal("Load reported found=false right after Save")
	}
	if !got.CapturedAt.Equal(want.CapturedAt) {
		t.Errorf("CapturedAt = %v, want %v", got.CapturedAt, want.CapturedAt)
	}
	if len(got.AuthorizedKeys) != 1 || got.AuthorizedKeys[0] != "alice:abc123" {
		t.Errorf("AuthorizedKeys = %v", got.AuthorizedKeys)
	}
	if len(got.SystemdUnits) != 1 || got.SystemdUnits[0] != "nginx.service" {
		t.Errorf("SystemdUnits = %v", got.SystemdUnits)
	}
}
