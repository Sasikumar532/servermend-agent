// The full 60-check catalog as backend-owned metadata (severity, rationale,
// fix commands, reference). checkId/category here must match what the Go
// agent actually reports — see agent/checks/*.go. Kept as plain data,
// separate from the Mongoose model, so the rules engine and its tests can
// use it without a database connection; scripts/seedCheckDefinitions.js
// upserts it into MongoDB.
export const checkCatalog = [
  // --- ssh ---
  {
    checkId: "ssh-root-login",
    category: "ssh",
    title: "PermitRootLogin is yes in sshd_config",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Direct root SSH access is the #1 target for automated brute-force bots.",
    reference: "man sshd_config",
    fixCommandsByDistro: {
      generic:
        "sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config && systemctl restart sshd",
    },
  },
  {
    checkId: "ssh-password-auth",
    category: "ssh",
    title: "PasswordAuthentication is yes",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Often the actual entry point, more than root login itself.",
    reference: "man sshd_config",
    fixCommandsByDistro: {
      generic:
        "sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl restart sshd",
    },
  },
  {
    checkId: "ssh-empty-passwords",
    category: "ssh",
    title: "PermitEmptyPasswords is yes, or an account has an empty password",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Trivial compromise.",
    reference: "man sshd_config",
    fixCommandsByDistro: {
      generic:
        "sed -i 's/^#\\?PermitEmptyPasswords.*/PermitEmptyPasswords no/' /etc/ssh/sshd_config; passwd -l <affected-user>",
    },
  },
  {
    checkId: "ssh-weak-ciphers",
    category: "ssh",
    title: "Weak ciphers/MACs/KexAlgorithms enabled",
    priority: "mvp",
    severityDefault: "medium",
    rationale: "Downgrade/MITM exposure.",
    reference: "man sshd_config",
    fixCommandsByDistro: {
      generic:
        'echo "Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com" >> /etc/ssh/sshd_config && systemctl restart sshd',
    },
  },
  {
    checkId: "ssh-protocol-version",
    category: "ssh",
    title: "Legacy SSHv1 support",
    priority: "mvp",
    severityDefault: "high",
    rationale: "Deprecated, broken crypto.",
    reference: "man sshd_config",
    fixCommandsByDistro: {
      generic: "remove any 'Protocol 1' line from /etc/ssh/sshd_config and restart sshd",
    },
  },
  {
    checkId: "ssh-authorized-keys-diff",
    category: "ssh",
    title: "authorized_keys contains keys not in known baseline",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Classic persistence mechanism after a compromise.",
    reference: "man authorized_keys",
    fixCommandsByDistro: {
      generic: "review ~/.ssh/authorized_keys, remove any unrecognized key, then rotate legitimate keys",
    },
  },
  {
    checkId: "ssh-port-default",
    category: "ssh",
    title: "SSH still listening on port 22",
    priority: "mvp",
    severityDefault: "low",
    rationale: "Not a real fix, but affects bot-scan volume — report, don't over-weight.",
    reference: "man sshd_config",
    fixCommandsByDistro: {
      generic: "optionally set Port <non-default> in /etc/ssh/sshd_config (informational only)",
    },
  },
  {
    checkId: "ssh-failed-login-rate",
    category: "ssh",
    title: "Elevated failed auth attempts in auth log",
    priority: "mvp",
    severityDefault: "medium",
    rationale: "Signals active brute-force targeting.",
    reference: "man fail2ban",
    fixCommandsByDistro: {
      debian: "apt install -y fail2ban && systemctl enable --now fail2ban",
      rhel: "dnf install -y fail2ban && systemctl enable --now fail2ban",
    },
  },
  {
    checkId: "sudo-nopasswd",
    category: "ssh",
    title: "Passwordless sudo (NOPASSWD) on non-service accounts",
    priority: "mvp",
    severityDefault: "high",
    rationale: "Privilege escalation if the account is compromised.",
    reference: "man sudoers",
    fixCommandsByDistro: {
      generic: "visudo — remove NOPASSWD for human accounts in /etc/sudoers and /etc/sudoers.d/*",
    },
  },
  {
    checkId: "sudo-broad-entries",
    category: "ssh",
    title: "Overly broad sudoers rules for individual users",
    priority: "mvp",
    severityDefault: "medium",
    rationale: "Excess privilege.",
    reference: "man sudoers",
    fixCommandsByDistro: {
      generic: "visudo — replace per-user ALL=(ALL) ALL grants with a scoped command list or an admin group",
    },
  },

  // --- firewall ---
  {
    checkId: "firewall-active",
    category: "firewall",
    title: "UFW/iptables/nftables not active at all",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "No perimeter control.",
    reference: "man ufw",
    fixCommandsByDistro: {
      debian: "ufw enable",
      rhel: "systemctl enable --now firewalld",
    },
  },
  {
    checkId: "firewall-default-policy",
    category: "firewall",
    title: "Default inbound policy is ACCEPT rather than DENY",
    priority: "mvp",
    severityDefault: "high",
    rationale: "Fail-open posture.",
    reference: "man iptables",
    fixCommandsByDistro: {
      generic: "iptables -P INPUT DROP  # only after explicit allow rules for needed ports are in place",
    },
  },
  {
    checkId: "firewall-exposed-admin-ports",
    category: "firewall",
    title: "Admin ports open to 0.0.0.0/0",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Direct exposure to internet scanning.",
    reference: "man iptables",
    fixCommandsByDistro: {
      generic: "bind admin services to 127.0.0.1 or a private interface, or restrict via firewall to known source IPs",
    },
  },

  // --- network ---
  {
    checkId: "open-ports-scan",
    category: "network",
    title: "Enumerate all listening ports and bound interfaces",
    priority: "mvp",
    // Deliberately no severityDefault — informational, feeds drift
    // detection rather than being a pass/fail finding in its own right.
    rationale: "Baseline for drift detection.",
    reference: "ss(8)",
    fixCommandsByDistro: {},
  },

  // --- process ---
  {
    checkId: "apps-running-as-root",
    category: "process",
    title: "Application/service processes running as root",
    priority: "mvp",
    severityDefault: "high",
    rationale: "Limits the blast radius of an app-level compromise.",
    reference: "systemd.exec(5) — User=",
    fixCommandsByDistro: {
      generic: "create a dedicated unprivileged user for the app and set User= in its systemd unit",
    },
  },
  {
    checkId: "fail2ban-installed",
    category: "process",
    title: "fail2ban (or equivalent) not installed/running",
    priority: "mvp",
    severityDefault: "medium",
    rationale: "No automated brute-force mitigation.",
    reference: "man fail2ban",
    fixCommandsByDistro: {
      debian: "apt install -y fail2ban && systemctl enable --now fail2ban",
      rhel: "dnf install -y fail2ban && systemctl enable --now fail2ban",
    },
  },
  {
    checkId: "unattended-upgrades-active",
    category: "process",
    title: "Package installed but not actually enabled/working",
    priority: "mvp",
    severityDefault: "high",
    rationale: 'False sense of security — flag "installed but broken" separately from "not installed".',
    reference: "man unattended-upgrades",
    fixCommandsByDistro: {
      debian: "apt install -y unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades",
      rhel: "dnf install -y dnf-automatic && systemctl enable --now dnf-automatic-install.timer",
    },
  },
  {
    checkId: "kernel-version-outdated",
    category: "process",
    title: "Running kernel is significantly behind latest for the distro",
    priority: "mvp",
    severityDefault: "medium",
    rationale: "Known local-privesc CVEs.",
    reference: "distro security advisories",
    fixCommandsByDistro: {
      debian: "apt update && apt install -y linux-image-generic && reboot",
      rhel: "dnf update kernel && reboot",
    },
  },

  // --- persistence ---
  {
    checkId: "cron-system-jobs",
    category: "persistence",
    title: "Unrecognized/recently modified entries in /etc/cron.*",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Classic miner/backdoor persistence.",
    reference: "man crontab",
    fixCommandsByDistro: {
      generic: "inspect and remove unrecognized cron entries; investigate how they were added",
    },
  },
  {
    checkId: "cron-user-jobs",
    category: "persistence",
    title: "Unrecognized entries in per-user crontabs",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Same, scoped to compromised user accounts.",
    reference: "man crontab",
    fixCommandsByDistro: {
      generic: "crontab -l -u <user> to review; crontab -e -u <user> to remove unrecognized entries",
    },
  },
  {
    checkId: "systemd-unexpected-units",
    category: "persistence",
    title: "Unrecognized .timer/.service units set to auto-start",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Modern equivalent of cron persistence.",
    reference: "man systemctl",
    fixCommandsByDistro: {
      generic: "systemctl disable --now <unit> && rm /etc/systemd/system/<unit> && systemctl daemon-reload",
    },
  },
  {
    checkId: "ld-preload-hijack",
    category: "persistence",
    title: "LD_PRELOAD env var set, or /etc/ld.so.preload non-empty",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Classic rootkit/library-injection technique.",
    reference: "man ld.so",
    fixCommandsByDistro: {
      generic: "empty /etc/ld.so.preload after confirming the listed library is malicious; investigate how it was added",
    },
  },
  {
    checkId: "shell-profile-tampering",
    category: "persistence",
    title: "Suspicious additions to .bashrc/.profile/.bash_profile",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Common persistence + re-infection vector.",
    reference: "man bash",
    fixCommandsByDistro: {
      generic: "remove the suspicious lines from the affected profile file(s); rotate credentials for the account",
    },
  },
  {
    checkId: "path-world-writable",
    category: "persistence",
    title: "World-writable directories in $PATH",
    priority: "mvp",
    severityDefault: "high",
    rationale: "Allows binary-name hijacking.",
    reference: "man path_resolution",
    fixCommandsByDistro: {
      generic: "chmod o-w <directory>  # for each flagged directory",
    },
  },
  {
    checkId: "suid-sgid-unexpected",
    category: "persistence",
    title: "Unexpected SUID/SGID binaries",
    priority: "mvp",
    severityDefault: "high",
    rationale: "Privilege escalation surface.",
    reference: "man chmod",
    fixCommandsByDistro: {
      generic: "chmod u-s,g-s <path>  # after confirming the binary shouldn't be SUID/SGID",
    },
  },
  {
    checkId: "deleted-binary-running",
    category: "persistence",
    title: "Running process whose /proc/[pid]/exe points to a deleted file",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Strong malware/miner indicator — binary deleted after execution to evade detection.",
    reference: "man proc",
    fixCommandsByDistro: {
      generic: "kill -9 <pid> after investigation; identify and remove the persistence mechanism that launched it",
    },
  },

  // --- docker ---
  {
    checkId: "docker-socket-exposed",
    category: "docker",
    title: "docker.sock exposed to containers or network without restriction",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Full host compromise if abused.",
    reference: "https://docs.docker.com/engine/security/",
    fixCommandsByDistro: {
      generic: "chmod 660 /var/run/docker.sock  # only root and the docker group should have access",
    },
  },
  {
    checkId: "docker-daemon-tcp-no-tls",
    category: "docker",
    title: "Docker daemon listening on TCP without TLS",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Instant remote-compromise misconfiguration — treat as top-tier severity.",
    reference: "https://docs.docker.com/engine/security/protect-access/",
    fixCommandsByDistro: {
      generic:
        "remove -H tcp://... from the Docker daemon config, or add TLS (--tlsverify --tlscacert ...) if remote access is required",
    },
  },
  {
    checkId: "docker-privileged-containers",
    category: "docker",
    title: "Containers running with --privileged",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Effectively root on the host.",
    reference: "https://docs.docker.com/engine/security/",
    fixCommandsByDistro: {
      generic: "remove --privileged and grant only the specific capabilities the container needs via --cap-add",
    },
  },
  {
    checkId: "docker-container-root-user",
    category: "docker",
    title: "Containers running as root inside the container (no USER directive)",
    priority: "mvp",
    severityDefault: "high",
    rationale: "Unnecessary escalation surface.",
    reference: "https://docs.docker.com/engine/reference/builder/#user",
    fixCommandsByDistro: {
      generic: "add a USER directive to the Dockerfile, or pass --user <uid> at run time",
    },
  },
  {
    checkId: "docker-ports-bound-public",
    category: "docker",
    title: "Container ports bound to 0.0.0.0 instead of 127.0.0.1 where not intended",
    priority: "mvp",
    severityDefault: "high",
    rationale: "Very common Coolify/Dokploy default misconfig.",
    reference: "https://docs.docker.com/network/",
    fixCommandsByDistro: {
      generic:
        "change port publishing from -p 0.0.0.0:PORT:PORT to -p 127.0.0.1:PORT:PORT unless public exposure is intended",
    },
  },
  {
    checkId: "docker-untrusted-registry",
    category: "docker",
    title: "Images pulled from unverified/non-pinned registries",
    priority: "mvp",
    severityDefault: "medium",
    rationale: "Supply-chain risk.",
    reference: "https://docs.docker.com/engine/security/trust/",
    fixCommandsByDistro: {
      generic: "pin images by digest (image@sha256:...) and pull only from an explicitly allowlisted registry",
    },
  },
  {
    checkId: "docker-secrets-in-image",
    category: "docker",
    title: ".env or secrets baked into image layers or build context",
    priority: "mvp",
    severityDefault: "high",
    rationale: "Credential leakage.",
    reference: "https://docs.docker.com/build/building/secrets/",
    fixCommandsByDistro: {
      generic:
        "remove secrets from the Dockerfile/build context, use --secret at build time or runtime env vars instead, and rebuild from a clean history",
    },
  },

  // --- database ---
  {
    checkId: "redis-unauthenticated-exposed",
    category: "database",
    title: "Redis reachable externally with no requirepass set",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Directly exploitable for RCE via CONFIG SET (write SSH keys/cron).",
    reference: "https://redis.io/docs/latest/operate/oss_and_stack/management/security/",
    fixCommandsByDistro: {
      generic: "set requirepass <strong-password> in redis.conf, bind to a private interface, restart redis",
    },
  },
  {
    checkId: "postgres-default-exposed",
    category: "database",
    title: "Postgres reachable externally with default/weak creds",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Direct data/host compromise path.",
    reference: "https://www.postgresql.org/docs/current/auth-pg-hba-conf.html",
    fixCommandsByDistro: {
      generic:
        "set a strong password for all roles, restrict pg_hba.conf to known source IPs, bind to a private interface",
    },
  },
  {
    checkId: "mysql-default-exposed",
    category: "database",
    title: "MySQL reachable externally with default/weak creds",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Direct data/host compromise path.",
    reference: "https://dev.mysql.com/doc/refman/8.0/en/security.html",
    fixCommandsByDistro: {
      generic: "ALTER USER with a strong password for all accounts; set bind-address to a private interface",
    },
  },
  {
    checkId: "mongodb-noauth-exposed",
    category: "database",
    title: "MongoDB reachable externally with no auth",
    priority: "mvp",
    severityDefault: "critical",
    rationale: 'Historically one of the most-hit "found and wiped" services.',
    reference: "https://www.mongodb.com/docs/manual/tutorial/enable-authentication/",
    fixCommandsByDistro: {
      generic: "enable security.authorization in mongod.conf, create an admin user, bind to a private interface",
    },
  },
  {
    checkId: "db-default-credentials",
    category: "database",
    title: "Any DB using known default username/password pairs",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Trivial credential-stuffing target.",
    reference: "OWASP: Testing for Default Credentials",
    fixCommandsByDistro: {
      generic: "rotate credentials immediately for every account that accepted a default/weak password",
    },
  },

  // --- filesystem ---
  {
    checkId: "shadow-file-permissions",
    category: "filesystem",
    title: "/etc/shadow readable by non-root",
    priority: "mvp",
    severityDefault: "critical",
    rationale: "Password hash exposure.",
    reference: "man shadow",
    fixCommandsByDistro: {
      generic: "chmod 640 /etc/shadow && chown root:shadow /etc/shadow",
    },
  },
  {
    checkId: "ssh-private-key-permissions",
    category: "filesystem",
    title: "Private keys (e.g. ~/.ssh/id_rsa) not mode 600",
    priority: "mvp",
    severityDefault: "high",
    rationale: "Key theft risk.",
    reference: "man ssh",
    fixCommandsByDistro: {
      generic: "chmod 600 <key-path>",
    },
  },
  {
    checkId: "secrets-plaintext-broad-read",
    category: "filesystem",
    title: "Env files with secrets readable by non-owner users",
    priority: "mvp",
    severityDefault: "high",
    rationale: "Credential leakage.",
    reference: "man chmod",
    fixCommandsByDistro: {
      generic: "chmod 600 <file> && chown <app-user>:<app-user> <file>",
    },
  },

  // --- sysctl (Phase 2) ---
  {
    checkId: "sysctl-ip-forward",
    category: "sysctl",
    title: "net.ipv4.ip_forward enabled unexpectedly",
    priority: "phase2",
    severityDefault: "medium",
    rationale: "Unintended routing/pivot risk.",
    reference: "man sysctl.conf",
    fixCommandsByDistro: {
      generic:
        "sysctl -w net.ipv4.ip_forward=0 && echo net.ipv4.ip_forward=0 >> /etc/sysctl.d/99-servermend.conf  # skip if Docker requires it",
    },
  },
  {
    checkId: "sysctl-icmp-redirects",
    category: "sysctl",
    title: "ICMP redirects accepted",
    priority: "phase2",
    severityDefault: "medium",
    rationale: "MITM-style attack vector.",
    reference: "man sysctl.conf",
    fixCommandsByDistro: {
      generic:
        "sysctl -w net.ipv4.conf.all.accept_redirects=0 && echo net.ipv4.conf.all.accept_redirects=0 >> /etc/sysctl.d/99-servermend.conf",
    },
  },
  {
    checkId: "sysctl-syn-cookies",
    category: "sysctl",
    title: "SYN cookies disabled",
    priority: "phase2",
    severityDefault: "medium",
    rationale: "DoS exposure.",
    reference: "man sysctl.conf",
    fixCommandsByDistro: {
      generic:
        "sysctl -w net.ipv4.tcp_syncookies=1 && echo net.ipv4.tcp_syncookies=1 >> /etc/sysctl.d/99-servermend.conf",
    },
  },
  {
    checkId: "sysctl-aslr-disabled",
    category: "sysctl",
    title: "kernel.randomize_va_space disabled",
    priority: "phase2",
    severityDefault: "medium",
    rationale: "Weakens exploit mitigation.",
    reference: "man sysctl.conf",
    fixCommandsByDistro: {
      generic:
        "sysctl -w kernel.randomize_va_space=2 && echo kernel.randomize_va_space=2 >> /etc/sysctl.d/99-servermend.conf",
    },
  },
  {
    checkId: "core-dumps-world-readable",
    category: "sysctl",
    title: "Core dumps readable by other users",
    priority: "phase2",
    severityDefault: "low",
    rationale: "Can leak secrets from crashed processes.",
    reference: "man sysctl.conf",
    fixCommandsByDistro: {
      generic: "sysctl -w fs.suid_dumpable=0 && echo fs.suid_dumpable=0 >> /etc/sysctl.d/99-servermend.conf",
    },
  },
  {
    checkId: "tmp-noexec",
    category: "sysctl",
    title: "/tmp and /var/tmp not mounted noexec",
    priority: "phase2",
    severityDefault: "medium",
    rationale: "Positive control against drive-by script/miner execution.",
    reference: "man fstab",
    fixCommandsByDistro: {
      generic: "add 'noexec' to the mount options for /tmp and /var/tmp in /etc/fstab, then remount",
    },
  },

  // --- nginx (Phase 2) ---
  {
    checkId: "nginx-server-tokens",
    category: "nginx",
    title: "server_tokens not set to off",
    priority: "phase2",
    severityDefault: "low",
    rationale: "Version disclosure aids targeted exploits.",
    reference: "https://nginx.org/en/docs/http/ngx_http_core_module.html#server_tokens",
    fixCommandsByDistro: {
      generic: "add 'server_tokens off;' to the http {} block of nginx.conf, then: nginx -s reload",
    },
  },
  {
    checkId: "nginx-tls-weak-config",
    category: "nginx",
    title: "Weak TLS protocols/ciphers, missing HSTS",
    priority: "phase2",
    severityDefault: "medium",
    rationale: "Transport security gap.",
    reference: "https://nginx.org/en/docs/http/ngx_http_ssl_module.html",
    fixCommandsByDistro: {
      generic:
        'set ssl_protocols TLSv1.2 TLSv1.3; and add add_header Strict-Transport-Security "max-age=63072000" always;, then: nginx -s reload',
    },
  },
  {
    checkId: "nginx-directory-listing",
    category: "nginx",
    title: "Directory listing enabled",
    priority: "phase2",
    severityDefault: "medium",
    rationale: "Information disclosure.",
    reference: "https://nginx.org/en/docs/http/ngx_http_autoindex_module.html",
    fixCommandsByDistro: {
      generic: "set 'autoindex off;' in the relevant location block, then: nginx -s reload",
    },
  },
  {
    checkId: "nginx-default-artifacts",
    category: "nginx",
    title: "Default nginx site or sample files (e.g. phpinfo.php) still present",
    priority: "phase2",
    severityDefault: "medium",
    rationale: "Common leftover from quick setups.",
    reference: "https://nginx.org/en/docs/",
    fixCommandsByDistro: {
      generic: "remove the default site/sample files and disable the default server block",
    },
  },

  // --- logging (Phase 2) ---
  {
    checkId: "logging-enabled",
    category: "logging",
    title: "No meaningful auth.log/journald retention configured",
    priority: "phase2",
    severityDefault: "medium",
    rationale: "Can't investigate an incident after the fact.",
    reference: "man journald.conf",
    fixCommandsByDistro: {
      generic: "ensure rsyslog/journald is running and persistent storage is enabled for auth logs",
    },
  },
  {
    checkId: "log-rotation-configured",
    category: "logging",
    title: "No log rotation set up",
    priority: "phase2",
    severityDefault: "low",
    rationale: "Unbounded log growth leads to disk-full outages.",
    reference: "man logrotate",
    fixCommandsByDistro: {
      debian: "apt install -y logrotate",
      rhel: "dnf install -y logrotate",
      generic: "or set SystemMaxUse= in /etc/systemd/journald.conf",
    },
  },
  {
    checkId: "auditd-present",
    category: "logging",
    title: "auditd not installed",
    priority: "phase2",
    severityDefault: "low",
    rationale: "Deeper forensic capability.",
    reference: "man auditd",
    fixCommandsByDistro: {
      debian: "apt install -y auditd && systemctl enable --now auditd",
      rhel: "dnf install -y audit && systemctl enable --now auditd",
    },
  },

  // --- anomaly (Phase 2) ---
  {
    checkId: "miner-process-signature",
    category: "anomaly",
    title: "Running process matches known XMRig/miner binary signatures",
    priority: "phase2",
    severityDefault: "critical",
    rationale: "Direct compromise detection.",
    reference: "https://attack.mitre.org/techniques/T1496/",
    fixCommandsByDistro: {
      generic: "kill -9 <pid>; identify and remove the persistence mechanism; rotate exposed credentials",
    },
  },
  {
    checkId: "outbound-mining-pool-connection",
    category: "anomaly",
    title: "Established connections to known mining-pool domains/ports",
    priority: "phase2",
    severityDefault: "critical",
    rationale: "Active exfiltration/mining indicator.",
    reference: "https://attack.mitre.org/techniques/T1496/",
    fixCommandsByDistro: {
      generic: "identify the owning process (ss -tp), kill it, and investigate how it was installed",
    },
  },
  {
    checkId: "sustained-high-cpu-unexpected-process",
    category: "anomaly",
    title: "Sustained high CPU from a process outside the expected app set",
    priority: "phase2",
    severityDefault: "high",
    rationale: 'Early anomaly signal, feeds AI triage layer ("miner, backup job, or traffic burst?").',
    reference: "top(1), ps(1)",
    fixCommandsByDistro: {
      generic: "investigate the flagged process; if malicious, kill it and remove its persistence mechanism",
    },
  },
  {
    checkId: "high-outbound-connection-count",
    category: "anomaly",
    title: "Unusually high number of established outbound connections",
    priority: "phase2",
    severityDefault: "medium",
    rationale: "Possible botnet/DDoS participation.",
    reference: "ss(8)",
    fixCommandsByDistro: {
      generic: "identify the owning process(es) (ss -tp) and investigate; check for a compromised app or credential",
    },
  },

  // --- cloud (Later) ---
  {
    checkId: "cloud-metadata-endpoint-reachable",
    category: "cloud",
    title: "169.254.169.254 reachable from app context",
    priority: "later",
    severityDefault: "high",
    rationale: "SSRF-to-credential-theft escalation path if any app on the box is vulnerable.",
    reference: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html",
    fixCommandsByDistro: {
      generic: "enforce IMDSv2-only at the cloud-provider level and/or firewall off 169.254.169.254 from apps that don't need it",
    },
  },
  {
    checkId: "cloud-credentials-plaintext",
    category: "cloud",
    title: "Cloud/provider API keys or backup credentials stored in plaintext",
    priority: "later",
    severityDefault: "high",
    rationale: "Lateral movement / account takeover risk.",
    reference: "https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html",
    fixCommandsByDistro: {
      generic: "chmod 600 the credential file and chown to the owning user only; consider a secrets manager instead",
    },
  },
];
