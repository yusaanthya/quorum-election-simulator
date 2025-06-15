package core

import (
	"testing"
	"time"
)

func TestNewQuorumInitialization(t *testing.T) {
	q := NewQuorum(3)
	if len(q.members) != 3 {
		t.Fatalf("expected 3 members, got %d", len(q.members))
	}
	for i := 0; i < 3; i++ {
		if _, ok := q.members[i]; !ok {
			t.Errorf("expected member %d to exist", i)
		}
	}
}

func TestKillMember(t *testing.T) {
	q := NewQuorum(2)
	q.KillMember(1)
	if q.members[1].Alive {
		t.Error("expected member 1 to be killed")
	}
}

func TestLeaderElection(t *testing.T) {
	q := NewQuorum(2)
	q.runElection()
	if q.leaderID != 0 {
		t.Errorf("expected leader to be 0, got %d", q.leaderID)
	}
}

func TestHeartbeatStopsOnKill(t *testing.T) {
	q := NewQuorum(1)
	member := q.members[0]
	go member.StartHeartbeat(q)
	time.Sleep(1 * time.Second)
	member.Alive = false
	time.Sleep(1 * time.Second) // heartbeat should stop silently
	//TODO: test heartbeat stopped after heartbeat checking mechanism created
}
