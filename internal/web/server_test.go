package web

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Anthya1104/quorum-election-cli/internal/core"
	"github.com/Anthya1104/quorum-election-cli/internal/sim"
)

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	srv, _ := newTestServerSession(t)
	return srv
}

func newTestServerSession(t *testing.T) (*httptest.Server, *sim.Session) {
	t.Helper()
	hub := NewHub()
	session := sim.New(sim.Config{Members: 3, TimeScale: 1}, hub.Publish)
	session.Start()
	srv := httptest.NewServer(NewServer(session, hub))
	t.Cleanup(func() {
		srv.CloseClientConnections()
		srv.Close()
		session.Close()
	})
	return srv, session
}

func TestEventStreamStartsWithSnapshot(t *testing.T) {
	srv := newTestServer(t)
	time.Sleep(50 * time.Millisecond) // Let the first quorum start

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL+"/api/events", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("Content-Type = %q", ct)
	}

	scanner := bufio.NewScanner(resp.Body)
	var got []core.Event
	for len(got) < 4 && scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var e core.Event
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &e); err != nil {
			t.Fatalf("bad event %q: %v", line, err)
		}
		got = append(got, e)
	}
	if len(got) < 4 || got[0].Type != core.EventQuorumStarted || got[0].Members != 3 {
		t.Fatalf("stream began with %+v, want quorum_started then 3 statuses", got)
	}
	for i, e := range got[1:4] {
		if e.Type != core.EventStatus || e.Member != i {
			t.Errorf("event %d = %+v, want status of member %d", i+1, e, i)
		}
	}
}

func TestCommandValidation(t *testing.T) {
	srv := newTestServer(t)
	cases := []struct {
		path, body string
		want       int
	}{
		{"/api/kill", `{"id": 1}`, http.StatusNoContent},
		{"/api/kill", `{}`, http.StatusBadRequest},
		{"/api/kill", `nope`, http.StatusBadRequest},
		{"/api/restart", ``, http.StatusNoContent},
		{"/api/restart", `{"members": 5}`, http.StatusNoContent},
		{"/api/restart", `[`, http.StatusBadRequest},
	}
	for _, c := range cases {
		resp, err := http.Post(srv.URL+c.path, "application/json", strings.NewReader(c.body))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != c.want {
			t.Errorf("POST %s %q = %d, want %d", c.path, c.body, resp.StatusCode, c.want)
		}
	}
}

func TestConfig(t *testing.T) {
	srv := newTestServer(t)
	resp, err := http.Get(srv.URL + "/api/config")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var cfg struct {
		TimeScale  float64 `json:"timeScale"`
		MaxMembers int     `json:"maxMembers"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		t.Fatal(err)
	}
	if cfg.TimeScale != 1 || cfg.MaxMembers != sim.MaxMembers {
		t.Errorf("config = %+v", cfg)
	}
}

func post(t *testing.T, srv *httptest.Server, path, body string) int {
	t.Helper()
	resp, err := http.Post(srv.URL+path, "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	return resp.StatusCode
}

func configTimeScale(t *testing.T, srv *httptest.Server) float64 {
	t.Helper()
	resp, err := http.Get(srv.URL + "/api/config")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var cfg struct {
		TimeScale float64 `json:"timeScale"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		t.Fatal(err)
	}
	return cfg.TimeScale
}

// streamEvents connects to /api/events and sends every event it reads on the returned
// channel until the test ends.
func streamEvents(t *testing.T, srv *httptest.Server) <-chan core.Event {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL+"/api/events", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	events := make(chan core.Event, 4096)
	go func() {
		defer resp.Body.Close()
		defer close(events)
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			var e core.Event
			if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &e) == nil {
				events <- e
			}
		}
	}()
	return events
}

// AC2.10: pause and resume answer 204; timescale validates its body and clamps the value.
func TestClockCommandValidation(t *testing.T) {
	srv := newTestServer(t)
	cases := []struct {
		path, body string
		want       int
	}{
		{"/api/pause", ``, http.StatusNoContent},
		{"/api/resume", ``, http.StatusNoContent},
		{"/api/timescale", `{"timeScale": 5}`, http.StatusNoContent},
		{"/api/timescale", `{"timeScale": 500}`, http.StatusNoContent},
		{"/api/timescale", `{"timeScale": -3}`, http.StatusNoContent},
		{"/api/timescale", `{"timeScale": 5, "x": 1}`, http.StatusNoContent},
		{"/api/timescale", `{"timeScale": 5} trailing`, http.StatusNoContent},
		{"/api/timescale", ``, http.StatusBadRequest},
		{"/api/timescale", `{}`, http.StatusBadRequest},
		{"/api/timescale", `nope`, http.StatusBadRequest},
		{"/api/timescale", `5`, http.StatusBadRequest},
		{"/api/timescale", `{"timeScale": null}`, http.StatusBadRequest},
		{"/api/timescale", `{"timeScale": "5"}`, http.StatusBadRequest},
		{"/api/timescale", `{"timeScale": 1e999}`, http.StatusBadRequest},
	}
	for _, c := range cases {
		if got := post(t, srv, c.path, c.body); got != c.want {
			t.Errorf("POST %s %q = %d, want %d", c.path, c.body, got, c.want)
		}
	}

	if got := post(t, srv, "/api/timescale", `{"timeScale": 500}`); got != http.StatusNoContent {
		t.Fatalf("POST /api/timescale 500 = %d", got)
	}
	if got := configTimeScale(t, srv); got != 20 {
		t.Errorf("config timeScale after 500 = %v, want 20", got)
	}
	if got := post(t, srv, "/api/timescale", `{"timeScale": -3}`); got != http.StatusNoContent {
		t.Fatalf("POST /api/timescale -3 = %d", got)
	}
	if got := configTimeScale(t, srv); got != 1 {
		t.Errorf("config timeScale after -3 = %v, want 1", got)
	}
}

// AC3.8: autoslow takes a JSON boolean and nothing else.
func TestAutoSlowValidation(t *testing.T) {
	srv := newTestServer(t)
	cases := []struct {
		body string
		want int
	}{
		{`{"enabled": false}`, http.StatusNoContent},
		{`{"enabled": true}`, http.StatusNoContent},
		{``, http.StatusBadRequest},
		{`{}`, http.StatusBadRequest},
		{`nope`, http.StatusBadRequest},
		{`{"enabled": null}`, http.StatusBadRequest},
		{`{"enabled": 1}`, http.StatusBadRequest},
		{`{"enabled": "true"}`, http.StatusBadRequest},
	}
	for _, c := range cases {
		if got := post(t, srv, "/api/autoslow", c.body); got != c.want {
			t.Errorf("POST /api/autoslow %q = %d, want %d", c.body, got, c.want)
		}
	}
}

// AC4.8: split-vote takes no body and answers 204.
func TestSplitVote(t *testing.T) {
	srv := newTestServer(t)
	if got := post(t, srv, "/api/split-vote", ``); got != http.StatusNoContent {
		t.Errorf("POST /api/split-vote = %d, want %d", got, http.StatusNoContent)
	}
}

// AC2.11: a client connecting while paused gets the snapshot ending with a paused clock.
func TestEventStreamSnapshotEndsWithClock(t *testing.T) {
	srv, session := newTestServerSession(t)
	deadline := time.Now().Add(5 * time.Second)
	for len(session.Snapshot()) != 3+2 {
		if time.Now().After(deadline) {
			t.Fatal("first quorum did not start")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if got := post(t, srv, "/api/pause", ``); got != http.StatusNoContent {
		t.Fatalf("POST /api/pause = %d", got)
	}

	events := streamEvents(t, srv)
	var got []core.Event
	timeout := time.After(5 * time.Second)
	for len(got) < 5 {
		select {
		case e, ok := <-events:
			if !ok {
				t.Fatalf("stream ended after %+v", got)
			}
			got = append(got, e)
		case <-timeout:
			t.Fatalf("stream sent only %+v", got)
		}
	}
	if got[0].Type != core.EventQuorumStarted || got[0].Members != 3 {
		t.Errorf("event 0 = %+v, want quorum_started of 3", got[0])
	}
	for i, e := range got[1:4] {
		if e.Type != core.EventStatus || e.Member != i {
			t.Errorf("event %d = %+v, want status of member %d", i+1, e, i)
		}
	}
	if e := got[4]; e.Type != core.EventClock || !e.Paused {
		t.Errorf("event 4 = %+v, want a paused clock event", e)
	}
}

// AC2.12: after alternating pause and resume posts that end with a pause, the client's
// last clock event is paused.
func TestClockEventsConverge(t *testing.T) {
	srv := newTestServer(t)
	time.Sleep(50 * time.Millisecond) // Let the first quorum start
	events := streamEvents(t, srv)

	// The posting goroutine reports its error on postErr instead of calling t, which it
	// must not do once the test has returned.
	posted := make(chan struct{})
	postErr := make(chan error, 1)
	go func() {
		defer close(posted)
		for i := 0; i < 200; i++ {
			path := "/api/resume"
			if i%2 == 1 {
				path = "/api/pause" // The 200th post is a pause
			}
			resp, err := http.Post(srv.URL+path, "application/json", nil)
			if err != nil {
				postErr <- err
				return
			}
			resp.Body.Close()
		}
	}()

	// A stream that never goes quiet fails here instead of hanging until the go test timeout.
	deadline := time.After(15 * time.Second)
	var last *core.Event
	done := false
	for {
		select {
		case e, ok := <-events:
			if !ok {
				t.Fatal("stream ended")
			}
			if e.Type == core.EventClock {
				last = &e
			}
			continue
		case <-posted:
			posted = nil
			done = true
			select {
			case err := <-postErr:
				t.Fatal(err)
			default:
			}
			continue
		case <-deadline:
			t.Fatal("stream did not go quiet within 15s of the first post")
		case <-time.After(500 * time.Millisecond):
		}
		if done {
			break
		}
	}
	if last == nil || !last.Paused {
		t.Errorf("last clock event = %+v, want paused", last)
	}
}

// AC2.13: a subscriber whose buffer is full is disconnected, not silently skipped.
func TestHubDisconnectsFullSubscriber(t *testing.T) {
	hub := NewHub()
	ch := hub.subscribe()
	for i := 0; i < subscriberBuffer+1; i++ {
		hub.Publish(core.Event{Type: core.EventStatus, Member: i})
	}
	n := 0
	for range ch { // Ends only if the channel was closed
		n++
	}
	if n != subscriberBuffer {
		t.Errorf("read %d events before the channel closed, want %d", n, subscriberBuffer)
	}
	hub.Publish(core.Event{Type: core.EventStatus}) // Must not panic
	hub.unsubscribe(ch)                             // Already removed: a no-op
}
