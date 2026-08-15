package baseline

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPushSendsCorrectRequest(t *testing.T) {
	var gotBody pushRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %q, want POST", r.Method)
		}
		if want := "/api/v1/servers/s1/baseline"; r.URL.Path != want {
			t.Errorf("path = %q, want %q", r.URL.Path, want)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("Authorization header = %q, want %q", got, "Bearer test-key")
		}
		if got := r.Header.Get("Content-Type"); got != "application/json" {
			t.Errorf("Content-Type header = %q, want application/json", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(PushResult{Status: "confirmed"})
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key")
	b := &Baseline{AuthorizedKeys: []string{"alice:abc123"}, SystemdUnits: []string{"nginx.service"}}
	result, err := client.Push(context.Background(), "s1", b)
	if err != nil {
		t.Fatalf("Push: %v", err)
	}

	if gotBody.ServerID != "s1" {
		t.Errorf("request server_id = %q, want %q", gotBody.ServerID, "s1")
	}
	if len(gotBody.Baseline.AuthorizedKeys) != 1 || gotBody.Baseline.AuthorizedKeys[0] != "alice:abc123" {
		t.Errorf("request baseline.authorized_keys = %v", gotBody.Baseline.AuthorizedKeys)
	}
	if result.Status != "confirmed" {
		t.Errorf("result.Status = %q, want %q", result.Status, "confirmed")
	}
}

func TestPushReturnsPendingStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(PushResult{Status: "pending"})
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key")
	result, err := client.Push(context.Background(), "s1", &Baseline{})
	if err != nil {
		t.Fatalf("Push: %v", err)
	}
	if result.Status != "pending" {
		t.Errorf("result.Status = %q, want %q", result.Status, "pending")
	}
}

func TestPushDoesNotRetryAndReturnsErrorOn4xx(t *testing.T) {
	var attempts int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid API key"}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "bad-key")
	_, err := client.Push(context.Background(), "s1", &Baseline{})
	if err == nil {
		t.Fatal("Push succeeded, want an error for a 401")
	}
	if attempts != 1 {
		t.Errorf("attempts = %d, want 1 — Push is single-attempt, no retry (see the type comment on Client)", attempts)
	}
}

func TestPushErrorsOnUnreachableBackend(t *testing.T) {
	client := NewClient("http://127.0.0.1:1", "test-key") // port 0/1 refuses immediately
	_, err := client.Push(context.Background(), "s1", &Baseline{})
	if err == nil {
		t.Fatal("Push succeeded against an unreachable backend, want an error")
	}
}
