package core

import (
	"math/rand"
	"sync"
	"testing"
	"time"

	"github.com/Anthya1104/quorum-election-cli/internal/core/raft"
)

// The SplitVote tests follow spec 7.3: the MockTimer is advanced only where stated,
// messages are delivered instantly (no Options.Latency), and each test waits 50 ms after
// Start so that every member's Run has started.

// startSplitQuorum starts a quorum of n members that records every event.
func startSplitQuorum(t *testing.T, n int) (*Quorum, *recordingObserver, *MockTimer) {
	t.Helper()
	mockTimer := NewMockTimer(time.Now())
	obs := &recordingObserver{}
	q := NewQuorumWithOptions(n, mockTimer, Options{Notifier: NewMockNotifier(), Observer: obs})
	q.Start()
	t.Cleanup(q.Stop)
	time.Sleep(50 * time.Millisecond)
	return q, obs, mockTimer
}

func (r *recordingObserver) len() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.events)
}

// since returns a copy of the events recorded at index from or later.
func (r *recordingObserver) since(from int) []Event {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]Event(nil), r.events[from:]...)
}

// matching returns the events recorded at index from or later that match.
func (r *recordingObserver) matching(from int, match func(Event) bool) []Event {
	var out []Event
	for _, e := range r.since(from) {
		if match(e) {
			out = append(out, e)
		}
	}
	return out
}

// waitCount waits up to a second until at least n events recorded at index from or later
// match, and returns the matching events.
func (r *recordingObserver) waitCount(t *testing.T, from, n int, what string, match func(Event) bool) []Event {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for {
		got := r.matching(from, match)
		if len(got) >= n {
			return got
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %d %s, got %d: %+v", n, what, len(got), got)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// latestStatus returns the last status event of member id, if any.
func (r *recordingObserver) latestStatus(id int) (Event, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := len(r.events) - 1; i >= 0; i-- {
		if e := r.events[i]; e.Type == EventStatus && e.Member == id {
			return e, true
		}
	}
	return Event{}, false
}

func electionStarted(term int) func(Event) bool {
	return func(e Event) bool { return e.Type == EventElectionStarted && e.Term == term }
}

func becameLeader(term int) func(Event) bool {
	return func(e Event) bool { return e.Type == EventBecameLeader && e.Term == term }
}

// checkPair checks that started holds exactly two election_started events, from two
// different members, and returns those members.
func checkPair(t *testing.T, started []Event) (int, int) {
	t.Helper()
	if len(started) != 2 || started[0].Member == started[1].Member {
		t.Fatalf("election_started events = %+v, want exactly two from different members", started)
	}
	return started[0].Member, started[1].Member
}

// splitAndSettle runs AC4.1 on a 5-member quorum and waits until the other four members
// have published a Follower status with term 1: the state AC4.3 and AC4.4 start from.
// It returns the leader.
func splitAndSettle(t *testing.T, q *Quorum, obs *recordingObserver) int {
	t.Helper()
	if !q.SplitVote() {
		t.Fatal("SplitVote() = false on a fresh 5-member quorum, want true")
	}
	leader := obs.waitCount(t, 0, 1, "became_leader with term 1", becameLeader(1))[0].Member
	deadline := time.Now().Add(time.Second)
	for id := 0; id < 5; id++ {
		if id == leader {
			continue
		}
		for {
			s, ok := obs.latestStatus(id)
			if ok && s.Role == raft.Follower.String() && s.Term == 1 && s.Alive {
				break
			}
			if time.Now().After(deadline) {
				t.Fatalf("member %d: latest status %+v (found %v), want a live Follower at term 1", id, s, ok)
			}
			time.Sleep(5 * time.Millisecond)
		}
	}
	return leader
}

// AC4.1: on a 5-member quorum both candidates start term 1, one of them wins, and nothing
// else starts an election.
func TestSplitVoteElectsOneOfTwo(t *testing.T) {
	q, obs, _ := startSplitQuorum(t, 5)
	from := obs.len()

	if !q.SplitVote() {
		t.Fatal("SplitVote() = false, want true")
	}
	won := obs.waitCount(t, from, 1, "became_leader with term 1", becameLeader(1))
	time.Sleep(100 * time.Millisecond)

	started := obs.matching(from, isEventType(EventElectionStarted))
	a, b := checkPair(t, started)
	for _, e := range started {
		if e.Term != 1 {
			t.Errorf("election_started %+v, want term 1", e)
		}
	}
	if w := won[0].Member; w != a && w != b {
		t.Errorf("became_leader from member %d, want one of the candidates %d and %d", w, a, b)
	}
	// The leader comes after both elections started.
	events := obs.since(from)
	lastStart, leaderAt := -1, -1
	for i, e := range events {
		if e.Type == EventElectionStarted {
			lastStart = i
		}
		if becameLeader(1)(e) && leaderAt < 0 {
			leaderAt = i
		}
	}
	if leaderAt < lastStart {
		t.Errorf("became_leader at index %d precedes the second election_started at %d", leaderAt, lastStart)
	}
}

// AC4.2: with no eligible pair SplitVote returns false and emits nothing.
func TestSplitVoteWithoutPair(t *testing.T) {
	t.Run("one member", func(t *testing.T) {
		q, obs, _ := startSplitQuorum(t, 1)
		from := obs.len()
		if q.SplitVote() {
			t.Error("SplitVote() = true, want false")
		}
		time.Sleep(50 * time.Millisecond)
		if got := obs.since(from); len(got) != 0 {
			t.Errorf("events after SplitVote: %+v, want none", got)
		}
	})

	t.Run("three members, two killed", func(t *testing.T) {
		q, obs, _ := startSplitQuorum(t, 3)
		q.KillMember(0)
		q.KillMember(1)
		from := obs.len()
		if q.SplitVote() {
			t.Error("SplitVote() = true, want false")
		}
		time.Sleep(50 * time.Millisecond)
		if got := obs.since(from); len(got) != 0 {
			t.Errorf("events after SplitVote: %+v, want none", got)
		}
	})

	t.Run("not started", func(t *testing.T) {
		obs := &recordingObserver{}
		q := NewQuorumWithOptions(3, NewMockTimer(time.Now()), Options{Notifier: NewMockNotifier(), Observer: obs})
		defer q.Stop()
		if q.SplitVote() {
			t.Error("SplitVote() = true, want false")
		}
		time.Sleep(50 * time.Millisecond)
		if got := obs.since(0); len(got) != 0 {
			t.Errorf("events after SplitVote: %+v, want none", got)
		}
	})
}

// AC4.3: from the settled state of AC4.1 a second call starts term 2 on two followers.
func TestSplitVoteAgainAfterLeader(t *testing.T) {
	q, obs, _ := startSplitQuorum(t, 5)
	leader := splitAndSettle(t, q, obs)
	from := obs.len()

	if !q.SplitVote() {
		t.Fatal("second SplitVote() = false, want true")
	}
	started := obs.waitCount(t, from, 2, "election_started events", isEventType(EventElectionStarted))
	a, b := checkPair(t, started)
	for _, e := range started {
		if e.Term != 2 {
			t.Errorf("election_started %+v, want term 2", e)
		}
	}
	if a == leader || b == leader {
		t.Errorf("candidates %d and %d include the leader %d", a, b, leader)
	}
}

// AC4.4: with two followers killed, the majority still counts all five members, so the
// two candidates share the single remaining vote and nobody wins term 2.
func TestSplitVoteNoWinner(t *testing.T) {
	q, obs, mockTimer := startSplitQuorum(t, 5)
	leader := splitAndSettle(t, q, obs)
	var followers []int
	for id := 0; id < 5; id++ {
		if id != leader {
			followers = append(followers, id)
		}
	}
	q.KillMember(followers[0])
	q.KillMember(followers[1])
	from := obs.len()

	if !q.SplitVote() {
		t.Fatal("SplitVote() = false, want true")
	}
	started := obs.waitCount(t, from, 2, "election_started events", isEventType(EventElectionStarted))
	a, b := checkPair(t, started)
	if lo, hi := min(a, b), max(a, b); lo != followers[2] || hi != followers[3] {
		t.Errorf("candidates %d and %d, want the live followers %d and %d", a, b, followers[2], followers[3])
	}
	for _, e := range started {
		if e.Term != 2 {
			t.Errorf("election_started %+v, want term 2", e)
		}
	}

	time.Sleep(300 * time.Millisecond)
	if got := obs.matching(from, func(e Event) bool { return e.Type == EventVoteGranted && e.Term == 2 }); len(got) != 1 {
		t.Errorf("vote_granted with term 2 = %+v, want exactly one", got)
	}
	if got := obs.matching(from, becameLeader(2)); len(got) != 0 {
		t.Errorf("became_leader with term 2 = %+v, want none", got)
	}

	mockTimer.AdvanceTime(3 * time.Second)
	obs.waitCount(t, from, 1, "election_started with term 3", electionStarted(3))
}

// AC4.5: forced timeouts count as election failures, and once both members reached
// raft.MaxElectionFailures SplitVote finds no pair instead of halting them.
func TestSplitVoteFailureLimit(t *testing.T) {
	q, obs, _ := startSplitQuorum(t, 3)
	q.KillMember(2)

	for term := 1; term <= raft.MaxElectionFailures; term++ {
		from := obs.len()
		if !q.SplitVote() {
			t.Fatalf("call %d: SplitVote() = false, want true", term)
		}
		started := obs.waitCount(t, from, 2, "election_started events", isEventType(EventElectionStarted))
		checkPair(t, started)
		for _, e := range started {
			if e.Term != term {
				t.Errorf("call %d: election_started %+v, want term %d", term, e, term)
			}
		}
	}

	from := obs.len()
	if q.SplitVote() {
		t.Error("sixth SplitVote() = true, want false")
	}
	time.Sleep(50 * time.Millisecond)
	if got := obs.matching(from, isEventType(EventElectionStarted)); len(got) != 0 {
		t.Errorf("election_started after the sixth call: %+v, want none", got)
	}
	if got := obs.matching(0, isEventType(EventHalted)); len(got) != 0 {
		t.Errorf("halted events: %+v, want none", got)
	}
	if got := obs.matching(0, isEventType(EventBecameLeader)); len(got) != 0 {
		t.Errorf("became_leader events: %+v, want none", got)
	}
}

// AC4.6: SplitVote, KillMember, Snapshot and Stop from concurrent goroutines finish without
// a race report or a deadlock.
func TestSplitVoteConcurrent(t *testing.T) {
	q, _, mockTimer := startSplitQuorum(t, 5)

	var wg sync.WaitGroup
	run := func(f func(i int)) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 50; i++ {
				f(i)
				time.Sleep(time.Millisecond)
			}
		}()
	}
	run(func(int) { q.SplitVote() })
	run(func(int) { q.SplitVote() })
	run(func(int) { q.Snapshot() })
	run(func(int) { mockTimer.AdvanceTime(100 * time.Millisecond) })
	run(func(i int) {
		if i%10 == 9 {
			q.KillMember(rand.Intn(5))
		}
	})
	run(func(i int) {
		if i == 30 {
			q.Stop()
		}
	})

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("concurrent SplitVote, KillMember, Snapshot and Stop did not finish: deadlock")
	}
}

func isEventType(typ EventType) func(Event) bool {
	return func(e Event) bool { return e.Type == typ }
}
