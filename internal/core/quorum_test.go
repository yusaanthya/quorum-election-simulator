package core

import (
	"testing"
	"time"
)

func TestNewQuorumInitialization(t *testing.T) {
	mockTimer := NewMockTimer(time.Now())
	q := NewQuorum(3, mockTimer)
	if len(q.members) != 3 {
		t.Fatalf("expected 3 members, got %d", len(q.members))
	}
	for i := 0; i < 3; i++ {
		if _, ok := q.members[i]; !ok {
			t.Errorf("expected member %d to exist", i)
		}
	}
	// stop q to clean up goroutine
	q.Stop()
}

func TestKillMember(t *testing.T) {
	mockTimer := NewMockTimer(time.Now())
	q := NewQuorum(2, mockTimer)
	q.Start()
	q.KillMember(1)

	if m, ok := q.members[1]; ok {
		if m.Alive {
			t.Errorf("TestKillMember failed: expected member 1 to be killed")
		}
	} else {

		t.Errorf("TestKillMember failed: expect member 1 exist in quorum but not found")
	}

	q.Stop()
}
