package sim

import (
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/Anthya1104/quorum-election-cli/internal/core"
)

// Factor limits of a Clock. The session passes a narrower range; the wide one lets tests
// make an entry certain to fire (tiny factor) or certain not to fire (huge factor).
const (
	minFactor = 0.001
	maxFactor = 1000

	// maxWallDelay caps the real timer, so remaining x factor cannot overflow a Duration.
	maxWallDelay = time.Hour
)

type entryKind int

const (
	kindTimer entryKind = iota
	kindTicker
	kindFunc
)

// clockEntry is one pending timer, ticker or AfterFunc call. Its fields are guarded by
// the clock's mutex.
type clockEntry struct {
	kind     entryKind
	deadline time.Time // Simulated time
	seq      uint64    // Order in which deadlines were set, for equal deadlines
	pending  bool
	ch       chan time.Time // Timers and tickers, capacity 1
	interval time.Duration  // Tickers
	f        func()         // AfterFunc entries
}

// Clock is the simulation's single source of time. Every duration it is given is
// simulated time; it runs at a factor (wall time divided by simulated time) that can be
// changed at any time, and it can be paused. One real timer is armed for the earliest
// pending deadline. *Clock implements core.Timer and is safe for concurrent use.
type Clock struct {
	mu sync.Mutex

	factor  float64
	paused  bool
	stopped bool

	// While running, Now() is simBase plus the wall time since wallBase divided by factor.
	// While paused or stopped, Now() is simBase.
	simBase  time.Time
	wallBase time.Time

	pending []*clockEntry
	seq     uint64
	real    *time.Timer // Armed for the earliest pending deadline, or stopped
	passing bool        // A release pass is in progress
}

var _ core.Timer = (*Clock)(nil)

// NewClock returns a running clock at factor. It panics unless factor is finite and
// within [0.001, 1000].
func NewClock(factor float64) *Clock {
	checkFactor(factor)
	now := time.Now()
	return &Clock{factor: factor, simBase: now, wallBase: now}
}

func checkFactor(factor float64) {
	if !(factor >= minFactor && factor <= maxFactor) {
		panic(fmt.Sprintf("sim: clock factor %v outside [%v, %v]", factor, minFactor, maxFactor))
	}
}

// Now returns the simulated time: the wall time at NewClock plus the simulated time
// elapsed since. It does not advance while paused or after Stop.
func (c *Clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.nowLocked()
}

func (c *Clock) nowLocked() time.Time {
	if c.paused || c.stopped {
		return c.simBase
	}
	elapsed := time.Since(c.wallBase)
	return c.simBase.Add(time.Duration(float64(elapsed) / c.factor))
}

// rebaseLocked makes the current simulated time the new base, so that a change of factor
// or pause state keeps simulated time continuous.
func (c *Clock) rebaseLocked() {
	c.simBase = c.nowLocked()
	c.wallBase = time.Now()
}

// NewTimer returns a timer that is released once d of simulated time has passed. A d of
// zero or less is released at the next pass.
func (c *Clock) NewTimer(d time.Duration) core.ITimer {
	e := &clockEntry{kind: kindTimer, ch: make(chan time.Time, 1)}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.scheduleLocked(e, d)
	return &clockTimer{c: c, e: e}
}

// NewTicker returns a ticker with an interval of d simulated time. It panics when d <= 0,
// like time.NewTicker.
func (c *Clock) NewTicker(d time.Duration) core.ITicker {
	if d <= 0 {
		panic("sim: non-positive interval for Clock.NewTicker")
	}
	e := &clockEntry{kind: kindTicker, ch: make(chan time.Time, 1), interval: d}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.scheduleLocked(e, d)
	return &clockTicker{c: c, e: e}
}

// AfterFunc calls f once d of simulated time has passed, without any clock lock held.
// Callbacks run one at a time, in release order, and must not block. They cannot be
// cancelled.
func (c *Clock) AfterFunc(d time.Duration, f func()) {
	e := &clockEntry{kind: kindFunc, f: f}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.scheduleLocked(e, d)
}

// SetFactor changes the factor at once for every pending entry, keeping each entry's
// remaining simulated time. It works while paused and takes effect on resume. It panics
// unless factor is finite and within [0.001, 1000]. After Stop it changes nothing.
func (c *Clock) SetFactor(factor float64) {
	checkFactor(factor)
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.stopped {
		return
	}
	c.rebaseLocked()
	c.factor = factor
	c.armLocked()
}

// Pause stops simulated time. No entry is released until Resume. An entry released
// before Pause took the lock stays released: a value already sent can still be received,
// and a callback already queued still runs.
func (c *Clock) Pause() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.paused || c.stopped {
		return
	}
	c.rebaseLocked()
	c.paused = true
	c.armLocked()
}

// Resume continues simulated time, with every entry's remaining simulated time preserved.
func (c *Clock) Resume() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.paused || c.stopped {
		return
	}
	c.paused = false
	c.wallBase = time.Now()
	c.armLocked()
}

// Stop drops every pending entry and stops the real timer. Afterwards no entry is
// released, including entries created later, and Pause, Resume and SetFactor change
// nothing. Stop is idempotent; a stopped clock cannot be restarted.
func (c *Clock) Stop() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.stopped {
		return
	}
	c.rebaseLocked()
	c.stopped = true
	for _, e := range c.pending {
		e.pending = false
	}
	c.pending = nil
	c.armLocked()
}

// scheduleLocked sets e's deadline to Now() + max(d, 0) and makes it pending, unless the
// clock is stopped.
func (c *Clock) scheduleLocked(e *clockEntry, d time.Duration) {
	if d < 0 {
		d = 0
	}
	e.deadline = c.nowLocked().Add(d)
	c.seq++
	e.seq = c.seq
	if c.stopped {
		return
	}
	if !e.pending {
		e.pending = true
		c.pending = append(c.pending, e)
	}
	c.armLocked()
}

// removeLocked takes e out of the pending set and reports whether it was pending.
func (c *Clock) removeLocked(e *clockEntry) bool {
	if !e.pending {
		return false
	}
	e.pending = false
	for i, p := range c.pending {
		if p == e {
			c.pending = append(c.pending[:i], c.pending[i+1:]...)
			break
		}
	}
	return true
}

// drain discards a value that was sent on ch but not received. It is called with the
// clock's lock held, which every send also holds.
func drain(ch chan time.Time) {
	select {
	case <-ch:
	default:
	}
}

// earliestLocked returns the pending entry that is released first: the lowest deadline,
// then the lowest seq.
func (c *Clock) earliestLocked() *clockEntry {
	var first *clockEntry
	for _, e := range c.pending {
		if first == nil || e.deadline.Before(first.deadline) ||
			(e.deadline.Equal(first.deadline) && e.seq < first.seq) {
			first = e
		}
	}
	return first
}

// armLocked arms the real timer for the earliest pending deadline, or stops it while the
// clock is paused, stopped or empty. During a pass it does nothing: the pass looks for
// due entries again and arms the timer when it finishes.
func (c *Clock) armLocked() {
	if c.passing {
		return
	}
	first := c.earliestLocked()
	if c.paused || c.stopped || first == nil {
		if c.real != nil {
			c.real.Stop()
		}
		return
	}
	remaining := first.deadline.Sub(c.nowLocked())
	delay := maxWallDelay
	if wall := math.Ceil(float64(remaining) * c.factor); wall < float64(maxWallDelay) {
		delay = time.Duration(math.Max(wall, 0))
	}
	if c.real == nil {
		c.real = time.AfterFunc(delay, c.wake)
		return
	}
	c.real.Stop()
	c.real.Reset(delay)
}

// wake is the real timer's callback. It releases every due entry in deadline order, runs
// the queued callbacks without the lock, and repeats until nothing is due. A wake-up that
// finds a pass in progress returns at once; the running pass looks again before it ends.
func (c *Clock) wake() {
	c.mu.Lock()
	if c.passing {
		c.mu.Unlock()
		return
	}
	c.passing = true
	for !c.paused && !c.stopped {
		callbacks := c.releaseDueLocked()
		if callbacks == nil {
			break // Nothing was due
		}
		c.mu.Unlock()
		for _, f := range callbacks {
			f()
		}
		c.mu.Lock()
	}
	c.passing = false
	c.armLocked()
	c.mu.Unlock()
}

// releaseDueLocked releases every entry whose deadline has been reached, in the order of
// deadline and then seq. Channel values are sent here; callbacks are returned, in release
// order, for the caller to run without the lock. It returns a non-nil empty slice when
// it released only channel entries, and nil when nothing was due.
func (c *Clock) releaseDueLocked() []func() {
	now := c.nowLocked()
	var callbacks []func()
	for {
		e := c.earliestLocked()
		if e == nil || e.deadline.After(now) {
			return callbacks
		}
		if callbacks == nil {
			callbacks = []func(){}
		}
		switch e.kind {
		case kindTimer:
			c.removeLocked(e)
			trySend(e.ch, now)
		case kindTicker:
			trySend(e.ch, now) // A full channel loses the tick
			// Next deadline: the smallest whole number of intervals (at least one) later
			// than now.
			n := now.Sub(e.deadline)/e.interval + 1
			e.deadline = e.deadline.Add(n * e.interval)
			if !e.deadline.After(now) {
				e.deadline = e.deadline.Add(e.interval)
			}
			c.seq++
			e.seq = c.seq
		case kindFunc:
			c.removeLocked(e)
			callbacks = append(callbacks, e.f)
		}
	}
}

func trySend(ch chan time.Time, v time.Time) {
	select {
	case ch <- v:
	default:
	}
}

// clockTimer implements core.ITimer on a Clock.
type clockTimer struct {
	c *Clock
	e *clockEntry
}

func (t *clockTimer) C() <-chan time.Time { return t.e.ch }

// Stop removes the timer from the pending set, discards a value sent but not received,
// and reports whether the timer was pending.
func (t *clockTimer) Stop() bool {
	t.c.mu.Lock()
	defer t.c.mu.Unlock()
	drain(t.e.ch)
	return t.c.removeLocked(t.e)
}

// Reset makes the timer pending again for d of simulated time, discards a value sent but
// not received, and reports whether the timer was pending.
func (t *clockTimer) Reset(d time.Duration) bool {
	t.c.mu.Lock()
	defer t.c.mu.Unlock()
	drain(t.e.ch)
	was := t.e.pending
	t.c.scheduleLocked(t.e, d)
	return was
}

// clockTicker implements core.ITicker on a Clock.
type clockTicker struct {
	c *Clock
	e *clockEntry
}

func (t *clockTicker) C() <-chan time.Time { return t.e.ch }

// Stop removes the ticker from the pending set and discards a tick sent but not received.
func (t *clockTicker) Stop() {
	t.c.mu.Lock()
	defer t.c.mu.Unlock()
	drain(t.e.ch)
	t.c.removeLocked(t.e)
}

// Reset replaces the interval with d, counts ticks from now, and discards a tick sent but
// not received. It panics when d <= 0, like time.Ticker.Reset.
func (t *clockTicker) Reset(d time.Duration) {
	if d <= 0 {
		panic("sim: non-positive interval for Clock ticker Reset")
	}
	t.c.mu.Lock()
	defer t.c.mu.Unlock()
	drain(t.e.ch)
	t.e.interval = d
	t.c.scheduleLocked(t.e, d)
}
