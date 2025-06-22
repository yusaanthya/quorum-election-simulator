package core

import (
	"time"
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
