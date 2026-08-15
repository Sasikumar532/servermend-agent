// Package config parses agent CLI flags.
package config

import (
	"flag"
	"fmt"
)

type Output string

const (
	OutputJSON   Output = "json"
	OutputStdout Output = "stdout"
)

type Config struct {
	ServerID       string
	BackendURL     string
	APIKey         string
	DryRun         bool
	Output         Output
	BaselinePath   string
	UpdateBaseline bool
	QueueDir       string
}

// Parse reads CLI flags. In --dry-run mode, --server-id/--backend-url/--api-key
// are optional, so individual checks can be developed and run locally before
// the backend exists.
func Parse(args []string) (*Config, error) {
	fs := flag.NewFlagSet("servermend-agent", flag.ContinueOnError)
	cfg := &Config{}
	var output string

	fs.StringVar(&cfg.ServerID, "server-id", "", "unique identifier for this server (assigned by the backend)")
	fs.StringVar(&cfg.BackendURL, "backend-url", "", "ServerMend backend base URL, e.g. https://api.servermend.io")
	fs.StringVar(&cfg.APIKey, "api-key", "", "per-server API key issued by the backend")
	fs.BoolVar(&cfg.DryRun, "dry-run", false, "run checks and print the report without sending it")
	fs.StringVar(&output, "output", "stdout", "local output format: stdout | json")
	fs.StringVar(&cfg.BaselinePath, "baseline-path", "/var/lib/servermend/baseline.json", "local path to the persistence/drift baseline file")
	fs.BoolVar(&cfg.UpdateBaseline, "update-baseline", false, "recapture the LOCAL baseline from current state instead of diffing against it — independent of confirming drift on the backend via the dashboard (POST /baseline/confirm), which every run's observed state is pushed to regardless of this flag")
	fs.StringVar(&cfg.QueueDir, "queue-dir", "/var/lib/servermend/queue", "local directory for reports that couldn't be sent, retried on the next run")

	if err := fs.Parse(args); err != nil {
		return nil, err
	}

	switch output {
	case "json":
		cfg.Output = OutputJSON
	case "stdout":
		cfg.Output = OutputStdout
	default:
		return nil, fmt.Errorf("invalid --output %q: must be json or stdout", output)
	}

	if !cfg.DryRun && (cfg.ServerID == "" || cfg.BackendURL == "" || cfg.APIKey == "") {
		return nil, fmt.Errorf("--server-id, --backend-url, and --api-key are required unless --dry-run is set")
	}

	return cfg, nil
}
