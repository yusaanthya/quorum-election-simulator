import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Folder under web/src -> folders it may import from (itself is always allowed).
// "." is the entry files directly in web/src (main.ts, concepts.ts).
const ALLOWED = {
  sim: [],
  scene: ['sim', 'assets'],
  scenery: ['scene', 'sim'],
  ui: ['sim'],
  '.': ['sim', 'scene', 'scenery', 'ui'],
};

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'src');
const SPEC = /(?:^|[\s;}])(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"](\.{1,2}\/[^'"]*|\.{1,2})['"]/g;

const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);
const area = (file) => {
  const parts = relative(SRC, file).split(sep);
  return parts.length === 1 ? '.' : parts[0];
};

test('web/src folders import in one direction only', () => {
  const violations = [];
  for (const file of files(SRC)) {
    const from = area(file);
    const name = relative(SRC, file).split(sep).join('/');
    if (!(from in ALLOWED)) {
      violations.push(`${name} -> (unknown top-level folder "${from}"; add it to ALLOWED)`);
      continue;
    }
    for (const m of readFileSync(file, 'utf8').matchAll(SPEC)) {
      const target = resolve(dirname(file), m[1]);
      const to = area(target + '.ts');
      if (to !== from && !ALLOWED[from].includes(to)) {
        violations.push(`${name} -> ${relative(SRC, target).split(sep).join('/')}`);
      }
    }
  }
  assert.deepEqual(violations, [], `forbidden imports:\n${violations.join('\n')}`);
});
