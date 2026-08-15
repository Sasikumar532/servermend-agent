package checks

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/servermend/agent/report"
)

func init() {
	Register(dockerSocketExposed{})
	Register(dockerDaemonTCPNoTLS{})
	Register(dockerPrivilegedContainers{})
	Register(dockerContainerRootUser{})
	Register(dockerPortsBoundPublic{})
	Register(dockerUntrustedRegistry{})
	Register(dockerSecretsInImage{})
}

// runningContainerIDs and dockerInspectField shell out to the `docker` CLI
// rather than talking to docker.sock directly — the CLI is virtually always
// present alongside the daemon, and `docker inspect --format` already does
// the JSON-field extraction we'd otherwise hand-roll against the API.

func runningContainerIDs() ([]string, error) {
	out, err := exec.Command("docker", "ps", "-q").Output()
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line = strings.TrimSpace(line); line != "" {
			ids = append(ids, line)
		}
	}
	return ids, nil
}

func dockerInspectField(id, format string) (string, error) {
	out, err := exec.Command("docker", "inspect", "--format", format, id).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

// dockerSocketExposed flags docker.sock being world-writable, which lets
// any local user drive the Docker API — effectively root on the host,
// since a container can be started with a host bind mount.
type dockerSocketExposed struct{}

func (c dockerSocketExposed) ID() string       { return "docker-socket-exposed" }
func (c dockerSocketExposed) Category() string { return "docker" }
func (c dockerSocketExposed) Title() string    { return "docker.sock exposed without restriction" }

var dockerSockPaths = []string{"/var/run/docker.sock", "/run/docker.sock"}

func (c dockerSocketExposed) Run(rc *RunContext) report.Finding {
	for _, path := range dockerSockPaths {
		info, err := os.Stat(path)
		if err != nil {
			continue // not present at this path — try the next
		}
		if info.Mode().Perm()&0o002 != 0 {
			return finding(c, report.StatusFail, fmt.Sprintf(
				"%s is world-writable (mode %s) — any local user can control the Docker API", path, info.Mode().Perm()))
		}
		return finding(c, report.StatusPass, fmt.Sprintf("%s exists, not world-writable (mode %s)", path, info.Mode().Perm()))
	}
	return finding(c, report.StatusPass, "docker.sock not found — Docker not installed or not using the default socket path")
}

// dockerDaemonTCPNoTLS flags the daemon listening on its conventional
// unencrypted TCP port (2375). Any exposure of this — even loopback-only —
// is the misconfiguration the check catalog calls out, since it's usually
// evidence of `-H tcp://...` without the TLS flags that pair with it.
type dockerDaemonTCPNoTLS struct{}

func (c dockerDaemonTCPNoTLS) ID() string       { return "docker-daemon-tcp-no-tls" }
func (c dockerDaemonTCPNoTLS) Category() string { return "docker" }
func (c dockerDaemonTCPNoTLS) Title() string    { return "Docker daemon listening on TCP without TLS" }

func (c dockerDaemonTCPNoTLS) Run(rc *RunContext) report.Finding {
	const insecureDockerPort = 2375

	sockets, err := ListeningSockets()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}

	for _, s := range sockets {
		if s.Port == insecureDockerPort {
			return finding(c, report.StatusFail, fmt.Sprintf(
				"Docker daemon listening on %s:%d — unencrypted remote API access", s.LocalIP, insecureDockerPort))
		}
	}
	return finding(c, report.StatusPass, "Docker daemon not listening on the default insecure TCP port (2375)")
}

// --- docker-privileged-containers -------------------------------------------

type dockerPrivilegedContainers struct{}

func (c dockerPrivilegedContainers) ID() string       { return "docker-privileged-containers" }
func (c dockerPrivilegedContainers) Category() string { return "docker" }
func (c dockerPrivilegedContainers) Title() string    { return "Containers running with --privileged" }

func (c dockerPrivilegedContainers) Run(rc *RunContext) report.Finding {
	ids, err := runningContainerIDs()
	if err != nil {
		return finding(c, report.StatusError, fmt.Sprintf("docker not available: %v", err))
	}
	var hits []string
	for _, id := range ids {
		val, err := dockerInspectField(id, "{{.HostConfig.Privileged}}")
		if err != nil || val != "true" {
			continue
		}
		name, _ := dockerInspectField(id, "{{.Name}}")
		hits = append(hits, strings.TrimPrefix(name, "/"))
	}
	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("privileged container(s) running: %v", hits))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("%d running container(s) checked, none privileged", len(ids)))
}

// --- docker-container-root-user ---------------------------------------------

type dockerContainerRootUser struct{}

func (c dockerContainerRootUser) ID() string       { return "docker-container-root-user" }
func (c dockerContainerRootUser) Category() string { return "docker" }
func (c dockerContainerRootUser) Title() string {
	return "Containers running as root inside the container"
}

func (c dockerContainerRootUser) Run(rc *RunContext) report.Finding {
	ids, err := runningContainerIDs()
	if err != nil {
		return finding(c, report.StatusError, fmt.Sprintf("docker not available: %v", err))
	}
	var hits []string
	for _, id := range ids {
		user, err := dockerInspectField(id, "{{.Config.User}}")
		if err != nil {
			continue
		}
		if user == "" || user == "0" || user == "root" {
			name, _ := dockerInspectField(id, "{{.Name}}")
			hits = append(hits, strings.TrimPrefix(name, "/"))
		}
	}
	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("container(s) with no USER directive (running as root): %v", hits))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("%d running container(s) checked, none running as root", len(ids)))
}

// --- docker-ports-bound-public -----------------------------------------------
// Per the roadmap, this is the single most common Coolify/Dokploy default
// misconfig worth flagging explicitly.

type dockerPortsBoundPublic struct{}

func (c dockerPortsBoundPublic) ID() string       { return "docker-ports-bound-public" }
func (c dockerPortsBoundPublic) Category() string { return "docker" }
func (c dockerPortsBoundPublic) Title() string {
	return "Container ports bound to 0.0.0.0 instead of 127.0.0.1"
}

func (c dockerPortsBoundPublic) Run(rc *RunContext) report.Finding {
	ids, err := runningContainerIDs()
	if err != nil {
		return finding(c, report.StatusError, fmt.Sprintf("docker not available: %v", err))
	}
	var hits []string
	for _, id := range ids {
		out, err := dockerInspectField(id,
			`{{range $p, $conf := .NetworkSettings.Ports}}{{range $conf}}{{.HostIp}}:{{.HostPort}} {{end}}{{end}}`)
		if err != nil || out == "" {
			continue
		}
		for _, binding := range strings.Fields(out) {
			if strings.HasPrefix(binding, "0.0.0.0:") || strings.HasPrefix(binding, ":::") {
				name, _ := dockerInspectField(id, "{{.Name}}")
				hits = append(hits, fmt.Sprintf("%s -> %s", strings.TrimPrefix(name, "/"), binding))
			}
		}
	}
	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("container port(s) bound to 0.0.0.0: %v", hits))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("%d running container(s) checked, no ports bound to 0.0.0.0", len(ids)))
}

// --- docker-untrusted-registry -----------------------------------------------
// Flags unpinned images (no digest, :latest, or no tag at all) as the
// checkable proxy for "unverified/non-pinned" — an actual registry
// allowlist is a deployment-specific policy the agent has no way to know
// on its own without configuration, so that stays out of scope here.

type dockerUntrustedRegistry struct{}

func (c dockerUntrustedRegistry) ID() string       { return "docker-untrusted-registry" }
func (c dockerUntrustedRegistry) Category() string { return "docker" }
func (c dockerUntrustedRegistry) Title() string {
	return "Images pulled from unverified/non-pinned registries"
}

func (c dockerUntrustedRegistry) Run(rc *RunContext) report.Finding {
	ids, err := runningContainerIDs()
	if err != nil {
		return finding(c, report.StatusError, fmt.Sprintf("docker not available: %v", err))
	}
	var hits []string
	for _, id := range ids {
		image, err := dockerInspectField(id, "{{.Config.Image}}")
		if err != nil {
			continue
		}
		if isUnpinnedImage(image) {
			hits = append(hits, image)
		}
	}
	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("container(s) running an unpinned image (no digest, :latest, or no tag): %v", hits))
	}
	return finding(c, report.StatusPass, fmt.Sprintf("%d running container(s) checked, all images pinned", len(ids)))
}

func isUnpinnedImage(image string) bool {
	if strings.Contains(image, "@sha256:") {
		return false
	}
	lastColon := strings.LastIndex(image, ":")
	lastSlash := strings.LastIndex(image, "/")
	if lastColon == -1 || lastColon < lastSlash {
		return true // no tag at all -> implicit :latest
	}
	return image[lastColon+1:] == "latest"
}

// --- docker-secrets-in-image --------------------------------------------------
// A light heuristic over build history (`docker history`), not a real
// secret scan — actually inspecting layer contents for leaked credentials
// needs a dedicated scanner (trufflehog/gitleaks-style) run against
// exported layers, which is out of scope for a lightweight host agent.

type dockerSecretsInImage struct{}

func (c dockerSecretsInImage) ID() string       { return "docker-secrets-in-image" }
func (c dockerSecretsInImage) Category() string { return "docker" }
func (c dockerSecretsInImage) Title() string {
	return ".env or secrets baked into image layers or build context"
}

var secretHistoryPatterns = []string{"secret", "password=", "api_key", "apikey", " .env "}

func (c dockerSecretsInImage) Run(rc *RunContext) report.Finding {
	ids, err := runningContainerIDs()
	if err != nil {
		return finding(c, report.StatusError, fmt.Sprintf("docker not available: %v", err))
	}
	seen := map[string]bool{}
	var hits []string
	for _, id := range ids {
		image, err := dockerInspectField(id, "{{.Config.Image}}")
		if err != nil || seen[image] {
			continue
		}
		seen[image] = true

		out, err := exec.Command("docker", "history", "--no-trunc", "--format", "{{.CreatedBy}}", image).Output()
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(out), "\n") {
			lower := strings.ToLower(line)
			for _, pat := range secretHistoryPatterns {
				if strings.Contains(lower, pat) {
					hits = append(hits, fmt.Sprintf("%s: %s", image, strings.TrimSpace(line)))
					break
				}
			}
		}
	}
	if len(hits) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("image build step(s) reference secrets by name — verify nothing sensitive was baked in: %v", hits))
	}
	return finding(c, report.StatusInfo, fmt.Sprintf(
		"%d image(s) checked via build history; no obvious secret-related layer names (light heuristic, not a full secret scan)", len(seen)))
}
