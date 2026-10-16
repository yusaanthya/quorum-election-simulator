package core

import (
	"testing"
	"time"

	"github.com/Anthya1104/quorum-election-cli/internal/core/raft"
)

// electionWaitTicks bounds how many 100ms mock-time ticks a test waits for a leader.
// Members whose timeouts land in the same tick split the vote and retry after another
// randomized timeout (up to 3s), so the window covers several rounds.
const electionWaitTicks = 100

func TestRaftInitialization(t *testing.T) {
	mockTimer := NewMockTimer(time.Now())
	mockNotifier := NewMockNotifier()

	q := NewQuorum(3, mockTimer, mockNotifier)
	defer q.Stop()

	if len(q.members) != 3 {
		t.Fatalf("Expected 3 members, got %d", len(q.members))
	}

	for i := 0; i < 3; i++ {
		m, ok := q.members[i]
		if !ok {
			t.Errorf("Expected member %d to exist, but not found", i)
		}
		if m.Status().Role != raft.Follower {
			t.Errorf("Member %d should start as Follower, got %v", i, m.Status().Role)
		}
		if m.Status().Term != 0 {
			t.Errorf("Member %d should start with Term 0, got %d", i, m.Status().Term)
		}
	}
}

func TestLeaderElection(t *testing.T) {
	mockTimer := NewMockTimer(time.Now())
	mockNotifier := NewMockNotifier()
	q := NewQuorum(3, mockTimer, mockNotifier)

	q.Start()
	defer q.Stop()

	// Wait for members to start and register timers
	time.Sleep(50 * time.Millisecond)

	// Advance time gradually to allow randomized timeouts to trigger naturally
	// Tick every 100ms, up to electionWaitTicks
	for i := 0; i < electionWaitTicks; i++ {
		mockTimer.AdvanceTime(100 * time.Millisecond)
		time.Sleep(10 * time.Millisecond) // Allow goroutines to run

		// Check for leader
		leaderCount := 0
		for _, m := range q.members {
			if m.Status().Role == raft.Leader {
				leaderCount++
			}
		}

		if leaderCount == 1 {
			break
		}
	}

	// Check if a leader is elected
	leaderCount := 0
	for _, m := range q.members {
		if m.Status().Role == raft.Leader {
			leaderCount++
		}
	}

	if leaderCount != 1 {
		t.Errorf("Expected exactly 1 leader, got %d", leaderCount)
	}

	leaderID := waitForChannelReceive(t, mockNotifier.leaderElectedCh, time.Second, "Leader election notification")
	if q.members[leaderID].Status().Role != raft.Leader {
		t.Errorf("Notifier reported member %d as leader, but it is %v", leaderID, q.members[leaderID].Status().Role)
	}
}

func TestFailoverReElection(t *testing.T) {
	mockTimer := NewMockTimer(time.Now())
	mockNotifier := NewMockNotifier()
	q := NewQuorum(3, mockTimer, mockNotifier)

	q.Start()
	defer q.Stop()

	// Wait for members to start
	time.Sleep(50 * time.Millisecond)

	// Initial election
	for i := 0; i < electionWaitTicks; i++ {
		mockTimer.AdvanceTime(100 * time.Millisecond)
		time.Sleep(10 * time.Millisecond)
		leaderCount := 0
		for _, m := range q.members {
			if m.Status().Role == raft.Leader {
				leaderCount++
			}
		}
		if leaderCount == 1 {
			break
		}
	}

	var oldLeaderID int = -1
	for _, m := range q.members {
		if m.Status().Role == raft.Leader {
			oldLeaderID = m.ID
		}
	}

	if oldLeaderID == -1 {
		t.Fatalf("Failed to elect initial leader")
	}

	// Kill the leader
	q.KillMember(oldLeaderID)

	// Advance time for others to timeout (heartbeat timeout ~0.5s, election timeout 1.5s+)
	// Wait enough for election timeout
	for i := 0; i < electionWaitTicks; i++ {
		mockTimer.AdvanceTime(100 * time.Millisecond)
		time.Sleep(10 * time.Millisecond)

		leaderCount := 0
		for _, m := range q.members {
			if m.ID == oldLeaderID {
				continue
			}
			if m.Status().Role == raft.Leader {
				leaderCount++
			}
		}
		if leaderCount == 1 {
			break
		}
	}

	leaderCount := 0
	var newLeaderID int = -1
	for _, m := range q.members {
		if m.ID == oldLeaderID {
			continue
		}
		if m.Status().Role == raft.Leader {
			leaderCount++
			newLeaderID = m.ID
		}
	}

	if leaderCount != 1 {
		t.Errorf("Expected 1 new leader after failover, got %d", leaderCount)
	}

	if newLeaderID == oldLeaderID {
		t.Errorf("New leader should be different from old leader")
	}
}

func TestQuorumLossTermination(t *testing.T) {
	mockTimer := NewMockTimer(time.Now())
	mockNotifier := NewMockNotifier()
	q := NewQuorum(3, mockTimer, mockNotifier)
	q.Start()

	// Wait for leader election
	time.Sleep(50 * time.Millisecond)
	leaderFound := false
	for i := 0; i < electionWaitTicks; i++ {
		mockTimer.AdvanceTime(100 * time.Millisecond)
		time.Sleep(10 * time.Millisecond)

		leaderCount := 0
		for _, m := range q.members {
			if m.Status().Role == raft.Leader {
				leaderCount++
			}
		}
		if leaderCount == 1 {
			leaderFound = true
			break
		}
	}

	if !leaderFound {
		t.Fatal("Failed to elect initial leader")
	}

	// Kill 2 nodes (majority loss)
	q.members[0].Stop()
	q.members[1].Stop()

	t.Log("Killed members 0 and 1. Surviving member: 2")

	// Advance time to allow accumulation of election failures
	startState := q.members[2].IsAlive()
	if !startState {
		t.Fatal("Member 2 should be alive initially")
	}

	stopped := false
	for i := 0; i < 300; i++ { // 30s simulation
		mockTimer.AdvanceTime(100 * time.Millisecond)
		time.Sleep(5 * time.Millisecond)

		alive := q.members[2].IsAlive()
		failures := q.members[2].Status().ElectionFailures

		if !alive {
			t.Logf("Member 2 stopped as expected. Failures: %d", failures)
			stopped = true
			break
		}
	}

	if !stopped {
		failures := q.members[2].Status().ElectionFailures
		t.Fatalf("Member 2 did not stop after quorum loss. Current failures: %d", failures)
	}
	q.Stop()
}
