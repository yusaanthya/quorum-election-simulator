package raft

type Role int

const (
	Follower Role = iota
	Candidate
	Leader
)

// MaxElectionFailures defines how many consecutive failed elections cause a node to halt
const MaxElectionFailures = 5

func (r Role) String() string {
	switch r {
	case Follower:
		return "Follower"
	case Candidate:
		return "Candidate"
	case Leader:
		return "Leader"
	default:
		return "Unknown"
	}
}
