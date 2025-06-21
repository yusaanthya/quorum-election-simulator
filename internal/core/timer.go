package core

import (
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

type Timer interface {
	Now() time.Time
	NewTicker(d time.Duration) *time.Ticker
}

type RealTimer struct{}

func NewRealTimer() *RealTimer {
	return &RealTimer{}
}

func (r *RealTimer) Now() time.Time {
	return time.Now()
}

func (r *RealTimer) NewTicker(d time.Duration) *time.Ticker {
	return time.NewTicker(d)
}

// ========================
// mock timer for testing
// ========================
type MockTicker struct {
	C chan time.Time
}

// do mothing because the MockTicker is not triggered by a real goroutine
func (mt *MockTicker) Stop() {}

type MockTimer struct {
	currentTime    time.Time
	mu             sync.Mutex
	tickerChannels []chan time.Time
}

func NewMockTimer(initialTime time.Time) *MockTimer {
	return &MockTimer{
		currentTime:    initialTime,
		tickerChannels: make([]chan time.Time, 0),
	}
}

func (m *MockTimer) Now() time.Time {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.currentTime
}

func (m *MockTimer) NewTicker(d time.Duration) *time.Ticker {
	m.mu.Lock()
	defer m.mu.Unlock()
	ch := make(chan time.Time, 1)
	m.tickerChannels = append(m.tickerChannels, ch)
	return &time.Ticker{C: ch}
}

func (m *MockTimer) AdvanceTime(d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.currentTime = m.currentTime.Add(d)
	logrus.Debugf("MockTime advanced to: %v", m.currentTime)

	for _, ch := range m.tickerChannels {
		select {
		case ch <- m.currentTime:
		default:
			logrus.Debugf("MockTicker channel full, couldn't send time: %v", m.currentTime)
		}
	}
}
