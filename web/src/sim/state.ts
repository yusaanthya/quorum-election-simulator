import type { Role, SimEvent } from "./events";

/** Mirrors raft.MaxElectionFailures: a member that has failed this many elections is not paired by a split vote. */
export const MAX_ELECTION_FAILURES = 5;

export interface MemberState {
  id: number;
  role: Role;
  term: number;
  leaderId: number;
  failures: number;
  alive: boolean;
  halted: boolean;
  /** Simulated milliseconds (SimClock.now) when the election timer was last reset, or null while it is stopped. */
  timerStart: number | null;
  timerDurationMs: number;
}

/** The latest known state of every member, rebuilt from the event stream. */
export class ClusterState {
  members: MemberState[] = [];

  get size() {
    return this.members.length;
  }

  get majority() {
    return Math.floor(this.size / 2) + 1;
  }

  get aliveCount() {
    return this.members.filter((m) => m.alive).length;
  }

  get term() {
    return this.members.reduce((max, m) => Math.max(max, m.term), 0);
  }

  get leader(): MemberState | undefined {
    return this.members.find((m) => m.alive && m.role === "Leader");
  }

  /** Whether a split vote can find a pair: at least two live, non-halted, non-leader members below the failure limit share a term. */
  get canSplitVote(): boolean {
    const seen = new Set<number>();
    for (const m of this.members) {
      if (!m.alive || m.halted || m.role === "Leader" || m.failures >= MAX_ELECTION_FAILURES) continue;
      if (seen.has(m.term)) return true;
      seen.add(m.term);
    }
    return false;
  }

  /** Applies e and reports whether the cluster was replaced by a new one. */
  apply(e: SimEvent, now: number): boolean {
    if (e.type === "quorum_started") {
      this.members = Array.from({ length: e.members }, (_, id) => ({
        id,
        role: "Follower",
        term: 0,
        leaderId: -1,
        failures: 0,
        alive: true,
        halted: false,
        timerStart: null,
        timerDurationMs: 0,
      }));
      return true;
    }

    const m = this.members[e.member];
    if (!m) return false;
    switch (e.type) {
      case "status":
        m.role = e.role ?? m.role;
        m.term = e.term;
        m.leaderId = e.leaderId;
        m.failures = e.failures;
        m.halted = e.halted;
        m.alive = e.alive;
        if (!m.alive) m.timerStart = null;
        break;
      case "election_timer":
        if (m.alive) {
          m.timerStart = now;
          m.timerDurationMs = e.durationMs;
        }
        break;
      case "election_timer_stopped":
        m.timerStart = null;
        break;
      case "halted":
        m.halted = true;
        break;
      case "stopped":
        m.alive = false;
        m.timerStart = null;
        break;
    }
    return false;
  }
}
