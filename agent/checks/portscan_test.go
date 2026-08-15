package checks

import (
	"encoding/hex"
	"fmt"
	"net"
	"strings"
	"testing"
)

// encodeIPv4Hex and encodeIPv6Hex mirror the *encoding* side of what the
// kernel writes to /proc/net/tcp{,6} — the exact inverse of
// parseLocalAddress's decode logic. Round-tripping through them (rather
// than hand-typing hex strings, which is easy to get subtly wrong) is what
// actually proves the byte-order handling is correct.

func encodeIPv4Hex(ip net.IP) string {
	v4 := ip.To4()
	return strings.ToUpper(fmt.Sprintf("%02x%02x%02x%02x", v4[3], v4[2], v4[1], v4[0]))
}

func encodeIPv6Hex(ip net.IP) string {
	v16 := ip.To16()
	kernel := make([]byte, 16)
	for word := 0; word < 4; word++ {
		for b := 0; b < 4; b++ {
			kernel[word*4+b] = v16[word*4+(3-b)]
		}
	}
	return strings.ToUpper(hex.EncodeToString(kernel))
}

func TestParseLocalAddressIPv4(t *testing.T) {
	cases := []struct {
		ip   string
		port uint16
	}{
		{"127.0.0.1", 8080},
		{"0.0.0.0", 22},
		{"10.0.0.5", 6379},
	}
	for _, tc := range cases {
		want := net.ParseIP(tc.ip).To4()
		field := fmt.Sprintf("%s:%04X", encodeIPv4Hex(want), tc.port)
		gotIP, gotPort, err := parseLocalAddress(field, false)
		if err != nil {
			t.Fatalf("parseLocalAddress(%q): %v", field, err)
		}
		if !gotIP.Equal(want) {
			t.Errorf("ip = %v, want %v", gotIP, want)
		}
		if gotPort != tc.port {
			t.Errorf("port = %d, want %d", gotPort, tc.port)
		}
	}
}

func TestParseLocalAddressIPv6(t *testing.T) {
	cases := []struct {
		ip   string
		port uint16
	}{
		{"::1", 22},
		{"::", 6379},
		{"fe80::1", 443},
	}
	for _, tc := range cases {
		want := net.ParseIP(tc.ip).To16()
		field := fmt.Sprintf("%s:%04X", encodeIPv6Hex(want), tc.port)
		gotIP, gotPort, err := parseLocalAddress(field, true)
		if err != nil {
			t.Fatalf("parseLocalAddress(%q): %v", field, err)
		}
		if !gotIP.Equal(want) {
			t.Errorf("ip = %v, want %v", gotIP, want)
		}
		if gotPort != tc.port {
			t.Errorf("port = %d, want %d", gotPort, tc.port)
		}
	}
}

func TestParseProcNetTCPReader(t *testing.T) {
	listening := net.ParseIP("0.0.0.0").To4()
	closed := net.ParseIP("127.0.0.1").To4()
	content := "  sl  local_address rem_address   st\n" +
		fmt.Sprintf(" 0: %s:1F90 00000000:0000 %s\n", encodeIPv4Hex(listening), tcpListen) +
		fmt.Sprintf(" 1: %s:0016 00000000:0000 06\n", encodeIPv4Hex(closed)) // 06 = TCP_CLOSE, must be filtered out

	sockets, err := parseProcNetTCPReader(strings.NewReader(content), false)
	if err != nil {
		t.Fatalf("parseProcNetTCPReader: %v", err)
	}
	if len(sockets) != 1 {
		t.Fatalf("got %d socket(s), want 1 (non-LISTEN rows must be filtered out): %+v", len(sockets), sockets)
	}
	if sockets[0].Port != 8080 || !sockets[0].LocalIP.Equal(listening) {
		t.Errorf("socket = %+v, want 0.0.0.0:8080", sockets[0])
	}
}

func TestPubliclyBoundAddrs(t *testing.T) {
	sockets := []Socket{
		{LocalIP: net.ParseIP("127.0.0.1"), Port: 6379},
		{LocalIP: net.ParseIP("0.0.0.0"), Port: 6379},
		{LocalIP: net.ParseIP("10.0.0.5"), Port: 6379},
		{LocalIP: net.ParseIP("::1"), Port: 6379},
		{LocalIP: net.ParseIP("0.0.0.0"), Port: 5432}, // different port — must not appear
	}
	addrs := PubliclyBoundAddrs(sockets, 6379)
	if len(addrs) != 2 {
		t.Fatalf("got %v, want 2 non-loopback addresses for port 6379", addrs)
	}
	for _, a := range addrs {
		if a == "127.0.0.1" || a == "::1" {
			t.Errorf("loopback address %q should have been excluded", a)
		}
	}
}
