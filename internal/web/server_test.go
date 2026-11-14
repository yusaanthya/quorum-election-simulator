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
	hub := NewHub()
	session := sim.New(sim.Config{Members: 3, TimeScale: 1}, hub.Publish)
	session.Start()
	srv := httptest.NewServer(NewServer(session, hub))
	t.Cleanup(func() {
		srv.CloseClientConnections()
		srv.Close()
		session.Close()
	})
	return srv
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
