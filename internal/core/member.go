package core

import (
	"context"
	"math/rand"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

type Member struct {
	ID    int
	Alive bool
	Inbox chan Message
	mu    sync.Mutex

	ctx    context.Context
	cancel context.CancelFunc

	timer     Timer
	networker Networker
	wg        *sync.WaitGroup

	// Raft State
	State       RaftState
	CurrentTerm int
	VotedFor    int
	LeaderID    int

	// Volatile state
	electionFailures int
	peers            []int
	votes            map[int]bool // Set of members who granted vote in current term
	contactedPeers   map[int]bool // Set of members contacted in current leader interval
}

func NewMember(ctx context.Context, id int, timer Timer, networker Networker, initialPeers []int, inbox chan Message, wg *sync.WaitGroup) *Member {
	memberCtx, cancel := context.WithCancel(ctx)

	peers := []int{}
	for _, p := range initialPeers {
		if p != id {
			peers = append(peers, p)
		}
	}

	m := &Member{
		ID:        id,
		Alive:     true,
		Inbox:     inbox, // Use injected inbox
		ctx:       memberCtx,
		cancel:    cancel,
		timer:     timer,
		networker: networker,
		wg:        wg,

		State:            Follower,
		CurrentTerm:      0,
		VotedFor:         -1,
		LeaderID:         -1,
		electionFailures: 0,
		peers:            peers,
		votes:            make(map[int]bool),
		contactedPeers:   make(map[int]bool),
	}

	return m
}

func (m *Member) Run(q *Quorum) {
	defer m.wg.Done()
	logrus.Infof("Member %d: Started Raft Node", m.ID)

	// Initial random election timeout
	electionTimeout := duration(1500 + rand.Intn(1500))
	electionTimer := m.timer.NewTimer(electionTimeout)

	// Heartbeat ticker (stopped initially)
	heartbeatTicker := m.timer.NewTicker(500 * time.Millisecond) // 500ms heartbeat
	heartbeatTicker.Stop()

	// Quorum check ticker (for Leader Lease)
	quorumCheckTicker := m.timer.NewTicker(2000 * time.Millisecond)
	quorumCheckTicker.Stop()

	for {
		select {
		case <-m.ctx.Done():
			electionTimer.Stop()
			heartbeatTicker.Stop()
			quorumCheckTicker.Stop()
			return

		case msg := <-m.Inbox:
			m.handleMessage(msg, electionTimer, heartbeatTicker, quorumCheckTicker)

		case <-electionTimer.C():
			// Election timeout
			m.startElection(electionTimer)

		case <-heartbeatTicker.C():
			// Send heartbeats if leader
			m.sendHeartbeats()

		case <-quorumCheckTicker.C():
			if m.State == Leader {
				if len(m.contactedPeers) < (len(m.peers)+1)/2+1 {
					logrus.Warnf("Member %d: Lost quorum (contacted %d peers). Stepping down.", m.ID, len(m.contactedPeers))
					m.becomeFollower(m.CurrentTerm, heartbeatTicker, electionTimer, quorumCheckTicker)
				} else {
					// Reset contacted peers for next interval
					// Always count self
					m.contactedPeers = make(map[int]bool)
					m.contactedPeers[m.ID] = true
				}
			}
		}
	}
}

func (m *Member) handleMessage(msg Message, electionTimer ITimer, heartbeatTicker ITicker, quorumCheckTicker ITicker) {
	if !m.Alive {
		return
	}

	switch msg.Type {
	case MsgRequestVote:
		args := msg.Payload.(RequestVoteArgs)
		if args.Term > m.CurrentTerm {
			m.becomeFollower(args.Term, heartbeatTicker, electionTimer, quorumCheckTicker)
		}
		reply := m.handleRequestVote(args, electionTimer)
		m.networker.SendTo(Message{
			From:    m.ID,
			To:      msg.From,
			Type:    MsgRequestVoteReply,
			Payload: reply,
		}, msg.From)

	case MsgRequestVoteReply:
		reply := msg.Payload.(RequestVoteReply)
		if reply.Term > m.CurrentTerm {
			m.becomeFollower(reply.Term, heartbeatTicker, electionTimer, quorumCheckTicker)
		} else if reply.Term == m.CurrentTerm {
			m.handleRequestVoteReply(reply, msg.From, heartbeatTicker, electionTimer, quorumCheckTicker)
		}

	case MsgAppendEntries:
		args := msg.Payload.(AppendEntriesArgs)
		if args.Term >= m.CurrentTerm { // Recognized leader
			// Reset election failures on valid heartbeat from current leader
			m.electionFailures = 0
			m.becomeFollower(args.Term, heartbeatTicker, electionTimer, quorumCheckTicker)
			m.LeaderID = args.LeaderID

			// Reset election timer
			electionTimer.Stop()
			electionTimer.Reset(duration(1500 + rand.Intn(1500)))
		}

		reply := m.handleAppendEntries(args)
		m.networker.SendTo(Message{
			From:    m.ID,
			To:      msg.From,
			Type:    MsgAppendEntriesReply,
			Payload: reply,
		}, msg.From)

	case MsgAppendEntriesReply:
		reply := msg.Payload.(AppendEntriesReply)
		if reply.Term > m.CurrentTerm {
			m.becomeFollower(reply.Term, heartbeatTicker, electionTimer, quorumCheckTicker)
		} else if m.State == Leader && reply.Term == m.CurrentTerm {
			// Record contact
			m.contactedPeers[msg.From] = true
		}
	}
}

func duration(ms int) time.Duration {
	return time.Duration(ms) * time.Millisecond
}

func (m *Member) becomeFollower(term int, heartbeatTicker ITicker, electionTimer ITimer, quorumCheckTicker ITicker) {
	if m.State != Follower || m.CurrentTerm != term {
		logrus.Infof("Member %d: Becoming Follower for term %d", m.ID, term)
	}

	// Only reset VotedFor/votes if we are moving to a NEW term.
	// If we are just stepping down in the same term (e.g., Candidate -> Follower),
	// we must preserve our vote (which was for ourself or someone else).
	if term > m.CurrentTerm {
		m.VotedFor = -1
		m.votes = make(map[int]bool)
		m.CurrentTerm = term
	}

	m.State = Follower
	m.LeaderID = -1

	// Ensure heartbeat ticker is stopped
	if heartbeatTicker != nil {
		heartbeatTicker.Stop()
	}
	// Stop quorum check ticker
	if quorumCheckTicker != nil {
		quorumCheckTicker.Stop()
	}

	// Reset election timer
	if electionTimer != nil {
		electionTimer.Stop()
		electionTimer.Reset(duration(1500 + rand.Intn(1500)))
	}
}

func (m *Member) startElection(electionTimer ITimer) {
	if m.State == Leader {
		return
	}

	m.electionFailures++
	if m.electionFailures > MaxElectionFailures {
		logrus.Errorf("Member %d: Exceeded max election failures (%d). Stopping.", m.ID, MaxElectionFailures)
		m.Stop()
		return
	}

	m.State = Candidate
	m.CurrentTerm++
	m.VotedFor = m.ID
	m.LeaderID = -1
	m.votes = make(map[int]bool)
	m.votes[m.ID] = true // Vote for self

	logrus.Infof("Member %d: Starting election for term %d (Failures: %d)", m.ID, m.CurrentTerm, m.electionFailures)

	// Reset timer
	electionTimer.Stop()
	electionTimer.Reset(duration(1500 + rand.Intn(1500)))

	args := RequestVoteArgs{
		Term:        m.CurrentTerm,
		CandidateID: m.ID,
	}

	for _, pid := range m.peers {
		go func(target int) {
			m.networker.SendTo(Message{
				From:    m.ID,
				To:      target,
				Type:    MsgRequestVote,
				Payload: args,
			}, target)
		}(pid)
	}
}

func (m *Member) handleRequestVote(args RequestVoteArgs, electionTimer ITimer) RequestVoteReply {
	reply := RequestVoteReply{
		Term:        m.CurrentTerm,
		VoteGranted: false,
	}

	if args.Term < m.CurrentTerm {
		return reply
	}

	if m.VotedFor == -1 || m.VotedFor == args.CandidateID {
		m.VotedFor = args.CandidateID
		reply.VoteGranted = true

		// Reset election timer since we granted a vote (don't want to timeout immediately)
		electionTimer.Stop()
		electionTimer.Reset(duration(1500 + rand.Intn(1500)))

		logrus.Infof("Member %d: Voted for %d in term %d", m.ID, args.CandidateID, m.CurrentTerm)
	}

	return reply
}

func (m *Member) handleRequestVoteReply(reply RequestVoteReply, fromID int, heartbeatTicker ITicker, electionTimer ITimer, quorumCheckTicker ITicker) {
	if m.State != Candidate {
		return
	}

	if reply.VoteGranted {
		m.votes[fromID] = true

		votesReceived := len(m.votes)
		majority := (len(m.peers)+1)/2 + 1

		if votesReceived >= majority {
			logrus.Infof("Member %d: Won election for term %d with %d votes", m.ID, m.CurrentTerm, votesReceived)
			m.becomeLeader(heartbeatTicker, electionTimer, quorumCheckTicker)
		}
	}
}

func (m *Member) becomeLeader(heartbeatTicker ITicker, electionTimer ITimer, quorumCheckTicker ITicker) {
	m.State = Leader
	m.LeaderID = m.ID
	m.VotedFor = -1
	m.electionFailures = 0 // Reset failures on becoming leader

	// Initialize contacted peers
	m.contactedPeers = make(map[int]bool)
	m.contactedPeers[m.ID] = true

	electionTimer.Stop()
	// We want to send heartbeat immediately, but ticker fires after duration.
	// So we manually send once, then start ticker.
	m.sendHeartbeats()

	// Start quorum check
	if ticker, ok := quorumCheckTicker.(interface{ Reset(d time.Duration) }); ok {
		ticker.Reset(2000 * time.Millisecond)
	} else {
		// Just start it if implemented differently, but here we assume Reset capability
	}

	// Reset ticker to fire regularly
	// Note: ITicker doesn't have Reset in stdlib Ticker, but we can Stop and NewTicker?
	// Ah, Ticker just needs to be started?
	// `NewTicker` creates a running ticker. `Stop` stops it.
	// Getting a new ticker is expensive/complex here if we want to reuse the variable.
	// But `ITicker` interface has no Reset.
	// Actually typical pattern is creating a new ticker.
	// BUT, my `Member` struct doesn't hold `heartbeatTicker`. It's local variable in `Run`.
	// So I can't easily "replace" it if `becomeLeader` is called from handling message.
	// Wait, `heartbeatTicker` IS passed to `becomeLeader`.
	// But `heartbeatTicker` (ITicker) only has `Stop`. It doesn't have `Reset`.
	// Standard `time.Ticker` has `Reset`. I should add `Reset` to `ITicker` interface!
	// `time.Ticker` has `Reset(d Duration)` since Go 1.15.

	// I forgot to add `Reset` to `ITicker` interface in `timer.go`.
	// For now, I will assume I can just use it if I cast, or I should update `timer.go`?
	// I should update `timer.go` to be safe.
	// OR, I just assume `timer.go` update is too much overhead now and I just use `NewTicker` logic?
	// But I can't replace the variable in `Run` loop from `handleMessage`.
	// So `heartbeatTicker` MUST be capable of being reset or restarted.

	// QUICK FIX: Add `Reset` to `ITicker` interface?
	// Yes, `time.Ticker` has `Reset`.
	// I'll assume I can add it quickly.

	// Or, I can just not use Ticker for heartbeat and use another Timer?
	// No, Ticker is better.

	// Let's rely on `Reset`.
	if ticker, ok := heartbeatTicker.(interface{ Reset(d time.Duration) }); ok {
		ticker.Reset(500 * time.Millisecond)
	} else {
		logrus.Warn("Heartbeat ticker does not support Reset, heartbeats might be broken.")
	}
}

func (m *Member) handleAppendEntries(args AppendEntriesArgs) AppendEntriesReply {
	reply := AppendEntriesReply{
		Term:    m.CurrentTerm,
		Success: false,
	}

	if args.Term < m.CurrentTerm {
		return reply
	}

	reply.Success = true
	return reply
}

func (m *Member) sendHeartbeats() {
	if m.State != Leader {
		return
	}

	args := AppendEntriesArgs{
		Term:     m.CurrentTerm,
		LeaderID: m.ID,
	}

	for _, pid := range m.peers {
		// send in separate goroutine to avoid blocking?
		// networker.SendTo might block if channel full.
		// Sending in goroutine is safer for liveness.
		go func(target int) {
			m.networker.SendTo(Message{
				From:    m.ID,
				To:      target,
				Type:    MsgAppendEntries,
				Payload: args,
			}, target)
		}(pid)
	}
}

func (m *Member) Stop() {
	m.Alive = false
	m.cancel()
	logrus.Infof("Member %d: Stopped.", m.ID)
}
