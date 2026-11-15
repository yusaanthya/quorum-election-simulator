package sim

import (
	"fmt"
	"math"
	"runtime"
	"sync"
	"testing"
	"time"
)

// probe observes one clock entry: whether it has been released.
type probe struct {
	ch   <-chan time.Time // Timers and tickers
	fn   chan struct{}    // AfterFunc entries
	stop func()
}

// fired reports, without waiting, whether the entry has been released.
func (p probe) fired() bool {
	return p.wait(0)
}

// wait reports whether the entry is released within timeout.
func (p probe) wait(timeout time.Duration) bool {
	var after <-chan time.Time
	if timeout > 0 {
		tm := time.NewTimer(timeout)
		defer tm.Stop()
		after = tm.C
	}
	if p.ch != nil {
		select {
		case <-p.ch:
			return true
		case <-after:
			return false
		default:
			if after == nil {
				return false
			}
		}
		select {
		case <-p.ch:
			return true
		case <-after:
			return false
		}
	}
	select {
	case <-p.fn:
		return true
	case <-after:
		return false
	default:
		if after == nil {
			return false
		}
	}
	select {
	case <-p.fn:
		return true
	case <-after:
		return false
	}
}

// kinds are the three kinds of entry: a timer, a ticker (its first tick) and an
// AfterFunc entry.
var kinds = []struct {
	name  string
	start func(c *Clock, d time.Duration) probe
}{
	{"timer", func(c *Clock, d time.Duration) probe {
		t := c.NewTimer(d)
		return probe{ch: t.C(), stop: func() { t.Stop() }}
	}},
	{"ticker", func(c *Clock, d time.Duration) probe {
		t := c.NewTicker(d)
		return probe{ch: t.C(), stop: t.Stop}
	}},
	{"AfterFunc", func(c *Clock, d time.Duration) probe {
		ch := make(chan struct{}, 1)
		c.AfterFunc(d, func() {
			select {
			case ch <- struct{}{}:
			default:
			}
		})
		return probe{fn: ch, stop: func() {}}
	}},
}

// AC1.2
func TestClockRescale(t *testing.T) {
	for _, k := range kinds {
		t.Run(k.name+"/slow to fast", func(t *testing.T) {
			c := NewClock(1000)
			defer c.Stop()
			p := k.start(c, time.Second)
			defer p.stop()
			time.Sleep(200 * time.Millisecond)
			if p.fired() {
				t.Fatal("1s entry at factor 1000 fired within 200ms of wall time")
			}
			c.SetFactor(0.01)
			if !p.wait(time.Second) {
				t.Fatal("entry did not fire within 1s of wall time after SetFactor(0.01)")
			}
		})
		t.Run(k.name+"/fast to slow", func(t *testing.T) {
			c := NewClock(1)
			defer c.Stop()
			p := k.start(c, 500*time.Millisecond)
			defer p.stop()
			c.SetFactor(1000)
			time.Sleep(800 * time.Millisecond)
			if p.fired() {
				t.Fatal("500ms entry fired within 800ms of wall time after SetFactor(1000)")
			}
		})
	}
}

// AC1.3
func TestClockPause(t *testing.T) {
	c := NewClock(1)
	defer c.Stop()
	probes := make([]probe, len(kinds))
	for i, k := range kinds {
		probes[i] = k.start(c, 400*time.Millisecond)
		defer probes[i].stop()
	}
	time.Sleep(100 * time.Millisecond)
	c.Pause()

	time.Sleep(200 * time.Millisecond)
	before := c.Now()
	time.Sleep(100 * time.Millisecond)
	if after := c.Now(); !after.Equal(before) {
		t.Errorf("Now() advanced by %v while paused", after.Sub(before))
	}
	time.Sleep(300 * time.Millisecond)
	for i, p := range probes {
		if p.fired() {
			t.Errorf("%s fired while paused", kinds[i].name)
		}
	}

	c.Resume()
	deadline := time.Now().Add(time.Second)
	for i, p := range probes {
		if !p.wait(time.Until(deadline)) {
			t.Errorf("%s did not fire within 1s of Resume", kinds[i].name)
		}
	}
}

// AC1.4
func TestClockPauseKeepsRemainingTime(t *testing.T) {
	for _, k := range kinds {
		t.Run(k.name, func(t *testing.T) {
			c := NewClock(1)
			defer c.Stop()
			start := c.Now()
			p := k.start(c, 300*time.Millisecond)
			defer p.stop()
			time.Sleep(100 * time.Millisecond)
			c.Pause()
			remaining := 300*time.Millisecond - c.Now().Sub(start)
			time.Sleep(300 * time.Millisecond)
			if p.fired() {
				t.Fatal("entry fired while paused")
			}

			resumed := time.Now()
			c.Resume()
			if !p.wait(remaining + 500*time.Millisecond) {
				t.Fatalf("entry did not fire within R + 500ms (R = %v) of Resume", remaining)
			}
			if elapsed := time.Since(resumed); elapsed < remaining-20*time.Millisecond {
				t.Errorf("entry fired %v after Resume, want no earlier than R - 20ms (R = %v)", elapsed, remaining)
			}
		})
	}
}

// AC1.8
func TestClockTimerCreatedWhilePaused(t *testing.T) {
	c := NewClock(1)
	defer c.Stop()
	c.Pause()
	const d = 200 * time.Millisecond
	tm := c.NewTimer(d)
	time.Sleep(300 * time.Millisecond)
	select {
	case <-tm.C():
		t.Fatal("timer created while paused fired before Resume")
	default:
	}

	resumed := time.Now()
	c.Resume()
	select {
	case <-tm.C():
		if elapsed := time.Since(resumed); elapsed < d {
			t.Errorf("timer fired %v after Resume, want its full duration %v", elapsed, d)
		}
	case <-time.After(d + time.Second):
		t.Fatal("timer did not fire after Resume")
	}
}

// AC1.11
func TestClockArguments(t *testing.T) {
	mustPanic := func(t *testing.T, what string, f func()) {
		t.Helper()
		defer func() {
			if recover() == nil {
				t.Errorf("%s did not panic", what)
			}
		}()
		f()
	}
	c := NewClock(1)
	defer c.Stop()
	for _, f := range []float64{0, -1, 0.0001, 1001, math.NaN(), math.Inf(1)} {
		mustPanic(t, fmt.Sprintf("NewClock(%v)", f), func() { NewClock(f) })
		mustPanic(t, fmt.Sprintf("SetFactor(%v)", f), func() { c.SetFactor(f) })
	}
	mustPanic(t, "NewTicker(0)", func() { c.NewTicker(0) })
	tk := c.NewTicker(time.Hour)
	defer tk.Stop()
	mustPanic(t, "ticker Reset(0)", func() { tk.Reset(0) })

	for _, d := range []time.Duration{0, -time.Second} {
		tm := c.NewTimer(d)
		select {
		case <-tm.C():
		case <-time.After(time.Second):
			t.Errorf("timer created with d = %v did not fire", d)
		}
	}
}

// AC1.12
func TestClockStop(t *testing.T) {
	c := NewClock(1)
	c.Pause()
	probes := make([]probe, len(kinds))
	for i, k := range kinds {
		probes[i] = k.start(c, time.Millisecond)
	}
	c.Stop()
	c.Resume()
	later := c.NewTimer(time.Millisecond)
	time.Sleep(300 * time.Millisecond)
	for i, p := range probes {
		if p.fired() {
			t.Errorf("%s fired after Stop", kinds[i].name)
		}
	}
	select {
	case <-later.C():
		t.Error("timer created after Stop fired")
	default:
	}

	done := make(chan struct{})
	go func() {
		c.Stop()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("second Stop did not return")
	}
}

// AC1.5
func TestClockReleaseOrder(t *testing.T) {
	// recorder collects callback ids in the order the callbacks run.
	type recorder struct {
		mu   sync.Mutex
		ids  []int
		done chan struct{}
	}
	newRecorder := func(n int) (*recorder, func(id int) func()) {
		r := &recorder{done: make(chan struct{})}
		return r, func(id int) func() {
			return func() {
				r.mu.Lock()
				defer r.mu.Unlock()
				r.ids = append(r.ids, id)
				if len(r.ids) == n {
					close(r.done)
				}
			}
		}
	}
	check := func(t *testing.T, r *recorder, want []int) {
		t.Helper()
		select {
		case <-r.done:
		case <-time.After(2 * time.Second):
			t.Fatal("callbacks did not all run")
		}
		r.mu.Lock()
		defer r.mu.Unlock()
		for i := range want {
			if r.ids[i] != want[i] {
				t.Fatalf("callbacks ran in order %v, want %v", r.ids, want)
			}
		}
	}
	shuffled := []int{2, 3, 1} // Deadlines in seconds, in creation order

	t.Run("AfterFunc after SetFactor", func(t *testing.T) {
		c := NewClock(100)
		defer c.Stop()
		r, cb := newRecorder(3)
		for _, s := range shuffled {
			c.AfterFunc(time.Duration(s)*time.Second, cb(s))
		}
		c.SetFactor(0.001)
		check(t, r, []int{1, 2, 3})
	})

	t.Run("AfterFunc after SetFactor while paused", func(t *testing.T) {
		c := NewClock(100)
		defer c.Stop()
		r, cb := newRecorder(3)
		for _, s := range shuffled {
			c.AfterFunc(time.Duration(s)*time.Second, cb(s))
		}
		c.Pause()
		c.SetFactor(0.001)
		c.Resume()
		check(t, r, []int{1, 2, 3})
	})

	t.Run("equal deadlines run in creation order", func(t *testing.T) {
		c := NewClock(1)
		defer c.Stop()
		r, cb := newRecorder(3)
		c.Pause()
		for id := 0; id < 3; id++ {
			c.AfterFunc(50*time.Millisecond, cb(id))
		}
		c.Resume()
		check(t, r, []int{0, 1, 2})
	})

	t.Run("channel timers", func(t *testing.T) {
		c := NewClock(100)
		defer c.Stop()
		timers := map[int]<-chan time.Time{}
		for _, s := range shuffled {
			timers[s] = c.NewTimer(time.Duration(s) * time.Second).C()
		}
		c.SetFactor(0.1)
		var got []int
		timeout := time.After(2 * time.Second)
		for len(got) < 3 {
			select {
			case <-timers[1]:
				got = append(got, 1)
			case <-timers[2]:
				got = append(got, 2)
			case <-timers[3]:
				got = append(got, 3)
			case <-timeout:
				t.Fatalf("received only %v", got)
			}
		}
		if got[0] != 1 || got[1] != 2 || got[2] != 3 {
			t.Errorf("timers received in order %v, want [1 2 3]", got)
		}
	})
}

// waitFull waits until a value has been sent on ch and not received.
func waitFull(t *testing.T, ch <-chan time.Time) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for len(ch) == 0 {
		if time.Now().After(deadline) {
			t.Fatal("entry did not fire")
		}
		time.Sleep(time.Millisecond)
	}
}

// expectNothing fails if a value arrives on ch within 200ms.
func expectNothing(t *testing.T, ch <-chan time.Time, what string) {
	t.Helper()
	select {
	case v := <-ch:
		t.Errorf("%s: received %v", what, v)
	case <-time.After(200 * time.Millisecond):
	}
}

// expectAfter receives one value from ch and checks it was released no earlier than d of
// simulated time after from.
func expectAfter(t *testing.T, ch <-chan time.Time, from time.Time, d time.Duration) {
	t.Helper()
	select {
	case v := <-ch:
		if got := v.Sub(from); got < d {
			t.Errorf("value released %v after Reset, want no earlier than %v (stale value?)", got, d)
		}
	case <-time.After(d + time.Second):
		t.Fatal("no value after Reset")
	}
}

// AC1.6
func TestClockNoStaleValue(t *testing.T) {
	const d = 100 * time.Millisecond

	t.Run("timer Stop", func(t *testing.T) {
		c := NewClock(1)
		defer c.Stop()
		tm := c.NewTimer(10 * time.Millisecond)
		waitFull(t, tm.C())
		tm.Stop()
		expectNothing(t, tm.C(), "after Stop")
	})
	t.Run("timer Reset", func(t *testing.T) {
		c := NewClock(1)
		defer c.Stop()
		tm := c.NewTimer(10 * time.Millisecond)
		waitFull(t, tm.C())
		from := c.Now()
		tm.Reset(d)
		expectAfter(t, tm.C(), from, d)
		expectNothing(t, tm.C(), "second value after Reset")
	})
	t.Run("timer Stop then Reset", func(t *testing.T) {
		c := NewClock(1)
		defer c.Stop()
		tm := c.NewTimer(10 * time.Millisecond)
		waitFull(t, tm.C())
		tm.Stop()
		from := c.Now()
		tm.Reset(d)
		expectAfter(t, tm.C(), from, d)
		expectNothing(t, tm.C(), "second value after Reset")
	})
	t.Run("ticker Stop", func(t *testing.T) {
		c := NewClock(1)
		defer c.Stop()
		tk := c.NewTicker(10 * time.Millisecond)
		waitFull(t, tk.C())
		tk.Stop()
		expectNothing(t, tk.C(), "after Stop")
	})
	t.Run("ticker Reset", func(t *testing.T) {
		c := NewClock(1)
		defer c.Stop()
		tk := c.NewTicker(10 * time.Millisecond)
		defer tk.Stop()
		waitFull(t, tk.C())
		from := c.Now()
		tk.Reset(d)
		expectAfter(t, tk.C(), from, d)
	})
	t.Run("ticker Stop then Reset", func(t *testing.T) {
		c := NewClock(1)
		defer c.Stop()
		tk := c.NewTicker(10 * time.Millisecond)
		defer tk.Stop()
		waitFull(t, tk.C())
		tk.Stop()
		from := c.Now()
		tk.Reset(d)
		expectAfter(t, tk.C(), from, d)
	})
}

// AC1.7
func TestClockNoStaleValueUnderConcurrency(t *testing.T) {
	c := NewClock(0.001)
	defer c.Stop()
	tm := c.NewTimer(time.Hour)
	tm.Stop()
	for i := 0; i < 1000; i++ {
		tm.Reset(time.Millisecond)
		runtime.Gosched()
		tm.Stop()
		select {
		case <-tm.C():
			t.Fatalf("round %d: received a value after Stop", i)
		default:
		}
	}
}

// AC1.9
func TestClockConcurrentUse(t *testing.T) {
	c := NewClock(0.01)
	defer c.Stop()
	stop := make(chan struct{})
	var control sync.WaitGroup
	control.Add(1)
	go func() {
		defer control.Done()
		factors := []float64{0.001, 0.1, 1, 10}
		for i := 0; ; i++ {
			select {
			case <-stop:
				return
			default:
			}
			c.SetFactor(factors[i%len(factors)])
			c.Pause()
			c.Now()
			c.Resume()
		}
	}()

	var workers sync.WaitGroup
	for w := 0; w < 4; w++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for i := 0; i < 200; i++ {
				d := time.Duration(i%5) * time.Millisecond
				tm := c.NewTimer(d)
				tm.Reset(d + time.Millisecond)
				tk := c.NewTicker(d + time.Millisecond)
				tk.Reset(d + 2*time.Millisecond)
				c.AfterFunc(d, func() { c.Now() })
				select {
				case <-tm.C():
				case <-tk.C():
				default:
				}
				tm.Stop()
				tk.Stop()
			}
		}()
	}

	finished := make(chan struct{})
	go func() {
		workers.Wait()
		close(stop)
		control.Wait()
		close(finished)
	}()
	select {
	case <-finished:
	case <-time.After(20 * time.Second):
		t.Fatal("concurrent use did not finish: deadlock?")
	}
}

// returnsWithin fails unless f returns within timeout.
func returnsWithin(t *testing.T, what string, timeout time.Duration, f func()) {
	t.Helper()
	done := make(chan struct{})
	go func() {
		f()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(timeout):
		t.Fatalf("%s did not return within %v", what, timeout)
	}
}

// AC1.10
func TestClockDoesNotWaitForCallbacks(t *testing.T) {
	t.Run("callback calls its own clock", func(t *testing.T) {
		c := NewClock(1)
		defer c.Stop()
		done := make(chan struct{})
		c.AfterFunc(0, func() {
			c.Pause()
			c.Resume()
			c.SetFactor(2)
			c.NewTimer(time.Millisecond)
			c.AfterFunc(time.Millisecond, func() {})
			close(done)
		})
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Fatal("callback calling its own clock did not return")
		}
	})

	t.Run("blocked callback", func(t *testing.T) {
		c := NewClock(1)
		entered := make(chan struct{})
		release := make(chan struct{})
		defer close(release)
		c.AfterFunc(0, func() {
			close(entered)
			<-release
		})
		select {
		case <-entered:
		case <-time.After(time.Second):
			t.Fatal("callback did not start")
		}
		returnsWithin(t, "Pause", time.Second, c.Pause)
		returnsWithin(t, "SetFactor", time.Second, func() { c.SetFactor(5) })
		returnsWithin(t, "Stop", time.Second, c.Stop)
	})
}
