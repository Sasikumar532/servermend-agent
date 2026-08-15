# servermend-agent (Go)

Read-only host-audit agent. Runs checks, diffs persistence-related state against a stored baseline, and reports raw findings to the backend — no scoring or remediation logic lives here.

## Layout

```
agent/
├── cmd/servermend-agent/   # main.go — entry point, CLI flags, wires baseline + checks together
├── checks/                  # one file per category — see below for what's implemented
├── baseline/                 # local baseline store: capture on first run, diff on every run after
├── report/                    # Finding/Report structs, HTTPS client to the backend
├── config/                     # CLI flag parsing
├── PERMISSIONS.md               # why the agent runs as root, sandboxed via systemd, not a sudoers allowlist
└── install/                      # install.sh + systemd .service/.timer units
```

## Status

**All 60 catalog checks implemented.** A0–A6, Phase 2, and the two "Later"-priority cloud checks (§3.12) are all done.

### MVP (§3.1–§3.4, §3.6, §3.7, §3.9) — 40/41

| Category | Checks | Notes |
|---|---|---|
| ssh (10/10) | root-login, password-auth, empty-passwords, weak-ciphers, protocol-version, authorized-keys-diff, port-default, failed-login-rate, sudo-nopasswd, sudo-broad-entries | `sshd_config` parser follows `Include` directives — needed for Ubuntu's default `sshd_config.d/*.conf` layout |
| firewall (4/4) | active, default-policy, exposed-admin-ports, open-ports-scan | ufw/nftables/iptables; `open-ports-scan` and exposure checks share the `/proc/net/tcp` reader |
| process (4/4) | apps-running-as-root, fail2ban-installed, unattended-upgrades-active, kernel-version-outdated | `unattended-upgrades-active` covers both Debian/Ubuntu (`unattended-upgrades`) and RHEL/Fedora (`dnf-automatic`); kernel check reports the raw version only (staleness needs a reference feed — that's server-side, per the architecture doc) |
| persistence (8/8) | cron-system/user-jobs, systemd-unexpected-units, ld-preload-hijack, shell-profile-tampering, path-world-writable, suid-sgid-unexpected, deleted-binary-running | baseline-diffed except the two content/pattern checks (ld-preload, shell-profile), which don't need novelty to be suspicious |
| docker (7/7) | socket-exposed, daemon-tcp-no-tls, privileged-containers, container-root-user, ports-bound-public, untrusted-registry, secrets-in-image | container-level checks shell out to `docker inspect --format`; `secrets-in-image` is a light `docker history` heuristic, not a real layer scan |
| database (5/5) | redis-unauthenticated-exposed, postgres/mysql/mongodb-default-exposed (exposure), db-default-credentials | `db-default-credentials` (see `checks/dbcreds.go`) hand-rolls just enough of the Postgres and MySQL wire protocols to test a short list of well-known default credentials for real — Postgres StartupMessage + cleartext/MD5 auth, MySQL native handshake + `mysql_native_password` scramble. Both crypto paths are cross-checked against independent Python (`hashlib`) computations in tests, not just re-derived from the same Go code. SASL/SCRAM (Postgres) and `caching_sha2_password` (MySQL 8's default) report `unsupported`, not a false pass. MongoDB is deliberately not covered — its SCRAM-SHA-256 auth needs a BSON wire encoder, and hand-rolling that without a battle-tested library was judged not worth the correctness risk. |
| filesystem (3/3) | shadow-file-permissions, ssh-private-key-permissions, secrets-plaintext-broad-read | secrets scan is bounded to `/opt /srv /var/www /home`, depth-limited |

### Phase 2 (§3.5, §3.8, §3.10, §3.11) — 17/17

| Category | Checks | Notes |
|---|---|---|
| sysctl (6/6) | ip-forward, icmp-redirects, syn-cookies, aslr-disabled, core-dumps-world-readable, tmp-noexec | `ip-forward=1` is treated as expected (not a fail) when Docker is installed, since Docker requires it — avoids a near-universal false positive on this product's actual target audience |
| nginx (4/4) | server-tokens, tls-weak-config, directory-listing, default-artifacts | text-search over concatenated `*.conf` files under `/etc/nginx`, not a full config parser — sufficient for these four directive-presence questions |
| logging (3/3) | logging-enabled, log-rotation-configured, auditd-present | `logging-enabled` falls back to `journalctl --disk-usage` on journald-only hosts with no `auth.log`/`secure` |
| anomaly (4/4) | miner-process-signature, outbound-mining-pool-connection, sustained-high-cpu-unexpected-process, high-outbound-connection-count | The first two are genuine point-in-time facts (a miner binary running now, a connection to a known Stratum port now). The latter two are **single-snapshot approximations** — average CPU since process start, connection count at scan time — explicitly labeled as such in their output. A real daemon mode sampling over a time window would be strictly more accurate; not blocking the whole category on that architecture decision was a deliberate call. |

### Later (§3.12) — 2/2

| Category | Checks | Notes |
|---|---|---|
| cloud (2/2) | cloud-metadata-endpoint-reachable, cloud-credentials-plaintext | Metadata check is host-level reachability to `169.254.169.254:80` — can't see inside every container, noted honestly in the finding detail. Credentials check looks at common CLI credential file paths (`~/.aws/credentials`, `~/.config/gcloud/...`, etc.) for group/other-readable permissions. |

Remaining: the CI workflow has been pushed to GitHub twice but not yet confirmed green on a real run — that's the one thing left that hasn't been verified outside this machine.

## Baseline

Persistence and `ssh-authorized-keys-diff` checks compare current state against `--baseline-path` (default `/var/lib/servermend/baseline.json`). First run (or any run with `--update-baseline`) captures current state instead of diffing — this is the CLI stand-in for "explicit user confirmation" until the dashboard's confirm/reject flow (D2) exists.

## Local run

```
go run ./cmd/servermend-agent --dry-run --output stdout --baseline-path ./baseline.local.json
```

On Windows, everything that reads `/proc/net/tcp`, `/etc/passwd`, or shells out to `systemctl` will correctly report `status: error` rather than a false result — those checks are Linux-only by nature. `docker-socket-exposed`, `ld-preload-hijack`, and `path-world-writable` will run, though note `path-world-writable`'s permission-bit check is meaningless on Windows (Go's `os.Stat` doesn't map NTFS ACLs to POSIX mode bits) — it behaves correctly once actually run on a Linux target.

## Tests

```
go test ./...
```

34 tests across `baseline`, `checks`, `report`, and `cmd/servermend-sign` — all pure-logic/parsing tests that don't depend on the real `/proc` or `/etc/passwd` (byte-order decoding for `/proc/net/tcp{,6}`, `sshd_config` `Include`/`Match` handling, baseline diffing, the report client's retry/backoff and offline queue against an `httptest` server, the Postgres/MySQL wire-protocol framing and crypto in `dbcreds.go`), plus a registry guard (`TestNoDuplicateCheckIDs`) that fails loudly if two checks ever collide on ID. No test requires root or a Linux host to run.

`.github/workflows/agent-ci.yml` runs `gofmt`, `go vet`, `go build`, `go test -race`, and `golangci-lint` on every push/PR touching `agent/**`, then does a real dry-run of the compiled agent on the `ubuntu-latest` runner as a smoke test — this is the actual-Linux validation local dev on Windows can't provide (no WSL/Docker available on this machine).

## Signing releases

`cmd/servermend-sign` is a minimal Ed25519 signer (stdlib `crypto/ed25519` only — no `minisign` or other external tool needed, consistent with the agent's zero-dependency policy):

```
go run ./cmd/servermend-sign keygen release        # writes release.pub (commit/distribute) and release.key (keep private, chmod 600)
./scripts/build-release.sh v0.1.0                    # cross-compiles agent + servermend-sign for linux/amd64 + arm64, signs every artifact if SERVERMEND_SIGNING_KEY is set
```

Full sign → verify round trip, plus tamper- and wrong-key-rejection, is covered by `cmd/servermend-sign/main_test.go` and was additionally verified by hand against real cross-compiled release binaries during development — not just trusted to compile.

## Install (on a target Linux host)

```
GOOS=linux GOARCH=amd64 go build -o servermend-agent ./cmd/servermend-agent
sudo ./install/install.sh ./servermend-agent
```

`install.sh` refuses to install an unsigned binary unless `ALLOW_UNSIGNED=1` is set — see the comments in `install/install.sh` for the signature-verification flow (`SERVERMEND_PUBLIC_KEY_FILE` + a `servermend-sign` binary on `PATH` or shipped alongside the release).
