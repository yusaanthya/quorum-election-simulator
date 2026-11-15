const BOT_ID = 199175422;
const BOT_LOGIN = 'chatgpt-codex-connector[bot]';
const CONTEXT = 'Codex Review Gate';
const trusted = (item) => item.user?.id === BOT_ID && item.user?.login === BOT_LOGIN;
const result = (state, description) => ({ state, description });

function titleOf(body) {
  return (body || '').trim().split('\n')[0].replace(/<[^>]*>/g, '').replace(/^[\s#*_>-]+/, '').replace(/^\d+[.)]\s+/, '');
}

function priority(body) {
  // Only the finding title's explicit label is authoritative, never prose.
  const title = titleOf(body);
  const match = title.match(/^(?:\[P([0-3])\](?=\s|$)|!\[P([0-3]) Badge\]\([^)]*\))/);
  return match ? Number(match[1] ?? match[2]) : null;
}

export function evaluate({ sha, comments, findings }) {
  const summaries = comments.filter(c => trusted(c) && c.body?.includes('<!-- codex-pull-request-review-summary -->'));
  if (summaries.length === 0) return result('pending', 'Waiting for Codex review of the latest commit');
  if (summaries.length !== 1) return result('error', 'Ambiguous Codex summaries; inspect the review');
  const matches = [...summaries[0].body.matchAll(/<!-- codex-review-state:v1 ([\s\S]*?) -->/g)];
  if (matches.length !== 1) return result('error', 'Unsupported Codex summary format');
  let review;
  try { review = JSON.parse(matches[0][1]).code_review; } catch { /* Fail closed below. */ }
  if (!review || typeof review.commit_sha !== 'string') return result('error', 'Invalid Codex review state');
  if (review.commit_sha !== sha) return result('pending', 'Waiting for Codex review of the latest commit');
  if (review.status !== 'completed') return result('pending', 'Codex review is not complete');
  if (typeof review.has_any_findings !== 'boolean' || typeof review.has_unresolved_findings !== 'boolean' ||
      (!review.has_any_findings && review.has_unresolved_findings)) {
    return result('error', 'Invalid Codex findings state');
  }
  // Use the original review commit, not commit_id (which GitHub can remap after a push).
  const current = findings.filter(c => trusted(c) && !c.in_reply_to_id && c.original_commit_id === sha);
  const priorities = current.map(c => priority(c.body));
  if (priorities.some(p => p !== null && p <= 1)) return result('failure', 'Codex found P0/P1; fix and push a new commit for review');
  if (priorities.some(p => p === null)) return result('error', 'Unclassified Codex finding; inspect the review');
  if (review.has_any_findings && current.length === 0) return result('error', 'Findings reported but severity could not be verified');
  return result('success', current.length ? 'Latest commit reviewed; P2/P3 findings are advisory' : 'Latest commit reviewed; no blocking findings');
}

export async function run({ github, context, core }) {
  const repo = context.repo;
  const number = Number(context.payload.pull_request?.number || context.payload.issue?.number || context.payload.inputs?.pr_number);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('A valid PR number is required');
  const getPR = async () => (await github.rest.pulls.get({ ...repo, pull_number: number })).data;
  const pr = await getPR();
  if (pr.state !== 'open' || pr.base.ref !== 'main') return;
  const sha = pr.head.sha;
  const publish = async verdict => github.rest.repos.createCommitStatus({
    ...repo, sha, context: CONTEXT, ...verdict,
    target_url: `${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}`,
  });
  // Revoke a previous success before reading APIs; API failures never preserve a green result.
  await publish(result('pending', 'Checking the latest Codex review'));
  try {
    const [comments, findings, reviews] = await Promise.all([
      github.paginate(github.rest.issues.listComments, { ...repo, issue_number: number, per_page: 100 }),
      github.paginate(github.rest.pulls.listReviewComments, { ...repo, pull_number: number, per_page: 100 }),
      github.paginate(github.rest.pulls.listReviews, { ...repo, pull_number: number, per_page: 100 }),
    ]);
    const bodies = reviews.filter(r => trusted(r) && r.commit_id === sha && r.state !== 'PENDING');
    const bodyFindings = bodies.flatMap(r => {
      const body = (r.body || '').trim();
      if (!body) return [];
      // Keep unknown labels too: dropping them would turn ambiguity into approval.
      const candidates = body.split('\n').filter(line => /^(?:!\[P|\[P)/.test(titleOf(line)));
      const entries = candidates.length ? candidates : body.includes('<!-- codex-review-receipt:v1 -->') ? [] : [body];
      return entries.map(body => ({ ...r, body, original_commit_id: r.commit_id }));
    });
    let verdict = evaluate({ sha, comments, findings: [...findings, ...bodyFindings] });
    if (bodies.some(r => r.state === 'CHANGES_REQUESTED')) {
      verdict = result('failure', 'Codex requested changes on the latest commit');
    }
    const latest = await getPR();
    if (latest.head.sha !== sha || latest.state !== 'open') {
      core.info('PR changed during evaluation; leave the old SHA pending. New events evaluate the new head.');
      return;
    }
    await publish(verdict);
    await core.summary.addHeading(CONTEXT).addRaw(`PR #${number} · ${sha}\n\n${verdict.state}: ${verdict.description}\n`).write();
    core.info(`${verdict.state}: ${verdict.description}`);
  } catch (error) {
    await publish(result('error', 'Could not verify Codex review; rerun the gate'));
    throw error;
  }
}

