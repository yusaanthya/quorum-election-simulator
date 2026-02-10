package core

import (
	"time"
)

// ITicker abstracts time.Ticker
type ITicker interface {
	C() <-chan time.Time
	Stop()
}

// ITimer abstracts time.Timer
type ITimer interface {
	C() <-chan time.Time
	Stop() bool
	Reset(d time.Duration) bool
}

// Timer interface acts as a factory for time-related objects
type Timer interface {
	Now() time.Time
	NewTicker(d time.Duration) ITicker
	NewTimer(d time.Duration) ITimer
}

// --- Real Implementation ---

type RealTicker struct {
	*time.Ticker
}

func (r *RealTicker) C() <-chan time.Time {
	return r.Ticker.C
}

type RealTimerWrapper struct {
	*time.Timer
}

func (r *RealTimerWrapper) C() <-chan time.Time {
	return r.Timer.C
}

type RealTimer struct{}

func NewRealTimer() *RealTimer {
	return &RealTimer{}
}

func (r *RealTimer) Now() time.Time {
	return time.Now()
}

func (r *RealTimer) NewTicker(d time.Duration) ITicker {
	return &RealTicker{Ticker: time.NewTicker(d)}
}

func (r *RealTimer) NewTimer(d time.Duration) ITimer {
	return &RealTimerWrapper{Timer: time.NewTimer(d)}
}
