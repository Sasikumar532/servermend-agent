// Cloud/hosting-specific checks — §3.12, lowest priority in the roadmap
// ("Later, scale-stage"). Implemented last, after the full MVP and Phase 2
// catalog, since they matter far less to the self-hosted VPS / Coolify-
// Dokploy audience this product targets first.
package checks

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"

	"github.com/servermend/agent/report"
)

func init() {
	Register(cloudMetadataEndpointReachable{})
	Register(cloudCredentialsPlaintext{})
}

// --- cloud-metadata-endpoint-reachable ---------------------------------
// Checked from the host process. A containerized app reaching it too
// depends on the container network mode and whether the host explicitly
// blocks link-local traffic (iptables DROP, or IMDSv2-only enforcement on
// the cloud side) — this check can't see inside every container, so it
// reports host-level reachability as the base signal.

type cloudMetadataEndpointReachable struct{}

func (c cloudMetadataEndpointReachable) ID() string       { return "cloud-metadata-endpoint-reachable" }
func (c cloudMetadataEndpointReachable) Category() string { return "cloud" }
func (c cloudMetadataEndpointReachable) Title() string {
	return "169.254.169.254 reachable from app context"
}

func (c cloudMetadataEndpointReachable) Run(rc *RunContext) report.Finding {
	conn, err := net.DialTimeout("tcp", "169.254.169.254:80", 2*time.Second)
	if err != nil {
		return finding(c, report.StatusPass, "cloud metadata endpoint (169.254.169.254:80) not reachable from the host")
	}
	_ = conn.Close()
	return finding(c, report.StatusFail,
		"cloud metadata endpoint (169.254.169.254:80) is reachable from the host — an SSRF-vulnerable app could reach it too unless explicitly blocked or IMDSv2-only is enforced")
}

// --- cloud-credentials-plaintext -----------------------------------------

var cloudCredentialFiles = []string{
	".aws/credentials",
	".aws/config",
	".config/gcloud/application_default_credentials.json",
	".azure/accessTokens.json",
	".config/doctl/config.yaml",
}

type cloudCredentialsPlaintext struct{}

func (c cloudCredentialsPlaintext) ID() string       { return "cloud-credentials-plaintext" }
func (c cloudCredentialsPlaintext) Category() string { return "cloud" }
func (c cloudCredentialsPlaintext) Title() string {
	return "Cloud/provider API keys or backup credentials stored in plaintext"
}

func (c cloudCredentialsPlaintext) Run(rc *RunContext) report.Finding {
	users, err := realUsers()
	if err != nil {
		return finding(c, report.StatusError, fmt.Sprintf("read /etc/passwd: %v", err))
	}
	var hits []string
	for _, u := range users {
		for _, rel := range cloudCredentialFiles {
			path := filepath.Join(u.HomeDir, rel)
			info, statErr := os.Stat(path)
			if statErr != nil {
				continue
			}
			if info.Mode().Perm()&0o044 != 0 {
				hits = append(hits, fmt.Sprintf("%s (mode %s)", path, info.Mode().Perm()))
			}
		}
	}
	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("cloud credential file(s) readable by group/other: %v", hits))
	}
	return finding(c, report.StatusPass, "no group/other-readable cloud credential files found at common paths")
}
