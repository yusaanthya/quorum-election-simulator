import { test } from 'node:test';
import assert from 'node:assert/strict';

// Imported straight from the TypeScript source through Node's type stripping,
// as web-hud.test.mjs does. coats.ts is a pure module with no imports.
import { COATS, PATTERNS, coatFor, shellCount } from '../web/src/scene/coats.ts';

const MEMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const DESKTOP = 1280;
const SMALL = 375;
const auto = (n, width) => shellCount(n, width, null);

test('shellCount follows the default table on both sides of the 640 px breakpoint', () => {
  const desktop = [22, 22, 22, 22, 22, 18, 15, 13, 12];
  const small = [22, 22, 16, 12, 10, 8, 7, 6, 6];
  for (const [i, n] of MEMBERS.entries()) {
    for (const width of [1280, 640]) assert.equal(shellCount(n, width, null), desktop[i], `desktop n=${n} w=${width}`);
    for (const width of [639, 375]) assert.equal(shellCount(n, width, null), small[i], `small n=${n} w=${width}`);
  }
});

test('invariant 1: a desktop with 5 members gives 22', () => {
  assert.equal(auto(5, DESKTOP), 22);
});

test('invariant 2: every automatic count is in 6-22', () => {
  for (const n of MEMBERS) {
    for (const width of [DESKTOP, SMALL]) {
      const s = auto(n, width);
      assert.ok(s >= 6 && s <= 22, `n=${n} w=${width} gave ${s}`);
    }
  }
});

test('invariant 3: on each screen class the count does not increase with n', () => {
  for (const width of [DESKTOP, SMALL]) {
    for (let n = 2; n <= 9; n++) assert.ok(auto(n, width) <= auto(n - 1, width), `n=${n} w=${width}`);
  }
});

test('invariant 4: a small screen never gets more shells than a desktop', () => {
  for (const n of MEMBERS) assert.ok(auto(n, SMALL) <= auto(n, DESKTOP), `n=${n}`);
});

test('invariant 5: at 5 members a small screen gets strictly fewer shells than a desktop', () => {
  assert.ok(auto(5, SMALL) < auto(5, DESKTOP));
});

test('invariant 6: on a desktop 9 members get strictly fewer shells than 5', () => {
  assert.ok(auto(9, DESKTOP) < auto(5, DESKTOP));
});

test('invariant 7: on a small screen 9 members get strictly fewer shells than 5', () => {
  assert.ok(auto(9, SMALL) < auto(5, SMALL));
  assert.ok(auto(5, SMALL) > 6);
});

test('9 members on a small screen without an override get at least 6 shells (E6)', () => {
  assert.ok(auto(9, SMALL) >= 6);
});

test('a numeric ?shells value overrides the rule, rounded and clamped to 1-64 (R27, E7)', () => {
  const cases = [['2.6', 3], ['0', 1], ['100', 64], [' 7 ', 7]];
  for (const [raw, want] of cases) {
    for (const n of MEMBERS) {
      for (const width of [DESKTOP, 640, 639, SMALL]) {
        assert.equal(shellCount(n, width, raw), want, `raw=${JSON.stringify(raw)} n=${n} w=${width}`);
      }
    }
  }
});

test('an empty, blank, non-numeric or non-finite ?shells value is ignored (R27, E7)', () => {
  for (const raw of ['', '   ', 'abc', 'Infinity', 'NaN', null]) {
    for (const n of MEMBERS) {
      for (const width of [DESKTOP, SMALL]) {
        assert.equal(shellCount(n, width, raw), auto(n, width), `raw=${JSON.stringify(raw)} n=${n} w=${width}`);
      }
    }
  }
});

test('coatFor picks coat id % 5 with seeds 1-5, raised by 100 per repeat (R12)', () => {
  for (let id = 0; id <= 8; id++) {
    const got = coatFor(id);
    assert.equal(typeof got, 'object');
    assert.equal(got.coat, COATS[id % 5], `id=${id}`);
    assert.equal(COATS.indexOf(got.coat), id % 5, `id=${id}`);
  }
  assert.deepEqual([0, 1, 2, 3, 4].map((id) => coatFor(id).seed), [1, 2, 3, 4, 5]);
  assert.deepEqual([5, 6, 7, 8].map((id) => COATS.indexOf(coatFor(id).coat)), [0, 1, 2, 3]);
  assert.deepEqual([5, 6, 7, 8].map((id) => coatFor(id).seed), [101, 102, 103, 104]);
});

test('patterns drop stripes and the coats come in the owner\'s order (R13)', () => {
  assert.deepEqual([...PATTERNS], ['solid', 'patches', 'points', 'bicolour']);
  assert.equal(COATS.length, 5);
  for (const coat of COATS) assert.ok(PATTERNS.includes(coat.pattern), coat.name);
  const names = COATS.map((c) => c.name);
  for (const [i, word] of ['Bombay', 'white', 'Calico', 'Ragdoll', 'British'].entries()) {
    assert.ok(names[i].includes(word), `coat ${i} is ${names[i]}`);
  }
  assert.deepEqual(COATS.map((c) => c.pattern), ['solid', 'solid', 'patches', 'points', 'bicolour']);
});
