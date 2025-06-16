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
	votes     map[int]map[int]bool
	voteMutex sync.Mutex
}

func NewMajorityVoteStrategy() *MajorityVoteStrategy {
	return &MajorityVoteStrategy{
		votes: make(map[int]map[int]bool),
	}
}

func (s *MajorityVoteStrategy) HandleRequestVote(from int, targetID int, self *Member, q *Quorum) {
	self.mu.Lock()
	last, ok := self.lastSeen[targetID]
	self.mu.Unlock()
	if !ok || time.Since(last) > HeartbeatTimeout {
		vote := Message{From: self.ID, To: from, Type: Vote, Payload: targetID}
		q.members[from].Inbox <- vote
		logrus.Infof("vote message: %v", vote)
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
		logrus.Infof(">>> Member %d: quorum reached to confirm failure of member %d", self.ID, targetID)
		q.RemoveMember(targetID)
	}
}
