---
item: clock-pass-stop
result: done
---
## Summary

`armLocked` in `internal/sim/clock.go` now stops the real timer whenever the
clock is paused or stopped, also while a release pass is running. Before, it
returned at once during a pass, so a `Pause` or `Stop` from another goroutine
left the real timer armed until the pass ended (spec R1.6, R1.11). On a
running clock the behaviour is unchanged: during a pass `armLocked` does
nothing, and the pass arms the timer when it ends, only if the clock is
neither paused nor stopped.

Added `TestClockPauseAndStopDuringPass` to `internal/sim/clock_test.go`. An
`AfterFunc` callback holds a pass open; the test arms the real timer, calls
`Pause` (one case) or `Stop` (another) from a different goroutine, and checks
the real timer is stopped before the callback is released. After release it
checks the end of the pass leaves the timer stopped. A third case, with the
clock left running, checks the end of the pass still arms the timer.

Through the public API the real timer can only be armed during a pass when a
re-arm lands after the real timer fired and before `wake` takes the lock, and
then only for an already-due deadline. That window cannot be held open from a
test, so the test arms the real timer directly (`c.real.Reset`) under the
clock's lock; the test's comment says so. The clock's public API and
`internal/sim/session.go` are unchanged.

## Tests run

- `go test -race -run TestClockPauseAndStopDuringPass -count=1 ./internal/sim`
  with `internal/sim/clock.go` reverted to the base: the `Pause` and `Stop`
  cases fail with "real timer still armed after Pause during a pass" and
  "real timer still armed after Stop during a pass".
- The same test with the fix, `-race -count=3`: passes.
- `go test -race -count=2 ./internal/...`: passes; existing clock and session
  tests are unmodified (the diff only appends to `clock_test.go`).
- Timing: waits use 1 s timeouts and the armed entry is one hour away, so
  nothing in the test depends on a margin under 100 ms.
- The full check of `docs/night-runner.md` section 4.1 runs on the tip after
  this report is committed; its results are in the pull request body.

## Questions
