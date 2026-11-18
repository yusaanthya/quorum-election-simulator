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
  | "stopped"
  | "clock";

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
  /** Simulated milliseconds: the timeout for "election_timer", the delivery delay for "message". */
  durationMs: number;
  members: number;
  /** "clock": whether the simulation clock is paused. */
  paused: boolean;
  /** "clock": the chosen factor (wall time per simulated time). */
  timeScale: number;
  /** "clock": the effective factor the clock runs at; above timeScale during an election. */
  factor: number;
  /** "clock": whether automatic slow motion during elections is on. */
  autoSlow: boolean;
}
