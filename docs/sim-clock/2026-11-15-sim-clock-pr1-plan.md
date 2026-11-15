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

## Group A: PR 1, controllable clock with no visible change

Plan file: `2026-11-15-sim-clock-pr1-plan.md`.
Base: the SHA of `main` the run's branch was cut from (`BASE`, section 0). No earlier pull
request of this work is needed.
Ends as: pull request 1. A viewer sees no change (4.1).
Files this group may touch: `internal/sim/clock.go` (new), `internal/sim/clock_test.go`
(new), `internal/sim/timer.go` (deleted), `internal/sim/session.go`,
`internal/sim/session_test.go`, `internal/core/timer.go`, `internal/core/test_util.go`,
`internal/core/quorum.go`, `internal/core/observer_test.go`. Nothing else (AC1.15).

Order inside the group (plan choice): the session first moves its member timers and restart
delay onto the clock while messages keep their scaled `time.AfterFunc` delay (A-3), then
message latency moves onto the clock (A-4). At a fixed factor both steps behave like today,
so every task ends with the build and the existing tests passing.

### A-1: `sim.Clock` with its scaling, pause, argument and stop tests

Files: `internal/sim/clock.go` (new), `internal/sim/clock_test.go` (new).
Satisfies: 4.2, R1.1 to R1.11 (implementation), A13; AC1.2, AC1.3, AC1.4, AC1.8, AC1.11,
AC1.12.

- Implement `Clock` with exactly the API of 4.2: `NewClock`, `Now`, `NewTimer`,
  `NewTicker`, `AfterFunc`, `SetFactor`, `Pause`, `Resume`, `Stop`. No `Factor()` or
  `Paused()` getter.
- Points that are easy to miss:
  - one real timer armed for the earliest pending deadline, never one per entry, and at
    most one release pass at a time (R1.6);
  - deadlines are stored in simulated time; a factor change keeps every entry's remaining
    simulated time (R1.1, R1.3);
  - channels have capacity 1 and are written without blocking under the clock's lock;
    `Stop` and `Reset` discard a value that was sent but not received (R1.7);
  - a slow ticker drops ticks, and its next deadline follows the rule of R1.8;
  - callbacks run one at a time, in release order, with no clock lock held; no `Clock`
    method waits for a callback (R1.4, R1.5, R1.9);
  - the factor is validated against [0.001, 1000]; the wall delay is computed in floating
    point and capped at one hour; a wake-up with nothing due re-arms and returns (R1.10);
  - no real timer is armed while the clock is paused, stopped or empty, and no goroutine
    is kept alive while nothing is due; a callback that was already released may still
    finish (R1.4, R1.6); after `Stop` nothing is released and `Pause`, `Resume`,
    `SetFactor` change nothing (R1.11).
- Nothing uses the clock yet. `ScaledTimer` is not touched in this task.
- Tests, written to the preamble of 4.5 (real time, at least 100 ms of margin, "must not
  fire" made impossible by a paused clock or factor 1000; "each kind" is a timer, a
  ticker's first tick and an `AfterFunc` entry): rescale (AC1.2), pause (AC1.3), remaining
  time preserved (AC1.4), creation while paused (AC1.8), arguments (AC1.11), stop (AC1.12).

Depends on: none.
Done when: `go build ./...` passes; `go test -race ./internal/sim/` passes, including one
test for each of AC1.2, AC1.3, AC1.4, AC1.8, AC1.11 and AC1.12 with the durations, factors
and bounds those criteria state; the existing tests of the package pass unmodified.

### A-2: Clock tests for release order, stale values, concurrency and callbacks

Files: `internal/sim/clock_test.go`; `internal/sim/clock.go` only where one of these tests
exposes a defect (the summary says which).
Satisfies: AC1.5 (all four cases), AC1.6, AC1.7, AC1.9, AC1.10; they verify R1.4, R1.5,
R1.7 and R1.9.

- Order (AC1.5): shuffled `AfterFunc` entries after a factor change; the same with a
  `Pause`/`Resume` pair around the change; equal deadlines created while paused run in
  creation order; three channel timers received in deadline order by one goroutine.
- No stale value (AC1.6): for a timer and for a ticker, after `Stop()`, after `Reset(d)`,
  and after `Stop()` followed by `Reset(d)`.
- No stale value under concurrency (AC1.7): 1000 rounds of `Reset(1 ms)`, yield, `Stop()`,
  non-blocking receive, at factor 0.001.
- Concurrency (AC1.9): create, reset, stop and `AfterFunc` against a loop of `SetFactor`,
  `Pause`, `Resume`, with no race report and no deadlock.
- No waiting on callbacks (AC1.10): a callback that calls `Pause`, `Resume`, `SetFactor`,
  `NewTimer` and `AfterFunc` on its own clock returns; `Pause`, `SetFactor` and `Stop`
  return within 1 s while another callback is blocked.

Depends on: A-1.
Done when: `go build ./...` passes; `go test -race ./internal/sim/` passes, including one
test for each of AC1.5, AC1.6, AC1.7, AC1.9 and AC1.10 as those criteria state them.

### A-3: Session runs member timers and its restart delay on the clock

Files: `internal/sim/session.go`, `internal/sim/session_test.go`, `internal/sim/timer.go`
(deleted).
Satisfies: 4.1 (limits on the scale), 4.4 except its `latency()` and `emit` items, R1.11
(the session owns its clock); AC1.13, AC1.14 (the `NaN` and `5000` cases and the deleted
test).

- `New`: a scale below 1 or NaN becomes 1, above 1000 becomes 1000 (4.1).
- The field `timer core.Timer` becomes `clock *Clock`, created once with `NewClock(scale)`
  and passed to `core.NewQuorumWithOptions` for every cluster generation.
- `run`: the wait after `quorum_ended` uses `s.clock.NewTimer(restartDelay)` (unscaled)
  instead of `time.After(restartDelay x scale)`; that timer is stopped when `run` leaves
  the wait loop.
- `Close` calls `s.clock.Stop()` as its last step: after the `run` goroutine has exited, or
  directly when the session was never started.
- Delete `internal/sim/timer.go`. In `session_test.go` delete
  `TestScaledTimerStretchesDurations` and its `fakeTimer` helper.
- `latency()` and `emit` are not changed in this task: messages are still delivered by
  `time.AfterFunc` with the scaled delay, which equals a clock at a fixed factor (A-4 moves
  them).
- The exported API of `Session` is unchanged; comments on the touched lines stay accurate.
- New tests: AC1.13 (after `Close()`, with and without `Start()`, a 1 ms timer on the
  session's clock does not fire within 200 ms and the sink receives nothing); AC1.14
  (`TimeScale: math.NaN()` reports 1 and `TimeScale: 5000` reports 1000, without a panic).

Depends on: A-1.
Done when: `go build ./...` passes; `go test -race ./internal/sim/ ./internal/web/` passes;
`internal/sim/timer.go` does not exist and `grep -rn "ScaledTimer" --include=*.go .`
returns nothing; `TestSessionRestartAndScale` and `TestSessionRestartsAfterClusterHalts`
pass with their assertions unmodified; the AC1.13 and AC1.14 tests pass.

### A-4: Message latency goes through the clock

Files: `internal/core/timer.go`, `internal/core/test_util.go`, `internal/core/quorum.go`,
`internal/core/observer_test.go`, `internal/sim/session.go`.
Satisfies: 4.3, the `latency()` and `emit` items of 4.4, the rounding statement of 4.1;
AC1.1, AC1.14 (existing session tests unmodified).

- `core.Timer` gains `AfterFunc(d time.Duration, f func())`; `RealTimer.AfterFunc` calls
  `time.AfterFunc(d, f)`.
- `MockTimer` gains `AfterFunc`; `AdvanceTime` calls `f` once, outside the mock's lock,
  when the deadline is reached. No other change to `MockTimer` and no test for the new
  method (section 10; section 11, C-S9).
- `observedNetworker` gains a `timer Timer` field, set in `NewQuorumWithOptions` to the
  quorum's timer; `SendTo` calls `n.timer.AfterFunc(delay, ...)`. The event's `DurationMs`
  stays `delay.Milliseconds()`. The `Options.Latency` comment says "measured in the timer's
  time".
- `TestLatencyDelaysDelivery` sets `timer: NewRealTimer()` on the networker it builds; its
  assertions do not change.
- `Session.latency()` returns the unscaled duration, drawn as today. `Session.emit`
  multiplies `DurationMs` by `s.scale` for both `election_timer` and `message` events.
- `internal/core/member.go` and `internal/core/raft/` are not touched.

Depends on: A-3.
Done when: `go build ./...` and `go test -race ./...` pass;
`grep -rn "time.AfterFunc\|time.After(" internal/core/quorum.go internal/sim/session.go`
returns nothing (AC1.1); `TestSessionRestartAndScale` (scaled election timeout within
[3000, 6000) ms and scaled latency within [360, 520) ms at `TimeScale: 2`) and
`TestSessionRestartsAfterClusterHalts` pass with their assertions unmodified (AC1.14).

### A-5: Group A verification

Files: none (fixes found here go back to the task that owns the file).
Satisfies: AC1.1, AC1.15, AC1.16, AC1.17.

- Run the full check (section 0) (AC1.16).
- AC1.1: the grep of A-4 returns nothing; `internal/sim/timer.go`, `ScaledTimer` and
  `NewScaledTimer` no longer exist.
- Scope (AC1.15): `git diff --stat BASE` and `git status --short` list no file under
  `web/`, `cmd/`, `internal/web/`, `internal/core/raft/`, not `internal/core/member.go`,
  and no file outside the list at the top of this group.
- Manual check, both modes, not an automated test (AC1.17): at the default factor the
  election countdown rings empty when the member turns candidate, and a reply packet leaves
  a member as the request packet lands on it, as before the change.

Depends on: A-1, A-2, A-3, A-4.
Done when: every command of the full check passes; the AC1.1 and scope checks hold; the
AC1.17 check has a recorded result for each mode (section 0: `pass`, `fail` or
`not run, open for the owner`) and none is `fail`.

**After this pull request (owner, outside the run).** PR 1 is pushed, opened, squash-merged
and deployed by the owner. No version bump, tag or release follows PR 1.

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
