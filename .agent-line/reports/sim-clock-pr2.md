---
item: sim-clock-pr2
result: done
---
## Summary

Group B (tasks B-1 to B-12) of
`docs/sim-clock/2026-11-15-sim-clock-pr2-plan.md`: viewers can pause, resume
and choose the slow-motion factor in both modes.

- B-1: `core.EventClock` (`"clock"`) and the `Paused` / `TimeScale` fields
  (no `omitempty`), mirrored in `web/src/sim/events.ts` with `paused` and
  `timeScale`.
- B-2: `sim.MinTimeScale = 1`, `sim.MaxTimeScale = 20`; `New` clamps
  `Config.TimeScale` (NaN becomes 1). `emit` is gone, so `election_timer` and
  `message` events carry simulated milliseconds; the `DurationMs` comment says
  so.
- B-3: `Session.Pause`, `Resume`, `SetTimeScale` and a locked `TimeScale`. The
  state change, the `Clock` call and the sink call share one critical section
  of `s.mu` (`changeClock`). They emit nothing before `Start` and do nothing
  once `Close` has begun. `Start` emits the first `clock` event under `s.mu`
  before launching `run`. `Snapshot` reads the quorum and the clock state
  together, then the statuses, and ends with the `clock` event (or returns it
  alone before the first cluster). `Clock.Pause`, `Resume` and `SetFactor` run
  no callbacks, so holding `s.mu` across them takes no quorum or member lock.
- B-4: tests only; no defect was found, so `session.go` has no B-4 change.
- B-5: `Hub.Publish` removes a subscriber whose buffer is full and closes its
  channel; `handleEvents` returns on a closed channel after writing what was
  buffered; the comments describe the disconnect.
- B-6: `POST /api/pause`, `/api/resume` (204, body ignored) and
  `/api/timescale` (pointer-field decode as in `handleKill`, 400 on failure or
  absence). `GET /api/events` still subscribes first; `GET /api/config` is
  unchanged.
- B-7: `quorumSim.pause()`, `resume()`, `setTimeScale(n)`; no-ops before
  `start`, and `setTimeScale` ignores a missing or non-number argument. The
  header comment lists them.
- B-8: `SimSource`, `ServerSource`, `WasmSource` and `QuorumSimApi` gain the
  three commands.
- B-9: new `web/src/sim/clock.ts` (`SimClock`). `main.ts` advances it at the
  top of `onEvent` and once per frame. It stamps `state.apply` and
  `packets.spawn` with `simClock.now`, and passes `simClock.now` to
  `Mochi.update` and `packets.update`. `PacketSystem.spawn` takes a required
  `startMs` before `onArrive`; `update(nowMs, camera)` derives `age` from the
  start. `concepts.ts` passes `performance.now()` at its three `spawn` calls
  and its `update` call. The `state.ts` comment changed.
  `web/src/scene/mochi.ts` is unchanged, so #29's rule (ring only while no
  leader is alive, no track ring, glowing arc) is kept as is. B-9 needed no
  departure from the plan for it.
- B-10: `Hud(root, sourceLabel, actions)`; `setClock(paused, timeScale)`
  replaces `setTimeScale`; a second `.controls` row with `慢動作`, presets
  `1×` to `20×` (`data-scale`, `active` only on an exact match), a spacer and a
  `data-action="pause"` button (`暫停` / `繼續`, `aria-pressed`). The HUD
  changes only in `setClock`. `slowmo` is clamped to 1-20. The
  `/api/config` fetch is removed. `style.css` adds the row spacing (desktop
  and phone) and the pressed `.btn` state.
- B-11: `--slowmo` help text and the two readme sentences.

The diff stays within Group B's file list plus this report.
`internal/sim/clock.go` and `internal/core/raft/` are unchanged.

## Tests run

Go tests (all in the full check below, `go test -race ./...`):

| Criterion | Evidence |
| --- | --- |
| AC2.1 | `TestClockCommands` (`internal/sim/session_test.go`) |
| AC2.2 | `TestFirstEventIsClock` (three subtests, including no `election_started` in 4 s when paused before `Start`), `TestNewLimitsTimeScale` (NaN → 1, 5000 → 20, 50 → 20) |
| AC2.3 | `TestCommandsAfterClose` |
| AC2.4 | `TestDurationsAreSimulated` (TimeScale 1, then after `SetTimeScale(5)`), `TestSessionRestartAndScale` (TimeScale 2 now expects [1500, 3000) and [180, 260); snapshot of `MaxMembers + 2`) |
| AC2.5 | `TestPauseSilencesSession` |
| AC2.6 | `TestCommandsWhilePaused` |
| AC2.7 | `TestAutoRestartWaitsWhilePaused` |
| AC2.8 | `TestSnapshotShapes` |
| AC2.9 | `TestClockEventOrder` |
| AC2.10 | `TestClockCommandValidation` (`internal/web/server_test.go`) |
| AC2.11 | `TestEventStreamSnapshotEndsWithClock`; `TestEventStreamStartsWithSnapshot` and `TestConfig` unmodified and passing |
| AC2.12 | `TestClockEventsConverge` |
| AC2.13 | `TestHubDisconnectsFullSubscriber` |
| AC2.14 | `internal/core/event_contract_test.go` passes; `events.ts` contains `"clock"`, `paused`, `timeScale` |

- `go test -race -count=4 ./internal/sim/ ./internal/web/`: passed (flakiness
  check of the timing tests).
- Plan greps: in `web/src/main.ts` every `performance.now()` is the argument
  of `simClock.advance(` (two occurrences); `grep -rn "packets.update(dt"
  web/src` and `grep -rn "api/config" web/src` print nothing; `Hud` has no
  `setTimeScale` and no factor parameter.
- Full check (section 4.1) run before the critic review on the implementation
  commit: every step exited 0. It is run again on the tip; its results are in
  the pull request body.

Headless browser checks (Playwright with the preinstalled Chromium, against
`quorum serve` built from this branch and `vite preview --mode wasm` of
`dist-pages`, with `?ao=0`; Google Fonts were unreachable, so fallback fonts
were used). These cover only what the DOM shows; 14 of 14 passed, with no page
errors:

- AC2.15, HUD part, both modes: `暫停` turns into `繼續` with
  `aria-pressed="true"`, and the source line reads
  `<label> · 已暫停 · 慢動作 <n>x`; resuming restores `暫停`.
- AC2.19, HUD and term part, both modes. While paused, a member-count change
  (5 members in server mode, 7 in WebAssembly mode) and `重新開局` started the
  new cluster, which stayed paused with the term at 0 for 4 s at 1x (an
  election would start within 3 s). After `繼續` the term rose above 0.
  WebAssembly `?slowmo=20` and `?slowmo=99` start at `20×`, and no `slowmo`
  starts at `3×`.
- AC2.20, server mode, as separate browser instances (two pages in one
  headless browser starve each other under software WebGL). A pause from one
  showed in the other, and so did a factor change from the second. A viewer
  opened while paused showed `已暫停 · 慢動作 20x` and `20×` at once.
- Server mode, outside the listed criteria: a factor of 2.5 set through
  `/api/timescale` marks no preset active.
- AC2.21, both modes, running and paused: at 1280x800 and at 375x667 the
  title card's `scrollWidth` equals its `clientWidth` (rows 346/346 and
  325/325). No button in rows 1 or 2 is clipped or outside its row. At
  375x667 the title card ends at y=263 and the dock starts at y=609.

Not run (listed under `## Unresolved` in the pull request): the visual parts of
AC2.15 (packets and rings freeze, decorative motion continues, the same
packets continue), AC2.16, AC2.17, AC2.18 and the concepts-page check. They
need a person watching the 3D scene; the scene state is not observable from
the DOM.

## Questions
