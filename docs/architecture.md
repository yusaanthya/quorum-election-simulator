# Architecture

How the simulator is structured after the rich domain model refactor. The
design notes behind it are in [`refactor/`](refactor/).

## 1. Layers

The domain layer (`internal/core/raft`) holds the Raft rules and knows nothing
about goroutines, time, randomness, logging or transport. The runtime layer
(`internal/core`) depends on it, never the reverse.

```mermaid
flowchart TB
    subgraph service["internal/service"]
        CLI["RunQuorumSetup / runQuorumCLI<br/>play · kill · restart · exit"]
    end

    subgraph core["internal/core — runtime layer"]
        Q["Quorum<br/>create, start, stop, kill members"]
        M["Member (one goroutine each)<br/>inbox · timers · apply outputs · logging"]
        NET["DirectNetworker<br/>non-blocking inbox delivery"]
        T["Timer<br/>RealTimer / MockTimer"]
        N["QuorumEventNotifier"]
    end

    subgraph raft["internal/core/raft — domain layer (pure)"]
        NODE["Node<br/>Raft state + rules"]
        CL["Cluster<br/>size · Majority()"]
        TYPES["Message · Role · Status · Output"]
    end

    CLI --> Q
    Q -->|owns| M
    M -->|On* events| NODE
    NODE -->|outputs| M
    M --> NET
    M --> T
    M --> N
    NET -->|Inbox| M
    NODE --> CL
    NODE --> TYPES
```

## 2. Types

```mermaid
classDiagram
    direction LR

    class Quorum {
        -members map
        -notifier QuorumEventNotifier
        +Start()
        +KillMember(id)
        +Stop()
        +Done() chan
    }

    class Member {
        +ID int
        +Inbox chan Message
        -node Node
        -electionTimer ITimer
        -heartbeatTicker ITicker
        -quorumCheckTicker ITicker
        +Run()
        +Status() Status
        +Stop()
        +IsAlive() bool
        -handle(event)
        -apply(outputs)
    }

    class Node {
        -role Role
        -term int
        -votedFor int
        -leaderID int
        -electionFailures int
        -halted bool
        -votes set
        -contacted set
        +OnElectionTimeout() Output[]
        +OnMessage(msg) Output[]
        +OnHeartbeatTick() Output[]
        +OnQuorumCheck() Output[]
        +Status() Status
    }

    class Cluster {
        -size int
        +Majority() int
    }

    class Output {
        <<interface>>
    }

    class Networker {
        <<interface>>
        +SendTo(msg, to)
    }

    Quorum "1" *-- "n" Member
    Member "1" *-- "1" Node
    Node *-- Cluster
    Node ..> Output : returns
    Member ..> Networker : sends via
```

`Output` is one of `Send`, `ResetElectionTimer`, `StopElectionTimer`,
`StartHeartbeats`, `StopHeartbeats`, `BecameFollower`, `BecameLeader`,
`StartedElection`, `VoteGranted`, `LostQuorum` or `Halted`.

## 3. How an event flows

Every event follows the same path: the member takes its lock, asks the node
what to do, and executes the answer in order. The node itself never sends,
sleeps or logs.

```mermaid
sequenceDiagram
    participant Src as Inbox / timer
    participant M as Member
    participant N as raft.Node
    participant Net as DirectNetworker
    participant Tm as Timers

    Src->>M: message or tick
    M->>M: lock mu, skip if stopped
    M->>N: OnMessage / OnElectionTimeout / ...
    N->>N: guard → change state
    N-->>M: []Output
    loop each output, in order
        alt Send
            M->>Net: SendTo(msg, msg.To)
        else timer output
            M->>Tm: Stop / Reset
        else BecameLeader
            M->>M: log + NotifyLeaderElected
        else Halted
            M->>M: log + Stop()
        else other event
            M->>M: log
        end
    end
    M->>M: unlock mu
```

## 4. Node roles

```mermaid
stateDiagram-v2
    [*] --> Follower

    Follower --> Candidate: election timeout
    Candidate --> Candidate: election timeout (new term)
    Candidate --> Leader: votes ≥ Majority()
    Candidate --> Follower: higher term, or valid AppendEntries
    Leader --> Follower: higher term
    Leader --> Follower: quorum check, acks < Majority()

    Follower --> Halted: more than MaxElectionFailures elections
    Candidate --> Halted: more than MaxElectionFailures elections
    Halted --> [*]
```

`Halted` is a flag (`Status.Halted`), not a `Role`: a halted node keeps its
last role but ignores every event. A valid heartbeat or winning an election
resets the failure count.

## 5. Example: a leader is killed

Five members; member 4 leads term 1 and is killed from the CLI.

```mermaid
sequenceDiagram
    participant CLI
    participant L as Member 4 (leader)
    participant F3 as Member 3
    participant Fx as Members 0–2

    CLI->>L: kill 4 → Stop()
    Note over L: context cancelled, no more heartbeats
    Note over F3,Fx: election timers keep running (1.5–3 s)
    F3->>F3: OnElectionTimeout → Candidate, term 2
    F3->>Fx: RequestVote(term 2)
    Fx-->>F3: VoteGranted (once per term)
    F3->>F3: votes 3 ≥ Majority 3 → Leader
    F3->>Fx: AppendEntries heartbeats every 500 ms
```
