import { describe, it, expect } from "vitest";
import { checkCatalog } from "../src/data/checkCatalog.js";

// This is a snapshot of `go run ./cmd/servermend-agent --dry-run --output
// json` finding IDs, verified to match checkCatalog exactly at the time it
// was written (agent commit bae833a). It's a static fixture, not a live
// cross-check — the backend's test suite has no Go toolchain to actually
// run the agent, so this can't catch drift automatically. Whenever a check
// is added/renamed on either side, re-verify with:
//
//   (cd agent && go run ./cmd/servermend-agent --dry-run --output json --baseline-path ./b.json | jq -r '.findings[].id' | sort) \
//     > /tmp/agent_ids.txt && rm agent/b.json
//   node -e "import('./src/data/checkCatalog.js').then(({checkCatalog}) => console.log(checkCatalog.map(c=>c.checkId).sort().join('\n')))" \
//     > /tmp/backend_ids.txt
//   diff /tmp/agent_ids.txt /tmp/backend_ids.txt
//
// and update this list.
const EXPECTED_AGENT_CHECK_IDS = [
  "apps-running-as-root",
  "auditd-present",
  "cloud-credentials-plaintext",
  "cloud-metadata-endpoint-reachable",
  "core-dumps-world-readable",
  "cron-system-jobs",
  "cron-user-jobs",
  "db-default-credentials",
  "deleted-binary-running",
  "docker-container-root-user",
  "docker-daemon-tcp-no-tls",
  "docker-ports-bound-public",
  "docker-privileged-containers",
  "docker-secrets-in-image",
  "docker-socket-exposed",
  "docker-untrusted-registry",
  "fail2ban-installed",
  "firewall-active",
  "firewall-default-policy",
  "firewall-exposed-admin-ports",
  "high-outbound-connection-count",
  "kernel-version-outdated",
  "ld-preload-hijack",
  "log-rotation-configured",
  "logging-enabled",
  "miner-process-signature",
  "mongodb-noauth-exposed",
  "mysql-default-exposed",
  "nginx-default-artifacts",
  "nginx-directory-listing",
  "nginx-server-tokens",
  "nginx-tls-weak-config",
  "open-ports-scan",
  "outbound-mining-pool-connection",
  "path-world-writable",
  "postgres-default-exposed",
  "redis-unauthenticated-exposed",
  "secrets-plaintext-broad-read",
  "shadow-file-permissions",
  "shell-profile-tampering",
  "ssh-authorized-keys-diff",
  "ssh-empty-passwords",
  "ssh-failed-login-rate",
  "ssh-password-auth",
  "ssh-port-default",
  "ssh-private-key-permissions",
  "ssh-protocol-version",
  "ssh-root-login",
  "ssh-weak-ciphers",
  "sudo-broad-entries",
  "sudo-nopasswd",
  "suid-sgid-unexpected",
  "sustained-high-cpu-unexpected-process",
  "sysctl-aslr-disabled",
  "sysctl-icmp-redirects",
  "sysctl-ip-forward",
  "sysctl-syn-cookies",
  "systemd-unexpected-units",
  "tmp-noexec",
  "unattended-upgrades-active",
];

describe("checkCatalog", () => {
  it("has exactly 60 entries", () => {
    expect(checkCatalog).toHaveLength(60);
  });

  it("has no duplicate checkIds", () => {
    const ids = checkCatalog.map((c) => c.checkId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("matches the verified snapshot of agent check IDs", () => {
    const ids = checkCatalog.map((c) => c.checkId).sort();
    expect(ids).toEqual(EXPECTED_AGENT_CHECK_IDS);
  });

  it("every entry has the required fields", () => {
    for (const c of checkCatalog) {
      expect(c.checkId, "checkId").toBeTruthy();
      expect(c.category, `${c.checkId}: category`).toBeTruthy();
      expect(c.title, `${c.checkId}: title`).toBeTruthy();
      expect(["mvp", "phase2", "later"], `${c.checkId}: priority`).toContain(c.priority);
      expect(c.rationale, `${c.checkId}: rationale`).toBeTruthy();
    }
  });

  it("open-ports-scan is the only entry without a severity (purely informational)", () => {
    const withoutSeverity = checkCatalog.filter((c) => !c.severityDefault).map((c) => c.checkId);
    expect(withoutSeverity).toEqual(["open-ports-scan"]);
  });

  it("every severity, where set, is a valid value", () => {
    const valid = ["critical", "high", "medium", "low"];
    for (const c of checkCatalog) {
      if (c.severityDefault) {
        expect(valid, c.checkId).toContain(c.severityDefault);
      }
    }
  });
});
