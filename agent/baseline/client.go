package baseline

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client pushes the agent's currently-observed baseline to the backend so
// drift can be reviewed and confirmed from the dashboard, instead of the
// only confirmation path being a local --update-baseline run on the box
// itself. Unlike report.Client, a push here is deliberately best-effort:
// a single attempt, no retry, no local queue on failure. Local baseline
// diffing (this package's Diff, used directly by every persistence/ssh
// check) is completely unaffected either way — this is a mirror for
// dashboard visibility, not a dependency the agent's own scoring relies on.
type Client struct {
	BackendURL string
	APIKey     string
	HTTPClient *http.Client
}

func NewClient(backendURL, apiKey string) *Client {
	return &Client{
		BackendURL: backendURL,
		APIKey:     apiKey,
		HTTPClient: &http.Client{Timeout: 15 * time.Second},
	}
}

type pushRequest struct {
	ServerID string    `json:"server_id"`
	Baseline *Baseline `json:"baseline"`
}

// PushResult is the subset of the backend's response the agent actually
// acts on. The full confirmed/pending baseline detail belongs on the
// dashboard, not in agent stdout/stderr.
type PushResult struct {
	Status string `json:"status"` // "confirmed" | "pending"
}

// Push uploads the observed baseline for serverID. Callers should treat a
// non-nil error as non-fatal — see main.go, which logs and continues.
func (c *Client) Push(ctx context.Context, serverID string, b *Baseline) (*PushResult, error) {
	body, err := json.Marshal(pushRequest{ServerID: serverID, Baseline: b})
	if err != nil {
		return nil, fmt.Errorf("marshal baseline: %w", err)
	}

	url := c.BackendURL + "/api/v1/servers/" + serverID + "/baseline"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.APIKey)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("push baseline: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("backend returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result PushResult
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}
	return &result, nil
}
