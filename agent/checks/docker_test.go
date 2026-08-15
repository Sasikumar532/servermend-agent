package checks

import "testing"

func TestIsUnpinnedImage(t *testing.T) {
	cases := []struct {
		image string
		want  bool
	}{
		{"nginx:latest", true},
		{"nginx", true},
		{"nginx:1.25.3", false},
		{"myregistry.com:5000/app:1.0", false},
		{"myregistry.com:5000/app", true}, // port in the registry host, no image tag — must not be mistaken for one
		{"app@sha256:abcdef1234567890", false},
		{"app:1.0@sha256:abcdef1234567890", false},
	}
	for _, tc := range cases {
		if got := isUnpinnedImage(tc.image); got != tc.want {
			t.Errorf("isUnpinnedImage(%q) = %v, want %v", tc.image, got, tc.want)
		}
	}
}
