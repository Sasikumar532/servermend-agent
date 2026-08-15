package report

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// Queue persists reports that Send couldn't deliver even after retries, so
// a backend outage doesn't silently drop scan history — it's picked up and
// sent on a later, successful run.
type Queue struct {
	Dir string
}

func NewQueue(dir string) *Queue {
	return &Queue{Dir: dir}
}

// Enqueue writes r to disk under a timestamp-ordered filename.
func (q *Queue) Enqueue(r *Report) error {
	if err := os.MkdirAll(q.Dir, 0o750); err != nil {
		return fmt.Errorf("create queue dir: %w", err)
	}
	data, err := json.Marshal(r)
	if err != nil {
		return fmt.Errorf("marshal queued report: %w", err)
	}
	name := fmt.Sprintf("%d.json", time.Now().UnixNano())
	if err := os.WriteFile(filepath.Join(q.Dir, name), data, 0o640); err != nil {
		return fmt.Errorf("write queued report: %w", err)
	}
	return nil
}

// Flush sends every queued report, oldest first, removing each on success.
// It stops at the first report that still fails to send — rather than
// reordering delivery, later reports stay queued behind it for next time.
func (q *Queue) Flush(ctx context.Context, c *Client) (sent int, err error) {
	entries, err := os.ReadDir(q.Dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, fmt.Errorf("read queue dir: %w", err)
	}

	var names []string
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names) // nanosecond-timestamp filenames sort chronologically

	for _, name := range names {
		path := filepath.Join(q.Dir, name)
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			continue
		}

		var r Report
		if unmarshalErr := json.Unmarshal(data, &r); unmarshalErr != nil {
			_ = os.Remove(path) // corrupt entry — drop it rather than block the queue forever
			continue
		}

		if sendErr := c.Send(ctx, &r); sendErr != nil {
			return sent, sendErr
		}
		_ = os.Remove(path)
		sent++
	}
	return sent, nil
}
