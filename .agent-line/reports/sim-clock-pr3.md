---
item: sim-clock-pr3
result: done
---
## Summary

Group C (tasks C-1 to C-8) of
`docs/sim-clock/2026-11-15-sim-clock-pr3-plan.md`: elections slow down
automatically.

- C-1: `core.Event` gains `Factor float64` (`json:"factor"`, the effective
  factor) and `AutoSlow bool` (`json:"autoSlow"`). `SimEvent` in
  `web/src/sim/events.ts` gains `factor` and `autoSlow`.
- C-2: `Session.SetAutoSlow(enabled)` goes through the same `changeClock` path
  as `Pause`. Before `Start` it changes the state and emits nothing. While
  running it always emits. Once `Close` has begun it does nothing.
  `autoSlow` starts `true`. Every `clock` event carries `paused`, `timeScale`,
  `factor` and `autoSlow`, including the initial one and the one `Snapshot()`
  ends with. `TimeScale()` still returns the chosen factor.
- C-3: the constants are `electionSlowdown = 3` and
  `electionSlowWindow = 600 * time.Millisecond`. `s.mu` guards `autoSlow`, the
  open flag and the window end. The window timer is created stopped in `New`.
  Each `election_started` is forwarded first. Then, under `s.mu` and unless
  the session is closed, the window end is stored as
  `clock.Now() + electionSlowWindow`, the timer is reset, and the window is
  opened, in that order. `run` gains a `select` case on the window timer that
  closes the window only once `clock.Now()` has reached the stored end. The
  effective factor is `chosen x 3` while `autoSlow` is on and a window is
  open, and `chosen` otherwise. When opening or ending a window changes the
  effective factor, `setWindowLocked` calls `Clock.SetFactor` and emits a
  `clock` event in the same critical section. Extending an open window emits
  nothing. `SetTimeScale` and `SetAutoSlow` apply the effective factor.
- C-4: at the top of each cluster generation in `run`, in the `s.mu`
  critical section that creates the next quorum, the window timer is stopped
  and the window closed. That point is after the old quorum's `Stop()` has
  returned. The resulting `clock` event therefore comes before the new
  `quorum_started`, which `q.Start()` emits after `s.mu` is released.
- C-5: `POST /api/autoslow` with `{"enabled": <bool>}` decodes into a
  `*bool`. It returns 204, or 400 on a decode failure or a missing field.
  `quorumSim.setAutoSlow(enabled)` ignores calls before `start` and
  non-boolean arguments. The header comment lists it.
- C-6: `SimSource` gains `setAutoSlow`. `ServerSource` posts to
  `/api/autoslow`. `WasmSource` and `QuorumSimApi` call `setAutoSlow`.
  `SimClock` gains `factor` (initially 1), copied from `clock` events, and
  `advance` divides by it.
- C-7: `HudActions.setAutoSlow`. `Hud.setClock` becomes
  `setClock(paused, timeScale, factor, autoSlow)`. A third `.controls` row
  holds the `data-action="auto-slow"` button `選舉時自動放慢`, whose
  `aria-pressed` equals `autoSlow` and which changes only in `setClock`.
  Clicking it calls `setAutoSlow(!autoSlow)`. The presets still mark the chosen
  factor. While `factor != timeScale` the source line appends
  `（選舉中 <factor>x）`. `main.ts` wires the action and passes the two new
  fields. `style.css` is unchanged: the existing `.controls + .controls` and
  `.btn[aria-pressed="true"]` rules cover row 3.

Difference from the plan because of `main`: the plan and the spec say "`emit`
forwards every event". `main` has no `emit` since PR 2. Events are forwarded
by the observer closure in `run`, so the window opens there, after the
forwarding. The closure still returns early for a retired cluster.

Existing tests changed (no assertion on `paused` or `timeScale` was weakened):

- `clockEvent(paused, scale)` in `session_test.go` now builds the full event
  with `factor == timeScale` and `autoSlow: true`. `TestClockCommands`,
  `TestFirstEventIsClock` and `TestSnapshotShapes` therefore also assert the
  two new fields of the initial, command and `Snapshot()` clock events.
- `TestClockEventOrder` (AC2.9) counts the command events through
  `commandClocks`. That helper drops only events that change `factor` and no
  other field, which no command emits. The exact count (2402) and the
  last-event-equals-`Snapshot()` check are unchanged.
- `eventLog` also records the wall time of each event (for AC3.1 and AC3.2).
- No `internal/web` test needed a change.

## Tests run

Evidence per criterion:

| Criterion | Evidence | Result |
| --- | --- | --- |
| C-1, AC2.14 mirror | `internal/core/event_contract_test.go` | pass |
| C-2 (initial and `Snapshot()` clock carry four fields; `SetAutoSlow` before `Start`, running, after `Close`) | `TestSetAutoSlow`, `TestFirstEventIsClock`, `TestSnapshotShapes`, `TestClockCommands` | pass |
| AC3.1 | `TestElectionSlowsClock` | pass |
| AC3.2 | `TestSlowWindowEndsWithCandidateStanding` | pass |
| AC3.3 | `TestAutoSlowOffKeepsFactor` | pass |
| AC3.4 | `TestPauseFreezesSlowWindow` | pass |
| AC3.5 | `TestRestartEndsSlowWindow` | pass |
| AC3.6 | `TestAutoSlowSurvivesRestart` | pass |
| AC3.7 | `TestCloseDuringSlowWindow` | pass |
| AC3.8 | `TestAutoSlowValidation` (`internal/web`) | pass |
| `scripts/web-import-direction.test.mjs` | `node --test scripts/*.test.mjs` | pass |
| AC3.12, full check | see below | pass |
| AC3.12, scope | `git diff --stat <base>` lists only the 11 Group C files (`cmd/wasm/main.go`, `internal/core/observer.go`, `internal/sim/session.go`, `internal/sim/session_test.go`, `internal/web/server.go`, `internal/web/server_test.go`, `web/src/main.ts`, `web/src/sim/clock.ts`, `web/src/sim/events.ts`, `web/src/sim/source.ts`, `web/src/ui/hud.ts`). There is nothing under `internal/core/raft/` and no `internal/core/member.go`. `git status --short` is empty | pass |

Full check, on the implementation commit, from the repository root:

- `gofmt -l cmd internal` printed nothing
- `node --test scripts/*.test.mjs`, `go build ./...`, `go vet ./...`,
  `GOOS=js GOARCH=wasm go vet ./cmd/wasm` and `go test -race ./...` exit 0
- in `web/`: `npm ci`, `npx tsc --noEmit -p .`, `npm run build:pages` and
  `npm run build` exit 0

`go test -race -count=4 ./internal/sim/` also passed, as a flakiness check
of the timing tests.

Headless and stream checks of the manual criteria. These used Chromium with
software WebGL, the local server built from this branch, and the
`dist-pages` build under `vite preview`.

- AC3.11, layout: pass in both modes. At 1280 x 800 and at 375 x 667 the
  title card has three `.controls` rows, and its `scrollWidth` equals its
  `clientWidth` (386/386 and 353/353). No button's text is clipped, and the
  card does not overlap the dock. Row 2 (PR 2, unchanged here) is wider than
  its box by 9 px at 1280 px, but the card itself does not overflow.
- AC3.9, server mode, Go side, read from the raw SSE stream at the default
  factor: pass for the timing. In a 3-member cluster with 2 members offline,
  every `election_started` is followed at once by `clock` with `factor: 9`.
  `factor: 3` follows 5.40 s later each time, while the survivor is still a
  candidate. Consecutive `election_started` events of the survivor are 12.5,
  10.6, 9.2 and 9.6 s apart, within 8 to 13 s.
- AC3.9, page: partial. In both modes the source line shows `（選舉中 9x）`.
  At the end of every suffix span the survivor's roster entry is still
  `candidate`. In server mode the event feed shows `發起選舉` lines 10.1 to
  10.3 s apart. The suffix durations the headless page saw ranged from 3.5 to
  7.4 s, and in WebAssembly mode the `發起選舉` lines were 13.9 to 15.0 s
  apart. The headless page ran a software renderer on a 4-core container and
  was starved of CPU, so these timings are not conclusive either way.
- AC3.10, server mode: pass (headless, two tabs). Clicking `選舉時自動放慢`
  turned `aria-pressed` to `false` in both tabs. No suffix appeared through
  an election that followed a restart. Clicking it again turned
  `aria-pressed` back to `true` in both tabs. On the raw stream, with the
  switch off, two elections forced by taking the leader offline produced no
  `clock` event with `factor != timeScale`.

## Questions
