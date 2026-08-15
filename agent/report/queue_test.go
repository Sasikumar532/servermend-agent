package report

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestQueueEnqueueAndFlush(t *testing.T) {
	dir := t.TempDir()
	queue := NewQueue(filepath.Join(dir, "queue"))

	if err := queue.Enqueue(&Report{ServerID: "s1"}); err != nil {
		t.Fatalf("Enqueue s1: %v", err)
	}
	if err := queue.Enqueue(&Report{ServerID: "s2"}); err != nil {
		t.Fatalf("Enqueue s2: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key")
	sent, err := queue.Flush(context.Background(), client)
	if err != nil {
		t.Fatalf("Flush: %v", err)
	}
	if sent != 2 {
		t.Errorf("sent = %d, want 2", sent)
	}

	entries, err := os.ReadDir(queue.Dir)
	if err != nil {
		t.Fatalf("ReadDir after flush: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("queue dir has %d entries after a successful flush, want 0", len(entries))
	}
}

func TestQueueFlushOnMissingDir(t *testing.T) {
	dir := t.TempDir()
	queue := NewQueue(filepath.Join(dir, "does-not-exist"))
	client := NewClient("http://unused.invalid", "test-key")

	sent, err := queue.Flush(context.Background(), client)
	if err != nil {
		t.Fatalf("Flush on a baseline with no queue directory yet: %v", err)
	}
	if sent != 0 {
		t.Errorf("sent = %d, want 0", sent)
	}
}

func TestQueueFlushStopsAtFirstFailure(t *testing.T) {
	dir := t.TempDir()
	queue := NewQueue(filepath.Join(dir, "queue"))
	for i := 0; i < 3; i++ {
		if err := queue.Enqueue(&Report{ServerID: "s"}); err != nil {
			t.Fatalf("Enqueue: %v", err)
		}
		time.Sleep(time.Millisecond) // guarantee distinct nanosecond-timestamp filenames
	}

	withFastBackoff(t)
	client := NewClient("http://127.0.0.1:1", "test-key") // nothing listens here — every send fails immediately

	sent, err := queue.Flush(context.Background(), client)
	if err == nil {
		t.Fatal("Flush succeeded against an unreachable backend, want an error")
	}
	if sent != 0 {
		t.Errorf("sent = %d, want 0 (nothing should have gone out)", sent)
	}

	entries, readErr := os.ReadDir(queue.Dir)
	if readErr != nil {
		t.Fatalf("ReadDir: %v", readErr)
	}
	if len(entries) != 3 {
		t.Errorf("queue dir has %d entries after a failed flush, want all 3 still queued", len(entries))
	}
}
