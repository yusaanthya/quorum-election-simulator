# Requirements: controllable simulation clock ("plan A")

Repository: the repository root (Go module
`github.com/Anthya1104/quorum-election-cli`, Go 1.24.1; front end in `web/`, Vite + TypeScript +
three.js). Base commit: `main` at `6bb8170` (release `v0.3.0` is tagged one commit earlier).
All durable artifacts (spec, plan, code comments, commits, PR text) are written in English.

## Problem (owner's words, summarised)

The visualizer slows the whole simulation by one constant factor (`slowmo`, default 3, URL
parameter clamped to 1-10). The owner finds that elections still cannot be followed: the wait
before an election is long, but the vote exchange is over almost at once, so a viewer cannot
see who voted for whom, and can hardly ever observe two candidates campaigning at the same
time.

The cause is the ratio, not the factor. Unscaled constants today:

- election timeout 1500-3000 ms (`internal/core/member.go`)
- heartbeat interval 500 ms, quorum check 2000 ms (`internal/core/member.go`)
- one-way message latency 180-260 ms (`internal/sim/session.go`)

A whole vote round (request plus reply) takes about 0.4-0.5 s unscaled against a 1.5-3 s
wait, and a constant factor stretches both equally. Raft needs message round trips to stay
well under the election timeout, so the latency constant cannot simply be raised.

## Decision already made by the owner

Build "plan A": a controllable clock. All simulation timers and the simulated message
latency are driven by one clock owned by the simulation, which advances at
"real time divided by the current slow-motion factor" and can be paused. Members keep
running as goroutines. This is NOT a single-threaded discrete-event simulator; exact
reproducibility of event order is not required and is out of scope (that is "plan B",
deferred until a second consensus protocol is added).

The owner rejected the cheaper alternative of only changing the scale applied to newly
created timers during an election, because timers already running would not slow down and
could expire mid-election, creating candidates that would not otherwise exist. The new clock
must therefore apply a factor change to every pending timer and in-flight message at once.

## Existing code the design must build on

- `internal/core/timer.go`: `core.Timer` factory interface (`Now`, `NewTimer`, `NewTicker`)
  with `ITimer` / `ITicker`. Every member timer is created through it.
- `internal/sim/timer.go`: `ScaledTimer`, which multiplies every duration by a constant.
  The new clock replaces it.
- `internal/core/quorum.go` (around line 99): simulated latency is delivered with
  `time.AfterFunc` directly, bypassing `core.Timer`. It must go through the clock.
- `internal/core/raft`: pure Raft state machine. It must not change in PR 1-3. PR 4 may
  need a way to make a member's election timeout fire on command; prefer doing that in the
  runtime (`internal/core/member.go`), not in `raft.Node`.
- `internal/sim/session.go`: `Session` (`New`, `Start`, `Kill`, `Restart`, `Snapshot`,
  `Close`, `TimeScale`), shared by the local server (`internal/web`, SSE `/api/events`,
  `/api/config`, `POST /api/kill`, `POST /api/restart`) and the WebAssembly build
  (`cmd/wasm/main.go`, `globalThis.quorumSim.start/kill/restart`).
- Front end: `web/src/sim/source.ts` (`SimSource`, `ServerSource`, `WasmSource`),
  `web/src/sim/events.ts` (hand-written mirror of the Go event struct),
  `web/src/sim/state.ts`, `web/src/main.ts` (wiring, render loop),
  `web/src/scene/packets.ts` (message flight animation driven by `durationMs`),
  `web/src/scene/mochi.ts` (election countdown ring driven by `timerStart` /
  `timerDurationMs`), `web/src/ui/hud.ts` (shows "slow motion 3x", not adjustable).
- The CLI `play` command uses the real timer and must keep its current behaviour.

## Scope: four pull requests, in this order

Each PR must be mergeable and revertible on its own (the repository squash-merges, so one
PR is one commit on `main`; every merge to `main` deploys the WebAssembly site to
Cloudflare Pages automatically).

### PR 1: controllable clock, no visible change

- Replace `ScaledTimer` with the controllable clock and route message latency through it.
- The factor stays fixed at the configured value (default 3). No new commands, no event
  format change, no front-end change.
- Observable behaviour must match today's: same timer durations as seen by the viewer,
  same event stream shape.
- The clock has unit tests covering: a pending timer rescales when the factor changes;
  pause stops every timer, ticker and in-flight message and resume continues them with the
  remaining time preserved; timers that were due in a given order still fire in that order
  after a factor change. `go test -race ./...` must pass.

### PR 2: pause and speed control (Go and front end together) -> release v0.4.0

- New commands, available in BOTH modes (local server and WebAssembly): pause, resume, set
  factor. They go through `SimSource` so the UI code does not care about the mode.
- The viewer must be able to tell the clock state at any time, including when a page
  connects mid-run in server mode (snapshot) and after a restart.
- Front-end animations follow the simulation clock: message flights and election countdown
  rings freeze while paused and change speed immediately when the factor changes, without
  jumping. Purely decorative motion (breathing, spinning circles, motes) may keep running.
- HUD: a pause/resume control and a way to choose the factor. The `slowmo` URL parameter
  keeps working and sets the initial factor.
- Kill and restart must still work while paused.
- Go and front-end changes ship in the same PR because the WebAssembly simulation is built
  and deployed together with the page.

### PR 3: automatic slow motion during elections

- While an election is in progress the simulation runs slower than the factor the viewer
  chose, and returns to the chosen factor once the election is decided.
- It can be switched off from the HUD.
- It must work in both modes.

### PR 4: scenario "two candidates at once" -> release v0.5.0 (after PR 3 and PR 4)

- A HUD control that makes two members start an election at the same simulated instant,
  so the viewer can watch a split vote: both candidates use the same term, each follower
  votes for whichever request reaches it first, and if nobody reaches a majority the next
  timeout starts a new term.
- Works in both modes.

## Assumptions made by the main agent (the owner has not confirmed these; the spec must
## list them as assumptions and may refine them)

- "Factor" keeps the existing meaning of `TimeScale`: larger is slower, 1 is real time.
- The selectable factor range grows beyond today's 1-10; at least up to 20.
- In server mode the clock is shared: pause and factor are global to the session, so every
  connected viewer sees the same state. No per-viewer playback.
- Automatic slow motion is on by default and multiplies the viewer's chosen factor.
- "Election in progress" means at least one live member is a candidate.
- For PR 4 the two members are chosen by the simulation among live members, not picked by
  the viewer.
- The front end has no test framework today. Adding one is out of scope; front-end
  verification is `tsc --noEmit`, `npm run build`, and headless-browser screenshots or a
  manual check. Go changes are unit-tested.

## Out of scope

- Plan B (single-threaded deterministic simulation, exact replay, stepping one event at a
  time).
- Showing who voted for whom with persistent markers, vote counters on candidates, term
  labels on packets, or per-candidate packet colours. Useful, but a separate change.
- Any second consensus protocol (Paxos, PBFT) or a protocol abstraction.
- Changes to the CLI `play` command or to `raft.Node` rules.
- Refactors not required by the items above.

## Constraints

- Smallest reviewable diff per PR; no speculative options or abstractions.
- `go test -race ./...`, `npx tsc --noEmit -p .` and `npm run build` (in `web/`) pass at
  the end of every PR. CI (`.github/workflows/ci.yml`) must stay green.
- The event format is consumed by a hand-written TypeScript mirror; any Go event change
  must update `web/src/sim/events.ts` in the same PR.

## Owner answers

### 2026-11-15: how long automatic slow motion lasts (round 1, Codex B1)

The owner chose: slow down only the vote exchange. Automatic slow motion covers a short,
fixed window of simulated time after an election starts (the round 1 draft's 600 simulated
milliseconds after the latest `election_started` is accepted), then the simulation returns
to the viewer's chosen factor even if a member is still a candidate. The owner does not want
the wait for the next election timeout to be slowed when nobody reaches a majority. This
replaces the PR 3 sentence "returns to the chosen factor once the election is decided" and
the assumption "election in progress means at least one live member is a candidate".
