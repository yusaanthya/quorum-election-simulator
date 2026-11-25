import { test } from 'node:test';
import assert from 'node:assert/strict';

// Imported straight from the TypeScript source through Node's type stripping
// (on by default from Node 22.18), so this runs before `npm ci` with no build
// step and no DOM. fps.ts has no imports and touches `document` only inside
// createFpsMeter, which this test does not call.
import { formatFps } from '../web/src/ui/fps.ts';

test('formatFps shows one decimal below 10 fps', () => {
  assert.equal(formatFps(4.6), '4.6');
  assert.equal(formatFps(0.2), '0.2');
  assert.equal(formatFps(9.94), '9.9');
  assert.equal(formatFps(0), '0.0');
});

test('formatFps shows a whole number from 10 fps', () => {
  assert.equal(formatFps(10), '10');
  assert.equal(formatFps(59.7), '60');
});

test('formatFps rounds 9.96 up to a whole 10, never 10.0', () => {
  assert.equal(formatFps(9.96), '10');
});
