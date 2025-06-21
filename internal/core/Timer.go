package core

import "time"

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

// mock timer for testing
type MockTimer struct {
	currentTime time.Time
	tickers     []*time.Ticker //Mock Ticker
}

func NewMockTimer(initialTime time.Time) *MockTimer {
	return &MockTimer{
		currentTime: initialTime,
	}
}

func (m *MockTimer) Now() time.Time {
	return m.currentTime
}
func (m *MockTimer) NewTicker(d time.Duration) *time.Ticker {

	// TODO: testing logic on here

	ticker := time.NewTicker(d) // Mock Ticker
	m.tickers = append(m.tickers, ticker)
	return ticker
}

func (m *MockTimer) AdvanceTime(d time.Duration) {
	m.currentTime = m.currentTime.Add(d)

	// TODO: testing logic on here
}
