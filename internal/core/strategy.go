package core

import (
	"context"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

type ElectionStrategy interface {
	HandleRequestVote(from int, targetID int, self *Member, q *Quorum, networker Networker)
	HandleVote(from int, targetID int, self *Member, q *Quorum, networker Networker)
}

type MajorityVoteStrategy struct {
	votes          map[int]map[int]bool
	voteTimestamps map[int]time.Time
	voteMutex      sync.Mutex
	timer          Timer
	ctx            context.Context
	quorum         *Quorum
}

func NewMajorityVoteStrategy(ctx context.Context, timer Timer, q *Quorum) *MajorityVoteStrategy {
	s := &MajorityVoteStrategy{
		votes:          make(map[int]map[int]bool),
		voteTimestamps: make(map[int]time.Time),
		timer:          timer,
		ctx:            ctx,
		quorum:         q,
	}
	go s.cleanupExpiredVotes()
	return s
}

func (s *MajorityVoteStrategy) HandleRequestVote(from int, targetID int, self *Member, q *Quorum, networker Networker) {
	self.mu.Lock()
	last, ok := self.lastSeen[targetID]
	self.mu.Unlock()

	q.mu.Lock()
	_, targetExists := q.members[targetID]
	targetIsRemoved := q.removed[targetID]
	q.mu.Unlock()

	if targetExists && !targetIsRemoved && (!ok || s.timer.Now().Sub(last) > HeartbeatTimeout) {
		logrus.Infof("Member %d: Voting to confirm failure of member %d (requested by %d)", self.ID, targetID, from)
		vote := Message{From: self.ID, To: from, Type: Vote, Payload: targetID}
		q.mu.Lock()
		targetMember := q.members[from]
		q.mu.Unlock()
		if targetMember != nil && targetMember.Alive && !q.removed[targetMember.ID] {
			select {
			case targetMember.Inbox <- vote:

			case <-s.timer.NewTicker(100 * time.Millisecond).C:
				logrus.Warnf("Member %d: Failed to send vote for %d to %d: inbox full or blocked.", self.ID, targetID, from)
			}
		} else {
			logrus.Debugf("Member %d: Cannot send vote to %d (target not alive or removed).", self.ID, from)
		}
	} else {
		logrus.Debugf("Member %d: Not voting for %d. Target exists: %t, Target removed: %t, Last seen ok: %t (since: %v)",
			self.ID, targetID, targetExists, targetIsRemoved, ok && s.timer.Now().Sub(last) <= HeartbeatTimeout, s.timer.Now().Sub(last))
	}
}

func (s *MajorityVoteStrategy) HandleVote(from int, targetID int, self *Member, q *Quorum, networker Networker) {
	s.voteMutex.Lock()
	defer s.voteMutex.Unlock()

	q.mu.Lock()
	_, targetExists := q.members[targetID]
	targetIsRemoved := q.removed[targetID]
	currentQuorumSize := len(q.members)
	q.mu.Unlock()

	if targetIsRemoved {
		logrus.Debugf("Member %d: Received vote for already removed member %d from %d. Ignoring.", self.ID, targetID, from)
		return
	}
	if !targetExists && !targetIsRemoved {
		logrus.Debugf("Member %d: Received vote for non-existent member %d from %d. Ignoring.", self.ID, targetID, from)
		return
	}

	if _, ok := s.votes[targetID]; !ok {
		s.votes[targetID] = make(map[int]bool)
	}
	s.votes[targetID][from] = true

	majorityNeeded := currentQuorumSize/2 + 1
	if currentQuorumSize == 0 {
		majorityNeeded = 0
	} else if currentQuorumSize == 1 {
		majorityNeeded = 1
	}

	logrus.Debugf("Member %d: Collected votes for %d: %v. Current quorum size: %d, Majority needed: %d", self.ID, targetID, s.votes[targetID], currentQuorumSize, majorityNeeded)

	if len(s.votes[targetID]) >= majorityNeeded {
		logrus.Infof("Member %d: Majority reached (%d >= %d) to confirm failure of member %d. Proposing removal to Quorum.", self.ID, len(s.votes[targetID]), majorityNeeded, targetID)
		delete(s.votes, targetID)
		delete(s.voteTimestamps, targetID)

		s.quorum.ProposeMemberRemoval(targetID)
	} else {
		logrus.Infof("Member %d: Not enough votes for %d yet. Current votes: %d/%d", self.ID, targetID, len(s.votes[targetID]), majorityNeeded)
	}
}

func (s *MajorityVoteStrategy) cleanupExpiredVotes() {
	ticker := s.timer.NewTicker(VoteDecisionTimeout / 2)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.voteMutex.Lock()
			now := s.timer.Now()
			for targetID, ts := range s.voteTimestamps {
				if now.Sub(ts) > 2*VoteDecisionTimeout {
					logrus.Infof("[GC] Vote record for target %d (initiated %v) expired and cleared (no majority reached).", targetID, ts)
					delete(s.voteTimestamps, targetID)
					delete(s.votes, targetID)
				}
			}
			s.voteMutex.Unlock()
		case <-s.ctx.Done():
			logrus.Infof("MajorityVoteStrategy: cleanupExpiredVotes goroutine stopped.")
			return
		}
	}
}
