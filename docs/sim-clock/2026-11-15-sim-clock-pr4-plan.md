# Task plan: controllable simulation clock ("plan A")

Round: 2 (draft)
Spec (confirmed): `docs/sim-clock/2026-11-15-sim-clock-spec.md`
Requirements: `docs/sim-clock/2026-11-15-sim-clock-requirements.md`
Repository: the repository root, module
`github.com/Anthya1104/quorum-election-cli`, Go 1.24.1, front end in `web/`.
`main` was at `5360cdb` when this plan was written. The spec's header names `6bb8170`;
`main` has moved since (Appendix 3, item 2).
Implemented with: the `convergent-impl` skill
(`~/project/claude-harness/plugins/local/my-skills/skills/convergent-impl/SKILL.md`).
Date: 2026-11-15

## 0. How to read and run this plan

**One review document, four plan files.** The spec delivers four pull requests, merged in
order, each squash-merged and deployed on its own. This document is reviewed as one text and
published as four plan files, one per pull request, in
`docs/sim-clock/`:

| Plan file | Section of this document | Pull request |
| --- | --- | --- |
| `2026-11-15-sim-clock-pr1-plan.md` | Group A | PR 1 |
| `2026-11-15-sim-clock-pr2-plan.md` | Group B | PR 2 |
| `2026-11-15-sim-clock-pr3-plan.md` | Group C | PR 3 |
| `2026-11-15-sim-clock-pr4-plan.md` | Group D | PR 4 |

The split is mechanical; no line is edited:

1. Everything before the heading `## Group A` is the shared preamble. It is copied into
   every file.
2. Each `## Group X` section, from its heading to the line before the next `## ` heading,
   goes into exactly one file (table above).
3. Everything from the heading `## Appendix 1` to the end is the shared appendix. It is
   copied into every file.

A group section is therefore self-contained: it names its own base, its file list, its
tasks and its verification task, and it refers to no task of another group. The appendix
covers all four pull requests; a task ID there that carries another group's letter refers to
that group's plan file.

**How a plan file is run.** `convergent-impl` is run once per plan file, with that file's
path given in the invocation (four `*-plan.md` files exist, so the skill's "newest file"
default is not relied on). A run implements the one group of its file as one batch. The
groups of the other files are neither implemented nor checked in that run.

Preconditions of every run. The owner establishes them before the skill is invoked; the
skill creates no branch and stops on a dirty tree.

1. Order. The run for PR 1 needs no earlier pull request. The run for PR 2, 3 or 4 starts
   only after the previous pull request has been squash-merged, with the local `main`
   updated to that merge.
2. Branch. A new branch cut from that `main` is checked out. It has no commit of its own.
3. Clean tree. `git status --short` prints nothing. The working tree has held untracked
   files that are unrelated to this work (`app`, `bin/`, `docs/visualization/`,
   `log/log_output.txt`). The owner has dealt with them before the run (moved away, removed,
   or excluded locally, for example in `.git/info/exclude`); which of these is the owner's
   decision. No task modifies them, and no task edits the tracked `.gitignore`. Reason:
   `convergent-impl` stops at its Step 0 on any `git status --short` output, and at the end
   of a batch it runs `git add -A`, which would put such files into the run's diff. The
   skill's dirty-tree mode (no batch commit, no reset) is not used.

What a run does and leaves. At Step 0 the skill records `START`, the `HEAD` of the new
branch. At the end of the batch it runs `git add -A` and makes a local `wip:` commit; before
its final report it runs `git reset --mixed START`. The run therefore ends as one
uncommitted diff on top of `START`. Committing, pushing, opening the pull request and
merging are owner gates, not tasks.

**Diff base.** `BASE` in a group's scope checks is the SHA of `main` the run's branch was
cut from. The branch has no commit of its own when the run starts, so `BASE` is the `HEAD`
the skill records as `START`, and the same SHA it gives its reviewers as the batch's diff
base. Wherever the spec writes `git diff --stat main`, this plan reads it against `BASE`.

**Merging.** These are process notes for the owner and for the session that opens the pull
request. They are not tasks, and nothing here is done inside a `convergent-impl` run.
Merging needs two required statuses on the pull request's head commit: `check` (the CI job)
and `Codex Review Gate` (`docs/codex-review-gate.md` on `main`).

- Codex reviews a pull request when it is opened or marked ready for review. It does not
  review later commits by itself: after any push to an open pull request someone must
  comment `@codex review` on it, and the gate stays pending on the new head until that
  review completes.
- A P0 or P1 finding blocks. It is fixed by a new commit, never by resolving the thread.
- The merge is made with the expected head SHA.
- Therefore each group reaches its final, verified state before its pull request is
  opened (its verification task is done, and the owner has run the checks that task left
  open), so that review rounds are not repeated.

**The spec is the authority.** A task names the spec sections, rules (R), assumptions (A),
edge cases (E) and acceptance criteria (AC) it satisfies and lists the points that are easy
to miss; it does not restate the spec. Where this plan and the spec differ, the spec wins
and the difference is reported. The differences this plan makes on purpose are listed in
Appendix 3. Section numbers such as "5.4" are spec sections.

**Checks.**

- What `convergent-impl` verifies by itself. Its own gate is `go build ./...` and
  `go test ./...` (its helper `impl-verify`, run by its first reviewer), and both must exit
  0 at the end of every group. Every other command this plan names (the `-race` runs,
  `gofmt`, `go vet`, the WebAssembly vet, the `node` and `npm` commands, the greps) is run
  by the implementer after the last change of a round and recorded, with its exit code or
  output, in the implementer's batch summary (the summary file the skill asks for). A
  reviewer that can run commands may run them again.
- Task check. Every task leaves the tree compiling. A Go task ends with `go build ./...`
  and `go test -race` on the packages it names. A front-end task ends with
  `npx tsc --noEmit -p .` run from `web/`. A task that touches `cmd/wasm` ends with
  `GOOS=js GOARCH=wasm go vet ./cmd/wasm` (plain `go build ./...` skips that package). The
  task check applies to every task, also where a task's "Done when" names fewer commands.
- `npm ci`. It is run once per run in `web/`, before the first front-end command of that
  run. It writes only the ignored `web/node_modules`.
- Full check. The last task of every group runs all of the following, and all must pass.
  The list follows the `check` job of `.github/workflows/ci.yml` on `main`; if the two ever
  differ, the workflow file is the authority and the full check follows it. From the
  repository root:
  1. `gofmt -l cmd internal` prints nothing. CI runs `gofmt -l .` on a fresh checkout
     before `npm ci`; locally the narrower form keeps `web/node_modules` out of the scan,
     and every Go file of the repository is under `cmd/` or `internal/`.
  2. `node --test scripts/*.test.mjs` exits 0.
  3. `go build ./...` exits 0 (not a CI step; the skill's gate).
  4. `go vet ./...` exits 0.
  5. `GOOS=js GOARCH=wasm go vet ./cmd/wasm` exits 0.
  6. `go test -race ./...` exits 0.

  From `web/`:
  7. `npx tsc --noEmit -p .` exits 0 (named by AC1.16; in CI it runs inside both builds).
  8. `npm run build:pages` exits 0.
  9. `npm run build` exits 0.

  This contains the list of AC1.16, which AC2.22, AC3.12 and AC4.12 repeat. The builds write
  only ignored output (`internal/web/dist/*`, `web/dist-pages/`, `web/wasm-public/`).
- Scope check. The last task of every group runs `git diff --stat BASE` and
  `git status --short`. Both are needed: new files are untracked during a run and do not
  appear in `git diff`.
- Manual or headless-browser checks. The spec marks some front-end criteria as "manual" or
  "manual or headless". They are not automated tests (A7: no front-end test framework is
  added). They are listed in the last task of each group. Each one gets one recorded result
  per mode it names, written in the implementer's batch summary: `pass`, `fail`, or
  `not run, open for the owner` (for a check the implementer cannot run, for example
  without a browser). A `fail` is fixed in the task that owns the file, and the full check
  is run again. `not run, open for the owner` satisfies the task's done condition; it does
  not satisfy the pull request. The summary lists these checks under the heading
  `Open for the owner`, and the owner runs each of them, before opening the pull request
  where possible (see "Merging"). A pull request is not merged with an open or failed check.
- How to start the two modes for those checks. Server mode: `go run ./cmd/main.go serve`
  plus `npm run dev` in `web/` (Vite proxies `/api` to port 8080), or `make web` and then
  `go run ./cmd/main.go serve` at <http://localhost:8080>. WebAssembly mode:
  `npm run dev:wasm` in `web/`. Every start of the Go binary writes `log/log_output.txt`
  (`internal/logger`). Unless the owner excluded that path locally (precondition 3), the
  file is deleted again after the check and before the scope check, so that it does not
  enter the run's diff.

**Tests.** Go tests go where the spec says: clock tests in `internal/sim/clock_test.go`,
session tests in `internal/sim/session_test.go` (package `sim`, in-package), server tests in
`internal/web/server_test.go`. Tests may be written before the code they test; a failing
(red) run and the change that makes it pass always stay inside the same task. Timing in
tests follows the preamble of 4.5 and the tolerances of section 8: the stated waits and
bounds are used as written, not tightened. The implementer's batch summary names, for every
acceptance criterion a task lists, its evidence: the test function for a Go-test criterion,
the command and its result for a build, grep or scope criterion, and the recorded result
for a manual or headless check.

**Language.** Code comments, test names, commit and pull-request text are English. New HUD
strings are zh-TW, exactly as the spec writes them (A11).

**Not touched by any group.** `internal/core/raft/` (requirements, AC1.15, AC3.12, AC4.12),
`config.Version` and any tag or release (A12), `docs/architecture.md`, the CLI `play`
command, `web/src/scene/mochi.ts`, `MockTimer` beyond its new method (section 10), and the
CI and review-gate files (`.github/`, `scripts/`, `docs/codex-review-gate.md`).

## Group D: PR 4, the "two candidates at once" scenario

Plan file: `2026-11-15-sim-clock-pr4-plan.md`.
Base: the SHA of `main` the run's branch was cut from (`BASE`, section 0). That `main`
contains pull request 3, squash-merged; the run does not start before that merge.
Ends as: pull request 4.
Files this group may touch: `internal/core/member.go`, `internal/core/quorum.go`,
`internal/core/splitvote_test.go` (new; file name is a plan choice),
`internal/sim/session.go`, `internal/sim/session_test.go`, `internal/web/server.go`,
`internal/web/server_test.go`, `cmd/wasm/main.go`, `web/src/sim/source.ts`,
`web/src/sim/state.ts`, `web/src/ui/hud.ts`, `web/src/main.ts`, and `web/src/style.css`
only if the added button needs a rule that row 3 does not already provide. No event format
change, so `observer.go` and `events.ts` are not touched.

### D-1: Member handles an event with its lock already held

Files: `internal/core/member.go`.
Satisfies: 7.1 (`internal/core/member.go`), the requirements preference for doing this in
the runtime and not in `raft.Node`.

- `handle(event)` takes `m.mu` and calls a new `handleLocked(event)` that holds the rest of
  today's body (the stopped check, `apply`, the status publication).
- `Run` creates the election timer while holding `m.mu`, so a non-nil `m.electionTimer`
  read under `m.mu` means that this member's `Run` has started. The comment on the timer
  fields says they are used only under `m.mu`, or by `Run`.
- No behaviour change.

Depends on: none (this group's base only).
Done when: `go build ./...` passes; `go test -race ./internal/core/... ./internal/sim/`
passes with every existing test unmodified.

### D-2: `Quorum.SplitVote` with its basic tests

Files: `internal/core/quorum.go`, `internal/core/splitvote_test.go` (new).
Satisfies: 7.1 (`internal/core/quorum.go`, steps 1 to 4, the "both or neither", "same
term" and "same instant" guarantees), A6, E9, T6; AC4.1, AC4.2, AC4.3.

- `func (q *Quorum) SplitVote() bool`: take `q.mu`, then every member's `m.mu` in ascending
  ID order; find the eligible members (alive, `Run` started, not halted, not `Leader`,
  `ElectionFailures` below `raft.MaxElectionFailures`); group them by term; with no term
  shared by at least two, release and return `false`; otherwise take the highest such
  term, pick two of its members at random and call
  `handleLocked(m.node.OnElectionTimeout)` on the lower ID, then on the higher ID.
- Node state is read directly under the held locks: `Member.Status()` and `Member.Stop()`
  take `m.mu` themselves and are not called from inside.
- Tests follow the preamble of 7.3 (`MockTimer` advanced only where stated, no
  `Options.Latency`, 50 ms after `Start`): AC4.1 (5 members: `true`, exactly two
  `election_started` with `term: 1` from two members, a `became_leader` with `term: 1` from
  one of them, no third `election_started`); AC4.2 (`false` and no event for a 1-member
  quorum, a 3-member quorum with two killed, and a quorum that was not started); AC4.3 (a
  second call from the settled state of AC4.1 gives two `election_started` with `term: 2`
  from members other than the leader).

Depends on: D-1.
Done when: `go build ./...` passes; `go test -race ./internal/core/...` passes with one test
for each of AC4.1, AC4.2 and AC4.3 as those criteria state them.

### D-3: `SplitVote` tests for no winner, the failure limit and concurrency

Files: `internal/core/splitvote_test.go`; `internal/core/quorum.go` or
`internal/core/member.go` only where one of these tests exposes a defect (the summary says
which).
Satisfies: 7.1 ("never halts a member directly", "Who wins" for the configured size), E8;
AC4.4, AC4.5, AC4.6.

- AC4.4: 5 members brought to the state AC4.3 starts from (a leader and four followers at
  term 1, before AC4.3's second `SplitVote()`), with two followers then killed: `true`,
  two `election_started` with `term: 2`, exactly one `vote_granted` with `term: 2`, no
  `became_leader` with `term: 2` within 300 ms; after `AdvanceTime(3 * time.Second)` an
  `election_started` with `term: 3`.
- AC4.5: 3 members with one killed: five calls return `true` with terms 1 to 5 and no
  `became_leader`; the sixth returns `false`, emits no `election_started`, and no `halted`
  event has been recorded.
- AC4.6: `SplitVote()`, `KillMember`, `Snapshot` and `Stop` from concurrent goroutines end
  without a race report or deadlock.

Depends on: D-2.
Done when: `go test -race ./internal/core/...` passes with one test for each of AC4.4,
AC4.5 and AC4.6 as those criteria state them.

### D-4: `Session.SplitVote`

Files: `internal/sim/session.go`, `internal/sim/session_test.go`.
Satisfies: 7.1 (`internal/sim/session.go`; the command works while paused), A3, E7, E11;
AC4.7.

- `func (s *Session) SplitVote()` calls `SplitVote` on the current quorum, fetched as
  `Kill` does; `s.mu` is not held during the call; it does nothing when there is no quorum.
- Test AC4.7: with a leader elected and every other member a `Follower` at the leader's
  term, `Pause()` followed 300 ms later by `SplitVote()` gives two `election_started`
  events with the same term and no `vote_granted` until `Resume()`; `SplitVote()` before
  `Start()` and after `Close()` returns and emits nothing.

Depends on: D-2.
Done when: `go build ./...` passes; `go test -race ./internal/sim/` passes with the AC4.7
test.

### D-5: `split-vote` command in the local server and the WebAssembly API

Files: `internal/web/server.go`, `internal/web/server_test.go`, `cmd/wasm/main.go`.
Satisfies: 7.2 (server, WebAssembly); AC4.8.

- `POST /api/split-vote`: no body, always 204.
- `quorumSim.splitVote()` runs `go session.SplitVote()`, like `kill`, because it takes the
  quorum lock; it does nothing before `start`. The header comment lists it.
- Test AC4.8: `POST /api/split-vote` returns 204.

Depends on: D-4.
Done when: `go build ./...`, `GOOS=js GOARCH=wasm go vet ./cmd/wasm` and
`go test -race ./internal/web/` pass, with the AC4.8 test.

### D-6: Split-vote button in the HUD

Files: `web/src/sim/source.ts`, `web/src/sim/state.ts`, `web/src/ui/hud.ts`,
`web/src/main.ts`, and `web/src/style.css` only if the button needs a rule that row 3 does
not already provide.
Satisfies: 7.2 (`SimSource`, `HudActions`, `canSplitVote`, the HUD button), the layout
table of 5.6 for row 3, A11, E9. It is what AC4.9 to AC4.11 observe.

- `SimSource` gains `splitVote(): void`: `ServerSource` posts to `/api/split-vote`,
  `WasmSource` calls `splitVote`, `QuorumSimApi` gains the signature.
- `state.ts`: `MAX_ELECTION_FAILURES = 5` with a comment naming `raft.MaxElectionFailures`;
  `ClusterState` gains the getter `canSplitVote` (at least two members that are alive, not
  halted, not `Leader`, with `failures < MAX_ELECTION_FAILURES`, share the same `term`).
- `hud.ts`: `HudActions` gains `splitVote(): void`. Row 3 gets a spacer and a button
  `data-action="split-vote"` labelled `兩位同時參選` with
  `title="讓兩位成員在同一任期同時參選。若沒有人拿到過半票（過半以總成員數計），逾時後會進入下一任期"`.
  `Hud.update` sets `disabled = !state.canSplitVote` on every call, before its early return
  for unchanged state.
- `main.ts`: the new action is wired to the source.
- A click that finds no pair does nothing and shows nothing (7.2, section 10).
- This is the first front-end task of the run: `npm ci` in `web/` comes before its check
  (section 0).

Depends on: D-5.
Done when: `npx tsc --noEmit -p .` and `npm run build` pass in `web/`.

### D-7: Group D verification

Files: none (fixes found here go back to the task that owns the file).
Satisfies: AC4.12, and the manual or headless criteria AC4.9 to AC4.11.

- Run the full check (section 0) (AC4.12).
- Scope (AC4.12): `git diff --stat BASE` and `git status --short` list no file under
  `internal/core/raft/` and no file outside the list at the top of this group.
- Manual or headless checks, not automated tests, on a machine that is not overloaded:
  - AC4.9, both modes, each from a settled cluster (7.1; a leader shown, every other live
    member labelled `追隨者`, three heartbeat rounds out and back with no new `發起選舉`
    line). With 5 members alive: the click shows two candidates at once, envelopes leaving
    both, one heart and one refusal from each of the other three, and one winner. With two
    members offline and the cluster settled again: two candidates, a single heart from the
    former leader, no winner, and a later election with a higher term.
  - AC4.10: the button is disabled in a 1-member cluster, when every live non-leader
    member but one is offline, and for a pair that has both reached five failures; it is
    enabled again when a pair exists.
  - AC4.11: the layout criterion of the spec's AC2.21 holds for rows 1 to 3 with both
    buttons in row 3: at 1280 px wide and at 375 x 667 no horizontal overflow (the card's
    `scrollWidth` equals its `clientWidth`), no button text clipped, and at 375 x 667 the
    title card does not overlap the bottom dock.

Depends on: D-1, D-2, D-3, D-4, D-5, D-6.
Done when: every command of the full check passes; the scope check holds; each of AC4.9 to
AC4.11 has a recorded result for every mode it names (section 0: `pass`, `fail` or
`not run, open for the owner`) and none is `fail`.

**After this pull request (owner, outside the run).** After PR 3 and PR 4 are merged the
owner releases `v0.5.0` as A12 describes (version-bump pull request, README pointer pull
request, annotated tag on the version-bump commit). No task in this plan does that.

## Appendix 1: Coverage of the acceptance criteria

Shared appendix (section 0): it covers all four plan files. Every acceptance criterion of
the spec is assigned to at least one task.

| Criterion | Task | Criterion | Task |
| --- | --- | --- | --- |
| AC1.1 | A-4, A-5 | AC1.10 | A-2 |
| AC1.2 | A-1 | AC1.11 | A-1 |
| AC1.3 | A-1 | AC1.12 | A-1 |
| AC1.4 | A-1 | AC1.13 | A-3 |
| AC1.5 | A-2 | AC1.14 | A-3, A-4 |
| AC1.6 | A-2 | AC1.15 | A-5 |
| AC1.7 | A-2 | AC1.16 | A-5 |
| AC1.8 | A-1 | AC1.17 | A-5 (manual) |
| AC1.9 | A-2 | | |

| Criterion | Task | Criterion | Task |
| --- | --- | --- | --- |
| AC2.1 | B-3 | AC2.12 | B-6 |
| AC2.2 | B-2, B-3 | AC2.13 | B-5 |
| AC2.3 | B-3 | AC2.14 | B-1, B-12 |
| AC2.4 | B-2, B-3 | AC2.15 | B-12 (manual or headless) |
| AC2.5 | B-4 | AC2.16 | B-12 (manual or headless) |
| AC2.6 | B-4 | AC2.17 | B-12 (manual) |
| AC2.7 | B-4 | AC2.18 | B-12 (manual) |
| AC2.8 | B-3 | AC2.19 | B-12 (manual) |
| AC2.9 | B-4 | AC2.20 | B-12 (manual) |
| AC2.10 | B-6 | AC2.21 | B-12 (manual or headless) |
| AC2.11 | B-6 | AC2.22 | B-12 |

| Criterion | Task | Criterion | Task |
| --- | --- | --- | --- |
| AC3.1 | C-3 | AC3.7 | C-4 |
| AC3.2 | C-3 | AC3.8 | C-5 |
| AC3.3 | C-3 | AC3.9 | C-8 (manual or headless) |
| AC3.4 | C-4 | AC3.10 | C-8 (manual) |
| AC3.5 | C-4 | AC3.11 | C-8 (manual or headless) |
| AC3.6 | C-2 | AC3.12 | C-8 |

| Criterion | Task | Criterion | Task |
| --- | --- | --- | --- |
| AC4.1 | D-2 | AC4.7 | D-4 |
| AC4.2 | D-2 | AC4.8 | D-5 |
| AC4.3 | D-2 | AC4.9 | D-7 (manual or headless) |
| AC4.4 | D-3 | AC4.10 | D-7 (manual or headless) |
| AC4.5 | D-3 | AC4.11 | D-7 (manual or headless) |
| AC4.6 | D-3 | AC4.12 | D-7 |

Spec sections that carry work but no acceptance criterion of their own, and the task that
does them: 4.3 `MockTimer.AfterFunc` (A-4); 5.5 WebAssembly API (B-7, C-5, D-5); 5.6
`source.ts` (B-8, C-6, D-6); 5.4 `--slowmo` help text and 5.6 `readme.md` (B-11); 6.2 "all
four fields on every `clock` event" (C-2); 7.1 `member.go` (D-1).

## Appendix 2: Choices made by this plan

These are the points where the spec leaves the order or a name open. None changes what a
pull request contains.

1. Group A moves member timers to the clock (A-3) before message latency (A-4), so the
   build and the existing session tests pass after each task.
2. Group B removes the duration scaling in `emit` (B-2) before the factor becomes mutable
   (B-3). Doing it in the other order would leave `emit` reading the factor without `s.mu`
   for one task, which `go test -race` could report.
3. Group C adds the switch and the two event fields (C-2) before the window (C-3) and its
   replacement and pause cases (C-4), so the delicate ordering of 6.1 is reviewed alone.
4. Test-only tasks (A-2, B-4, D-3) exist to keep each review small; they may change
   production code only to fix a defect the new test exposes.
5. The split-vote tests of `internal/core` go in a new file,
   `internal/core/splitvote_test.go`.
6. `PacketSystem.spawn` takes the packet's start as a required parameter placed before the
   optional `onArrive` (B-9). The spec says only that `spawn` receives the start.

## Appendix 3: Stated differences from the spec

The spec is the authority (section 0). These are the points where this plan departs from
its text on purpose.

1. `web/src/concepts.ts` changes in pull request 2 (task B-9, and Group B's file list).
   Spec 5.6 lists the front-end files of PR 2 and does not name it. The file is the second
   caller of `PacketSystem`, whose `spawn` and `update` signatures 5.6 changes, and it is
   type-checked with the rest of `web/src`; without the change either the type check fails
   or the dev-only concepts page stops animating its packets. The change is limited to the
   four call sites named in B-9, and Group B's verification task adds one check of that
   page, which has no spec criterion. No acceptance criterion is affected (AC1.15 limits
   the files of PR 1 only).
2. Base commit. The spec's header and the requirements name `main` at `6bb8170`. `main` has
   moved since: it was at `5360cdb` when this plan was written, three commits later (#13,
   #14, #15). They touch only `.github/`, `scripts/`, `docs/codex-review-gate.md` and two
   lines of `readme.md` that are not the lines task B-11 edits. Every base in this plan is
   the SHA of `main` the run's branch was cut from, not `6bb8170`, and AC1.15's
   `git diff --stat main` is read against that SHA.
3. The full check (section 0) contains the list of AC1.16 and adds what the CI `check` job
   gained after the spec was written (the `gofmt` check and
   `node --test scripts/*.test.mjs`), plus `go build ./...`, which `convergent-impl`
   requires.
