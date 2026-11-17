---
item: web-state-tests
result: done
---
## Summary

Added `scripts/web-state.test.mjs`, a `node:test` file that imports
`web/src/sim/state.ts` directly through Node's TypeScript type stripping. Type
stripping is on by default from Node 22.18, and CI's `node-version: 22`
resolves to the latest 22.x. `state.ts` uses only erasable syntax, and its one
import (`import type { Role, SimEvent } from "./events"`) is type-only and is
erased. The file therefore runs under CI's existing
`node --test scripts/*.test.mjs` step, before `npm ci`. It needs no new
dependency, no build step and no CI change.

The tests cover:

- `quorum_started`: builds a fresh cluster, returns `true`, and replaces a
  cluster whose members had changed state.
- No other event type reports a new cluster.
- Events that arrive before any cluster exists, or that name an unknown
  member, are ignored.
- `status`: updates role, term, leader, failures, halted and liveness. A
  status without a role keeps the current role. A status that reports a
  member dead clears its countdown.
- `election_timer`: starts the countdown and resets it. A dead member's timer
  event is ignored.
- `election_timer_stopped`: clears the countdown.
- `stopped`: marks the member down and clears its countdown.
- `halted`: marks the member halted and leaves it alive.
- The derived getters `size`, `majority`, `aliveCount` and `term`.
- The `leader` getter: returns only a live leader, both after `stopped` and
  after a `status` with `alive: false`.

Pull request 2 (#33) brought two changes that reach `ClusterState`, and both
are tested:

- The time passed to `apply` is now simulated milliseconds, and `timerStart`
  stores it unchanged.
- The new `clock` event type leaves member state unchanged.

No test exposed a defect, so nothing under `web/src/` changed.

Possible follow-ups for the owner. Both are outside this item's scope, which
excludes `.github/` and front-end config changes.

- The CI step that runs these tests is still named "Test review gate script".
- The import relies on `state.ts` staying erasable and keeping a type-only
  import from `./events`. A later `enum`, parameter property, or extensionless
  value import would make this test fail at load time. `web/tsconfig.json`
  sets neither `erasableSyntaxOnly` nor `verbatimModuleSyntax`, so `tsc` would
  not catch such a change.

## Tests run

- `node --test scripts/*.test.mjs` on Node v22.23.5: 35 tests pass. 14 of them
  are the new ones. No ExperimentalWarning is printed.
- Mutation check, with `state.ts` restored afterwards. Each of these edits to
  `web/src/sim/state.ts` made at least one new test fail:
  - drop the `alive` check from the `leader` getter;
  - set `timerStart` from `performance.now()` instead of the passed time;
  - remove the countdown clear on a dead `status`;
  - drop the `?? m.role` fallback.
- The full check of `docs/night-runner.md` section 4.1 runs on the tip after
  this report is committed. Its results are in the pull request body.

## Questions
