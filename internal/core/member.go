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
	// extnd for different type strategies e.g.
	// ElectionMessage // for Bully algorithm
	// VictoryMessage  // for Bully algorithm
	// AppendEntries   // for Raft
	// RequestVoteRPC  // for Raft
)

type Message struct {
	From    int
	To      int
	Type    MessageType
	Payload interface{}
}

type Member struct {
	ID       int
	Alive    bool
	Inbox    chan Message
	lastSeen map[int]time.Time
	mu       sync.Mutex

	ctx    context.Context
	cancel context.CancelFunc

	Election  ElectionStrategy
	timer     Timer
	networker Networker
	wg        *sync.WaitGroup
}

func NewMember(ctx context.Context, id int, strategy ElectionStrategy, timer Timer, networker Networker, initialPeers []int, wg *sync.WaitGroup) *Member {
	memberCtx, cancel := context.WithCancel(ctx)
	logrus.Infof("Member %v: Hi", id)

	m := &Member{
		ID:        id,
		Alive:     true,
		Inbox:     make(chan Message, 10),
		lastSeen:  make(map[int]time.Time),
		ctx:       memberCtx,
		cancel:    cancel,
		Election:  strategy,
		timer:     timer,
		networker: networker,
		wg:        wg,
	}

	// init lastSeen to prevent suspecting others immediately
	now := m.timer.Now()
	for _, peerID := range initialPeers {
		if peerID != m.ID {
			m.lastSeen[peerID] = now
		}
	}
	return m
}

func (m *Member) Run(q *Quorum) {
	defer m.wg.Done()

	go m.sendHeartbeats()
	go m.monitorHeartbeats(q)

	for {
		select {
		case msg := <-m.Inbox:
			m.handleMessage(msg, q)
		case <-m.ctx.Done():
			logrus.Infof("Member %d: context cancelled, stopping run loop.", m.ID)
			return
		}
	}
}

func (m *Member) sendHeartbeats() {
	ticker := m.timer.NewTicker(HeartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if m.Alive {
				msg := Message{From: m.ID, Type: Heartbeat}
				m.networker.Send(msg)
				logrus.Debugf("Member %d: Sent heartbeat", m.ID)
			}
		case <-m.ctx.Done():
			logrus.Debugf("Member %d: Heartbeat sender stopped.", m.ID)
			return
		}
	}
}

// periodical monitoring haertbeat between members to trigger suspecting mechanism
func (m *Member) monitorHeartbeats(q *Quorum) {
	ticker := m.timer.NewTicker(HeartbeatTimeout / 2)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			m.mu.Lock()
			suspects := []int{}
			now := m.timer.Now()

			q.mu.Lock()
			currentMemberIDs := make([]int, 0, len(q.members))
			for id := range q.members {
				currentMemberIDs = append(currentMemberIDs, id)
			}
			q.mu.Unlock()

			for _, id := range currentMemberIDs {
				if id == m.ID {
					continue
				}
				last, exists := m.lastSeen[id]

				q.mu.Lock()
				isRemoved := q.removed[id]
				q.mu.Unlock()

				if !isRemoved && (!exists || now.Sub(last) > HeartbeatTimeout) {
					suspects = append(suspects, id)
				}
			}
			m.mu.Unlock()

			for _, id := range suspects {
				logrus.Infof("Member %d: Suspecting member %d (no heartbeat for %v)", m.ID, id, now.Sub(m.lastSeen[id]))

				if strategy, ok := m.Election.(*MajorityVoteStrategy); ok {
					strategy.voteMutex.Lock()
					if _, exists := strategy.votes[id]; !exists {
						strategy.votes[id] = make(map[int]bool)
					}
					// Add this member's (m.ID) vote for the suspected member (id)
					strategy.votes[id][m.ID] = true
					logrus.Debugf("Member %d: Added own implicit vote for suspect %d. Current votes: %v", m.ID, id, strategy.votes[id])
					strategy.voteMutex.Unlock()

					// *** EDGE CASE: 2-MEMBER QUORUM FAILURE HANDLING (WALKAROUND SOLUTION FOR DEMO) ***
					//
					// Context: In a 2-member quorum, achieving a majority (2 votes) for member removal
					// becomes impossible if one member fails or is partitioned. The standard voting process
					// would lead to a prolonged period before cleanupExpiredVotes terminates the quorum.
					//
					// This walkaround provides a faster detection and termination for the demo.
					// If a member is suspected and the quorum size is 2, it directly initiates a
					// ProposeMemberRemoval after VoteDecisionTimeout.
					//
					// RISK ACKNOWLEDGEMENT:
					// In a real-time network with network partitions, this local decision by the
					// *single remaining active observer* (i.e., the node that *thinks* the other is unresponsive)
					// can still lead to a form of split-brain in terms of independent decision-making.
					// Both nodes, if partitioned, might independently conclude the other has failed and
					// then terminate their respective quorums.
					//
					// This behavior is ACCEPTABLE for a 2-member fail-stop design (preferring halt over inconsistency)
					// but it deviates from a strict multi-node consensus for removal.
					//
					// FUTURE PLAN: A more robust solution for production would typically involve:
					// 1. A dedicated witness/arbiter service for 2-node clusters to break ties, or
					// 2. A more sophisticated voting strategy that fully encapsulates timeout and
					//    forced removal logic without local member-level shortcuts.
					// All other member removals and quorum terminations are handled centrally
					// by Quorum.ProposeMemberRemoval and MajorityVoteStrategy.cleanupExpiredVotes.
					q.mu.Lock()
					currentQuorumSize := len(q.members) // Get the current number of members in the quorum
					removedMembers := q.removed
					q.mu.Unlock()

					if !removedMembers[id] && currentQuorumSize <= 2 && now.Sub(m.lastSeen[id]) > VoteDecisionTimeout {
						// simple arrangement for timeout suspecting event
						logrus.Warnf("Quorum unrecoverable: Leader %d failed and remaining 1-member cannot form majority. Ending quorum.", id)
						q.ProposeMemberRemoval(id)

						continue
					}
				}

				voteReq := Message{From: m.ID, Type: RequestVote, Payload: id}
				m.networker.Send(voteReq)
			}
		case <-m.ctx.Done():
			logrus.Debugf("Member %d: Heartbeat monitor stopped.", m.ID)
			return
		}
	}
}

func (m *Member) handleMessage(msg Message, q *Quorum) {
	logrus.Debugf("Member %d: Received message from %d, Type: %v, Payload: %v", m.ID, msg.From, msg.Type, msg.Payload)
	switch msg.Type {
	case Heartbeat:
		m.mu.Lock()
		m.lastSeen[msg.From] = m.timer.Now()
		m.mu.Unlock()
	case RequestVote:
		targetID := msg.Payload.(int)
		m.Election.HandleRequestVote(msg.From, targetID, m, q, m.networker)
	case Vote:
		targetID := msg.Payload.(int)
		m.Election.HandleVote(msg.From, targetID, m, q, m.networker)
	}
}

func (m *Member) Stop() {
	m.Alive = false
	m.cancel()
	logrus.Infof("Member %d: Stopped.", m.ID)
}
