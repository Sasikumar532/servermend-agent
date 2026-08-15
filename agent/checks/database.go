package checks

import (
	"bufio"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/servermend/agent/report"
)

func init() {
	Register(redisUnauthExposed{})
	Register(newPortExposureCheck("postgres-default-exposed", "database", "Postgres reachable externally", 5432))
	Register(newPortExposureCheck("mysql-default-exposed", "database", "MySQL reachable externally", 3306))
	Register(newPortExposureCheck("mongodb-noauth-exposed", "database", "MongoDB reachable externally", 27017))
}

// --- Redis: fully implemented, per the roadmap's #1 MVP priority ---------
//
// The Redis wire protocol makes this cheap to check for real, unlike the
// other three DBs below: an unauthenticated PING either succeeds (+PONG,
// no requirepass set — critical) or is refused (-NOAUTH, requirepass is
// set — pass). No credentials are ever guessed or sent.

type redisUnauthExposed struct{}

func (c redisUnauthExposed) ID() string       { return "redis-unauthenticated-exposed" }
func (c redisUnauthExposed) Category() string { return "database" }
func (c redisUnauthExposed) Title() string {
	return "Redis reachable externally with no requirepass set"
}

func (c redisUnauthExposed) Run(rc *RunContext) report.Finding {
	const redisPort = 6379

	sockets, err := ListeningSockets()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}

	addrs := PubliclyBoundAddrs(sockets, redisPort)
	if len(addrs) == 0 {
		return finding(c, report.StatusPass, "redis not listening on a non-loopback interface")
	}

	target := net.JoinHostPort(addrs[0], "6379")
	authRequired, err := redisRequiresAuth(target)
	if err != nil {
		return finding(c, report.StatusError, fmt.Sprintf("redis reachable on %v but PING probe failed: %v", addrs, err))
	}
	if authRequired {
		return finding(c, report.StatusPass, fmt.Sprintf("redis reachable on %v but requires authentication", addrs))
	}
	return finding(c, report.StatusFail, fmt.Sprintf(
		"redis reachable on %v with no requirepass — PING succeeded unauthenticated, directly exploitable via CONFIG SET", addrs))
}

// redisRequiresAuth sends an unauthenticated inline PING and inspects the
// reply. It never sends AUTH or any credential.
func redisRequiresAuth(addr string) (bool, error) {
	conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	if err != nil {
		return false, err
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(3 * time.Second))
	if _, err := conn.Write([]byte("PING\r\n")); err != nil {
		return false, err
	}

	line, err := bufio.NewReader(conn).ReadString('\n')
	if err != nil {
		return false, err
	}
	line = strings.TrimSpace(line)

	switch {
	case strings.HasPrefix(line, "+PONG"):
		return false, nil // no auth required
	case strings.HasPrefix(line, "-NOAUTH"):
		return true, nil // auth required
	default:
		return false, fmt.Errorf("unexpected reply: %q", line)
	}
}

// --- Postgres / MySQL / MongoDB: exposure-only for now --------------------
//
// Determining "no auth" or "default credentials" for these three needs a
// real (if minimal) implementation of each wire protocol's handshake — that
// is real work, not a one-line probe like Redis's PING, so it's tracked as
// a follow-up rather than faked here. What we *can* say honestly today is
// whether the port is reachable on a non-loopback interface at all, which
// is still useful signal and matches what firewall-exposed-admin-ports also
// checks independently.

type portExposureCheck struct {
	id       string
	category string
	title    string
	port     uint16
}

func newPortExposureCheck(id, category, title string, port uint16) portExposureCheck {
	return portExposureCheck{id: id, category: category, title: title, port: port}
}

func (c portExposureCheck) ID() string       { return c.id }
func (c portExposureCheck) Category() string { return c.category }
func (c portExposureCheck) Title() string    { return c.title }

func (c portExposureCheck) Run(rc *RunContext) report.Finding {
	sockets, err := ListeningSockets()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}

	addrs := PubliclyBoundAddrs(sockets, c.port)
	if len(addrs) == 0 {
		return finding(c, report.StatusPass, "not listening on a non-loopback interface")
	}
	return finding(c, report.StatusInfo, fmt.Sprintf(
		"reachable on %v — credential-strength verification not yet implemented (see checks/database.go)", addrs))
}
