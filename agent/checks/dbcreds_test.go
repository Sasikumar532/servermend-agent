package checks

import (
	"bytes"
	"encoding/binary"
	"testing"
)

// These expected values were cross-checked independently against Python's
// hashlib (md5/sha1) for the same inputs — not just re-derived from the
// same Go code they're testing.

func TestPgMD5Password(t *testing.T) {
	salt := []byte{0x01, 0x02, 0x03, 0x04}
	got := pgMD5Password("postgres", "postgres", salt)
	want := "md568be9ed08db75f318087ab337aaea044"
	if got != want {
		t.Errorf("pgMD5Password() = %q, want %q", got, want)
	}
}

func TestMysqlScramble(t *testing.T) {
	scramble := make([]byte, 20)
	for i := range scramble {
		scramble[i] = byte(i + 1)
	}
	got := mysqlScramble("root", scramble)
	want := "7762abf3fd9818d9f63e079f850167cb142a0965"
	if hexEncode(got) != want {
		t.Errorf("mysqlScramble() = %x, want %s", got, want)
	}
}

func TestMysqlScrambleEmptyPassword(t *testing.T) {
	if got := mysqlScramble("", []byte("anything")); got != nil {
		t.Errorf("mysqlScramble(\"\", ...) = %x, want nil (empty auth response for no password)", got)
	}
}

func hexEncode(b []byte) string {
	const hexDigits = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, v := range b {
		out[i*2] = hexDigits[v>>4]
		out[i*2+1] = hexDigits[v&0x0f]
	}
	return string(out)
}

// TestPgReadMessageRoundTrip builds a synthetic Postgres message the same
// way pgSendPassword does, and confirms pgReadMessage parses it back out
// correctly — proves the header framing (type byte + 4-byte BE length
// including itself) is symmetric.
func TestPgReadMessageRoundTrip(t *testing.T) {
	var buf bytes.Buffer
	if err := pgSendPassword(&buf, "hunter2"); err != nil {
		t.Fatalf("pgSendPassword: %v", err)
	}

	msgType, payload, err := pgReadMessage(&buf)
	if err != nil {
		t.Fatalf("pgReadMessage: %v", err)
	}
	if msgType != 'p' {
		t.Errorf("msgType = %q, want 'p'", msgType)
	}
	want := "hunter2\x00"
	if string(payload) != want {
		t.Errorf("payload = %q, want %q", payload, want)
	}
}

// TestMysqlReadHandshake builds a synthetic handshake packet matching the
// documented Protocol::HandshakeV10 layout and confirms the hand-rolled
// offset arithmetic in mysqlReadHandshake extracts the right scramble and
// plugin name — this is exactly the kind of byte-counting code that's
// silently wrong in a subtly-off way if it's wrong at all.
func TestMysqlReadHandshake(t *testing.T) {
	scramble := make([]byte, 20)
	for i := range scramble {
		scramble[i] = byte(i + 1)
	}
	part1, part2 := scramble[:8], scramble[8:20]

	var payload bytes.Buffer
	payload.WriteByte(0x0a)           // protocol version
	payload.WriteString("8.0.30")     // server_version
	payload.WriteByte(0)              // null terminator
	payload.Write([]byte{9, 0, 0, 0}) // connection_id
	payload.Write(part1)              // auth_plugin_data_part_1
	payload.WriteByte(0)              // filler
	payload.Write([]byte{0xff, 0xff}) // capability_flags_1
	payload.WriteByte(33)             // character_set
	payload.Write([]byte{0x02, 0x00}) // status_flags
	payload.Write([]byte{0xff, 0xff}) // capability_flags_2
	payload.WriteByte(21)             // auth_plugin_data_len = 8 + 12 + 1
	payload.Write(make([]byte, 10))   // reserved
	payload.Write(part2)              // auth_plugin_data_part_2
	payload.WriteByte(0)              // null terminator for part_2
	payload.WriteString("mysql_native_password")
	payload.WriteByte(0)

	var packet bytes.Buffer
	length := payload.Len()
	packet.Write([]byte{byte(length), byte(length >> 8), byte(length >> 16), 7}) // seq = 7
	packet.Write(payload.Bytes())

	seq, gotScramble, pluginName, err := mysqlReadHandshake(&packet)
	if err != nil {
		t.Fatalf("mysqlReadHandshake: %v", err)
	}
	if seq != 7 {
		t.Errorf("seq = %d, want 7", seq)
	}
	if !bytes.Equal(gotScramble, scramble) {
		t.Errorf("scramble = %x, want %x", gotScramble, scramble)
	}
	if pluginName != "mysql_native_password" {
		t.Errorf("pluginName = %q, want %q", pluginName, "mysql_native_password")
	}
}

// TestMysqlPacketRoundTrip confirms the 3-byte-LE-length + 1-byte-seq
// framing is symmetric between write and read.
func TestMysqlPacketRoundTrip(t *testing.T) {
	var buf bytes.Buffer
	payload := []byte("hello mysql")
	if err := mysqlWritePacket(&buf, 3, payload); err != nil {
		t.Fatalf("mysqlWritePacket: %v", err)
	}
	seq, got, err := mysqlReadPacket(&buf)
	if err != nil {
		t.Fatalf("mysqlReadPacket: %v", err)
	}
	if seq != 3 {
		t.Errorf("seq = %d, want 3", seq)
	}
	if !bytes.Equal(got, payload) {
		t.Errorf("payload = %q, want %q", got, payload)
	}
}

// TestPgStartupMessageLength confirms the 4-byte-BE length prefix on the
// StartupMessage covers its own 4 bytes plus the body, per the Postgres
// protocol spec — an off-by-4 here would make every real connection hang
// waiting for bytes that never arrive.
func TestPgStartupMessageLength(t *testing.T) {
	var buf bytes.Buffer
	if err := pgSendStartup(&buf, "postgres", "postgres"); err != nil {
		t.Fatalf("pgSendStartup: %v", err)
	}
	declaredLen := binary.BigEndian.Uint32(buf.Bytes()[:4])
	if int(declaredLen) != buf.Len() {
		t.Errorf("declared length = %d, actual message length = %d", declaredLen, buf.Len())
	}
}
