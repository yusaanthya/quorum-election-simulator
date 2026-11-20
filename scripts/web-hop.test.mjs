import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HOP_INTERVAL, HopSchedule } from '../web/src/scene/hop.ts';

const H = 1 / 240;

// Runs the schedule for `seconds` and returns the time of each takeoff.
// A takeoff is followed by an instant landing, which is enough to test timing.
function run(clock, seconds, hopping, takeoffs = []) {
  for (let i = 0; i < Math.round(seconds / H); i++) {
    if (clock.tick(H, hopping, true)) {
      takeoffs.push(clock.simT);
      clock.landed();
    }
  }
  return takeoffs;
}

test('two followers idle past one hop interval take off out of phase on the same Split vote', () => {
  const a = new HopSchedule(0.5);
  const b = new HopSchedule(4.5);
  run(a, HOP_INTERVAL * 2, false);
  run(b, HOP_INTERVAL * 2, false);
  const ta = run(a, 6, true);
  const tb = run(b, 6, true);
  const t0 = HOP_INTERVAL * 2;
  assert.ok(ta.length >= 2 && tb.length >= 2);
  // The first takeoff keeps each cat's own offset after it became a candidate.
  assert.ok(Math.abs(ta[0] - t0 - (0.5 / (Math.PI * 2)) * HOP_INTERVAL) < 2 * H);
  assert.ok(Math.abs(tb[0] - t0 - (4.5 / (Math.PI * 2)) * HOP_INTERVAL) < 2 * H);
  // Later takeoffs stay apart by the same offset difference.
  assert.ok(Math.abs(ta[1] - tb[1]) > 0.5);
});

test('re-entering candidacy after idling restores the phase offset', () => {
  const a = new HopSchedule(0.5);
  const b = new HopSchedule(4.5);
  for (const c of [a, b]) {
    run(c, 3, true);
    run(c, HOP_INTERVAL * 2, false);
  }
  const t0 = 3 + HOP_INTERVAL * 2;
  const ta = run(a, 3, true).filter((t) => t > t0);
  const tb = run(b, 3, true).filter((t) => t > t0);
  assert.ok(Math.abs(ta[0] - tb[0]) > 0.5);
});

test('a candidate from the first frame takes off at its phase offset', () => {
  const t = run(new HopSchedule(Math.PI), 3, true);
  assert.ok(Math.abs(t[0] - HOP_INTERVAL / 2) < 2 * H);
});
