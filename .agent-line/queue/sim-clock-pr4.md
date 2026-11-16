---
id: sim-clock-pr4
status: ready
created: 2026-11-16T22:14:00+08:00
dependsOn: [sim-clock-pr3]
merge: owner
---
## Goal

Implement pull request 4 of the controllable simulation clock: Group D
(tasks D-1 to D-7) of `docs/sim-clock/2026-11-15-sim-clock-pr4-plan.md`,
under `docs/sim-clock/2026-11-15-sim-clock-spec.md`: a split-vote button.
Where the plan and `main` differ because of later merges, `main` wins and
the pull request body names the difference.

## Acceptance criteria

- Every "Done when" of tasks D-1 to D-7 holds, with the evidence the plan's
  "Tests" paragraph asks for written in this item's report.
- D-1 keeps the ordering fix of #8: `Member.Stop` takes the member's lock, and
  the internal halt path uses `stopLocked`. `TestStopWaitsForStatusInFlight`
  and `TestStopBeforeRunPublishesNoLiveStatus` pass unmodified.
- `internal/core/event_contract_test.go` and
  `scripts/web-import-direction.test.mjs` pass.
- The diff stays within Group D's file list, plus this item's report.
- The manual and headless checks the plan lists are listed under
  `## Unresolved` with the reason when the run cannot perform them.
- The full check of `docs/night-runner.md` section 4.1 passes.

## Out of scope

- Edits to the spec, requirements or plan files, `config.Version`, tags and
  releases.
