package checks

import (
	"strings"
	"testing"
)

func TestParsePasswd(t *testing.T) {
	content := "root:x:0:0:root:/root:/bin/bash\n" +
		"daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\n" +
		"deploy:x:1000:1000:deploy:/home/deploy:/bin/bash\n" +
		"nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin\n" +
		"postgres:x:999:999::/var/lib/postgresql:/bin/false\n"

	users, err := parsePasswd(strings.NewReader(content))
	if err != nil {
		t.Fatalf("parsePasswd: %v", err)
	}

	want := map[string]string{"root": "/root", "deploy": "/home/deploy"}
	if len(users) != len(want) {
		t.Fatalf("got %d user(s), want %d: %+v", len(users), len(want), users)
	}
	for _, u := range users {
		homeDir, ok := want[u.Username]
		if !ok {
			t.Errorf("unexpected user in results: %q (system/service accounts and nologin shells should be excluded)", u.Username)
			continue
		}
		if u.HomeDir != homeDir {
			t.Errorf("user %q home = %q, want %q", u.Username, u.HomeDir, homeDir)
		}
	}
}

func TestIsNologinShell(t *testing.T) {
	cases := map[string]bool{
		"/bin/bash":         false,
		"/bin/zsh":          false,
		"/usr/sbin/nologin": true,
		"/sbin/nologin":     true,
		"/bin/false":        true,
		"/usr/bin/false":    true,
		"":                  true,
	}
	for shell, want := range cases {
		if got := isNologinShell(shell); got != want {
			t.Errorf("isNologinShell(%q) = %v, want %v", shell, got, want)
		}
	}
}
