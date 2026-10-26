# Task plan: Makefile cleanup (quorum-election-simulator)

Status: converged after 2 convergent-spec plan rounds (Claude critic + Codex critic, both BLOCKING: none in round 2)
Spec: `docs/makefile-cleanup/01-spec.md` (confirmed; gate decisions D1, D2, D3 = D3-a, D4, D5, D6 settled in spec section 6)
Target repository: `/home/yusa1104/project/split-repo-test/quorum-election-simulator` (session cwd)
Branch: `build/yusa_liu/makefile_cleanup` (existing, created from `origin/main` = `f3f5d80`)
Date: 2026-10-27

Round 2 changes are limited to the round-1 BLOCKING issues: Claude B1 (copy step),
B2 (negative assertions), B3 + Codex BLOCKING 2 (docs commit, now authorized by
D5), B4 + Codex BLOCKING 3 (AC10 withdrawn by D6), Codex BLOCKING 1 (starting
state), Codex BLOCKING 4 (environment `VERSION` assertion).

## 0. Verified starting state (checked while drafting)

| Claim | Evidence |
|---|---|
| `origin/main` head is `f3f5d80 build: upgrade version to v0.2.0 (#5)`. | `git log --oneline -3 origin/main` |
| `Makefile` is tracked and unmodified; it still has `VERSION ?= dev` (line 12), `BIN_DIR := bin` (line 9), `mkdir -p $(BIN_DIR)/log` (line 27), `-o ./$(BIN_DIR)/...` (line 28), and `;`-joined `$(MAKE)` calls in `all` / `build-quorum-election-all` (lines 35, 38). No `.PHONY`. | Read `Makefile`; `git status --short` lists no `M Makefile` |
| `docs/makefile-cleanup/` holds exactly `01-spec.md`, `reference-makefiles.md`, `evidence-offline.md`, all untracked. The final task plan is not there yet; it is expected at `docs/makefile-cleanup/02-plan.md` once this plan is confirmed (checked in Task 1). | `find docs/makefile-cleanup -type f`; `git status --short` (`?? docs/makefile-cleanup/`) |
| Untracked repository paths other than the docs are `app` and `log/log_output.txt`; both are unrelated and never staged. (This session's Bash sandbox also shows mounted placeholder entries in `git status`; they are not repository state. Explicit-path staging, below, never touches them either way.) | `git status --short`; `git ls-files` (no dotfiles tracked) |
| Tracked build inputs: `Makefile`, `go.mod`, `go.sum`, `cmd/`, `internal/`, `log/` (`log/.gitkeep`). `log/` is the tracked directory that AC8 requires to survive `clean` and that AC3 uses as the binary's working directory. | `git ls-files` |
| Module path `github.com/Anthya1104/quorum-election-cli`; `internal/config/config.go:3` is `var Version = "0.2.0"`; `readme.md:62` is the only make-target reference. | `grep -n` on `go.mod`, `internal/config/config.go`, `readme.md` |
| The binary's log output goes to stdout plus `log/log_output.txt` (`internal/logger/logger.go:14-15`, `io.MultiWriter(os.Stdout, file)`), so the `version` assertions read stdout of a run whose working directory contains `log/`. | `grep -n` on `internal/logger/logger.go` |
| Local toolchain: GNU Make 4.3 (same as the spec's evidence runs). | `make --version` |

Script techniques prescribed in Task 4 were verified in a throwaway copy
(`$TMPDIR/plancheck-r2`, spec section 8 sketch as Makefile, `GOCACHE=$TMPDIR/gocache`,
`set -eu` script):

- `mkdir -p <copy>` + `cp -r <repo>/Makefile <repo>/go.mod <repo>/go.sum <repo>/cmd <repo>/internal <repo>/log <copy>/`
  succeeds and the copy builds (`make -C <copy> build-quorum-election-linux-amd64`).
  (Claude round-1 run (c): `cp -r <repo>` of the whole repository exits 1 in this sandbox.)
- `env VERSION=8.8.8-env make -C <copy> build-quorum-election-linux-amd64`, with no
  command-line `VERSION`, injected the value: the binary printed `msg="Version: 8.8.8-env"`
  and `go version -m` showed `-X '...config.Version=8.8.8-env'`.
- `if grep -qF '<str>' <input>; then exit 1; fi` passes when the string is absent
  and its positive control detects a present string. (Claude round-1 run (a):
  a bare `! grep -F` never stops a `set -e` script.)
- `if make -C <copy> all VERSION=0.2.0; then exit 1; fi` passes when `make` fails
  (windows-only type error) and does not stop the script.

## 1. Docs commit and AC11 (owner decision D5)

The spec, its two reference files and the final task plan are committed under
`docs/makefile-cleanup/`, in a commit separate from the `Makefile` change. The
authorization is owner decision D5 (spec section 6); AC11, as amended by D5,
limits code and build files to `Makefile` and allows `docs/makefile-cleanup/`.

To keep the boundary mechanically checkable, the plan:

1. Commits the docs in their **own commit** (Task 2), before the Makefile is
   touched, staged by explicit path. No code goes in that commit.
2. Checks AC11 (Task 6):
   - before the Makefile commit, `git diff --stat` (worktree vs `HEAD`, which
     already contains the docs commit) lists `Makefile` only;
   - after the Makefile commit, `git show --stat HEAD` lists `Makefile` only;
   - `git diff --stat origin/main HEAD` lists exactly `Makefile` plus the four
     `docs/makefile-cleanup/` files, and nothing else.
3. Never stages unrelated untracked paths (`app`, `log/log_output.txt`). Every
   `git add` names its paths explicitly; `git add -A` / `git add .` are not used.

## 2. Gates and out-of-scope items

- **Human gates.** Push, PR creation and merge are not performed by this plan.
  Task 7 prepares them and stops for owner confirmation. Local commits on the
  existing branch (Tasks 2 and 6) are part of implementation.
- **v0.2.0 release is not part of this plan.** Tagging `v0.2.0`, building the
  release binaries (`make clean all VERSION=...` per spec D4 release practice),
  packaging the archive and publishing the GitHub release are a follow-up
  (section 6).
- **No committed test artifact** (D3 = D3-a): the verification script lives
  under `$TMPDIR`, is run once, and its content, full output and exit status are
  recorded in the implementation report (spec 4.1).
- **`.PHONY`** (D6): REQ-14 and AC10 are withdrawn. Declaring `.PHONY` per spec
  section 8 guidance is allowed in Task 3 but has no acceptance check.
- Spec section 9 follow-ups (goreleaser, `CGO_ENABLED=0`, `-trimpath`, logger
  `OpenFile` error, default goal `all`, `.gitignore` for `bin/`, the stray `app`
  binary) are not implemented.

## 3. Tasks (execution order)

### Task 1 — Pre-flight baseline (read-only)

Confirm the starting point before any change:

- `git rev-parse --abbrev-ref HEAD` is `build/yusa_liu/makefile_cleanup`;
  `git merge-base HEAD origin/main` is `f3f5d80...` and `git log origin/main..HEAD`
  is empty (branch has no commits of its own yet).
- `git status --short` shows no tracked modification (in particular, no
  `M Makefile`).
- `docs/makefile-cleanup/` contains `01-spec.md`, `reference-makefiles.md`,
  `evidence-offline.md` and the final task plan `02-plan.md`. If `02-plan.md` is
  missing, stop and ask the owner (it is part of the D5 docs commit).
- Baseline sanity of the unchanged Go sources:
  `GOCACHE=$TMPDIR/gocache go build ./...` and
  `GOCACHE=$TMPDIR/gocache go test ./...` both pass.
- `go version` and `make --version` recorded for the report (spec evidence used
  go1.24.1 and GNU Make 4.3).

Depends on: none.
Done when: all checks above hold and their output is noted for the
implementation report. If any check fails, stop and report instead of
continuing.

### Task 2 — Commit the documentation (D5)

Stage and commit exactly the four documentation files:

- `git add docs/makefile-cleanup/01-spec.md docs/makefile-cleanup/reference-makefiles.md docs/makefile-cleanup/evidence-offline.md docs/makefile-cleanup/02-plan.md`
- Commit message (English):
  `docs(makefile-cleanup): add Makefile cleanup spec, reference evidence and task plan`,
  ending with the required `Co-Authored-By` attribution line.

Depends on: Task 1.
Done when: `git show --stat HEAD` lists exactly those four files and nothing
else; `git status --short` no longer lists `docs/makefile-cleanup/`; `app` and
`log/log_output.txt` are still untracked.

### Task 3 — Rewrite `Makefile`

Rewrite `Makefile` so that it meets spec section 3. Binding outcomes (each one is
verified later by the AC named in brackets):

- REQ-1: targets `all`, `build-quorum-election-all`, `clean`, `init` and the six
  `build-quorum-election-<os>-<arch>` targets exist with these names [AC1, AC5,
  AC6, AC7, AC8, AC9].
- REQ-2: `BIN_DIR := bin` (stays `:=`, command-line override only, not read from
  the environment); `VERSION` stays `?=` (command line and environment) [AC2,
  AC8, AC12, AC3, REQ-2 environment check in Task 4].
- REQ-3: outputs `$(BIN_DIR)/quorum-election/quorum_election_app_<os>_<arch>`,
  `.exe` exactly for `windows` [AC1, AC2, AC6].
- REQ-4: `GOOS=<os> GOARCH=<arch> go build ... ./cmd/main.go`; no build flags
  added or removed apart from the REQ-6 ldflags rule [reviewed in Task 6].
- REQ-5: `make` with no target still runs `init` only (keep `init` as the first
  rule) [AC9].
- REQ-6 / REQ-7 (D1): drop the `dev` default; pass
  `-ldflags "-X 'github.com/Anthya1104/quorum-election-cli/internal/config.Version=$(VERSION)'"`
  only when `VERSION` is non-empty [AC3, AC4].
- REQ-9 / REQ-10: no `./` or other prefix on `$(BIN_DIR)` anywhere; `clean`
  stays `rm -rf $(BIN_DIR)` [AC2, AC8, AC12].
- REQ-11 (D2): each per-platform target creates `$(BIN_DIR)/quorum-election/log`;
  `$(BIN_DIR)/log` is no longer created [AC1, AC2, AC6].
- REQ-12 / REQ-13: a failing platform makes `all` and
  `build-quorum-election-all` exit non-zero; the alias produces the same outputs
  as `all` [AC5, AC7].
- REQ-17 (D4): an attempted-and-failed platform leaves no output file for that
  platform, through the per-platform target, `all`, and
  `build-quorum-election-all`; other platforms' files are not touched [AC13].

Implementation follows the non-binding spec section 8 sketch, which was exercised
in the spec's runs R4, R5, R8 and R9: literal module path in one variable,
platform targets still generated from `OS_LIST`/`ARCH_LIST` via
`define`/`$(eval ...)`, `all` reaching the platform targets as prerequisites,
`build-quorum-election-all: all`, and `rm -f` of the platform's own output file
immediately before its `go build`. `.PHONY` declarations as in the sketch are
allowed (section 8 guidance, D6) and are not verified. Scope anchors for the two
mechanisms that are new relative to today's Makefile:

- prerequisites-based `all`: verified bug cause E6 (Defect C), REQ-12;
- per-platform `rm -f`: owner authorization D4 / REQ-17 and verified bug cause
  E15; `.DELETE_ON_ERROR` is not used (E16 shows it has no effect here).

Nothing beyond the sketch is added: no new targets, variables used outside these
requirements, `.gitignore`, `CGO_ENABLED`, `-trimpath`, `-s -w`, or release/dist
target (section 9 follow-ups). The progress `echo` line may be kept or reworded
(below-bar, spec section 7).

Depends on: Task 2.
Done when: `Makefile` is rewritten; it contains no `dev` default, no `./$(BIN_DIR)`
and no `$(BIN_DIR)/log` path, and no `;`-joined `$(MAKE)` loop;
`git diff --stat` lists only `Makefile`. (Behavioral verification is Task 5.)

### Task 4 — Write the acceptance-check script under `$TMPDIR` (not committed)

Write one shell script, for example `$TMPDIR/makefile-cleanup-ac/ac.sh`, that
implements spec section 4.1 exactly:

- `#!/usr/bin/env bash`, `set -eu` (stop non-zero at the first failed assertion),
  `unset VERSION BIN_DIR` at the top, `export GOCACHE=$TMPDIR/gocache`.
- **Copy step (every criterion that needs a fresh copy).** Remove the copy
  directory if present, then
  `mkdir -p <copy>` and
  `cp -r <repo>/Makefile <repo>/go.mod <repo>/go.sum <repo>/cmd <repo>/internal <repo>/log <copy>/`,
  followed by `test -f <copy>/Makefile`. This copies the build inputs only and
  carries the uncommitted Task 3 `Makefile`; it avoids `cp -r` of the whole
  repository, which fails in this sandbox (section 0). Each criterion uses its
  own named copy (for example `$TMPDIR/qes-ac1`, `$TMPDIR/qes-ac2`, ...); AC8
  reuses the AC1 and AC2 copies, so those are not removed before AC8 runs.
  Every make call is `make -C <copy> ...`; nothing runs inside the repository.
  Absolute-output directories (`$TMPDIR/out-abs`, `$TMPDIR/envbin-guard`) are
  removed and recreated at the start of their criterion.
- **Assertion forms.** Every check is an exit-status assertion:
  - positive: `test -f`, `test ! -e`, `test -d`, `test -z "$(ls -A <dir>)"`,
    `grep -F '<str>'` on captured output, an expected-zero `make` call;
  - expected-non-zero `make`: `if make -C <copy> ...; then exit 1; fi`;
  - "does not contain": `if grep -qF '<str>' <input>; then exit 1; fi` (or the
    same with the input piped from a captured variable). A bare `! grep` or any
    other `! <cmd>` form is not used, because it does not stop a `set -e`
    script.
  - Command output that a check greps (binary `version` output, `go version -m`
    output, `find` listings) is first captured into a variable
    (`OUT=$(...)`), so that a failing producer command stops the script instead
    of making a "does not contain" check pass vacuously.
  No visual-only checks.
- The script hard-codes the AC commands; it is not a reusable harness (no
  functions beyond what the steps need, no parameterization).
- It echoes `AC<n> PASS` after each criterion and `ALL AC CHECKS PASSED` at the
  end.

Per-criterion content (from spec 4.2; `C` is that criterion's copy):

- **AC1** `make -C C all VERSION=0.2.0` exits 0; `ls -A C/bin/quorum-election`
  equals exactly the six binary names plus `log`; `C/bin/quorum-election/log` is
  an empty directory; `test ! -e C/bin/log`.
- **AC2** fresh copy; `make -C C all BIN_DIR=$TMPDIR/out-abs VERSION=0.2.0` exits
  0; six binaries and empty `log/` under `$TMPDIR/out-abs/quorum-election/`;
  `test ! -e C/tmp` and `test ! -e C/bin`.
- **AC3** fresh copy; `make -C C all VERSION=9.9.9-spec` exits 0;
  `env --chdir=C C/bin/quorum-election/quorum_election_app_linux_amd64 version`
  output contains `Version: 9.9.9-spec` (`grep -F`; the working directory `C`
  contains `log/`); `go version -m` on that binary contains
  `-X 'github.com/Anthya1104/quorum-election-cli/internal/config.Version=9.9.9-spec'`
  (`grep -F`).
- **REQ-2 environment `VERSION`** (spec 4.1 lists REQ-2 as above bar; added for
  Codex round-1 BLOCKING 4) fresh copy; with no command-line `VERSION`,
  `env VERSION=8.8.8-env make -C C build-quorum-election-linux-amd64` exits 0;
  `env --chdir=C C/bin/quorum-election/quorum_election_app_linux_amd64 version`
  output contains `Version: 8.8.8-env` (`grep -F`); `go version -m` on that
  binary contains
  `-X 'github.com/Anthya1104/quorum-election-cli/internal/config.Version=8.8.8-env'`
  (`grep -F`). The value `8.8.8-env` differs from both the compiled default
  (`0.2.0`) and the AC3 value, so neither a dropped environment value nor a
  leftover command-line value can pass.
- **AC4** fresh copy; `make -C C all` exits 0; capture `go version -m` of the
  linux/amd64 binary and assert it does not contain `config.Version`
  (`if grep -qF 'config.Version' ...; then exit 1; fi`); capture its `version`
  output, assert it contains `Version: 0.2.0` (`grep -F`) and does not contain
  `Version: dev` (`if grep -qF 'Version: dev' ...; then exit 1; fi`). Repeat in
  another fresh copy with `make -C C all VERSION=`.
- **AC5** fresh copy; write `C/internal/config/broken_windows.go` with
  `//go:build windows`, `package config`, and a type error (as E6);
  `make -C C all VERSION=0.2.0` exits non-zero;
  `make -C C build-quorum-election-all VERSION=0.2.0` exits non-zero;
  `make -C C build-quorum-election-linux-amd64` exits 0.
- **AC6** fresh copy; `make -C C build-quorum-election-darwin-arm64` exits 0;
  `ls -A C/bin/quorum-election` equals exactly
  `log` and `quorum_election_app_darwin_arm64`; `test ! -e C/bin/log`.
- **AC7** fresh copy; `make -C C build-quorum-election-all VERSION=0.2.0` exits 0;
  same file-set assertions as AC1.
- **AC8** in the AC1 copy (after the AC1 checks, before the copy is discarded):
  `make -C C clean` exits 0, `test ! -e C/bin`, `test -d C/log`. In the AC2 copy:
  `make -C C clean BIN_DIR=$TMPDIR/out-abs` exits 0, `test ! -e $TMPDIR/out-abs`,
  `test -d C/log`.
- **AC9** fresh copy; `make -C C` exits 0; `test -d C/bin`;
  `test ! -e C/bin/quorum-election` (no binaries).
- **AC12** fresh copy; create `$TMPDIR/envbin-guard/keep.txt`;
  `env BIN_DIR=$TMPDIR/envbin-guard make -C C clean` exits 0;
  `test -f $TMPDIR/envbin-guard/keep.txt`; capture `find $TMPDIR/envbin-guard`
  output; `env BIN_DIR=$TMPDIR/envbin-guard make -C C build-quorum-election-linux-amd64`
  exits 0; `test -f C/bin/quorum-election/quorum_election_app_linux_amd64`;
  a second captured `find $TMPDIR/envbin-guard` output equals the first
  (`test "$A" = "$B"`).
- **AC13** fresh copy, `B=C/bin/quorum-election`, steps 1-5 exactly as spec
  4.2 AC13 (including both `test -f` precondition checks in steps 1, 4 and 5 that
  make the absence checks non-vacuous, the `//go:build windows && amd64` →
  `//go:build ignore` → `//go:build windows && amd64` constraint edits, the
  expected-non-zero `all` (step 3), per-platform (step 4) and
  `build-quorum-election-all` (step 5) runs, and the `test ! -e` /
  `test -f` checks after each).

AC10 is withdrawn (D6) and has no check. AC11 is not in this script; it runs in
the repository (Task 6).

Depends on: Task 1 (independent of Task 3's content; may be written in parallel
with Task 3).
Done when: the script exists under `$TMPDIR` (outside the repository), contains
an explicit assertion for every step of AC1-AC9, AC12, AC13 and the REQ-2
environment `VERSION` check listed above, uses no bare `! <cmd>` assertion and no
whole-repository `cp -r`, and `bash -n` on it reports no syntax error. It is not
added to git.

### Task 5 — Run the acceptance checks and fix the Makefile until they pass

Run `bash $TMPDIR/makefile-cleanup-ac/ac.sh` once against the Task 3 Makefile
(each criterion copies the build inputs from the repository worktree, so the
copies carry the new Makefile). If an assertion fails, fix `Makefile` only (never
weaken or drop an assertion; spec 4.1) and re-run the whole script from the top.

Depends on: Task 3, Task 4.
Done when: one complete run exits 0 and prints `ALL AC CHECKS PASSED`; the
script content, its full output and exit status are saved for the implementation
report; `git status --short` in the repository shows no new path created by the
run (no `bin/`, no `tmp/`, no `internal/config/broken_windows.go`).

### Task 6 — Repository-side checks (AC11), line accountability, Makefile commit

1. AC11 in the repository:
   - `git diff --stat` lists `Makefile` only (the docs are already committed in
     Task 2);
   - `GOCACHE=$TMPDIR/gocache go build ./...` passes;
   - `GOCACHE=$TMPDIR/gocache go test ./...` passes.
2. R3.5 line accountability: walk `git diff Makefile` and map every changed line
   to a REQ (Task 3 list), to the D4/E15 removal, to E6 (prerequisites), or to
   the non-binding section 8 guidance that replaces a removed line (variable
   cleanup E3, `.PHONY` per D6). Remove any line that maps to none. Confirm REQ-4: the
   only `go build` flag is the conditional ldflags. If any line is changed in
   this step, re-run Task 5's script in full.
3. Commit: `git add Makefile` (explicit path only); message in English, e.g.
   `build(makefile): fix version default, BIN_DIR path and failure propagation`,
   with a body listing the fixed defects (A, B, C), the log placement change
   (D2) and the failed-platform cleanup (D4), ending with the required
   `Co-Authored-By` line.
4. Post-commit scope check: `git show --stat HEAD` lists `Makefile` only;
   `git diff --stat origin/main HEAD` lists exactly `Makefile` and the four
   `docs/makefile-cleanup/` files (`01-spec.md`, `reference-makefiles.md`,
   `evidence-offline.md`, `02-plan.md`), as allowed by AC11 (D5).

Depends on: Task 5.
Done when: all checks in steps 1 and 4 hold, the step 2 mapping is written into
the implementation report, and the branch has exactly two commits on top of
`origin/main` (docs, then Makefile).

### Task 7 — Prepare push and PR (human-gated; do not execute)

Prepare, without running:

- the push command `git push -u origin build/yusa_liu/makefile_cleanup`;
- a PR title (English, e.g. `build: clean up Makefile (version default, BIN_DIR, failure propagation)`)
  and body summarizing: the three defects and their evidence rows (E4, E5, E6),
  D1/D2/D4 decisions, the REQ-17 cleanup, the `log/` placement change
  (`$(BIN_DIR)/log` → `$(BIN_DIR)/quorum-election/log`), the verification
  (script run once under `$TMPDIR`, D3-a, result `ALL AC CHECKS PASSED`, plus
  AC11 build/test), a note that the docs commit is documentation committed per
  owner decision D5, and the follow-ups (section 6), ending with the required
  Claude Code attribution line.

Present both to the owner and stop.

Depends on: Task 6.
Done when: the push command and PR title/body are in the implementation report,
and the owner has been asked for confirmation. Push, PR creation and merge happen
only after explicit owner confirmation, outside this plan's autonomous steps.

## 4. Acceptance-criterion-to-task mapping

| AC | Requirement(s) | Implemented by | Verified by |
|---|---|---|---|
| AC1 Full build, relative BIN_DIR | REQ-1, 3, 9, 11 | Task 3 | Task 4 (check), Task 5 (run) |
| AC2 Absolute BIN_DIR | REQ-2, 3, 9, 11 | Task 3 | Task 4, Task 5 |
| AC3 Explicit version | REQ-2, 6 | Task 3 | Task 4, Task 5 |
| AC4 Default version | REQ-7 (D1) | Task 3 | Task 4, Task 5 |
| AC5 Failure propagation | REQ-12, 13 | Task 3 | Task 4, Task 5 |
| AC6 Single platform | REQ-1, 3, 11 | Task 3 | Task 4, Task 5 |
| AC7 Alias equivalence | REQ-13 | Task 3 | Task 4, Task 5 |
| AC8 clean | REQ-10 | Task 3 | Task 4, Task 5 |
| AC9 Default goal | REQ-5 | Task 3 | Task 4, Task 5 |
| AC10 | Withdrawn (D6) | — | — (no check) |
| AC11 Diff scope + build/test | R1.1, R1.2, scope (D5) | Task 2 (docs commit), Task 3 (Makefile-only code change) | Task 1 (baseline), Task 6 |
| AC12 Environment BIN_DIR ignored | REQ-2, 10 | Task 3 | Task 4, Task 5 |
| AC13 Failed platform leaves no binary (steps 1-5) | REQ-17 (D4) | Task 3 | Task 4, Task 5 |
| (no AC number) Environment `VERSION` injected | REQ-2 | Task 3 | Task 4, Task 5 |

Requirement coverage not tied to a single AC: REQ-4 (no extra build flags) is
checked by the Task 6 line review and indirectly by AC3/AC4 (`go version -m`).
REQ-8, REQ-14, REQ-15, REQ-16 are withdrawn in the spec and get no task.

Test-bar note (R1.3/R1.4): every check in Task 4 maps to an AC above or to the
above-bar REQ-2 environment behavior. No test or mechanism is added for the spec
section 7 residual risks (echo wording, declaration order, internal variable
organization, target generation style, failure-propagation mechanism, exact
non-zero exit value, `.PHONY`, archive format). AC13 steps 3/5 assert only
presence of `linux_amd64`, as the spec says; no check is added for whether other
platforms were rebuilt.

## 5. Flags for the spec/user gate

- None. The round-1 flag (REQ-14/AC10 below bar) was resolved by owner decision
  D6. No other below-bar precision criterion was found in the confirmed spec.

## 6. Follow-ups (recorded, not in this plan)

- **v0.2.0 release**: tag `v0.2.0`, build with `make clean all VERSION=0.2.0`
  (or no `VERSION`, which now reports `0.2.0` from `config.go`), package the six
  binaries with `log/` (manual, spec section 7), publish the GitHub release.
- Spec section 9 items: goreleaser or a `release`/`dist` target; `CGO_ENABLED=0`
  for static `linux/amd64`; `-trimpath` and `-s -w`; logger `os.OpenFile` error
  handling; default goal `all`; `.gitignore` for `bin/`; the untracked `app`
  binary in the repository root.
- Durable Makefile verification (rejected D3-b): only if the owner later wants
  the checks committed.
