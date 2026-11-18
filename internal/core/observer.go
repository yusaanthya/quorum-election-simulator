package core

import "github.com/Anthya1104/quorum-election-cli/internal/core/raft"

// EventType names something observable that happened in the cluster.
type EventType string

const (
	EventQuorumStarted        EventType = "quorum_started"
	EventQuorumEnded          EventType = "quorum_ended"
	EventStatus               EventType = "status"
	EventMessage              EventType = "message"
	EventElectionTimer        EventType = "election_timer"
	EventElectionTimerStopped EventType = "election_timer_stopped"
	EventElectionStarted      EventType = "election_started"
	EventVoteGranted          EventType = "vote_granted"
	EventBecameLeader         EventType = "became_leader"
	EventBecameFollower       EventType = "became_follower"
	EventLostQuorum           EventType = "lost_quorum"
	EventHalted               EventType = "halted"
	EventStopped              EventType = "stopped"
	EventClock                EventType = "clock" // Emitted by the session, never by core
)

// Message kinds carried by EventMessage.
const (
	MessageRequestVote    = "request_vote"
	MessageVoteReply      = "vote_reply"
	MessageHeartbeat      = "heartbeat"
	MessageHeartbeatReply = "heartbeat_reply"
)

// Event is a flat, JSON-friendly record of one observable change. Fields that do not
// apply to Type are zero.
type Event struct {
	Type   EventType `json:"type"`
	Member int       `json:"member"` // Subject member; the sender for EventMessage

	Peer     int    `json:"peer"`              // Receiver for EventMessage, candidate for EventVoteGranted
	Message  string `json:"message,omitempty"` // Message kind for EventMessage
	Granted  bool   `json:"granted"`           // Vote granted or heartbeat accepted, for replies
	Term     int    `json:"term"`
	Role     string `json:"role,omitempty"`
	LeaderID int    `json:"leaderId"`
	Votes    int    `json:"votes"`
	Failures int    `json:"failures"`
	Halted   bool   `json:"halted"`
	Alive    bool   `json:"alive"`

	Contacted int `json:"contacted"` // EventLostQuorum
	// DurationMs is in simulated milliseconds: the timeout for EventElectionTimer, the
	// delivery delay for EventMessage.
	DurationMs int64 `json:"durationMs"`
	Members    int   `json:"members"` // EventQuorumStarted

	Paused    bool    `json:"paused"`    // EventClock
	TimeScale float64 `json:"timeScale"` // EventClock: the chosen factor
	Factor    float64 `json:"factor"`    // EventClock: the effective factor the clock runs at
	AutoSlow  bool    `json:"autoSlow"`  // EventClock: automatic slow motion during elections
}

// Observer receives events from members and the quorum. It is called from many
// goroutines, sometimes while a member holds its lock, so it must be safe for
// concurrent use and must not block.
type Observer interface {
	OnEvent(Event)
}

// ObserverFunc adapts a function to Observer.
type ObserverFunc func(Event)

func (f ObserverFunc) OnEvent(e Event) { f(e) }

type noOpObserver struct{}

func (noOpObserver) OnEvent(Event) {}

func statusEvent(s raft.Status, alive bool) Event {
	return Event{
		Type:     EventStatus,
		Member:   s.ID,
		Term:     s.Term,
		Role:     s.Role.String(),
		LeaderID: s.LeaderID,
		Failures: s.ElectionFailures,
		Halted:   s.Halted,
		Alive:    alive,
	}
}

func messageEvent(msg raft.Message) Event {
	e := Event{Type: EventMessage, Member: msg.From, Peer: msg.To}
	switch p := msg.Payload.(type) {
	case raft.RequestVoteArgs:
		e.Message, e.Term = MessageRequestVote, p.Term
	case raft.RequestVoteReply:
		e.Message, e.Term, e.Granted = MessageVoteReply, p.Term, p.VoteGranted
	case raft.AppendEntriesArgs:
		e.Message, e.Term = MessageHeartbeat, p.Term
	case raft.AppendEntriesReply:
		e.Message, e.Term, e.Granted = MessageHeartbeatReply, p.Term, p.Success
	}
	return e
}
