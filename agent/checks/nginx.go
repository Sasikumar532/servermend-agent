package checks

import (
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/servermend/agent/report"
)

func init() {
	Register(nginxServerTokens{})
	Register(nginxTLSWeakConfig{})
	Register(nginxDirectoryListing{})
	Register(nginxDefaultArtifacts{})
}

func nginxInstalled() bool {
	_, err := exec.LookPath("nginx")
	return err == nil
}

// gatherNginxConfig concatenates every *.conf file under /etc/nginx
// (main config, conf.d/, sites-enabled/), stripping full-line comments, into
// one text blob for pattern matching — a real nginx config parser handles
// includes/contexts properly, but for these four checks (all simple
// directive-presence questions) a text search is honest and sufficient.
func gatherNginxConfig() (string, error) {
	var sb strings.Builder
	found := false
	_ = filepath.WalkDir("/etc/nginx", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d == nil || d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".conf") {
			return nil
		}
		content, rErr := os.ReadFile(path)
		if rErr != nil {
			return nil
		}
		found = true
		for _, line := range strings.Split(string(content), "\n") {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			sb.WriteString(trimmed)
			sb.WriteByte('\n')
		}
		return nil
	})
	if !found {
		return "", fmt.Errorf("no *.conf files found under /etc/nginx")
	}
	return sb.String(), nil
}

// --- nginx-server-tokens ---------------------------------------------------

type nginxServerTokens struct{}

func (c nginxServerTokens) ID() string       { return "nginx-server-tokens" }
func (c nginxServerTokens) Category() string { return "nginx" }
func (c nginxServerTokens) Title() string    { return "server_tokens not set to off" }

var serverTokensOffPattern = regexp.MustCompile(`(?i)server_tokens\s+off\s*;`)

func (c nginxServerTokens) Run(rc *RunContext) report.Finding {
	if !nginxInstalled() {
		return finding(c, report.StatusInfo, "nginx not installed")
	}
	cfg, err := gatherNginxConfig()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	if serverTokensOffPattern.MatchString(cfg) {
		return finding(c, report.StatusPass, "server_tokens off is set")
	}
	return finding(c, report.StatusFail, "server_tokens not set to off (default is on — nginx version is disclosed in responses)")
}

// --- nginx-tls-weak-config --------------------------------------------------

type nginxTLSWeakConfig struct{}

func (c nginxTLSWeakConfig) ID() string       { return "nginx-tls-weak-config" }
func (c nginxTLSWeakConfig) Category() string { return "nginx" }
func (c nginxTLSWeakConfig) Title() string    { return "Weak TLS protocols/ciphers, missing HSTS" }

var sslProtocolsPattern = regexp.MustCompile(`(?i)ssl_protocols\s+([^;]+);`)
var hstsPattern = regexp.MustCompile(`(?i)strict-transport-security`)

func (c nginxTLSWeakConfig) Run(rc *RunContext) report.Finding {
	if !nginxInstalled() {
		return finding(c, report.StatusInfo, "nginx not installed")
	}
	cfg, err := gatherNginxConfig()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}

	var issues []string
	if m := sslProtocolsPattern.FindStringSubmatch(cfg); m != nil {
		for _, p := range strings.Fields(m[1]) {
			switch p {
			case "SSLv2", "SSLv3", "TLSv1", "TLSv1.1":
				issues = append(issues, "weak protocol "+p+" enabled")
			}
		}
	}
	if strings.Contains(cfg, "ssl_certificate") && !hstsPattern.MatchString(cfg) {
		issues = append(issues, "TLS is configured but no Strict-Transport-Security header found")
	}
	if len(issues) > 0 {
		return finding(c, report.StatusFail, strings.Join(issues, "; "))
	}
	return finding(c, report.StatusPass, "no weak TLS protocols found, and HSTS is present wherever TLS is configured")
}

// --- nginx-directory-listing ------------------------------------------------

type nginxDirectoryListing struct{}

func (c nginxDirectoryListing) ID() string       { return "nginx-directory-listing" }
func (c nginxDirectoryListing) Category() string { return "nginx" }
func (c nginxDirectoryListing) Title() string    { return "Directory listing enabled" }

var autoindexOnPattern = regexp.MustCompile(`(?i)autoindex\s+on\s*;`)

func (c nginxDirectoryListing) Run(rc *RunContext) report.Finding {
	if !nginxInstalled() {
		return finding(c, report.StatusInfo, "nginx not installed")
	}
	cfg, err := gatherNginxConfig()
	if err != nil {
		return finding(c, report.StatusError, err.Error())
	}
	if autoindexOnPattern.MatchString(cfg) {
		return finding(c, report.StatusFail, "autoindex on found — directory listing is enabled somewhere")
	}
	return finding(c, report.StatusPass, "no autoindex on directive found")
}

// --- nginx-default-artifacts -------------------------------------------------

var nginxDefaultArtifactPaths = []string{
	"/usr/share/nginx/html/index.html",
	"/var/www/html/index.nginx-debian.html",
	"/var/www/html/phpinfo.php",
	"/usr/share/nginx/html/phpinfo.php",
}

type nginxDefaultArtifacts struct{}

func (c nginxDefaultArtifacts) ID() string       { return "nginx-default-artifacts" }
func (c nginxDefaultArtifacts) Category() string { return "nginx" }
func (c nginxDefaultArtifacts) Title() string {
	return "Default nginx site or sample files still present"
}

func (c nginxDefaultArtifacts) Run(rc *RunContext) report.Finding {
	if !nginxInstalled() {
		return finding(c, report.StatusInfo, "nginx not installed")
	}
	var found []string
	for _, p := range nginxDefaultArtifactPaths {
		if _, err := os.Stat(p); err == nil {
			found = append(found, p)
		}
	}
	if len(found) > 0 {
		return finding(c, report.StatusFail, fmt.Sprintf("default/sample file(s) still present: %v", found))
	}
	return finding(c, report.StatusPass, "no default nginx artifacts or sample files found at common paths")
}
