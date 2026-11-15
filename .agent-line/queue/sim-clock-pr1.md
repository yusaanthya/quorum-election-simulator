---
id: sim-clock-pr1
status: ready
created: 2026-11-16T00:25:00+08:00
dependsOn: []
merge: runner
---
## Goal

Implement pull request 1 of the controllable simulation clock: Group A
(tasks A-1 to A-5) of `docs/sim-clock/2026-11-15-sim-clock-pr1-plan.md`, under
`docs/sim-clock/2026-11-15-sim-clock-spec.md`. The session's member timers,
restart delay and message latency run on a new `sim.Clock` at a fixed factor.
A viewer sees no change.

## Acceptance criteria

- Every "Done when" of tasks A-1 to A-5 holds, and every acceptance criterion
  they list (AC1.1 to AC1.17) has the evidence the plan's "Tests" paragraph
  asks for, written in this item's report under `## Tests run`.
- The diff changes only the files in Group A's file list, plus this item's
  report file. `internal/sim/timer.go` is deleted.
- The `TestClampMembers` test added by #23 stays in `internal/sim/session_test.go`
  unmodified, like the other existing tests the plan keeps.
- The manual check of AC1.17 cannot be run without a browser. It is listed
  under `## Unresolved` in the pull request body and is not reported as done.
- The full check of `docs/night-runner.md` section 4.1 passes.

## Out of scope

- Groups B, C and D (pull requests 2 to 4) and their plan files.
- Any file under `web/`, `cmd/`, `internal/web/`, `internal/core/raft/`, and
  `internal/core/member.go`.
- Edits to the spec, requirements or plan files under `docs/sim-clock/`.
- `config.Version`, tags and releases.
