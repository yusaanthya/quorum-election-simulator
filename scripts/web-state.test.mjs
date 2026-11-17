import { test } from 'node:test';
import assert from 'node:assert/strict';

// Imported straight from the TypeScript source through Node's type stripping
// (on by default from Node 22.18), so this runs before `npm ci` with no build
// step and no dependency. state.ts imports only types, which are erased.
import { ClusterState } from '../web/src/sim/state.ts';

// A SimEvent with every field at its zero value, as core.Event marshals it.
const ev = (type, fields = {}) => ({
  type,
  member: 0,
  peer: 0,
  granted: false,
  term: 0,
  leaderId: 0,
  votes: 0,
  failures: 0,
  halted: false,
  alive: false,
  contacted: 0,
  durationMs: 0,
  members: 0,
  paused: false,
  timeScale: 0,
  ...fields,
});

const started = (members) => {
  const c = new ClusterState();
  c.apply(ev('quorum_started', { members }), 0);
  return c;
};

const fresh = (id) => ({
  id,
  role: 'Follower',
  term: 0,
  leaderId: -1,
  failures: 0,
  alive: true,
  halted: false,
  timerStart: null,
  timerDurationMs: 0,
});

test('quorum_started builds a fresh cluster and reports it', () => {
  const c = new ClusterState();
  assert.equal(c.apply(ev('quorum_started', { members: 3 }), 0), true);
  assert.deepEqual(c.members, [fresh(0), fresh(1), fresh(2)]);
  assert.equal(c.size, 3);
  assert.equal(c.majority, 2);
  assert.equal(c.aliveCount, 3);
  assert.equal(c.term, 0);
});

test('quorum_started replaces the previous cluster', () => {
  const c = started(5);
  c.apply(ev('status', { member: 1, role: 'Leader', term: 4, leaderId: 1, alive: true }), 0);
  c.apply(ev('election_timer', { member: 2, durationMs: 300 }), 10);
  c.apply(ev('stopped', { member: 3 }), 0);

  assert.equal(c.apply(ev('quorum_started', { members: 3 }), 20), true);
  assert.deepEqual(c.members, [fresh(0), fresh(1), fresh(2)]);
  assert.equal(c.majority, 2);
  assert.equal(c.leader, undefined);
});

test('events other than quorum_started do not report a new cluster', () => {
  const c = started(3);
  for (const type of ['status', 'election_timer', 'election_timer_stopped', 'halted', 'stopped', 'clock']) {
    assert.equal(c.apply(ev(type, { member: 1, alive: true }), 0), false, type);
  }
});

test('events before any cluster or for an unknown member are ignored', () => {
  const empty = new ClusterState();
  assert.equal(empty.apply(ev('status', { role: 'Leader', alive: true }), 0), false);
  assert.deepEqual(empty.members, []);

  const c = started(3);
  assert.equal(c.apply(ev('stopped', { member: 7 }), 0), false);
  assert.equal(c.apply(ev('status', { member: -1, role: 'Leader', alive: true }), 0), false);
  assert.deepEqual(c.members, [fresh(0), fresh(1), fresh(2)]);
});

test('status updates role, term, leader, failures, halted and liveness', () => {
  const c = started(3);
  c.apply(ev('status', { member: 1, role: 'Candidate', term: 2, leaderId: -1, failures: 1, alive: true }), 0);
  assert.deepEqual(c.members[1], { ...fresh(1), role: 'Candidate', term: 2, failures: 1 });

  c.apply(ev('status', { member: 1, role: 'Leader', term: 2, leaderId: 1, failures: 0, alive: true }), 0);
  assert.deepEqual(c.members[1], { ...fresh(1), role: 'Leader', term: 2, leaderId: 1 });
  assert.equal(c.term, 2);

  c.apply(ev('status', { member: 2, role: 'Follower', term: 5, leaderId: 1, failures: 3, halted: true, alive: true }), 0);
  assert.deepEqual(c.members[2], { ...fresh(2), term: 5, leaderId: 1, failures: 3, halted: true });
  assert.equal(c.term, 5);

  // Other members are untouched.
  assert.deepEqual(c.members[0], fresh(0));
});

test('status without a role keeps the current role', () => {
  const c = started(3);
  c.apply(ev('status', { member: 0, role: 'Leader', term: 1, leaderId: 0, alive: true }), 0);
  c.apply(ev('status', { member: 0, term: 2, leaderId: 0, alive: true }), 0);
  assert.equal(c.members[0].role, 'Leader');
  assert.equal(c.members[0].term, 2);
});

test('status reporting a dead member clears its countdown', () => {
  const c = started(3);
  c.apply(ev('election_timer', { member: 2, durationMs: 300 }), 50);
  c.apply(ev('status', { member: 2, role: 'Follower', term: 1, leaderId: -1, alive: false }), 60);
  assert.equal(c.members[2].alive, false);
  assert.equal(c.members[2].timerStart, null);
  assert.equal(c.aliveCount, 2);
});

test('election_timer starts the countdown at the simulated time it is applied', () => {
  const c = started(3);
  // The time passed to apply is simulated milliseconds (SimClock.now), and
  // durationMs is simulated milliseconds too; both are stored unchanged.
  c.apply(ev('election_timer', { member: 1, durationMs: 275 }), 1234.5);
  assert.equal(c.members[1].timerStart, 1234.5);
  assert.equal(c.members[1].timerDurationMs, 275);

  // A reset restarts the countdown from the new time with the new timeout.
  c.apply(ev('election_timer', { member: 1, durationMs: 190 }), 2000);
  assert.equal(c.members[1].timerStart, 2000);
  assert.equal(c.members[1].timerDurationMs, 190);
});

test('election_timer_stopped clears the countdown', () => {
  const c = started(3);
  c.apply(ev('election_timer', { member: 0, durationMs: 300 }), 100);
  c.apply(ev('election_timer_stopped', { member: 0 }), 150);
  assert.equal(c.members[0].timerStart, null);
});

test('election_timer for a dead member is ignored', () => {
  const c = started(3);
  c.apply(ev('stopped', { member: 1 }), 0);
  c.apply(ev('election_timer', { member: 1, durationMs: 300 }), 100);
  assert.equal(c.members[1].timerStart, null);
  assert.equal(c.members[1].timerDurationMs, 0);
});

test('stopped marks the member down and clears its countdown', () => {
  const c = started(3);
  c.apply(ev('election_timer', { member: 2, durationMs: 300 }), 10);
  c.apply(ev('stopped', { member: 2 }), 20);
  assert.equal(c.members[2].alive, false);
  assert.equal(c.members[2].timerStart, null);
  assert.equal(c.aliveCount, 2);
  // Majority counts every member, alive or not.
  assert.equal(c.majority, 2);
});

test('halted marks the member halted and leaves it alive', () => {
  const c = started(3);
  c.apply(ev('halted', { member: 0 }), 0);
  assert.equal(c.members[0].halted, true);
  assert.equal(c.members[0].alive, true);
});

test('clock events leave the members unchanged', () => {
  const c = started(3);
  c.apply(ev('election_timer', { member: 0, durationMs: 300 }), 40);
  const before = structuredClone(c.members);
  c.apply(ev('clock', { paused: true, timeScale: 5 }), 80);
  c.apply(ev('clock', { paused: false, timeScale: 1 }), 90);
  assert.deepEqual(c.members, before);
});

test('leader returns only a live leader', () => {
  const c = started(3);
  assert.equal(c.leader, undefined);

  c.apply(ev('status', { member: 1, role: 'Leader', term: 1, leaderId: 1, alive: true }), 0);
  assert.equal(c.leader, c.members[1]);

  // A stopped leader is not the leader, even though its last role was Leader.
  c.apply(ev('stopped', { member: 1 }), 0);
  assert.equal(c.members[1].role, 'Leader');
  assert.equal(c.leader, undefined);

  // A status reporting the leader dead has the same effect.
  c.apply(ev('status', { member: 2, role: 'Leader', term: 2, leaderId: 2, alive: true }), 0);
  assert.equal(c.leader, c.members[2]);
  c.apply(ev('status', { member: 2, role: 'Leader', term: 2, leaderId: 2, alive: false }), 0);
  assert.equal(c.leader, undefined);
});
