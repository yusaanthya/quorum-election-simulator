import { test } from 'node:test';
import assert from 'node:assert/strict';

// Imported straight from the TypeScript source through Node's type stripping,
// as web-state.test.mjs does. hud.ts touches the DOM only inside the Hud class,
// so importing it needs no DOM.
import { formatFactor } from '../web/src/ui/hud.ts';

test('formatFactor keeps at most two decimals and no trailing zeros', () => {
  assert.equal(formatFactor(3.3000000000000003), '3.3');
  assert.equal(formatFactor(1.25), '1.25');
  assert.equal(formatFactor(1.236), '1.24');
  assert.equal(formatFactor(9), '9');
});

test('formatFactor leaves the presets and their election factors unchanged', () => {
  for (const scale of [1, 2, 3, 5, 10, 20]) {
    assert.equal(formatFactor(scale), String(scale));
    assert.equal(formatFactor(scale * 3), String(scale * 3));
  }
});
