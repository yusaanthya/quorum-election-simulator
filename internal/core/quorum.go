package core

import (
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

type Quorum struct {
	members  map[int]*Member
	leaderID int
	mu       sync.Mutex
}

func NewQuorum(n int) *Quorum {
	members := make(map[int]*Member)
	for i := 0; i < n; i++ {
		members[i] = NewMember(i)
	}
	return &Quorum{
		members:  members,
		leaderID: -1,
	}
}

func (q *Quorum) Start() {
	logrus.Infof("Starting quorum with %d members\n", len(q.members))
	for _, m := range q.members {
		logrus.Infof("Member %d: Hi\n", m.ID)
		go m.StartHeartbeat(q)
	}
	go q.runElection()
}


func (q *Quorum) runElection() {
	time.Sleep(500 * time.Millisecond) // simulate delay
	q.mu.Lock()
	defer q.mu.Unlock()
	q.leaderID = 0 // default leader
	logrus.Infof("Member %d: I want to be leader\n", q.leaderID)
	logrus.Infof("Member %d voted to be leader\n", q.leaderID)
}

func (q *Quorum) KillMember(id int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if m, ok := q.members[id]; ok && m.Alive {
		m.Alive = false
		logrus.Infof("Member %d is now unresponsive\n", id)
	}
}
