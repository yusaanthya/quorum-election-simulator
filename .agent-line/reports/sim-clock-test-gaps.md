---
item: sim-clock-test-gaps
result: done
---
## Summary

Test-only changes plus one comment; no non-test Go code changed otherwise.

- `TestSetAutoSlow` (`internal/sim/session_test.go`): before `Start` it calls
  only `SetAutoSlow(false)` and asserts nothing reaches the sink; the first
  event after `Start` is the `clock` event with `autoSlow: false` and factor 2
  (the chosen factor). While running, `SetAutoSlow(false)`, which changes
  nothing, still emits exactly one `clock` event. After `Close`,
  `SetAutoSlow(true)` (the opposite of the current value) emits nothing and the
  `clock` event ending `Snapshot()` is unchanged. Automatic slow motion stays
  off for the whole test, so a slow window cannot add `clock` events. The
  default `autoSlow: true` stays covered by `TestFirstEventIsClock` and
  `TestElectionSlowsClock`.
- `TestCloseDuringSlowWindow` (AC3.7): just before `Close` it fails unless the
  last `clock` event in `Snapshot()` has `Factor` equal to 3 times
  `TimeScale`.
- Spec E11: `main` had no test with a second `election_started` at a later
  simulated instant. The new test is `TestSecondElectionExtendsSlowWindow`. It
  uses 5 members at TimeScale 1. With a stable leader and no open window, it
  pauses and calls `SplitVote`, which opens the window at simulated time t0. It
  resumes for 300 ms of wall time (about 100 ms simulated), pauses again and
  calls `SplitVote` once more, so the second `election_started` comes at a
  later t1. It then checks four things:
  - the second election emits no `clock` event;
  - the window's stored end is t1 + 600 ms;
  - after `Resume`, the `clock` event that ends the window comes at least
    600 ms of simulated time after t1, and at most 200 ms after that;
  - while the window is open, the only `clock` events come from the Resume,
    Pause and Resume commands.

  To support this, the test `eventLog` can record the simulated time of each
  event. A mutation that does not extend an open window, tried locally and not
  committed, makes this test fail: the end comes 500 ms after t1 instead of
  600 ms.
- `TestClockEventsConverge` (`internal/web/server_test.go`): the loop has an
  overall 15 s deadline, and the posting goroutine sends its error on a
  buffered channel that the test reads, instead of calling `t.Error`.
- `cmd/wasm/main.go`: a comment at `onEvent.Invoke`. The session can call the
  sink for a `clock` event while it holds `s.mu`: in `Start`, in
  `changeClock` (`Pause`, `Resume`, `SetTimeScale`, `SetAutoSlow`), and in
  `openWindow`, `endWindowIfDue` and `run` through `setWindowLocked`. A
  synchronous call from `onEvent` to `pause`, `resume`, `setTimeScale`,
  `setAutoSlow` or `restart` would deadlock. `kill` and `splitVote` are safe
  because they run on a goroutine. The comment recommends deferring such calls
  with `queueMicrotask` or `setTimeout`.

No test exposed a defect in non-test code.

## Tests run

- `go test -race -count=20 -run 'TestSetAutoSlow$' ./internal/sim/`: ok (1.4s)
- `go test -race -count=20 -run 'TestCloseDuringSlowWindow$' ./internal/sim/`: ok (91.5s)
- `go test -race -count=20 -run 'TestSecondElectionExtendsSlowWindow$' ./internal/sim/`: ok (119.5s)
- `go test -race -count=20 -run 'TestClockEventsConverge$' ./internal/web/`: ok (13.4s)
- `go vet ./...` and `GOOS=js GOARCH=wasm go vet ./cmd/wasm`: ok
- The full check of `docs/night-runner.md` section 4.1 runs on the tip; the
  pull request body records its result.

## Questions
