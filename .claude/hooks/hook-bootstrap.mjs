#!/usr/bin/env node
// PreToolUse hook bootstrap. Copy it into the consumer repository and run it as
//   node hook-bootstrap.mjs KIT_GIT_URL
// It fetches the kit commit pinned in .agent-line/manifest.json on the default
// branch of `origin`, checks it out into a temporary directory, and runs that
// checkout's `hook` command with the tool call on stdin. Any failure exits 2,
// which blocks the call.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const git = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.error?.message || '').trim()}`);
  return r.stdout.trim();
};

let tmp = null;
let code = 2;
try {
  const kitUrl = process.argv[2];
  if (!kitUrl) throw new Error('usage: hook-bootstrap.mjs KIT_GIT_URL');
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const input = readFileSync(0);

  git(projectDir, ['fetch', '--quiet', 'origin', 'HEAD']);
  const pin = JSON.parse(git(projectDir, ['show', 'FETCH_HEAD:.agent-line/manifest.json'])).kit;
  if (!/^[0-9a-f]{40}$/.test(pin)) throw new Error('manifest kit is not a 40-character commit SHA');

  tmp = mkdtempSync(join(tmpdir(), 'agent-kit-'));
  git(tmp, ['init', '--quiet']);
  git(tmp, ['fetch', '--quiet', '--depth', '1', kitUrl, pin]);
  git(tmp, ['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
  if (git(tmp, ['rev-parse', 'HEAD']) !== pin) throw new Error('fetched kit commit does not match the pin');

  const r = spawnSync(process.execPath, [join(tmp, 'src/cli.js'), 'hook', '--repo-dir', projectDir], {
    input, stdio: ['pipe', 'inherit', 'inherit'],
  });
  code = r.status === 0 ? 0 : 2;
} catch (error) {
  process.stderr.write(`merge blocked: ${error.message}\n`);
} finally {
  if (tmp !== null) rmSync(tmp, { recursive: true, force: true });
}
process.exit(code);
