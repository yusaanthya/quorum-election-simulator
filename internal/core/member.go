package core

import (
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
	stopChan chan struct{}

	Election ElectionStrategy
}

func NewMember(id int, strategy ElectionStrategy) *Member {
	logrus.Infof("Member %v: Hi", id)
	return &Member{
		ID:       id,
		Alive:    true,
		Inbox:    make(chan Message, 10),
		lastSeen: make(map[int]time.Time),
		stopChan: make(chan struct{}),
		Election: strategy,
	}
}

func (m *Member) Run(q *Quorum) {
	go m.sendHeartbeats(q)
	go m.monitorHeartbeats(q)

	for {
		select {
		case msg := <-m.Inbox:
			m.handleMessage(msg, q)
		case <-m.stopChan:
			return
		}
	}
}

func (m *Member) sendHeartbeats(q *Quorum) {
	ticker := time.NewTicker(HeartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if m.Alive {
				msg := Message{From: m.ID, Type: Heartbeat}
				q.Broadcast(msg)
			}
		case <-m.stopChan:
			return
		}
	}
}

func (m *Member) monitorHeartbeats(q *Quorum) {
	ticker := time.NewTicker(HeartbeatTimeout)
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
				logrus.Infof("Member %d: suspecting member %d failed", m.ID, id)
				voteReq := Message{From: m.ID, Type: RequestVote, Payload: id}
				q.Broadcast(voteReq)
			}
		case <-m.stopChan:
			return
		}
	}
}

func (m *Member) handleMessage(msg Message, q *Quorum) {
	switch msg.Type {
	case Heartbeat:
		m.mu.Lock()
		m.lastSeen[msg.From] = time.Now()
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
	close(m.stopChan)
}

// type Member struct {
// 	ID            int
// 	Alive         bool
// 	LastHeartbeat time.Time
// }

// func NewMember(id int) *Member {
// 	return &Member{ID: id, Alive: true}
// }

// func (m *Member) StartHeartbeat(q *Quorum) {
// 	for {
// 		time.Sleep(2 * time.Second)
// 		if !m.Alive {
// 			return
// 		}
// 		// heart-beat simulation
// 		logrus.Infof("Member %d: sending heartbeat\n", m.ID)
// 		q.mu.Lock()
// 		m.LastHeartbeat = time.Now()
// 		q.mu.Unlock()
// 	}
// }
