package sim

import (
	"sync"
	"testing"
	"time"

	"github.com/Anthya1104/quorum-election-cli/internal/core"
)

type fakeTimer struct {
	mu       sync.Mutex
	requests []time.Duration
	real     core.Timer
}

func (f *fakeTimer) record(d time.Duration) {
	f.mu.Lock()
	f.requests = append(f.requests, d)
	f.mu.Unlock()
}
func (f *fakeTimer) Now() time.Time { return time.Now() }
func (f *fakeTimer) NewTicker(d time.Duration) core.ITicker {
	f.record(d)
	return f.real.NewTicker(time.Hour)
}
func (f *fakeTimer) NewTimer(d time.Duration) core.ITimer {
	f.record(d)
	return f.real.NewTimer(time.Hour)
}

func TestScaledTimerStretchesDurations(t *testing.T) {
	inner := &fakeTimer{real: core.NewRealTimer()}
	st := NewScaledTimer(inner, 4)
	tm := st.NewTimer(100 * time.Millisecond)
	tm.Stop()
	tk := st.NewTicker(time.Second)
	tk.Stop()

	if inner.requests[0] != 400*time.Millisecond || inner.requests[1] != 4*time.Second {
		t.Errorf("inner timer got %v, want [400ms 4s]", inner.requests)
	}
}

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

func TestCloseWithoutStart(t *testing.T) {
	s := New(Config{Members: 3}, func(core.Event) {})
	s.Close() // Must not block
}
