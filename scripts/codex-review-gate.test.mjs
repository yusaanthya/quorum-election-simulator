import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, run } from './codex-review-gate.mjs';
const sha = 'a'.repeat(40);
const user = { id: 199175422, login: 'chatgpt-codex-connector[bot]' };
const summary = (overrides = {}) => ({ user, body: '<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 ' + JSON.stringify({code_review: {commit_sha: sha, status: 'completed', has_any_findings: false, has_unresolved_findings: false, ...overrides}}) + ' -->' });
const finding = (body, overrides = {}) => ({ user, body, original_commit_id: sha, ...overrides });
const check = (comments = [summary()], findings = []) => evaluate({ sha, comments, findings }).state;

test('a completed review of the current SHA passes', () => assert.equal(check(), 'success'));
test('no review, running review and old SHA stay pending', () => {
  assert.equal(check([]), 'pending');
  assert.equal(check([summary({status: 'running'})]), 'pending');
  assert.equal(check([summary({commit_sha: 'b'.repeat(40)})]), 'pending');
});
test('a copied marker by another user is not trusted', () => {
  assert.equal(check([{...summary(), user: {id: 123, login: user.login}}]), 'pending');
});
test('duplicate or malformed summaries fail closed', () => {
  assert.equal(check([summary(), summary()]), 'error');
  assert.equal(check([{user, body: '<!-- codex-pull-request-review-summary --> broken'}]), 'error');
  assert.equal(check([{user, body: '<!-- codex-pull-request-review-summary --><!-- codex-review-state:v1 { -->'}]), 'error');
});
test('unknown or contradictory boolean values fail closed', () => {
  assert.equal(check([summary({has_any_findings: 'false'})]), 'error');
  assert.equal(check([summary({has_unresolved_findings: true})]), 'error');
});
for (const p of [0, 1]) test(`P${p} blocks, even if a thread was manually resolved`, () => {
  assert.equal(check([summary({has_any_findings: true})], [finding(`**[P${p}] Fix this**`)]), 'failure');
});
test('P2/P3 remain advisory even when unresolved', () => {
  assert.equal(check([summary({has_any_findings: true, has_unresolved_findings: true})], [finding('![P2 Badge](url) Optional'), finding('[P3] Nit')]), 'success');
});
test('unclassified or unavailable findings do not pass', () => {
  assert.equal(check([summary({has_any_findings: true})], []), 'error');
  assert.equal(check([summary({has_any_findings: true})], [finding('Unknown priority')]), 'error');
});
test('old findings remapped to the new commit do not override a fresh clean review', () => {
  assert.equal(check([summary()], [finding('[P1] Old issue', {original_commit_id: 'b'.repeat(40), commit_id: sha})]), 'success');
});
test('human findings and bot replies are not new Codex findings', () => {
  assert.equal(check([summary()], [finding('[P1]', {user: {id: 1}}), finding('[P1]', {in_reply_to_id: 1})]), 'success');
});

function harness({comments = [summary()], findings = [], reviews = [], changedHead = false, apiError = false} = {}) {
  const published = [];
  const methods = {comments: () => {}, findings: () => {}, reviews: () => {}};
  let reads = 0;
  const github = {
    rest: {
      pulls: {get: async () => ({data: {state: 'open', base: {ref: 'main'}, head: {sha: (++reads > 1 && changedHead) ? 'b'.repeat(40) : sha}}}), listReviewComments: methods.findings, listReviews: methods.reviews},
      issues: {listComments: methods.comments},
      repos: {createCommitStatus: async status => published.push(status)},
    },
    paginate: async method => {
      if (apiError) throw new Error('API unavailable');
      return method === methods.comments ? comments : method === methods.findings ? findings : reviews;
    },
  };
  const core = { info: () => {}, summary: {addHeading() {return this;}, addRaw() {return this;}, async write() {}} };
  return {published, args: {github, core, context: {repo: {owner: 'owner', repo: 'repo'}, payload: {issue: {number: 30}}, serverUrl: 'https://github.com', runId: 1}}};
}
test('writes status to PR head, first pending then success', async () => {
  const h = harness(); await run(h.args);
  assert.deepEqual(h.published.map(s => s.state), ['pending', 'success']);
  assert.ok(h.published.every(s => s.sha === sha && s.context === 'Codex Review Gate'));
});
test('API failure revokes old success and writes error', async () => {
  const h = harness({apiError: true}); await assert.rejects(run(h.args), /API unavailable/);
  assert.deepEqual(h.published.map(s => s.state), ['pending', 'error']);
});
test('head change during evaluation never receives a stale success', async () => {
  const h = harness({changedHead: true}); await run(h.args);
  assert.deepEqual(h.published.map(s => s.state), ['pending']);
});
test('review-body P1 and changes-requested also block', async () => {
  for (const review of [{body: '[P1] Fix', state: 'COMMENTED'}, {body: '', state: 'CHANGES_REQUESTED'}]) {
    const h = harness({reviews: [{user, commit_id: sha, ...review}]}); await run(h.args);
    assert.equal(h.published.at(-1).state, 'failure');
  }
});

test('priority comes from the title, not explanatory prose', () => {
  const comments = [summary({has_any_findings: true, has_unresolved_findings: true})];
  assert.equal(check(comments, [finding('**<sub><sub>![P2 Badge](https://example.test/P2)</sub></sub> Advisory**\n\nThis explains the P1 policy.')]), 'success');
  assert.equal(check(comments, [finding('[P3] Advisory\nP0 is discussed here.')]), 'success');
  assert.equal(check(comments, [finding('[P4] Unknown\nThis mentions P2.')]), 'error');
  assert.equal(check(comments, [finding('Unclassified\n[P2] Quoted explanation')]), 'error');
});
test('review-body prose does not override a P2 title', async () => {
  const h = harness({comments: [summary({has_any_findings: true, has_unresolved_findings: true})], reviews: [{user, commit_id: sha, state: 'COMMENTED', body: '[P2] Advisory\nThis discusses P1 blocking.'}]});
  await run(h.args);
  assert.equal(h.published.at(-1).state, 'success');
});

test('advisory inline feedback cannot hide an unknown review-body finding', async () => {
  for (const body of ['[P4] Unknown priority', 'Unclassified finding', '[P2] Advisory\n[P4] Unknown priority']) {
    const h = harness({comments: [summary({has_any_findings: true})], findings: [finding('[P2] Advisory')], reviews: [{user, commit_id: sha, state: 'COMMENTED', body}]});
    await run(h.args);
    assert.equal(h.published.at(-1).state, 'error');
  }
});
test('bulleted review-body P1 blocks even alongside an advisory inline finding', async () => {
  const h = harness({comments: [summary({has_any_findings: true})], findings: [finding('[P2] Advisory')], reviews: [{user, commit_id: sha, state: 'COMMENTED', body: '- [P1] Blocking finding'}]});
  await run(h.args);
  assert.equal(h.published.at(-1).state, 'failure');
});
test('known receipt boilerplate is not treated as an unclassified finding', async () => {
  const h = harness({reviews: [{user, commit_id: sha, state: 'COMMENTED', body: '<!-- codex-review-receipt:v1 -->\n### Codex Review\nReviewed commit: abc'}]});
  await run(h.args);
  assert.equal(h.published.at(-1).state, 'success');
});
