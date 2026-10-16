# Rich Domain Model Refactor — Inventory

- Status: Inventory (input to spec and task plan)
- Date: 2026-10-17
- Branch: `feat/yusa_liu/migrate_message_handling_to_member` (head `2e8df95`)

## 1. Goal

Replace the current god-object structure in `internal/core` with a rich domain
model: domain rules live inside entities that guard their own invariants, and
runtime concerns (goroutines, timers, transport, logging) sit outside them.

## 2. Where the refactor stands

The four commits on this branch (`effeb1f` … `2e8df95`) moved election logic
out of `Quorum` and the deleted `strategy.go` into `Member`, and replaced the
mutex-guarded `QuorumNetworker` with the lock-free `DirectNetworker`.

That move did not remove the god object; it relocated it. `Member` now owns:

| Concern | Where in `internal/core/member.go` |
|---|---|
| Raft rules (vote granting, role transitions, majority) | `handleRequestVote`, `handleRequestVoteReply`, `becomeFollower`, `becomeLeader`, `startElection` |
| Runtime loop and lifecycle (`ctx`, `cancel`, `wg`, `Alive`) | `Run`, `Stop` |
| Time (election timer, heartbeat ticker, quorum-check ticker) | created in `Run`, threaded through every method as parameters |
| I/O (transport, logging) | `networker.SendTo`, `logrus` calls throughout |

`Quorum` is reduced to a container plus lifecycle, with leftover dead code.

## 3. Baseline test status

| Command | Result |
|---|---|
| `go test ./...` | pass |
| `go vet ./...` | clean |
| `go test -race ./...` | **fail** — 3 tests (`TestLeaderElection`, `TestFailoverReElection`, `TestQuorumLossTermination`), 14 data-race reports |

The races come from tests reading `Member.State` / `Alive` /
`electionFailures` from the test goroutine while the member goroutine writes
them, and from `Quorum.KillMember` writing `Alive` from the CLI goroutine.

## 4. Findings

### 4.1 Anemic entity: public mutable state, no guarded invariants

- `State`, `CurrentTerm`, `VotedFor`, `LeaderID`, `Alive` are exported and
  writable; nothing stops a caller from breaking "term never decreases" or
  "one vote per term".
- `Member.mu` is declared but never locked by `Member`; only tests lock it
  (`core_test.go:220`, `:233`), so it protects nothing.
- `Alive` is written by `Stop()` from the CLI goroutine (`quorum.go:184`) and
  read by `handleMessage` on the member goroutine (`member.go:123`).

### 4.2 Runtime concerns leak into domain methods

- `becomeFollower`, `becomeLeader`, `handleRequestVoteReply` each take all
  three timers as parameters (`member.go:185`, `:284`, `:302`), only so the
  domain rule can stop or restart them.
- `ITicker` lacks `Reset`, so `becomeLeader` type-asserts to reach it and keeps
  ~40 lines of working notes in place (`member.go:318-357`). Both
  `RealTicker` (embeds `*time.Ticker`) and `MockTickerWrapper`
  (`test_util.go:40`) already implement `Reset`.

### 4.3 Duplicated rules

- Majority threshold `(len(m.peers)+1)/2+1` appears twice (`member.go:108`,
  `:293`).
- Randomized election timeout `duration(1500 + rand.Intn(1500))` appears five
  times (`member.go:76`, `:159`, `:214`, `:241`, `:276`).
- AppendEntries handling is split between the dispatcher (`member.go:149-160`)
  and `handleAppendEntries`; `becomeFollower` clears `LeaderID` and resets the
  election timer, then the dispatcher sets `LeaderID` and resets the timer
  again.

### 4.4 Dead or disconnected code in `Quorum`

- `QuorumNetworker` (`quorum.go:71-96`) is unused since `DirectNetworker`
  replaced it.
- `Quorum.Broadcast` and `Quorum.getAliveMemberIDs` have no callers;
  `getAliveMemberIDs` also returns every member, not the alive ones.
- `Quorum.removed` is read only by the dead code above and by
  `TestNetworkRouter` in tests.
- `TestNetworkRouter` carries no traffic. The tests assign
  `q.networker = NewTestNetworkRouter(q)` after `NewQuorum`
  (`core_test.go:37`, `:85`, `:175`), but each `Member` already captured the
  `DirectNetworker` in `NewMember` (`quorum.go:152`). The integration tests
  therefore exercise `DirectNetworker`, not the router.
- `Member.Run(q *Quorum)` never uses `q`.
- `QuorumEventNotifier.NotifyLeaderElected` is never called, so leader
  changes never reach the notifier.

### 4.5 Safety bug: a leader can vote again in its own term

`becomeLeader` resets `VotedFor = -1` (`member.go:305`), and
`handleRequestVote` does not check the node's role. A second candidate in the
same term can therefore win the leader's vote.

Example with 3 nodes: L wins term T with votes {L, A}. C times out late, also
enters term T, asks L and A. A refuses (already voted L), L grants (its
`VotedFor` is -1). C reaches 2 votes and also becomes leader of term T —
two leaders in one term, which violates Raft's Election Safety property.

### 4.6 Documentation drift

`readme.md` still describes the pre-Raft design (`MajorityVoteStrategy`,
heartbeat-based removal votes, lowest-ID leader).

## 5. Out of scope for this refactor

- Log replication (`LastLogIndex`, `Entries`, etc. stay unused).
- Real network transport, persistence, dynamic membership.
- CLI behavior in `internal/service` (commands and their outcomes stay the
  same).

## 6. Next documents

- `02-spec.md` — target design and acceptance criteria.
- `03-tasks.md` — ordered, independently reviewable refactor tasks.
