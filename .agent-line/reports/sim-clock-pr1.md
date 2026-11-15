---
item: sim-clock-pr1
result: done
---
## Summary

Group A (tasks A-1 to A-5) of `docs/sim-clock/2026-11-15-sim-clock-pr1-plan.md`.

- A-1, A-2: new `internal/sim/clock.go` with `sim.Clock` (spec 4.2). It exposes
  exactly `NewClock`, `Now`, `NewTimer`, `NewTicker`, `AfterFunc`, `SetFactor`,
  `Pause`, `Resume` and `Stop`, with no getters. Deadlines are kept in
  simulated time. One real timer is armed for the earliest pending deadline,
  and at most one release pass runs at a time. Entries are released by
  deadline, then by the order their deadlines were set. Channels have
  capacity 1, are written without blocking under the lock, and are drained by
  `Stop` and `Reset`. A ticker drops ticks for a slow receiver and moves its
  next deadline forward by whole intervals. Callbacks run one at a time with
  no lock held. A factor outside [0.001, 1000] or a non-finite one panics, and
  the wall delay is capped at one hour. While the clock is paused, stopped or
  empty, no real timer is armed. New `internal/sim/clock_test.go`. No clock
  defect was found by the A-2 tests.
- A-3: `Session` owns one clock, created with `NewClock(scale)` and passed to
  every cluster generation. The restart delay is `s.clock.NewTimer(restartDelay)`
  and is stopped when `run` leaves the wait loop. `Close` calls
  `s.clock.Stop()` as its last step. `New` turns a scale below 1, or NaN,
  into 1 and caps it at 1000. `internal/sim/timer.go`,
  `TestScaledTimerStretchesDurations` and `fakeTimer` are deleted.
- A-4: `core.Timer` gains `AfterFunc`, implemented by `RealTimer` and
  `MockTimer`. `AdvanceTime` calls a due callback once, outside the mock's
  lock. `observedNetworker` has a `timer` field set by
  `NewQuorumWithOptions` and schedules delayed deliveries with
  `n.timer.AfterFunc`. The `Options.Latency` comment now says "measured in the
  timer's time". `TestLatencyDelaysDelivery` sets `timer: NewRealTimer()`.
  `Session.latency()` returns unscaled time, and `emit` scales `DurationMs`
  for both `election_timer` and `message` events.
- Not touched: `web/`, `cmd/`, `internal/web/`, `internal/core/raft/`,
  `internal/core/member.go`, the spec, plan and requirements files, and
  `config.Version`.

## Tests run

These ran during implementation, on the implementation commits before this
report.

Evidence per acceptance criterion:

| Criterion | Evidence |
| --- | --- |
| AC1.1 | `grep -rn "time.AfterFunc\|time.After(" internal/core/quorum.go internal/sim/session.go` printed nothing (exit 1). `internal/sim/timer.go` does not exist. `grep -rn "ScaledTimer\|NewScaledTimer" --include=*.go .` printed nothing |
| AC1.2 | `TestClockRescale`: for each kind, 1 s at factor 1000, not fired after 200 ms, fires within 1 s after `SetFactor(0.01)`; 500 ms at factor 1 then `SetFactor(1000)`, not fired after 800 ms |
| AC1.3 | `TestClockPause` |
| AC1.4 | `TestClockPauseKeepsRemainingTime`, for each kind |
| AC1.5 | `TestClockReleaseOrder`, with four subtests (the four cases) |
| AC1.6 | `TestClockNoStaleValue`: timer and ticker, after `Stop`, after `Reset`, after `Stop` then `Reset` |
| AC1.7 | `TestClockNoStaleValueUnderConcurrency` |
| AC1.8 | `TestClockTimerCreatedWhilePaused` |
| AC1.9 | `TestClockConcurrentUse`, under `-race` |
| AC1.10 | `TestClockDoesNotWaitForCallbacks` |
| AC1.11 | `TestClockArguments` |
| AC1.12 | `TestClockStop` |
| AC1.13 | `TestCloseStopsClock`, with and without `Start` |
| AC1.14 | `TestNewLimitsTimeScale` (NaN gives 1, 5000 gives 1000). `TestSessionRestartAndScale` and `TestSessionRestartsAfterClusterHalts` pass with their assertions unmodified. The `TestScaledTimerStretchesDurations` test and its `fakeTimer` helper are deleted. `TestClampMembers` is unmodified |
| AC1.15 | `git diff --stat f0c1f4f` lists only the nine Group A files. `git status --short` printed nothing |
| AC1.16 | Passed: `go vet ./...`, `GOOS=js GOARCH=wasm go vet ./cmd/wasm`, `go test -race ./...`, and in `web/`: `npm ci`, `npx tsc --noEmit -p .` (exit 0), `npm run build:pages`, `npm run build` |
| AC1.17 | Not run, open for the owner: the run has no browser |

Commands:

- `go build ./...`, `gofmt -l cmd internal` (printed nothing), `go vet ./...`
  and `GOOS=js GOARCH=wasm go vet ./cmd/wasm`: all pass.
- `go test -race -count=1 ./...`: all packages pass.
- `go test -race -count=6 ./internal/sim/ ./internal/core/`: passes. This was
  a check for flaky timing tests.
- `node --test scripts/*.test.mjs`: 20 of 20 pass.
- In `web/`: `npm ci`, `npm run build:pages`, `npm run build` and
  `npx tsc --noEmit -p .` all pass.
- Section 4.1 of `docs/night-runner.md` requires a full check on the tip after
  this report is committed. Its results are in the pull request body.

## Questions
