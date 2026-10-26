package core

import (
	"context"
	"sync"

	"github.com/Anthya1104/quorum-election-cli/internal/core/raft"
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
	Send(msg raft.Message)
	SendTo(msg raft.Message, toMemberID int)
}

// DirectNetworker uses a map of channels for O(1) non-blocking sends.
type DirectNetworker struct {
	inboxes map[int]chan raft.Message
}

func NewDirectNetworker(inboxes map[int]chan raft.Message) *DirectNetworker {
	return &DirectNetworker{inboxes: inboxes}
}

func (dn *DirectNetworker) Send(msg raft.Message) {
	// Broadcast to all
	for id := range dn.inboxes {
		if id != msg.From {
			dn.SendTo(msg, id)
		}
	}
}

func (dn *DirectNetworker) SendTo(msg raft.Message, toMemberID int) {
	if ch, ok := dn.inboxes[toMemberID]; ok {
		select {
		case ch <- msg:
			// Success
		default:
			logrus.Warnf("DirectNetworker: Dropped message from %d to %d (type %v) - Channel Full", msg.From, toMemberID, msg.Type)
		}
	} else {
		logrus.Debugf("DirectNetworker: Target %d not found", toMemberID)
	}
}

type Quorum struct {
	members map[int]*Member
	mu      sync.Mutex

	ctx    context.Context
	cancel context.CancelFunc

	notifier   QuorumEventNotifier
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
		ctx:             childCtx,
		cancel:          cancel,
		notifier:        notifier,
		internalWg:      sync.WaitGroup{},
		quorumEndedOnce: sync.Once{},
	}

	// Phase 1: Pre-allocate all channels (Inboxes)
	inboxes := make(map[int]chan raft.Message, n)
	for i := 0; i < n; i++ {
		inboxes[i] = make(chan raft.Message, 100)
	}

	// Phase 2: Create Lock-Free Networker
	networker := NewDirectNetworker(inboxes)

	// Phase 3: Create Members with injected dependencies
	allMemberIDs := make([]int, 0, n)
	for i := 0; i < n; i++ {
		allMemberIDs = append(allMemberIDs, i)
	}

	for i := 0; i < n; i++ {
		// Pass the pre-allocated inbox to the member
		q.members[i] = NewMember(childCtx, i, timer, networker, notifier, allMemberIDs, inboxes[i], &q.internalWg)
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
		go m.Run()
	}

	// Monitor for all members stopping
	go func() {
		q.internalWg.Wait()
		q.quorumEndedOnce.Do(func() {
			logrus.Info("All members stopped. Auto-terminating Quorum.")
			q.notifier.NotifyQuorumEnded()
			q.cancel()
		})
	}()
}

// KillMember to stop member's heartbeat/processing
func (q *Quorum) KillMember(id int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if m, ok := q.members[id]; ok && m.IsAlive() {
		m.Stop()
		logrus.Infof("CLI Command: Member %d is now unresponsive (killed).", id)
		q.notifier.NotifyMemberRemoved(id)
	} else {
		logrus.Warnf("CLI Command: Member %d not found or already dead.", id)
	}
}

func (q *Quorum) Stop() {
	q.mu.Lock()
	defer q.mu.Unlock()

	logrus.Info("Stopping quorum...")
	for _, m := range q.members {
		if m.IsAlive() {
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
