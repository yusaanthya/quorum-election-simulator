---
item: sim-clock-pr4
result: done
---
## Summary

Group D (tasks D-1 to D-7) of
`docs/sim-clock/2026-11-15-sim-clock-pr4-plan.md`: the "two candidates at
once" scenario.

- D-1: `Member.handle` takes `m.mu` and calls the new `handleLocked`, which
  holds the old body: the stopped check, `apply` and the status publication.
  `Run` now creates the election timer while it holds `m.mu`, so a non-nil
  `electionTimer` read under `m.mu` means `Run` has started. The comment on
  the timer fields says they are used only under `m.mu` or by `Run`.
  `Member.Stop` still takes `m.mu`, and the halt path still calls
  `stopLocked`.
- D-2: `Quorum.SplitVote() bool` takes `q.mu`, then every member's `m.mu` in
  ascending ID order. A member is eligible when it is alive, its `Run` has
  started, it is not halted, it is not `Leader`, and its `ElectionFailures`
  is below `raft.MaxElectionFailures`. Node state is read directly under the
  held locks. Eligible members are grouped by term, and the highest term
  with at least two members is used. With no such term it returns `false`
  and changes nothing. Otherwise it picks two of that term's members at
  random and calls `handleLocked(node.OnElectionTimeout)` on the lower ID,
  then on the higher ID.
- D-3: tests for no winner, the failure limit and concurrency
  (`internal/core/splitvote_test.go`). None of them exposed a defect, so
  D-3 changes no production code.
- D-4: `Session.SplitVote()` fetches the quorum the way `Kill` does and does
  not hold `s.mu` during the call. It does nothing when there is no quorum.
- D-5: `POST /api/split-vote` takes no body and always returns 204.
  `quorumSim.splitVote()` runs `go session.SplitVote()`, like `kill`, and
  does nothing before `start`. Both header comments list the new command.
- D-6: `SimSource.splitVote()` is implemented by `ServerSource` (posts to
  `/api/split-vote`) and `WasmSource`; `QuorumSimApi` gains the signature.
  `state.ts` adds `MAX_ELECTION_FAILURES = 5`, with a comment naming
  `raft.MaxElectionFailures`, and `ClusterState.canSplitVote`.
  `HudActions.splitVote` is wired in `main.ts`. Row 3 gets a spacer and the
  button `data-action="split-vote"` labelled `兩位同時參選`, with the
  spec's `title`. `Hud.update` sets `disabled = !state.canSplitVote` before
  its early return. `style.css` is unchanged because the existing `.spacer`
  and `.btn:disabled` rules cover the button.

Differences between the plan and `main`: none that affect Group D. Group D's
files on `main` match what the plan describes. The `scripts/web-state.test.mjs`
added on `main` since the plan was written is not touched, since `scripts/` is
outside Group D's file list.

## Tests run

Evidence per acceptance criterion:

| Criterion | Evidence |
| --- | --- |
| D-1 | `go test -race ./internal/core/... ./internal/sim/` passes with every existing test unmodified, including `TestStopWaitsForStatusInFlight` and `TestStopBeforeRunPublishesNoLiveStatus` |
| AC4.1 | `TestSplitVoteElectsOneOfTwo` |
| AC4.2 | `TestSplitVoteWithoutPair` (subtests: one member; three members, two killed; not started) |
| AC4.3 | `TestSplitVoteAgainAfterLeader` |
| AC4.4 | `TestSplitVoteNoWinner` |
| AC4.5 | `TestSplitVoteFailureLimit` |
| AC4.6 | `TestSplitVoteConcurrent` (under `-race`, with a 10 s deadlock deadline) |
| AC4.7 | `TestSplitVoteWhilePaused` (`internal/sim`) |
| AC4.8 | `TestSplitVote` (`internal/web`) |
| AC4.12 | full check below; `git diff --stat` against the base lists no file under `internal/core/raft/` |

Commands, all exit 0:

- `go test -race -count=20 -run 'SplitVote' ./internal/core/`: ok (22 s).
- `go test -race -count=5 -run 'TestSplitVoteWhilePaused' ./internal/sim/`: ok.
- Full check of `docs/night-runner.md` section 4.1: `gofmt -l cmd internal`
  prints nothing; `node --test scripts/*.test.mjs` passes 35 of 35;
  `go vet ./...`; `GOOS=js GOARCH=wasm go vet ./cmd/wasm`;
  `go test -race ./...`; in `web/`, `npm ci`, `npm run build:pages` (which
  runs `tsc --noEmit`) and `npm run build`.

Headless checks were run with Playwright and Chromium against
`quorum serve -m 5 --slowmo 3` (server mode) built from this branch. Event
traces were read from `/api/events` in the page, and the button was clicked
in the page.

- AC4.9, server mode, event level: pass. With 5 members alive and the cluster
  settled (one leader, the others followers at its term, at least four
  answered heartbeat rounds since the last election), the click gave two
  `election_started` at term N+1 from two members, four `request_vote` from
  each, one granted and one refused `vote_reply` from each of the other three,
  and exactly one `became_leader` at N+1, from one of the candidates. With two
  followers then killed and the cluster settled again, the click gave two
  candidates at N+1, a single granted `vote_reply`, from the former leader, no
  `became_leader` at N+1, and a later `election_started` at N+2.
- AC4.10, server mode: pass. The button is enabled with a pair (5 alive; 3 of 5
  alive with two followers). It is disabled when every live non-leader member
  but one is offline, and in a 1-member cluster. In a paused 3-member cluster
  with one member killed, it is enabled for the two fresh followers and
  disabled after five clicks, once both reached `failures: 5`. It is enabled
  again after a restart to 5 members.
- AC4.11, server mode: pass. At 1280 x 800 and at 375 x 667 the title card's
  `scrollWidth` equals its `clientWidth` (386/386 and 353/353), no button's
  text is clipped, both row 3 buttons share one row inside the card, the page
  has no horizontal overflow, and at 375 x 667 the title card does not
  overlap the dock. One observation that the spec's measure does not cover:
  at 1280 x 800 in headless Chromium, the `.controls` element of row 2 (the
  factor presets and the pause button, which this change does not touch)
  reports a `scrollWidth` of 355 px for a `clientWidth` of 346 px. Row 2
  therefore reaches 9 px into the card's padding, though the card itself
  does not overflow. Rows 1 and 3 fit. The cause is probably the headless
  fallback fonts.

## Questions
