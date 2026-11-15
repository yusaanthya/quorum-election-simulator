# Codex review merge gate

Native Codex reviews code; `check` runs gofmt, go vet, the Go tests and both
front-end builds. This workflow only translates the existing native review into
the commit status **Codex Review Gate**. It does not call a model, use an
OpenAI API key, approve PRs, repair code or merge PRs.

## Policy

- Only the pinned Codex bot account's summary and findings are trusted.
- A completed code review must match the PR's current full head SHA.
- Missing, running or stale reviews remain pending. Invalid data and API errors
  block rather than pass. Security reviews are separate and are not gated here.
- P0/P1 findings on that commit block. Manually resolving a thread is not a
  substitute for a fix: push a new commit and let Codex review it again.
- Recognized P2/P3 findings are advisory. Unknown priorities or summary findings
  that cannot be classified block for inspection, rather than silently pass.
- Findings use `original_commit_id`; GitHub may remap `commit_id` after pushes.
  A fresh clean review supersedes findings from previous commits.
- Review-body P0/P1 and an explicit changes-requested review also block.

The summary adapter uses the observed `codex-review-state:v1` HTML marker.
This is not a guaranteed stable API. Format changes require updating the
adapter and fixtures. No findings and no summary are different states.

## Activation (one-time, after merging this implementation)

1. Keep the existing required `check` rule. Do not require the gate before the
   workflow is available on main, or the bootstrap PR cannot merge.
2. On a small open PR, wait for native review and run **Update Codex Review Gate**
   from Actions on **main**, entering its PR number. This seeds the new status
   for an already-reviewed PR without triggering another model review.
3. In Settings > Rules > Rulesets > main > Require status checks to pass,
   add **Codex Review Gate**, selecting GitHub Actions as the expected source
   when offered. Preserve `check` and no bypass actors.
   Require the emitted commit status, NOT the job named **Update review status**.
4. Verify that a new head SHA is blocked until both required checks pass. Confirm
   a bot summary update automatically refreshes the gate. If pull_request_target
   events are blocked by repository Actions policy, enable this trusted workflow's
   event or use manual dispatch to diagnose; missing status must remain blocking.

Before activation the code alone does not enforce merges. This document does
not assert that the repository ruleset has already been changed.

## Events, permissions and recovery

PR open/synchronize/reopen/ready events initialize the status. Bot issue-comment
create/edit/delete events reevaluate it, including the sticky summary updates.
Each run fetches all pages of comments and reviews, reads the current PR, and
writes to its head SHA rather than the default branch SHA of the event.
Evaluations for a PR are serialized and recheck the head before publishing.

The privileged workflow always checks out main, never PR code, installs no
project dependencies and uses only read permissions plus `statuses: write`.
The normal `check` job runs the gate's tests with a read-only token. Do not
grant untrusted workflows permission to forge this status: this is a repository
workflow gate, not isolation from maintainers who can edit trusted workflows.

No event system provides an atomic lock between reading review state and merging.
A new commit has a new required status; a repeated review of the same SHA only
revokes a prior success once its running event is processed. Claude should still
recheck the head and current review before merging, and merge with an expected
head SHA. Do not start another same-SHA review concurrently with a merge.

If an event was missed, use manual dispatch on main with the PR number. It reads
fresh state; it does not use event text as an approval. Errors show in the status
link's run log. Do not change a failed status manually to success.

Review after a push: Codex reviews a pull request when it opens or is marked
ready for review. In this repository it does not review later commits on its
own, so after pushing to an open pull request, comment `@codex review` on it.
Until that review completes, the status on the new head stays pending.

Known limitation, accepted on 2026-11-15: `pull_request_review` and
`pull_request_review_comment` events do not reevaluate the gate. If an inline
finding or a review body arrives or is edited after the summary comment's last
update, the status keeps the verdict from that update until the next summary
update, push or manual dispatch. A finding that arrives late usually leaves
the status at `error` ("Findings reported but severity could not be
verified"), which a manual dispatch clears; a finding whose severity is edited
upward after a success is not noticed. yusa-CV runs the same adapter with the
same limitation. Closing it needs a separate unprivileged workflow that
listens to review events and a `workflow_run` trigger here, as ibanny-cafe's
variant has.

Stuck at `error` after a later commit, observed on #14 (2026-11-15): Codex's
summary keeps counting a finding while its thread is still open on unchanged
lines, but the adapter accepts only findings made on the head commit. When a
later commit leaves an earlier finding's lines untouched, the head gets
`error` ("Findings reported but severity could not be verified") even if
Codex's review of the head is clean. Rerunning the gate does not clear it: it
reads the same evidence. Ways out:

- Change the lines the finding points at. The thread becomes outdated and
  stops counting (seen in yusa-CV #33).
- As the owner, remove `Codex Review Gate` from the ruleset's required checks,
  merge, and add it back.

Whether resolving the conversation clears it has not been verified. An agent
must not resolve Codex's conversations to get past the gate.

## Validation

Run `node --test scripts/*.test.mjs`, which includes
`scripts/codex-review-gate.test.mjs` (also in the `check` job).
Fixtures cover P0/P1 blocking, P2/P3 advisory, spoofed/malformed/stale summaries,
old remapped findings, API errors and a head change while checking. Hosted event
and ruleset behavior must additionally be verified after merging and activation;
a test fixture is not evidence that branch protection is enabled.

## Auto-merge

After activation, with auto-merge allowed in the repository settings and
`check` and `Codex Review Gate` both required, a pull request with auto-merge
enabled merges once CI passes and Codex has reviewed its head commit with no
blocking finding.

Do not enable auto-merge on a pull request that changes the gate itself. Its
`Codex Review Gate` status is produced by the copy on `main`, so a passing
status says nothing about the change:

- A change to `.github/workflows/codex-review-gate.yml` can be tried before
  merge by a manual dispatch of the workflow from the pull request's branch.
  A dispatch uses that branch's workflow file, but the workflow still checks
  out `main`, so it runs the script from `main`.
- A change to `scripts/codex-review-gate.mjs` is exercised before merge only
  by its unit tests in the `check` job. Its behavior on hosted events can be
  confirmed only after merge, with a manual dispatch on `main`.
