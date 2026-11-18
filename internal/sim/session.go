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

	// Range of the chosen factor (wall time divided by simulated time).
	MinTimeScale = 1
	MaxTimeScale = 20

	// restartDelay is how long a fully halted cluster stays on screen, in unscaled time.
	restartDelay = 2 * time.Second

	// Simulated one-way message latency, in unscaled time. A round trip stays well under
	// the 500ms heartbeat interval and the 1500ms minimum election timeout.
	minLatency = 180 * time.Millisecond
	maxLatency = 260 * time.Millisecond

	// Automatic slow motion: for electionSlowWindow of simulated time after the latest
	// election_started, the clock runs electionSlowdown times slower than the chosen factor.
	electionSlowdown   = 3
	electionSlowWindow = 600 * time.Millisecond
)

// Config sets up a Session.
type Config struct {
	Members int
	// TimeScale is the initial chosen factor: 3 means elections run three times slower.
	// It is clamped to 1-20; NaN is treated as 1.
	TimeScale float64
}

// Session keeps one quorum running and starts a fresh one when it ends or on request.
type Session struct {
	sink  func(core.Event)
	clock *Clock // Every timer, message delivery and restart delay of the session

	// mu guards the fields below. It is never held while a quorum or member lock is
	// acquired; the observer runs under a member lock and may take it.
	mu      sync.Mutex
	members int
	quorum  *core.Quorum
	closed  bool
	paused  bool
	scale   float64 // Chosen factor
	// Automatic slow motion: the switch, whether a slow window is open, and the window's
	// end in simulated time. window is the clock timer that ends it; run receives from it.
	autoSlow   bool
	windowOpen bool
	windowEnd  time.Time
	window     core.ITimer

	restart chan int // New member count
	started bool
	done    chan struct{}
	stopped chan struct{}
}

// New creates a Session. sink receives events from many goroutines and must not block.
func New(cfg Config, sink func(core.Event)) *Session {
	scale := clampTimeScale(cfg.TimeScale)
	clock := NewClock(scale)
	window := clock.NewTimer(electionSlowWindow)
	window.Stop() // Pending only while a window is open
	return &Session{
		sink:     sink,
		clock:    clock,
		scale:    scale,
		autoSlow: true,
		window:   window,
		members:  clampMembers(cfg.Members),
		restart:  make(chan int, 1),
		done:     make(chan struct{}),
		stopped:  make(chan struct{}),
	}
}

// Start runs the session in a new goroutine until Close. The first event the sink
// receives is a clock event with the state at that moment.
func (s *Session) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.started || s.closed {
		return
	}
	s.started = true
	s.sink(s.clockEventLocked())
	go s.run()
}

// TimeScale reports the chosen factor.
func (s *Session) TimeScale() float64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.scale
}

// Pause stops simulated time. While running it emits a clock event, also when the
// session is already paused.
func (s *Session) Pause() {
	s.changeClock(func() {
		s.paused = true
		s.clock.Pause()
	})
}

// Resume continues simulated time. While running it emits a clock event, also when the
// session is not paused.
func (s *Session) Resume() {
	s.changeClock(func() {
		s.paused = false
		s.clock.Resume()
	})
}

// SetTimeScale sets the chosen factor, clamped to [MinTimeScale, MaxTimeScale] with NaN
// treated as MinTimeScale. While paused it takes effect on resume. While running it emits
// a clock event, also when the factor does not change.
func (s *Session) SetTimeScale(scale float64) {
	scale = clampTimeScale(scale)
	s.changeClock(func() {
		s.scale = scale
		s.clock.SetFactor(s.factorLocked())
	})
}

// SetAutoSlow switches automatic slow motion during elections. Switching it on during an
// open window slows the rest of that window. Like Pause, it emits a clock event while
// running, nothing before Start, and does nothing once Close has begun.
func (s *Session) SetAutoSlow(enabled bool) {
	s.changeClock(func() {
		s.autoSlow = enabled
		s.clock.SetFactor(s.factorLocked())
	})
}

// changeClock applies change and announces the new state in one critical section of
// s.mu, so clock events reach the sink in the order the changes were applied. Before
// Start it emits nothing; once Close has begun it does nothing.
func (s *Session) changeClock(change func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	change()
	if s.started {
		s.sink(s.clockEventLocked())
	}
}

func (s *Session) clockEventLocked() core.Event {
	return core.Event{
		Type:      core.EventClock,
		Paused:    s.paused,
		TimeScale: s.scale,
		Factor:    s.factorLocked(),
		AutoSlow:  s.autoSlow,
	}
}

// factorLocked is the effective factor: the chosen factor, slowed down further while
// automatic slow motion is on and a window is open.
func (s *Session) factorLocked() float64 {
	if s.autoSlow && s.windowOpen {
		return s.scale * electionSlowdown
	}
	return s.scale
}

// setWindowLocked opens or closes the slow window. When that changes the effective factor
// it re-scales the clock and announces the new state, in the caller's critical section.
func (s *Session) setWindowLocked(open bool) {
	before := s.factorLocked()
	s.windowOpen = open
	if after := s.factorLocked(); after != before {
		s.clock.SetFactor(after)
		if s.started && !s.closed {
			s.sink(s.clockEventLocked())
		}
	}
}

// openWindow opens the slow window after an election_started, or extends an open one to
// electionSlowWindow after it. The end is stored before the timer is reset, so the
// timer's deadline is never earlier than the stored end.
func (s *Session) openWindow() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	s.windowEnd = s.clock.Now().Add(electionSlowWindow)
	s.window.Reset(electionSlowWindow)
	s.setWindowLocked(true)
}

// endWindowIfDue closes the slow window when its end has been reached on the clock. A
// firing that belongs to an end that was extended since is ignored; the timer fires again.
func (s *Session) endWindowIfDue() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || !s.windowOpen || s.clock.Now().Before(s.windowEnd) {
		return
	}
	s.setWindowLocked(false)
}

func (s *Session) run() {
	defer close(s.stopped)
	for {
		// Once a cluster is being replaced, its shutdown events would only add noise.
		var retired atomic.Bool
		s.mu.Lock()
		// A window of the replaced cluster ends here: its Stop has returned, so none of its
		// members can open another, and the clock event comes before the new quorum_started.
		s.window.Stop()
		s.setWindowLocked(false)
		q := core.NewQuorumWithOptions(s.members, s.clock, core.Options{
			Observer: core.ObserverFunc(func(e core.Event) {
				if retired.Load() {
					return
				}
				s.sink(e)
				if e.Type == core.EventElectionStarted {
					s.openWindow()
				}
			}),
			Latency: s.latency,
		})
		s.quorum = q
		s.mu.Unlock()
		q.Start()

		quorumDone := q.Done()
		var ended core.ITimer
		var endedC <-chan time.Time
		stopEnded := func() {
			if ended != nil {
				ended.Stop()
			}
		}
	wait:
		for {
			select {
			case <-s.done:
				stopEnded()
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
				ended = s.clock.NewTimer(restartDelay)
				endedC = ended.C()
			case <-endedC:
				break wait
			case <-s.window.C():
				s.endWindowIfDue()
			}
		}
		stopEnded()
		retired.Store(true)
		q.Stop()
	}
}

// latency picks a message delay in simulated time; the clock stretches it like every
// other timer so that messages fly slowly enough to follow. Events report it, like
// election timeouts, in simulated milliseconds.
func (s *Session) latency() time.Duration {
	return minLatency + time.Duration(rand.Int63n(int64(maxLatency-minLatency)))
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

// Snapshot describes the running cluster: a quorum_started event, one status event per
// member, and a clock event last. Before the first cluster exists it is the clock event
// alone. The quorum and the clock state are read together; the member statuses after.
func (s *Session) Snapshot() []core.Event {
	s.mu.Lock()
	q := s.quorum
	clock := s.clockEventLocked()
	s.mu.Unlock()
	if q == nil {
		return []core.Event{clock}
	}
	out := append([]core.Event{{Type: core.EventQuorumStarted, Members: q.Size()}}, q.Snapshot()...)
	return append(out, clock)
}

// Close stops the cluster, waits for the session goroutine to exit, then stops the clock.
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
	// Last step: drop in-flight messages of the stopped cluster and every pending timer.
	s.clock.Stop()
}

func clampTimeScale(scale float64) float64 {
	if !(scale >= MinTimeScale) { // Also catches NaN
		return MinTimeScale
	}
	if scale > MaxTimeScale {
		return MaxTimeScale
	}
	return scale
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
