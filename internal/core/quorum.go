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

type Quorum struct {
	members  map[int]*Member
	strategy ElectionStrategy
	LeaderID int
	mu       sync.Mutex

	removed map[int]bool // Stores IDs of officially removed members

	ctx    context.Context
	cancel context.CancelFunc

	timer Timer

	notifier   QuorumEventNotifier
	networker  Networker
	internalWg sync.WaitGroup
}

func NewQuorum(n int, timer Timer, notifier QuorumEventNotifier) *Quorum {
	childCtx, cancel := context.WithCancel(context.Background())

	if notifier == nil {
		notifier = NewNoOpNotifier()
	}

	q := &Quorum{
		members:    make(map[int]*Member),
		strategy:   nil,
		removed:    make(map[int]bool),
		ctx:        childCtx,
		cancel:     cancel,
		timer:      timer,
		notifier:   notifier,
		LeaderID:   -1,
		internalWg: sync.WaitGroup{}, // initialize the internal wg
	}

	q.networker = NewQuorumNetworker(q)

	strategy := NewMajorityVoteStrategy(childCtx, timer, q, &q.internalWg)
	q.strategy = strategy

	allMemberIDs := make([]int, 0, n)
	for i := 0; i < n; i++ {
		allMemberIDs = append(allMemberIDs, i)
	}

	for i := 0; i < n; i++ {
		q.members[i] = NewMember(childCtx, i, strategy, timer, q.networker, allMemberIDs, &q.internalWg)
	}
	return q
}

func (q *Quorum) Start() {
	q.mu.Lock()
	defer q.mu.Unlock()
	logrus.Infof("Starting quorum with %d members", len(q.members))
	q.ElectLeader()
	for _, m := range q.members {
		q.internalWg.Add(1)
		go m.Run(q)
	}
}

// KillMember to stop member's heartbeat
func (q *Quorum) KillMember(id int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if m, ok := q.members[id]; ok && m.Alive {
		m.Stop()
		logrus.Infof("CLI Command: Member %d is now unresponsive (killed).", id)
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
			case <-q.timer.NewTicker(100 * time.Millisecond).C:
				logrus.Warnf("Failed to send message from %d to %d (type %v): inbox full or blocked.", msg.From, m.ID, msg.Type)
			}
		}
	}
}

// ProposeMemberRemoval: leader propose quorum to remove member
func (q *Quorum) ProposeMemberRemoval(id int) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if _, ok := q.members[id]; ok && !q.removed[id] {
		q.removed[id] = true
		delete(q.members, id)
		logrus.Infof("Member %d is officially removed from quorum. Current active members: %v", id, len(q.members))

		q.notifier.NotifyMemberRemoved(id)

		if id == q.LeaderID {
			logrus.Infof("Leader %d was removed. Triggering re-election...", id)
			q.ElectLeader()
		}
		logrus.Debugf("Current active members: %+v, Removed members: %+v", q.getAliveMemberIDs(), q.removed)

		if len(q.members) <= 1 {
			logrus.Info("Quorum has fewer than 2 active members. Ending simulation.")
			q.cancel()
			q.notifier.NotifyQuorumEnded()
		}
	} else {
		logrus.Debugf("Attempted to remove member %d, but it's not in active members or already marked as removed.", id)
	}
}

func (q *Quorum) getAliveMemberIDs() []int {
	ids := []int{}
	for id := range q.members {
		ids = append(ids, id)
	}
	return ids
}

func (q *Quorum) ElectLeader() {

	var newLeaderID = -1
	for id, m := range q.members {
		if m.Alive && !q.removed[id] {
			if newLeaderID == -1 || id < newLeaderID {
				newLeaderID = id
			}
		}
	}

	if newLeaderID != -1 {
		q.LeaderID = newLeaderID
		logrus.Infof("New Leader elected: Member %d", q.LeaderID)
		q.notifier.NotifyLeaderElected(newLeaderID)
	} else {
		q.LeaderID = -1
		logrus.Warn("No alive member to elect as leader.")
		q.cancel()
		q.notifier.NotifyQuorumEnded()
	}
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
