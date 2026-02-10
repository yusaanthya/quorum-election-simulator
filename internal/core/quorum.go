package core

import (
	"context"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

type QuorumEventNotifier interface {
	NotifyMemberRemoved(memberID int)
	NotifyLeaderElected(leaderID int)
	NotifyQuorumEnded()
}

type noOpNotifier struct{}

func NewNoOpNotifier() QuorumEventNotifier {
	return &noOpNotifier{}
}

func (n *noOpNotifier) NotifyMemberRemoved(memberID int) {
	logrus.Debugf("[NoOpNotifier] Member %d removed.", memberID)
}

func (n *noOpNotifier) NotifyLeaderElected(leaderID int) {
	logrus.Debugf("[NoOpNotifier] Leader elected: %d.", leaderID)
}

func (n *noOpNotifier) NotifyQuorumEnded() {
	logrus.Debugf("[NoOpNotifier] Quorum ended.")
}

type Networker interface {
	Send(msg Message)
	SendTo(msg Message, toMemberID int)
}

type QuorumNetworker struct {
	q *Quorum
}

func NewQuorumNetworker(q *Quorum) *QuorumNetworker {
	return &QuorumNetworker{q: q}
}

func (qn *QuorumNetworker) Send(msg Message) {
	qn.q.Broadcast(msg)
}
func (qn *QuorumNetworker) SendTo(msg Message, toMemberID int) {
	qn.q.mu.Lock()
	defer qn.q.mu.Unlock()

	targetMember, ok := qn.q.members[toMemberID]
	if ok && targetMember.Alive && !qn.q.removed[toMemberID] {
		select {
		case targetMember.Inbox <- msg:
		case <-qn.q.timer.NewTicker(100 * time.Millisecond).C():
			logrus.Warnf("Failed to send message from %d to %d (type %v): inbox full or blocked.", msg.From, toMemberID, msg.Type)
		}
	} else {
		logrus.Debugf("Cannot send message from %d to %d (type %v): target not alive or removed.", msg.From, toMemberID, msg.Type)
	}
}

type Quorum struct {
	members map[int]*Member
	mu      sync.Mutex

	removed map[int]bool // Stores IDs of officially removed members

	ctx    context.Context
	cancel context.CancelFunc

	timer Timer

	notifier   QuorumEventNotifier
	networker  Networker
	internalWg sync.WaitGroup

	quorumEndedOnce sync.Once
}

func NewQuorum(n int, timer Timer, notifier QuorumEventNotifier) *Quorum {
	childCtx, cancel := context.WithCancel(context.Background())

	if notifier == nil {
		notifier = NewNoOpNotifier()
	}

	q := &Quorum{
		members:         make(map[int]*Member),
		removed:         make(map[int]bool),
		ctx:             childCtx,
		cancel:          cancel,
		timer:           timer,
		notifier:        notifier,
		internalWg:      sync.WaitGroup{},
		quorumEndedOnce: sync.Once{},
	}

	q.networker = NewQuorumNetworker(q)

	allMemberIDs := make([]int, 0, n)
	for i := 0; i < n; i++ {
		allMemberIDs = append(allMemberIDs, i)
	}

	for i := 0; i < n; i++ {
		q.members[i] = NewMember(childCtx, i, timer, q.networker, allMemberIDs, &q.internalWg)
	}
	return q
}

func (q *Quorum) Start() {
	q.mu.Lock()
	defer q.mu.Unlock()
	logrus.Infof("Starting quorum with %d members", len(q.members))

	// Start all members
	for _, m := range q.members {
		q.internalWg.Add(1)
		go m.Run(q)
	}
}

// KillMember to stop member's heartbeat/processing
func (q *Quorum) KillMember(id int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if m, ok := q.members[id]; ok && m.Alive {
		m.Stop()
		q.removed[id] = true // Mark as removed effectively
		logrus.Infof("CLI Command: Member %d is now unresponsive (killed).", id)
		q.notifier.NotifyMemberRemoved(id)
	} else {
		logrus.Warnf("CLI Command: Member %d not found or already dead.", id)
	}
}

// Broadcast to every Alive member
func (q *Quorum) Broadcast(msg Message) {
	q.mu.Lock()
	defer q.mu.Unlock()
	for _, m := range q.members {
		if m.ID != msg.From && m.Alive && !q.removed[m.ID] {
			select {
			case m.Inbox <- msg:
			case <-q.timer.NewTicker(100 * time.Millisecond).C():
				logrus.Warnf("Failed to send message from %d to %d (type %v): inbox full or blocked.", msg.From, m.ID, msg.Type)
			}
		}
	}
}

func (q *Quorum) getAliveMemberIDs() []int {
	ids := []int{}
	for id := range q.members {
		ids = append(ids, id)
	}
	return ids
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
	q.internalWg.Wait()
	logrus.Info("Quorum stopped.")
}

func (q *Quorum) Done() <-chan struct{} {
	return q.ctx.Done()
}
