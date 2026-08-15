package checks

import "testing"

func TestIsLikelyPrivateKeyName(t *testing.T) {
	cases := []struct {
		name string
		want bool
	}{
		{"id_rsa", true},
		{"id_ed25519", true},
		{"id_rsa.pub", false}, // caller filters .pub before calling this, but it shouldn't match anyway
		{"id_rsa-backup", true},
		{"authorized_keys", false},
		{"known_hosts", false},
		{"config", false},
	}
	for _, tc := range cases {
		if got := isLikelyPrivateKeyName(tc.name); got != tc.want {
			t.Errorf("isLikelyPrivateKeyName(%q) = %v, want %v", tc.name, got, tc.want)
		}
	}
}
