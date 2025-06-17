package core

import (
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

const (
	HeartbeatInterval   = 2 * time.Second
	HeartbeatTimeout    = 4 * time.Second
	VoteDecisionTimeout = 2 * HeartbeatTimeout
)

type MessageType int

const (
	Heartbeat MessageType = iota
	RequestVote
	Vote
)

type Message struct {
	From    int
	To      int
	Type    MessageType
	Payload interface{}
}

type Quorum struct {
	members  map[int]*Member
	strategy ElectionStrategy
	LeaderID int
	mu       sync.Mutex

	removed map[int]bool
}

func NewQuorum(n int) *Quorum {
	strategy := NewMajorityVoteStrategy()
	members := make(map[int]*Member)
	for i := 0; i < n; i++ {
		members[i] = NewMember(i, strategy)
	}
	return &Quorum{
		members:  members,
		strategy: strategy,
		removed:  make(map[int]bool),
	}
}

func (q *Quorum) Start() {
	logrus.Infof("Starting quorum with %d members", len(q.members))
	q.ElectLeader()
	for _, m := range q.members {
		go m.Run(q)
	}
}

func (q *Quorum) KillMember(id int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if m, ok := q.members[id]; ok && m.Alive {
		m.Stop()
	}
}

func (q *Quorum) Broadcast(msg Message) {
	for _, m := range q.members {
		if m.ID != msg.From && m.Alive && !q.removed[m.ID] {
			m.Inbox <- msg
		}
	}
}

func (q *Quorum) RemoveMember(id int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if _, ok := q.members[id]; ok {
		q.removed[id] = true
		delete(q.members, id)
		logrus.Infof("Member %d is officially removed from quorum", id)
		if id == q.LeaderID {
			logrus.Infof("Leader %d was killed. Triggering re-election...", id)
			q.ElectLeader()
		}
	}
}

func (q *Quorum) ElectLeader() {
	for id, m := range q.members {
		if m.Alive && !q.removed[id] {
			q.LeaderID = id
			logrus.Infof("Member %d elected as Leader", id)
			return
		}
	}
	logrus.Warn("No alive member to elect as leader")
}
