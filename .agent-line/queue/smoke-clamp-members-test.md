---
id: smoke-clamp-members-test
status: ready
created: 2026-11-15T23:10:00+08:00
dependsOn: []
merge: runner
---
## Goal

First supervised run of the night runner (rollout step R1). Add a Go unit test
for `clampMembers` in `internal/sim/session.go`. The existing tests only reach
its upper bound, through `Session.Restart(MaxMembers + 5)`.

## Acceptance criteria

- A table-driven test in `internal/sim/session_test.go` calls `clampMembers`
  directly and covers: a value below `MinMembers`, `MinMembers`, a value
  between the bounds, `MaxMembers`, and a value above `MaxMembers`.
- The test uses the `MinMembers` and `MaxMembers` constants, not their
  current numbers.
- The full check of `docs/night-runner.md` section 4.1 passes.
- The diff changes `internal/sim/session_test.go` and adds this item's report
  file, and nothing else.

## Out of scope

- Any change to `clampMembers`, to `session.go`, or to other tests.
- Front-end files and documentation.
