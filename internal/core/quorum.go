package core

import (
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

const (
	HeartbeatInterval = 2 * time.Second
	HeartbeatTimeout  = 4 * time.Second
)

type MessageType int

const (
	Heartbeat MessageType = iota
	RequestVote
	Vote
)

type Message struct {
	From    int
	To      int
	Type    MessageType
	Payload interface{}
}

type Quorum struct {
	members  map[int]*Member
	strategy ElectionStrategy
	LeaderID int
	mu       sync.Mutex

	removed map[int]bool
}

func NewQuorum(n int) *Quorum {
	strategy := NewMajorityVoteStrategy()
	members := make(map[int]*Member)
	for i := 0; i < n; i++ {
		members[i] = NewMember(i, strategy)
	}
	return &Quorum{
		members:  members,
		strategy: strategy,
		removed:  make(map[int]bool),
	}
}

func (q *Quorum) Start() {
	logrus.Infof("Starting quorum with %d members", len(q.members))
	q.ElectLeader()
	for _, m := range q.members {
		go m.Run(q)
	}
}

func (q *Quorum) KillMember(id int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if m, ok := q.members[id]; ok && m.Alive {
		m.Stop()
		// logrus.Infof("Member %d is now unresponsive", id)
	}
}

func (q *Quorum) Broadcast(msg Message) {
	for _, m := range q.members {
		if m.ID != msg.From && m.Alive && !q.removed[m.ID] {
			m.Inbox <- msg
		}
	}
}

func (q *Quorum) RemoveMember(id int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if _, ok := q.members[id]; ok {
		q.removed[id] = true
		delete(q.members, id)
		logrus.Infof(">>> Member %d is officially removed from quorum", id)
		if id == q.LeaderID {
			logrus.Infof(">>> Leader %d was killed. Triggering re-election...", id)
			q.ElectLeader()
		}
	}
}

func (q *Quorum) ElectLeader() {
	for id, m := range q.members {
		if m.Alive && !q.removed[id] {
			q.LeaderID = id
			logrus.Infof(">>> Member %d elected as Leader", id)
			return
		}
	}
	logrus.Warn(">>> No alive member to elect as leader")
}

// type Quorum struct {
// 	members  map[int]*Member
// 	leaderID int
// 	mu       sync.Mutex
// }

// func NewQuorum(n int) *Quorum {
// 	members := make(map[int]*Member)
// 	for i := 0; i < n; i++ {
// 		members[i] = NewMember(i)
// 	}
// 	return &Quorum{
// 		members:  members,
// 		leaderID: -1,
// 	}
// }

// func (q *Quorum) Start() {
// 	logrus.Infof("Starting quorum with %d members\n", len(q.members))
// 	for _, m := range q.members {
// 		logrus.Infof("Member %d: Hi\n", m.ID)
// 		go m.StartHeartbeat(q)
// 	}
// 	go q.runElection()
// 	go q.monitorFailures()
// 	go q.monitorHeartbeats()
// }

// func (q *Quorum) runElection() {
// 	time.Sleep(500 * time.Millisecond) // simulate delay
// 	q.mu.Lock()
// 	defer q.mu.Unlock()
// 	q.leaderID = 0 // default leader
// 	logrus.Infof("Member %d: I want to be leader\n", q.leaderID)
// 	logrus.Infof("Member %d voted to be leader\n", q.leaderID)
// }

// func (q *Quorum) KillMember(id int) {
// 	q.mu.Lock()
// 	defer q.mu.Unlock()
// 	if m, ok := q.members[id]; ok && m.Alive {
// 		m.Alive = false
// 		logrus.Infof("Member %d is now unresponsive\n", id)
// 	}
// }

// func (q *Quorum) monitorFailures() {
// 	ticker := time.NewTicker(5 * time.Second)
// 	defer ticker.Stop()
// 	for range ticker.C {
// 		q.mu.Lock()
// 		leaderAlive := q.leaderID >= 0 && q.members[q.leaderID].Alive
// 		if !leaderAlive {
// 			logrus.Infof("Leader failure detected. Starting new election.")
// 			go q.runElection()
// 		}
// 		q.mu.Unlock()
// 	}
// }

// func (q *Quorum) monitorHeartbeats() {
// 	ticker := time.NewTicker(3 * time.Second)
// 	defer ticker.Stop()
// 	for range ticker.C {
// 		q.mu.Lock()
// 		for id, member := range q.members {
// 			if !member.Alive {
// 				continue
// 			}
// 			timeSinceLast := time.Since(member.LastHeartbeat)
// 			if timeSinceLast > 4*time.Second {
// 				logrus.Infof("Member %d seems unresponsive (last heartbeat: %v ago)\n", id, timeSinceLast)
// 			}
// 		}
// 		q.mu.Unlock()
// 	}
// }
