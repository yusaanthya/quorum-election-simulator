package raft

// Status is a read-only copy of a Node's state.
type Status struct {
	ID               int
	Role             Role
	Term             int
	LeaderID         int
	ElectionFailures int
	Halted           bool
}
