package sim

import (
	"math"
	"sync"
	"testing"
	"time"

	"github.com/Anthya1104/quorum-election-cli/internal/core"
)

type eventLog struct {
	mu     sync.Mutex
	events []core.Event
}

func (l *eventLog) add(e core.Event) {
	l.mu.Lock()
	l.events = append(l.events, e)
	l.mu.Unlock()
}

func (l *eventLog) waitFor(t *testing.T, what string, match func(core.Event) bool) core.Event {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		l.mu.Lock()
		for _, e := range l.events {
			if match(e) {
				l.mu.Unlock()
				return e
			}
		}
		l.mu.Unlock()
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
	return core.Event{}
}

func TestSessionRestartAndScale(t *testing.T) {
	log := &eventLog{}
	s := New(Config{Members: 3, TimeScale: 2}, log.add)
	s.Start()
	defer s.Close()

	log.waitFor(t, "first quorum", func(e core.Event) bool { return e.Type == core.EventQuorumStarted && e.Members == 3 })
	timer := log.waitFor(t, "election timer", func(e core.Event) bool { return e.Type == core.EventElectionTimer })
	if timer.DurationMs < 3000 || timer.DurationMs >= 6000 {
		t.Errorf("scaled election timeout = %dms, want within [3000, 6000)", timer.DurationMs)
	}

	msg := log.waitFor(t, "a message", func(e core.Event) bool { return e.Type == core.EventMessage })
	if lo, hi := 2*minLatency.Milliseconds(), 2*maxLatency.Milliseconds(); msg.DurationMs < lo || msg.DurationMs >= hi {
		t.Errorf("scaled message latency = %dms, want within [%d, %d)", msg.DurationMs, lo, hi)
	}

	s.Restart(MaxMembers + 5)
	log.waitFor(t, "restarted quorum clamped to MaxMembers", func(e core.Event) bool {
		return e.Type == core.EventQuorumStarted && e.Members == MaxMembers
	})
	log.mu.Lock()
	for _, e := range log.events {
		if e.Type == core.EventStopped {
			t.Errorf("restart leaked a stopped event from the old cluster: %+v", e)
		}
	}
	log.mu.Unlock()

	snap := s.Snapshot()
	if len(snap) != MaxMembers+1 || snap[0].Type != core.EventQuorumStarted {
		t.Errorf("Snapshot() has %d events, want quorum_started + %d statuses", len(snap), MaxMembers)
	}
}

func TestSessionRestartsAfterClusterHalts(t *testing.T) {
	log := &eventLog{}
	s := New(Config{Members: 1, TimeScale: 1}, log.add)
	s.Start()
	defer s.Close()

	log.waitFor(t, "first quorum", func(e core.Event) bool { return e.Type == core.EventQuorumStarted })
	s.Kill(0)
	log.waitFor(t, "quorum_ended", func(e core.Event) bool { return e.Type == core.EventQuorumEnded })

	// A second quorum_started means the session started over after restartDelay.
	deadline := time.Now().Add(restartDelay + 5*time.Second)
	for time.Now().Before(deadline) {
		log.mu.Lock()
		n := 0
		for _, e := range log.events {
			if e.Type == core.EventQuorumStarted {
				n++
			}
		}
		log.mu.Unlock()
		if n >= 2 {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("session did not start a new quorum after the cluster halted")
}

// AC1.13: Close stops the session's clock, with and without Start.
func TestCloseStopsClock(t *testing.T) {
	for _, start := range []bool{false, true} {
		name := "without Start"
		if start {
			name = "after Start"
		}
		t.Run(name, func(t *testing.T) {
			log := &eventLog{}
			s := New(Config{Members: 3, TimeScale: 1}, log.add)
			if start {
				s.Start()
				log.waitFor(t, "first quorum", func(e core.Event) bool { return e.Type == core.EventQuorumStarted })
			}
			s.Close()
			log.mu.Lock()
			before := len(log.events)
			log.mu.Unlock()

			tm := s.clock.NewTimer(time.Millisecond)
			select {
			case <-tm.C():
				t.Error("a timer on the session's clock fired after Close")
			case <-time.After(200 * time.Millisecond):
			}
			log.mu.Lock()
			defer log.mu.Unlock()
			if after := len(log.events); after != before {
				t.Errorf("sink received %d events after Close: %+v", after-before, log.events[before:])
			}
		})
	}
}

// AC1.14: New limits the scale so the clock never gets a factor it rejects.
func TestNewLimitsTimeScale(t *testing.T) {
	tests := []struct {
		in   float64
		want float64
	}{
		{math.NaN(), 1},
		{5000, 1000},
	}
	for _, tt := range tests {
		s := New(Config{Members: 3, TimeScale: tt.in}, func(core.Event) {})
		if got := s.TimeScale(); got != tt.want {
			t.Errorf("New(TimeScale: %v).TimeScale() = %v, want %v", tt.in, got, tt.want)
		}
		s.Close()
	}
}

func TestCloseWithoutStart(t *testing.T) {
	s := New(Config{Members: 3}, func(core.Event) {})
	s.Close() // Must not block
}

func TestClampMembers(t *testing.T) {
	between := (MinMembers + MaxMembers) / 2
	tests := []struct {
		name string
		in   int
		want int
	}{
		{"below MinMembers", MinMembers - 1, MinMembers},
		{"MinMembers", MinMembers, MinMembers},
		{"between bounds", between, between},
		{"MaxMembers", MaxMembers, MaxMembers},
		{"above MaxMembers", MaxMembers + 1, MaxMembers},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := clampMembers(tt.in); got != tt.want {
				t.Errorf("clampMembers(%d) = %d, want %d", tt.in, got, tt.want)
			}
		})
	}
}
