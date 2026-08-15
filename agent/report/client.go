package report

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

const maxRetries = 3

// baseBackoff is a var, not a const, so tests can shrink it and avoid
// multi-second real sleeps while exercising the retry loop.
var baseBackoff = 2 * time.Second

// Client sends a Report to the ServerMend ingest API over HTTPS with an
// API-key bearer token. mTLS is a planned upgrade (see roadmap risk log) —
// API-key-over-HTTPS is the accepted v0 transport.
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

// httpStatusError distinguishes "the backend is temporarily struggling"
// (5xx — worth retrying) from "this request is wrong and always will be"
// (4xx — a leaked/rotated API key, a malformed payload — retrying just
// wastes the backoff window).
type httpStatusError struct {
	Code int
	Body string
}

func (e *httpStatusError) Error() string {
	return fmt.Sprintf("backend returned %d: %s", e.Code, e.Body)
}

func isRetryable(err error) bool {
	var statusErr *httpStatusError
	if errors.As(err, &statusErr) {
		return statusErr.Code >= 500
	}
	return true // network-level errors (timeout, connection refused, DNS) are retryable
}

// Send POSTs the report, retrying transient failures with exponential
// backoff (2s, 4s, 8s). Callers that want queuing on total failure should
// use Queue.Enqueue, not retry Send in a loop themselves.
func (c *Client) Send(ctx context.Context, r *Report) error {
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			backoff := baseBackoff * time.Duration(1<<uint(attempt-1))
			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return ctx.Err()
			}
		}

		err := c.doSend(ctx, r)
		if err == nil {
			return nil
		}
		lastErr = err
		if !isRetryable(err) {
			break
		}
	}
	return lastErr
}

func (c *Client) doSend(ctx context.Context, r *Report) error {
	body, err := json.Marshal(r)
	if err != nil {
		return fmt.Errorf("marshal report: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BackendURL+"/api/v1/reports", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.APIKey)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("send report: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return &httpStatusError{Code: resp.StatusCode, Body: string(respBody)}
	}
	return nil
}
