package core

import (
	"context"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

type Member struct {
	ID       int
	Alive    bool
	Inbox    chan Message
	lastSeen map[int]time.Time
	mu       sync.Mutex

	ctx    context.Context
	cancel context.CancelFunc

	Election ElectionStrategy
	timer    Timer
}

func NewMember(ctx context.Context, id int, strategy ElectionStrategy, timer Timer) *Member {
	ctx, cancel := context.WithCancel(ctx)
	logrus.Infof("Member %v: Hi", id)
	return &Member{
		ID:       id,
		Alive:    true,
		Inbox:    make(chan Message, 10),
		lastSeen: make(map[int]time.Time),
		ctx:      ctx,
		cancel:   cancel,
		Election: strategy,
		timer:    timer,
	}
}

func (m *Member) Run(q *Quorum) {
	go m.sendHeartbeats(q)
	go m.monitorHeartbeats(q)

	for {
		select {
		case msg := <-m.Inbox:
			m.handleMessage(msg, q)
		case <-m.ctx.Done():
			return
		}
	}
}

func (m *Member) sendHeartbeats(q *Quorum) {
	ticker := m.timer.NewTicker(HeartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if m.Alive {
				msg := Message{From: m.ID, Type: Heartbeat}
				q.Broadcast(msg)
			}
		case <-m.ctx.Done():
			return
		}
	}
}

func (m *Member) monitorHeartbeats(q *Quorum) {
	ticker := m.timer.NewTicker(HeartbeatTimeout / 2)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			m.mu.Lock()
			suspects := []int{}
			now := time.Now()
			for id, last := range m.lastSeen {
				if now.Sub(last) > HeartbeatTimeout {
					q.mu.Lock()
					if !q.removed[id] {
						suspects = append(suspects, id)
					}
					q.mu.Unlock()
				}
			}
			m.mu.Unlock()
			for _, id := range suspects {
				logrus.Debugf("current member: %v", q.members)

				if q.LeaderID == m.ID {
					now := time.Now()
					strategy, ok := m.Election.(*MajorityVoteStrategy)
					if ok {
						strategy.voteMutex.Lock()
						for _, id := range suspects {
							ts, exists := strategy.voteTimestamps[id]
							if exists && now.Sub(ts) > VoteDecisionTimeout {
								if len(strategy.votes[id]) == 0 {
									logrus.Warnf("Leader %d: No votes received for suspect %d after timeout. Forcibly removing.", m.ID, id)
									q.RemoveMember(id)
								}
							}
						}
						strategy.voteMutex.Unlock()
					}
				}
				logrus.Infof("Member %d: suspecting member %d failed", m.ID, id)
				voteReq := Message{From: m.ID, Type: RequestVote, Payload: id}
				q.Broadcast(voteReq)

				// write vote record
				strategy, ok := m.Election.(*MajorityVoteStrategy)
				if ok {
					logrus.Debugf("target time stamp: %v", strategy.voteTimestamps[id])
					strategy.voteMutex.Lock()
					if _, exists := strategy.voteTimestamps[id]; !exists {
						strategy.voteTimestamps[id] = time.Now()
					}
					strategy.voteMutex.Unlock()
				}
			}
		case <-m.ctx.Done():
			return
		}
	}
}

func (m *Member) handleMessage(msg Message, q *Quorum) {
	switch msg.Type {
	case Heartbeat:
		m.mu.Lock()
		m.lastSeen[msg.From] = m.timer.Now()
		m.mu.Unlock()
	case RequestVote:
		targetID := msg.Payload.(int)
		m.Election.HandleRequestVote(msg.From, targetID, m, q)
	case Vote:
		targetID := msg.Payload.(int)
		m.Election.HandleVote(msg.From, targetID, m, q)
	}
}

func (m *Member) Stop() {
	m.Alive = false
	m.cancel()
}
