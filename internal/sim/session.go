// Package sim runs a quorum for a visual front end: it owns the cluster lifecycle,
// slows time down so elections are watchable, and forwards every event to a sink.
// Both the web server and the WebAssembly build drive the simulation through it.
package sim

import (
	"math/rand"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Anthya1104/quorum-election-cli/internal/core"
)

const (
	MinMembers = 1
	MaxMembers = 9

	// restartDelay is how long a fully halted cluster stays on screen, in unscaled time.
	restartDelay = 2 * time.Second

	// Simulated one-way message latency, in unscaled time. A round trip stays well under
	// the 500ms heartbeat interval and the 1500ms minimum election timeout.
	minLatency = 180 * time.Millisecond
	maxLatency = 260 * time.Millisecond
)

// Config sets up a Session.
type Config struct {
	Members int
	// TimeScale multiplies every timer: 3 means elections run three times slower.
	// Values below 1 are treated as 1.
	TimeScale float64
}

// Session keeps one quorum running and starts a fresh one when it ends or on request.
type Session struct {
	sink  func(core.Event)
	timer core.Timer
	scale float64

	mu      sync.Mutex
	members int
	quorum  *core.Quorum
	closed  bool

	restart chan int // New member count
	started bool
	done    chan struct{}
	stopped chan struct{}
}

// New creates a Session. sink receives events from many goroutines and must not block.
func New(cfg Config, sink func(core.Event)) *Session {
	scale := cfg.TimeScale
	if scale < 1 {
		scale = 1
	}
	return &Session{
		sink:    sink,
		timer:   NewScaledTimer(core.NewRealTimer(), scale),
		scale:   scale,
		members: clampMembers(cfg.Members),
		restart: make(chan int, 1),
		done:    make(chan struct{}),
		stopped: make(chan struct{}),
	}
}

// Start runs the session in a new goroutine until Close.
func (s *Session) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.started || s.closed {
		return
	}
	s.started = true
	go s.run()
}

// TimeScale reports the slow-motion factor applied to every timer.
func (s *Session) TimeScale() float64 { return s.scale }

func (s *Session) run() {
	defer close(s.stopped)
	for {
		// Once a cluster is being replaced, its shutdown events would only add noise.
		var retired atomic.Bool
		s.mu.Lock()
		q := core.NewQuorumWithOptions(s.members, s.timer, core.Options{
			Observer: core.ObserverFunc(func(e core.Event) {
				if !retired.Load() {
					s.emit(e)
				}
			}),
			Latency: s.latency,
		})
		s.quorum = q
		s.mu.Unlock()
		q.Start()

		quorumDone := q.Done()
		var ended <-chan time.Time
	wait:
		for {
			select {
			case <-s.done:
				retired.Store(true)
				q.Stop()
				return
			case n := <-s.restart:
				s.mu.Lock()
				s.members = n
				s.mu.Unlock()
				break wait
			case <-quorumDone:
				// Every member stopped: keep the halted cluster on screen, then start over.
				quorumDone = nil
				ended = time.After(time.Duration(float64(restartDelay) * s.scale))
			case <-ended:
				break wait
			}
		}
		retired.Store(true)
		q.Stop()
	}
}

// latency picks a message delay, stretched like every other timer so that messages fly
// slowly enough to follow.
func (s *Session) latency() time.Duration {
	d := minLatency + time.Duration(rand.Int63n(int64(maxLatency-minLatency)))
	return time.Duration(float64(d) * s.scale)
}

// emit scales timer durations to wall-clock time so a viewer can draw countdowns.
func (s *Session) emit(e core.Event) {
	if e.Type == core.EventElectionTimer {
		e.DurationMs = int64(float64(e.DurationMs) * s.scale)
	}
	s.sink(e)
}

// Kill stops one member, as the CLI's kill command does.
func (s *Session) Kill(id int) {
	s.mu.Lock()
	q := s.quorum
	s.mu.Unlock()
	if q != nil {
		q.KillMember(id)
	}
}

// Restart replaces the cluster with a fresh one of members members; 0 keeps the current size.
func (s *Session) Restart(members int) {
	s.mu.Lock()
	if members == 0 {
		members = s.members
	}
	s.mu.Unlock()
	members = clampMembers(members)

	// Keep only the latest request if one is already pending.
	select {
	case <-s.restart:
	default:
	}
	select {
	case s.restart <- members:
	default:
	}
}

// Snapshot describes the running cluster: a quorum_started event followed by one
// status event per member.
func (s *Session) Snapshot() []core.Event {
	s.mu.Lock()
	q := s.quorum
	s.mu.Unlock()
	if q == nil {
		return nil
	}
	return append([]core.Event{{Type: core.EventQuorumStarted, Members: q.Size()}}, q.Snapshot()...)
}

// Close stops the cluster and waits for the session goroutine to exit.
func (s *Session) Close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	started := s.started
	s.mu.Unlock()
	close(s.done)
	if started {
		<-s.stopped
	}
}

func clampMembers(n int) int {
	if n < MinMembers {
		return MinMembers
	}
	if n > MaxMembers {
		return MaxMembers
	}
	return n
}
