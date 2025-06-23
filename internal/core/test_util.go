package core

import (
	"sync"
	"testing"
	"time"

	"github.com/sirupsen/logrus"
)

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

// ========================
// mock inbox TestNetworkRouter for testing
// ========================
type TestNetworkRouter struct {
	q *Quorum
}

func NewTestNetworkRouter(q *Quorum) *TestNetworkRouter {
	return &TestNetworkRouter{q: q}
}

func (r *TestNetworkRouter) Send(msg Message) {
	r.q.mu.Lock()
	defer r.q.mu.Unlock()
	for _, m := range r.q.members {
		if m.ID != msg.From && m.Alive && !r.q.removed[m.ID] {
			select {
			case m.Inbox <- msg:
			default:
				logrus.Warnf("TestNetworkRouter: Failed to send broadcast message from %d to %d (type %v): inbox full.", msg.From, m.ID, msg.Type)
			}
		}
	}
}

func (r *TestNetworkRouter) SendTo(msg Message, toMemberID int) {
	r.q.mu.Lock()
	defer r.q.mu.Unlock()
	if targetMember, ok := r.q.members[toMemberID]; ok && targetMember.Alive && !r.q.removed[toMemberID] {
		select {
		case targetMember.Inbox <- msg:
		default:
			logrus.Warnf("TestNetworkRouter: Failed to send direct message from %d to %d (type %v): inbox full.", msg.From, toMemberID, msg.Type)
		}
	} else {
		logrus.Debugf("TestNetworkRouter: Cannot send message from %d to %d (type %v): target not alive or removed.", msg.From, toMemberID, msg.Type)
	}
}

// ========================
// mock notifier for testing
// ========================
type MockNotifier struct {
	memberRemovedCh chan int
	leaderElectedCh chan int
	quorumEndedCh   chan struct{}
}

func NewMockNotifier() *MockNotifier {
	return &MockNotifier{
		memberRemovedCh: make(chan int, 50),
		leaderElectedCh: make(chan int, 50),
		quorumEndedCh:   make(chan struct{}, 50),
	}
}

func (n *MockNotifier) NotifyMemberRemoved(memberID int) {
	select {
	case n.memberRemovedCh <- memberID:
	default:
		logrus.Warn("MockNotifier.MemberRemovedCh channel full.")
	}
}

func (n *MockNotifier) NotifyLeaderElected(leaderID int) {
	select {
	case n.leaderElectedCh <- leaderID:
	default:
		logrus.Warn("MockNotifier.LeaderElectedCh channel full.")
	}
}

func (n *MockNotifier) NotifyQuorumEnded() {
	select {
	case n.quorumEndedCh <- struct{}{}:
	default:
		logrus.Warn("MockNotifier.QuorumEndedCh channel full.")
	}
}

func waitForChannelReceive[T any](t *testing.T, ch <-chan T, timeout time.Duration, msg string) T {
	select {
	case val := <-ch:
		return val
	case <-time.After(timeout):
		t.Fatalf("%s: Timeout after %v", msg, timeout)
		var zero T // Return zero value on timeout
		return zero
	}
}

func assertChannelEmpty[T any](t *testing.T, ch <-chan T, timeout time.Duration, msg string) {
	select {
	case val := <-ch:
		t.Fatalf("%s: Channel was not empty, received: %v", msg, val)
	case <-time.After(timeout):
		// Expected: channel is empty
	}
}
