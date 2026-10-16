package raft

// Output is a decision made by a Node. The runtime executes outputs in order.
type Output interface{ isOutput() }

// Send delivers Msg to Msg.To.
type Send struct{ Msg Message }

// ResetElectionTimer restarts the election timer with a fresh randomized timeout.
type ResetElectionTimer struct{}

type StopElectionTimer struct{}

// StartHeartbeats starts the heartbeat and quorum-check tickers.
type StartHeartbeats struct{}

// StopHeartbeats stops the heartbeat and quorum-check tickers.
type StopHeartbeats struct{}

type BecameFollower struct{ Term int }

type BecameLeader struct{ Term, Votes int }

type StartedElection struct{ Term, Failures int }

type VoteGranted struct{ Candidate, Term int }

type LostQuorum struct{ Contacted int }

// Halted means the node exceeded MaxElectionFailures and ignores all further events.
type Halted struct{ Failures int }

func (Send) isOutput()               {}
func (ResetElectionTimer) isOutput() {}
func (StopElectionTimer) isOutput()  {}
func (StartHeartbeats) isOutput()    {}
func (StopHeartbeats) isOutput()     {}
func (BecameFollower) isOutput()     {}
func (BecameLeader) isOutput()       {}
func (StartedElection) isOutput()    {}
func (VoteGranted) isOutput()        {}
func (LostQuorum) isOutput()         {}
func (Halted) isOutput()             {}
