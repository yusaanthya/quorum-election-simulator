package raft

type Message struct {
	From    int
	To      int
	Type    MessageType
	Payload interface{}
}

type MessageType int

const (
	// Message Types
	MsgRequestVote MessageType = iota + 10 // Avoid conflict with existing types if any
	MsgRequestVoteReply
	MsgAppendEntries
	MsgAppendEntriesReply
)

type RequestVoteArgs struct {
	Term         int
	CandidateID  int
	LastLogIndex int
	LastLogTerm  int
}

type RequestVoteReply struct {
	Term        int
	VoteGranted bool
}

type AppendEntriesArgs struct {
	Term         int
	LeaderID     int
	PrevLogIndex int
	PrevLogTerm  int
	Entries      []interface{} // Log entries, empty for heartbeat
	LeaderCommit int
}

type AppendEntriesReply struct {
	Term    int
	Success bool
}
