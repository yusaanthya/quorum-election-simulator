# Rich Domain Model Refactor — Tasks

- Status: Done — T0–T6 committed on `feat/yusa_liu/migrate_message_handling_to_member`
- Date: 2026-10-17
- Input: [`02-spec.md`](02-spec.md)

Each task is one commit. After every task, `go build ./...`, `go vet ./...`,
`go test ./...` and `go test -race ./...` pass. T1 was done first because the
race suite had to be green before any other task could be verified.

In this sandbox, Go needs a writable build cache:
`GOCACHE=$TMPDIR/gocache go test ./...`.

## T0 — Fix: a leader must not vote twice in its term ✅ `73f82b4`

- Spec: §7, invariant §6.3-2.
- Change: write a failing test first. Put a member in `Leader` for term T,
  send it `RequestVote{Term: T, CandidateID: other}`, assert
  `VoteGranted == false`. Then remove `m.VotedFor = -1` from `becomeLeader`
  (`member.go:305`).
- Files: `internal/core/member.go`, `internal/core/core_test.go`.
- Done when: the new test fails before the fix and passes after; the other
  tests are unchanged.

## T1 — Safety net: race-free state reads ✅ `f091270`

- Spec: acceptance §9-1.
- Change (as implemented): `Run` holds `Member.mu` while it handles each
  event (message, election timeout, heartbeat tick, quorum check), so the
  tests' existing `m.mu.Lock()` reads are now actually synchronized. `Stop()`
  takes `mu`. `stopLocked()` is used from `startElection`, which already holds
  `mu`. `IsAlive()` replaces the unguarded `m.Alive` reads in
  `Quorum.KillMember`, `Quorum.Stop` and `TestQuorumLossTermination`.
  Replacing this lock with the `Member.Status()` snapshot from spec §8.1 is
  part of T4.
- Files: `internal/core/member.go`, `internal/core/quorum.go`,
  `internal/core/core_test.go`.
- Verified: `go test -race -count=5 ./...` passes. No production behavior
  changes.

## T2 — Timer interface: add `ITicker.Reset` ✅ `f89376c`

- Spec: §8.2.
- Change: add `Reset(d time.Duration)` to `ITicker`, then replace both type
  assertions and the notes in `becomeLeader` (`member.go:316-357`) with direct
  `Reset` calls.
- Files: `internal/core/timer.go`, `internal/core/member.go`.
- Done when: the build passes with both `RealTicker` and `MockTickerWrapper`
  as `ITicker`, and the tests pass.

## T3 — Domain package: `raft.Node`, `Cluster`, message types ✅ `4bcfb5f`

- Spec: §5, §6.
- Change: create `internal/core/raft/` with:
  - `message.go`: `Message`, `MessageType`, `*Args`, `*Reply`, moved from
    `internal/core/raft.go`
  - `role.go`: `Role` (renamed from `RaftState`), `MaxElectionFailures`
  - `cluster.go`: `Cluster` with `Majority()`
  - `output.go`: output types
  - `status.go`: `Status`
  - `node.go`: `Node` and its `On*` methods, following the behavior mapping
    in spec §6.4
  - `node_test.go`: the test categories from acceptance §9-5
  
  The `core` package does not use the new package yet. Add temporary type
  aliases in `core` (`type Message = raft.Message`, etc.) only if T4 needs
  them to stay small, and remove them in T4.
- Files: new `internal/core/raft/*.go`.
- Done when: `go test ./internal/core/raft/` passes and the
  domain-purity greps (acceptance §9-2) print nothing.

## T4 — `Member` becomes the runtime shell ✅ `8eae1a2`

- Spec: §8.1, acceptance §9-3, §9-4.
- Change: `Member` holds `*raft.Node` and its timers as fields. `Run()` drops
  the `*Quorum` parameter and dispatches to `node.On*`. Add `apply(outputs)`.
  Delete `handleMessage`, `becomeFollower`, `becomeLeader`, `startElection`,
  `handle*` and `sendHeartbeats` from `Member`. Define the election-timeout
  range in one place. Switch `core` to the `raft` message types and delete
  `internal/core/raft.go` and any aliases.
- Files: `internal/core/member.go`, `internal/core/quorum.go`,
  `internal/core/test_util.go`, `internal/core/load_test.go` (imports only),
  delete `internal/core/raft.go`.
- Done when: all four integration tests pass under `-race -count=3`, and
  acceptance §9-3 and §9-4 hold.

## T5 — `Quorum` cleanup and notifier wiring ✅ `95cce11`

- Spec: §8.3.
- Change: delete `QuorumNetworker`, `Broadcast`, `getAliveMemberIDs`,
  `removed`, and `TestNetworkRouter` together with the
  `q.networker = NewTestNetworkRouter(q)` lines in tests. That assignment has
  never reached the members (inventory §4.4), so removing it does not change
  what the tests exercise. Pass the notifier to members;
  on `BecameLeader`, call `NotifyLeaderElected`. Add an integration assertion
  that `MockNotifier` receives a leader-elected event.
- Files: `internal/core/quorum.go`, `internal/core/member.go`,
  `internal/core/test_util.go`, `internal/core/core_test.go`.
- Done when: the tests pass under `-race`, and `grep -n 'QuorumNetworker\|Broadcast\|getAliveMemberIDs\|TestNetworkRouter\|removed' internal/core/*.go` matches only comments: the commented-out `load_test.go` (follow-up in spec §10), a `DirectNetworker.Send` comment, and the no-op notifier's log text.
- Also done: widened the tests' leader-wait window (spec §10, "Test timing").

## T6 — Documentation ✅

- Spec: acceptance §9-7, inventory §4.6.
- Change: rewrite `readme.md` §4–6 for the Raft design and the
  domain/runtime layering. Set the status of `02-spec.md` to `Implemented`.
- Files: `readme.md`, `docs/refactor/02-spec.md`.
- Done when: the readme no longer describes `MajorityVoteStrategy`,
  heartbeat-based removal votes, or lowest-ID leader election as the current
  design. They appear only as history in readme §6.

## Final verification

```
GOCACHE=$TMPDIR/gocache go build ./...
GOCACHE=$TMPDIR/gocache go vet ./...
GOCACHE=$TMPDIR/gocache go test -race -count=3 ./...
grep -rnE '"(time|math/rand|sync|context|github.com/sirupsen/logrus)"' internal/core/raft/ --include='*.go' | grep -v _test.go
grep -rn 'core"' internal/core/raft/
```

Then run `go run ./cmd/main.go play -m 5`, `kill` the leader, and check that a
new leader is elected.
