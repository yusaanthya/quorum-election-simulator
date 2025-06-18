package core

import (
	"context"
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

	ctx    context.Context
	cancel context.CancelFunc
}

func NewQuorum(n int) *Quorum {
	ctx, cancel := context.WithCancel(context.Background())
	strategy := NewMajorityVoteStrategy()
	members := make(map[int]*Member)
	for i := 0; i < n; i++ {
		members[i] = NewMember(ctx, i, strategy)
	}
	return &Quorum{
		members:  members,
		strategy: strategy,
		removed:  make(map[int]bool),
		ctx:      ctx,
		cancel:   cancel,
	}
}

func (q *Quorum) Start() {
	logrus.Infof("Starting quorum with %d members", len(q.members))
	q.ElectLeader()
	for _, m := range q.members {
		go m.Run(q)
	}
}

// stop target member's heartbeat
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

// remove dead member from quorum
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
		logrus.Debugf("Current members: %v , removed member: %v", q.members, q.removed)
		if len(q.members) <= 1 {
			logrus.Info("Only 1 member left, end the game")
			q.cancel()
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

func (q *Quorum) Stop() {
	q.mu.Lock()
	defer q.mu.Unlock()

	logrus.Info("Stopping quorum...")
	for _, m := range q.members {
		if m.Alive {
			m.Stop()
		}
	}
	q.cancel()
}

func (q *Quorum) Done() <-chan struct{} {
	return q.ctx.Done()
}
