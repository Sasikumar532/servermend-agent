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

**40 of 41 MVP-priority catalog checks implemented** — every MVP check from §3.1–§3.4, §3.6, §3.7, §3.9 except `db-default-credentials` (see below). A0–A4 are done.

| Category | Checks | Notes |
|---|---|---|
| ssh (10/10) | root-login, password-auth, empty-passwords, weak-ciphers, protocol-version, authorized-keys-diff, port-default, failed-login-rate, sudo-nopasswd, sudo-broad-entries | `sshd_config` parser follows `Include` directives — needed for Ubuntu's default `sshd_config.d/*.conf` layout |
| firewall (4/4) | active, default-policy, exposed-admin-ports, open-ports-scan | ufw/nftables/iptables; `open-ports-scan` and exposure checks share the `/proc/net/tcp` reader |
| process (4/4) | apps-running-as-root, fail2ban-installed, unattended-upgrades-active, kernel-version-outdated | `unattended-upgrades-active` covers both Debian/Ubuntu (`unattended-upgrades`) and RHEL/Fedora (`dnf-automatic`); kernel check reports the raw version only (staleness needs a reference feed — that's server-side, per the architecture doc) |
| persistence (8/8) | cron-system/user-jobs, systemd-unexpected-units, ld-preload-hijack, shell-profile-tampering, path-world-writable, suid-sgid-unexpected, deleted-binary-running | baseline-diffed except the two content/pattern checks (ld-preload, shell-profile), which don't need novelty to be suspicious |
| docker (7/7) | socket-exposed, daemon-tcp-no-tls, privileged-containers, container-root-user, ports-bound-public, untrusted-registry, secrets-in-image | container-level checks shell out to `docker inspect --format`; `secrets-in-image` is a light `docker history` heuristic, not a real layer scan |
| database (4/5) | redis-unauthenticated-exposed (fully real), postgres/mysql/mongodb-default-exposed (exposure-only) | `db-default-credentials` needs each DB's wire protocol implemented to test creds — deliberately deferred, not faked |
| filesystem (3/3) | shadow-file-permissions, ssh-private-key-permissions, secrets-plaintext-broad-read | secrets scan is bounded to `/opt /srv /var/www /home`, depth-limited |

Remaining: report-client retry/backoff + offline queue (A5), cross-compile + release signing (A6), then Phase 2 (sysctl, nginx, logging, anomaly detection — the last one needs a daemon execution mode, not the current one-shot scan).

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

20 tests across `baseline`, `checks`, and `report` — all pure-logic/parsing tests that don't depend on the real `/proc` or `/etc/passwd` (byte-order decoding for `/proc/net/tcp{,6}`, `sshd_config` `Include`/`Match` handling, baseline diffing, the report client's retry/backoff and offline queue against an `httptest` server). No test requires root or a Linux host to run.

`.github/workflows/agent-ci.yml` runs `gofmt`, `go vet`, `go build`, `go test -race`, and `golangci-lint` on every push/PR touching `agent/**`, then does a real dry-run of the compiled agent on the `ubuntu-latest` runner as a smoke test — this is the actual-Linux validation local dev on Windows can't provide (no WSL/Docker available on this machine).

## Install (on a target Linux host)

```
GOOS=linux GOARCH=amd64 go build -o servermend-agent ./cmd/servermend-agent
sudo ./install/install.sh ./servermend-agent
```
