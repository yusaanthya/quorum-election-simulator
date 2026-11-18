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
	notifier  QuorumEventNotifier
	observer  Observer
	wg        *sync.WaitGroup

	lastStatus raft.Status // Last status sent to observer; guarded by mu

	// Used only under mu, or by Run. Run sets electionTimer under mu, so a non-nil
	// electionTimer read under mu means that Run has started.
	electionTimer     ITimer
	heartbeatTicker   ITicker
	quorumCheckTicker ITicker
}

func NewMember(ctx context.Context, id int, timer Timer, networker Networker, notifier QuorumEventNotifier, initialPeers []int, inbox chan raft.Message, wg *sync.WaitGroup) *Member {
	return newMember(ctx, id, timer, networker, notifier, nil, initialPeers, inbox, wg)
}

func newMember(ctx context.Context, id int, timer Timer, networker Networker, notifier QuorumEventNotifier, observer Observer, initialPeers []int, inbox chan raft.Message, wg *sync.WaitGroup) *Member {
	memberCtx, cancel := context.WithCancel(ctx)
	if observer == nil {
		observer = noOpObserver{}
	}

	return &Member{
		ID:        id,
		Inbox:     inbox, // Use injected inbox
		node:      raft.NewNode(id, initialPeers),
		ctx:       memberCtx,
		cancel:    cancel,
		timer:     timer,
		networker: networker,
		notifier:  notifier,
		observer:  observer,
		wg:        wg,
	}
}

func (m *Member) Run() {
	defer m.wg.Done()
	logrus.Infof("Member %d: Started Raft Node", m.ID)

	timeout := electionTimeout()
	m.mu.Lock()
	m.electionTimer = m.timer.NewTimer(timeout)
	m.lastStatus = m.node.Status()
	// A member stopped before it started has already published stopped; stay silent.
	if m.ctx.Err() == nil {
		m.observer.OnEvent(statusEvent(m.lastStatus, true))
		m.observer.OnEvent(Event{Type: EventElectionTimer, Member: m.ID, DurationMs: timeout.Milliseconds()})
	}
	m.mu.Unlock()

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
	m.handleLocked(event)
}

// handleLocked applies one node event and publishes the resulting status; the caller
// holds mu.
func (m *Member) handleLocked(event func() []raft.Output) {
	// A stopped member processes nothing, even if select picked an event over ctx.Done
	if m.ctx.Err() != nil {
		return
	}
	m.apply(event())

	if s := m.node.Status(); s != m.lastStatus {
		m.lastStatus = s
		m.observer.OnEvent(statusEvent(s, m.ctx.Err() == nil))
	}
}

func (m *Member) apply(outputs []raft.Output) {
	for _, out := range outputs {
		switch o := out.(type) {
		case raft.Send:
			m.networker.SendTo(o.Msg, o.Msg.To)
		case raft.ResetElectionTimer:
			timeout := electionTimeout()
			m.electionTimer.Stop()
			m.electionTimer.Reset(timeout)
			m.observer.OnEvent(Event{Type: EventElectionTimer, Member: m.ID, DurationMs: timeout.Milliseconds()})
		case raft.StopElectionTimer:
			m.electionTimer.Stop()
			m.observer.OnEvent(Event{Type: EventElectionTimerStopped, Member: m.ID})
		case raft.StartHeartbeats:
			m.quorumCheckTicker.Reset(quorumCheckInterval)
			m.heartbeatTicker.Reset(heartbeatInterval)
		case raft.StopHeartbeats:
			m.heartbeatTicker.Stop()
			m.quorumCheckTicker.Stop()
		case raft.BecameFollower:
			logrus.Infof("Member %d: Becoming Follower for term %d", m.ID, o.Term)
			m.observer.OnEvent(Event{Type: EventBecameFollower, Member: m.ID, Term: o.Term})
		case raft.StartedElection:
			logrus.Infof("Member %d: Starting election for term %d (Failures: %d)", m.ID, o.Term, o.Failures)
			m.observer.OnEvent(Event{Type: EventElectionStarted, Member: m.ID, Term: o.Term, Failures: o.Failures})
		case raft.VoteGranted:
			logrus.Infof("Member %d: Voted for %d in term %d", m.ID, o.Candidate, o.Term)
			m.observer.OnEvent(Event{Type: EventVoteGranted, Member: m.ID, Peer: o.Candidate, Term: o.Term})
		case raft.BecameLeader:
			logrus.Infof("Member %d: Won election for term %d with %d votes", m.ID, o.Term, o.Votes)
			m.observer.OnEvent(Event{Type: EventBecameLeader, Member: m.ID, Term: o.Term, Votes: o.Votes})
			m.notifier.NotifyLeaderElected(m.ID)
		case raft.LostQuorum:
			logrus.Warnf("Member %d: Lost quorum (contacted %d peers). Stepping down.", m.ID, o.Contacted)
			m.observer.OnEvent(Event{Type: EventLostQuorum, Member: m.ID, Contacted: o.Contacted})
		case raft.Halted:
			logrus.Errorf("Member %d: Exceeded max election failures (%d). Stopping.", m.ID, raft.MaxElectionFailures)
			m.observer.OnEvent(Event{Type: EventHalted, Member: m.ID, Failures: o.Failures})
			m.stopLocked()
		}
	}
}

// Status returns a copy of the node's state; safe to call from any goroutine.
func (m *Member) Status() raft.Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.node.Status()
}

// Stop waits for the event being handled, so a status published by that event can never
// follow the stopped event and make a dead member look alive again.
func (m *Member) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopLocked()
}

// stopLocked stops the member; the caller holds mu.
func (m *Member) stopLocked() {
	m.cancel()
	logrus.Infof("Member %d: Stopped.", m.ID)
	m.observer.OnEvent(Event{Type: EventStopped, Member: m.ID})
}

func (m *Member) IsAlive() bool {
	return m.ctx.Err() == nil
}
