package raft

const noVote = -1

// Node holds one member's Raft state and is the only place its rules are applied.
// It has no goroutines, timers or I/O: each On* method updates state and returns
// the outputs the runtime must execute.
type Node struct {
	id      int
	peers   []int
	cluster Cluster

	role             Role
	term             int
	votedFor         int
	leaderID         int
	electionFailures int
	halted           bool

	votes     map[int]bool // Members who granted a vote in the current term
	contacted map[int]bool // Members that acknowledged the leader in the current quorum-check interval
}

// NewNode creates a Follower at term 0. members is the whole cluster and may include id.
func NewNode(id int, members []int) *Node {
	peers := []int{}
	for _, p := range members {
		if p != id {
			peers = append(peers, p)
		}
	}

	return &Node{
		id:        id,
		peers:     peers,
		cluster:   NewCluster(len(peers) + 1),
		role:      Follower,
		votedFor:  noVote,
		leaderID:  noVote,
		votes:     make(map[int]bool),
		contacted: make(map[int]bool),
	}
}

func (n *Node) Status() Status {
	return Status{
		ID:               n.id,
		Role:             n.role,
		Term:             n.term,
		LeaderID:         n.leaderID,
		ElectionFailures: n.electionFailures,
		Halted:           n.halted,
	}
}

func (n *Node) OnElectionTimeout() []Output {
	if n.halted || n.role == Leader {
		return nil
	}

	n.electionFailures++
	if n.electionFailures > MaxElectionFailures {
		n.halted = true
		return []Output{Halted{Failures: n.electionFailures}}
	}

	n.role = Candidate
	n.term++
	n.votedFor = n.id
	n.leaderID = noVote
	n.votes = map[int]bool{n.id: true}

	out := []Output{
		StartedElection{Term: n.term, Failures: n.electionFailures},
		ResetElectionTimer{},
	}
	args := RequestVoteArgs{Term: n.term, CandidateID: n.id}
	for _, pid := range n.peers {
		out = append(out, n.send(pid, MsgRequestVote, args))
	}
	return out
}

func (n *Node) OnHeartbeatTick() []Output {
	if n.halted || n.role != Leader {
		return nil
	}
	return n.heartbeats()
}

func (n *Node) OnQuorumCheck() []Output {
	if n.halted || n.role != Leader {
		return nil
	}

	if len(n.contacted) < n.cluster.Majority() {
		out := []Output{LostQuorum{Contacted: len(n.contacted)}}
		return append(out, n.becomeFollower(n.term)...)
	}

	// Start the next interval, always counting self
	n.contacted = map[int]bool{n.id: true}
	return nil
}

func (n *Node) OnMessage(msg Message) []Output {
	if n.halted {
		return nil
	}

	switch msg.Type {
	case MsgRequestVote:
		return n.onRequestVote(msg.From, msg.Payload.(RequestVoteArgs))
	case MsgRequestVoteReply:
		return n.onRequestVoteReply(msg.From, msg.Payload.(RequestVoteReply))
	case MsgAppendEntries:
		return n.onAppendEntries(msg.From, msg.Payload.(AppendEntriesArgs))
	case MsgAppendEntriesReply:
		return n.onAppendEntriesReply(msg.From, msg.Payload.(AppendEntriesReply))
	}
	return nil
}

func (n *Node) onRequestVote(from int, args RequestVoteArgs) []Output {
	var out []Output
	if args.Term > n.term {
		out = append(out, n.becomeFollower(args.Term)...)
	}

	reply := RequestVoteReply{Term: n.term}
	// A node votes at most once per term; a leader keeps the vote it cast for itself.
	if args.Term == n.term && (n.votedFor == noVote || n.votedFor == args.CandidateID) {
		n.votedFor = args.CandidateID
		reply.VoteGranted = true
		out = append(out, ResetElectionTimer{}, VoteGranted{Candidate: args.CandidateID, Term: n.term})
	}

	return append(out, n.send(from, MsgRequestVoteReply, reply))
}

func (n *Node) onRequestVoteReply(from int, reply RequestVoteReply) []Output {
	if reply.Term > n.term {
		return n.becomeFollower(reply.Term)
	}
	if reply.Term < n.term || n.role != Candidate || !reply.VoteGranted {
		return nil
	}

	n.votes[from] = true
	if len(n.votes) < n.cluster.Majority() {
		return nil
	}
	return n.becomeLeader()
}

func (n *Node) onAppendEntries(from int, args AppendEntriesArgs) []Output {
	var out []Output
	reply := AppendEntriesReply{Term: n.term}

	if args.Term >= n.term {
		// A valid heartbeat from the current leader
		n.electionFailures = 0
		out = append(out, n.becomeFollower(args.Term)...)
		n.leaderID = args.LeaderID
		reply = AppendEntriesReply{Term: n.term, Success: true}
	}

	return append(out, n.send(from, MsgAppendEntriesReply, reply))
}

func (n *Node) onAppendEntriesReply(from int, reply AppendEntriesReply) []Output {
	if reply.Term > n.term {
		return n.becomeFollower(reply.Term)
	}
	if n.role == Leader && reply.Term == n.term {
		n.contacted[from] = true
	}
	return nil
}

// becomeFollower moves to Follower of term. The vote is kept when the term does not change,
// so stepping down never frees a vote already cast in that term.
func (n *Node) becomeFollower(term int) []Output {
	var out []Output
	if n.role != Follower || n.term != term {
		out = append(out, BecameFollower{Term: term})
	}

	if term > n.term {
		n.term = term
		n.votedFor = noVote
		n.votes = make(map[int]bool)
	}
	n.role = Follower
	n.leaderID = noVote

	return append(out, StopHeartbeats{}, ResetElectionTimer{})
}

func (n *Node) becomeLeader() []Output {
	n.role = Leader
	n.leaderID = n.id
	n.electionFailures = 0
	n.contacted = map[int]bool{n.id: true}

	out := []Output{BecameLeader{Term: n.term, Votes: len(n.votes)}, StopElectionTimer{}}
	out = append(out, n.heartbeats()...)
	return append(out, StartHeartbeats{})
}

func (n *Node) heartbeats() []Output {
	args := AppendEntriesArgs{Term: n.term, LeaderID: n.id}
	out := make([]Output, 0, len(n.peers))
	for _, pid := range n.peers {
		out = append(out, n.send(pid, MsgAppendEntries, args))
	}
	return out
}

func (n *Node) send(to int, t MessageType, payload interface{}) Send {
	return Send{Msg: Message{From: n.id, To: to, Type: t, Payload: payload}}
}
