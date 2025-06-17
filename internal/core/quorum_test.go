package core

import (
	"testing"
	"time"

	"github.com/sirupsen/logrus"
)

func TestNewQuorumInitialization(t *testing.T) {
	q := NewQuorum(3)
	if len(q.members) != 3 {
		logrus.Fatalf("expected 3 members, got %d", len(q.members))
	}
	for i := 0; i < 3; i++ {
		if _, ok := q.members[i]; !ok {
			logrus.Errorf("expected member %d to exist", i)
		}
	}
}

func TestKillMember(t *testing.T) {
	q := NewQuorum(2)
	q.KillMember(1)
	if q.members[1].Alive {
		logrus.Error("expected member 1 to be killed")
	}
}

func TestHeartbeatVoteFlow(t *testing.T) {
	q := NewQuorum(3)
	q.Start()
	time.Sleep(1 * time.Second)
	q.KillMember(1)
	time.Sleep(HeartbeatTimeout + 2*time.Second)
	// Observe log output for voting messages and quorum confirmation
}
