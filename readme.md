# Quorum Election CLI Project

This is a CLI (Command Line Interface) application implemented in Go that simulates leader election in a distributed cluster using the leader-election part of the Raft consensus algorithm. Members elect a leader by majority vote, the leader keeps its followers with heartbeats, and a new leader is elected when the current one fails. This project aims to demonstrate Liveness and Safety in a distributed system when facing node failures.

## Table of Contents

1. Project Introduction
2. How to Use
   - Prerequisites
   - Clone the Project
   - Run the Application
   - CLI Commands
   - Run Tests
3. Dependencies and Credits
4. System Design and Architectural Considerations
   - Domain Layer and Runtime Layer
   - Raft Leader Election
   - Leader Lease (Quorum Check)
   - Termination on Repeated Election Failure
   - Graceful Shutdown and Concurrency
5. Known Issues and Future Optimization Directions
6. Core Evolution

## 1. Project Introduction

This project simulates a cluster of multiple members. Every member runs independently and starts as a Follower. When a follower stops hearing from a leader, it becomes a Candidate and asks the others for votes; a candidate that collects a majority (`N/2 + 1`) becomes the Leader and sends periodic heartbeats. If the leader is killed, the remaining members time out and elect a new one, as long as a majority is still alive. If no majority is left, members keep failing elections and eventually stop, which ends the simulation.

## 2. How to Use

### 2.1 Prerequisites

- Go Language Environment (Version 1.24 or higher, as required by `go.mod`)

### 2.2 Clone the Project

```
git clone <Your project link, if any>
```

### 2.3 Run the Application

Build the binary

```
go build -o quorum_election cmd/main.go
```

You can run the application directly using the go run command or the binary file name, specifying the initial number of members with the --members or -m flag. The default is 3 members.

- To start with the default 3 members:

```
  ./quorum_election play
```

- To start with 5 members:

```
 ./quorum_election play --members 5
```

> You can also build the binary by using `make all` or `make build-quorum-election-<OS>-<CPU_ARCH>`, which could refer to `Makefile` in the root dir

### 2.4 CLI Commands

Once the application starts, you can interact with the Quorum by entering the following commands in the command line:

- `kill <member_id>`: Simulates a crash of the member with the specified ID. The member stops processing messages and timers. If it was the leader, the remaining members stop receiving heartbeats, time out, and elect a new leader.
- Example: `kill 1` (kills member with ID 1)
- `restart`: Stops the currently running Quorum and starts a new one (with the same number of members as before).
- `exit`: Gracefully shuts down the Quorum application.

### 2.5 Run Tests

To run all tests in the project, execute the following command from the project root directory:

```
go test ./...
```

The Raft rules are unit-tested without goroutines or sleeps in `internal/core/raft`. To check for data races as well:

```
go test -race ./...
```

Alternatively, you can run specific tests:

```
go test ./internal/core -run TestFailoverReElection
```

Or you can just run `Run Core Tests` via the Run and Debug tool if you're with vscode.

## 3. Dependencies and Credits

This project utilizes the following third-party Go modules:

- `github.com/sirupsen/logrus`: A structured logging library for clear output of events and states during the simulation.
- `github.com/spf13/cobra`: A powerful CLI application building library for handling command-line arguments and subcommands.
  Thanks to these open-source projects for their contributions to the Go ecosystem!

## 4. System Design and Architectural Considerations

### 4.1 Domain Layer and Runtime Layer

The core is split into two layers. The outer layer may depend on the inner one, never the reverse; being separate Go packages lets the compiler enforce this.

```
internal/service      CLI loop: play / kill / restart / exit
      │
internal/core         runtime layer
  Quorum              creates members, starts/stops them, kill, notifier
  Member              one goroutine per member: inbox, timers, transport, logging
  DirectNetworker     non-blocking, lock-free message delivery
      │ depends on
internal/core/raft    domain layer (pure)
  Node                Raft state and rules
  Cluster             cluster size and majority
  Message types, Role, Status, Output types
```

- **`raft.Node` is a rich domain entity.** Its state (role, term, vote, leader, election failures) is unexported and changes only inside its event methods: `OnElectionTimeout`, `OnMessage`, `OnHeartbeatTick` and `OnQuorumCheck`. It has no goroutines, timers, randomness, logging or I/O. Each method returns an ordered list of outputs, such as `Send`, `ResetElectionTimer`, `StartHeartbeats`, `BecameLeader` or `Halted`.
- **`Member` is a thin runtime shell.** It turns inbox messages and timer ticks into node events, executes the outputs (send a message, reset a timer, log, notify, stop), and picks the randomized election timeout. Other goroutines read state only through `Member.Status()`.
- **Benefit:** The Raft rules are unit-tested as plain function calls (`internal/core/raft/node_test.go`), and the integration tests in `internal/core` cover the concurrent behavior with a mock timer.

Time (`Timer`), transport (`Networker`) and event notification (`QuorumEventNotifier`) are interfaces, so tests use `MockTimer` and `MockNotifier`.

### 4.2 Raft Leader Election

- Election timeouts are randomized between 1500 ms and 3000 ms so members rarely time out together.
- A candidate increments its term, votes for itself and sends `RequestVote` to its peers. It becomes leader once it has a majority of votes.
- **Election Safety:** a member grants at most one vote per term, and a leader keeps the vote it cast for itself, so a term never has two leaders.
- Any message with a higher term turns the receiver into a Follower of that term.
- The leader sends `AppendEntries` heartbeats every 500 ms. A valid heartbeat resets the follower's election timer.

Log replication is out of scope; `AppendEntries` is used only as a heartbeat.

### 4.3 Leader Lease (Quorum Check)

Every 2000 ms the leader checks how many members acknowledged its heartbeats during that interval, counting itself. If that is below a majority, it steps down to Follower, so a leader cut off from the majority does not keep acting as leader.

### 4.4 Termination on Repeated Election Failure

A member that starts more than `MaxElectionFailures` (5) consecutive elections without a leader appearing stops itself. When a majority of members is gone, the survivors cannot win an election, so they all stop. `Quorum` then notifies `NotifyQuorumEnded` and the CLI starts a new quorum.

### 4.5 Graceful Shutdown and Concurrency

- `context.Context` and `sync.WaitGroup` manage the lifecycle of every member goroutine, and `Quorum.Stop()` waits for all of them to exit.
- Each member's state is touched only while its `Member` holds its mutex, so the concurrent tests pass with `go test -race`.
- Messages go through `DirectNetworker`: one buffered inbox per member and non-blocking sends. A message to a full inbox is dropped, which Raft already tolerates.

## 5. Known Issues and Future Optimization Directions

- **Static membership:** majority is computed over the initial cluster size. Killed members still count, so a cluster that lost its majority stops instead of shrinking. This is intended: it prefers safety over availability.
- **Timing-based integration tests:** the `internal/core` tests drive a mock clock but still rely on short `time.Sleep` calls to let goroutines run. The Raft rules themselves are covered deterministically in `internal/core/raft`.
- **Possible next steps:** log replication, persistence of term and vote, dynamic membership, simulated network delay and partitions in `Networker`, and a real transport such as gRPC.

## 6. Core Evolution

1. **Majority-vote removal (initial version):** members monitored each other's heartbeats and voted to remove suspected members; the lowest-ID alive member was leader.
2. **Raft leader election:** election moved to Raft (terms, `RequestVote`, `AppendEntries` heartbeats, randomized timeouts), plus the election-failure threshold and quorum auto-termination. The central mutex networker was replaced by the lock-free `DirectNetworker`.
3. **Rich domain model:** Raft rules moved out of `Member` into the pure `raft.Node`, and `Member` became a runtime shell. This refactor also fixed a leader voting twice in its own term, fixed data races in member state, wired leader-election notifications, and removed dead code. Design notes are in [`docs/refactor/`](docs/refactor/).
