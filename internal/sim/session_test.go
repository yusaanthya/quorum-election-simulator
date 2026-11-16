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
	return l.waitFrom(t, 0, what, match)
}

// waitFrom is waitFor for the events recorded at index from or later.
func (l *eventLog) waitFrom(t *testing.T, from int, what string, match func(core.Event) bool) core.Event {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		l.mu.Lock()
		for _, e := range l.events[from:] {
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

// len reports how many events were recorded so far.
func (l *eventLog) len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.events)
}

// since returns a copy of the events recorded at index from or later.
func (l *eventLog) since(from int) []core.Event {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]core.Event(nil), l.events[from:]...)
}

// clocks returns the clock events recorded so far.
func (l *eventLog) clocks() []core.Event {
	var out []core.Event
	for _, e := range l.since(0) {
		if e.Type == core.EventClock {
			out = append(out, e)
		}
	}
	return out
}

// count reports how many recorded events match.
func (l *eventLog) count(match func(core.Event) bool) int {
	n := 0
	for _, e := range l.since(0) {
		if match(e) {
			n++
		}
	}
	return n
}

func isType(t core.EventType) func(core.Event) bool {
	return func(e core.Event) bool { return e.Type == t }
}

func clockEvent(paused bool, scale float64) core.Event {
	return core.Event{Type: core.EventClock, Paused: paused, TimeScale: scale}
}

// Simulated durations, in milliseconds, that events report whatever the factor (A8).
var (
	timeoutRange = [2]int64{1500, 3000}
	latencyRange = [2]int64{minLatency.Milliseconds(), maxLatency.Milliseconds()}
)

func checkDurations(t *testing.T, label string, timer, msg core.Event) {
	t.Helper()
	if timer.DurationMs < timeoutRange[0] || timer.DurationMs >= timeoutRange[1] {
		t.Errorf("%s: election timeout = %dms, want within [%d, %d)", label, timer.DurationMs, timeoutRange[0], timeoutRange[1])
	}
	if msg.DurationMs < latencyRange[0] || msg.DurationMs >= latencyRange[1] {
		t.Errorf("%s: message latency = %dms, want within [%d, %d)", label, msg.DurationMs, latencyRange[0], latencyRange[1])
	}
}

func TestSessionRestartAndScale(t *testing.T) {
	log := &eventLog{}
	s := New(Config{Members: 3, TimeScale: 2}, log.add)
	s.Start()
	defer s.Close()

	log.waitFor(t, "first quorum", func(e core.Event) bool { return e.Type == core.EventQuorumStarted && e.Members == 3 })
	// Durations are reported in simulated time, not stretched by the factor (A8).
	timer := log.waitFor(t, "election timer", isType(core.EventElectionTimer))
	msg := log.waitFor(t, "a message", isType(core.EventMessage))
	checkDurations(t, "TimeScale 2", timer, msg)

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
	if len(snap) != MaxMembers+2 || snap[0].Type != core.EventQuorumStarted || snap[len(snap)-1].Type != core.EventClock {
		t.Errorf("Snapshot() has %d events, want quorum_started + %d statuses + clock", len(snap), MaxMembers)
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

// AC1.14, AC2.2: New clamps the chosen factor to [MinTimeScale, MaxTimeScale].
func TestNewLimitsTimeScale(t *testing.T) {
	tests := []struct {
		in   float64
		want float64
	}{
		{math.NaN(), 1},
		{5000, 20},
		{50, 20},
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

// AC2.1: every command on a started session emits one clock event with the new state, and
// TimeScale reports the clamped factor.
func TestClockCommands(t *testing.T) {
	log := &eventLog{}
	s := New(Config{Members: 3, TimeScale: 3}, log.add)
	s.Start()
	defer s.Close()

	steps := []struct {
		name string
		do   func()
		want core.Event
	}{
		{"Pause", s.Pause, clockEvent(true, 3)},
		{"second Pause", s.Pause, clockEvent(true, 3)},
		{"Resume", s.Resume, clockEvent(false, 3)},
		{"SetTimeScale(7)", func() { s.SetTimeScale(7) }, clockEvent(false, 7)},
		{"SetTimeScale(0.2)", func() { s.SetTimeScale(0.2) }, clockEvent(false, 1)},
		{"SetTimeScale(99)", func() { s.SetTimeScale(99) }, clockEvent(false, 20)},
		{"SetTimeScale(NaN)", func() { s.SetTimeScale(math.NaN()) }, clockEvent(false, 1)},
	}
	for _, st := range steps {
		before := len(log.clocks())
		st.do()
		clocks := log.clocks()
		if len(clocks) != before+1 {
			t.Errorf("%s emitted %d clock events, want 1", st.name, len(clocks)-before)
			continue
		}
		if got := clocks[len(clocks)-1]; got != st.want {
			t.Errorf("%s emitted %+v, want %+v", st.name, got, st.want)
		}
		if got := s.TimeScale(); got != st.want.TimeScale {
			t.Errorf("after %s TimeScale() = %v, want %v", st.name, got, st.want.TimeScale)
		}
	}
}

// AC2.2: the first event is a clock event; commands before Start emit nothing and shape it.
func TestFirstEventIsClock(t *testing.T) {
	t.Run("configured factor", func(t *testing.T) {
		log := &eventLog{}
		s := New(Config{Members: 3, TimeScale: 4}, log.add)
		defer s.Close()
		s.Start()
		if got := log.since(0); len(got) == 0 || got[0] != clockEvent(false, 4) {
			t.Fatalf("first events = %+v, want a clock event with paused false, timeScale 4", got)
		}
	})

	t.Run("commands before Start", func(t *testing.T) {
		log := &eventLog{}
		s := New(Config{Members: 3, TimeScale: 3}, log.add)
		defer s.Close()
		s.Pause()
		s.SetTimeScale(7)
		if n := log.len(); n != 0 {
			t.Fatalf("sink received %d events before Start", n)
		}
		s.Start()
		if got := log.since(0); len(got) == 0 || got[0] != clockEvent(true, 7) {
			t.Fatalf("first events = %+v, want a clock event with paused true, timeScale 7", got)
		}
	})

	t.Run("paused before Start holds the election", func(t *testing.T) {
		t.Parallel()
		log := &eventLog{}
		s := New(Config{Members: 3, TimeScale: 1}, log.add)
		defer s.Close()
		s.Pause()
		s.Start()
		time.Sleep(4 * time.Second) // Unpaused, an election starts within 3s
		if n := log.count(isType(core.EventElectionStarted)); n != 0 {
			t.Errorf("%d election_started events while paused since before Start", n)
		}
	})
}

// AC2.3: after Close the commands change nothing and emit nothing.
func TestCommandsAfterClose(t *testing.T) {
	log := &eventLog{}
	s := New(Config{Members: 3, TimeScale: 1}, log.add)
	s.Start()
	s.SetTimeScale(4)
	log.waitFor(t, "first quorum", isType(core.EventQuorumStarted))
	s.Close()
	before := log.len()

	s.Pause()
	s.Resume()
	s.SetTimeScale(5)
	if got := log.since(before); len(got) != 0 {
		t.Errorf("sink received %d events after Close: %+v", len(got), got)
	}
	if got := s.TimeScale(); got != 4 {
		t.Errorf("TimeScale() after Close = %v, want 4", got)
	}
}

// AC2.4: durations stay simulated at TimeScale 1 and after SetTimeScale(5).
func TestDurationsAreSimulated(t *testing.T) {
	t.Parallel()
	log := &eventLog{}
	s := New(Config{Members: 3, TimeScale: 1}, log.add)
	s.Start()
	defer s.Close()

	timer := log.waitFor(t, "election timer", isType(core.EventElectionTimer))
	msg := log.waitFor(t, "a message", isType(core.EventMessage))
	checkDurations(t, "TimeScale 1", timer, msg)

	s.SetTimeScale(5)
	from := log.len()
	timer = log.waitFrom(t, from, "election timer after SetTimeScale(5)", isType(core.EventElectionTimer))
	msg = log.waitFrom(t, from, "a message after SetTimeScale(5)", isType(core.EventMessage))
	checkDurations(t, "after SetTimeScale(5)", timer, msg)
}

// AC2.5: once what was released before the pause is handled (200 ms), only clock events
// reach the sink; after Resume messages flow again.
func TestPauseSilencesSession(t *testing.T) {
	t.Parallel()
	log := &eventLog{}
	s := New(Config{Members: 3, TimeScale: 1}, log.add)
	s.Start()
	defer s.Close()

	leader := log.waitFor(t, "a leader", isType(core.EventBecameLeader))
	log.waitFor(t, "a heartbeat", func(e core.Event) bool {
		return e.Type == core.EventMessage && e.Message == core.MessageHeartbeat && e.Term >= leader.Term
	})

	s.Pause()
	time.Sleep(200 * time.Millisecond)
	from := log.len()
	time.Sleep(700 * time.Millisecond)
	for _, e := range log.since(from) {
		if e.Type != core.EventClock {
			t.Errorf("event while paused: %+v", e)
		}
	}

	s.Resume()
	log.waitFrom(t, log.len(), "a message after Resume", isType(core.EventMessage))
}

// AC2.6: Kill, Restart, Snapshot and Close work while paused.
func TestCommandsWhilePaused(t *testing.T) {
	log := &eventLog{}
	s := New(Config{Members: 3, TimeScale: 1}, log.add)
	s.Start()
	log.waitFor(t, "first quorum", isType(core.EventQuorumStarted))

	s.Pause()
	from := log.len()
	s.Kill(1)
	log.waitFrom(t, from, "stopped of member 1", func(e core.Event) bool {
		return e.Type == core.EventStopped && e.Member == 1
	})
	s.Restart(5)
	log.waitFrom(t, from, "quorum_started with 5 members", func(e core.Event) bool {
		return e.Type == core.EventQuorumStarted && e.Members == 5
	})
	snap := s.Snapshot()
	if last := snap[len(snap)-1]; last.Type != core.EventClock || !last.Paused {
		t.Errorf("Snapshot() ends with %+v, want a paused clock event", last)
	}

	closed := make(chan struct{})
	go func() {
		s.Close()
		close(closed)
	}()
	select {
	case <-closed:
	case <-time.After(5 * time.Second):
		t.Fatal("Close did not return while paused")
	}
}

// AC2.7: the automatic restart counts restartDelay on the clock, so it waits for Resume.
func TestAutoRestartWaitsWhilePaused(t *testing.T) {
	t.Parallel()
	log := &eventLog{}
	s := New(Config{Members: 1, TimeScale: 1}, log.add)
	s.Start()
	defer s.Close()

	log.waitFor(t, "first quorum", isType(core.EventQuorumStarted))
	s.Pause()
	s.Kill(0)
	log.waitFor(t, "quorum_ended", isType(core.EventQuorumEnded))
	time.Sleep(restartDelay + time.Second)
	if n := log.count(isType(core.EventQuorumStarted)); n != 1 {
		t.Fatalf("%d quorum_started events while paused, want 1", n)
	}

	s.Resume()
	deadline := time.Now().Add(restartDelay + 5*time.Second)
	for log.count(isType(core.EventQuorumStarted)) < 2 {
		if time.Now().After(deadline) {
			t.Fatal("no second quorum_started after Resume")
		}
		time.Sleep(50 * time.Millisecond)
	}
}

// AC2.8: Snapshot ends with a clock event, and is that event alone before Start.
func TestSnapshotShapes(t *testing.T) {
	idle := New(Config{Members: 3, TimeScale: 2}, func(core.Event) {})
	defer idle.Close()
	if snap := idle.Snapshot(); len(snap) != 1 || snap[0] != clockEvent(false, 2) {
		t.Errorf("Snapshot() before Start = %+v, want one clock event", snap)
	}

	log := &eventLog{}
	s := New(Config{Members: 3, TimeScale: 2}, log.add)
	s.Start()
	defer s.Close()
	log.waitFor(t, "first quorum", isType(core.EventQuorumStarted))
	snap := s.Snapshot()
	if len(snap) != 3+2 {
		t.Fatalf("Snapshot() has %d events, want %d: %+v", len(snap), 3+2, snap)
	}
	if snap[0].Type != core.EventQuorumStarted || snap[0].Members != 3 {
		t.Errorf("Snapshot()[0] = %+v, want quorum_started of 3", snap[0])
	}
	for i, e := range snap[1:4] {
		if e.Type != core.EventStatus || e.Member != i {
			t.Errorf("Snapshot()[%d] = %+v, want status of member %d", i+1, e, i)
		}
	}
	if snap[4] != clockEvent(false, 2) {
		t.Errorf("Snapshot()[4] = %+v, want clock event with paused false, timeScale 2", snap[4])
	}
}

// AC2.9: clock events reach the sink in the order the changes were applied, so the last
// one recorded matches the state Snapshot reports.
func TestClockEventOrder(t *testing.T) {
	log := &eventLog{}
	s := New(Config{Members: 3, TimeScale: 3}, log.add)
	s.Start()
	defer s.Close()

	var wg sync.WaitGroup
	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func(k float64) {
			defer wg.Done()
			for i := 0; i < 100; i++ {
				s.Pause()
				s.Resume()
				s.SetTimeScale(k)
			}
		}(float64(g + 1))
	}
	wg.Wait()
	s.Pause()
	time.Sleep(200 * time.Millisecond)

	clocks := log.clocks()
	if want := 1 + 8*100*3 + 1; len(clocks) != want {
		t.Errorf("recorded %d clock events, want %d", len(clocks), want)
	}
	snap := s.Snapshot()
	if last, want := clocks[len(clocks)-1], snap[len(snap)-1]; last != want {
		t.Errorf("last clock event %+v, Snapshot() ends with %+v", last, want)
	}
}
