---
id: sim-clock-test-gaps
status: ready
created: 2026-11-19T01:30:00+08:00
dependsOn: [sim-clock-pr4]
merge: runner
---
## Goal

Close test gaps that reviews of #33 and #42 reported as non-blocking, and add
one comment, without changing behavior. All are under
`docs/sim-clock/2026-11-15-sim-clock-spec.md`.

## Acceptance criteria

- `TestSetAutoSlow` (`internal/sim/session_test.go`): before `Start` it calls
  only `SetAutoSlow(false)` (today `false` then `true` cancel out). It asserts
  that nothing reaches the sink before `Start` and that the first event after
  `Start` is the `clock` event with `autoSlow: false` and the chosen factor,
  as plan C-2 of `docs/sim-clock/2026-11-15-sim-clock-pr3-plan.md` says
  ("behaves like `Pause` before `Start`"). It also asserts that a
  `SetAutoSlow` call while running that changes nothing still emits one
  `clock` event ("always emits"), and that a call after `Close` emits nothing.
- `TestCloseDuringSlowWindow` (AC3.7): just before `Close`, it asserts that the
  window is still open, for example that the last `clock` event in
  `Snapshot()` has `Factor` 3 times `TimeScale`. If the window has already
  ended, the test fails instead of passing without exercising the case.
- Spec E11 (a second `election_started` during an open window extends it to
  600 ms after the later one and emits no `clock` event): if `main` has no
  test for E11 once pull request 4 is merged, add one in
  `internal/sim/session_test.go`. If one exists, name it in the report.
- `TestClockEventsConverge` (`internal/web/server_test.go`): the loop gets an
  overall deadline, so a stream that never goes quiet fails the test in
  seconds instead of hanging until the `go test` timeout. The posting
  goroutine does not call `t.Error` after the test returns (for example, it
  sends its error on a channel the test reads).
- `cmd/wasm/main.go`: one comment at the `onEvent.Invoke` call saying that
  the session calls the sink while it holds its lock, so an `onEvent` that
  calls `quorumSim.*` synchronously would deadlock.
- Each changed test passes `go test -race -count=20 -run '<name>$'` on its
  package, and the report gives the command and result.
- The full check of `docs/night-runner.md` section 4.1 passes.

## Out of scope

- Any change to non-test Go code other than the one comment in
  `cmd/wasm/main.go`. If a test exposes a real defect, stop and report it
  as `[NEEDS-DECISION] ` instead of fixing it.
- `TestClockEventOrder`: its exact count now counts only command clock events
  (`commandClocks`, #42), so it stays as it is.
- The HUD's factor display (`sim-clock-hud-factor`).
