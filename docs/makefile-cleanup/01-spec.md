# Spec: Makefile cleanup (quorum-election-simulator)

Status: converged after 5 convergent-spec rounds (Claude critic + Codex critic, both BLOCKING: none in round 5); owner gate answers recorded in section 6.

Target repository: `/home/yusa1104/project/split-repo-test/quorum-election-simulator`
Code under change: `Makefile` (only). Documentation: `docs/makefile-cleanup/` (owner decision D5).
Date: 2026-10-27

Round 2 changes were limited to the round-1 BLOCKING issues (Claude B1, B2; Codex
B1-B4) and the requested citations of the two research files.

Round 3 changes were limited to the round-2 BLOCKING issue raised by both critics
(Claude N1, Codex BLOCKING): REQ-12 and AC10 bound the prerequisite mechanism
while section 1 says only behavior is binding. Fix (b) was applied: REQ-12 binds
only the observable outcome, AC10 drops its structural clause, AC5 stays the
verification, "use prerequisites" moves to section 8 guidance (with a section 7
residual-risk row), and E14, D4, REQ-13 and the section 5 bullets that assumed
the mechanism were reworded so they no longer assume it.

Round 4 changes are limited to:

- The round-3 BLOCKING issue raised by both critics (Claude N2, Codex BLOCKING):
  REQ-13 "exits with the same status as `all`" bound exact exit-code equality.
  REQ-13 now binds only the observable outcome (success exactly when `all`
  succeeds, non-zero exit exactly when `all` fails). No exact-exit-code
  assertion is added.
- Owner answers of 2026-10-27 (section 6): D1 and D2
  accepted and recorded as settled; D4 changed by the owner into a new binding
  requirement, REQ-17 (a failed platform leaves no binary for that platform),
  with AC13, evidence rows E15-E17, and section 5, section 7 and section 8
  updates so that nothing still describes stale binaries for a failed platform
  as accepted. D3 stays open; its wording now names R1.3 as the anchor.

Round 5 changes are limited to the round-4 BLOCKING issue raised by both critics
(Claude N3, Codex BLOCKING): REQ-17 claims coverage of the
`build-quorum-election-all` path, but AC13 never ran the alias after a failure,
and the alias definition is non-binding. Fix (a) was applied: AC13 gains step 5,
which re-creates the failed platform's binary, restores the failing constraint,
and asserts that `make build-quorum-election-all` exits non-zero and leaves no
binary for the failed platform. The alias stays in REQ-17. Evidence row E18
records the feasibility run (R9), and REQ-17, the section 4.1 list and the
section 5 in-scope bullet now point at the alias step. D3 stays open, unchanged.

- Reference patterns: [`reference-makefiles.md`](reference-makefiles.md)
  (cited below as **[REF]**, with pattern numbers 1-6 as numbered in that file).
- Offline release and linkage evidence: [`evidence-offline.md`](evidence-offline.md)
  (cited below as **[OFFLINE]**).

## 1. Summary and scope

The `Makefile` builds the `quorum-election` CLI for six platforms
(`darwin|linux|windows` x `amd64|arm64`). Its output is packaged by hand with a
`log/` directory and attached to GitHub releases. The pending v0.2.0 release will
be built with the cleaned-up Makefile.

This change rewrites the `Makefile` to fix three verified defects that affect
release output, makes a failed platform build leave no binary for that platform
(owner decision D4), and restructures it along the conventions observed in
high-star Go repositories ([REF] patterns 1, 2 and 4: `.PHONY` declarations,
`?=`/`:=` usage, a dedicated output directory removed by `clean`). Only the
behavioral parts are binding (section 3). The structural conventions beyond
`.PHONY` are non-binding guidance (section 8). This includes how `all` reaches
the per-platform targets: section 3 binds only that a failed platform build makes
`all` fail. Public target names stay the same.

In scope: the `Makefile` only.
Out of scope: Go source, `readme.md`, `Dockerfile`, archive creation (zip/rar),
goreleaser, CI. Section 9 lists these as follow-ups.

## 2. Verified current state (evidence)

All `make` runs were done in a throwaway copy under `$TMPDIR`
(`cp -r <repo> $TMPDIR/<copy>`), using GNU Make 4.3 and `GOCACHE=$TMPDIR/gocache`.
No repository file was modified. Runs R6-R8 used copy `$TMPDIR/qes-r4` and run R9
used copy `$TMPDIR/qes-r5`, both with go1.24.1 linux/amd64; `cp -r` skipped the
sandbox placeholder dotfiles, which do not affect the build.

| # | Fact | Evidence |
|---|---|---|
| E1 | Module path is `github.com/Anthya1104/quorum-election-cli`. | `go.mod:1` |
| E2 | `internal/config/config.go:3` declares `var Version = "0.2.0"` (bumped in commit `c257e98`). `internal/cobra/cobra.go:23` prints it in the `version` subcommand (`logrus.Infof("Version: %s", config.Version)`). | grep, `git show --stat c257e98` |
| E3 | The Makefile builds the ldflags target from `${PROJECT_ROOT_DIR}/$(QUORUM_ELECTION_DIR)-cli/${CONFIG_PATH}.Version`. That expands to `github.com/Anthya1104/quorum-election-cli/internal/config.Version`, which is correct today but is put together from unrelated variables. | `Makefile:2-6,28`; echoed command in run R1 |
| E4 | **Defect A: the version is overridden by default.** Because of `VERSION ?= dev`, `make all` without `VERSION` injects `dev`, which overrides `config.Version`. | R1: `make -C $TMPDIR/qes all` echoes `-X '...config.Version=dev'`. Running `bin/quorum-election/quorum_election_app_linux_amd64 version` prints `msg="Version: dev"`. |
| E5 | **Defect B: an absolute `BIN_DIR` builds into the repository.** The `-o` path is `./$(BIN_DIR)/...`, but `mkdir -p $(BIN_DIR)/log` has no `./` prefix. | R2: `make -C $TMPDIR/qes build-quorum-election-linux-amd64 BIN_DIR=$TMPDIR/absout VERSION=0.2.0` echoes `-o .//tmp/claude-1000/absout/...`. `find` shows the binary at `$TMPDIR/qes/tmp/claude-1000/absout/quorum-election/quorum_election_app_linux_amd64` (inside the copy) and `log/` at `$TMPDIR/absout/log` (outside it). |
| E6 | **Defect C: a failed platform build does not fail `make all`.** `all` and `build-quorum-election-all` run six `$(MAKE) ...;` commands joined with `;` on one shell line, so the exit status is that of the last command only. | R3: I added a windows-only compile error (`internal/config/broken_windows.go`, `//go:build windows`) to the copy and ran `make -C $TMPDIR/qes all VERSION=0.2.0; echo "EXIT=$?"`. Both windows sub-makes printed `Error 1`, the other four built, and the run printed `EXIT=0`. |
| E7 | Current layout: binaries go to `$(BIN_DIR)/quorum-election/` and the empty log directory to `$(BIN_DIR)/log/`. These are sibling directories, so the log directory is not next to the binaries. | R1: `find $TMPDIR/qes/bin` |
| E8 | At runtime the binary opens `log/log_output.txt` relative to the **current working directory** (`internal/config/config.go:11` `LogFilePath`, `internal/logger/logger.go:13`). If `log/` is missing, the binary still runs but prints `Failed to write to log, invalid argument` on stderr. | `env --chdir=$TMPDIR/absout/log <linux_amd64 binary> version` |
| E9 | The v0.1.1 release (repository `yusaanthya/quorum-election-simulator`, published 2025-10-20) has one asset, `quorum-election_v0.1.rar` (RAR, not zip, 12028701 bytes). GitHub reports its digest as `sha256:0cd1872b...4d10fd`, and the local download has the same sha256. The archive contains a top directory `quorum-election_v0.1/` holding all six `quorum_election_app_<os>_<arch>[.exe]` files and a `log/` directory side by side. That `log/` is **not empty**: it contains `log_output.txt` (413 bytes). | [OFFLINE] section "E9 — v0.1.1 release asset" (`gh release view --json` output with digest, matching local `sha256sum`, RAR5 entry listing) |
| E10 | The only external reference to make targets is `readme.md:62`: `make all` and `make build-quorum-election-<OS>-<CPU_ARCH>`. No reference to `init`, `build-quorum-election-all` or `BIN_DIR` outside the Makefile. There is no CI config. | `grep -rn "make \|build-quorum-election\|BIN_DIR\|bin/"` excluding Makefile; `git ls-files` |
| E11 | The only git tag is `v0.1.1`. There is no `v0.2.0` tag yet. | `git tag -l` |
| E12 | With no target given, `make` runs `init`, the first target, which only creates `$(BIN_DIR)`. | `Makefile:19` |
| E13 | `BIN_DIR` is assigned with `:=` today (`Makefile:9`, `BIN_DIR := bin`). A command-line `BIN_DIR=...` overrides it (R2 above). An exported environment variable `BIN_DIR` does not: `env BIN_DIR=$TMPDIR/envbin make -n clean` prints `rm -rf bin`, both on the current Makefile (round-1 Claude Critic run) and on the section 8 sketch with `BIN_DIR := bin` (R4, copy `$TMPDIR/qes-r2`). `VERSION` is assigned with `?=` today (`Makefile:12`), so it is read from the environment as well as the command line. | `Makefile:9,12`; R4 |
| E14 | The section 8 sketch, in which `all` reaches the platform targets as make prerequisites, stops at the first failing platform; later platforms are not built. This is a property of that sketch only. REQ-12 does not bind the mechanism, so another implementation that satisfies REQ-12 may stop at the first failure or may continue and build the remaining platforms. Platforms whose build is not attempted are "other platforms" under REQ-17: their earlier outputs are neither removed nor required to be rebuilt. | R5: copy `$TMPDIR/qes-r2` with the sketch and a windows-only type error in `internal/config/broken_windows.go`. `make all VERSION=9.9.9-spec` built only `windows/amd64`, which failed, and exited with status 2. R8 (below) reproduced the stop-at-first-failure behavior. |
| E15 | **`go build -o` leaves the previous output file in place on a compile error.** Today a failed platform build therefore keeps the binary from an earlier run, and nothing in the current Makefile removes it. | R6: copy `$TMPDIR/qes-r4` with the current Makefile. `make all VERSION=0.2.0` built all six (exit 0). After adding `internal/config/broken_windows.go` (`//go:build windows`, type error), `make build-quorum-election-windows-amd64 VERSION=0.2.0` failed (`Error 1`, exit 2), and `ls -l --time-style=full-iso` showed `quorum_election_app_windows_amd64.exe` still present with its earlier size (4219904) and earlier timestamp. |
| E16 | **`.DELETE_ON_ERROR` does not remove the failed platform's binary** with per-platform targets that are phony names (not the output file name), because make deletes only the target file of the failing rule. | R7: the section 8 sketch plus `.DELETE_ON_ERROR:` (as `Makefile.doe` in `$TMPDIR/qes-r4`), with the earlier six binaries present and a `//go:build windows && amd64` type error. `make -f Makefile.doe all VERSION=0.2.0` failed on `windows/amd64` (exit 2); `quorum_election_app_windows_amd64.exe` was still present with its earlier timestamp. |
| E17 | **Removing the platform's output file just before its `go build` meets REQ-17.** | R8: the section 8 sketch (with the `rm -f` line shown there) in `$TMPDIR/qes-r4`. With the error disabled (`//go:build ignore`), `make all VERSION=0.2.0` built all six (exit 0). With `//go:build windows && amd64`, `make all VERSION=0.2.0` failed on `windows/amd64` (exit 2); afterwards `quorum_election_app_windows_amd64.exe` was absent, and the other five binaries were present with their earlier timestamps (not attempted, E14). Single-target path: with the error disabled, `make build-quorum-election-windows-amd64 VERSION=0.2.0` exited 0 and created the `.exe`; with the error re-enabled the same command exited 2, and `find` showed no `windows_amd64` binary while `windows_arm64.exe` remained. |
| E18 | **AC13 as written in this round, including the alias step 5, passes against the section 8 sketch.** In step 5 the failed platform's binary exists immediately before the alias run, so the absence check after the alias run is not vacuous. | R9: copy `$TMPDIR/qes-r5` with the section 8 sketch (including the `rm -f` line), run by a `set -e` shell script under `$TMPDIR` that executes AC13 steps 1-5 verbatim with `unset VERSION BIN_DIR` and `GOCACHE=$TMPDIR/gocache`. Step 5: with `//go:build ignore`, `make -C <copy> build-quorum-election-windows-amd64 VERSION=0.2.0` exited 0 and `test -f .../quorum_election_app_windows_amd64.exe` passed; with `//go:build windows && amd64` restored, `make -C <copy> build-quorum-election-all VERSION=0.2.0` exited non-zero (`Error 1` on `windows/amd64`), then `test ! -e .../quorum_election_app_windows_amd64.exe` and `test -f .../quorum_election_app_linux_amd64` passed. The script printed `ALL AC13 STEPS PASSED`. |

## 3. Requirements

### 3.1 Public interface (external contract — above bar)

- **REQ-1** These targets exist and keep their names: `all`,
  `build-quorum-election-all`, `clean`, `init`, and the six per-platform targets
  `build-quorum-election-<os>-<arch>` for `os` in {`windows`, `darwin`, `linux`}
  and `arch` in {`amd64`, `arm64`}. (`readme.md:62` contract. `init` and
  `build-quorum-election-all` are kept to preserve behavior, E10.)
- **REQ-2** The variables `BIN_DIR` (default `bin`) and `VERSION` keep their
  names and keep their current override sources (E13):
  - `BIN_DIR` is overridable on the make command line and is **not** read from
    the environment. It stays assigned with `:=`, as today (`Makefile:9`).
    Reason: `clean` runs `rm -rf $(BIN_DIR)` (REQ-10). Reading `BIN_DIR` from
    the environment would let an exported shell variable (for example
    `BIN_DIR=$HOME/bin`) make `make clean` delete a directory outside the
    repository. This is a data-integrity outcome, so it is above bar.
  - `VERSION` is overridable on the make command line and from the
    environment. It stays assigned with `?=`, as today (`Makefile:12`). Only
    its default changes (REQ-7).
- **REQ-3** Output file names and directory stay the same:
  `$(BIN_DIR)/quorum-election/quorum_election_app_<os>_<arch>`, with suffix
  `.exe` exactly when `os` is `windows`.
- **REQ-4** Each binary is built from `./cmd/main.go` with
  `GOOS=<os> GOARCH=<arch> go build`. No other build flags are added or removed
  apart from the ldflags rule in REQ-6.
- **REQ-5** `make` with no target keeps its current behavior: it creates
  `$(BIN_DIR)` and builds nothing (E12).

### 3.2 Version injection (fixes Defect A — above bar; settled decision D1)

- **REQ-6** If `VERSION` is non-empty, every build passes
  `-ldflags "-X '<module>/internal/config.Version=$(VERSION)'"`, where
  `<module>` is the literal `github.com/Anthya1104/quorum-election-cli`
  (identical to `go.mod:1`). The built binary's `version` subcommand reports
  exactly `$(VERSION)`.
- **REQ-7** If `VERSION` is unset or empty, no `-X` flag for `config.Version` is
  passed, so the binary reports the value declared in
  `internal/config/config.go` (currently `0.2.0`). The default `dev` is removed
  (D1, accepted by owner 2026-10-27).
- **REQ-8** Withdrawn in round 2 (below-bar implementation precision, Codex B1).
  How the symbol path is stored is non-binding guidance in section 8. The
  observable outcome (the correct symbol receives `$(VERSION)`) is bound by
  REQ-6 and verified by AC3.

### 3.3 Output location (fixes Defect B — above bar)

- **REQ-9** All build outputs (binaries, the log directory, any directory created
  by `init`) are written under `$(BIN_DIR)` as given. A relative `BIN_DIR`
  resolves against the directory make runs in. An absolute `BIN_DIR` is used
  unchanged. No `./` (or other prefix) is added to `$(BIN_DIR)` anywhere.
- **REQ-10** `clean` removes `$(BIN_DIR)` and nothing else. It honors a
  `BIN_DIR` given on the command line and ignores a `BIN_DIR` exported in the
  environment (REQ-2).

### 3.4 Release layout (above bar; settled decision D2)

- **REQ-11** Every per-platform target, and therefore `all` and
  `build-quorum-election-all`, creates an empty directory
  `$(BIN_DIR)/quorum-election/log`. This puts `log/` next to the binaries, which
  matches the v0.1.1 archive layout (E9, [OFFLINE]) and the runtime lookup of
  `log/` relative to the working directory (E8). The Makefile no longer creates
  `$(BIN_DIR)/log`. (D2, accepted by owner 2026-10-27.)

### 3.5 Failure propagation (fixes Defect C — above bar)

- **REQ-12** If any per-platform build fails, `make all` and
  `make build-quorum-election-all` each exit with a non-zero status. The
  mechanism that achieves this is not binding; section 8 gives non-binding
  guidance. Verified by AC5.
- **REQ-13** `build-quorum-election-all` produces exactly the same outputs as
  `all` for the same inputs. It succeeds (exit status 0) exactly when `all`
  succeeds, and exits with a non-zero status exactly when `all` fails. The
  specific non-zero value is not bound. How the alias is defined is non-binding
  guidance (section 8). Verified by AC5 and AC7.
- **REQ-17** (owner decision D4, 2026-10-27) When the build of a platform is
  attempted and fails, that platform's output file
  `$(BIN_DIR)/quorum-election/quorum_election_app_<os>_<arch>[.exe]` does not
  exist when make finishes, even if a file of that name existed from an earlier
  run. This holds whether the build was started by the per-platform target, by
  `all`, or by `build-quorum-election-all`. The rule does not touch the output
  files of other platforms: it neither deletes them nor requires them to be
  rebuilt. Only the observable outcome is binding; the mechanism is non-binding
  guidance (section 8).
  - Authorization (R3.3): the owner's statement "clean up the binary of the
    platform that failed; the others are fine" (section 6, D4) is the
    explicit authorization for a removal mechanism scoped
    to the failed platform's output file.
  - Bug cause: `go build -o` keeps the earlier file on a compile error (E15),
    so without this rule a failed platform leaves a stale binary from an earlier
    run in the release output directory.
  - Test bar (R1.4): above bar. A stale binary can be packaged into a release
    with outdated code or version (release/deploy outcome), and no existing
    backstop contains it.
  - Verified by AC13: step 3 (`all`), step 4 (per-platform target) and step 5
    (`build-quorum-election-all`). Each of the three paths is exercised
    separately, because the alias definition is non-binding (REQ-13) and may
    differ from `all`.

### 3.6 Structure

- **REQ-14** Withdrawn at the plan gate (owner, 2026-10-27, D6). Declaring
  `.PHONY` for every target that does not produce a file of its own name is
  non-binding guidance (section 8); see the section 7 row.
- **REQ-15** Withdrawn in round 2 (Codex B1). The operators for `BIN_DIR` and
  `VERSION` are bound by REQ-2 because they decide override sources. Operators
  for internal derived variables are non-binding guidance (section 8).
- **REQ-16** Withdrawn in round 2 (Codex B1). Whether the six per-platform
  targets are generated from a platform list or written out is non-binding
  guidance (section 8). Their existence and names are bound by REQ-1.

## 4. Acceptance criteria

### 4.1 How the criteria are run (material verification; gate decision D3)

The acceptance criteria are the material verification for the above-bar
behaviors in REQ-2, REQ-6/7, REQ-9/10, REQ-11, REQ-12 and REQ-17 (all three
build paths of REQ-17: AC13 steps 3, 4 and 5). They are not optional and must
not be dropped or weakened in later rounds or in the task plan.

- Every criterion is run as an executable check with an explicit assertion: a
  command whose exit status decides pass or fail (for example
  `test -f <path>`, `test ! -e <path>`, `test -z <listing>`,
  `<binary> version | grep -F 'Version: <value>'`, or a check that a `make`
  exit status is zero or non-zero). A visual inspection of output does not
  count as an assertion.
- The checks are collected in one shell script that stops with a non-zero
  status at the first failed assertion. The script lives outside the
  repository, under `$TMPDIR`, and is not committed (gate decision D3). It is
  not a reusable harness: it hard-codes the commands below.
- The script runs every check in a fresh throwaway copy of the repository under
  `$TMPDIR` (`cp -r <repo> $TMPDIR/<copy>`), never inside the repository, with
  `GOCACHE=$TMPDIR/gocache`. Make runs as `make -C $TMPDIR/<copy> ...`.
- The implementation report records the script's content, its full output, and
  its exit status.

### 4.2 Criteria

1. **Full build, relative BIN_DIR.** `make -C <copy> all VERSION=0.2.0` exits 0.
   Afterwards `<copy>/bin/quorum-election/` contains exactly the six files
   `quorum_election_app_{windows_amd64.exe,windows_arm64.exe,darwin_amd64,darwin_arm64,linux_amd64,linux_arm64}`
   and an empty directory `log`. `<copy>/bin/log` does not exist.
2. **Absolute BIN_DIR.** In a fresh copy,
   `make -C <copy> all BIN_DIR=$TMPDIR/out-abs VERSION=0.2.0` exits 0. The six
   binaries and the empty `log/` are under `$TMPDIR/out-abs/quorum-election/`.
   Neither `<copy>/tmp` nor `<copy>/bin` exists.
3. **Explicit version (distinct value).** In a fresh copy,
   `make -C <copy> all VERSION=9.9.9-spec` exits 0. The value `9.9.9-spec`
   differs from the compiled default in `internal/config/config.go`, so a wrong
   ldflags symbol cannot pass this check. Running
   `<copy>/bin/quorum-election/quorum_election_app_linux_amd64 version`
   (from a working directory that contains `log/`) prints a line containing
   `Version: 9.9.9-spec`. `go version -m` on that binary shows the `-ldflags`
   value
   `-X 'github.com/Anthya1104/quorum-election-cli/internal/config.Version=9.9.9-spec'`.
   (Verified feasible with the section 8 sketch in R4: the binary printed
   `msg="Version: 9.9.9-spec"`.)
4. **Default version.** In a fresh copy, `make -C <copy> all` (no `VERSION`)
   exits 0. `go version -m <copy>/bin/quorum-election/quorum_election_app_linux_amd64`
   shows no `config.Version` `-X` flag, and running that binary with `version`
   prints the value from `internal/config/config.go:3` (currently
   `Version: 0.2.0`), not `dev`. The same holds for `make -C <copy> all VERSION=`.
5. **Failure propagation.** In a fresh copy, add
   `internal/config/broken_windows.go` containing `//go:build windows`,
   `package config`, and a type error, as in E6. `make -C <copy> all VERSION=0.2.0`
   exits non-zero, and so does `make -C <copy> build-quorum-election-all VERSION=0.2.0`.
   In the same copy, `make -C <copy> build-quorum-election-linux-amd64` exits 0.
6. **Single platform.** In a fresh copy,
   `make -C <copy> build-quorum-election-darwin-arm64` exits 0. It creates only
   `bin/quorum-election/quorum_election_app_darwin_arm64` and
   `bin/quorum-election/log/`.
7. **Alias equivalence.** In a fresh copy,
   `make -C <copy> build-quorum-election-all VERSION=0.2.0` exits 0 and produces
   the same file set as AC1.
8. **clean.** After AC1, `make -C <copy> clean` removes `<copy>/bin`. After AC2,
   `make -C <copy> clean BIN_DIR=$TMPDIR/out-abs` removes `$TMPDIR/out-abs`.
   `<copy>/log/` (the tracked directory) still exists after both.
9. **Default goal.** In a fresh copy, `make -C <copy>` exits 0, creates
   `<copy>/bin`, and builds no binaries.
10. **Withdrawn** at the plan gate (owner, 2026-10-27, D6), together with
    REQ-14. `.PHONY` is guidance only (section 8) and has no acceptance check.
11. **Diff scope.** Among code and build files, the change touches `Makefile`
    only: `git diff --stat` shows `Makefile` plus, as documentation authorized
    by D5, files under `docs/makefile-cleanup/` and nothing else.
    `go build ./...` and `go test ./...` pass (R1.1/R1.2
    sanity; Go sources are unchanged).
12. **Environment BIN_DIR is ignored.** In a fresh copy, create a directory
    `$TMPDIR/envbin-guard` containing one file. Run
    `env BIN_DIR=$TMPDIR/envbin-guard make -C <copy> clean`. It exits 0, and
    `$TMPDIR/envbin-guard` and its file still exist. Then run
    `env BIN_DIR=$TMPDIR/envbin-guard make -C <copy> build-quorum-election-linux-amd64`.
    It creates `<copy>/bin/quorum-election/quorum_election_app_linux_amd64`
    and creates nothing new under `$TMPDIR/envbin-guard`.
13. **Failed platform leaves no binary (REQ-17).** In a fresh copy, with
    `B=<copy>/bin/quorum-election`:
    1. `make -C <copy> all VERSION=0.2.0` exits 0. `test -f $B/quorum_election_app_windows_amd64.exe`
       and `test -f $B/quorum_election_app_linux_amd64` pass. (This makes the
       later absence check non-vacuous: the failed platform's binary existed
       from an earlier run.)
    2. Add `internal/config/broken_windows.go` containing
       `//go:build windows && amd64`, `package config`, and a type error, so
       that only `windows/amd64` fails to compile.
    3. `make -C <copy> all VERSION=0.2.0` exits non-zero. Afterwards
       `test ! -e $B/quorum_election_app_windows_amd64.exe` passes and
       `test -f $B/quorum_election_app_linux_amd64` passes. The second check
       asserts only presence: depending on the failure-propagation mechanism,
       `linux/amd64` is either not attempted (its earlier binary remains) or
       rebuilt (E14); REQ-17 allows both.
    4. Single-target path: change the build constraint in that file to
       `//go:build ignore`; `make -C <copy> build-quorum-election-windows-amd64 VERSION=0.2.0`
       exits 0 and `test -f $B/quorum_election_app_windows_amd64.exe` passes.
       Change the constraint back to `//go:build windows && amd64`; the same
       command exits non-zero, `test ! -e $B/quorum_election_app_windows_amd64.exe`
       passes, and `test -f $B/quorum_election_app_linux_amd64` passes.
    5. Alias path: change the build constraint in that file to
       `//go:build ignore`; `make -C <copy> build-quorum-election-windows-amd64 VERSION=0.2.0`
       exits 0 and `test -f $B/quorum_election_app_windows_amd64.exe` passes.
       (This re-creates the failed platform's binary, so the absence check
       below is non-vacuous.) Change the constraint back to
       `//go:build windows && amd64`; `make -C <copy> build-quorum-election-all VERSION=0.2.0`
       exits non-zero, `test ! -e $B/quorum_election_app_windows_amd64.exe`
       passes, and `test -f $B/quorum_election_app_linux_amd64` passes (presence
       only, as in step 3).
    (Steps 1-4 verified feasible with the section 8 sketch in R8, E17; steps 1-5
    in R9, E18.)

## 5. Edge cases

### In scope

- `BIN_DIR` absolute (AC2), relative default (AC1), or a relative path with a
  subdirectory such as `BIN_DIR=out/rel`. The last one resolves under the make
  working directory; it is covered by REQ-9 and needs no separate AC.
- `BIN_DIR` exported in the shell environment (AC12). It is ignored, as today.
- `VERSION` unset, set to empty, or set to a value distinct from the compiled
  default (AC3, AC4).
- One platform failing to compile (AC5).
- One platform failing to compile after an earlier successful build of that
  platform: the failed platform's earlier binary is gone afterwards (REQ-17,
  AC13), through `all` (step 3), the per-platform target (step 4) and
  `build-quorum-election-all` (step 5).
- Building a single platform target on its own (AC6).
- Running `make` with no target (AC9).

### Out of scope

- `BIN_DIR` containing spaces, or set to an empty string. `clean` with an empty
  `BIN_DIR` runs `rm -rf` with no operand, the same as today.
- `make -j` parallel builds. They are not required to work and are not
  verified.
- `make -k` (keep going) semantics.
- Earlier binaries of platforms other than the failed one after a failed
  `make all`. Depending on the failure-propagation mechanism, a failed
  `make all` may stop at the first failing platform (as the section 8 sketch
  does, E14), leaving the earlier binaries of platforms that were not attempted
  in place, or it may build the remaining platforms. REQ-17 does not touch these
  files, and `make all` exits non-zero in either case (REQ-12). Owner authority
  for leaving them as they are: D4, 2026-10-27 ("the others are fine").
- A `v` prefix in `VERSION`. The value is passed through verbatim.
- Running make on a Windows host or with non-GNU make.

## 6. Gate decisions

### Settled by the owner (2026-10-27)

- **D1: VERSION default (REQ-6/REQ-7). Accepted by owner 2026-10-27.**
  `VERSION ?= dev` is removed so that `internal/config/config.go` is the source
  of truth when `VERSION` is not given. Evidence: E2 and E4 (as it stood,
  `make all` would ship v0.2.0 binaries that report `dev`). Alternatives
  considered and rejected:
  - `git describe` as the default ([REF] pattern 3). No `v0.2.0` tag exists
    (E11), so it would produce `v0.1.1-...`, and it adds a git dependency (a new
    mechanism).
  - Keeping `dev` and requiring `VERSION=0.2.0` at release time. The wrong
    version only appears if someone forgets the flag.
- **D2: log directory placement (REQ-11). Accepted by owner 2026-10-27.**
  The empty log directory moves from `$(BIN_DIR)/log` to
  `$(BIN_DIR)/quorum-election/log`, so that `$(BIN_DIR)/quorum-election/` has
  the v0.1.1 layout of `log/` beside the six binaries (E9, verified in
  [OFFLINE]). This changes the existing layout (E7). Note from [OFFLINE]: the
  v0.1.1 `log/` held a `log_output.txt`, while the requirements describe an
  empty `log/`. The Makefile creates `log/` empty; adding or omitting a log file
  in the archive stays a manual packaging step (section 7).
- **D4: output of a failed platform build (REQ-17). Changed by owner
  2026-10-27.** The round-3 draft accepted stale outputs after a failed build.
  The owner replaced that with: "clean up the binary of the platform that
  failed; the others are fine." This is now the binding requirement REQ-17,
  verified by AC13. The owner's statement is the R3.3 authorization for a
  removal mechanism scoped to the failed platform's output file. Outputs of
  other platforms are neither removed nor required to be rebuilt (section 5).
  Confirmed by the owner at the spec gate (2026-10-27): platforms whose build
  is not attempted after a failure keep their earlier binaries. Putting the
  version in output file names was considered and rejected: it changes the
  output file names (REQ-3 contract), does not distinguish two builds of the
  same version, and accumulates old files. Release builds start from a clean
  output directory (`make clean all`); this is a release practice, not a
  Makefile requirement.

- **D3: durability of the verification (R1.3 exception). Settled by owner
  2026-10-27: D3-a.** R1.3 is the anchor for the verification itself: the
  above-bar behaviors need direct, executable coverage, which section 4.1
  provides with explicit assertions. The repository has no CI and no existing
  test seam for the Makefile (E10). The checks run once at implementation time,
  uncommitted, with the output recorded, under the Makefile-only scope (AC11).
  Accepted consequence: the coverage does not persist for future Makefile
  changes. Rejected alternative (D3-b): commit the checks as a repository
  script, which widens the diff beyond `Makefile`.

- **D5: documentation in the repository. Decided by owner 2026-10-27.**
  The owner's instruction: documents about this repository stay inside it. The
  spec, its two reference files and the task plan are committed under
  `docs/makefile-cleanup/`, in a commit separate from the `Makefile` change.
  AC11 limits code and build files to `Makefile`.
- **D6: `.PHONY` demoted. Decided by owner 2026-10-27 at the plan gate.**
  REQ-14 and AC10 are withdrawn; `.PHONY` becomes section 8 guidance with a
  section 7 row. Reason: no above-bar failure consequence (both plan critics,
  R1.4/R6.3), and an acceptance check would need `make -p -n`, whose output
  includes the whole environment.

## 7. Accepted residual risks (below bar)

| Property | Failure | Verified backstop | Remaining accepted bound |
|---|---|---|---|
| Progress `echo` text ("Building quorum-election for <os>/<arch> ...") | Wording or the version shown in the echo differs from today | None needed. It is informational only; the binary's actual version is checked by AC3/AC4 | Cosmetic console output only |
| Order and grouping of variable and target declarations | Differs from the reference repos' layout ([REF]) | None needed | Readability only |
| Internal variable organization (former REQ-8 and REQ-15 for derived variables): how the ldflags symbol path is stored, which operator internal derived variables use, whether the old `QUORUM_ELECTION_DIR`/`PROJECT_ROOT_DIR`/`CONFIG_PATH` concatenation is removed | The Makefile keeps or adds less tidy variable structure | None needed. Its only material effect, a wrong symbol path, is an above-bar outcome bound by REQ-6 and asserted by AC3 with a distinct version value | Readability only. Demoted from Requirements in round 2 (Codex B1); confirmation at the spec gate |
| Per-platform target generation (former REQ-16) | The six targets are written out by hand instead of generated from a platform list | None needed. Target existence and names are bound by REQ-1 and exercised by AC1, AC5, AC6 | Readability and maintenance only. Demoted in round 2 (Codex B1); confirmation at the spec gate |
| Failure-propagation mechanism (structural part of round-2 REQ-12/REQ-13 and AC10): whether `all` reaches the per-platform targets as make prerequisites or through a recipe that propagates failures (for example `&&`-joined or `set -e` commands, or recursive `$(MAKE)` calls whose status is checked), and how `build-quorum-election-all` is defined | The Makefile uses a recipe instead of prerequisites, or defines the alias differently from the section 8 guidance | AC5 asserts the material outcome (non-zero exit of both `all` and `build-quorum-election-all` when one platform fails); AC1 and AC7 assert the alias produces the same outputs | Readability and consistency with the guidance only; it also decides whether later platforms are still built after a failure. Their earlier binaries are "other platforms" under REQ-17, left as they are by owner decision D4 (section 5). Demoted in round 3 (Claude N1, Codex round-2 BLOCKING) |
| Exact non-zero exit value of `build-quorum-election-all` versus `all` (round-3 REQ-13 wording) | The alias fails with a different non-zero code than `all` (for example 2 versus 1) | None needed. REQ-13 binds success/failure equivalence, asserted by AC5 (both non-zero on failure) and AC7 (alias exits 0 on success) | No material consequence; callers distinguish only zero from non-zero. Demoted in round 4 (Claude N2, Codex round-3 BLOCKING) |
| `.PHONY` declarations (former REQ-14 / AC10, withdrawn at the plan gate, D6) | A target is skipped if a file with the same name appears in the working directory | None needed. No tracked or generated file has a target name (`git ls-files`; outputs live under `$(BIN_DIR)/quorum-election/`), and the current Makefile works without `.PHONY` | Only if someone creates a file named after a target; declaring `.PHONY` per section 8 guidance removes this |
| Archive format and contents (zip vs rar, `log/log_output.txt` presence) | Packaged asset differs from v0.1.1 (E9, [OFFLINE]: v0.1.1 is a `.rar` whose `log/` contains `log_output.txt`) | Packaging is manual and outside the Makefile; REQ-11 provides the directory layout | Outside this change |

## 8. Non-normative sketch and implementation guidance

This section is guidance only. The requirements in section 3 are binding.

Guidance (non-binding, from [REF] patterns 2 and 4, round-1 REQ-8/15/16, the
structural part of round-2 REQ-12/13, and the REQ-17 experiments R6-R8):

- Declare `.PHONY` for `all`, `build-quorum-election-all`, `clean`, `init`
  and the six per-platform targets ([REF] pattern 1). Former REQ-14, demoted to
  guidance at the plan gate (D6).
- Hold the ldflags symbol path in one variable built from the literal module
  path, and drop the old `QUORUM_ELECTION_DIR`/`PROJECT_ROOT_DIR`/`CONFIG_PATH`
  concatenation (E3).
- Use `:=` for internal derived variables. (`BIN_DIR` stays `:=` and `VERSION`
  stays `?=` by REQ-2, which is binding.)
- Keep the platform list as data (`OS_LIST`, `ARCH_LIST`) and generate the six
  per-platform targets from it, as the current Makefile already does
  (`Makefile:15-16,30`).
- Have `all` reach the six per-platform targets as make prerequisites, instead
  of `;`-joined recursive `$(MAKE)` calls (the cause of Defect C, E6), and
  define `build-quorum-election-all` as depending on `all`. The sketch below
  does this; R5 showed it fails `make all` with a non-zero status (E14).
- For REQ-17, remove the platform's own output file with `rm -f` in its recipe
  immediately before its `go build`. The sketch below does this; R8 showed it
  meets REQ-17 through both `all` and the per-platform target (E17), and R9
  showed it through `build-quorum-election-all` as well (E18). It removes
  only that platform's file and never touches other platforms' files. Do not
  rely on `go build -o` to remove the file (it keeps it on a compile error,
  E15) or on `.DELETE_ON_ERROR` (it has no effect here because the targets are
  phony names, not the output file, E16).

Sketch (run in copy `$TMPDIR/qes-r2` for R4/R5 without the `rm -f` line, and in
copies `$TMPDIR/qes-r4` for R8 and `$TMPDIR/qes-r5` for R9 with it; E13, E14,
E17, E18 and the AC3/AC13 feasibility notes come from it):

```make
BIN_DIR := bin
VERSION ?=

MODULE      := github.com/Anthya1104/quorum-election-cli
APP_DIR     := quorum-election
OUT_DIR     := $(BIN_DIR)/$(APP_DIR)
VERSION_VAR := $(MODULE)/internal/config.Version
LDFLAGS     := $(if $(VERSION),-ldflags "-X '$(VERSION_VAR)=$(VERSION)'")

OS_LIST   := windows darwin linux
ARCH_LIST := amd64 arm64
PLATFORM_TARGETS := $(foreach OS,$(OS_LIST),$(foreach ARCH,$(ARCH_LIST),build-quorum-election-$(OS)-$(ARCH)))

.PHONY: init
init:
	@mkdir -p $(BIN_DIR)

define build_quorum_election
.PHONY: build-quorum-election-$(1)-$(2)
build-quorum-election-$(1)-$(2): init
	@echo "Building quorum-election for $(1)/$(2)..."
	@mkdir -p $(OUT_DIR)/log
	rm -f $(OUT_DIR)/quorum_election_app_$(1)_$(2)$(if $(filter windows,$(1)),.exe,)
	GOOS=$(1) GOARCH=$(2) go build $(LDFLAGS) -o $(OUT_DIR)/quorum_election_app_$(1)_$(2)$(if $(filter windows,$(1)),.exe,) ./cmd/main.go
endef
$(foreach OS,$(OS_LIST),$(foreach ARCH,$(ARCH_LIST),$(eval $(call build_quorum_election,$(OS),$(ARCH)))))

.PHONY: all build-quorum-election-all
all: $(PLATFORM_TARGETS)
build-quorum-election-all: all

.PHONY: clean
clean:
	rm -rf $(BIN_DIR)
```

## 9. Follow-ups (recorded, not implemented)

- Adopt goreleaser, or add a `release`/`dist` target that creates the archive.
  This is a new mechanism and needs owner authorization ([REF] pattern 6).
- Linkage of the six outputs built with the current Makefile from commit
  `c257e98` on a go1.24.1 linux/amd64 host ([OFFLINE] section "Linkage of the
  six outputs"): the native `linux/amd64` binary is dynamically linked (cgo is
  on by default for native builds), while the cross-compiled `linux/arm64`
  binary is statically linked. The two darwin binaries are Mach-O executables
  with the `DYLDLINK` flag (dynamically linked, as darwin binaries are), and the
  two windows binaries are PE32+ executables; [OFFLINE] does not show their
  linkage further. Consider `CGO_ENABLED=0` for release builds so that
  `linux/amd64` is static like `linux/arm64`.
- Consider `-trimpath` and `-ldflags "-s -w"` for smaller, reproducible binaries
  ([REF] pattern 3).
- `internal/logger/logger.go:13` ignores the `os.OpenFile` error.
- Change the default goal (`make` with no target) to `all`.
- Add a `.gitignore` for `bin/`. There is none today (`git ls-files`).
- The untracked `app` binary in the repository root (3.8 MB, dated Feb 10) is
  unrelated to this change.
