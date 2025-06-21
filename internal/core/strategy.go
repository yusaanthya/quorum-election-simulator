package core

import (
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

type ElectionStrategy interface {
	HandleRequestVote(from int, targetID int, self *Member, q *Quorum)
	HandleVote(from int, targetID int, self *Member, q *Quorum)
}

type MajorityVoteStrategy struct {
	votes          map[int]map[int]bool
	voteTimestamps map[int]time.Time
	voteMutex      sync.Mutex
	timer          Timer
}

func NewMajorityVoteStrategy(timer Timer) *MajorityVoteStrategy {
	s := &MajorityVoteStrategy{
		votes:          make(map[int]map[int]bool),
		voteTimestamps: make(map[int]time.Time),
		timer:          timer,
	}
	go s.cleanupExpiredVotes()
	return s
}

func (s *MajorityVoteStrategy) HandleRequestVote(from int, targetID int, self *Member, q *Quorum) {
	self.mu.Lock()
	last, ok := self.lastSeen[targetID]
	self.mu.Unlock()
	if !ok || s.timer.Now().Sub(last) > HeartbeatTimeout {
		vote := Message{From: self.ID, To: from, Type: Vote, Payload: targetID}
		q.members[from].Inbox <- vote
	}
}

func (s *MajorityVoteStrategy) HandleVote(from int, targetID int, self *Member, q *Quorum) {
	s.voteMutex.Lock()
	defer s.voteMutex.Unlock()
	if _, ok := s.votes[targetID]; !ok {
		s.votes[targetID] = make(map[int]bool)
	}
	s.votes[targetID][from] = true

	if len(s.votes[targetID]) > len(q.members)/2 {
		logrus.Infof("Member %d: quorum reached to confirm failure of member %d", self.ID, targetID)
		delete(s.votes, targetID)
		delete(s.voteTimestamps, targetID)
		q.RemoveMember(targetID)
	}
}

func (s *MajorityVoteStrategy) cleanupExpiredVotes() {
	ticker := time.NewTicker(HeartbeatTimeout)
	defer ticker.Stop()

	for {
		<-ticker.C
		s.voteMutex.Lock()
		for targetID, ts := range s.voteTimestamps {
			if time.Since(ts) > 2*VoteDecisionTimeout {
				delete(s.voteTimestamps, targetID)
				delete(s.votes, targetID)
				logrus.Infof("[GC] Vote for target %d expired and cleared", targetID)
			}
		}
		s.voteMutex.Unlock()
	}
}
