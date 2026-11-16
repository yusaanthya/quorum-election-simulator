---
id: sim-clock-pr3
status: ready
created: 2026-11-16T22:13:00+08:00
dependsOn: [sim-clock-pr2]
merge: owner
---
## Goal

Implement pull request 3 of the controllable simulation clock: Group C
(tasks C-1 to C-8) of `docs/sim-clock/2026-11-15-sim-clock-pr3-plan.md`,
under `docs/sim-clock/2026-11-15-sim-clock-spec.md`: automatic slow motion
during elections. Where the plan and `main` differ because of later merges
(#27, #29, and pull request 2 as merged), `main` wins and the pull request
body names the difference.

## Acceptance criteria

- Every "Done when" of tasks C-1 to C-8 holds, with the evidence the plan's
  "Tests" paragraph asks for written in this item's report.
- `internal/core/event_contract_test.go` and
  `scripts/web-import-direction.test.mjs` pass.
- The diff stays within Group C's file list, plus this item's report.
- The manual and headless checks the plan lists are listed under
  `## Unresolved` with the reason when the run cannot perform them.
- The full check of `docs/night-runner.md` section 4.1 passes.

## Out of scope

- Group D, and edits to the spec, requirements or plan files.
