# Quorum Election CLI Project

This is a CLI (Command Line Interface) application implemented in Go, designed to simulate a Quorum (Deductive Majority) mechanism in a distributed system. It includes inter-member heartbeat monitoring, fault detection, majority-vote-based member removal, and Leader election. This project aims to demonstrate Liveness and Consistency in a distributed system when facing node failures.

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
   - Modularity and Interface Abstraction
   - Decentralized Heartbeat Monitoring
   - Majority Vote Mechanism (MajorityVoteStrategy)
   - Graceful Shutdown (context.Context and sync.WaitGroup)
   - Simplified Leader Election
5. Known Issues and Future Optimization Directions
   - Considerations for Current Demo Version
   - Future Optimization Directions
6. Core Evolution: From Old to New Version (Key Changes in the Last Five Days)

## 1. Project Introduction

This project simulates a Quorum cluster consisting of multiple members. Each member operates independently, monitoring the health status of others through heartbeats. When a node is suspected to have failed, the system triggers a majority vote to confirm its status and decide whether to remove it from the Quorum. A Leader is elected from the active members and automatically re-elected if the current Leader fails. The project emphasizes demonstrating **Liveness** and **Consistency** in a distributed system when confronted with node failures.

## 2. How to Use

### 2.1 Prerequisites

- Go Language Environment (Version 1.18 or higher)

### 2.2 Clone the Project

```
git clone <Your project link, if any>
cd quorum-election
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

> You can also build the binary refer to readme.md in the main root dir `./GTI-oa-cli`, the files would be collected inside `./GTI-oa-cli/bin` dir

### 2.4 CLI Commands

Once the application starts, you can interact with the Quorum by entering the following commands in the command line:

- `kill <member_id`>: Simulates killing the member with the specified ID. This member will stop sending heartbeats and will be detected as failed by other members.
- Example: `kill 1` (kills member with ID 1)
- `restart`: Stops the currently running Quorum and starts a new one (with the same number of members as before).
- `exit`: Gracefully shuts down the Quorum application.

### 2.5 Run Tests

To run all tests in the project, execute the following command from the project root directory:

```
go test ./...
```

Alternatively, you can run specific tests:

```
go test ./internal/core -run TestKillMember
```

## 3. Dependencies and Credits

This project utilizes the following third-party Go modules:

- `github.com/sirupsen/logrus`: A structured logging library for clear output of events and states during the simulation.
- `github.com/spf13/cobra`: A powerful CLI application building library for handling command-line arguments and subcommands.
  Thanks to these open-source projects for their contributions to the Go ecosystem!

## 4. System Design and Architectural Considerations

The design of this project adheres to several core principles to ensure code modularity, maintainability, and scalability.

### 4.1 Modularity and Interface Abstraction

- **Change**: Core functionalities such as time management (`Timer`), network communication (`Networker`), election strategy (`ElectionStrategy`), and event notification (`QuorumEventNotifier`) are defined as interfaces.
- **Benefit**: This design achieves high **decoupling** by allowing different implementations for these interfaces (e.g., `RealTimer` vs. `MockTimer` for testing). This significantly enhances **testability, extensibility, and flexibility**, enabling independent development, testing, and replacement of components.

### 4.2 Decentralized Heartbeat Monitoring

- **Change**: Each Quorum member independently monitors heartbeats from all other active members. When a member suspects a node has failed, it initiates a vote request.
- **Benefit**:
- **Robustness & Responsiveness**: Avoids the Leader being a single point of monitoring bottleneck or failure, improving the system's **response speed** to failures.
- **Trade-off**: In large clusters, N-to-N heartbeat monitoring can increase network load, but it is manageable for the simulated scale.

### 4.3 Majority Vote Mechanism (`MajorityVoteStrategy`)

- **Change:** Formal removal of a member **must be based on a majority consensus** (`N/2 + 1` votes). Members send `RequestVote` upon suspicion and only propose removal after collecting enough votes.
- **Benefit**:
- **Consistency & Split-Brain Prevention**: This is a critical mechanism in distributed systems to prevent **Split-Brain** scenarios. It ensures that any state changes are acknowledged by the majority of nodes in the cluster, guaranteeing **data consistency**.
- **Trade-off for Small Quorums**: In a 2-member Quorum, a majority requires 2 votes. If any single member fails, the Quorum cannot reach a majority, leading to the entire Quorum **halting (Fail-Stop)** rather than continuing with inconsistency. This is a design choice prioritizing **safety over availability**.

### 4.4 Graceful Shutdown (`context.Context` and `sync.WaitGroup`)

- **Change**: Go's `context.Context` and `sync.WaitGroup` are extensively used to manage the lifecycle of `goroutines`. The `Quorum` holds a main `Context` which is propagated to all its internal `goroutines`.
- **Benefit**: Ensures that all `goroutines` can **gracefully stop** and release resources when the application terminates or the Quorum ends, effectively preventing **goroutine leaks and deadlocks**.

### 4.5 Simplified Leader Election

- **Change**: The current Leader election strategy simply selects the active member with the lowest ID.
- **Benefit**: Simplifies the design to focus on **core functional validation** for the demo.
- **Trade-off**: For production environments, more complex and fault-tolerant Leader election algorithms (e.g., Raft, Bully) are required to handle complex network and node states.

## 5. Known Issues and Future Optimization Directions

As a demo project, there are design trade-offs and future potential improvements outlined below.

### 5.1 Considerations for Current Demo Version

- **Fast Termination Behavior for 2-Member Quorums:**
  - **Current State**: To provide quick responsiveness upon a single member failure, in a 2-member Quorum, when one member suspects the other due to heartbeat timeout and perceives itself as the only active observer, it directly triggers `Quorum.ProposeMemberRemoval`. This leads to both nodes making **independent decisions and entering a halted state (Fail-Stop)** simultaneously.
  - **Trade-off**: This behavior provides immediate feedback for the demo and is considered safer than "inconsistency due to split-brain." However, in strict distributed systems, all removals should ideally be fully managed by a majority consensus mechanism or an arbiter service to avoid any independent decision ambiguities.

### 5.2 Future Optimization Directions

- **More Precise Unit Testing:**
  - **Improvement**: Further abstract the `Networker` interface to support simulating **network delays or packet loss**.
  - **Benefit**: Coupled with mocking frameworks like `gomock`, this enables highly deterministic unit tests that do not rely on `time.Sleep`, ensuring the correctness of each module's behavior in various scenarios.
- **Production-Grade Leader Election and Consensus System:**
  - **Improvement**: Introduce mature consensus algorithms such as **Raft or Paxos.**
  - **Benefit**: Handles more complex scenarios like **network partitions, message loss, and node pauses**, providing robust consistency guarantees.
- **Dynamic Member Management:**
  - **Improvement**: Implement the ability to dynamically add or remove Quorum members.
  - **Benefit**: Increases the system's **flexibility and operability**, making it closer to a real-world distributed application.
- **State Persistence:**
  - **Improvement**: Add a **persistence layer** for the Quorum's core state (e.g., member list, Leader ID).
  - **Benefit**: Ensures the system can recover its state after restarts, improving **availability**.
- **Actual Network Communication Layer:**
  - **Improvement**: Replace the current simulated networker with an actual network communication module based on **TCP/UDP** or **gRPC**.
  - **Benefit**: Allows Quorum members to **run on different machines**, simulating a true distributed environment.

## 6. Core Evolution: From Old to New Version (Key Changes in the Last Five Days)

This project has undergone critical low-level architectural refactoring and concurrency model strengthening in the past five days, laying a solid foundation for future expansion.

- **a. Decoupling Core Components and Interfaces**
  - **Change:** Separated tightly coupled `Quorum` and `Member` logic, and introduced **interfaces** such as `Timer`, `Networker`, `ElectionStrategy`, and `QuorumEventNotifier`.
  - **Benefit**: Achieved **loose coupling** between modules, significantly enhancing **testability, extensibility, and maintainability,** enabling mocking tests.
- **b. Unified Majority Vote Mechanism**
  - **Change:** Introduced `MajorityVoteStrategy`, where all member removals **must pass through majority consensus.** The problematic **old logic for "2-member Quorum failure local judgment" in** `Member.monitorHeartbeats` **that caused split-brain risk has been completely removed**.
  - **Benefit**: Fundamentally addressed the **potential Split-Brain risk** present in the old version, ensuring **data consistency** in case of failures, and aligning its behavior more strictly with distributed system principles (preferring Fail-Stop over inconsistency).
- **c. Rigorous Goroutine Lifecycle Management**
  - **Change**: Extensively applied `context.Context` and `sync.WaitGroup` to manage the lifecycle of the `Quorum` and all its child `goroutines`.
  - **Benefit**: Ensured the system can perform **Graceful Shutdown**, with all `goroutines` safely exiting upon application termination, effectively preventing **resource leaks and deadlocks**.
- **d. Enhanced Test Framework Stability**
  - **Change:** Introduced and refined mock objects such as `MockTimer`, `TestNetworkRouter`, and `MockNotifier`. **Fixed** `Context` **handling**. **Adjusted** `time.Sleep` **durations in** `TestKillMember` to ensure `goroutines` have sufficient time to process heartbeats and update states.
  - **Benefit:** Significantly improved the **determinism and stability** of integration tests, reducing test failures caused by Go scheduler uncertainties.
- **e. Centralized Quorum Termination Logic**
  - **Change:** Consolidated all Quorum termination logic into `Quorum.ProposeMemberRemoval` and `MajorityVoteStrategy.cleanupExpiredVotes` as two unified entry points, using `sync.Once` to ensure it's triggered only once.
  - **Benefit:** Simplified the termination path, eliminated potential logical conflicts and **uncertainty**, making the overall Quorum behavior more predictable.
