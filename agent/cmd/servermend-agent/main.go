// Command servermend-agent runs the ServerMend check catalog against the
// local host and reports raw findings to the backend. It never scores
// findings or executes remediation itself — see agent/README.md.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/servermend/agent/baseline"
	"github.com/servermend/agent/checks"
	"github.com/servermend/agent/config"
	"github.com/servermend/agent/report"
)

// agentVersion is overridden at build time via -ldflags "-X main.agentVersion=...";
// see scripts/build-release.sh.
var agentVersion = "0.1.0-dev"

func main() {
	for _, arg := range os.Args[1:] {
		if arg == "--version" || arg == "-version" {
			fmt.Println(agentVersion)
			return
		}
	}

	cfg, err := config.Parse(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, "servermend-agent:", err)
		os.Exit(2)
	}

	store := baseline.NewStore(cfg.BaselinePath)
	existing, found, err := store.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, "servermend-agent: failed to load baseline:", err)
		os.Exit(1)
	}

	rc := &checks.RunContext{
		Baseline:    existing,
		CaptureMode: cfg.UpdateBaseline || !found,
		// Populated by every baseline-aware check regardless of
		// CaptureMode (see RunContext.NewBaseline) — the local file below
		// is only overwritten during CaptureMode, but this run's snapshot
		// is always pushed to the backend afterward for drift review.
		NewBaseline: &baseline.Baseline{CapturedAt: time.Now().UTC()},
	}

	rep := &report.Report{
		ServerID:     cfg.ServerID,
		AgentVersion: agentVersion,
		Timestamp:    time.Now().UTC(),
	}
	for _, check := range checks.All() {
		rep.Findings = append(rep.Findings, check.Run(rc))
	}

	if rc.CaptureMode {
		if err := store.Save(rc.NewBaseline); err != nil {
			fmt.Fprintln(os.Stderr, "servermend-agent: failed to save baseline:", err)
			os.Exit(1)
		}
	}

	if cfg.Output == config.OutputJSON {
		printJSON(rep)
	} else {
		printStdout(rep)
	}

	if cfg.DryRun {
		return
	}

	client := report.NewClient(cfg.BackendURL, cfg.APIKey)
	queue := report.NewQueue(cfg.QueueDir)

	// Retries with backoff live inside client.Send; 90s covers the worst
	// case (multiple attempts, each with its own HTTP timeout, plus
	// backoff between them) without the process hanging indefinitely.
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	if sent, err := queue.Flush(ctx, client); err != nil {
		fmt.Fprintf(os.Stderr, "servermend-agent: flushed %d queued report(s), then: %v\n", sent, err)
	} else if sent > 0 {
		fmt.Fprintf(os.Stderr, "servermend-agent: flushed %d previously queued report(s)\n", sent)
	}

	// Best-effort, deliberately: a failure here never touches the run's
	// exit code or blocks the report send below — see baseline.Client's
	// type comment. Runs before Send so it still happens even if Send
	// exits the process on failure further down.
	baselineClient := baseline.NewClient(cfg.BackendURL, cfg.APIKey)
	if result, err := baselineClient.Push(ctx, cfg.ServerID, rc.NewBaseline); err != nil {
		fmt.Fprintln(os.Stderr, "servermend-agent: failed to push baseline to backend (non-fatal):", err)
	} else if result.Status == "pending" {
		fmt.Fprintln(os.Stderr, "servermend-agent: baseline drift detected, awaiting confirmation on the dashboard")
	}

	if err := client.Send(ctx, rep); err != nil {
		if qErr := queue.Enqueue(rep); qErr != nil {
			fmt.Fprintln(os.Stderr, "servermend-agent: failed to send report AND failed to queue it locally:", qErr)
			os.Exit(1)
		}
		fmt.Fprintln(os.Stderr, "servermend-agent: failed to send report, queued for retry on next run:", err)
		os.Exit(1)
	}
}

func printJSON(rep *report.Report) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(rep)
}

func printStdout(rep *report.Report) {
	fmt.Printf("ServerMend agent %s — %s\n\n", rep.AgentVersion, rep.Timestamp.Format(time.RFC3339))
	for _, f := range rep.Findings {
		fmt.Printf("[%-5s] %-32s %s\n", f.Status, f.ID, f.Detail)
	}
}
