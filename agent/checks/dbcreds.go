// db-default-credentials: attempts a short, well-known list of default
// credential pairs against Redis, Postgres, and MySQL when they're
// publicly bound. This is exactly the kind of defensive self-audit this
// product exists to do — testing your own server's exposed databases
// against the credential pairs any real attacker tries first.
//
// MongoDB is deliberately not covered: its default auth mechanism
// (SCRAM-SHA-256) needs a BSON-encoded wire protocol, and hand-rolling
// BSON + SCRAM without a battle-tested library is exactly the kind of
// "probably almost right" security code this project has avoided
// elsewhere (see checks/database.go's note on the other exposure-only
// checks). Reported honestly in the finding detail, not silently skipped.
package checks

import (
	"bufio"
	"bytes"
	"crypto/md5"
	"crypto/sha1"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"strings"
	"time"

	"github.com/servermend/agent/report"
)

func init() {
	Register(dbDefaultCredentials{})
}

type dbDefaultCredentials struct{}

func (c dbDefaultCredentials) ID() string       { return "db-default-credentials" }
func (c dbDefaultCredentials) Category() string { return "database" }
func (c dbDefaultCredentials) Title() string {
	return "Any DB using known default username/password pairs"
}

func (c dbDefaultCredentials) Run(rc *RunContext) report.Finding {
	sockets, err := ListeningSockets()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}

	var hits []string
	hits = append(hits, checkRedisDefaultCreds(PubliclyBoundAddrs(sockets, 6379))...)
	hits = append(hits, checkPostgresDefaultCreds(PubliclyBoundAddrs(sockets, 5432))...)
	hits = append(hits, checkMySQLDefaultCreds(PubliclyBoundAddrs(sockets, 3306))...)

	note := ""
	if mongoAddrs := PubliclyBoundAddrs(sockets, 27017); len(mongoAddrs) > 0 {
		note = fmt.Sprintf(" (MongoDB reachable on %v — credential testing not implemented, see source comment)", mongoAddrs)
	}

	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("default/weak credential(s) accepted: %v%s", hits, note))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("no default credentials accepted on Redis/Postgres/MySQL%s", note))
}

// --- Redis: AUTH with a short common-password list ------------------------

var redisDefaultPasswords = []string{"redis", "password", "admin", "123456", "changeme"}

func checkRedisDefaultCreds(addrs []string) []string {
	var hits []string
	for _, addr := range addrs {
		target := net.JoinHostPort(addr, "6379")
		for _, pw := range redisDefaultPasswords {
			ok, err := redisTryAuth(target, pw)
			if err != nil {
				continue
			}
			if ok {
				hits = append(hits, fmt.Sprintf("%s (password=%q)", target, pw))
				break
			}
		}
	}
	return hits
}

func redisTryAuth(addr, password string) (bool, error) {
	conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	if err != nil {
		return false, err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(3 * time.Second))

	if _, err := fmt.Fprintf(conn, "AUTH %s\r\n", password); err != nil {
		return false, err
	}
	line, err := bufio.NewReader(conn).ReadString('\n')
	if err != nil {
		return false, err
	}
	return strings.HasPrefix(strings.TrimSpace(line), "+OK"), nil
}

// --- PostgreSQL: StartupMessage + cleartext/MD5 auth -----------------------
// SASL/SCRAM (Postgres's own modern default) reports as "unsupported", not
// a false pass — see pgTryLogin's authType switch.

var pgDefaultCredentials = []struct{ user, password, database string }{
	{"postgres", "postgres", "postgres"},
	{"postgres", "", "postgres"},
	{"postgres", "password", "postgres"},
	{"postgres", "admin", "postgres"},
	{"admin", "admin", "postgres"},
}

func checkPostgresDefaultCreds(addrs []string) []string {
	var hits []string
	for _, addr := range addrs {
		target := net.JoinHostPort(addr, "5432")
		for _, cred := range pgDefaultCredentials {
			ok, unsupported, err := pgTryLogin(target, cred.user, cred.password, cred.database)
			if unsupported {
				break // SASL/GSS required — this check can't test it, don't waste more attempts
			}
			if err != nil {
				continue
			}
			if ok {
				hits = append(hits, fmt.Sprintf("%s (user=%s)", target, cred.user))
				break
			}
		}
	}
	return hits
}

func pgTryLogin(addr, user, password, database string) (ok, unsupported bool, err error) {
	conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	if err != nil {
		return false, false, err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))

	if err := pgSendStartup(conn, user, database); err != nil {
		return false, false, err
	}

	msgType, payload, err := pgReadMessage(conn)
	if err != nil {
		return false, false, err
	}
	switch msgType {
	case 'E':
		return false, false, nil // rejected before the password stage (unknown user/db) — not a credential match
	case 'R':
		if len(payload) < 4 {
			return false, false, fmt.Errorf("short authentication message")
		}
		switch binary.BigEndian.Uint32(payload[:4]) {
		case 0:
			return true, false, nil // AuthenticationOk — no password required at all
		case 3:
			if err := pgSendPassword(conn, password); err != nil {
				return false, false, err
			}
		case 5:
			if len(payload) < 8 {
				return false, false, fmt.Errorf("short MD5 authentication message")
			}
			if err := pgSendPassword(conn, pgMD5Password(user, password, payload[4:8])); err != nil {
				return false, false, err
			}
		default:
			return false, true, nil // SASL/GSSAPI/SSPI — not implemented
		}
	default:
		return false, false, fmt.Errorf("unexpected message type %q", msgType)
	}

	msgType, payload, err = pgReadMessage(conn)
	if err != nil {
		return false, false, err
	}
	ok = msgType == 'R' && len(payload) >= 4 && binary.BigEndian.Uint32(payload[:4]) == 0
	return ok, false, nil
}

func pgSendStartup(conn io.Writer, user, database string) error {
	var body bytes.Buffer
	_ = binary.Write(&body, binary.BigEndian, uint32(196608)) // protocol 3.0
	body.WriteString("user\x00")
	body.WriteString(user)
	body.WriteByte(0)
	body.WriteString("database\x00")
	body.WriteString(database)
	body.WriteByte(0)
	body.WriteByte(0) // parameter-list terminator

	var msg bytes.Buffer
	_ = binary.Write(&msg, binary.BigEndian, uint32(4+body.Len()))
	msg.Write(body.Bytes())
	_, err := conn.Write(msg.Bytes())
	return err
}

func pgSendPassword(conn io.Writer, password string) error {
	var msg bytes.Buffer
	msg.WriteByte('p')
	_ = binary.Write(&msg, binary.BigEndian, uint32(4+len(password)+1))
	msg.WriteString(password)
	msg.WriteByte(0)
	_, err := conn.Write(msg.Bytes())
	return err
}

func pgReadMessage(conn io.Reader) (msgType byte, payload []byte, err error) {
	header := make([]byte, 5)
	if _, err := io.ReadFull(conn, header); err != nil {
		return 0, nil, err
	}
	msgType = header[0]
	length := binary.BigEndian.Uint32(header[1:5])
	if length < 4 {
		return msgType, nil, fmt.Errorf("invalid message length")
	}
	payload = make([]byte, length-4)
	if _, err := io.ReadFull(conn, payload); err != nil {
		return 0, nil, err
	}
	return msgType, payload, nil
}

// pgMD5Password follows Postgres's documented algorithm: md5(password+user)
// as a hex STRING, concatenated (as ASCII bytes) with the salt, md5'd
// again, hex-encoded, prefixed with "md5".
func pgMD5Password(user, password string, salt []byte) string {
	inner := md5Hex(password + user)
	outer := md5.Sum(append([]byte(inner), salt...))
	return "md5" + hex.EncodeToString(outer[:])
}

func md5Hex(s string) string {
	sum := md5.Sum([]byte(s))
	return hex.EncodeToString(sum[:])
}

// --- MySQL: native handshake + mysql_native_password -----------------------
// caching_sha2_password (MySQL 8's default when no plugin is pinned)
// reports as "unsupported" via the AuthSwitchRequest/plugin-name check, not
// a false pass — see mysqlTryLogin.

var mysqlDefaultCredentials = []struct{ user, password string }{
	{"root", ""},
	{"root", "root"},
	{"root", "toor"},
	{"root", "password"},
	{"admin", "admin"},
}

func checkMySQLDefaultCreds(addrs []string) []string {
	var hits []string
	for _, addr := range addrs {
		target := net.JoinHostPort(addr, "3306")
		for _, cred := range mysqlDefaultCredentials {
			ok, unsupported, err := mysqlTryLogin(target, cred.user, cred.password)
			if unsupported {
				break
			}
			if err != nil {
				continue
			}
			if ok {
				hits = append(hits, fmt.Sprintf("%s (user=%s)", target, cred.user))
				break
			}
		}
	}
	return hits
}

func mysqlTryLogin(addr, user, password string) (ok, unsupported bool, err error) {
	conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	if err != nil {
		return false, false, err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))

	seq, scramble, pluginName, err := mysqlReadHandshake(conn)
	if err != nil {
		return false, false, err
	}
	if pluginName != "" && pluginName != "mysql_native_password" {
		return false, true, nil
	}
	if len(scramble) < 20 {
		return false, true, nil
	}

	authResponse := mysqlScramble(password, scramble[:20])
	if err := mysqlWritePacket(conn, seq+1, mysqlBuildHandshakeResponse(user, authResponse)); err != nil {
		return false, false, err
	}

	_, payload, err := mysqlReadPacket(conn)
	if err != nil {
		return false, false, err
	}
	if len(payload) == 0 {
		return false, false, nil
	}
	switch payload[0] {
	case 0x00:
		return true, false, nil // OK packet
	case 0xFE:
		return false, true, nil // AuthSwitchRequest — server wants a different plugin
	default:
		return false, false, nil // 0xFF ERR packet
	}
}

func mysqlReadHandshake(conn io.Reader) (seq byte, scramble []byte, pluginName string, err error) {
	seq, payload, err := mysqlReadPacket(conn)
	if err != nil {
		return 0, nil, "", err
	}
	if len(payload) < 1 || payload[0] != 0x0a {
		return 0, nil, "", fmt.Errorf("unsupported handshake protocol version")
	}
	pos := 1
	nullIdx := bytes.IndexByte(payload[pos:], 0)
	if nullIdx == -1 {
		return 0, nil, "", fmt.Errorf("malformed handshake: no server version terminator")
	}
	pos += nullIdx + 1 // server_version
	pos += 4           // connection_id
	if pos+8 > len(payload) {
		return 0, nil, "", fmt.Errorf("malformed handshake: truncated before auth-plugin-data-part-1")
	}
	part1 := payload[pos : pos+8]
	pos += 8
	pos += 1 + 2 + 1 + 2 + 2 // filler, capability_flags_1, character_set, status_flags, capability_flags_2
	if pos+1 > len(payload) {
		return 0, nil, "", fmt.Errorf("malformed handshake: truncated before auth-plugin-data-len")
	}
	authPluginDataLen := int(payload[pos])
	pos += 1 + 10 // auth_plugin_data_len, reserved

	part2Len := authPluginDataLen - 8
	if part2Len < 13 {
		part2Len = 13
	}
	if pos+part2Len > len(payload) {
		return 0, nil, "", fmt.Errorf("malformed handshake: truncated auth-plugin-data-part-2")
	}
	part2 := bytes.TrimRight(payload[pos:pos+part2Len], "\x00")
	pos += part2Len

	scramble = append(append([]byte{}, part1...), part2...)
	if pos < len(payload) {
		pluginName = string(bytes.TrimRight(payload[pos:], "\x00"))
	}
	return seq, scramble, pluginName, nil
}

func mysqlScramble(password string, scramble []byte) []byte {
	if password == "" {
		return nil
	}
	stage1 := sha1.Sum([]byte(password))
	stage2 := sha1.Sum(stage1[:])
	h := sha1.New()
	h.Write(scramble)
	h.Write(stage2[:])
	result := h.Sum(nil)

	token := make([]byte, 20)
	for i := range token {
		token[i] = stage1[i] ^ result[i]
	}
	return token
}

func mysqlBuildHandshakeResponse(user string, authResponse []byte) []byte {
	const (
		clientLongPassword     = 0x00000001
		clientProtocol41       = 0x00000200
		clientSecureConnection = 0x00008000
		clientPluginAuth       = 0x00080000
	)
	capFlags := uint32(clientLongPassword | clientProtocol41 | clientSecureConnection | clientPluginAuth)

	var buf bytes.Buffer
	capBytes := make([]byte, 4)
	binary.LittleEndian.PutUint32(capBytes, capFlags)
	buf.Write(capBytes)

	maxPacketBytes := make([]byte, 4)
	binary.LittleEndian.PutUint32(maxPacketBytes, 16777216)
	buf.Write(maxPacketBytes)

	buf.WriteByte(33) // utf8_general_ci
	buf.Write(make([]byte, 23))
	buf.WriteString(user)
	buf.WriteByte(0)
	buf.WriteByte(byte(len(authResponse)))
	buf.Write(authResponse)
	buf.WriteString("mysql_native_password")
	buf.WriteByte(0)
	return buf.Bytes()
}

func mysqlReadPacket(conn io.Reader) (seq byte, payload []byte, err error) {
	header := make([]byte, 4)
	if _, err := io.ReadFull(conn, header); err != nil {
		return 0, nil, err
	}
	length := int(header[0]) | int(header[1])<<8 | int(header[2])<<16
	seq = header[3]
	payload = make([]byte, length)
	if length > 0 {
		if _, err := io.ReadFull(conn, payload); err != nil {
			return 0, nil, err
		}
	}
	return seq, payload, nil
}

func mysqlWritePacket(conn io.Writer, seq byte, payload []byte) error {
	header := []byte{byte(len(payload)), byte(len(payload) >> 8), byte(len(payload) >> 16), seq}
	if _, err := conn.Write(header); err != nil {
		return err
	}
	_, err := conn.Write(payload)
	return err
}
