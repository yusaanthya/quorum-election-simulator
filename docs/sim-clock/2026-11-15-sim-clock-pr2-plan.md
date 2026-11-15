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

## Group B: PR 2, pause and speed control

Plan file: `2026-11-15-sim-clock-pr2-plan.md`.
Base: the SHA of `main` the run's branch was cut from (`BASE`, section 0). That `main`
contains pull request 1, squash-merged; the run does not start before that merge.
Ends as: pull request 2. Go and front end ship together, because the WebAssembly simulation
is deployed with the page.
Files this group may touch: `internal/core/observer.go`, `internal/sim/session.go`,
`internal/sim/session_test.go`, `internal/web/server.go`, `internal/web/server_test.go`,
`internal/cobra/cobra.go`, `cmd/wasm/main.go`, `web/src/sim/events.ts`,
`web/src/sim/source.ts`, `web/src/sim/clock.ts` (new), `web/src/sim/state.ts`,
`web/src/main.ts`, `web/src/scene/packets.ts`, `web/src/concepts.ts`, `web/src/ui/hud.ts`,
`web/src/style.css`, `readme.md`. `internal/sim/clock.go` changes only if a test of this
group exposes a defect in it (the summary says so). `web/src/concepts.ts` is not in the
spec's file list for this pull request; B-9 says why it is here.

Inside the group the page is briefly out of step with the Go side: from B-2 the events
carry simulated milliseconds, and the page reads them as such from B-9. This is not visible
outside the pull request.

### B-1: `clock` event type and fields, in Go and in the TypeScript mirror

Files: `internal/core/observer.go`, `web/src/sim/events.ts`.
Satisfies: 5.2 (event format), the requirements constraint that an event change updates
`events.ts` in the same pull request; AC2.14.

- Go: `EventClock EventType = "clock"`; `Event` gains `Paused bool` as `json:"paused"` and
  `TimeScale float64` as `json:"timeScale"`, both without `omitempty`.
- TypeScript: `EventType` gains `"clock"`; `SimEvent` gains `paused: boolean` and
  `timeScale: number`.
- This is the first front-end task of the run: `npm ci` in `web/` comes before its check
  (section 0).

Depends on: none (this group's base only).
Done when: `go build ./...` passes; `npx tsc --noEmit -p .` passes in `web/`; `core.Event`
and `SimEvent` list the same fields (AC2.14, checked by reading both).

### B-2: Events carry simulated durations; the chosen factor is clamped to 1-20

Files: `internal/sim/session.go`, `internal/sim/session_test.go`,
`internal/core/observer.go` (the `DurationMs` comment).
Satisfies: A2, A8, 5.3 (constants, clamp in `New`, `emit`, `Config.TimeScale` comment), 5.2
(`DurationMs` comment); AC2.2 (the `TimeScale: 50` and `TimeScale: 5000` assertions), the
part of AC2.4 that updates `TestSessionRestartAndScale`.

- `MinTimeScale = 1`, `MaxTimeScale = 20`. `New` clamps `Config.TimeScale` to that range
  and turns NaN into `MinTimeScale`. The `Config.TimeScale` doc comment says "clamped to
  1-20".
- `emit` no longer multiplies `DurationMs`: `election_timer` and `message` events carry
  simulated milliseconds. The `DurationMs` comment in `observer.go` says so.
- Tests: `TestSessionRestartAndScale` (at `TimeScale: 2`) now expects an election timeout
  within [1500, 3000) ms and a latency within [180, 260) ms; the assertion on `main` since
  PR 1 that `TimeScale: 5000` reports 1000 becomes 20; `TimeScale: 50` reports 20.

Depends on: none (this group's base only).
Done when: `go build ./...` passes; `go test -race ./internal/sim/ ./internal/web/` passes
with the assertions above.

### B-3: Session pause, resume and factor commands, `clock` events and snapshot

Files: `internal/sim/session.go`, `internal/sim/session_test.go`.
Satisfies: 5.2 (rules Start, Before `Start`, Running, After `Close`, Order, Locks, and the
`Snapshot` paragraph), 5.3 (`Pause`, `Resume`, `SetTimeScale`, `TimeScale`), A3, A9, E5, E7,
E10; AC2.1, AC2.2, AC2.3, AC2.4, AC2.8.

- State `paused` and the chosen factor live in the session under the existing `s.mu`;
  `TimeScale()` reads under `s.mu`.
- `Pause`, `Resume`, `SetTimeScale(scale)` (clamped to [1, 20], NaN becomes 1): the state
  change, the `Clock` call and the sink call happen in one critical section of `s.mu`.
  While running, every call emits one `clock` event, also when it changes nothing. Before
  `Start` they change the state and the clock and emit nothing. Once `Close` has begun they
  change nothing and emit nothing.
- `Start` emits the initial `clock` event itself, under `s.mu`, before it launches `run`.
- `Snapshot()` ends with a `clock` event, and returns that event alone when no quorum
  exists. It reads the quorum reference and the clock state together under `s.mu`, releases
  `s.mu`, and only then asks the quorum for its statuses.
- `s.mu` is never held while a quorum lock or a member lock is acquired.
- Tests: AC2.1 (events and `TimeScale()` for `Pause`, `Resume`, `SetTimeScale` with 7, 0.2,
  99 and NaN; a second `Pause()` emits again); AC2.2 (first event is `clock`; commands
  before `Start()` emit nothing and shape the first event; paused before `Start()` gives no
  `election_started` in 4 s); AC2.3 (silence and unchanged `TimeScale()` after `Close()`);
  AC2.4 (at `TimeScale: 1` durations within [1500, 3000) and [180, 260), also after
  `SetTimeScale(5)`); AC2.8 (snapshot shapes). `TestSessionRestartAndScale` expects a
  snapshot of `MaxMembers + 2` events.

Depends on: B-1, B-2.
Done when: `go build ./...` passes; `go test -race ./internal/sim/ ./internal/web/` passes
with the tests above; `TestEventStreamStartsWithSnapshot` and `TestConfig` in
`internal/web` pass unmodified.

### B-4: Session tests for behaviour while paused and for event order

Files: `internal/sim/session_test.go`; `internal/sim/session.go` only where one of these
tests exposes a defect (the summary says which).
Satisfies: 5.3 (`Kill`, `Restart`, `Close` while paused; the automatic restart counts on
the clock), A9, E1, E3, T2; AC2.5, AC2.6, AC2.7, AC2.9.

- AC2.5: 200 ms after `Pause()` nothing but `clock` events reaches the sink for 700 ms;
  after `Resume()` `message` events arrive again.
- AC2.6: while paused `Kill(id)` gives `stopped`, `Restart(5)` gives `quorum_started` with
  5 members, `Snapshot()` still ends with a paused `clock` event, and `Close()` returns.
- AC2.7: while paused a 1-member session whose member was killed emits `quorum_ended` and
  no second `quorum_started` for at least `restartDelay + 1 s`; it arrives after `Resume()`.
- AC2.9: 8 goroutines issue the three commands 100 times each; after a final `Pause()` and
  200 ms the last recorded `clock` event equals the one at the end of `Snapshot()`.

Depends on: B-3.
Done when: `go test -race ./internal/sim/` passes, including one test for each of AC2.5,
AC2.6, AC2.7 and AC2.9 as those criteria state them.

### B-5: Hub disconnects a viewer whose buffer is full

Files: `internal/web/server.go`, `internal/web/server_test.go`.
Satisfies: A15, 5.4 (`Hub` overflow), E4; AC2.13.

- `Hub.Publish` removes a subscriber whose buffer is full and closes its channel instead of
  dropping the event. `unsubscribe` of a subscriber that was already removed is a no-op.
- `handleEvents` ends the response when it finds its channel closed, after writing what was
  buffered.
- The comments on `subscriberBuffer` and `Hub.Publish` describe the disconnect, not a drop.
- Test AC2.13: `subscriberBuffer + 1` events published to a hub whose only subscriber does
  not read; the channel yields exactly `subscriberBuffer` values and is then closed; a
  later `Publish` does not panic.

Depends on: none (this group's base only).
Done when: `go build ./...` passes; `go test -race ./internal/web/` passes with the AC2.13
test and the existing tests unmodified.

### B-6: Server endpoints for pause, resume and factor

Files: `internal/web/server.go`, `internal/web/server_test.go`.
Satisfies: 5.4 (endpoint table, request contract, `GET /api/events` ordering,
`GET /api/config`), A3, E12; AC2.10, AC2.11, AC2.12.

- `POST /api/pause` and `POST /api/resume`: body ignored, 204.
- `POST /api/timescale`: body decoded with `encoding/json` into a struct with one pointer
  field, as `handleKill` does; 400 when decoding fails or the field is absent; any finite
  number is accepted and clamped by the session; 204 on success.
- `GET /api/events` keeps subscribing first and writing the snapshot second; no sequence
  number is added. `GET /api/config` is not changed.
- Tests: AC2.10 (status codes for every listed body; `GET /api/config` reports 20 after
  500 and 1 after -3); AC2.11 (a client connecting after a pause receives `quorum_started`,
  three `status` events and a paused `clock` event as the fifth; the existing
  `TestEventStreamStartsWithSnapshot` is unmodified); AC2.12 (convergence after 200
  alternating pause and resume posts that end with a pause).

Depends on: B-3, B-5.
Done when: `go build ./...` passes; `go test -race ./internal/web/` passes with one test for
each of AC2.10, AC2.11 and AC2.12 as those criteria state them.

### B-7: WebAssembly API gains pause, resume and setTimeScale

Files: `cmd/wasm/main.go`.
Satisfies: 5.5.

- `globalThis.quorumSim` gains `pause()`, `resume()` and `setTimeScale(n)`. They call the
  session synchronously, like `restart`; they do nothing before `start`; `setTimeScale`
  with a missing or non-number argument does nothing.
- The file's header comment lists the new calls. `start({members, timeScale}, onEvent)` is
  not changed.

Depends on: B-3.
Done when: `GOOS=js GOARCH=wasm go vet ./cmd/wasm` and `go build ./...` pass; the header
comment lists the three calls. Behaviour in the browser is checked in B-12.

### B-8: `SimSource` gains pause, resume and setTimeScale

Files: `web/src/sim/source.ts`.
Satisfies: 5.6 (`source.ts`).

- `SimSource` gains `pause(): void`, `resume(): void`, `setTimeScale(scale: number): void`.
- `ServerSource` posts to `/api/pause`, `/api/resume` and `/api/timescale` (body
  `{"timeScale": <number>}`) with the existing `post` helper.
- `WasmSource` calls the functions of B-7; `QuorumSimApi` gains the three signatures.

Depends on: B-6, B-7.
Done when: `npx tsc --noEmit -p .` passes in `web/`.

### B-9: `SimClock` mirror drives countdown rings and packets

Files: `web/src/sim/clock.ts` (new), `web/src/scene/packets.ts`, `web/src/sim/state.ts`
(comment only), `web/src/main.ts`, `web/src/concepts.ts`.
Satisfies: 5.6 (simulation clock mirror; the `onEvent` and `renderLoop` items of `main.ts`;
`state.ts`; `packets.ts`), A8 on the page side, E2, E6, T3, T4. It is what AC2.15 to AC2.18
observe.

- `SimClock` with `paused` (false), `timeScale` (1), `now` (0), `advance(wallNowMs)` and
  `apply(e)` as 5.6 defines them. It is the only place the page keeps simulated time.
- `main.ts`: `onEvent` starts with `simClock.advance(performance.now())`; a `clock` event
  is handled next with `simClock.apply(e)` and returns (B-10 adds the HUD call);
  `state.apply(e, simClock.now)`; `packets.spawn` receives `simClock.now` as the packet's
  start. `renderLoop` calls `simClock.advance(performance.now())`, then passes
  `simClock.now` to `b.update(...)` and to `packets.update(simClock.now, stage.camera)`.
  Everything else keeps the wall-time `dt` and `t`. The mirror does not use the clamped
  `THREE.Timer` delta.
- `packets.ts`: a packet stores its start in milliseconds, given to `spawn` as a required
  parameter placed before the optional `onArrive`:
  `spawn(kind, granted, durationMs, from, to, startMs, onArrive?)` (the position is a plan
  choice; required, so that the type checker reports any caller that passes no start).
  `update(nowMs, camera)` sets `age = (nowMs - start) / 1000` instead of adding a delta.
  The rule that packets are not spawned while the tab is hidden stays.
- `concepts.ts` (a stated difference from the spec: 5.6 does not list this file). The
  dev-only concepts page (`web/concepts.html`, served by `npm run dev`, not part of either
  built site) is the second user of `PacketSystem`, and `web/tsconfig.json` type-checks it
  with the rest of `src`. It has no simulation and no `SimClock`; its time base is the
  page's wall clock in milliseconds. Its three `packets.spawn(...)` calls in `send()` pass
  `performance.now()` as `startMs`, and its render loop calls
  `packets.update(performance.now(), stage.camera)` instead of
  `packets.update(dt, stage.camera)`. Nothing else in the file changes. Its packets then
  fly for their 1800 ms and 1400 ms and land as today, measured in wall time instead of the
  frame delta clamped to 0.1 s.
- `state.ts`: only the `timerStart` comment changes (simulated milliseconds,
  `SimClock.now`). `web/src/scene/mochi.ts` is not changed.

Depends on: B-1, B-2, B-3.
Done when: `npx tsc --noEmit -p .` passes in `web/`; in `web/src/main.ts` every
`performance.now()` is the argument of `simClock.advance(`; `packets.ts` no longer adds a
frame delta to a packet's age; `grep -rn "packets.update(dt" web/src` returns nothing; in
`web/src/concepts.ts` each of the three `packets.spawn` calls and the `packets.update` call
passes `performance.now()` as stated above.

### B-10: HUD row 2 with factor presets and a pause button

Files: `web/src/ui/hud.ts`, `web/src/style.css`, `web/src/main.ts`.
Satisfies: 5.6 (`hud.ts`, the layout table for row 2, `style.css`, and the `slowmo`, HUD
and `/api/config` items of `main.ts`), A2 (URL clamp), A10, A11. It is what AC2.15 and
AC2.19 to AC2.21 observe.

- `HudActions` gains `pause()`, `resume()`, `setTimeScale(scale)`. The constructor becomes
  `constructor(root, sourceLabel, actions)`. `setTimeScale(scale | null)` is replaced by
  `setClock(paused: boolean, timeScale: number)`.
- A second `.controls` row: label `慢動作`; a `.segmented` group of `1×`, `2×`, `3×`, `5×`,
  `10×`, `20×` (`data-scale`), the one equal to the current `timeScale` marked `active`,
  none when the value is not a preset; a spacer; a button `data-action="pause"` reading
  `暫停` while running and `繼續` while paused, with `aria-pressed`.
- The HUD changes only in `setClock`, never on click. The source line reads
  `<label> · 慢動作 <timeScale>x`, or `<label> · 已暫停 · 慢動作 <timeScale>x` while paused,
  and the label alone before the first `clock` event.
- `main.ts`: `slowmo` is clamped to 1-20 (default 3) and still passed to `WasmSource`; the
  `Hud` is built without a factor and with the three new actions wired to the source; a
  `clock` event also calls `hud.setClock(e.paused, e.timeScale)`; the `fetch("/api/config")`
  block is removed.
- `style.css`: only what row 2 needs (spacing between rows, the pressed state of a `.btn`),
  including the phone layout (`max-width: 640px`). Row 1 is not changed.

Depends on: B-8, B-9.
Done when: `npx tsc --noEmit -p .` and `npm run build` pass in `web/`;
`grep -rn "api/config" web/src` returns nothing; `Hud` has no `setTimeScale` method and no
factor parameter in its constructor.

### B-11: `--slowmo` help text and readme

Files: `internal/cobra/cobra.go`, `readme.md`.
Satisfies: 5.4 (`--slowmo` help text), 5.6 (`readme.md`), A2, A10.

- `--slowmo` help text: the initial factor, 1 to 20.
- `readme.md`: the `--slowmo` row says it is the initial factor, clamped to 1-20 and
  adjustable from the page; the `?members=5&slowmo=3` sentence mentions the 1-20 range.

Depends on: B-2.
Done when: `go build ./...` passes; both texts read as above; no other readme line changed.

### B-12: Group B verification

Files: none (fixes found here go back to the task that owns the file).
Satisfies: AC2.14, AC2.22, and the manual or headless criteria AC2.15 to AC2.21.

- Run the full check (section 0) (AC2.22).
- AC2.14: `core.Event` and `SimEvent` list the same fields; `events.ts` contains `"clock"`,
  `paused` and `timeScale`.
- Scope: `git diff --stat BASE` and `git status --short` list no file under
  `internal/core/raft/` (requirements: unchanged in PR 1 to 3) and no file outside the list
  at the top of this group.
- Manual or headless checks, not automated tests:
  - AC2.15, both modes: `暫停` freezes packets and rings, the button reads `繼續`, the
    source line contains `已暫停`, decorative motion continues; `繼續` continues the same
    packets from where they stopped.
  - AC2.16, both modes: switching `3×` to `20×` and to `1×` with packets and rings running
    causes no jump (T4) and the new speed applies from the next frame.
  - AC2.17, manual, both modes: after ten quick pause and resume clicks with the leader
    offline, the first candidate's ring empties within about half a second of the role
    change (T3).
  - AC2.18, manual, both modes: after 30 s hidden, rings are partly filled on the first
    frame and no burst of packets appears; in server mode a pause from a second tab is
    shown when the first tab returns.
  - AC2.19, manual, both modes: while paused, taking a member offline, `重新開局` and the
    member-count buttons work and the new cluster stays frozen and paused; in WebAssembly
    mode `?slowmo=20` starts at 20x with `20×` active and `?slowmo=99` is treated as 20.
  - AC2.20, manual, server mode: two tabs follow each other; a tab opened while paused
    shows the paused state and the chosen factor at once.
  - AC2.21: at 1280 px wide and at 375 x 667, rows 1 and 2 have no horizontal overflow
    (the card's `scrollWidth` equals its `clientWidth`), no button text is clipped, and at
    375 x 667 the title card does not overlap the bottom dock.
  - Concepts page (a plan check for the `concepts.ts` change of B-9; it has no spec
    criterion and one mode): with `npm run dev` in `web/`, `/concepts.html?theme=academy`
    shows envelopes, a heart and heartbeat dots leaving, flying and landing in a repeating
    cycle; no packet stays in the air and none piles up where it started.

Depends on: B-1, B-2, B-3, B-4, B-5, B-6, B-7, B-8, B-9, B-10, B-11.
Done when: every command of the full check passes; the AC2.14 and scope checks hold; each
of AC2.15 to AC2.21 and the concepts-page check has a recorded result for every mode it
names (section 0: `pass`, `fail` or `not run, open for the owner`) and none is `fail`.

**After this pull request (owner, outside the run).** After PR 2 is merged the owner
releases `v0.4.0` as A12 describes: a version-bump pull request (like #11), a README pointer
pull request (like #12) and an annotated tag on the version-bump commit. No task in this
plan edits `config.Version`. The next pull request's branch is cut from whatever `main` is
when its run starts, with or without those two release commits.

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
