package sim

import (
	"time"

	"github.com/Anthya1104/quorum-election-cli/internal/core"
)

// ScaledTimer stretches every duration it is given by a constant factor, so the
// whole cluster runs in slow motion without changing any protocol constant.
type ScaledTimer struct {
	inner core.Timer
	scale float64
}

func NewScaledTimer(inner core.Timer, scale float64) *ScaledTimer {
	return &ScaledTimer{inner: inner, scale: scale}
}

func (t *ScaledTimer) stretch(d time.Duration) time.Duration {
	return time.Duration(float64(d) * t.scale)
}

func (t *ScaledTimer) Now() time.Time { return t.inner.Now() }

func (t *ScaledTimer) NewTicker(d time.Duration) core.ITicker {
	return &scaledTicker{ITicker: t.inner.NewTicker(t.stretch(d)), t: t}
}

func (t *ScaledTimer) NewTimer(d time.Duration) core.ITimer {
	return &scaledTimer{ITimer: t.inner.NewTimer(t.stretch(d)), t: t}
}

type scaledTicker struct {
	core.ITicker
	t *ScaledTimer
}

func (s *scaledTicker) Reset(d time.Duration) { s.ITicker.Reset(s.t.stretch(d)) }

type scaledTimer struct {
	core.ITimer
	t *ScaledTimer
}

func (s *scaledTimer) Reset(d time.Duration) bool { return s.ITimer.Reset(s.t.stretch(d)) }
