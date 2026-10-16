package core

import (
	"context"
	"math/rand"
	"sync"
	"time"

	"github.com/Anthya1104/quorum-election-cli/internal/core/raft"
	"github.com/sirupsen/logrus"
)

const (
	heartbeatInterval   = 500 * time.Millisecond
	quorumCheckInterval = 2000 * time.Millisecond
)

// electionTimeout is randomized in [1500ms, 3000ms) so members rarely time out together.
func electionTimeout() time.Duration {
	return time.Duration(1500+rand.Intn(1500)) * time.Millisecond
}

// Member runs one raft.Node: it turns inbox messages and timer ticks into node events
// and executes the outputs the node returns.
type Member struct {
	ID    int
	Inbox chan raft.Message

	mu   sync.Mutex // Guards node; held while an event is handled
	node *raft.Node

	ctx    context.Context
	cancel context.CancelFunc

	timer     Timer
	networker Networker
	wg        *sync.WaitGroup

	// Owned by the Run goroutine
	electionTimer     ITimer
	heartbeatTicker   ITicker
	quorumCheckTicker ITicker
}

func NewMember(ctx context.Context, id int, timer Timer, networker Networker, initialPeers []int, inbox chan raft.Message, wg *sync.WaitGroup) *Member {
	memberCtx, cancel := context.WithCancel(ctx)

	return &Member{
		ID:        id,
		Inbox:     inbox, // Use injected inbox
		node:      raft.NewNode(id, initialPeers),
		ctx:       memberCtx,
		cancel:    cancel,
		timer:     timer,
		networker: networker,
		wg:        wg,
	}
}

func (m *Member) Run() {
	defer m.wg.Done()
	logrus.Infof("Member %d: Started Raft Node", m.ID)

	m.electionTimer = m.timer.NewTimer(electionTimeout())

	// Leader-only tickers, stopped until the node becomes leader
	m.heartbeatTicker = m.timer.NewTicker(heartbeatInterval)
	m.heartbeatTicker.Stop()
	m.quorumCheckTicker = m.timer.NewTicker(quorumCheckInterval)
	m.quorumCheckTicker.Stop()

	for {
		select {
		case <-m.ctx.Done():
			m.electionTimer.Stop()
			m.heartbeatTicker.Stop()
			m.quorumCheckTicker.Stop()
			return

		case msg := <-m.Inbox:
			m.handle(func() []raft.Output { return m.node.OnMessage(msg) })

		case <-m.electionTimer.C():
			m.handle(m.node.OnElectionTimeout)

		case <-m.heartbeatTicker.C():
			m.handle(m.node.OnHeartbeatTick)

		case <-m.quorumCheckTicker.C():
			m.handle(m.node.OnQuorumCheck)
		}
	}
}

func (m *Member) handle(event func() []raft.Output) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// A stopped member processes nothing, even if select picked an event over ctx.Done
	if m.ctx.Err() != nil {
		return
	}
	m.apply(event())
}

func (m *Member) apply(outputs []raft.Output) {
	for _, out := range outputs {
		switch o := out.(type) {
		case raft.Send:
			m.networker.SendTo(o.Msg, o.Msg.To)
		case raft.ResetElectionTimer:
			m.electionTimer.Stop()
			m.electionTimer.Reset(electionTimeout())
		case raft.StopElectionTimer:
			m.electionTimer.Stop()
		case raft.StartHeartbeats:
			m.quorumCheckTicker.Reset(quorumCheckInterval)
			m.heartbeatTicker.Reset(heartbeatInterval)
		case raft.StopHeartbeats:
			m.heartbeatTicker.Stop()
			m.quorumCheckTicker.Stop()
		case raft.BecameFollower:
			logrus.Infof("Member %d: Becoming Follower for term %d", m.ID, o.Term)
		case raft.StartedElection:
			logrus.Infof("Member %d: Starting election for term %d (Failures: %d)", m.ID, o.Term, o.Failures)
		case raft.VoteGranted:
			logrus.Infof("Member %d: Voted for %d in term %d", m.ID, o.Candidate, o.Term)
		case raft.BecameLeader:
			logrus.Infof("Member %d: Won election for term %d with %d votes", m.ID, o.Term, o.Votes)
		case raft.LostQuorum:
			logrus.Warnf("Member %d: Lost quorum (contacted %d peers). Stepping down.", m.ID, o.Contacted)
		case raft.Halted:
			logrus.Errorf("Member %d: Exceeded max election failures (%d). Stopping.", m.ID, raft.MaxElectionFailures)
			m.Stop()
		}
	}
}

// Status returns a copy of the node's state; safe to call from any goroutine.
func (m *Member) Status() raft.Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.node.Status()
}

func (m *Member) Stop() {
	m.cancel()
	logrus.Infof("Member %d: Stopped.", m.ID)
}

func (m *Member) IsAlive() bool {
	return m.ctx.Err() == nil
}
