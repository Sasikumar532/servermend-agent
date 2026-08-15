package report

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// withFastBackoff shrinks baseBackoff for the duration of a test so retry
// tests don't spend real seconds sleeping.
func withFastBackoff(t *testing.T) {
	t.Helper()
	orig := baseBackoff
	baseBackoff = time.Millisecond
	t.Cleanup(func() { baseBackoff = orig })
}

func TestSendSuccess(t *testing.T) {
	var received int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&received, 1)
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("Authorization header = %q, want %q", got, "Bearer test-key")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key")
	if err := client.Send(context.Background(), &Report{ServerID: "s1"}); err != nil {
		t.Fatalf("Send: %v", err)
	}
	if received != 1 {
		t.Errorf("handler called %d time(s), want 1 (no retry needed on success)", received)
	}
}

func TestSendRetriesOn5xxThenSucceeds(t *testing.T) {
	withFastBackoff(t)

	var attempts int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&attempts, 1) < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key")
	if err := client.Send(context.Background(), &Report{ServerID: "s1"}); err != nil {
		t.Fatalf("Send: %v", err)
	}
	if attempts != 3 {
		t.Errorf("attempts = %d, want 3 (2 failures + 1 success)", attempts)
	}
}

func TestSendDoesNotRetryOn4xx(t *testing.T) {
	withFastBackoff(t)

	var attempts int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	client := NewClient(server.URL, "bad-key")
	err := client.Send(context.Background(), &Report{ServerID: "s1"})
	if err == nil {
		t.Fatal("Send succeeded, want an error for a 401")
	}
	if attempts != 1 {
		t.Errorf("attempts = %d, want 1 (a 4xx must fail fast, not retry — retrying a bad API key just burns the backoff window)", attempts)
	}
}

func TestSendGivesUpAfterMaxRetries(t *testing.T) {
	withFastBackoff(t)

	var attempts int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key")
	err := client.Send(context.Background(), &Report{ServerID: "s1"})
	if err == nil {
		t.Fatal("Send succeeded against a server that always 503s, want an error")
	}
	if want := maxRetries + 1; attempts != int32(want) {
		t.Errorf("attempts = %d, want %d (1 initial + %d retries)", attempts, want, maxRetries)
	}
}
