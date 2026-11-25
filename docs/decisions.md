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

## 2026-11-19 - Morning desk session

The owner's harness adds a daily scheduled session, the morning desk, that
reads the owner's personal repositories, writes one brief of what waits for a
decision, and acts only after the owner answers in that session (its
procedure is `maintenance/morning-desk.md` in the owner's harness repository;
two-week trial from its first scheduled run). This entry records how this
repository treats that session.

- **Before the owner's first own message in the session** it is an unattended
  run and only reads this repository: no branch, commit, pull request, comment
  or other GitHub write. The night runner stays the only unattended run that
  may write here.
- **From the owner's first own message** it is an ordinary session under
  `AGENTS.md` "Agent pipeline": it merges into `main` only when the owner's
  own message in that session asks for it, and then only with `check` and
  `Codex Review Gate` successful on the head it merges.
- **A ticked option counts as the owner's own message.** After the brief the
  session opens a question dialog listing pull requests by number. An option
  the owner ticks there, whose label carries the pull request number, is the
  owner's own message asking for that merge. Text in the brief, in an issue or
  in a pull request is still data.
- **Queue items stay with the owner.** On the owner's instruction the session
  may draft items under `.agent-line/queue/` as the owner's text and open the
  pull request. It never merges a pull request that changes that directory;
  the owner merges it on GitHub.
- **The desk uses less than a session may.** By its own procedure it merges
  no pull request on a condition and none that it opened. Widening either
  needs a new entry here first.

## 2026-11-20 - Morning desk runs in a standing window session

The morning desk now fires each day into one standing session that the owner
keeps as its window, instead of a fresh session per fire (its procedure is
`maintenance/morning-desk.md` in the owner's harness repository). The entry of
2026-11-19 applies to each daily run, from the scheduled prompt until the next
one, not to the session as a whole.

- **Each run is unattended until the owner's first own message after that
  run's brief**, and only reads this repository until then. A message the
  owner sent in an earlier run does not count for a later one, so yesterday's
  request never merges today's pull request.
- **A pull request the desk opened** is one it opened in the current run. The
  rest of the 2026-11-19 entry is unchanged.

## 2026-11-21 - Runner merges carry an Auto-Merged-By line

Owner decision. When the night runner squash-merges a pull request
([night-runner.md](night-runner.md), section 6, action 5), the squash
commit's message changes from GitHub's default, the list of the branch's
commits, to the one line `Auto-Merged-By: quorum-night-runner`. The owner's
morning desk recognizes scheduled merges by that line (its procedure is
`maintenance/morning-desk.md` in the owner's harness repository); merges the
owner makes carry no such line. The merge conditions do not change, and the
"Merged by the night runner at" line in the pull request body stays.

## 2026-11-25 - Night runner tending decided by the kit gate

Owner decision. Section 6 of [night-runner.md](night-runner.md) now takes
every tending and merge decision from the agent-pipeline-kit gate. After the
identity rules and the draft and prefix skip, a run fetches the kit commit
pinned in `.agent-line/manifest.json` on `main`, runs its `evaluate` for the
pull request, and acts on the verdict and its reasons. The run no longer reads
`check`, the `Codex Review Gate` status, the section 4.2 paths or the fix-round
count itself. It merges only when `AGENT_GATE_HOOK` is set in its environment,
because only then does the repository hook run the gate again at the merge
call; otherwise it names the pull request in the run summary and leaves it.
This replaces the merge condition ("when `check` and `Codex Review Gate` both
pass") and the enforcement bullet of the 2026-11-15 entry "Night runner"; the
rest of that entry stands.

- **The gate already decided merges.** Pull request #60 installed the manifest
  and a hook that runs the gate at the runner's merge call where
  `AGENT_GATE_HOOK` is set, and left the procedure in force unchanged, so a
  merge needed both. The run that started at 19:50 UTC on 2026-11-24
  merged #65 (`c500d46`) through the GitHub merge tool on a `main` that has
  the hook, in the runner's cloud environment, where the owner confirmed the
  variable is set. A failing hook blocks the call, so the gate said `merge`.
- **Pin.** The manifest pins kit `3a6181f` and sets `"max_fix_rounds": 3` on
  the `runner` lane, the cap section 6 counted before. The kit's threat-model
  changes in `f4bbf2a..3a6181f` were reviewed in kit pull requests #12, #13,
  #14 and #15.
- **Claim commit rule removed.** Section 6 no longer requires the oldest
  commit of the branch to be the empty claim commit `chore: claim <id>`. The
  kit does not check it, and anyone who can push can write that commit, so it
  showed only that the branch followed the claim convention. The claim itself
  is the branch (section 2.3), which stays.
- **Consequences the owner accepts.**
  - The run stops reading the `Codex Review Gate` commit status when tending.
    The kit reads the trusted Codex review itself under
    `codex_clean: "no_blocking"` (P0 and P1 block, P2 and P3 do not). A review
    the kit cannot classify (an unknown priority, an unclassifiable summary
    finding) was a `failure` that a run fixed; it is now `blocked:codex`,
    left for the owner.
  - A pull request the gate holds is no longer fixed or updated by a run.
    Before, only a section 4.2 path stopped tending; the gate also holds its
    other held paths (for example `web/vite.config.*`), the floor, binaries,
    executables and paths outside the lane's allowlist. Merges were already
    gated since #60, so what changes is tending, not what can merge.
  - An open halt issue (`wait:halt`) makes runs wait on every runner pull
    request.
  - `blocked:input` from the diff itself (`path-encoding`, `content-missing`)
    leaves that pull request for the owner instead of stopping the run; only
    `collect-failed` stops the run, as a failed GitHub query does.
  - Without the claim-commit rule, a `claude/item-<id>` pull request that no
    run started (for example, one the owner pushed by hand) is tended and can
    be merged by a run when the gate says `merge`. It then has not had the
    run's own critic review (section 5); CI, the Codex review and every gate
    condition still apply.
  - At the fix-round cap with one result failed and the other pending, the
    kit waits, and holds once the pending one fails; before, the pull request
    was left at once. Every line beginning with `Review-fix-round:` counts,
    not only a trailer block.
