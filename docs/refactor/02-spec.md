# Rich Domain Model Refactor — Spec

- Status: Draft
- Date: 2026-10-17
- Input: [`01-inventory.md`](01-inventory.md)

## 1. Problem

`Member` mixes Raft rules with goroutine lifecycle, timers, transport and
logging (inventory §2). Its state is public and unguarded, rules are
duplicated, tests race against it, and a safety bug lets a leader vote twice
in one term (inventory §4).

## 2. Goals

1. Raft rules live in one domain entity that guards its invariants and has no
   runtime dependencies.
2. `Member` becomes a thin runtime shell that feeds events to the entity and
   executes what the entity decides.
3. `go test -race ./...` passes.
4. Externally observable behavior is preserved, except for the safety-bug fix
   in §7, which is delivered as its own task.

## 3. Non-goals

- Log replication, persistence, real network transport, dynamic membership
  (inventory §5).
- Changing CLI commands or their outcomes in `internal/service`.
- Changing timing constants (election timeout 1500–3000 ms, heartbeat 500 ms,
  quorum check 2000 ms, `MaxElectionFailures = 5`).

## 4. Reference and how it is adapted

The design follows the rich-aggregate rules in
`~/project/plans/exchange-server/docs/skill-examples/creating-stateful-aggregate-SKILL.md`
and the layer rules in
`~/project/plans/exchange-server/docs/ddd-outbox-pubsub-architecture-recap.md`
§3 and §9–10. Those documents target DB-backed aggregates, so only the parts
that apply to an in-memory simulator are adopted.

| Reference rule | Adopted here as |
|---|---|
| Domain layer has no infrastructure dependencies | `internal/core/raft` imports no `logrus`, `time`, `math/rand`, `sync`, `context` (checked by grep, §9) |
| Aggregate does not call `time.Now()`; time is injected | The node has no notion of time at all; it emits timer intents and the shell picks durations |
| R1 — every state transition is an aggregate method; no bare `SetStatus` | All fields are unexported; transitions happen only inside `On*` event methods; reads go through `Status()` |
| R2 — guard → state change → bump → record event | guard → state change → emit outputs (the term is the version-like counter and only moves forward) |
| R5 — fields outside the state machine go into value objects | `Cluster` value object owns size and majority, replacing the duplicated formula |
| Aggregate appends events; an outer layer publishes them | The node returns outputs; `Member` executes them (send, timers, notify, log) |
| R3 New/Rebuild, R4 dirty tracking, optimistic locking, outbox | **N/A** — no persistence, no concurrent writers to the same node |
| Typed-string status (no `iota`) | **Not adopted** — that rule serves DB readability; `Role` is never persisted, so it stays an `iota` with `String()` |
| Domain test categories | Adopted: transition table, guards, idempotency, compound conditions. N/A: New vs Rebuild, dirty |

## 5. Target structure

```
internal/service      (unchanged)
      │
internal/core         runtime layer
  Quorum              owns members, kill/start/stop, forwards notifier events
  Member              actor shell: goroutine, inbox, timers, networker, logging
  DirectNetworker     transport
      │ depends on
internal/core/raft    domain layer (pure)
  Node                Raft rules and state, unexported fields
  Cluster             value object: size, majority
  Message, *Args, *Reply, Role
  Output types
```

Dependency direction: `core` → `raft`, never the reverse. Being a separate
package lets the compiler enforce it.

## 6. Domain layer: `internal/core/raft`

### 6.1 `Node`

```go
type Node struct { /* unexported: id, peers, cluster, role, term, votedFor,
                      leaderID, votes, contacted, electionFailures, halted */ }

func NewNode(id int, peers []int) *Node   // peers excludes id; Follower, term 0

func (n *Node) OnElectionTimeout() []Output
func (n *Node) OnMessage(msg Message) []Output
func (n *Node) OnQuorumCheck() []Output
func (n *Node) Status() Status          // value copy, safe to hand out
```

`Status` is a plain struct: `ID`, `Role`, `Term`, `LeaderID`,
`ElectionFailures`, `Halted`.

### 6.2 Outputs

```go
type Output interface{ isOutput() }

type Send                 struct{ Msg Message }       // to Msg.To
type ResetElectionTimer   struct{}                    // shell picks a random 1500–3000 ms
type StopElectionTimer    struct{}
type StartHeartbeats      struct{}                    // shell resets heartbeat + quorum-check tickers
type StopHeartbeats       struct{}                    // shell stops both tickers
type BecameLeader         struct{ Term int }
type BecameFollower       struct{ Term int }
type StartedElection      struct{ Term, Failures int }
type VoteGranted          struct{ Candidate, Term int }
type LostQuorum           struct{ Contacted int }
type Halted               struct{ Failures int }      // shell stops the member
```

Outputs are ordered; the shell executes them in order. Heartbeat sends are
also expressed as `Send` outputs (see `OnHeartbeatTick` below).

```go
func (n *Node) OnHeartbeatTick() []Output   // leader: one Send per peer; otherwise nil
```

### 6.3 Invariants the node guarantees

1. `term` never decreases.
2. At most one vote is granted per term, including by the node that became
   leader in that term (fixes inventory §4.5; delivered in its own task).
3. A node in `Leader` role has `leaderID == id`.
4. Seeing a higher term in any message moves the node to `Follower` of that
   term and clears `votedFor`.
5. Majority is computed only by `Cluster.Majority()`.
6. After `Halted`, every `On*` method returns nil and changes nothing.

### 6.4 Behavior mapping (must match current code)

| Event | Current code | Node method |
|---|---|---|
| Election timer fires | `startElection` (`member.go:218`) | `OnElectionTimeout` |
| `RequestVote` | dispatcher + `handleRequestVote` | `OnMessage` |
| `RequestVoteReply` | dispatcher + `handleRequestVoteReply` | `OnMessage` |
| `AppendEntries` | dispatcher (`member.go:149-168`) + `handleAppendEntries` | `OnMessage`; the duplicate timer reset and `LeaderID` clear/set (inventory §4.3) collapse into one path |
| `AppendEntriesReply` | dispatcher | `OnMessage` |
| Heartbeat ticker | `sendHeartbeats` | `OnHeartbeatTick` |
| Quorum-check ticker | inline in `Run` (`member.go:106-117`) | `OnQuorumCheck` |

## 7. Safety fix (separate task)

A node that has granted a vote in term T, including to itself, must not grant
another vote in term T. Concretely, `becomeLeader` stops resetting `votedFor`.
The fix ships as its own commit with a failing test first, before the
structural refactor, so the behavior change is reviewable on its own.

## 8. Runtime layer: `internal/core`

### 8.1 `Member`

- Holds `node *raft.Node`, inbox, the three timers (as fields, not parameters),
  networker, `ctx`/`cancel`, `wg`.
- `Run()` drops its unused `*Quorum` parameter. Its loop maps each timer or
  message to one `node.On*` call, then calls `apply(outputs)`.
- `apply` executes outputs: `Send` → `networker.SendTo`; timer outputs →
  timer calls; `Halted` → `Stop()`; event outputs → log line and, for
  `BecameLeader`, the notifier.
- After each event the member stores `node.Status()` under its own mutex;
  `Member.Status()` returns that copy. This is the only state read from other
  goroutines and is what removes the test races.
- `Alive` is replaced by the stored status plus `ctx.Done()`; `Stop()` is safe
  to call from any goroutine.

### 8.2 `Timer`

`ITicker` gains `Reset(d time.Duration)`. `RealTicker` already has it through
the embedded `*time.Ticker`; `MockTickerWrapper` already defines it. The
type assertions and notes in `becomeLeader` go away.

### 8.3 `Quorum`

- Removes dead code: `QuorumNetworker`, `Broadcast`, `getAliveMemberIDs`,
  and `removed` once no test depends on it.
- Passes its notifier to members so `BecameLeader` reaches
  `NotifyLeaderElected` (currently never called, inventory §4.4).
- `KillMember`, `Start`, `Stop`, `Done` keep their signatures and behavior.

## 9. Acceptance criteria

1. `go build ./...`, `go vet ./...`, `go test ./...` and
   `go test -race -count=3 ./...` all pass.
2. Domain purity — each command prints nothing:
   ```
   grep -rnE '"(time|math/rand|sync|context|github.com/sirupsen/logrus)"' internal/core/raft/ --include='*.go' | grep -v _test.go
   grep -rn 'core"' internal/core/raft/
   ```
3. No exported mutable state on `Node` or `Member`:
   ```
   grep -nE '^\s+[A-Z][A-Za-z]*\s' internal/core/raft/node.go   # no exported struct fields in Node
   ```
   (`Status` and the output types live in their own files, so this check
   sees only `Node`.)
4. The majority formula appears exactly once (in `Cluster`), and the
   election-timeout range is defined exactly once (in `Member`).
5. Node unit tests cover, without goroutines or sleeps:
   - transition table (Follower→Candidate→Leader, any→Follower on higher term,
     Leader→Follower on lost quorum)
   - guards (stale-term messages rejected, non-candidate ignores vote replies,
     non-leader heartbeat tick is a no-op)
   - idempotency (duplicate vote reply from one peer counts once)
   - compound conditions (election failure threshold → `Halted`; leader
     refuses a second vote in its term)
6. Existing integration tests (`TestRaftInitialization`, `TestLeaderElection`,
   `TestFailoverReElection`, `TestQuorumLossTermination`) still pass, reading
   state only through `Member.Status()`.
7. `readme.md` describes the Raft-based design and the new layering.
