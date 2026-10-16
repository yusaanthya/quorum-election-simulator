package raft

import (
	"reflect"
	"testing"
)

func members(n int) []int {
	ids := make([]int, n)
	for i := range ids {
		ids[i] = i
	}
	return ids
}

func voteReply(from, to, term int, granted bool) Message {
	return Message{From: from, To: to, Type: MsgRequestVoteReply, Payload: RequestVoteReply{Term: term, VoteGranted: granted}}
}

func requestVote(from, to, term int) Message {
	return Message{From: from, To: to, Type: MsgRequestVote, Payload: RequestVoteArgs{Term: term, CandidateID: from}}
}

func appendEntries(from, to, term int) Message {
	return Message{From: from, To: to, Type: MsgAppendEntries, Payload: AppendEntriesArgs{Term: term, LeaderID: from}}
}

func appendEntriesReply(from, to, term int) Message {
	return Message{From: from, To: to, Type: MsgAppendEntriesReply, Payload: AppendEntriesReply{Term: term, Success: true}}
}

// newLeader returns node 0 of a 3-node cluster as leader of term 1.
func newLeader(t *testing.T) *Node {
	t.Helper()
	n := NewNode(0, members(3))
	n.OnElectionTimeout()
	n.OnMessage(voteReply(1, 0, 1, true))
	if n.Status().Role != Leader {
		t.Fatalf("setup: expected Leader, got %v", n.Status().Role)
	}
	return n
}

func sentTo(out []Output) map[int]Message {
	sent := map[int]Message{}
	for _, o := range out {
		if s, ok := o.(Send); ok {
			sent[s.Msg.To] = s.Msg
		}
	}
	return sent
}

func has(out []Output, want Output) bool {
	for _, o := range out {
		if reflect.DeepEqual(o, want) {
			return true
		}
	}
	return false
}

func TestNewNode(t *testing.T) {
	n := NewNode(1, members(3))
	want := Status{ID: 1, Role: Follower, Term: 0, LeaderID: -1}
	if got := n.Status(); got != want {
		t.Errorf("Status() = %+v, want %+v", got, want)
	}
}

func TestClusterMajority(t *testing.T) {
	for size, want := range map[int]int{1: 1, 2: 2, 3: 2, 4: 3, 5: 3} {
		if got := NewCluster(size).Majority(); got != want {
			t.Errorf("NewCluster(%d).Majority() = %d, want %d", size, got, want)
		}
	}
}

// --- Transition table ---

func TestFollowerBecomesCandidateOnElectionTimeout(t *testing.T) {
	n := NewNode(0, members(3))
	out := n.OnElectionTimeout()

	if s := n.Status(); s.Role != Candidate || s.Term != 1 || s.ElectionFailures != 1 {
		t.Errorf("Status() = %+v, want Candidate term 1 failures 1", s)
	}
	sent := sentTo(out)
	for _, peer := range []int{1, 2} {
		msg, ok := sent[peer]
		if !ok || msg.Type != MsgRequestVote || msg.Payload.(RequestVoteArgs).Term != 1 {
			t.Errorf("expected RequestVote for term 1 to peer %d, got %+v", peer, msg)
		}
	}
	if !has(out, ResetElectionTimer{}) {
		t.Error("expected ResetElectionTimer")
	}
}

func TestCandidateBecomesLeaderOnMajority(t *testing.T) {
	n := NewNode(0, members(3))
	n.OnElectionTimeout()
	out := n.OnMessage(voteReply(1, 0, 1, true))

	if s := n.Status(); s.Role != Leader || s.LeaderID != 0 || s.ElectionFailures != 0 {
		t.Errorf("Status() = %+v, want Leader 0 with failures reset", s)
	}
	for _, want := range []Output{BecameLeader{Term: 1, Votes: 2}, StopElectionTimer{}, StartHeartbeats{}} {
		if !has(out, want) {
			t.Errorf("expected %#v in %#v", want, out)
		}
	}
	if sent := sentTo(out); len(sent) != 2 || sent[1].Type != MsgAppendEntries || sent[2].Type != MsgAppendEntries {
		t.Errorf("expected immediate heartbeats to both peers, got %+v", sent)
	}
}

func TestHigherTermMakesAnyRoleFollower(t *testing.T) {
	cases := map[string]func(t *testing.T) *Node{
		"follower": func(*testing.T) *Node { return NewNode(0, members(3)) },
		"candidate": func(*testing.T) *Node {
			n := NewNode(0, members(3))
			n.OnElectionTimeout()
			return n
		},
		"leader": newLeader,
	}
	msgs := map[string]Message{
		"RequestVote":        requestVote(2, 0, 5),
		"RequestVoteReply":   voteReply(2, 0, 5, false),
		"AppendEntries":      appendEntries(2, 0, 5),
		"AppendEntriesReply": appendEntriesReply(2, 0, 5),
	}
	for role, setup := range cases {
		for name, msg := range msgs {
			t.Run(role+"/"+name, func(t *testing.T) {
				n := setup(t)
				out := n.OnMessage(msg)
				if s := n.Status(); s.Role != Follower || s.Term != 5 {
					t.Errorf("Status() = %+v, want Follower term 5", s)
				}
				if !has(out, StopHeartbeats{}) || !has(out, ResetElectionTimer{}) {
					t.Errorf("expected StopHeartbeats and ResetElectionTimer, got %#v", out)
				}
			})
		}
	}
}

func TestLeaderStepsDownOnLostQuorum(t *testing.T) {
	n := newLeader(t)
	out := n.OnQuorumCheck() // no peer acknowledged: only self counted

	if s := n.Status(); s.Role != Follower || s.Term != 1 {
		t.Errorf("Status() = %+v, want Follower term 1", s)
	}
	if !has(out, LostQuorum{Contacted: 1}) || !has(out, BecameFollower{Term: 1}) {
		t.Errorf("expected LostQuorum and BecameFollower, got %#v", out)
	}
}

func TestLeaderKeepsLeadershipWithQuorum(t *testing.T) {
	n := newLeader(t)
	n.OnMessage(appendEntriesReply(1, 0, 1))
	if out := n.OnQuorumCheck(); out != nil {
		t.Errorf("expected no outputs, got %#v", out)
	}
	// The next interval starts from self only, so without new acks leadership is lost.
	n.OnQuorumCheck()
	if n.Status().Role != Follower {
		t.Errorf("expected Follower after an interval without acks, got %v", n.Status().Role)
	}
}

func TestFollowerAcceptsLeaderHeartbeat(t *testing.T) {
	n := NewNode(0, members(3))
	n.OnElectionTimeout() // failures = 1, term 1
	out := n.OnMessage(appendEntries(2, 0, 1))

	if s := n.Status(); s.Role != Follower || s.LeaderID != 2 || s.ElectionFailures != 0 {
		t.Errorf("Status() = %+v, want Follower of leader 2 with failures reset", s)
	}
	reply := sentTo(out)[2].Payload.(AppendEntriesReply)
	if reply != (AppendEntriesReply{Term: 1, Success: true}) {
		t.Errorf("reply = %+v, want success at term 1", reply)
	}
}

// --- Guards ---

func TestStaleRequestVoteIsRejected(t *testing.T) {
	n := newLeader(t)
	out := n.OnMessage(requestVote(2, 0, 0))
	reply := sentTo(out)[2].Payload.(RequestVoteReply)
	if reply.VoteGranted || reply.Term != 1 {
		t.Errorf("reply = %+v, want rejection at term 1", reply)
	}
	if n.Status().Role != Leader {
		t.Errorf("stale request changed role to %v", n.Status().Role)
	}
}

func TestStaleAppendEntriesIsRejected(t *testing.T) {
	n := newLeader(t)
	out := n.OnMessage(appendEntries(2, 0, 0))
	reply := sentTo(out)[2].Payload.(AppendEntriesReply)
	if reply.Success || reply.Term != 1 {
		t.Errorf("reply = %+v, want failure at term 1", reply)
	}
	if n.Status().Role != Leader {
		t.Errorf("stale heartbeat changed role to %v", n.Status().Role)
	}
}

func TestNonCandidateIgnoresVoteReply(t *testing.T) {
	n := NewNode(0, members(3))
	if out := n.OnMessage(voteReply(1, 0, 0, true)); out != nil {
		t.Errorf("expected no outputs, got %#v", out)
	}
	if n.Status().Role != Follower {
		t.Errorf("Follower became %v from a vote reply", n.Status().Role)
	}
}

func TestNonLeaderTicksAreNoOps(t *testing.T) {
	n := NewNode(0, members(3))
	if out := n.OnHeartbeatTick(); out != nil {
		t.Errorf("OnHeartbeatTick() = %#v, want nil", out)
	}
	if out := n.OnQuorumCheck(); out != nil {
		t.Errorf("OnQuorumCheck() = %#v, want nil", out)
	}
}

func TestLeaderIgnoresElectionTimeout(t *testing.T) {
	n := newLeader(t)
	if out := n.OnElectionTimeout(); out != nil {
		t.Errorf("expected no outputs, got %#v", out)
	}
	if s := n.Status(); s.Role != Leader || s.Term != 1 {
		t.Errorf("Status() = %+v, want Leader term 1", s)
	}
}

// --- Idempotency ---

func TestDuplicateVoteReplyCountsOnce(t *testing.T) {
	n := NewNode(0, members(5)) // majority is 3
	n.OnElectionTimeout()
	n.OnMessage(voteReply(1, 0, 1, true))
	n.OnMessage(voteReply(1, 0, 1, true))
	if n.Status().Role != Candidate {
		t.Errorf("two replies from one peer made the node %v", n.Status().Role)
	}
}

func TestRepeatedVoteRequestFromSameCandidateIsGranted(t *testing.T) {
	n := NewNode(0, members(3))
	for i := 0; i < 2; i++ {
		reply := sentTo(n.OnMessage(requestVote(1, 0, 1)))[1].Payload.(RequestVoteReply)
		if !reply.VoteGranted {
			t.Fatalf("request %d: vote not granted", i+1)
		}
	}
}

// --- Compound conditions ---

func TestLeaderRefusesSecondVoteInSameTerm(t *testing.T) {
	n := newLeader(t)
	reply := sentTo(n.OnMessage(requestVote(2, 0, 1)))[2].Payload.(RequestVoteReply)
	if reply.VoteGranted {
		t.Error("leader of term 1 granted a second vote in term 1")
	}
}

func TestFollowerVotesOncePerTerm(t *testing.T) {
	n := NewNode(0, members(3))
	n.OnMessage(requestVote(1, 0, 1))
	reply := sentTo(n.OnMessage(requestVote(2, 0, 1)))[2].Payload.(RequestVoteReply)
	if reply.VoteGranted {
		t.Error("follower granted a second vote in term 1")
	}
}

func TestSteppingDownKeepsVoteInSameTerm(t *testing.T) {
	n := newLeader(t)
	n.OnQuorumCheck() // steps down, still term 1
	reply := sentTo(n.OnMessage(requestVote(2, 0, 1)))[2].Payload.(RequestVoteReply)
	if reply.VoteGranted {
		t.Error("node that stepped down in term 1 voted again in term 1")
	}
}

func TestHaltsAfterMaxElectionFailures(t *testing.T) {
	n := NewNode(0, members(3))
	for i := 0; i < MaxElectionFailures; i++ {
		n.OnElectionTimeout()
	}
	out := n.OnElectionTimeout()

	if !reflect.DeepEqual(out, []Output{Halted{Failures: MaxElectionFailures + 1}}) {
		t.Errorf("out = %#v, want only Halted", out)
	}
	if s := n.Status(); !s.Halted || s.Term != MaxElectionFailures {
		t.Errorf("Status() = %+v, want halted at term %d", s, MaxElectionFailures)
	}

	before := n.Status()
	for _, o := range [][]Output{
		n.OnElectionTimeout(),
		n.OnHeartbeatTick(),
		n.OnQuorumCheck(),
		n.OnMessage(appendEntries(1, 0, 99)),
	} {
		if o != nil {
			t.Errorf("halted node produced %#v", o)
		}
	}
	if n.Status() != before {
		t.Errorf("halted node changed state: %+v -> %+v", before, n.Status())
	}
}
