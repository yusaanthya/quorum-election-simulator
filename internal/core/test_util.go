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
// mock networker for testing
// ========================
type MockNetworker struct {
	SentMsgs   chan Message
	SentToMsgs chan struct {
		Msg Message
		To  int
	}
}

func NewMockNetworker() *MockNetworker {
	return &MockNetworker{
		SentMsgs: make(chan Message, 100),
		SentToMsgs: make(chan struct {
			Msg Message
			To  int
		}, 100),
	}
}

func (m *MockNetworker) Send(msg Message) {
	select {
	case m.SentMsgs <- msg:
	default:
		logrus.Warn("MockNetworker.SentMsgs channel full, message dropped.")
	}
}

func (m *MockNetworker) SendTo(msg Message, toMemberID int) {
	select {
	case m.SentToMsgs <- struct {
		Msg Message
		To  int
	}{Msg: msg, To: toMemberID}:
	default:
		logrus.Warn("MockNetworker.SentToMsgs channel full, message dropped.")
	}
}

// ========================
// mock notifier for testing
// ========================
type MockNotifier struct {
	MemberRemovedCh chan int
	LeaderElectedCh chan int
	QuorumEndedCh   chan struct{}
}

func NewMockNotifier() *MockNotifier {
	return &MockNotifier{
		MemberRemovedCh: make(chan int, 5),
		LeaderElectedCh: make(chan int, 5),
		QuorumEndedCh:   make(chan struct{}, 5),
	}
}

func (n *MockNotifier) NotifyMemberRemoved(memberID int) {
	select {
	case n.MemberRemovedCh <- memberID:
	default:
		logrus.Warn("MockNotifier.MemberRemovedCh channel full.")
	}
}

func (n *MockNotifier) NotifyLeaderElected(leaderID int) {
	select {
	case n.LeaderElectedCh <- leaderID:
	default:
		logrus.Warn("MockNotifier.LeaderElectedCh channel full.")
	}
}

func (n *MockNotifier) NotifyQuorumEnded() {
	select {
	case n.QuorumEndedCh <- struct{}{}:
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
