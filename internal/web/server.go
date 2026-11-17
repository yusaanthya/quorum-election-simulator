// Package web serves the 3D visualizer: the embedded front end, a Server-Sent Events
// stream of cluster events, and a small JSON API for kill, restart, pause, resume and the
// slow-motion factor.
package web

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"sync"

	"github.com/Anthya1104/quorum-election-cli/internal/core"
	"github.com/Anthya1104/quorum-election-cli/internal/sim"
	"github.com/sirupsen/logrus"
)

// dist holds the built front end (make web). It contains only .gitkeep until then.
//
//go:embed all:dist
var dist embed.FS

// subscriberBuffer bounds how far a slow viewer may fall behind. A viewer whose buffer is
// full is disconnected, never left connected with events missing; its EventSource then
// reconnects and receives a fresh snapshot.
const subscriberBuffer = 1024

// Hub fans events out to every connected viewer without blocking the cluster.
type Hub struct {
	mu   sync.Mutex
	subs map[chan []byte]struct{}
}

func NewHub() *Hub {
	return &Hub{subs: make(map[chan []byte]struct{})}
}

// Publish sends e to every subscriber. A subscriber whose buffer is full is removed and
// its channel closed, which ends its stream.
func (h *Hub) Publish(e core.Event) {
	data, err := json.Marshal(e)
	if err != nil {
		logrus.Errorf("web: encode event: %v", err)
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- data:
		default:
			delete(h.subs, ch)
			close(ch)
		}
	}
}

func (h *Hub) subscribe() chan []byte {
	ch := make(chan []byte, subscriberBuffer)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

// unsubscribe removes ch. It is a no-op for a subscriber Publish already removed.
func (h *Hub) unsubscribe(ch chan []byte) {
	h.mu.Lock()
	delete(h.subs, ch)
	h.mu.Unlock()
}

// Server exposes one Session over HTTP.
type Server struct {
	session *sim.Session
	hub     *Hub
	mux     *http.ServeMux
}

func NewServer(session *sim.Session, hub *Hub) *Server {
	s := &Server{session: session, hub: hub, mux: http.NewServeMux()}
	s.mux.HandleFunc("GET /api/events", s.handleEvents)
	s.mux.HandleFunc("GET /api/config", s.handleConfig)
	s.mux.HandleFunc("POST /api/kill", s.handleKill)
	s.mux.HandleFunc("POST /api/restart", s.handleRestart)
	s.mux.HandleFunc("POST /api/pause", s.handlePause)
	s.mux.HandleFunc("POST /api/resume", s.handleResume)
	s.mux.HandleFunc("POST /api/timescale", s.handleTimeScale)
	s.mux.Handle("GET /", staticHandler())
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	// Subscribe before taking the snapshot so no change falls between them. The snapshot
	// ends with the clock state; clock events published since the subscription follow it
	// in order, so the last one a client holds is the current state.
	ch := s.hub.subscribe()
	defer s.hub.unsubscribe(ch)

	for _, e := range s.session.Snapshot() {
		data, _ := json.Marshal(e)
		fmt.Fprintf(w, "data: %s\n\n", data)
	}
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case data, ok := <-ch:
			if !ok {
				return // Disconnected by Publish after a buffer overflow
			}
			fmt.Fprintf(w, "data: %s\n\n", data)
			// Send whatever else is already queued in the same write.
			for drained := false; !drained; {
				select {
				case more, ok := <-ch:
					if !ok {
						flusher.Flush()
						return
					}
					fmt.Fprintf(w, "data: %s\n\n", more)
				default:
					drained = true
				}
			}
			flusher.Flush()
		}
	}
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{
		"timeScale":  s.session.TimeScale(),
		"minMembers": sim.MinMembers,
		"maxMembers": sim.MaxMembers,
	})
}

func (s *Server) handleKill(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID *int `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == nil {
		http.Error(w, `body must be {"id": <member id>}`, http.StatusBadRequest)
		return
	}
	s.session.Kill(*req.ID)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRestart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Members int `json:"members"`
	}
	if r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `body must be {"members": <count>} or empty`, http.StatusBadRequest)
			return
		}
	}
	s.session.Restart(req.Members)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePause(w http.ResponseWriter, r *http.Request) {
	s.session.Pause()
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleResume(w http.ResponseWriter, r *http.Request) {
	s.session.Resume()
	w.WriteHeader(http.StatusNoContent)
}

// handleTimeScale sets the chosen factor. Any finite number is accepted; the session
// clamps it to 1-20.
func (s *Server) handleTimeScale(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TimeScale *float64 `json:"timeScale"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TimeScale == nil {
		http.Error(w, `body must be {"timeScale": <number>}`, http.StatusBadRequest)
		return
	}
	s.session.SetTimeScale(*req.TimeScale)
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func staticHandler() http.Handler {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	if _, err := fs.Stat(sub, "index.html"); err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprintln(w, "The visualizer front end is not built into this binary.")
			fmt.Fprintln(w, "Run `make web` and rebuild, or run `npm run dev` in web/ and open its URL.")
		})
	}
	return http.FileServerFS(sub)
}
