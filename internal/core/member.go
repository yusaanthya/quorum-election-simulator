package core

import (
	"time"

	"github.com/sirupsen/logrus"
)

type Member struct {
	ID    int
	Alive bool
}

func NewMember(id int) *Member {
	return &Member{ID: id, Alive: true}
}

func (m *Member) StartHeartbeat(q *Quorum) {
	for {
		time.Sleep(2 * time.Second)
		if !m.Alive {
			return
		}
		// heart-beat simulation
		logrus.Debugf("Member %d: sending heartbeat\n", m.ID)
	}
}
