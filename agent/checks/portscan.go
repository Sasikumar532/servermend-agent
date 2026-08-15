package checks

import (
	"bufio"
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"os"
	"strconv"
	"strings"
)

// tcpListen is the /proc/net/tcp{,6} "st" value for LISTEN.
const tcpListen = "0A"

// Socket is a single listening TCP socket, as reported by the kernel.
type Socket struct {
	LocalIP net.IP
	Port    uint16
}

// ListeningSockets reads /proc/net/tcp and /proc/net/tcp6 directly rather
// than shelling out to `ss`, so parsing doesn't depend on which tools happen
// to be installed. It underlies open-ports-scan and every exposure check
// (database, docker) that needs to know what a port is bound to.
func ListeningSockets() ([]Socket, error) {
	var sockets []Socket

	v4, err := parseProcNetTCP("/proc/net/tcp", false)
	if err != nil {
		return nil, fmt.Errorf("read /proc/net/tcp: %w", err)
	}
	sockets = append(sockets, v4...)

	// IPv6 may be disabled on the host — that's not a reason to fail the
	// whole scan, just skip it.
	if v6, err := parseProcNetTCP("/proc/net/tcp6", true); err == nil {
		sockets = append(sockets, v6...)
	}

	return sockets, nil
}

func parseProcNetTCP(path string, isV6 bool) ([]Socket, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return parseProcNetTCPReader(f, isV6)
}

// parseProcNetTCPReader is split out from parseProcNetTCP so the byte-order
// decoding logic is testable against known /proc/net/tcp-format lines
// without depending on the real file, which only exists on Linux.
func parseProcNetTCPReader(r io.Reader, isV6 bool) ([]Socket, error) {
	var sockets []Socket
	scanner := bufio.NewScanner(r)
	first := true
	for scanner.Scan() {
		if first {
			first = false // header line
			continue
		}
		fields := strings.Fields(scanner.Text())
		if len(fields) < 4 {
			continue
		}
		if fields[3] != tcpListen {
			continue
		}
		ip, port, err := parseLocalAddress(fields[1], isV6)
		if err != nil {
			continue
		}
		sockets = append(sockets, Socket{LocalIP: ip, Port: port})
	}
	return sockets, scanner.Err()
}

// parseLocalAddress decodes the "IP:PORT" hex field from /proc/net/tcp{,6}.
// The kernel writes IPv4 addresses as 4 little-endian bytes, and IPv6
// addresses as four 4-byte little-endian words.
func parseLocalAddress(field string, isV6 bool) (net.IP, uint16, error) {
	parts := strings.Split(field, ":")
	if len(parts) != 2 {
		return nil, 0, fmt.Errorf("malformed address field %q", field)
	}
	ipHex, portHex := parts[0], parts[1]

	port, err := strconv.ParseUint(portHex, 16, 16)
	if err != nil {
		return nil, 0, err
	}

	raw, err := hex.DecodeString(ipHex)
	if err != nil {
		return nil, 0, err
	}

	if isV6 {
		if len(raw) != 16 {
			return nil, 0, fmt.Errorf("unexpected IPv6 field length %d", len(raw))
		}
		ip := make(net.IP, 16)
		for word := 0; word < 4; word++ {
			for b := 0; b < 4; b++ {
				ip[word*4+b] = raw[word*4+(3-b)]
			}
		}
		return ip, uint16(port), nil
	}

	if len(raw) != 4 {
		return nil, 0, fmt.Errorf("unexpected IPv4 field length %d", len(raw))
	}
	ip := net.IPv4(raw[3], raw[2], raw[1], raw[0])
	return ip, uint16(port), nil
}

// tcpEstablished is the /proc/net/tcp{,6} "st" value for ESTABLISHED.
const tcpEstablished = "06"

// EstablishedConn is an outbound endpoint the host currently has an
// established connection to — used by anomaly checks that look at what a
// process is talking to, rather than what's listening.
type EstablishedConn struct {
	RemoteIP   net.IP
	RemotePort uint16
}

// EstablishedConnections reads /proc/net/tcp{,6} for ESTABLISHED rows, the
// same way ListeningSockets reads them for LISTEN rows.
func EstablishedConnections() ([]EstablishedConn, error) {
	var conns []EstablishedConn

	v4, err := parseProcNetTCPConns("/proc/net/tcp", false)
	if err != nil {
		return nil, fmt.Errorf("read /proc/net/tcp: %w", err)
	}
	conns = append(conns, v4...)

	if v6, err := parseProcNetTCPConns("/proc/net/tcp6", true); err == nil {
		conns = append(conns, v6...)
	}
	return conns, nil
}

func parseProcNetTCPConns(path string, isV6 bool) ([]EstablishedConn, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return parseProcNetTCPConnsReader(f, isV6)
}

func parseProcNetTCPConnsReader(r io.Reader, isV6 bool) ([]EstablishedConn, error) {
	var conns []EstablishedConn
	scanner := bufio.NewScanner(r)
	first := true
	for scanner.Scan() {
		if first {
			first = false
			continue
		}
		fields := strings.Fields(scanner.Text())
		if len(fields) < 4 || fields[3] != tcpEstablished {
			continue
		}
		ip, port, err := parseLocalAddress(fields[2], isV6) // rem_address field
		if err != nil {
			continue
		}
		conns = append(conns, EstablishedConn{RemoteIP: ip, RemotePort: port})
	}
	return conns, scanner.Err()
}

// PubliclyBoundAddrs returns every distinct address a given port is bound to
// that is NOT loopback-only (127.0.0.0/8, ::1). Binding to 0.0.0.0 or "::"
// counts as publicly bound, as does any explicit non-loopback address —
// whether that's actually internet-reachable depends on the firewall, which
// is checked separately.
func PubliclyBoundAddrs(sockets []Socket, port uint16) []string {
	seen := map[string]bool{}
	var addrs []string
	for _, s := range sockets {
		if s.Port != port || s.LocalIP.IsLoopback() {
			continue
		}
		addr := s.LocalIP.String()
		if !seen[addr] {
			seen[addr] = true
			addrs = append(addrs, addr)
		}
	}
	return addrs
}
