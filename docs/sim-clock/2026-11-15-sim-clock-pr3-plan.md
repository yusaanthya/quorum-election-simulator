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

## Group C: PR 3, automatic slow motion during the vote exchange

Plan file: `2026-11-15-sim-clock-pr3-plan.md`.
Base: the SHA of `main` the run's branch was cut from (`BASE`, section 0). That `main`
contains pull request 2, squash-merged; the run does not start before that merge.
Ends as: pull request 3.
Files this group may touch: `internal/core/observer.go`, `internal/sim/session.go`,
`internal/sim/session_test.go`, `internal/web/server.go`, `internal/web/server_test.go`,
`cmd/wasm/main.go`, `web/src/sim/events.ts`, `web/src/sim/source.ts`,
`web/src/sim/clock.ts`, `web/src/ui/hud.ts`, `web/src/main.ts`, and `web/src/style.css`
only if row 3 needs a rule that rows 1 and 2 do not already provide.

### C-1: `factor` and `autoSlow` on the `clock` event, in Go and in the TypeScript mirror

Files: `internal/core/observer.go`, `web/src/sim/events.ts`.
Satisfies: 6.2 (event fields).

- Go: `Event` gains `Factor float64` as `json:"factor"` (effective factor) and
  `AutoSlow bool` as `json:"autoSlow"`, set on `clock` events only.
- TypeScript: `SimEvent` gains `factor: number` and `autoSlow: boolean`.
- This is the first front-end task of the run: `npm ci` in `web/` comes before its check
  (section 0).

Depends on: none (this group's base only).
Done when: `go build ./...` passes; `npx tsc --noEmit -p .` passes in `web/`; `core.Event`
and `SimEvent` list the same fields.

### C-2: Session switch for automatic slow motion; every `clock` event carries four fields

Files: `internal/sim/session.go`, `internal/sim/session_test.go`;
`internal/web/server_test.go` only if one of its tests already on `main` needs the
adjustment of the last bullet.
Satisfies: 6.2 (`SetAutoSlow`; all four fields on every `clock` event, including the
initial one and the one in `Snapshot()`), A4 (on by default), A9; AC3.6.

- `autoSlow` (initially `true`) lives under `s.mu`. `SetAutoSlow(enabled)` behaves like
  `Pause` before `Start`, while running (always emits) and after `Close` has begun (5.2).
- Every `clock` event sets `Paused`, `TimeScale`, `Factor` and `AutoSlow`. In this task no
  slow window exists yet, so the effective factor equals the chosen factor.
  `TimeScale()` still returns the chosen factor.
- Tests: the initial `clock` event and the one ending `Snapshot()` have
  `factor == timeScale` and `autoSlow: true`; `SetAutoSlow(false)` emits `autoSlow: false`;
  nothing is emitted before `Start()` or after `Close()`; AC3.6 (after
  `SetAutoSlow(false)`, `SetTimeScale(4)` and `Restart(0)` the snapshot's `clock` event has
  `autoSlow: false` and `timeScale: 4`).
- A test already on `main` (from PR 2) that compares a whole `clock` event is updated for
  the two new fields; no assertion on `paused` or `timeScale` is weakened (the summary
  lists each such change).

Depends on: C-1.
Done when: `go build ./...` passes; `go test -race ./internal/sim/ ./internal/web/` passes
with the tests above.

### C-3: Slow window opens on `election_started` and ends by time

Files: `internal/sim/session.go`, `internal/sim/session_test.go`;
`internal/web/server_test.go` only if one of its tests already on `main` needs the
adjustment of the last bullet.
Satisfies: A4 (multiplier), A5, 6.1 (constants, state, "Open or extend", "End by time",
"Effective factor", the resulting order on the stream), E11; AC3.1, AC3.2, AC3.3.

- Constants `electionSlowdown = 3` and `electionSlowWindow = 600 * time.Millisecond`.
- Under `s.mu`: whether a window is open and its end as a simulated time. One clock timer
  for the window, created stopped in `New` (`NewTimer` followed by `Stop`).
- `emit` forwards every event to the sink without taking `s.mu`. For `election_started`
  only, after forwarding, it takes `s.mu` and, unless the session is closed, marks the
  window open, stores the end (`clock.Now() + electionSlowWindow`) and then resets the
  window timer, in that order.
- `run` gains a `select` case on the window timer; it closes the window only if
  `clock.Now()` has reached the stored end. No `Session` code runs in a clock callback.
- Effective factor: `chosen x electionSlowdown` when `autoSlow` is on and a window is open,
  else `chosen`. Whenever opening or ending a window changes it, the session calls
  `Clock.SetFactor` and emits a `clock` event in the same critical section. Extending an
  open window emits nothing. The window is tracked whether or not `autoSlow` is on.
  `Pause`, `Resume`, `SetTimeScale` and `SetAutoSlow` apply the effective factor.
- Tests: AC3.1 (the `clock` event with `factor: 3` after the first `election_started`, none
  before it except the initial one, and the return to `factor: 1` between 1750 ms and
  2800 ms after the latest `election_started`); AC3.2 (the window ends while the lone
  survivor is still `Candidate`); AC3.3 (with `SetAutoSlow(false)` no `clock` event has
  `factor != timeScale` through the next election).
- Where a test already on `main` (from PR 2) assumed that only commands emit `clock`
  events, it is adjusted to ignore window events without weakening what it asserts (the
  summary lists each change).

Depends on: C-2.
Done when: `go build ./...` passes; `go test -race ./internal/sim/ ./internal/web/` passes
with one test for each of AC3.1, AC3.2 and AC3.3 as those criteria state them.

### C-4: Slow window ends when the cluster is replaced; pause and close during a window

Files: `internal/sim/session.go`, `internal/sim/session_test.go`.
Satisfies: 6.1 ("End by replacement"; the window is measured on the clock; no `clock` event
after `Close`), A9, E3, E10; AC3.4, AC3.5, AC3.7.

- When a cluster is replaced (manual or automatic restart), after the old quorum's `Stop()`
  has returned and in the same `s.mu` critical section that creates the next quorum, the
  session stops the window timer and closes the window; if that changes the effective
  factor it calls `Clock.SetFactor` and emits the `clock` event there, so it precedes the
  new `quorum_started`.
- Tests: AC3.4 (window frozen by a pause: `SetTimeScale(4)` gives `factor: 12`,
  `SetAutoSlow(false)` gives 4, `SetAutoSlow(true)` gives 12 again, and no other `clock`
  event arrives in 3 s of pause); AC3.5 (restart during a paused window: the `clock` event
  with `factor == timeScale` precedes the new `quorum_started`, the new snapshot agrees,
  and after `Resume()` no slowed `clock` event precedes the next `election_started`);
  AC3.7 (`Close()` during a window returns and the sink stays silent for 2.5 s).

Depends on: C-3.
Done when: `go build ./...` passes; `go test -race ./internal/sim/` passes with one test for
each of AC3.4, AC3.5 and AC3.7 as those criteria state them.

### C-5: `autoslow` command in the local server and the WebAssembly API

Files: `internal/web/server.go`, `internal/web/server_test.go`, `cmd/wasm/main.go`.
Satisfies: 6.2 (server, WebAssembly), E12; AC3.8.

- `POST /api/autoslow` with body `{"enabled": <bool>}`: 204, or 400 under the request
  contract of 5.4 (the field must be a JSON boolean).
- `quorumSim.setAutoSlow(enabled)`: synchronous; ignored before `start` or when the
  argument is not a boolean. The header comment lists it.
- Test AC3.8: 204 for `{"enabled": false}` and `{"enabled": true}`; 400 for an empty body,
  `{}`, `nope`, `{"enabled": null}`, `{"enabled": 1}` and `{"enabled": "true"}`.

Depends on: C-2.
Done when: `go build ./...`, `GOOS=js GOARCH=wasm go vet ./cmd/wasm` and
`go test -race ./internal/web/` pass, with the AC3.8 test.

### C-6: `SimSource.setAutoSlow` and the effective factor in `SimClock`

Files: `web/src/sim/source.ts`, `web/src/sim/clock.ts`.
Satisfies: 6.2 (`SimSource`, `SimClock`), E2.

- `SimSource` gains `setAutoSlow(enabled: boolean): void`. `ServerSource` posts
  `{"enabled": <bool>}` to `/api/autoslow`; `WasmSource` calls `setAutoSlow`;
  `QuorumSimApi` gains the signature.
- `SimClock` gains `factor` (initially 1), copied from `clock` events; `advance` divides by
  `factor` instead of `timeScale`.

Depends on: C-1, C-5.
Done when: `npx tsc --noEmit -p .` passes in `web/`.

### C-7: HUD row 3 with the automatic slow motion switch and the election suffix

Files: `web/src/ui/hud.ts`, `web/src/main.ts`, and `web/src/style.css` only if row 3 needs
a rule that rows 1 and 2 do not already provide.
Satisfies: 6.2 (`HudActions`, `Hud.setClock`, HUD row 3, source-line suffix), the layout
table of 5.6 for row 3, A11. It is what AC3.9 to AC3.11 observe.

- `HudActions` gains `setAutoSlow(enabled: boolean): void`. `Hud.setClock` becomes
  `setClock(paused, timeScale, factor, autoSlow)`.
- A third `.controls` row with a button `data-action="auto-slow"` labelled
  `選舉時自動放慢`, `aria-pressed` equal to `autoSlow`; a click calls
  `actions.setAutoSlow(!autoSlow)`. The button changes only in `setClock`.
- The preset group keeps marking the chosen factor. When `factor` differs from
  `timeScale` the source line appends `（選舉中 <factor>x）`.
- `main.ts`: the new action is wired to the source; a `clock` event calls
  `hud.setClock(e.paused, e.timeScale, e.factor, e.autoSlow)`.

Depends on: C-6.
Done when: `npx tsc --noEmit -p .` and `npm run build` pass in `web/`.

### C-8: Group C verification

Files: none (fixes found here go back to the task that owns the file).
Satisfies: AC3.12, and the manual or headless criteria AC3.9 to AC3.11.

- Run the full check (section 0) (AC3.12).
- Scope (AC3.12): `git diff --stat BASE` and `git status --short` list no file under
  `internal/core/raft/`, not `internal/core/member.go`, and no file outside the list at the
  top of this group.
- Manual or headless checks, not automated tests:
  - AC3.9, both modes: at the default factor an election shows `（選舉中 9x）`, vote packets
    fly visibly slower than heartbeats did, and the suffix disappears about 5.4 s later
    whether or not a leader was elected; packets in flight change speed without jumping.
    In a cluster that cannot elect a leader (3 members, 2 offline), checked on the event
    feed: the suffix disappears about 5.4 s after each `發起選舉` line while the survivor is
    still labelled `候選人`, and the next `發起選舉` line (or the `選舉失敗太多次` line)
    follows 8 to 13 s after the previous one.
  - AC3.10, manual, both modes: with `選舉時自動放慢` off, elections run at the chosen
    factor and the suffix never appears; switching it on restores AC3.9; in server mode a
    second tab reflects the switch.
  - AC3.11: the layout criterion of the spec's AC2.21 holds for rows 1 to 3: at 1280 px
    wide and at 375 x 667 no horizontal overflow (the card's `scrollWidth` equals its
    `clientWidth`), no button text clipped, and at 375 x 667 the title card does not
    overlap the bottom dock.

Depends on: C-1, C-2, C-3, C-4, C-5, C-6, C-7.
Done when: every command of the full check passes; the scope check holds; each of AC3.9 to
AC3.11 has a recorded result for every mode it names (section 0: `pass`, `fail` or
`not run, open for the owner`) and none is `fail`.

**After this pull request (owner, outside the run).** PR 3 is merged and deployed by the
owner. No release follows PR 3 on its own; `v0.5.0` comes after PR 4.

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
