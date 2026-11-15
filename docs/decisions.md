# Decisions

Dated decisions for this repository, newest first. A decision is changed by
adding a new entry that names the one it replaces, not by editing history.

## 2026-11-15 - Night runner

The owner authorizes one unattended run in this repository: the Claude Code
cloud scheduled task described in [night-runner.md](night-runner.md). No other
unattended run may write to this repository (a branch, commit, pull request,
comment, or any other GitHub write).

- **Merging and deploying.** Once rollout step R3 of that file is enabled, a
  run may squash-merge its own `claude/item-<id>` pull request into `main`
  when `check` and `Codex Review Gate` both pass. Every merge to `main`
  deploys the site, and the owner accepts that for this side project.
- **Review.** A runner change is reviewed by one fresh Claude critic subagent
  and by the native Codex review behind `Codex Review Gate`. No second local
  critic is required.
- **Enforcement.** Branch rules cannot stop a session that acts with the
  owner's access, so the runner's limits are enforced by its prompt and
  procedure only. The owner accepts this, as in ibanny-cafe.
- **Broken deploys.** A run never reverts a merge. If a runner merge breaks
  the site, the owner reverts it or queues a fix; the runner's preflight stops
  the queue while the `CI` run on `main` is not successful.
- **Releases.** Version bumps, tags and release notes stay with the owner.
- **Repository settings** the runner relies on, as the owner reported them on
  2026-11-15 (they are not visible from the repository itself): the `main`
  ruleset requires `check` and `Codex Review Gate`, and head branches are
  deleted automatically after a merge.

## 2026-11-15 - Unverified checks do not block a runner merge

Some plans, such as those under `docs/sim-clock/`, let a check that needs a
person be recorded as open for the owner and then forbid merging while a check
is open. For runner pull requests the owner lifts that rule: a check the run
could not perform is listed under `## Unresolved` in the pull request body and
does not stop the runner from merging once `check` and `Codex Review Gate`
pass. The owner accepts that a visible fault nobody looked at can reach the
deployed site. A check that was run and failed still blocks. To hold one item
for a look before it merges, the owner sets `merge: owner` on it.

## 2026-11-15 - Plans run by the night runner

The plans under `docs/sim-clock/` say they are run with the `convergent-impl`
skill, on a branch the owner prepares, with a clean working tree. That skill
needs tools a cloud session does not have. When a queue item points at a plan,
the night runner implements the plan's tasks directly under
[night-runner.md](night-runner.md), section 2.2, and the plan's text about how
it is run does not apply. The plan's tasks, file lists and acceptance criteria
still do. A plan run locally by the owner keeps using `convergent-impl`.
