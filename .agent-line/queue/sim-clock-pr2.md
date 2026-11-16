---
id: sim-clock-pr2
status: ready
created: 2026-11-16T22:11:00+08:00
dependsOn: [sim-clock-pr1, clock-pass-stop]
merge: owner
---
## Goal

Implement pull request 2 of the controllable simulation clock: Group B
(tasks B-1 to B-12) of `docs/sim-clock/2026-11-15-sim-clock-pr2-plan.md`,
under `docs/sim-clock/2026-11-15-sim-clock-spec.md`. Viewers get pause and
speed controls.

The plan was written before #27 and #29 were merged. Where it and `main`
differ, `main` wins:

- #27 moved `MemberLook`, `Lighting` and `random.ts` into `web/src/scene/`,
  and `scripts/web-import-direction.test.mjs` enforces the import direction.
- #29 shows the countdown ring only while no leader is alive. It adds the
  `noLeader` argument of `Mochi.update`, removes the track ring and makes the
  arc glow.

## Acceptance criteria

- Every "Done when" of tasks B-1 to B-12 holds, with the evidence the plan's
  "Tests" paragraph asks for written in this item's report.
- Task B-9 drives the countdown from the simulated clock while keeping #29's
  behaviour: the ring shows only while no leader is alive, there is no track
  ring, and the arc glows. Any departure from the plan that this needs is
  named in the pull request body.
- `internal/core/event_contract_test.go` passes, so the new `clock` event and
  fields match on both sides.
- The diff stays within Group B's file list, plus this item's report.
- The manual and headless checks the plan lists (AC2.15 to AC2.21) are listed
  under `## Unresolved` with the reason when the run cannot perform them, and
  are not reported as done.
- The full check of `docs/night-runner.md` section 4.1 passes.

## Out of scope

- Groups C and D, and edits to the spec, requirements or plan files.
- Changing #29's visibility rule or the ring's look beyond what B-9 needs.
