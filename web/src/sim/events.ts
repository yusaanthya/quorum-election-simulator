// Mirrors core.Event in internal/core/observer.go. Fields that do not apply to a type are zero.
export type EventType =
  | "quorum_started"
  | "quorum_ended"
  | "status"
  | "message"
  | "election_timer"
  | "election_timer_stopped"
  | "election_started"
  | "vote_granted"
  | "became_leader"
  | "became_follower"
  | "lost_quorum"
  | "halted"
  | "stopped";

export type MessageKind = "request_vote" | "vote_reply" | "heartbeat" | "heartbeat_reply";

export type Role = "Follower" | "Candidate" | "Leader";

export interface SimEvent {
  type: EventType;
  /** Subject member; the sender for "message". */
  member: number;
  /** Receiver for "message", candidate for "vote_granted". */
  peer: number;
  message?: MessageKind;
  granted: boolean;
  term: number;
  role?: Role;
  leaderId: number;
  votes: number;
  failures: number;
  halted: boolean;
  alive: boolean;
  contacted: number;
  durationMs: number;
  members: number;
}
