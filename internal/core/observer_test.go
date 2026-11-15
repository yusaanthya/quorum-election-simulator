package core

import (
	"sync"
	"testing"
	"time"

	"github.com/Anthya1104/quorum-election-cli/internal/core/raft"
)

type recordingObserver struct {
	mu     sync.Mutex
	events []Event
}

func (r *recordingObserver) OnEvent(e Event) {
	r.mu.Lock()
	r.events = append(r.events, e)
	r.mu.Unlock()
}

func (r *recordingObserver) find(match func(Event) bool) (Event, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, e := range r.events {
		if match(e) {
			return e, true
		}
	}
	return Event{}, false
}

func TestObserverSeesElection(t *testing.T) {
	mockTimer := NewMockTimer(time.Now())
	mockNotifier := NewMockNotifier()
	obs := &recordingObserver{}
	q := NewQuorumWithOptions(3, mockTimer, Options{Notifier: mockNotifier, Observer: obs})
	q.Start()
	defer q.Stop()

	time.Sleep(50 * time.Millisecond)
	if _, ok := obs.find(func(e Event) bool { return e.Type == EventQuorumStarted && e.Members == 3 }); !ok {
		t.Fatal("expected quorum_started with 3 members")
	}
	for id := 0; id < 3; id++ {
		if _, ok := obs.find(func(e Event) bool { return e.Type == EventElectionTimer && e.Member == id && e.DurationMs >= 1500 }); !ok {
			t.Errorf("expected an initial election_timer event for member %d", id)
		}
	}

	for i := 0; i < electionWaitTicks; i++ {
		mockTimer.AdvanceTime(100 * time.Millisecond)
		time.Sleep(10 * time.Millisecond)
		if _, ok := obs.find(func(e Event) bool { return e.Type == EventBecameLeader }); ok {
			break
		}
	}
	leaderID := waitForChannelReceive(t, mockNotifier.leaderElectedCh, time.Second, "Leader election notification")

	won, ok := obs.find(func(e Event) bool { return e.Type == EventBecameLeader })
	if !ok || won.Member != leaderID || won.Votes < 2 {
		t.Fatalf("became_leader = %+v (found %v), want member %d with a majority", won, ok, leaderID)
	}
	checks := map[string]func(Event) bool{
		"request_vote from the leader": func(e Event) bool {
			return e.Type == EventMessage && e.Message == MessageRequestVote && e.Member == leaderID && e.Term == won.Term
		},
		"granted vote_reply to the leader": func(e Event) bool {
			return e.Type == EventMessage && e.Message == MessageVoteReply && e.Peer == leaderID && e.Granted
		},
		"heartbeat from the leader": func(e Event) bool {
			return e.Type == EventMessage && e.Message == MessageHeartbeat && e.Member == leaderID
		},
		"leader status": func(e Event) bool {
			return e.Type == EventStatus && e.Member == leaderID && e.Role == raft.Leader.String() && e.Alive
		},
		"vote_granted for the leader": func(e Event) bool {
			return e.Type == EventVoteGranted && e.Peer == leaderID
		},
	}
	for name, match := range checks {
		if _, ok := obs.find(match); !ok {
			t.Errorf("expected %s", name)
		}
	}

	q.KillMember(leaderID)
	if _, ok := obs.find(func(e Event) bool { return e.Type == EventStopped && e.Member == leaderID }); !ok {
		t.Error("expected stopped event for the killed leader")
	}
	snap := q.Snapshot()
	if len(snap) != 3 || snap[leaderID].Alive || snap[leaderID].Role != raft.Leader.String() {
		t.Errorf("Snapshot() = %+v, want 3 members with %d dead", snap, leaderID)
	}
}

func TestLatencyDelaysDelivery(t *testing.T) {
	inbox := make(chan raft.Message, 1)
	obs := &recordingObserver{}
	n := &observedNetworker{
		inner:    NewDirectNetworker(map[int]chan raft.Message{1: inbox}),
		observer: obs,
		latency:  func() time.Duration { return 80 * time.Millisecond },
	}

	start := time.Now()
	n.SendTo(raft.Message{From: 0, To: 1, Type: raft.MsgAppendEntries, Payload: raft.AppendEntriesArgs{Term: 4, LeaderID: 0}}, 1)

	e, ok := obs.find(func(e Event) bool { return e.Type == EventMessage })
	if !ok || e.Message != MessageHeartbeat || e.Term != 4 || e.DurationMs != 80 {
		t.Fatalf("message event = %+v (found %v), want heartbeat term 4 with 80ms delay", e, ok)
	}
	select {
	case <-inbox:
		t.Fatal("message delivered before its latency elapsed")
	default:
	}
	select {
	case <-inbox:
		if elapsed := time.Since(start); elapsed < 80*time.Millisecond {
			t.Errorf("delivered after %v, want at least 80ms", elapsed)
		}
	case <-time.After(time.Second):
		t.Fatal("message never delivered")
	}
}

// A member killed while it publishes a status must not report stopped until that status is out.
func TestStopWaitsForStatusInFlight(t *testing.T) {
	mockTimer := NewMockTimer(time.Now())
	entered := make(chan struct{})
	release := make(chan struct{})
	var once sync.Once
	rec := &recordingObserver{}
	obs := ObserverFunc(func(e Event) {
		rec.OnEvent(e)
		if e.Type == EventStatus && e.Role != raft.Follower.String() {
			once.Do(func() {
				close(entered)
				<-release
			})
		}
	})
	q := NewQuorumWithOptions(1, mockTimer, Options{Notifier: NewMockNotifier(), Observer: obs})
	q.Start()
	defer q.Stop()
	// Runs before q.Stop, so a failing test never leaves the member blocked in the observer.
	var releaseOnce sync.Once
	unblock := func() { releaseOnce.Do(func() { close(release) }) }
	defer unblock()

	time.Sleep(50 * time.Millisecond)
	mockTimer.AdvanceTime(3 * time.Second)
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("member never published a status after its election timeout")
	}

	go q.KillMember(0)
	time.Sleep(50 * time.Millisecond)
	if _, ok := rec.find(func(e Event) bool { return e.Type == EventStopped }); ok {
		t.Fatal("stopped was published while a live status was still being delivered")
	}
	unblock()

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if _, ok := rec.find(func(e Event) bool { return e.Type == EventStopped }); ok {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("stopped was never published")
}
