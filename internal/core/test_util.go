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

type MockTimerEntry struct {
	ch       chan time.Time
	deadline time.Time
	isTicker bool
	interval time.Duration
	running  bool
}

// MockTickerWrapper implements ITicker interface
type MockTickerWrapper struct {
	entry *MockTimerEntry
	mt    *MockTimer
}

func (m *MockTickerWrapper) C() <-chan time.Time {
	return m.entry.ch
}

func (m *MockTickerWrapper) Stop() {
	m.mt.mu.Lock()
	defer m.mt.mu.Unlock()
	m.entry.running = false
}

// Reset is not part of ITicker usually, but we added it for heartbeat
func (m *MockTickerWrapper) Reset(d time.Duration) {
	m.mt.mu.Lock()
	defer m.mt.mu.Unlock()
	m.entry.interval = d
	m.entry.deadline = m.mt.currentTime.Add(d)
	m.entry.running = true
}

// MockTimerWrapper implements ITimer interface
type MockTimerWrapper struct {
	entry *MockTimerEntry
	mt    *MockTimer
}

func (m *MockTimerWrapper) C() <-chan time.Time {
	return m.entry.ch
}

func (m *MockTimerWrapper) Stop() bool {
	m.mt.mu.Lock()
	defer m.mt.mu.Unlock()
	active := m.entry.running
	m.entry.running = false
	return active
}

func (m *MockTimerWrapper) Reset(d time.Duration) bool {
	m.mt.mu.Lock()
	defer m.mt.mu.Unlock()
	active := m.entry.running
	m.entry.deadline = m.mt.currentTime.Add(d)
	m.entry.running = true
	return active
}

type MockTimer struct {
	currentTime time.Time
	mu          sync.Mutex
	entries     []*MockTimerEntry
}

func NewMockTimer(initialTime time.Time) *MockTimer {
	return &MockTimer{
		currentTime: initialTime,
		entries:     make([]*MockTimerEntry, 0),
	}
}

func (m *MockTimer) Now() time.Time {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.currentTime
}

func (m *MockTimer) NewTicker(d time.Duration) ITicker {
	m.mu.Lock()
	defer m.mu.Unlock()
	entry := &MockTimerEntry{
		ch:       make(chan time.Time, 1),
		deadline: m.currentTime.Add(d),
		isTicker: true,
		interval: d,
		running:  true,
	}
	m.entries = append(m.entries, entry)
	return &MockTickerWrapper{entry: entry, mt: m}
}

func (m *MockTimer) NewTimer(d time.Duration) ITimer {
	m.mu.Lock()
	defer m.mu.Unlock()
	entry := &MockTimerEntry{
		ch:       make(chan time.Time, 1),
		deadline: m.currentTime.Add(d),
		isTicker: false,
		running:  true,
	}
	m.entries = append(m.entries, entry)
	return &MockTimerWrapper{entry: entry, mt: m}
}

func (m *MockTimer) AdvanceTime(d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()

	finalTime := m.currentTime.Add(d)

	// We need to simulate time passing event by event if we want strict ordering,
	// but for now let's just trigger everything that is due by finalTime.
	// Actually, simpler: check all entries. If deadline <= finalTime, trigger.
	// Note: Tickers might need multiple triggers if d is large.
	// For simplicity, we trigger only once per AdvanceTime call or we loop?

	// Let's just update currentTime and check deadlines.
	m.currentTime = finalTime
	// logrus.Debugf("MockTime advanced to: %v", m.currentTime)

	for _, entry := range m.entries {
		if !entry.running {
			continue
		}

		if !entry.deadline.After(m.currentTime) {
			// Trigger
			select {
			case entry.ch <- m.currentTime:
			default:
				// channel full, skip
			}

			if entry.isTicker {
				// Reschedule ticker
				// In a real system, it adds interval to LAST firing time.
				// But here let's just add interval to deadline.
				for !entry.deadline.After(m.currentTime) {
					entry.deadline = entry.deadline.Add(entry.interval)
				}
			} else {
				// Timer fires once
				entry.running = false
			}
		}
	}

	// Sort by deadline? No need if we just scan all.
}

// ... (TestNetworkRouter and MockNotifier remain same)

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
