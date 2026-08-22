// Populates a realistic fleet for local UI development/testing — so the
// dashboards have something worth looking at without running real agents
// against real servers. Every value it produces goes through the actual
// app (via supertest, no real port bound) rather than writing Mongo
// documents by hand: signup, server registration, report ingestion, and
// baseline pushes all hit the real routes, so scores are computed by the
// real rulesEngine, alerts by the real detectNewCriticalFailures, and
// server/report shapes can never drift from what routes/*.js actually
// produce.
//
// Not wired into `npm run seed` (that's check-definition seeding, which
// every environment needs) — run explicitly with `npm run seed:demo`.
// Safe to re-run: it looks up the demo user by email and reuses it rather
// than erroring on a duplicate signup, but does create a fresh set of
// servers/reports each time (no dedup on those — re-run against a
// throwaway/dev database, not one you want to keep clean).

import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import request from "supertest";
import { createApp } from "../app.js";
import { seedCheckDefinitions } from "./seedCheckDefinitions.js";
import { checkCatalog } from "../data/checkCatalog.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";

const DEMO_EMAIL = "demo@servermend.io";
const DEMO_PASSWORD = "servermend-demo-fleet";

// Same persona the source design ("ServerMend User App", imported from
// claude.ai/design) uses throughout its own mock data.
const DEMO_PROFILE = {
  firstName: "Ada",
  lastName: "Lovelace",
  companyName: "Analytical Engines Ltd",
  position: "Security Engineer",
  mobileNumber: "+1 555 0142",
};

// One shared realistic detail line per failing checkId — reused across
// every server that fails that check, since the underlying misconfiguration
// reads the same regardless of which host has it.
const FAIL_DETAIL = {
  "ssh-root-login": "PermitRootLogin yes in /etc/ssh/sshd_config",
  "ssh-password-auth": "PasswordAuthentication yes in /etc/ssh/sshd_config",
  "ssh-empty-passwords": "PermitEmptyPasswords yes in /etc/ssh/sshd_config",
  "ssh-weak-ciphers": "3des-cbc still listed in sshd_config Ciphers",
  "firewall-active": "ufw inactive",
  "firewall-default-policy": "default policy ACCEPT on INPUT chain",
  "firewall-exposed-admin-ports": "9090 (cAdvisor) reachable from 0.0.0.0/0",
  "apps-running-as-root": "node server.js running as uid 0",
  "fail2ban-installed": "fail2ban-client: command not found",
  "unattended-upgrades-active": "unattended-upgrades package not installed",
  "kernel-version-outdated": "running 5.4.0-42, 5.4.0-190 available",
  "cron-system-jobs": "unexpected entry in /etc/cron.d/  — not in confirmed baseline",
  "cron-user-jobs": "unexpected entry in deploy's crontab — not in confirmed baseline",
  "systemd-unexpected-units": "sm-relay.service enabled, not in confirmed baseline",
  "ld-preload-hijack": "/etc/ld.so.preload is non-empty",
  "docker-socket-exposed": "/var/run/docker.sock mounted into 1 running container",
  "docker-daemon-tcp-no-tls": "dockerd -H tcp://0.0.0.0:2375 with no --tlsverify",
  "docker-privileged-containers": "1 container running with --privileged",
  "docker-container-root-user": "3 containers running as root (no USER directive)",
  "redis-unauthenticated-exposed": "redis-server bound to 0.0.0.0:6379; no requirepass set",
  "postgres-default-exposed": "postgres role 'postgres' accepts password 'postgres' over TCP",
  "mysql-default-exposed": "mysql root@% accepts empty password",
  "mongodb-noauth-exposed": "mongod --bind_ip 0.0.0.0 with no --auth",
  "shadow-file-permissions": "/etc/shadow mode 644 (expected 640 or stricter)",
  "ssh-private-key-permissions": "/home/deploy/.ssh/id_rsa mode 644",
  "secrets-plaintext-broad-read": "/srv/app/.env mode 644, contains DATABASE_URL",
  "sysctl-ip-forward": "net.ipv4.ip_forward = 1",
  "sysctl-icmp-redirects": "net.ipv4.conf.all.accept_redirects = 1",
  "sysctl-syn-cookies": "net.ipv4.tcp_syncookies = 0",
  "sysctl-aslr-disabled": "kernel.randomize_va_space = 0",
  "nginx-server-tokens": "server_tokens on; in nginx.conf",
  "nginx-tls-weak-config": "TLSv1.1 still enabled in ssl_protocols",
  "nginx-directory-listing": "autoindex on; on /uploads/ location block",
  "nginx-default-artifacts": "/usr/share/nginx/html/index.html (default page) still present",
  "logging-enabled": "rsyslog inactive",
  "log-rotation-configured": "no /etc/logrotate.d/app entry",
  "auditd-present": "auditd package not installed",
  "miner-process-signature": "process 'xmrig' running under user www-data",
  "outbound-mining-pool-connection": "outbound connection to pool.minexmr.com:4444",
  "sustained-high-cpu-unexpected-process": "'kworker_fake' at 98% CPU for 40+ minutes",
  "high-outbound-connection-count": "3400 concurrent outbound connections from single process",
  "cloud-metadata-endpoint-reachable": "169.254.169.254 reachable from app container network",
  "cloud-credentials-plaintext": "AWS credentials in /home/deploy/.aws/credentials, world-readable",
};

// Which checks fail per server, and how the score should generally read —
// deliberately spans the full pass/fail range like the source design's own
// fleet does (a genuinely bad host, a genuinely clean one, several in
// between), across findings from most of checkCatalog's categories so the
// dashboard's "findings by category" breakdown has real substance.
const DEMO_SERVERS = [
  {
    hostname: "web-1.example.com",
    agentVersion: "1.4.2",
    // Tuned against the real scoreReport algorithm (see rulesEngine.js) to
    // land under 70 — with a category-floor average across ~13 categories,
    // a couple of criticals in one or two categories barely dents the
    // overall, so "the bad server" needs failures spread across most
    // categories, not just concentrated in one or two.
    failing: [
      "ssh-root-login",
      "ssh-password-auth",
      "ssh-empty-passwords",
      "firewall-active",
      "firewall-default-policy",
      "firewall-exposed-admin-ports",
      "apps-running-as-root",
      "fail2ban-installed",
      "unattended-upgrades-active",
      "cron-system-jobs",
      "cron-user-jobs",
      "systemd-unexpected-units",
      "ld-preload-hijack",
      "docker-socket-exposed",
      "docker-privileged-containers",
      "docker-container-root-user",
      "docker-daemon-tcp-no-tls",
      "shadow-file-permissions",
      "ssh-private-key-permissions",
      "secrets-plaintext-broad-read",
      "nginx-server-tokens",
      "nginx-directory-listing",
      "nginx-default-artifacts",
      "logging-enabled",
      "auditd-present",
      "redis-unauthenticated-exposed",
      "mysql-default-exposed",
      "sysctl-syn-cookies",
      "sysctl-aslr-disabled",
      "sysctl-ip-forward",
      "sustained-high-cpu-unexpected-process",
      "high-outbound-connection-count",
      "cloud-metadata-endpoint-reachable",
      "cloud-credentials-plaintext",
    ],
    baseline: "confirmed",
  },
  {
    hostname: "web-2.example.com",
    agentVersion: "1.4.2",
    failing: [
      "ssh-weak-ciphers",
      "kernel-version-outdated",
      "nginx-tls-weak-config",
      "log-rotation-configured",
      "sysctl-ip-forward",
      "sysctl-icmp-redirects",
      "docker-container-root-user",
    ],
  },
  {
    hostname: "db-primary.example.com",
    agentVersion: "1.4.2",
    failing: [
      "redis-unauthenticated-exposed",
      "postgres-default-exposed",
      "mongodb-noauth-exposed",
      "mysql-default-exposed",
      "ssh-root-login",
      "ssh-password-auth",
      "ssh-empty-passwords",
      "shadow-file-permissions",
      "ssh-private-key-permissions",
      "secrets-plaintext-broad-read",
      "sysctl-syn-cookies",
      "sysctl-aslr-disabled",
      "sysctl-ip-forward",
      "cron-system-jobs",
      "ld-preload-hijack",
      "systemd-unexpected-units",
      "cloud-credentials-plaintext",
      "cloud-metadata-endpoint-reachable",
      "firewall-active",
      "firewall-default-policy",
      "apps-running-as-root",
      "unattended-upgrades-active",
      "docker-socket-exposed",
      "docker-daemon-tcp-no-tls",
      "nginx-tls-weak-config",
      "nginx-directory-listing",
      "logging-enabled",
      "log-rotation-configured",
      "miner-process-signature",
    ],
    baseline: "pending", // gets a second, drifted baseline push below
  },
  {
    hostname: "db-replica.example.com",
    agentVersion: "1.4.2",
    failing: ["cloud-metadata-endpoint-reachable"],
  },
  {
    hostname: "coolify-01.example.com",
    agentVersion: "1.4.2",
    failing: [],
  },
  {
    hostname: "build-runner.example.com",
    agentVersion: "1.3.9",
    failing: ["docker-socket-exposed", "docker-container-root-user"],
  },
  {
    hostname: "staging-app.example.com",
    agentVersion: "1.4.2",
    failing: ["nginx-directory-listing"],
  },
  // No `failing` / never gets a report at all — the "never seen" case.
  { hostname: "edge-proxy.example.com", agentVersion: null },
];

function buildFindings(failingIds) {
  const failingSet = new Set(failingIds);
  return checkCatalog.map((check) => {
    const failing = failingSet.has(check.checkId);
    return {
      id: check.checkId,
      category: check.category,
      title: check.title,
      status: failing ? "fail" : "pass",
      detail: failing ? (FAIL_DETAIL[check.checkId] ?? "does not match expected configuration") : "matches expected configuration",
    };
  });
}

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

async function findOrCreateDemoUser(app) {
  const existing = await User.findOne({ email: DEMO_EMAIL }).lean();
  if (existing) {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (login.status === 200) return login.body.token;
    // Password must have changed out from under this script at some
    // point — recreate rather than getting stuck.
    await User.deleteOne({ email: DEMO_EMAIL });
  }

  const signup = await request(app)
    .post("/api/v1/auth/signup")
    .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (signup.status !== 201) {
    throw new Error(`demo signup failed: ${signup.status} ${JSON.stringify(signup.body)}`);
  }
  return signup.body.token;
}

async function main() {
  await mongoose.connect(env.mongoUri);
  await seedCheckDefinitions();

  const app = createApp();
  const token = await findOrCreateDemoUser(app);
  const auth = (req) => req.set("Authorization", `Bearer ${token}`);

  await auth(request(app).patch("/api/v1/me")).send(DEMO_PROFILE);

  for (const spec of DEMO_SERVERS) {
    const created = await auth(request(app).post("/api/v1/servers")).send({ hostname: spec.hostname });
    if (created.status !== 201) {
      console.error(`failed to create ${spec.hostname}: ${created.status} ${JSON.stringify(created.body)}`);
      continue;
    }
    const { serverId, apiKey } = created.body;
    const agentAuth = (req) => req.set("Authorization", `Bearer ${apiKey}`);

    if (!spec.agentVersion) {
      console.log(`${spec.hostname}: created, no report (never seen)`);
      continue;
    }

    // Two reports: an older one with fewer failures, then the current one
    // (spec.failing) — gives the Reports tab real history and, when the
    // current report introduces a new critical failure versus the first,
    // a real Alert row (see detectNewCriticalFailures.js).
    const earlierFailing = spec.failing.slice(Math.ceil(spec.failing.length / 2));
    await agentAuth(request(app).post("/api/v1/reports")).send({
      server_id: serverId,
      agent_version: spec.agentVersion,
      timestamp: daysAgo(6),
      findings: buildFindings(earlierFailing),
    });
    const latest = await agentAuth(request(app).post("/api/v1/reports")).send({
      server_id: serverId,
      agent_version: spec.agentVersion,
      timestamp: daysAgo(0),
      findings: buildFindings(spec.failing),
    });

    if (spec.baseline) {
      const firstBaseline = {
        captured_at: daysAgo(6),
        authorized_keys: ["ssh-ed25519 AAAAC3... deploy@ci.servermend.io"],
        system_cron_entries: ["0 3 * * * root /usr/local/bin/backup.sh"],
        user_cron_entries: [],
        systemd_units: ["servermend-agent.service", "app.service"],
        suid_binaries: ["/usr/bin/sudo", "/usr/bin/passwd"],
      };
      await agentAuth(request(app).post(`/api/v1/servers/${serverId}/baseline`)).send({
        server_id: serverId,
        baseline: firstBaseline,
      });

      if (spec.baseline === "pending") {
        await agentAuth(request(app).post(`/api/v1/servers/${serverId}/baseline`)).send({
          server_id: serverId,
          baseline: {
            ...firstBaseline,
            captured_at: daysAgo(0),
            system_cron_entries: [...firstBaseline.system_cron_entries, "*/5 * * * * root /opt/sync/push.sh"],
          },
        });
      }
    }

    console.log(`${spec.hostname}: score ${latest.body?.score?.overall ?? "?"}`);
  }

  console.log(`\nSigned in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  await mongoose.disconnect();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("demo seed failed:", err);
    process.exit(1);
  });
}
