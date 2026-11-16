---
id: web-state-tests
status: ready
created: 2026-11-16T22:15:00+08:00
dependsOn: [sim-clock-pr2]
merge: runner
---
## Goal

The front end has no tests. `ClusterState` in `web/src/sim/state.ts` turns
the event stream into what the page draws, and two of the four defects Codex
found in #8 were front-end ones. Add tests for it that run in CI without a
browser and without a new dependency.

## Acceptance criteria

- A new `scripts/web-state.test.mjs` (node:test, the style of the other
  `scripts/*.test.mjs` files) imports `web/src/sim/state.ts` directly through
  Node's TypeScript type stripping. It runs under CI's existing step
  `node --test scripts/*.test.mjs`, on CI's Node major version (see
  `.github/workflows/ci.yml`) and before `npm ci`. If that is not possible
  without a new dependency or a CI change, the report says `blocked` and
  explains why, and nothing else is changed.
- The tests cover:
  - `quorum_started` replacing the cluster and reporting it;
  - `status` updating role, term, leader and liveness;
  - `election_timer` and `election_timer_stopped` setting and clearing the
    countdown;
  - `stopped` marking a member down and clearing its countdown;
  - the `leader` getter returning only a live leader;
  - whatever pull request 2 added to `ClusterState`.
- No change to `web/src/` unless a test exposes a real defect; such a fix is
  named in the pull request body.
- The full check of `docs/night-runner.md` section 4.1 passes.

## Out of scope

- Tests that need three.js, a DOM or a browser.
- Any change to `web/package.json` or `.github/`.
