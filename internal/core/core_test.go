package core

import (
	"testing"
	"time"
)

func TestNewQuorumInitialization(t *testing.T) {
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
		if m.ID != i {
			t.Errorf("Member ID mismatch: expected %d, got %d", i, m.ID)
		}
		if !m.Alive {
			t.Errorf("Expected member %d to be alive initially", i)
		}
		for j := 0; j < 3; j++ {
			if i == j {
				continue
			}
			lastSeenTime, exists := m.lastSeen[j]
			if !exists {
				t.Errorf("Member %d's lastSeen for member %d should exist", i, j)
			}
			if lastSeenTime != mockTimer.Now() {
				t.Errorf("Member %d's lastSeen for member %d expected to be %v, got %v", i, j, mockTimer.Now(), lastSeenTime)
			}
		}
	}

	if q.LeaderID != -1 {
		t.Errorf("Expected LeaderID to be -1 (not elected yet), got %d", q.LeaderID)
	}

	if q.strategy == nil {
		t.Errorf("Expected election strategy to be initialized, got nil")
	}

	q.Stop()
}

func TestKillMember(t *testing.T) {

	mockTimer := NewMockTimer(time.Now())
	mockNotifier := NewMockNotifier()
	q := NewQuorum(3, mockTimer, mockNotifier)
	q.networker = NewTestNetworkRouter(q)
	q.Start()

	// make sure the lastSeen updated
	mockTimer.AdvanceTime(HeartbeatInterval)

	// leave enough time for go scheduler
	time.Sleep(500 * time.Millisecond)

	memberToKillID := 1

	q.KillMember(memberToKillID) // Member 1 stop heartbeat

	m, ok := q.members[memberToKillID]
	if !ok {
		t.Fatalf("Expected member %d to exist in quorum, but not found after kill", memberToKillID)
	}
	if m.Alive {
		t.Errorf("Expected member %d to be marked as not alive after kill", memberToKillID)
	}

	// make sure the heartbeat monitoring would be trigger
	mockTimer.AdvanceTime(HeartbeatTimeout * 2)

	// make sure member 0 and member 2 would not trigger dead suspectinng
	if m0, ok := q.members[0]; ok {
		m0.mu.Lock()
		m0.lastSeen[2] = mockTimer.Now()
		m0.mu.Unlock()
	}
	if m2, ok := q.members[2]; ok {
		m2.mu.Lock()
		m2.lastSeen[0] = mockTimer.Now()
		m2.mu.Unlock()
	}

	removedID := waitForChannelReceive(t, mockNotifier.memberRemovedCh, 5*time.Second, "Expected member removed notification")
	if removedID != memberToKillID {
		t.Errorf("Expected member %d to be removed, got %d", memberToKillID, removedID)
	}

	q.mu.Lock()
	_, existsInMembers := q.members[memberToKillID]
	isRemovedInMap := q.removed[memberToKillID]
	q.mu.Unlock()

	if existsInMembers {
		t.Errorf("Member %d should be removed from q.members map", memberToKillID)
	}
	if !isRemovedInMap {
		t.Errorf("Member %d should be marked as removed in q.removed map", memberToKillID)
	}

	if len(q.getAliveMemberIDs()) > 1 {
		assertChannelEmpty(t, mockNotifier.quorumEndedCh, 100*time.Millisecond, "Did not expect quorum ended notification")
	}

	q.Stop()
}

func TestMajorityVoteStrategy_HandleVote_NoMajority(t *testing.T) {
	mockTimer := NewMockTimer(time.Now())
	mockNotifier := NewMockNotifier()
	q := NewQuorum(4, mockTimer, mockNotifier)
	q.networker = NewTestNetworkRouter(q)
	defer q.Stop()
	q.Start()

	strategy0 := q.members[0].Election.(*MajorityVoteStrategy)

	strategy0.voteMutex.Lock()
	strategy0.voteTimestamps[1] = mockTimer.Now()
	strategy0.votes[1] = make(map[int]bool)
	strategy0.votes[1][0] = true
	strategy0.voteMutex.Unlock()

	voteMsgFrom2 := Message{From: 2, To: 0, Type: Vote, Payload: 1}
	q.members[0].handleMessage(voteMsgFrom2, q)

	assertChannelEmpty(t, mockNotifier.memberRemovedCh, 100*time.Millisecond, "Did not expect member removed notification (no majority)")

	assertChannelEmpty(t, mockNotifier.quorumEndedCh, 100*time.Millisecond, "Did not expect quorum ended notification")

	q.Stop()
}
