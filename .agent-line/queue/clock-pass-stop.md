---
id: clock-pass-stop
status: ready
created: 2026-11-16T22:10:00+08:00
dependsOn: []
merge: runner
---
## Goal

Fix a gap in `internal/sim/clock.go` that the critic of #28 reported (its
non-blocking item 1). `armLocked` returns at once while a release pass is
running (`c.passing`). So a `Pause` or `Stop` made from another goroutine
during a pass leaves the real timer armed until the pass ends. Nothing is
released early, but spec rules R1.6 and R1.11
(`docs/sim-clock/2026-11-15-sim-clock-spec.md`) say no real timer is armed
while the clock is paused or stopped, and `Stop` stops it. Pull request 2 of
the sim-clock work adds a pause button, so this case becomes reachable from
the page.

## Acceptance criteria

- While a pass is running, `Pause` and `Stop` stop the real timer at once. A
  pass still re-arms the timer when it ends, as today, and only when the clock
  is neither paused nor stopped.
- A new test in `internal/sim/clock_test.go` holds a callback inside a pass,
  calls `Pause` (and, in a second case, `Stop`) from another goroutine, and
  shows the real timer is stopped before the callback returns. It fails on the
  current code. It follows the timing rules of the spec's section 4.5
  preamble (real time, at least 100 ms of margin).
- The existing clock and session tests pass unmodified.
- The full check of `docs/night-runner.md` section 4.1 passes.
- The diff changes only `internal/sim/clock.go`, `internal/sim/clock_test.go`
  and adds this item's report.

## Out of scope

- The other non-blocking items of that critic review.
- Any change to the clock's public API or to `internal/sim/session.go`.
