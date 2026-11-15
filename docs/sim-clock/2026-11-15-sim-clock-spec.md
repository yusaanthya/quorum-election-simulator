# Spec: controllable simulation clock ("plan A")

Draft round 3. Sources: `requirements.md` (including its "Owner answers" section),
`spec_draft_round_2.md` and `spec_review_round_2.md` in this directory.
Repository: the repository root, module
`github.com/Anthya1104/quorum-election-cli`, Go 1.24.1, base `main` at `6bb8170`.
Section 11 maps every round 1 and round 2 finding to the text that resolves it.

## 1. Goal

Make elections watchable. Today one constant factor (`sim.Config.TimeScale`, default 3)
stretches the long pre-election wait and the short vote exchange equally. This work replaces
the constant-factor timer with one clock owned by the simulation that can be paused and
re-scaled at any time, exposes pause and speed to the viewer, slows the vote exchange
automatically, and adds a "two candidates at once" scenario.

Delivered as four pull requests, in order. Each is one squash commit on `main` and deploys the
WebAssembly site on merge.

| PR | Content | Viewer-visible |
| --- | --- | --- |
| 1 | `sim.Clock` replaces `sim.ScaledTimer`; message latency goes through it | no |
| 2 | pause, resume, set factor; front end follows the simulation clock | yes |
| 3 | automatic slow motion during the vote exchange | yes |
| 4 | "two candidates at once" scenario | yes |

Revert order. Each PR can be reverted with one `git revert` while it is the newest of the four
on `main`. Reverting an earlier one means reverting the later ones first, newest first: PR 2
needs PR 1's clock, PR 3 needs PR 2's `clock` event, and PR 4 places its button in the HUD row
PR 3 adds and touches lines adjacent to PR 3's in `SimSource`, `HudActions`, `QuorumSimApi`,
the WebAssembly API map and the server routes. Reading "revertible on its own" this way is a
decision of this spec (A16).

## 2. Terms

- **Simulated time**: the time the protocol sees. Protocol constants are expressed in it:
  election timeout 1500-3000 ms, heartbeat 500 ms, quorum check 2000 ms
  (`internal/core/member.go`), one-way latency 180-260 ms and `restartDelay` 2 s
  (`internal/sim/session.go`).
- **Wall time**: real time.
- **Factor**: wall time divided by simulated time. Larger is slower; 1 is real time. While
  not paused, simulated time advances by `wall elapsed / factor`.
- **Chosen factor** (`timeScale`): the factor the viewer selected.
- **Effective factor** (`factor`, PR 3): the factor the clock is actually running at. Equal
  to the chosen factor until PR 3.
- **Entry**: one pending timer, ticker or `AfterFunc` call on the clock.
- **Release**: the step, taken while the clock's lock is held, that takes a due entry out of
  the pending state. For a timer or ticker the value is sent on its channel in that same
  step. For an `AfterFunc` entry the callback is queued and runs after the lock is dropped.
  "Fires" in this document always means "is released".
- **Delivery delay**: the wall time between the session calling its sink with an event and
  the page's `onEvent` running for it (a synchronous call in WebAssembly mode, one SSE write
  in server mode).

## 3. Assumptions and decisions

Status of each item: **owner** = decided by the owner (requirements or owner answer);
**assumed** = an assumption the requirements list and the owner has not confirmed;
**decided here** = a choice this spec makes where the requirements are silent, also not
confirmed by the owner.

A1 (assumed). "Factor" keeps the meaning of `TimeScale`: larger is slower, 1 is real time.

A2 (assumed range; cap on the server flag decided here). The chosen factor range is **1 to
20** inclusive (`sim.MinTimeScale = 1`, `sim.MaxTimeScale = 20`). Fractional values are
accepted. From PR 2 the same clamp applies to `Config.TimeScale`, so
`quorum serve --slowmo 50` runs at 20 (today it has no upper bound). The `slowmo` URL
parameter clamp changes from 1-10 to 1-20.

A3 (assumed). In server mode the clock is shared by the session: pause, factor, automatic
slow motion and the PR 4 scenario are global, and every connected viewer sees the same
state. No per-viewer playback.

A4 (assumed; constant decided here). Automatic slow motion is on by default and multiplies
the chosen factor. The multiplier is the constant `electionSlowdown = 3` (default 3x becomes
9x). It is not configurable. There is no CLI flag or URL parameter for automatic slow
motion; it is switched only from the HUD.

A5 (**owner**, answer of 2026-11-15 in `requirements.md`). Automatic slow motion covers a
fixed window of `electionSlowWindow = 600 ms` of simulated time after the latest
`election_started`, then the simulation returns to the chosen factor **even if a member is
still a candidate**. The wait for the next election timeout is not slowed when nobody
reaches a majority. This answer replaces the requirement sentence "returns to the chosen
factor once the election is decided" and the assumption "election in progress means at least
one live member is a candidate".
Consequence decided here: the session does not track candidates at all. The window ends only
when its 600 ms have passed or when the cluster is replaced (section 6.1). An election
decided earlier (a winner needs 360-520 ms) stays slowed until the window ends, which shows
the winner's first heartbeats and the late replies at the slow speed.

A6 (assumed; rule decided here). For PR 4 the two members are chosen by the simulation, not
by the viewer: two live, non-leader, non-halted members that share the same current term
(rule in section 7.1).

A7 (assumed). The front end has no test framework and none is added. Front-end verification
is `npx tsc --noEmit -p .`, `npm run build`, `npm run build:pages` (what CI runs), and the
manual or headless-browser checks listed per PR. Go changes are unit-tested.

A8 (decided here). From PR 2, `durationMs` on `election_timer` and `message` events is in
**simulated** milliseconds (today: wall milliseconds, already multiplied by the factor). The
field name and type do not change. The only consumer is this repository's front end, which
ships in the same PR.

A9 (decided here). Pause state, chosen factor and (PR 3) the automatic slow motion switch
survive a cluster restart, manual or automatic. A restart does not resume or reset them.

A10 (decided here). The `slowmo` URL parameter sets the initial factor in WebAssembly mode
only, as today. In server mode the initial factor comes from `--slowmo`; a page load never
changes the shared session.

A11 (decided here). New HUD strings are zh-TW, like every existing HUD string. Code
comments, commits and PR text are English.

A12 (decided here). Releases are not part of the four PRs and no PR in this spec edits
`config.Version`. `v0.4.0` (after PR 2) and `v0.5.0` (after PR 3 and PR 4) follow the v0.3.0
pattern in this repository: two further small PRs by the owner (a version bump like #11, a
README pointer like #12) and an annotated tag on the version-bump commit.

A13 (decided here). Clock unit tests run against real time (no injected time source). The
clock accepts factors from 0.001 to 1000, so a test can make an entry certain to fire (tiny
factor) or certain not to fire (huge factor, or a paused clock) instead of merely likely.
Exact reproducibility of event order across runs is not required (plan B, out of scope).

A14 (decided here). Server mode is a local server (`quorum serve`, HUD label
`本機 Go server`). The front-end timing tolerances of section 8 assume a delivery delay of
at most 50 ms. A remote or throttled connection is not designed for.

A15 (decided here). A viewer whose SSE buffer overflows is disconnected instead of silently
losing events (section 5.4), so that no connected viewer can keep a stale clock state.

A16 (decided here). The requirement that each PR is "revertible on its own" is read as: each
PR can be reverted with one `git revert` while it is the newest of the four on `main`
(section 1). Reverting an earlier PR means reverting the later ones first, because each
builds on the one before it. PR 4 needs PR 3 only for the HUD row its button sits in and for
adjacent lines; its Go side does not use PR 3.

## 4. PR 1: controllable clock, no visible change

### 4.1 Behaviour

`sim.Clock` is the single source of time for a `Session`: every member timer and ticker,
every delayed message delivery, and the session's own restart delay are scheduled on it.
The factor is fixed at `Config.TimeScale`. Values below 1 become 1, as today. So that the
session can never hand the clock a factor it rejects (R1.10), NaN also becomes 1 and values
above 1000 become 1000; today both are passed through unchecked, and PR 2 lowers the cap to
20 (A2).

Nothing a viewer can see changes. One event field changes by a rounding step: `durationMs`
of a `message` event becomes `floor(latency in ms) x factor`, where today it is
`floor(latency x factor in ms)`. The new value is lower than today's by less than
`factor + 1` milliseconds (less than `factor` for a whole-number factor): under 3 ms at the
default factor 3, which is a fraction of one 60 fps frame, and under 1.2 % of the flight for
any factor (the shortest flight is 180 ms x factor). The delivery itself is scheduled from
the full-precision latency, so only the reported animation length differs. This is accepted
as not observable by a viewer, and the field changes meaning in PR 2 anyway (A8).
`election_timer` `durationMs` is unchanged (timeouts are whole milliseconds).

### 4.2 `sim.Clock` (new file `internal/sim/clock.go`; `internal/sim/timer.go` is deleted)

```go
type Clock struct { /* unexported */ }

func NewClock(factor float64) *Clock
func (c *Clock) Now() time.Time                 // simulated time
func (c *Clock) NewTimer(d time.Duration) core.ITimer
func (c *Clock) NewTicker(d time.Duration) core.ITicker
func (c *Clock) AfterFunc(d time.Duration, f func())
func (c *Clock) SetFactor(factor float64)
func (c *Clock) Pause()
func (c *Clock) Resume()
func (c *Clock) Stop()
```

`*Clock` implements `core.Timer`. All methods are safe for concurrent use. There are no
`Factor()` or `Paused()` getters: the session keeps the state it reports, and the tests
observe the clock through `Now()` and through what fires.

Rules:

R1.1 Durations. Every duration passed to `NewTimer`, `NewTicker`, `AfterFunc` and to `Reset`
on the returned objects is simulated time. Each entry stores a deadline in simulated time,
set to `Now() + max(d, 0)` when the entry is created or reset. A deadline is therefore never
earlier than the clock's `Now()` at the moment it is set.

R1.2 `Now()` returns the wall time at `NewClock` plus the simulated time elapsed since. It
never goes backwards and does not advance while paused or after `Stop`. The `time.Time`
value sent on a timer or ticker channel is `Now()` at the release; no code in this
repository reads it.

R1.3 `SetFactor` applies to every pending entry at once: the remaining simulated time of
each entry is unchanged, so its remaining wall time becomes `remaining x new factor`.
Simulated time is continuous across the change (no jump). `SetFactor` works while paused and
takes effect on resume.

R1.4 Pause. While the clock is paused no entry is released, including entries created while
paused. `Resume` continues with every entry's remaining simulated time preserved. `Pause`
when paused and `Resume` when running are no-ops. `Pause`, `SetFactor` and `Stop` take
effect at the moment they acquire the clock's lock: an entry released before that moment
stays released. Concretely, a value already sent on a timer or ticker channel can still be
received afterwards, and an `AfterFunc` callback already queued by a release still runs,
possibly after `Pause` has returned. No `Clock` method ever waits for a callback to start or
to finish.

R1.5 Release order. Entries are released in ascending order of simulated deadline; entries
with equal deadlines are released in the order in which their deadlines were set (creation,
`Reset`, or a ticker's rescheduling each count as setting the deadline). This holds across
any sequence of `SetFactor`, `Pause`, `Resume`. What the guarantee covers:

- channel sends happen in release order, and `AfterFunc` callbacks run one at a time in
  release order;
- between a channel send and a callback released in the same pass no order is guaranteed
  (the send happens under the lock, the callback after it);
- what a receiving goroutine does after a value was sent on its channel is scheduled by the
  Go runtime and is not ordered by the clock. Members remain goroutines; handling order
  across members is not guaranteed (plan B).

R1.6 Mechanism. The clock arms **one** real timer for the earliest pending deadline and,
when it fires, releases every due entry in the order of R1.5, runs the queued callbacks, and
repeats until nothing is due. One real timer per entry is not acceptable, because re-arming
them one by one can reorder near-equal deadlines. At most one such pass runs at a time: a
wake-up that finds a pass in progress returns at once, and the running pass looks again for
due entries, under the lock, before it finishes. The clock keeps no goroutine alive while
nothing is due, and arms no real timer while paused, stopped or empty. An entry created or
reset while a pass is running has a deadline no earlier than every entry already released
(R1.1), so it is released later, by the same pass if it is already due. The pending set may
be a slice with a linear scan (at most a few dozen entries).

R1.7 Channels. Timer and ticker channels have capacity 1 and are written without blocking,
always while the clock's lock is held. `Stop` and `Reset` on a timer or ticker run under the
same lock and discard a value that was sent earlier but not yet received. So after either
returns, a receive on `C()` cannot observe a value from before the call, and no later send
for the old deadline can happen. (`time.Timer` and `time.Ticker` behave this way under the
module's Go 1.24; `Member.apply` calls `electionTimer.Stop()` then `Reset()` without draining
and relies on it. A stale value would cause a spurious election.) `Stop` removes the entry
from the pending set. `ITimer.Stop` and `ITimer.Reset` return whether the timer was pending.
`Reset` on a timer or ticker that was stopped, or on a timer that has fired, makes it pending
again, and a ticker's `Reset(d)` also replaces its interval (`Member.Run` creates both leader
tickers, stops them, and resets them when the node becomes leader).

R1.8 Tickers. A ticker whose receiver is slow drops ticks rather than queueing or bursting:
when a tick is released and the channel is full the tick is lost. After a release the
ticker's next deadline is its previous deadline plus the smallest whole number of intervals
(at least one) that puts it later than `Now()`. Ticks are therefore counted from the
ticker's creation or last `Reset`, in simulated time.

R1.9 Callbacks. `AfterFunc` callbacks are called without any clock lock held. A callback may
call any `Clock` method. Callbacks must not block. There is no way to cancel an `AfterFunc`
entry; none is needed. The only callbacks in this spec are message deliveries (non-blocking
channel sends); no `Session` code runs inside a clock callback in any of the four PRs.

R1.10 Arguments and limits.

- `NewClock` and `SetFactor` panic unless the factor is finite and within
  [0.001, 1000] (`minFactor`, `maxFactor`). The session only passes values from 1 to 1000
  in PR 1 (4.1) and from 1 to 60 from PR 2 on (chosen factor up to 20, times 3 in PR 3).
- `NewTimer`, `Reset` on a timer, and `AfterFunc` with `d <= 0` are released at the next
  pass. `NewTicker` and `Reset` on a ticker panic when `d <= 0`, like `time.NewTicker`.
- The wall delay the real timer is armed with is computed in floating point and capped at
  one hour, so `remaining x factor` cannot overflow `time.Duration`. A wake-up that finds
  nothing due re-arms and returns; it must not spin.

R1.11 Lifetime. The `Session` owns its clock. `Stop` drops every pending entry and stops
the real timer; after it returns no entry is released (R1.4 applies to callbacks already
queued). Entries created after `Stop` are never released. `Stop` is idempotent and works
while paused. After `Stop`, `Pause`, `Resume` and `SetFactor` change nothing (`SetFactor`
still validates its argument, R1.10). There is no restart of a stopped clock.

### 4.3 Changes in `internal/core`

- `internal/core/timer.go`: the `Timer` interface gains
  `AfterFunc(d time.Duration, f func())`. `RealTimer.AfterFunc` calls `time.AfterFunc(d, f)`.
- `internal/core/test_util.go`: `MockTimer` gains `AfterFunc`; `AdvanceTime` calls `f` once,
  outside the mock's lock, when the deadline is reached.
- `internal/core/quorum.go`: `observedNetworker` gains a `timer Timer` field, set in
  `NewQuorumWithOptions` to the quorum's timer. `SendTo` replaces
  `time.AfterFunc(delay, ...)` with `n.timer.AfterFunc(delay, ...)`. The `Options.Latency`
  comment changes from "measured in wall-clock time" to "measured in the timer's time".
  The event's `DurationMs` stays `delay.Milliseconds()`.
- `internal/core/observer_test.go`: `TestLatencyDelaysDelivery` sets
  `timer: NewRealTimer()` on the networker it builds. No other change to its assertions.
- `internal/core/raft` and `internal/core/member.go`: unchanged.

### 4.4 Changes in `internal/sim/session.go`

- `New` limits the scale as described in 4.1.
- The `timer core.Timer` field becomes `clock *Clock`, created with `NewClock(scale)` and
  passed to `core.NewQuorumWithOptions` for every cluster generation (one clock per session).
- `latency()` returns the unscaled duration (`minLatency` to `maxLatency`), drawn as today.
- `emit` multiplies `DurationMs` by `s.scale` for **both** `election_timer` and `message`
  events, so the stream still carries wall milliseconds (rounding: section 4.1).
- In `run`, the delay after `quorum_ended` uses `s.clock.NewTimer(restartDelay)` (unscaled)
  instead of `time.After(restartDelay x scale)`. The timer is stopped when `run` leaves the
  wait loop.
- `Close` calls `s.clock.Stop()` as its last step, after the `run` goroutine has exited (or
  directly when the session was never started). In-flight messages of the stopped cluster
  are dropped instead of landing in inboxes nobody reads.
- `Session`'s exported API (`New`, `Start`, `Kill`, `Restart`, `Snapshot`, `Close`,
  `TimeScale`) is unchanged.

While the session runs, in-flight messages of a cluster that was replaced stay on the clock
until their deadline (at most 260 simulated ms) and then land in inboxes nobody reads, as the
current `time.AfterFunc` calls do. They are not cancelled.

`internal/web`, `cmd/wasm`, `cmd/main.go`, `internal/cobra`, `internal/service` and `web/`
are not touched.

### 4.5 Acceptance criteria

Timing assertions in clock tests leave at least 100 ms of margin for scheduling delay, and
where an entry must not fire the test makes that impossible (paused clock or factor 1000)
rather than unlikely. "Each kind" means a timer, a ticker (its first tick) and an
`AfterFunc` entry.

AC1.1 `internal/sim/timer.go` and the identifiers `ScaledTimer`, `NewScaledTimer` no longer
exist; `grep -rn "time.AfterFunc\|time.After(" internal/core/quorum.go internal/sim/session.go`
returns nothing.

AC1.2 Rescale (unit tests in `internal/sim/clock_test.go`), for each kind: an entry created
for 1 s at factor 1000 has not fired after 200 ms of wall time; after `SetFactor(0.01)` it
fires within 1 s of wall time. Conversely an entry created for 500 ms at factor 1 and
immediately followed by `SetFactor(1000)` has not fired after 800 ms of wall time.

AC1.3 Pause (unit test): with one entry of each kind created for 400 ms at factor 1 and
`Pause()` called about 100 ms later, none of them fires during the next 600 ms of wall time
and two `Now()` calls 100 ms apart return the same value; after `Resume()` all three fire
within 1 s.

AC1.4 Remaining time preserved (unit test), for each kind: a 300 ms entry at factor 1 is
paused after about 100 ms; the remaining time `R` is computed from `Now()` while paused and
the `Now()` read just before the entry was created; after a 300 ms pause and `Resume()`, the
entry fires no earlier than `R - 20 ms` and no later than `R + 500 ms` of wall time after
the resume.

AC1.5 Order (unit test): three `AfterFunc` entries with deadlines 1 s, 2 s, 3 s (created in
a shuffled order) at factor 100, followed by `SetFactor(0.001)`, run their callbacks in
deadline order. A second case does the same with a `Pause`/`Resume` pair around the factor
change. A third case calls `Pause()` first, creates three entries with the same duration
(their deadlines are equal because `Now()` is frozen), calls `Resume()`, and asserts that
the callbacks run in creation order. A fourth case covers channel timers: three timers with
deadlines 1 s, 2 s, 3 s at factor 100, then `SetFactor(0.1)` (they become due 100 ms of wall
time apart); one goroutine selecting on the three channels receives them in deadline order.

AC1.6 No stale value (unit test): a timer that has fired but whose channel was not read
(`len(t.C()) == 1`) delivers nothing after `Stop()`, and after `Reset(d)` delivers exactly
one value, no earlier than `d` of simulated time later. For a ticker: after `Stop()` nothing
is delivered, and after `Reset(d)` no stale value is delivered and the first tick comes no
earlier than `d` of simulated time after the `Reset`. One further case for each: `Stop()`,
then `Reset(d)`, then a value arrives (R1.7).

AC1.7 No stale value under concurrency (unit test): at factor 0.001, one goroutine repeats
1000 times `Reset(1 ms)`, yield, `Stop()`, then a non-blocking receive on `C()`; the receive
never yields a value.

AC1.8 Paused creation (unit test): a timer created while paused does not fire until
`Resume()`, then fires after its full duration.

AC1.9 Concurrency (unit test): goroutines that concurrently create, reset and stop timers
and tickers and call `AfterFunc` while another goroutine calls `SetFactor`, `Pause` and
`Resume` in a loop finish without a race report or deadlock under `go test -race`.

AC1.10 No waiting on callbacks (unit test): an `AfterFunc` callback that calls `Pause()`,
`Resume()`, `SetFactor`, `NewTimer` and `AfterFunc` on its own clock returns. While another
callback is blocked on a test channel, `Pause()`, `SetFactor` and `Stop()` called from the
test goroutine each return within 1 s.

AC1.11 Arguments (unit test): `NewClock` and `SetFactor` panic for 0, -1, 0.0001, 1001, NaN
and +Inf; `NewTicker(0)` and a ticker's `Reset(0)` panic; a timer created with `d = 0` and
one with `d = -1 s` fire.

AC1.12 Stop (unit test): on a paused clock one entry of each kind is created for 1 ms; after
`Stop()` and then `Resume()` none fires within 300 ms (the clock was paused until the
`Stop()`, so nothing can have been released before it, and `Resume()` after `Stop()` changes
nothing, R1.11). A timer created after `Stop()` does not fire; a second `Stop()` returns.

AC1.13 (in-package test in `internal/sim/session_test.go`) After `Close()` returns, with and
without a preceding `Start()`, a timer created on the session's clock for 1 ms does not fire
within 200 ms, and the sink receives no event.

AC1.14 `New(Config{TimeScale: math.NaN()}, ...)` and `New(Config{TimeScale: 5000}, ...)` do
not panic and report `TimeScale()` 1 and 1000. `TestSessionRestartAndScale` and `TestSessionRestartsAfterClusterHalts` in
`internal/sim/session_test.go` pass with their assertions unmodified (scaled election
timeout within [3000, 6000) ms and scaled latency within [360, 520) ms at `TimeScale: 2`).
`TestScaledTimerStretchesDurations` and its `fakeTimer` helper are deleted with the type
they test.

AC1.15 `git diff --stat main` for PR 1 lists no file under `web/`, `cmd/`, `internal/web/`,
`internal/core/raft/`, and not `internal/core/member.go`.

AC1.16 `go vet ./...`, `GOOS=js GOARCH=wasm go vet ./cmd/wasm`, `go test -race ./...`, and
in `web/`: `npx tsc --noEmit -p .`, `npm run build`, `npm run build:pages` all pass.

AC1.17 Manual check in both modes (`go run ./cmd/main.go serve` and `npm run dev:wasm`):
at the default factor, election countdown rings empty when the member turns candidate and a
reply packet leaves a member as the request packet lands on it, as before the change.

## 5. PR 2: pause and speed control

### 5.1 Behaviour

The viewer can pause, resume and choose the factor from the HUD, in both modes. The clock
state is announced by a new `clock` event. Message flights and countdown rings are driven by
a front-end mirror of the simulation clock, so they freeze on pause and change speed on a
factor change without jumping.

### 5.2 Event format (`internal/core/observer.go`, mirrored in `web/src/sim/events.ts`)

- New type `EventClock EventType = "clock"`.
- New `Event` fields, without `omitempty` (matching the existing flat record):
  `Paused bool` as `json:"paused"`, `TimeScale float64` as `json:"timeScale"` (the chosen
  factor). They are zero on every other event type.
- The `DurationMs` comment states that the value is in simulated milliseconds (A8).
- `events.ts`: `EventType` gains `"clock"`; `SimEvent` gains `paused: boolean` and
  `timeScale: number`.

A `clock` event is emitted by the `Session`, never by `core`. Clock state (`paused`, chosen
factor) lives in the session, guarded by the existing `s.mu`. Rules:

- **Start.** `Start` emits the initial `clock` event itself, while holding `s.mu`, before it
  launches the `run` goroutine. The first event a sink ever receives is therefore a `clock`
  event carrying the state at that moment.
- **Before `Start`.** `Pause`, `Resume` and `SetTimeScale` change the state (and the clock)
  and emit nothing. The session never calls the sink before `Start`.
- **Running.** Every `Pause`, `Resume` and `SetTimeScale` call emits one `clock` event,
  including calls that change nothing.
- **After `Close` has begun** (`s.closed` set). `Pause`, `Resume` and `SetTimeScale` return
  without changing anything and emit nothing. No `clock` event reaches the sink after
  `Close` returns. (One other event can, today and after this work: the quorum's monitor
  goroutine publishes `quorum_ended` outside any lock and `Quorum.Stop` does not wait for
  it, so a cluster that ends by itself at the instant of `Close` can deliver that event
  after `Close` has returned. The criteria that assert silence after `Close`, AC1.13, AC2.3
  and AC3.7, use clusters that do not end by themselves.)
- **Order.** The state change, the `Clock` call and the sink call happen in one critical
  section of `s.mu`, so `clock` events reach the sink in the order the changes were applied.
- **Locks.** `s.mu` is never held while acquiring a quorum lock or a member lock. (The `run`
  goroutine holds it while calling `core.NewQuorumWithOptions`, which takes neither.) The
  observer runs under a member's lock and may take `s.mu`; the resulting order is always
  member lock, then `s.mu`, then the clock's lock or the hub's lock.

`Session.Snapshot()` returns `quorum_started`, one `status` per member, and a `clock` event
as its **last** element. When no quorum exists yet it returns the `clock` event alone
(today: `nil`). It reads the quorum reference and the clock state together under `s.mu`,
releases `s.mu`, and only then asks that quorum for its member statuses. The three parts are
not one atomic picture and do not need to be: a subscriber that subscribed before calling
`Snapshot` receives, after the snapshot, every change made after the corresponding part was
read (a newer `status`, a `quorum_started` if the cluster was replaced in between, a newer
`clock` event), so it converges on the current state.

### 5.3 `Session` API (`internal/sim/session.go`)

```go
const (
    MinTimeScale = 1
    MaxTimeScale = 20
)

func (s *Session) Pause()
func (s *Session) Resume()
func (s *Session) SetTimeScale(scale float64) // clamped to [MinTimeScale, MaxTimeScale]; NaN becomes MinTimeScale
func (s *Session) TimeScale() float64          // the current chosen factor, read under s.mu
```

- `New` clamps `Config.TimeScale` the same way. The `Config.TimeScale` doc comment says
  "clamped to 1-20".
- `emit` no longer multiplies `DurationMs`: `election_timer` and `message` events carry
  simulated milliseconds.
- `Kill`, `Restart`, `Close` work while paused. A manual restart while paused starts the new
  cluster immediately; its members publish their initial status and `election_timer` events
  and then wait. The automatic restart after `quorum_ended` counts `restartDelay` on the
  clock, so it does not happen while paused.
- Each restart while paused leaves the replaced cluster's in-flight messages (a few dozen at
  most) pending on the clock until resume or `Close`. This is accepted: restarts are
  human-paced and no cancellation is added for it.

### 5.4 Local server (`internal/web/server.go`)

| Endpoint | Body | Success | Failure |
| --- | --- | --- | --- |
| `POST /api/pause` | none (ignored) | 204 | - |
| `POST /api/resume` | none (ignored) | 204 | - |
| `POST /api/timescale` | `{"timeScale": <number>}` | 204, value clamped to 1-20 | 400 |

Request contract for `/api/timescale` (and `/api/autoslow` in PR 3): the body is decoded
with `encoding/json` into a struct with one pointer field, as `handleKill` does. The answer
is 400 when decoding fails or the field is absent, which covers: an empty body, a body that
is not JSON, a JSON value that is not an object, `{}`, a `null` field, a field of the wrong
JSON type (`"5"`, `true`), and a number outside the range of a float64 (`1e999`). Any
finite number is accepted and clamped (`-3` becomes 1, `500` becomes 20). Unknown fields are
ignored, and only the first JSON value of the body is read, as in `/api/kill` today.

`GET /api/events`: the handler still subscribes first and then writes the snapshot, which
now ends with the `clock` event. Events published between the subscription and the snapshot
are written after the snapshot. For `clock` events this means the stream can first replay
changes the snapshot already includes. Because of the ordering rule in 5.2, what follows the
snapshot is the session's own sequence of `clock` events since the subscription, complete
and in order, so its last event is the current state and is never older than the snapshot's.
The replayed events are already in the subscriber's buffer and leave with the next write, so
a client can show an older clock state for a few milliseconds and then holds the current
one. No sequence number is added to events for this.

`Hub` overflow (A15): when a subscriber's buffer (1024 events) is full, `Hub.Publish`
removes that subscriber and closes its channel instead of dropping the event. `handleEvents`
ends the response when it finds its channel closed, after writing what was buffered. The
browser's `EventSource` then reconnects on its own and receives a fresh snapshot, which ends
with the current `clock` event. A viewer can therefore miss events only by being
disconnected, never while staying connected with a stale state. `unsubscribe` of a
subscriber that was already removed is a no-op. The comments on `subscriberBuffer` and
`Hub.Publish`, which describe dropping events, are rewritten to describe the disconnect.

`GET /api/config` is unchanged and its `timeScale` reports the current chosen factor.

`internal/cobra/cobra.go`: the `--slowmo` help text says it is the initial factor, 1 to 20.

### 5.5 WebAssembly API (`cmd/wasm/main.go`)

`globalThis.quorumSim` gains `pause()`, `resume()` and `setTimeScale(n)`. They call the
session synchronously, like `restart`. They do nothing before `start`. `setTimeScale` with a
missing or non-number argument does nothing. The file's header comment lists the new calls.
`start({members, timeScale}, onEvent)` is unchanged. In this mode the sink calls `onEvent`
synchronously and never drops an event.

### 5.6 Front end

`web/src/sim/source.ts`

```ts
export interface SimSource {
  readonly label: string;
  connect(onEvent: (e: SimEvent) => void, onStatus: (connected: boolean) => void): Promise<void>;
  kill(id: number): void;
  restart(members?: number): void;
  pause(): void;
  resume(): void;
  setTimeScale(scale: number): void;
}
```

`ServerSource` posts to the endpoints in 5.4 with the existing `post` helper. `WasmSource`
calls the functions in 5.5; `QuorumSimApi` gains the three signatures.

**Simulation clock mirror** (new `web/src/sim/clock.ts`, class `SimClock`). This is the only
place the page keeps simulated time.

- fields `paused` (initially `false`), `timeScale` (initially 1), `now` (simulated
  milliseconds elapsed locally, initially 0);
- `advance(wallNowMs: number): void` adds `(wallNowMs - previous wallNowMs) / timeScale` to
  `now` unless paused, then remembers `wallNowMs`. The first call only remembers it;
- `apply(e: SimEvent): void` copies `paused` and `timeScale` from a `clock` event.

Rule: the mirror is advanced to `performance.now()` **before every use**: at the top of
`onEvent` for every event (so the time up to the event is integrated under the state that
was in force, and the event is stamped with the mirror's time at its receipt), and once per
frame before drawing. It does not use the clamped `THREE.Timer` delta. Events are delivered
while the tab is hidden even though no frame runs, so rings started and `clock` events
received in a hidden tab are stamped and applied at their receipt time, not at the last
frame.

Rings and packets are both drawn as "started at simulated time S, progress
`(SimClock.now - S) / duration`". Nothing accumulates a per-frame delta, so a long frame, a
hidden tab or an event between two frames cannot shift them.

The mirror receives no simulated timestamp from the simulation and never corrects a running
ring or packet. Its error and why that is accepted are stated in section 8.

`web/src/main.ts`

- `slowmo` is clamped to 1-20 (default 3) and still passed to `WasmSource` as `timeScale`.
- `onEvent` starts with `simClock.advance(performance.now())`. A `clock` event is handled
  next and returns: `simClock.apply(e)` then `hud.setClock(e.paused, e.timeScale)`.
- `state.apply(e, simClock.now)` replaces `state.apply(e, performance.now())`.
- `packets.spawn(...)` receives `simClock.now` as the packet's start.
- In `renderLoop`: `simClock.advance(performance.now())`, then
  `b.update(dt, t, m, simClock.now, ...)` and `packets.update(simClock.now, stage.camera)`.
  Everything else (`stage.update`, `theme.animate`, `sparkles.update`, the damped member
  motion inside `Mochi.update`) keeps the wall-time `dt` and `t`.
- The `fetch("/api/config")` block is removed: the factor shown in the HUD now comes only
  from `clock` events, and a late config response must not overwrite a newer event.

`web/src/sim/state.ts`: no logic change; the `timerStart` comment says "simulated
milliseconds (`SimClock.now`)" instead of `performance.now()`.

`web/src/scene/mochi.ts`: no change. `updateTimer` already computes
`1 - (now - timerStart) / timerDurationMs`; both operands are now simulated milliseconds.

`web/src/scene/packets.ts`: a packet stores its start in simulated milliseconds, given to
`spawn`; `update(nowMs, camera)` sets `age = (nowMs - start) / 1000` instead of adding a
delta. `durationMs` is simulated. The envelope flutter (`Math.sin(p.age * 6)`) therefore
slows with the factor and freezes on pause; this is accepted. The existing rule that packets
are not spawned while the tab is hidden stays.

`web/src/ui/hud.ts`

- `HudActions` gains `pause(): void`, `resume(): void`, `setTimeScale(scale: number): void`.
- The constructor loses its `timeScale` parameter:
  `constructor(root, sourceLabel, actions)`. `setTimeScale(scale | null)` is replaced by
  `setClock(paused: boolean, timeScale: number)`.
- A second `.controls` row (layout table below) contains: the label `慢動作`; a `.segmented`
  group of buttons `1×`, `2×`, `3×`, `5×`, `10×`, `20×` (`data-scale`), the one equal to the
  current `timeScale` marked `active` (none when the value is not a preset, for example
  `--slowmo 2.5`); a spacer; and a button `data-action="pause"` that reads `暫停` while
  running and `繼續` while paused, with `aria-pressed` reflecting the paused state.
- Clicking a preset calls `actions.setTimeScale(n)`. Clicking the pause button calls
  `actions.pause()` or `actions.resume()` according to the last `setClock`.
- The HUD changes only in `setClock`, never optimistically on click, so every viewer of a
  shared session shows the same state.
- The source line (`[data-k="source"]`) reads `<label> · 慢動作 <timeScale>x` while running
  and `<label> · 已暫停 · 慢動作 <timeScale>x` while paused. Before the first `clock` event
  it shows the label alone.

**HUD layout across PR 2-4.** The title card's controls are three `.controls` rows, top to
bottom. `.controls` does not wrap and `.btn` does not break, so every button has a fixed
row. The inner width of the card is about 346 px on desktop (388 px card) and about 325 px
at a 375 px viewport.

| Row | Added by | Content, left to right |
| --- | --- | --- |
| 1 | existing | label `成員數`, member-count group, spacer, `重新開局`, `讓隊長下線` (unchanged by all four PRs) |
| 2 | PR 2 | label `慢動作`, factor presets, spacer, `暫停`/`繼續` |
| 3 | PR 3 | `選舉時自動放慢`; PR 4 appends a spacer and `兩位同時參選` |

Row 1 is already full, so no PR adds anything to it. Estimated widths from the current
`style.css` (not rendered): row 2 about 309 px on desktop; row 3 with both buttons about
233 px on desktop and about 227 px at 375 px, before its spacer. The acceptance criteria of
each PR check the real rendering.

`web/src/style.css`: in PR 2 only what row 2 needs (spacing between rows, the pressed state
of a `.btn`), including the phone layout (`max-width: 640px`).

`readme.md`: the `--slowmo` row says it is the initial factor, clamped to 1-20 and
adjustable from the page; the `?members=5&slowmo=3` sentence mentions the 1-20 range.

### 5.7 Acceptance criteria

AC2.1 (Go test) On a started session `Pause()` emits a `clock` event with `paused: true` and
the current `timeScale`; `Resume()` emits one with `paused: false`; `SetTimeScale(7)` emits
one with `timeScale: 7`; `SetTimeScale(0.2)`, `SetTimeScale(99)` and
`SetTimeScale(math.NaN())` emit 1, 20 and 1. `TimeScale()` returns the same values. A second
`Pause()` in a row emits a second event.

AC2.2 (Go test) The first event a sink receives from a started session is a `clock` event
with `paused: false` and the configured factor. `New(Config{TimeScale: 50}, ...)` reports
`TimeScale() == 20`, and the PR 1 assertion that `TimeScale: 5000` reports 1000 (AC1.14) is
changed to 20. With `Pause()` and `SetTimeScale(7)` called before `Start()`, the sink
receives nothing before `Start()` and the first event is `clock` with `paused: true` and
`timeScale: 7`. With `TimeScale: 1` and only `Pause()` called before `Start()`, no
`election_started` arrives during the first 4 s (unpaused it would arrive within 3 s).

AC2.3 (Go test) After `Close()` returns, `Pause()`, `Resume()` and `SetTimeScale(5)` call
the sink zero times, and `TimeScale()` still reports the value from before `Close()`.

AC2.4 (Go test) With `TimeScale: 1`, an `election_timer` event has `durationMs` in
[1500, 3000) and a `message` event has `durationMs` in [180, 260). After `SetTimeScale(5)`
newly emitted events are still in those ranges. `TestSessionRestartAndScale` is updated for
this and for the snapshot length (`MaxMembers + 2`).

AC2.5 (Go test) In a 3-member session at `TimeScale: 1` with a leader elected, 200 ms after
`Pause()` returns, no event other than `clock` reaches the sink for the next 700 ms (E1
explains the 200 ms). After `Resume()`, `message` events arrive again.

AC2.6 (Go test) While paused: `Kill(id)` produces a `stopped` event for that member;
`Restart(5)` produces `quorum_started` with `members: 5`; afterwards `Snapshot()` still ends
with a `clock` event that has `paused: true`. `Close()` returns while paused.

AC2.7 (Go test) While paused, a 1-member session whose member was killed emits
`quorum_ended` but no second `quorum_started` for at least `restartDelay + 1 s` of wall
time; after `Resume()` the second `quorum_started` arrives.

AC2.8 (Go test) `Snapshot()` of a running session returns `quorum_started`, one `status` per
member, then one `clock` event (length `members + 2`). `Snapshot()` of a session that was
never started returns exactly one event, of type `clock`.

AC2.9 (Go test) Order: 8 goroutines each call `Pause()`, `Resume()` and `SetTimeScale(k)`
100 times while a sink records the `clock` events; then the test calls `Pause()` once more
and waits 200 ms (E1: from PR 3 on, an election released just before that pause can still
emit one `clock` event). The last recorded `clock` event then equals the `clock` event at
the end of `Snapshot()`. The test passes under `-race`.

AC2.10 (Go test, `internal/web`) `POST /api/pause` and `POST /api/resume` return 204 with an
empty body. `POST /api/timescale` returns 204 for `{"timeScale": 5}`, `{"timeScale": 500}`,
`{"timeScale": -3}`, `{"timeScale": 5, "x": 1}` and `{"timeScale": 5} trailing`; and 400 for
an empty body, `{}`, `nope`, `5`, `{"timeScale": null}`, `{"timeScale": "5"}` and
`{"timeScale": 1e999}`. After `{"timeScale": 500}`, `GET /api/config` reports
`timeScale: 20`; after `{"timeScale": -3}` it reports 1.

AC2.11 (Go test, `internal/web`) A client that connects to `GET /api/events` of a 3-member
session after `POST /api/pause` receives `quorum_started`, three `status` events and then a
`clock` event with `paused: true` as the fifth event. `TestEventStreamStartsWithSnapshot`
still passes with its first-four-events assertion unmodified.

AC2.12 (Go test, `internal/web`) Convergence: a client connects to `GET /api/events` while a
goroutine posts pause and resume alternately 200 times and ends with a pause. Once the
goroutine has finished and the stream has been silent for 500 ms, the last `clock` event the
client received has `paused: true`.

AC2.13 (Go test, `internal/web`) Overflow: publishing `subscriberBuffer + 1` events to a hub
whose only subscriber does not read closes that subscriber's channel: reading it yields
exactly `subscriberBuffer` values and then reports the channel closed, and a later `Publish`
does not panic.

AC2.14 `core.Event` and `SimEvent` list the same fields; `web/src/sim/events.ts` contains
`"clock"`, `paused` and `timeScale`.

AC2.15 (manual or headless, both modes) Clicking `暫停`: packets in flight stop where they
are, countdown rings stop shrinking, the button reads `繼續`, the source line contains
`已暫停`; breathing and other decorative motion continue. Clicking `繼續`: the same packets
continue from where they stopped, and a reply packet leaves a member as the request lands.

AC2.16 (manual or headless, both modes) Switching from `3×` to `20×` and to `1×` while
packets are in flight and rings are counting: no packet or ring jumps (T4: the first frame
after the `clock` event is received draws each one where the previous frame left it plus one
frame of motion); from that frame on their speed is the new one; rings still empty as the
member turns candidate.

AC2.17 (manual, both modes) Drift tolerance (section 8, T3): with the leader taken offline,
after ten pause/resume clicks in quick succession while the followers' rings count down, the
ring of the member that turns candidate first empties within about half a second (wall time)
of that member turning candidate.

AC2.18 (manual, both modes) Hidden tab: after the tab was hidden for 30 s and shown again,
every follower's ring shows a partly filled countdown on the first frame (not an empty
ring), and no burst of packets appears. In server mode, pausing from a second tab while the
first is hidden and then showing the first: its rings are frozen partly filled and the
source line contains `已暫停`.

AC2.19 (manual, both modes) While paused, clicking a member takes it offline, and `重新開局`
and the member-count buttons start a new cluster that stays frozen and still shows the
paused state. In WebAssembly mode `?slowmo=20` starts at 20x with the `20×` preset active,
and `?slowmo=99` is treated as 20.

AC2.20 (manual, server mode) With two browser tabs open, pausing or changing the factor in
one updates the HUD of the other. A tab opened while the session is paused shows the paused
state and the chosen factor immediately.

AC2.21 (manual or headless) Layout: at a 1280 px wide viewport and at 375 x 667, rows 1 and
2 of the title card have no horizontal overflow (the card's `scrollWidth` equals its
`clientWidth`), no button text is clipped, and at 375 x 667 the title card does not overlap
the bottom dock.

AC2.22 The checks of AC1.16 pass.

## 6. PR 3: automatic slow motion during the vote exchange

### 6.1 Behaviour

Authority: A5 (owner answer). While automatic slow motion is on and a slow window is open,
the clock runs at `chosen factor x electionSlowdown`. Otherwise it runs at the chosen
factor. The switch is a `Clock.SetFactor` call, so it applies at once to every pending timer
and in-flight message.

The session keeps, under `s.mu`: `autoSlow` (initially `true`), whether a window is open,
and the window's end as a simulated time. It owns one clock timer for the window, created
stopped in `New` (`NewTimer` followed by `Stop`; the `Reset` below makes it pending, R1.7).

- **Open or extend.** `emit` forwards every event to the sink as today, without taking
  `s.mu`. For an `election_started` event only, after forwarding it, `emit` takes `s.mu`
  and, unless the session is closed, marks the window open, sets its end to
  `clock.Now() + electionSlowWindow`, and resets the window timer to `electionSlowWindow`.
  These steps are taken in this order: the end is stored before the timer is reset, so the
  timer's deadline is never earlier than the stored end and the check under "End by time"
  cannot ignore the firing that belongs to the latest end.
- **End by time.** The `run` goroutine's `select` gains a case on the window timer. It takes
  `s.mu` and closes the window only if `clock.Now()` has reached the stored end (a value
  from a window that was extended in the meantime is ignored; the timer fires again later).
  The window is measured on the clock, so it does not run out while paused. The window is
  handled by `run`, not by a clock callback, so the clock's dispatch never waits for `s.mu`
  or for the sink.
- **End by replacement.** When a cluster is replaced (manual restart or automatic restart),
  after the old quorum's `Stop()` has returned and in the same `s.mu` critical section that
  creates the next quorum, the session stops the window timer and closes the window.
  `Quorum.Stop` waits for every member's handler, so no `election_started` of the old
  cluster can open a window after this point (events of a retired cluster are not forwarded
  at all, as today).
- **Effective factor.** `chosen x electionSlowdown` when `autoSlow` is on and a window is
  open, else `chosen`. Whenever opening, extending or ending a window changes the effective
  factor, the session calls `Clock.SetFactor` and emits a `clock` event in that same
  critical section. Extending an open window does not change the factor and emits nothing.
  `Pause`, `Resume`, `SetTimeScale` and `SetAutoSlow` always emit, as in 5.2.

Resulting order on the stream: `election_started`, then the `clock` event that slows down.
On a restart during a window: the `clock` event that returns to the chosen factor, then the
new cluster's `quorum_started`.

The window is tracked whether or not `autoSlow` is on, so switching it on during a window
slows the rest of that window. Pause state, chosen factor and `autoSlow` survive a restart
(A9). After `Close` no `clock` event is emitted: `run` has exited and the clock is stopped.

Constants in `internal/sim/session.go`: `electionSlowdown = 3`,
`electionSlowWindow = 600 * time.Millisecond`.

### 6.2 Interfaces

- `core.Event` gains `Factor float64` as `json:"factor"` (effective factor) and
  `AutoSlow bool` as `json:"autoSlow"`, set on `clock` events only. `events.ts` gains
  `factor: number` and `autoSlow: boolean`. From this PR every `clock` event, including the
  one in `Snapshot()` and the initial one, carries all four fields.
- `Session`: `func (s *Session) SetAutoSlow(enabled bool)`, with the same before-`Start`,
  running and after-`Close` behaviour as `Pause` (5.2). `TimeScale()` still returns the
  chosen factor.
- Server: `POST /api/autoslow` with body `{"enabled": <bool>}` returns 204, or 400 under the
  request contract of 5.4 (the field must be a JSON boolean).
- WebAssembly: `quorumSim.setAutoSlow(enabled)`, synchronous; ignored before `start` or when
  the argument is not a boolean. Header comment updated.
- `SimSource` gains `setAutoSlow(enabled: boolean): void`, implemented by both sources.
- `SimClock` gains `factor` (initially 1), copied from `clock` events, and `advance` divides
  by `factor` instead of `timeScale`.
- `HudActions` gains `setAutoSlow(enabled: boolean): void`. `Hud.setClock` becomes
  `setClock(paused: boolean, timeScale: number, factor: number, autoSlow: boolean)`.
- HUD: a third `.controls` row (layout table in 5.6) with a button
  `data-action="auto-slow"` labelled `選舉時自動放慢`, `aria-pressed` equal to `autoSlow`;
  clicking it calls `actions.setAutoSlow(!autoSlow)`. The preset group keeps marking the
  **chosen** factor. When `factor` differs from `timeScale`, the source line appends
  `（選舉中 <factor>x）`.
- `web/src/style.css`: changed only if row 3 needs a rule that rows 1-2 do not already
  provide.

### 6.3 Acceptance criteria

AC3.1 (Go test) In a 3-member session at `TimeScale: 1`, the first `election_started` is
followed by a `clock` event with `paused: false`, `timeScale: 1`, `factor: 3`,
`autoSlow: true`, and no `clock` event precedes that `election_started` except the initial
one. Later a `clock` event with `factor: 1` arrives. Measured at the sink from the latest
`election_started` before it, that event comes no earlier than 1750 ms and no later than
2800 ms of wall time (600 ms x 3 = 1800 ms).

AC3.2 (Go test) Window ends with a candidate still standing (A5): in a 3-member session at
`TimeScale: 1` where two members were killed before the first election, the survivor's
`election_started` is followed by a `clock` event with `factor: 3` and then, within the
bounds of AC3.1, by one with `factor: 1`, while the survivor's latest `status` event still
has role `Candidate`.

AC3.3 (Go test) After `SetAutoSlow(false)` a `clock` event with `autoSlow: false` is
emitted, and through the next election (forced by killing the leader) no `clock` event has
`factor != timeScale`.

AC3.4 (Go test) Window frozen by a pause: after a `clock` event with `factor: 3` is seen and
`Pause()` is called, `SetTimeScale(4)` emits `paused: true`, `timeScale: 4`, `factor: 12`;
`SetAutoSlow(false)` then emits `factor: 4` and `SetAutoSlow(true)` emits `factor: 12`
again; and no `clock` event other than the ones these calls emit arrives during 3 s of
pause.

AC3.5 (Go test) Restart during a window: after a `clock` event with `factor: 3` is seen and
`Pause()` is called, `Restart(0)` makes the sink receive a `clock` event with
`paused: true` and `factor == timeScale` **before** the new `quorum_started`. The
`Snapshot()` of the new cluster ends with a `clock` event that has `factor == timeScale`.
After `Resume()` no `clock` event with `factor != timeScale` arrives before the new
cluster's first `election_started`.

AC3.6 (Go test) Persistence: after `SetAutoSlow(false)`, `SetTimeScale(4)` and
`Restart(0)`, the `clock` event at the end of `Snapshot()` has `autoSlow: false` and
`timeScale: 4`.

AC3.7 (Go test) `Close()` called while a window is open returns, and the sink receives no
event during the following 2.5 s.

AC3.8 (Go test, `internal/web`) `POST /api/autoslow` returns 204 for `{"enabled": false}`
and `{"enabled": true}`, and 400 for an empty body, `{}`, `nope`, `{"enabled": null}`,
`{"enabled": 1}` and `{"enabled": "true"}`.

AC3.9 (manual or headless, both modes) At the default factor, when a member starts an
election the source line shows `（選舉中 9x）`, envelopes and hearts fly visibly slower than
heartbeats did, and the suffix disappears about 5.4 s of wall time later (600 ms x 9),
whether or not a leader was elected. Packets already in flight slow down and speed up
without jumping. In a cluster that cannot elect a leader (3 members, 2 offline) the
survivor stays labelled `候選人` between attempts and has no countdown ring (the page draws
the ring for followers only), so the wait is checked on the event feed: the suffix
disappears about 5.4 s after each `發起選舉` line while the survivor is still labelled
`候選人`, and the next `發起選舉` line (or the `選舉失敗太多次` line that ends the attempts)
follows 8 to 13 s after the previous `發起選舉` line. That is 600 ms at 9x plus the remaining
900 to 2400 ms of the election timeout at 3x; a wait slowed for its whole length would take
13.5 to 27 s.

AC3.10 (manual, both modes) With `選舉時自動放慢` switched off, elections run at the chosen
factor and the suffix never appears; switching it on again restores AC3.9. In server mode a
second tab reflects the switch.

AC3.11 (manual or headless) Layout: AC2.21 holds for rows 1 to 3.

AC3.12 `internal/core/raft` and `internal/core/member.go` are unchanged in this PR. The
checks of AC1.16 pass.

## 7. PR 4: scenario "two candidates at once"

### 7.1 Behaviour

A HUD button makes two members time out together, so both become candidates for the same
term and race for votes. `raft.Node` is not changed: the runtime applies the node's ordinary
election timeout to both members inside one critical section.

`internal/core/member.go`

- `handle` is split: `handle(event)` takes `m.mu` and calls a new `handleLocked(event)`
  holding the rest of today's body (the stopped check, `apply`, the status publication).
- `Run` creates the election timer while holding `m.mu` (today the `NewTimer` call sits just
  above the lock). A non-nil `m.electionTimer` read under `m.mu` then means "this member's
  `Run` has started". The comment on the timer fields says they are used only under `m.mu`,
  or by `Run`.

`internal/core/quorum.go`: `func (q *Quorum) SplitVote() bool`.

1. Take `q.mu`, then every member's `m.mu` in ascending ID order. No other code holds two
   member locks, and every path that takes both kinds takes `q.mu` first, so this cannot
   deadlock. Nothing inside blocks: sends and observer calls are non-blocking.
2. A member is **eligible** when it is alive, its `Run` has started, it is not halted, its
   role is not `Leader`, and its `ElectionFailures` is below `raft.MaxElectionFailures`.
3. Group the eligible members by term. With no term shared by at least two, release the
   locks and return `false`; nothing has changed.
4. Otherwise take the highest such term, pick two of its members at random, and call
   `handleLocked(m.node.OnElectionTimeout)` on the lower ID, then on the higher ID. Release
   the locks and return `true`.

`internal/sim/session.go`: `func (s *Session) SplitVote()` calls `SplitVote` on the current
quorum (fetched like `Kill` does; `s.mu` is not held during the call). It does nothing when
there is no quorum.

What this guarantees, with every member locked from the eligibility check to the second
timeout:

- **Both or neither.** Either two members start an election or nothing happens. There is no
  state in which one was forced and the other was not.
- **Same term.** Both members were at term N when checked and no member can handle anything
  in between, so both emit `election_started` with term N + 1.
- **Same instant.** No message is handled and no timer is acted on between the two
  timeouts. The clock is not stopped, so their simulated timestamps differ by the run time
  of one handler (microseconds of wall time divided by the factor); that is the meaning of
  "the same simulated instant" here.
- **Never halts a member directly.** The failure count is checked under the same lock that
  applies the timeout, so the forced timeout cannot be the one that exceeds
  `MaxElectionFailures`.

A forced timeout is otherwise an ordinary one: it emits `election_started`, resets the
election timer and counts as an election failure. The command works while paused: both
members become candidates immediately and their requests wait in flight until resume.

What it does not guarantee (ordinary Raft behaviour, accepted):

- A message already in flight still arrives. If a vote request or heartbeat of term N + 1 or
  higher was in flight at the click, it can turn either candidate back into a follower.
- A member whose natural election timeout had already been received by its goroutine when
  `SplitVote` locked it handles that timeout right afterwards and starts a further election
  at term N + 2. This needs the natural timeout to fire within the microseconds `SplitVote`
  holds the locks.
- Repeated clicks: every click is a separate election attempt and adds one failure to both
  members. A member brought to `MaxElectionFailures` by clicks is no longer eligible, and it
  halts at its next natural timeout unless a leader's heartbeat or its own victory resets
  the count first, exactly as after five natural failures.

**Who wins.** A majority is computed from the **configured** cluster size, not from the
members that are alive (`raft.Cluster.Majority`, `M = floor(size / 2) + 1`). Each candidate
votes for itself and needs `M - 1` more votes. Let `v` be the number of live members other
than the two candidates:

| Voters | Outcome |
| --- | --- |
| `v >= 2M - 3` | one candidate always wins |
| `M - 1 <= v <= 2M - 4` | depends on how the votes split |
| `v <= M - 2` | nobody can win; the next timeout starts term N + 2 |

For an odd-sized cluster with every member alive, `v = 2M - 3`, so one always wins. With 5
configured members: 5 alive always elects one; 4 alive elects one unless the two voters
split 1-1; 3 alive (one voter) never elects one, although the number of live members is odd.
The table assumes every voter grants exactly one of the two requests, which is the case in a
settled cluster under nominal timing (both defined below).

**Settled cluster.** A leader being present at the click is not enough for that. A leader
can coexist with live members at another term (a member that has not yet handled the
leader's vote request or first heartbeat, or one that has since started a later election),
so the pair `SplitVote` selects can campaign in a term that is not above the leader's and in
which other members have already voted; and vote requests of an earlier election that are
still in flight draw extra refusals. A cluster is **settled** at term N when all of the
following hold:

- one live member is `Leader` at term N;
- every other live member is a `Follower` at term N;
- the only messages in flight are that leader's heartbeats and the replies to them.

In a settled cluster every member `SplitVote` can select is a follower at term N, so both
candidates campaign for term N + 1, a term in which no member has voted. Under nominal
timing (next paragraph) a cluster is settled once its leader has completed three rounds of
heartbeats, each sent and answered, since the latest `election_started` and has not stepped
down: every vote request and reply of that election has landed 520 ms after it started, and
a heartbeat that is sent after that and answered by every live member without the leader
stepping down leaves each of them a follower at the leader's term.

**Expected trace in a settled cluster.** Two things hold in every schedule: a member votes at
most once in term N + 1, and no delivery is released before its simulated deadline (T1), so
no request lands before 180 simulated ms, no candidate can win before 360 ms (a request and
a reply), and no heartbeat of term N + 1 lands before 540 ms. Everything else in this
paragraph is **nominal**. The scheduled latency of 180-260 ms says when a delivery is
released at the earliest. It is not a bound on when the receiver handles the message: a
release can be late (T1) and the receiving goroutine later still (R1.5). Nominal timing
means that every message is handled within 260 simulated ms of being sent and every timer or
ticker value when it is due. Then every other live member, the old leader included, handles
both requests within 260 ms, grants the first one (it is at term N + 1 from then on at the
latest) and refuses the second, so every voter has answered both requests before a winner
can exist. No voter times out in between: after the three heartbeat rounds above a follower
has at least 920 ms left on its election timer (heartbeats reach it at most 580 ms apart and
a timeout is at least 1500 ms), and the timer is reset when it grants its vote. Lateness
changes the trace only when it lasts long enough for an election timer to expire first: a
voter that times out before it has handled a request, or a candidate that times out before
it has handled its replies, starts an election of its own. Nominally the voter has 660 ms to
spare (920 - 260) and the candidate 980 ms (1500 - 520) in simulated time, which is that
many milliseconds times the effective factor in wall time (about 2 s at factor 3). No Go
test asserts this trace: the `internal/core` tests of 7.3 use instant delivery and a mock
timer, and AC4.7 stops at the two `election_started` events. AC4.9 checks the trace by eye.
In a cluster that is not settled other traces are valid: a member that has already voted in
the candidates' term, is itself a candidate in it, or is at a higher term refuses both
requests.

### 7.2 Interfaces

- Server: `POST /api/split-vote`, no body, always 204.
- WebAssembly: `quorumSim.splitVote()`, run as `go session.SplitVote()` like `kill`, because
  it takes the quorum lock. Header comment updated.
- `SimSource` gains `splitVote(): void`, implemented by both sources.
- `HudActions` gains `splitVote(): void`.
- `web/src/sim/state.ts`: `ClusterState` gains a getter `canSplitVote`: true when at least
  two members that are alive, not halted, not `Leader` and have
  `failures < MAX_ELECTION_FAILURES` share the same `term`. `MAX_ELECTION_FAILURES = 5` is a
  constant in `state.ts` with a comment naming `raft.MaxElectionFailures`.
- HUD: a button `data-action="split-vote"` labelled `兩位同時參選` in row 3 (layout table in
  5.6), with
  `title="讓兩位成員在同一任期同時參選。若沒有人拿到過半票（過半以總成員數計），逾時後會進入下一任期"`.
  `Hud.update` sets `disabled = !state.canSplitVote` on every call, before its early return
  for unchanged state, so the button is enabled exactly when the viewer's own picture of the
  cluster contains an eligible pair.
- The page's picture is one delivery delay behind the simulation (in server mode this
  includes another viewer's kill or restart that has not reached this page yet), and it
  cannot see whether a member's `Run` has started in the first instants of a new cluster. A
  click made on such a stale picture can find no pair: then nothing happens, no event is
  emitted, and the button state corrects itself with the next event. A stale picture is the
  only cause of a click without effect, and it is accepted.
- `web/src/style.css`: changed only if the added button needs a rule that row 3 does not
  already provide.
- No event format change.

### 7.3 Acceptance criteria

Tests in `internal/core` use a `MockTimer` that is advanced only where stated and no
`Options.Latency` (instant delivery). They wait 50 ms after `Start`, as the existing tests
do, so that every member's `Run` has started.

AC4.1 (Go test, `internal/core`) On a 5-member quorum `SplitVote()` returns `true`, and the
observer receives exactly two `election_started` events, from two different members, both
with `term: 1`. A `became_leader` event with `term: 1` from one of those two members
follows, and no third `election_started` is recorded.

AC4.2 (Go test) `SplitVote()` on a 1-member quorum, on a 3-member quorum with two members
killed, and on a quorum that was not started returns `false` and emits no event.

AC4.3 (Go test) Once AC4.1's leader exists and the other four members have published a
`Follower` status with `term: 1`, `SplitVote()` again returns `true` and emits two
`election_started` events with `term: 2` from members other than the leader.

AC4.4 (Go test) No winner, majority from the configured size: on a 5-member quorum brought
to the state of AC4.3 (a leader and four followers at term 1) with two followers then
killed, `SplitVote()` returns `true`, the two
remaining followers emit `election_started` with `term: 2`, exactly one `vote_granted` with
`term: 2` is recorded, and no `became_leader` with `term: 2` is recorded within 300 ms.
After `AdvanceTime(3 * time.Second)` an `election_started` with `term: 3` is recorded.

AC4.5 (Go test) Failure limit: on a 3-member quorum with one member killed, five
`SplitVote()` calls each return `true` and produce two `election_started` events with terms
1 to 5 and no `became_leader`; the sixth returns `false`, emits no `election_started`, and
no `halted` event has been recorded.

AC4.6 (Go test) Concurrency: `SplitVote()`, `KillMember`, `Snapshot` and `Stop` called from
concurrent goroutines on a running quorum finish without a race report or deadlock under
`go test -race`.

AC4.7 (Go test, `internal/sim`) In a session of at least 3 members, once a leader is elected
and the latest `status` event of every other member shows a `Follower` at the leader's term,
`Pause()` followed 300 ms later by `SplitVote()` produces two `election_started` events with
the same term, and no `vote_granted` event arrives until `Resume()`. `SplitVote()` before
`Start()` and after `Close()` returns and emits nothing.

AC4.8 (Go test, `internal/web`) `POST /api/split-vote` returns 204.

AC4.9 (manual or headless, both modes) Both scenarios start from a settled cluster (7.1).
The viewer reaches one by waiting until a leader is shown, every other live member is
labelled `追隨者`, and the leader's heartbeat dots have gone out and come back three times
with no new `發起選舉` line in the event feed. With 5 members, all alive, clicking
`兩位同時參選` shows two candidates at once and envelopes leaving both; each of the three
other members sends one heart and one refusal; one candidate wins. With two members taken
offline first and the cluster settled again (3 of 5 alive, one of them the leader), the
click shows two candidates, a single heart from the former leader, no winner, and a later
election with a higher term. Both are the nominal trace of 7.1, whose margins are about 2 s
of wall time at the default factor, so the check is made on a machine that is not
overloaded.

AC4.10 (manual or headless) The button is disabled in a 1-member cluster, when every live
non-leader member but one is offline, and for a pair of members that have both reached five
failures; it is enabled again when a pair exists.

AC4.11 (manual or headless) Layout: AC2.21 holds for rows 1 to 3 with both buttons in row 3.

AC4.12 `git diff --stat` for this PR lists no file under `internal/core/raft/`. The checks
of AC1.16 pass.

## 8. Timing limits and tolerances

These are the limits of the design. They are accepted, and the acceptance criteria check
them as stated, not something stronger.

T1 Go clock. An entry is never released before its simulated deadline. It can be released
late by the operating system's timer and scheduler delay; the spec sets no bound and the
tests allow 500 ms to 1 s.

T2 Burst after pause (R1.4, E1). Whatever was released before `Pause` took effect is still
handled. AC2.5 allows 200 ms for it.

T3 Front-end mirror. The page has no simulated timestamp from the simulation; it integrates
wall time under the state its `clock` events announce. For one ring or packet the error, in
simulated milliseconds, is at most

`d0 / f0 + sum over the clock events received during its life of d_i x |1/f_before - 1/f_after|`

where `d0` is the delivery delay of the event that created it, `d_i` the delivery delay of
each later `clock` event, `f` the effective factor, and `1/f` counts as 0 while paused. Each
term is bounded by one delivery delay. The error ends with the object: every ring and packet
starts from its own event, so nothing carries over to the next one, and a new snapshot
resets the clock state. Running objects are never corrected, because a correction would be a
visible jump. In wall time the bound for a run of pauses and resumes is the sum of their
delivery delays: under A14 (at most 50 ms each) ten transitions during one ring's life stay
within half a second even if every delay were the maximum and all errors had the same sign.
A pause and its resume have opposite signs, so in practice they largely cancel. AC2.17
checks the half second by eye.

T4 "Immediately" and "without jumping" for the front end mean: the first frame after the
`clock` event is received draws every ring and packet where the previous frame left them
plus one frame of motion, and later frames use the new speed.

T5 Frozen page. If the browser suspends the page entirely (a frozen background tab), events
arrive late in one burst and the rings created from that burst are stamped late. They are
wrong until each member's next timer reset (at most 3 simulated seconds). Not handled.

T6 "Two candidates at the same instant" (7.1): no event is handled between the two
timeouts; their simulated timestamps differ by one handler's run time.

## 9. Edge cases in scope

E1. Released just before a pause: a value already in a timer or ticker channel, a delivery
callback already queued, or a message already in an inbox is still handled after `Pause`
returns, and handling it can emit events, including `message` events for sends whose
delivery then waits on the paused clock. So a short burst of events can follow a pause. No
entry is released after it.

E2. Pause, factor change or automatic slow-down while messages are in flight: remaining
simulated flight time is preserved on both sides (Go clock and `SimClock`).

E3. Cluster restart while paused or slowed: pause, chosen factor and the automatic slow
motion switch persist (A9); an open slow window ends at the restart (6.1); in-flight
messages of the replaced cluster stay pending until resume and then land in inboxes nobody
reads, or are dropped by `Close`.

E4. Reconnect in server mode (`EventSource` reconnects on its own, also after a buffer
overflow, 5.4): the new snapshot ends with the current `clock` event, which re-synchronises
the HUD and `SimClock`. Until the browser reconnects (its `EventSource` retry delay, a few
seconds) the HUD shows the connection as lost and `SimClock` keeps running under the last
state it received; the new snapshot then rebuilds the scene and logs `新的一局` although no
cluster was replaced. This is today's reconnect behaviour and is accepted.

E5. Concurrent commands from several viewers: applied in some order; the `clock` events are
emitted in that same order, so every viewer ends in the final state.

E6. Hidden tab or long frame: the mirror is advanced at every event and every frame from
`performance.now()`, so rings started while hidden are stamped correctly and a `clock` event
received while hidden takes effect at its receipt. Packets that were in flight complete on
the first frame after the tab returns. Packets are still not spawned while the tab is hidden
(existing rule).

E7. Commands before `Start` and after `Close`: 5.2. `Kill` and `Restart` keep today's
behaviour in both states. `Snapshot` follows 5.2: before `Start` it returns the `clock`
event alone (today: `nil`).

E8. A forced election timeout (PR 4) counts toward `MaxElectionFailures` like a natural
one; a click never halts a member itself (7.1).

E9. `SplitVote` when no two eligible members share a term: nothing happens; the HUD button
is disabled as far as the page can tell (7.2).

E10. Factor change or automatic slow motion switch while paused: stored, shown in the HUD,
applied on resume.

E11. A second `election_started` during an open window (a second candidate, or the PR 4
scenario): the window is extended to 600 ms after it; no `clock` event is emitted.

E12. Invalid command bodies in server mode: 400 and no state change (5.4).

## 10. Out of scope

- Plan B: single-threaded deterministic simulation, exact replay, stepping one event at a
  time, and any guarantee about the order in which member goroutines handle events.
- Persistent "who voted for whom" markers, vote counters on candidates, term labels on
  packets, per-candidate packet colours.
- A second consensus protocol or a protocol abstraction.
- Any change to the CLI `play` command or to `raft.Node` rules. `play` keeps `RealTimer` and
  instant delivery.
- Per-viewer playback speed or pause in server mode.
- Adding pending timers or in-flight messages to the snapshot: a viewer that connects
  mid-run (including while paused) still sees rings and packets only from the next event on,
  as today.
- A simulated timestamp or sequence number on events, and any correction of running rings or
  packets in the front end (section 8, T3).
- Slowing the simulation for as long as a member is a candidate (replaced by A5).
- A countdown ring for candidates. The page keeps drawing the ring for followers only
  (`Mochi.updateTimer`), so a candidate's wait for its next timeout is not drawn; AC3.9
  checks it on the event feed.
- Guaranteeing a particular vote split in PR 4 (choosing members or shaping latency), and
  letting the viewer pick the two members.
- Feedback for a split-vote click that finds no pair beyond the disabled button (7.2).
- Cancelling in-flight messages of a replaced cluster while the session runs.
- A keyboard shortcut for pause.
- CLI flags, URL parameters or configuration for `electionSlowdown`, `electionSlowWindow`,
  automatic slow motion, or the factor presets.
- A front-end test framework.
- Remote or throttled server connections (A14).
- Version bumps, tags and release notes (A12).
- Refactors not required above, including changes to `MockTimer` beyond the new method and
  to `docs/architecture.md`.

## 11. Review findings and where they are resolved

### Round 1

Claude critic (C) and Codex critic (X), blocking findings.

| Finding | Topic | Resolution |
| --- | --- | --- |
| C-B1, X-B2, X-B3 | mirror applied retroactively, stale stamps | 5.6: mirror advanced before every event and every frame; rings and packets use absolute start times; E6, AC2.18 |
| X-B4 | drift claim unsupported | section 8 T3 states the exact bound, no correction, tolerance; AC2.17 |
| C-B2, X-B14 | pause racing a released callback | R1.4 (release as the linearisation point, no method waits for a callback), E1, AC1.10 |
| X-B13 | callback blocking on the session mutex | 6.1: the window is a clock timer read by `run`; R1.9: no session code in callbacks |
| X-B18 | release order versus handling order, due batch | R1.5, R1.6, R1.7 |
| X-B19 | factor validation, ticker reset, timestamps | R1.2, R1.10, AC1.11 |
| X-B22, X-B23 | missing ticker and callback criteria, equal deadlines | AC1.2 to AC1.5 (each kind; equal deadlines created while paused) |
| X-B15 | clock lifetime | R1.6 (no standing goroutine), R1.11 `Stop`, 4.4 `Close`, 5.3 limit while paused, AC1.12, AC1.13 |
| X-B20 | PR 1 rounding of message duration | 4.1 states the exact difference and why it is accepted; AC1.14 |
| X-B1 | 600 ms window versus "decided" | A5: owner answer of 2026-11-15; 6.1; AC3.2 |
| X-B24 | switch and window across restart | A9, 6.1 "End by replacement", AC3.5, AC3.6 |
| X-B5 | snapshot followed by older clock events | 5.4: replay is a prefix that ends at least as new as the snapshot; AC2.12 |
| X-B6 | dropped clock events | A15, 5.4: overflow disconnects, reconnect re-snapshots; AC2.13 |
| X-B16 | snapshot consistency during restart | 5.2 `Snapshot` paragraph; AC2.8 |
| X-B17 | commands before `Start` | 5.2 rules; AC2.2, AC2.3 |
| X-B21 | HTTP validation | 5.4 request contract; AC2.10, AC3.8 |
| X-B7, X-B11 | split vote not atomic, failure limit | 7.1: all members locked from check to both timeouts; AC4.1, AC4.5 |
| X-B8 | AC4.1 not buildable | 7.3 preamble (instant delivery, mock timer), AC4.1 is deterministic under 7.1 |
| X-B9 | "tie" explanation wrong | 7.1 "Who wins" (majority from configured size), tooltip in 7.2, AC4.4, AC4.9 |
| X-B10 | expected trace | 7.1 "Expected trace", AC4.9 |
| X-B12 | enabled button that does nothing | 7.2: `canSplitVote` mirrors eligibility; the remaining gap is stated |
| C-B3 | HUD layout for PR 3 and PR 4 | 5.6 layout table; AC2.21, AC3.11, AC4.11 |

Suggestions adopted: C-S1 (5.2, 6.1), C-S2 (R1.6), C-S3 (R1.7, AC1.7), C-S4 (R1.5), C-S5
(AC1.5), C-S6 (AC1.6), C-S7 (R1.8), C-S8 (R1.10), C-S9 (getters dropped, 4.2), C-S10 (5.2),
C-S11 (5.2), C-S12 (AC3.5), C-S13 (6.1), C-S15 (7.1, 7.2), C-S18 (section 1), C-S19 (5.3,
5.4), C-S20 (AC2.4), C-S21 (4.1), C-S22 (A12); Codex: assumption status labels (section 3),
tolerances (section 8), layout re-check per PR, trailing `clock` event assertion (AC2.11).
C-S14 and C-S16 no longer apply (7.1 is atomic). Not adopted: C-S17 (a feed line for a click
without effect); 7.2 disables the button instead.

### Round 2

Claude critic (C) and Codex critic (X), blocking findings: one each.

| Finding | Topic | Resolution |
| --- | --- | --- |
| C-B1 | AC3.9 names a countdown ring the page does not draw for a candidate | AC3.9 last sentences: the wait is checked on the `發起選舉` feed lines, the role label and the source-line suffix, with non-overlapping wall-time ranges; section 10: no ring is added for candidates |
| X-B1 | "a leader is present" is too weak for the split-vote trace; scheduled latency is not a bound on handling time | 7.1 "Settled cluster" (definition and how one is reached), "Expected trace in a settled cluster" (what holds in every schedule, what is nominal, the margins), closing sentence of "Who wins"; AC4.9 starts from a settled cluster and says how the viewer reaches one; AC4.7 requires every other member to be a follower at the leader's term |

Suggestions adopted: C-S2 and the Codex note on AC1.12 (R1.11, AC1.12), C-S3 (6.1 "Open or
extend"), C-S4 (5.2, 6.1), C-S5 (E7), C-S6 (AC2.2, 5.4), C-S7 (A16, section 1), C-S8 (R1.7,
6.1, AC1.6), C-S10 (AC2.17), C-S11 (E4), C-S12 (AC2.9); Codex: stale-view clicks (7.2),
AC2.16 aligned with T4. C-S0 and C-S1 are verdicts and need no change. Not adopted: C-S9 (a
test for `MockTimer.AfterFunc`): no test in the four PRs schedules a callback on the mock,
4.3 already states what the method does, and a test for a test double is added scope.
