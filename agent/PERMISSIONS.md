# Agent permission model

Resolves the roadmap's open question: *"What does the agent's service account actually need to read?"*

## Decision: root, sandboxed via systemd — not a sudoers allowlist

A meaningful slice of the check catalog genuinely needs root:

| Needs root because... | Checks |
|---|---|
| Other users' home directories are `0700` | `ssh-authorized-keys-diff`, `shell-profile-tampering` |
| The per-user crontab spool is root-only | `cron-user-jobs` |
| `/etc/shadow` (future checks), full `/proc/[pid]/exe` visibility | `deleted-binary-running`, filesystem checks (Phase 2) |

A sudoers allowlist of specific read-only commands was the alternative considered — rejected because the list of commands needed is long, grows every time a new check is added, and command-level allowlisting is easy to get subtly wrong (argument injection, symlink tricks) without actually reducing the blast radius much: an agent that can run `cat /etc/shadow`, list every user's crontab, and read any home directory as root via sudo already has effectively the same read access as root.

Instead: **the agent runs as root, sandboxed by systemd** (see `servermend-agent.service`):

- `ProtectSystem=strict` — the entire filesystem is read-only to the process except `ReadWritePaths=/var/lib/servermend` (the baseline file).
- `ProtectHome=read-only` — home directories are readable (needed for keys/shell-profile checks) but never writable.
- `NoNewPrivileges=yes` — the process can never escalate beyond what it starts with.
- `PrivateTmp=yes`, `ProtectKernelModules=yes`, `ProtectControlGroups=yes`, `MemoryDenyWriteExecute=yes` — standard systemd hardening, closing off capabilities the agent has no legitimate use for.

This gives read access to everything the check catalog needs, while a compromised agent process still can't write outside `/var/lib/servermend`, load a kernel module, escalate privileges, or persist itself — which matters given the agent's own design principle of being "dumb and safe."

## What does NOT need root

Most exposure and Docker checks work from an unprivileged account (they read `/proc/net/tcp` directly, or `stat` file permissions) — see `checks/database.go` and `checks/docker.go`. Root is specifically for the persistence category's baseline-diffing checks. If a future deployment mode wants a non-root agent, those checks are the ones to gate off, not the whole binary.
