# Task plan: furry mochi cats

Round: 4 (draft; applies plan_review_round_3 and the judge's notes)
Spec (confirmed): `docs/fur-cats/2026-11-20-fur-cats-spec.md`
Requirements: `docs/fur-cats/2026-11-20-fur-cats-requirements.md` (carries the approved design
`docs/fur-cats/2026-11-20-fur-cats-design.md`)
Repository: the repository root, Go module `github.com/Anthya1104/quorum-election-cli`, front
end in `web/` (three r0.187, TypeScript, Vite). `main` was at `07ae729` when this plan was
written. Spike source: the local, unpushed branch `spike/fur-cats` (read with
`git show spike/fur-cats:<path>`; never merged, R29).
Implemented with: the `convergent-impl` skill, with this plan's path in `docs/` passed
explicitly (`AGENTS.md`).
Date: 2026-11-20

## 0. How to read and run this plan

**The spec is the authority.** Each task names the spec items it satisfies (R = requirement,
A = acceptance criterion, E = edge case, F = fact, O = out of scope) and the points that are
easy to miss; it does not restate the spec. Where the plan and the spec differ, the spec wins
and the implementer reports the difference. The choices this plan makes where the spec leaves
the builder free are listed in Appendix 2.

**One pull request, four batches.** The work ships as one pull request from one implementation
branch (R29). `convergent-impl` runs the four groups below as four batches, in order:

| Group | Content | Main spec items |
| --- | --- | --- |
| A | Shipped GLB, its Blender source and README, the spike aids | R0-R4, R2a, R29, R32 |
| B | Pure coat and shell-count module with its tests (red, then green) | R12, R13a, R26-R27 |
| C | Furry cats in the app: fur, cat, mochi, page wiring | R5-R11, R13-R25, R27-R28 |
| D | Lineup spacing, builder evidence, pull request text, final check | R24, A21a, R30-R31 |

**Preconditions of the run** (the owner establishes them; the skill creates no branch and
stops on a dirty tree):

1. This plan, the spec and the requirements are committed on the commit the implementation
   branch is cut from (for example the docs pull request is merged into `main` first, or the
   branch is cut from the docs branch). An untracked plan file would make the tree dirty.
2. A new branch with no commit of its own is checked out; `git status --short` prints nothing.
3. The local branch `spike/fur-cats` exists (`git rev-parse spike/fur-cats` succeeds).

**Commits during the run, and `BASE`.** `convergent-impl` runs `git add -A` and makes a local
commit `wip: convergent-impl fur-cats batch <B>` at the end of every batch, and at the end of
the run it runs `git reset --mixed START`, so the whole change is one uncommitted diff on the
start commit. Consequently, from batch B on, `git status --short` and `git diff` without a base
show only the current batch's changes. Every whole-change check in this plan therefore compares
against `BASE`: before the first task of batch A, the implementer runs `git rev-parse HEAD` and
records the SHA as `BASE` (in the batch A summary and, dated, in `$EVID/base.txt`); later
batches read it from there. The branch is cut from the commit that adds the `docs/fur-cats`
spec, plan and requirements on top of `main`, so `BASE` is that docs commit. A whole-change
file list is `git diff --name-status BASE` together with `git status --short` (the latter shows
untracked files not yet added).

Committing for the pull request, pushing, opening the pull request, any preview deploy and
merging are owner gates, not tasks (R30, R31). Nothing in this plan merges or deploys.

**Who checks what.** The implementer is an agent in a sandboxed session, without a phone, without
the owner's eyes, and possibly without Blender 5.3 or a WebGL-capable browser.

- Agent tasks: code, unit tests, builds, scripted checks, the A21a sampling script and the pull
  request text. Their "Done when" must hold at the end of the batch.
- Environment-dependent tasks (marked **[env]** in the title): runs that need Blender 5.3, a
  WebGL browser or network access to jsDelivr. For each check in such a task, one of two things
  holds before its batch closes:
  - the environment allowed the check, it was run, and it **passed**. A check that runs and
    fails is not done by recording the failure: the implementer fixes the cause within the spec
    and reruns until it passes. If the only fix lies outside what the spec lets the builder
    change (for example a shape change to the cat, or a remedy R2a sends to the owner), the
    implementer stops and asks the owner; the batch does not close in the meantime;
  - the environment prevented the check (for example no Blender 5.3, no WebGL browser, no
    network access to jsDelivr), and a not-run note naming what was missing is recorded. A
    not-run note is never a pass: it becomes an open builder item in the pull request
    checklist (D-4). Only environment-blocked checks become open items, with one exception:
    the A24 "not produced" record (heartbeats never delivered to the stopped follower, C-6),
    which spec A24 makes an open item under R30 although it is not environment-blocked (D-4).
- Owner criteria (A10-A24 and every owner confirmation the spec asks for) are never tasks.
  D-4 turns them into the pull request checklist, under R30's rules.

**Evidence directory.** Scratch scripts, harnesses, stubs, logs and the pull request text live
outside the repository in a fresh directory made for this run:
`EVID=~/.cache/convergent/fur-cats-evidence/<UTC date and time>-<first 8 characters of BASE>/`,
created new and empty in A-1 (if `~/.cache/convergent` is not writable in the session, the same
name under `$TMPDIR`). A-1 also writes that path into
`~/.cache/convergent/fur-cats-evidence/current` (or the `$TMPDIR` equivalent) and names it in
the batch A summary; later batches read `$EVID` from there. A second run from the same `BASE`
gets its own directory, so it never reads an earlier run's results.
`$EVID/evidence.md` collects every builder result and not-run note, one heading per spec item
(A4, A5, A6, A7, A7a, A8, A9, A9a, A21a, A24 builder statements). Nothing in `$EVID` is
committed. Every entry starts with the date and `BASE`; an entry is overwritten (not appended
to) when its check is rerun within the run, so a critic never reads a stale result as current.

**Checks that expect no output.** Where this plan says a `grep` or `find` "prints nothing", the
check passes when the command prints nothing. For `grep` that means exit status 1 (no match);
exit status 0 (a match) is a failure, and exit status 2 (an error, such as a missing path) is a
failure of the check itself, to be fixed and rerun. `find` exits 0 in both cases, so only its
output counts. These checks are not part of the Full check's "every command must exit 0".

**Sandbox notes.** Point `GOCACHE` at a writable directory (for example
`export GOCACHE="$TMPDIR/go-build"`) for every Go command and for `npm run build:pages` (spec
§6, R31). Run `npm ci` in `web/` once per batch before the first `npm` or `npx` command; it
writes only the ignored `web/node_modules`. Temporary output directories come from
`mktemp -d`, never a directory inside the repository.

**Full check.** The last task of every group runs all of the following from the repository
root, and every command must exit 0. It follows the `check` job of `.github/workflows/ci.yml`
plus the skill's own `go build ./...` gate. Item 1 deliberately narrows CI's `gofmt -l .` to
`cmd internal`: CI runs it before `npm ci`, while here `web/node_modules` exists and holds Go
files that are not ours (as in the `docs/sim-clock` plans). Apart from that narrowing, if the
list and the workflow file differ, the workflow file wins.

1. `gofmt -l cmd internal` prints nothing.
2. `go build ./...`
3. `node --test scripts/*.test.mjs`
4. `go vet ./...` and `GOOS=js GOARCH=wasm go vet ./cmd/wasm`
5. `go test ./...` and `go test -race ./...` (the plain run mirrors the skill's `impl-verify`,
   the race run mirrors CI)
6. In `web/`: `npx tsc --noEmit` (also part of both builds), `npm run build:pages`,
   `npm run build`.
7. `git diff --name-status BASE` and `git status --short` together list only files this plan
   creates or changes (no `__pycache__`, no renders, no `.blend`, no regenerated GLB, no
   evidence file).

The implementer records each command with its exit code in the batch summary.

**Local paths.** The repository is public (`AGENTS.md`, R32, A7). No committed file may contain
an absolute local path (`/home/`, `/tmp/`, `/Users/`, `/mnt/`, `/private/`, a Windows drive
letter) or a path into a plugin cache, `~`-relative or not, including docstrings and comments.
The shebang `#!/usr/bin/env bash` is not a local path. The audit grep used by A-8 and D-5 is:

```sh
grep -rnE '/home/|/tmp/|/Users/|/mnt/|/private/|(^|[^[:alnum:]_])[A-Za-z]:\\|\.claude/plugins|plugins/cache' \
  web/src/assets scripts web/src/scene web/src/scenery web/src/main.ts web/src/concepts.ts \
  web/vite.config.ts
```

It must print nothing and exit 1 (it prints nothing on `main` at `07ae729`,
`web/vite.config.ts` included; the drive-letter part does not match escapes such as
`imports:\n`). `web/vite.config.ts` is in the scope because A-8, C-7 or D-5 may change it.

**Companion dev-server check.** A-1 (baseline), A-8, C-7 and D-5 run the same check, in `web/`:
start `DEBUG=vite:deps npm run dev -- --port 5199 --strictPort --force` in the background with
its output, stderr included, in a log file in `$EVID` (`> "$EVID/dev-<name>.log" 2>&1`, since
the `vite:deps` debug lines and most warnings go to stderr). Every run, the A-1 baseline
included, passes `--force`: with a valid dependency cache Vite otherwise skips the scan ("Hash
is consistent. Skipping."), prints no scan outcome, and never scans the fur page. `curl` `/concepts.html` and `/src/concepts.ts` (200 each);
then wait, up to 60 s, until the log shows the optimizer's final outcome before stopping the
server, since Vite can answer both requests before its scan ends. `Scan completed in` is
progress only (Vite prints it from a `finally`, even when the scan throws, and checks for
unresolved dependencies after it): the outcome is a later line reporting the optimized
dependencies (or that none are needed), or an error. If 60 s pass with only the progress line,
the check fails and is investigated (judge edit after the final Codex review). The `vite:deps` debug lines themselves are not warnings. The
check passes when both requests return 200, the scan outcome appeared, and the log shows no
error or warning that is not also in the A-1 baseline log. A warning or error also printed by
the baseline run on `BASE` is pre-existing: it is recorded under A7a, not a failure. A new one
attributable to the fur page (R2a) gets the A-8 remedy; a new one from any other part of this
change is fixed within the spec, or the owner is asked when the fix lies outside the builder's
scope. In dev mode the scan also takes `web/dist-pages/index.html` as an entry once the first
`npm run build:pages` (A-8) has created it, while the A-1 baseline ran without it; a message
that comes from that file is not caused by the fur page or this change and is recorded as such,
not remedied as a fur-page issue.

## Group A: Model asset, Blender source and spike aids

Layout decided here (R0, R2a; spec examples taken as given):
`web/src/assets/cat/` holds `cat_v2.glb`, `build_cat_v2.py` and `README.md` (the R0
directory); `web/src/assets/cat-spike/` holds `README.md`, `blender/`, `fur-page/` and
`chosen-fur-params.json` (the R2a directory). The area `web/src/assets/` contains no `.ts` file,
now or later (R0, F9). Nothing from `spike-artifacts/renders/`, no Tripo image and no concept
drawing is copied (R2a, R4).

### A-1: Bring in the approved GLB unchanged

First, before any file is changed: record `BASE` (`git rev-parse HEAD`, §0); create the fresh
run directory `$EVID` and the `current` pointer (§0); run `npm ci` in `web/` and the companion
dev-server check of §0 on this unchanged tree, keeping its log as `$EVID/dev-base.log`, the
baseline every later dev-server check compares with (its warnings and errors, if any, are
recorded under A7a as pre-existing). Then copy the spike GLB byte for byte:
`git show spike/fur-cats:web/src/assets/cat_v2.glb > web/src/assets/cat/cat_v2.glb`
(R0, R1, R29). Do not open or re-export it.

Done when: `sha256sum web/src/assets/cat/cat_v2.glb` prints
`8e4cb63feca4a6de686e48d771375aaa5d0f0b55e0de9f54df2a6681e74c5a01` and `wc -c` prints
`167652` (A4); both lines are recorded in `$EVID/evidence.md` under A4; `BASE` is recorded in
the batch summary and `$EVID/base.txt`; `$EVID` was empty when created and its path is in
`current` and the batch summary; `$EVID/dev-base.log` exists and holds the scan outcome, and
both baseline requests returned 200 (if they did not on `BASE`, the implementer stops and asks
the owner, since no later check could be compared).
Depends on: none.

### A-2: Commit `build_cat_v2.py` as the canonical source, with export and argument checks

Create `web/src/assets/cat/build_cat_v2.py` from
`spike/fur-cats:spike-artifacts/blender/build_cat_v2.py` (R2, F6). Keep the shape code, `P`
and the `@@REPORT@@` output unchanged. Changes:

1. **Argument checks first.** Define `P` and an argument/path check function at the top of the
   file, and run it **before** `import bpy`, `bmesh`, `numpy` and `mathutils` (Appendix 2,
   item 3: this lets the refusals be verified with plain `python3`, which has neither `bpy`
   nor `numpy`). Arguments are everything after the first `--` in `sys.argv` (none when there
   is no `--`). Refuse, in this order, each with a one-line message on stderr that starts with
   `build_cat_v2.py: refused:` and a non-zero exit (`sys.exit(message)`; under Blender with
   `--python-exit-code 1` it must also exit non-zero, which A-7 confirms):
   - no output path;
   - an output path that does not end in `.glb`, compared case-sensitively (`OUT.GLB` and
     `cat_v2.blend` are refused);
   - a second argument that does not start with `{` or does not parse to a JSON object;
   - any third argument (including a second JSON object);
   - a JSON key that is not a key of `P`;
   - an output path whose resolved form (`os.path.realpath(os.path.abspath(out))`) equals the
     resolved shipped GLB, located as `cat_v2.glb` in the script's own directory
     (`os.path.dirname(os.path.realpath(__file__))`);
   - a resolved output path whose file name is `cat_v2.blend`, or which equals the resolved
     companion path;
   - a companion path (`cat_v2.blend` in `os.path.dirname(out)` as given, `.` when empty) that
     is a symbolic link (`os.path.islink`), whatever its target, or that resolves to the
     shipped GLB.
   Only after every check passes is the JSON override merged into `P` (R2, E11).
2. **No temporary `OUT`.** Remove `OUT`. In `main()`, after the build, create the output
   directory (`os.makedirs(os.path.dirname(out) or ".", exist_ok=True)`: the same "`.` when
   empty" rule as the companion path, because an output given as a bare file name such as
   `out.glb` has an empty directory part and `os.makedirs("")` raises), save `cat_v2.blend` at the companion path, then
   export. No directory or file is created before every check has passed (R2).
3. **Export step.** Select `Body` and its children `Eye_L`, `Eye_R`, `Tail`, `Whiskers_L`,
   `Whiskers_R` only, make `Body` active, and call Blender's built-in
   `bpy.ops.export_scene.gltf(filepath=out, ...)` with these settings written into the script
   (copied from the blender-agent-skills `export_asset.py` `web` preset, version 1.3.2; name the
   source in a comment without any path into a plugin cache): `GLTF_BASE` =
   `use_selection=True, export_format="GLB", export_yup=True, export_apply=True,
   export_texcoords=True, export_normals=True, export_tangents=False,
   export_materials="EXPORT", export_image_format="AUTO", export_animations=True,
   export_animation_mode="ACTIONS", export_skins=True, export_morph=True,
   export_influence_nb=4, export_def_bones=True, export_leaf_bone=False, export_extras=False,
   export_cameras=False, export_lights=False`, then the `web` additions
   `export_image_format="WEBP", export_image_quality=85,
   export_meshopt_compression_enable=True` (the later value wins). The script imports no
   add-on or plugin module (R2).
4. **Docstring.** Replace the spike docstring with the documented command of R3, run from the
   repository root, as two runnable commands after `out=$(mktemp -d)`, with no bracket
   notation (a shell passes `['{"ear_h": 0.3}']` as one argument with literal brackets, which
   the script refuses):
   - without an override:
     `"$BLENDER_EXE" -b --factory-startup --python-exit-code 1 -P web/src/assets/cat/build_cat_v2.py -- "$out/cat_v2.glb"`
   - with an override, the quoted JSON object alone as the last argument:
     `"$BLENDER_EXE" -b --factory-startup --python-exit-code 1 -P web/src/assets/cat/build_cat_v2.py -- "$out/cat_v2.glb" '{"ear_h": 0.3}'`

   Then the list of refusals, and the usage rule that output belongs outside the repository
   (R2a: a documented rule, not a check, O8).

Done when:
- `PYTHONPYCACHEPREFIX="$(mktemp -d)" python3 -m py_compile web/src/assets/cat/build_cat_v2.py`
  exits 0 and no `__pycache__` appears in the repository.
- An offline harness, `$EVID/a5-offline.sh` (not committed), runs the script with plain
  `python3 web/src/assets/cat/build_cat_v2.py -- <args>` from the repository root, once for
  each refused run of A5, each in new, empty directories from `mktemp -d`:
  no argument; the repository-relative shipped GLB `web/src/assets/cat/cat_v2.glb`; a symbolic
  link to the shipped GLB; `ear_h=0.3` with an output path in a not-yet-existing subdirectory;
  two JSON objects; a key not in `P`; an output named `cat_v2.blend`; an output named
  `OUT.GLB`; a link `out.glb` whose target is `<second dir>/cat_v2.blend`; a valid `out.glb`
  beside an existing link `cat_v2.blend` that points to the shipped GLB. Each exits non-zero
  with the `build_cat_v2.py: refused:` prefix on stderr, the directories hold exactly what they
  held before (the not-yet-existing subdirectory still does not exist), `git status --short`
  is unchanged and the A4 hash still holds. Two control runs, a valid `out.glb` in an empty
  directory and the same with `'{"ear_h": 0.3}'`, pass every check and stop at
  `ModuleNotFoundError` for the first Blender-only module imported after the checks (`bmesh`
  or `bpy`, whichever the file imports first; the spike imports `bmesh` before `bpy`; `numpy`
  if it comes first and plain `python3` lacks it) without creating anything. A third control
  run with a bare file name (`out.glb`, run from inside a new empty directory with the script's
  path given relative to it or absolute) reaches the same `ModuleNotFoundError`. The harness output is recorded in
  `$EVID/evidence.md` under A5 as "offline check of the refusals (plain python3, no Blender)";
  it does not replace A5 (A-7).
Depends on: A-1.

### A-3: Write the rebuild README next to the GLB

Create `web/src/assets/cat/README.md` (R0, R3) with:
- the two rebuild commands of A-2 item 4 exactly as written there (one without an override,
  one with the quoted JSON object alone; no bracket notation), stating their working directory
  (repository root) and an output directory outside the repository from `mktemp -d`, including
  `--python-exit-code 1`; Blender 5.3 headless, no add-on needed;
- the refusals (shipped GLB as output, a `.blend` collision, a companion `cat_v2.blend` that is
  a link or resolves to the shipped GLB, a non-`.glb` output, invalid or extra arguments, an
  unknown `P` key); output belongs outside the repository;
- the `cat_v2.blend` written beside the output GLB is a by-product, never committed; replacing
  the shipped GLB is a separate copy made only under the regeneration rule;
- the regeneration contract of R3 (objects, parenting, materials, origins, front axis), then,
  marked as derived from the loader, the structure `web/src/scene/cat.ts` relies on: `Body`
  identity transform; `Tail` a direct child of `Body` with its position read as its origin in
  body space; eye and whisker positions read the same way; on each eye object the ring is a
  direct child mesh with material `M_EyeRing`. If C-3 ends up relying on something else, C-3
  updates this list;
- the `Col` / `COLOR_0` vertex colour is not part of the contract and not used; a regenerated
  GLB counts as the same cat only if it keeps the contract and the owner agrees it looks the
  same; any shape change goes to the owner.

Done when: the README covers every R3 item above and passes the local-path grep; and
`grep -nF "['{" web/src/assets/cat/README.md web/src/assets/cat/build_cat_v2.py` prints nothing
(no bracketed override left in either command).
Depends on: A-2.

### A-4: Copy and clean the Blender spike helpers

Create `web/src/assets/cat-spike/blender/` with `build_cat.py`, `render_views.py`,
`render_ear.py` and `sample_colors.py` from `spike/fur-cats:spike-artifacts/blender/`, and
`web/src/assets/cat-spike/chosen-fur-params.json` unchanged (R2a). Replace every local path,
including in docstrings and comments (F6 is not exhaustive: grep each file):

- `build_cat.py`: `OUT` becomes a required output-directory argument after `--`; the JSON
  override stays the last argument as today; the docstring names the new command and no
  temporary directory.
- `render_views.py`: arguments after `--` are `<out-dir> <concept-drawing> [prefix]`; `CONCEPT`
  is that argument; the `turntable` helper is found through the environment variable
  `BLENDER_AGENT_SKILLS_DIR` (the skills' `skills` directory, Appendix 2 item 5), with no
  default path, and the script fails with a clear message when it is unset; renders go to
  `<out-dir>`; docstring updated (it opens `cat_v2.blend`).
- `render_ear.py`: arguments `<out-dir> [prefix]`; drop the unused `CONCEPT`; same
  environment variable; fix its docstring, which today names `render_views.py`.
- `sample_colors.py`: the image path is an argument after `--`; it still only prints colours;
  add a docstring with its command.

The docstrings state that the output directory must be outside the repository (a usage rule,
O8).

Done when: `PYTHONPYCACHEPREFIX="$(mktemp -d)" python3 -m py_compile` passes on all four files;
the local-path grep prints nothing for `web/src/assets/cat-spike/`; `chosen-fur-params.json` is
byte-identical to the spike file.
Depends on: A-1.

### A-5: Rewrite `run_v2.sh`

Create `web/src/assets/cat-spike/blender/run_v2.sh`, executable, from scratch to the R2a
contract: `run_v2.sh <work-dir> <concept-drawing> ['<JSON>']`.

- `#!/usr/bin/env bash`, `set -euo pipefail`; usage text (it says the work directory must be
  outside the repository) and a non-zero exit on a wrong argument count; requires
  `$BLENDER_EXE`; passes `BLENDER_AGENT_SKILLS_DIR` through unchanged; no `cd` anywhere,
  including inside a command substitution or subshell (R2a: "It does not cd anywhere"); no
  `grep` or other filter on Blender's output.
- Locates its own directory with `realpath` instead of `cd`/`pwd`:
  `here=$(dirname "$(realpath "${BASH_SOURCE[0]}")")`; the R0 directory is
  `realpath "$here/../../cat"` and the repository root `realpath "$here/../../../../.."` (the
  fixed relative path five levels up from `blender/`).
- Before creating anything or starting Blender: resolves `<work-dir>` with `realpath -m`
  (absolute, symbolic links of the existing components resolved, and no requirement that the
  path exists yet) and refuses it when it equals or lies under the repository root (compare
  the resolved path with the root and with the root followed by `/`); refuses a `<work-dir>`
  that exists and is not empty. Then creates it if absent.
- Runs `"$BLENDER_EXE" -b --factory-startup --python-exit-code 1 -P <R0>/build_cat_v2.py -- "<work-dir>/cat_v2.glb" [json]`;
  exits non-zero when that fails or `<work-dir>/cat_v2.blend` is missing afterwards.
- Only then runs `render_views.py` (with `<work-dir>`, the concept path and prefix `v2`) and
  `render_ear.py` (with `<work-dir>` and `v2`) on `<work-dir>/cat_v2.blend`, each with
  `--python-exit-code 1`; a failing helper fails the script.

Done when:
- `bash -n` passes.
- Stub runs (A7a), with `BLENDER_EXE` set to `$EVID/stub-blender.sh`, a stub that only appends
  its arguments to a marker file in `$EVID` and exits 0, and any readable file as the concept
  drawing: (1) a `<work-dir>` outside the repository that already holds a file (a new
  directory from `mktemp -d` into which one file is written, so the run tests the non-empty
  refusal and not the inside-the-repository one): non-zero exit, the directory unchanged,
  no marker written; (2) a not-yet-existing `<work-dir>` inside the repository (for example
  `web/a7a-probe/x`): non-zero exit, nothing created, no marker, `git status --short`
  unchanged. A third stub run (Appendix 2 item 4), with a stub that exits 1, into a new empty
  directory outside the repository: non-zero exit and exactly one stub call, which invoked
  `build_cat_v2.py`, so neither helper started. A fourth stub run (Appendix 2 item 4), with a
  stub that exits 0 but writes no `cat_v2.blend`, into a new empty directory outside the
  repository: non-zero exit and exactly one stub call (the `build_cat_v2.py` one), which checks
  R2a's "`<work-dir>/cat_v2.blend` does not exist after it" branch without Blender. The outputs
  are recorded under A7a.
Depends on: A-2, A-4.

### A-6: Copy the fur page and write the spike-aids README

Create `web/src/assets/cat-spike/fur-page/` with `index.html`, `main.js` and `fur.js` from
`spike/fur-cats:spike-artifacts/fur-page/` (R2a, F6a). Change only the model load in `main.js`:
it loads `../../cat/cat_v2.glb` (relative to the page) and the `../cat.glb` fallback is
removed. Its `stripes`, fur-reacts and rim tuning code stay as in the spike (a preserved tuning
tool, R2a; A7 excludes this directory).

Create `web/src/assets/cat-spike/README.md`: these files are spike aids, not needed to rebuild
the GLB; how to run each Blender script and `run_v2.sh` (arguments, `BLENDER_EXE`,
`BLENDER_AGENT_SKILLS_DIR`, output outside the repository, the concept drawing is never
committed and must be at least 1760 × 1721 px for `render_views.py`, F6); how to open the fur
page: `python3 -m http.server` run in `web/src/`, then `/assets/cat-spike/fur-page/`; it needs
network access to jsDelivr. If A-8 finds that the Vite dev server serves it, the README may say
so.

Done when: `grep -n "cat.glb'" web/src/assets/cat-spike/fur-page/main.js` finds no fallback;
with `python3 -m http.server <port> --bind 127.0.0.1` run in `web/src/`,
`curl` returns 200 for `/assets/cat-spike/fur-page/index.html`, `/assets/cat-spike/fur-page/main.js`
and `/assets/cat/cat_v2.glb`, and the GLB fetched that way has the A4 hash. The visual check
"loads the committed GLB and renders" (A7a) is done in A-7.
Depends on: A-1.

### A-7: [env] Run the Blender and fur-page checks, or record why the environment prevents them

Each item below follows §0's rule for **[env]** tasks: if the environment allows it, it is run
and must pass before batch A closes (a failure is fixed and the check rerun, or, when the only
fix lies outside the spec's builder scope, the owner is asked); if the environment prevents
it, a not-run note is recorded and the item becomes an open builder item in D-4.

1. If `"$BLENDER_EXE" --version` reports Blender 5.3: run A5 exactly as written, from the
   repository root with the README commands, into `mktemp -d` directories:
   - The base run, checked against the R3 contract directly, with a short Python reader in
     `$EVID` over the GLB's JSON chunk (POSITION accessor `min`/`max` are stored uncompressed
     in the JSON). These are the pass conditions:
     - **Objects and parenting:** nodes named `Body` and `Tail`; `Eye_L`, `Eye_R`,
       `Whiskers_L`, `Whiskers_R` and `Tail` direct children of `Body` (R3 and the loader
       structure of A-3).
     - **Materials:** every primitive of the `Body` and `Tail` meshes uses `M_Fur`; each eye
       node's mesh has a primitive whose material is `M_EyeRing` (primitive material indices
       resolved to names; the loader turns that primitive into a direct child mesh of the eye).
     - **`Body` origin and transform:** `Body` has an identity transform (no translation,
       rotation or scale other than identity); its origin is at the bottom centre: `Body`
       POSITION `min[1]` = 0 and the x midpoint of its `min`/`max` = 0, each within 1e-3 m.
     - **Front axis:** the face points along +Z in glTF space (front -Y in Blender): both eye
       nodes have a positive z translation in `Body` space.
     - **`Tail` origin at its attachment:** the `Tail` POSITION bounds contain its own origin
       (`min` ≤ 0 ≤ `max` on every axis), and the `Tail` translation lies within the `Body`
       POSITION bounds (the origin is where the tail leaves the body).
     - `extensionsUsed` contains `EXT_meshopt_compression`, `KHR_materials_sheen`,
       `KHR_materials_specular`; `cat_v2.blend` is written beside the GLB.

     **Diagnostics, not pass conditions:** the reader also compares, with the shipped GLB, every
     mesh's POSITION `min`/`max` and every node's translation, rotation and scale (the shipped
     GLB has `Body` untranslated, `Tail` at (0.285, 0.320, -0.610), eyes at z about 0.49 and
     0.50, `Body` `min[1]` 0 and x midpoint about 0.00002). Any difference is recorded under A5
     and reported to the owner as a difference for the owner's judgement (R3: the owner decides
     whether a regenerated GLB looks the same); it does not fail the run, and the builder does
     not change shape code because of it.
   - The override run with a different `ear_h` in a separate directory (compare the `Body`
     POSITION accessor's `max[1]`, which glTF stores uncompressed in the JSON; it must differ
     from the base run's).
   - A bare-name run: from inside a new empty directory from `mktemp -d`, the script given by
     its absolute path and the output `out.glb`; it writes `out.glb` and `cat_v2.blend` in that
     directory (this exercises A-2 item 2's `os.makedirs(... or ".")`).
   - Every refused run of A5 with the real Blender (non-zero exit under
     `--python-exit-code 1`, nothing created, `git status --short` and the A4 hash unchanged).
   Record A4 again afterwards. A breach of a pass condition above or a failed run is a
   failure, not a note: fix `build_cat_v2.py` within R2 (for example an exporter keyword Blender
   5.3 rejects) and rerun; a fix that would change the cat's shape goes to the owner. A
   diagnostic difference from the shipped GLB alone is reported, not fixed. The shipped GLB is
   never replaced.
2. If Blender 5.3 and `BLENDER_AGENT_SKILLS_DIR` are both available: the two real-Blender
   `run_v2.sh` runs of A7a (a PNG of at least 1760 × 1721 px created in `$EVID` as the concept
   stand-in; the malformed override `'{"ear_h":'` run under `bash -x`), with `git status`
   compared before and after; both must behave as A7a states.
3. If a browser that renders WebGL and network access to jsDelivr are available: open the fur
   page as the README says; the committed GLB must load and render (A7a).

Done when: for each of the three items, `$EVID/evidence.md` holds either a passing result or a
not-run note that names what the environment lacked (for example "Blender 5.3 not available in
the session"); no executed check is left failing. Every not-run item is carried into the D-4
checklist as an open builder item.
Depends on: A-3, A-5, A-6.

### A-8: Group A full check

Run the Full check. Also:
- A7a build outputs: after both builds, `find internal/web/dist web/dist-pages` lists no
  `fur-page`, `chosen-fur-params.json`, `.py` or `run_v2.sh` file.
- A7a dev server: run the companion dev-server check of §0 (scan outcome awaited, log compared
  with `$EVID/dev-base.log`). If the log shows a new error or warning attributable to the fur
  page, apply an R2a fix that leaves the spike-aids directory, app modules, `index.html`,
  `concepts.html` and both build outputs unchanged (for example `optimizeDeps.entries` limited
  to `index.html` and `concepts.html` in `web/vite.config.ts`), rerun, and record the fix under
  A7a for the pull request; any other remedy for the fur page is stopped and reported to the
  owner (R2a). A warning also in the baseline log is recorded as pre-existing, not fixed. This
  remedy (the "A-8 remedy") is also the one C-7 and D-5 apply.
- No `.ts` file under `web/src/assets/` (`find web/src/assets -name '*.ts'` prints nothing).
- The local-path grep prints nothing; no image file is under `web/src/assets/`
  (`find web/src/assets \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.webp' \)`
  prints nothing, R4).
- `git diff --stat BASE -- web/package.json web/package-lock.json` is empty (A6).

Order: the dev-server check and any remedy first; then the Full check and the other items above
on the tree that remedy left, so the green run covers the final tree of batch A.

Done when: every command above and the Full check pass on the final tree of the batch, with
results in the batch summary and the A6 and A7a results also in `$EVID/evidence.md`.
Depends on: A-1, A-2, A-3, A-4, A-5, A-6, A-7.

## Group B: Coat table and shell-count rule

### B-1: Write the failing tests for the pure module (red)

Create `scripts/web-cats.test.mjs`, importing from `../web/src/scene/coats.ts` through Node's
type stripping as `scripts/web-hud.test.mjs` does (F2). Tests:

- A2, the R26 table: `shellCount(n, width, null)` for `n` = 1..9 equals the table row
  "desktop" at widths 1280 and 640 and the row "small" at widths 639 and 375 (the 640
  breakpoint, R25, E9).
- A2, the seven R26 invariants, checked over `n` = 1..9 for both classes, as separate
  assertions (they keep holding if a later tuning under A22/A23 refines the constants).
- A2, R27 and E7: with any `n` and width, `"2.6"` gives 3, `"0"` gives 1, `"100"` gives 64,
  `" 7 "` gives 7; `""`, `"   "`, `"abc"`, `"Infinity"`, `"NaN"` and `null` give the automatic
  count; an override gives the same value on both screen classes and for every `n` (A8, E2).
  E6: 9 members on a small screen with no override give the automatic count, at least 6.
- A3: `coatFor(id)` returns `{ coat, seed }` (an object, not an index); the test checks
  `coat === COATS[id % 5]` (equivalently `COATS.indexOf(coat) === id % 5`), seeds 1-5 for ids
  0-4, and coats 0-3 with seeds 101-104 for ids 5-8 (R12).
- R13: `PATTERNS` is `["solid", "patches", "points", "bicolour"]` (no `stripes`), every coat's
  pattern is in it, and the coat order is Bombay, odd-eyed white, calico, Ragdoll, British
  bicolour.

Run `node --test scripts/web-cats.test.mjs`; it fails because the module does not exist yet.
Record that red output in the batch summary.

Done when: the test file exists and its red run is recorded.
Depends on: none.

### B-2: Implement `web/src/scene/coats.ts` (green)

A pure module meeting F2 and R13a: no import at all (not even `import type` is needed), no
`window` or `document`, erasable TypeScript only (no `enum`, no parameter properties, no
namespaces). A header comment says why (it is loaded by `node --test` before `npm ci`). Exports:

- `PATTERNS` (as in B-1) and `type Pattern`.
- `interface Coat` and `COATS`: the five coats of design §5.3, copied from the spike's `COATS`
  in `spike/fur-cats:web/src/scene/cat.ts` (sRGB hex colours, eye colours, whisker colour, fur
  length, density, root darkness, bald tint, tip rim, scatter, room rim). Cross-check each value
  against the design §5.3 tables and report any difference instead of changing it. The whisker
  colours stay as in the table; R13b is met by the table and needs no code (R13b, A12). The
  spike's per-coat `seed` field is replaced by the rule below.
- `coatFor(id: number): { coat: Coat; seed: number }` with `COATS[id % 5]` and
  `seed = (id % 5) + 1 + 100 * Math.floor(id / 5)` (R12).
- `SMALL_SCREEN_WIDTH = 640` and `shellCount(members: number, viewportWidth: number, rawShells: string | null): number`:
  when `rawShells`, trimmed, is non-empty and `Number(rawShells)` is finite, return it clamped
  to 1-64 and then rounded (as the spike's `Math.round(clampNumber(...))`); otherwise
  `clamp(floor(5 * S / members), 6, 22)` with `S = 22` when `viewportWidth >= 640`, else
  `S = 10` (R25, R26, R27).

Done when: `node --test scripts/*.test.mjs` passes (the B-1 tests green) and `npx tsc --noEmit`
in `web/` passes.
Depends on: B-1.

### B-3: Group B full check

Done when: the Full check passes.
Depends on: B-2.

## Group C: Furry cats in the app

The spike files `spike/fur-cats:web/src/scene/fur.ts`, `.../cat.ts`, `.../mochi.ts` and the
spike's changes to `web/src/main.ts` and `web/src/concepts.ts` (`git diff main...spike/fur-cats`)
are the starting point. They are copied and cleaned, not merged.

### C-1: Allow `scene` to import the `assets` area

In `scripts/web-import-direction.test.mjs`, change `scene: ['sim']` to
`scene: ['sim', 'assets']` (R0, F1, F9). Add no `assets` key: the area holds no `.ts` file.

Done when: `node --test scripts/web-import-direction.test.mjs` passes.
Depends on: A-1.

### C-2: Port the fur shaders to `web/src/scene/fur.ts`

Copy the spike's `fur.ts` and change:

- **Rim (R14).** Remove `uRimBoost` and every use; `roomRim()` is
  `pow(1 - saturate(dot(n, viewDir)), 2) * uRoomRim`. `uRimColor` stays `#ffe0c0` and is set
  nowhere else. The weighting stays as in the spike: base layer `0.3 * vFurMask` (none on bald
  skin), shells `mix(0.3, 1.0, vLayer)` (tips most).
- **Static fur (R8, A7).** Remove `uFurTrail`, `uFurPuff`, their uniforms and the `splay` /
  trail lines in the shell vertex shader. Gravity droop and wind sway stay.
- **Patterns (R13).** Import `PATTERNS` (and `type Pattern` if needed) from `./coats`; delete
  the spike's `PATTERNS` and the `stripes` branch. The GLSL branches compare against indices
  interpolated from `PATTERNS.indexOf("patches")`, `"points"` and `"bicolour"` in the template
  string, so TypeScript and GLSL cannot drift (Appendix 2, item 6). `solid` stays the fallback
  (col1 tints the ears only; the tail stays the base colour).
- **Shell geometry (R6, R25).** `makeShellGeometry(geo, count)` builds a new
  `InstancedBufferGeometry` whose index and `position`, `normal` and `furMask` attributes are
  **clones** (`.clone()`), not the GLB geometry's own objects, and sets
  `instanceCount = count`. Reason (verified in `web/node_modules/three/src/renderers/webgl/`):
  disposing a geometry deletes the GL buffers of every attribute it holds
  (`WebGLGeometries.destroyGeometry`), and the binding-state cache of the GLB geometry that
  shares those attribute objects is not invalidated (`WebGLBindingStates.needsUpdate` compares
  attribute objects, not GL buffers), so disposing a shell geometry that shares attributes would
  break the cached GLB body after the first restart. It no longer reads `U.uShells`.
- Keep the shared settings of R8 (thickness 0.46, gravity 0.43, wind 0.19, normal strength 0.94,
  normal tiles per metre 9), the face mask defaults of R9 (`near 0.01`, `far 0.13`,
  `baseFade 0.08`), the deformation and its JS mirror `mochiDeform` (R15), the order
  "deform, then extrude the shell" (R10), `vertexColors = false` on the surface material (R11),
  and the coat colour evaluated identically in the base layer and every shell (R13).
- Comments: no mention of `?rim`, the fur-reacts toggle or `web/main.js` of the spike page.

Done when: `npx tsc --noEmit` passes (the module may be unused until C-3) and
`grep -nE 'uRimBoost|uFurTrail|uFurPuff|stripes|rimColor' web/src/scene/fur.ts` prints nothing.
Depends on: B-2.

### C-3: Port the cat loader and builder to `web/src/scene/cat.ts`

Copy the spike's `cat.ts` and change:

- Import the GLB as `import catUrl from "../assets/cat/cat_v2.glb?url";` (R1, F3).
- `loadCatModel()` takes no options (no `shells`, `rim`, `rimColor`), loads once with
  `GLTFLoader` and `MeshoptDecoder`, and returns at once when already loaded (R5; the GLB is
  fetched once per page, A8). It no longer builds shell geometry. On failure the promise
  rejects and nothing else happens (O1).
- Remove the spike's `Coat` and `COATS`; `buildCat(id)` uses `coatFor(id)` from `./coats` and
  sets every colour with `THREE.Color#set(hex)` so colour management converts sRGB to linear
  (R11, R12). `uPattern` is `PATTERNS.indexOf(coat.pattern)`.
- New `beginCast(shells: number)`: disposes the previous cast's two shell geometries (if any),
  creates the body and tail shell geometries with `makeShellGeometry(geo, shells)` and sets
  `U.uShells.value = shells`. `buildCat` throws when `beginCast` has not been called. The
  cached GLB geometry, lid geometry and fur normal map are never disposed (R6, R25, E1).
- Keep the spike's landmark code (`headTop` as in F8, ear tips, `uFace`, `uMuzzle`, tail axis),
  the face mask on `Body` and `Tail`, the per-eye ring materials (odd eyes), the per-coat
  whisker colour, the lids at each ring centre in that eye's colour (R23, E5), shells as
  children of `Body` and `Tail` with `userData.skipAO = true`, `castShadow` on the GLB meshes
  only (scope: shadows from the undeformed shape), and `materials` listing every per-cat
  material (R6).
- If the loader relies on structure beyond the A-3 README list, update that list (R3).

Done when: `npx tsc --noEmit` passes and `node --test scripts/web-import-direction.test.mjs`
passes with the new import.
Depends on: C-1, C-2, A-3.

### C-4: Replace the member in `web/src/scene/mochi.ts`

Replace the procedural body, canvas coats, face and the uniform-scale hop and squash with the
spike's `Mochi` (`spike/fur-cats:web/src/scene/mochi.ts`), keeping the public surface used by
`main.ts`, `concepts.ts` and `scenery/kit.ts`: `MemberLook`, `Mochi(id, look?)`, `root`,
`squash`, `hitMesh`, `crownEnabled`, `anchor()`, `receive()`, `setHover()`, `dispose()`,
`update()` (R24). Points to keep or fix:

- Constants of R17: hop height 0.3, squash 1, wobble stiffness 120, damping 6, sleep slump 0.12;
  triggers as in the spike (candidates hop, `receive()` bumps, a role change pops, a stopped
  member slumps, breathing with a per-cat phase). Per-cat hop phase: initialise `nextHop` from
  the cat's `phase` (`phase / (2π) * HOP_INTERVAL`) so cats that are candidates from the start
  do not hop in step (Appendix 2, item 7; R17).
- Uniform scale is used only for the hover enlargement (R18). Sleep tilt
  `squash.rotation.z = sleep * 0.14` and the grey tint on fur and skin materials (R22).
- Crown, lamp, lamp light and label at the formulas of R19 and R20 (`headTop`, `bodyH` = ear
  tips, the coat's fur length, `LABEL_LIFT = 0.42`, `LABEL_LIFT_LEADER = 0.72`); the label stays
  a child of `root` (R20). The anchor is `headTop * (0.55 - 0.15 * sleep)` (R22).
- Tail origin follows `mochiDeform` of its rest origin and the tail swings on its own spring
  (R16).
- Timer ring resized so its inner edge clears the widest furry body: `RingGeometry(0.72, 0.82,
  TIMER_SEGMENTS, 1)` (0.598 + 0.095 < 0.72), same width and look; the sigils (0.95 and 1.05)
  already clear it and stay (R21, Appendix 2 item 8). This ring size is a builder choice
  awaiting the owner's A17 judgement: the clearance holds at rest only, and the landing spread
  (q up to 0.5, a spread factor of about 1.38 at the widest height) briefly pushes the
  silhouette past 0.72 during the bounce. The confirmed spec records no owner acceptance of
  that overlap; the owner judges readability during the bounce under A17. The plan does not
  enlarge the ring further, and Appendix 2 item 8 and the pull request say so.
- `dispose()` disposes the per-cat materials, the timer ring and the sigils; it never disposes
  shared GLB geometry (R6).
- Remove `BODY_H`, `DOME_TOP`, the coat painters and every import that becomes unused
  (`noUnusedLocals` is on); `web/src/scene/random.ts` stays (other modules use it).
- Re-export `loadCatModel` and `beginCast` from `./cat` (as the spike re-exports
  `loadCatModel`), so the pages import from `./scene/mochi`.

Done when: `npx tsc --noEmit` passes;
`grep -rn 'BODY_H\|DOME_TOP' web/src/scene web/src/scenery web/src/main.ts web/src/concepts.ts`
prints nothing. The scope leaves out `web/src/assets/cat-spike/`: the fur page committed in A-6
keeps its own `BODY_H` (R2a: its content stays as in the spike apart from the model load).
Depends on: C-3.

### C-5: Wire loading and the shell count into both pages

- `web/src/main.ts`: before `source.connect(...)`, `await loadCatModel();` (R5; a failed load
  leaves an uncaught error in the console, O1). In `rebuild(n)`, after the old members are
  disposed and before the first `new Mochi`, call
  `beginCast(shellCount(n, window.innerWidth, params.get("shells")))` (R25, R26, R27, E1, E2).
  Add none of the spike's `furShells`, `rim` or `rimColor` constants. `clampNumber` stays for
  `slowmo` and `members`, unchanged.
- `web/src/concepts.ts`: `await loadCatModel();` then
  `beginCast(shellCount(members.length, window.innerWidth, params.get("shells")))` before the
  members are built (R5, R28). `theme.dress` and `theme.onRole` calls stay (R24).

Done when: `npx tsc --noEmit` passes; `grep -rnE 'get\("rim|rimColor|furShells' web/src`
prints nothing; `npm run build` passes.
Depends on: C-4.

### C-6: [env] Builder checks in a browser, or record why the environment prevents them

Each check follows §0's rule for **[env]** tasks: run when the environment allows and then
required to pass before batch C closes (a failure is fixed within the spec and the check
rerun; a fix outside the builder's scope goes to the owner), or a not-run note when the
environment prevents it.

Always (no browser needed; these must pass):
- A9 proxy: after `npm run build`, start `go run ./cmd/main.go serve --addr 127.0.0.1:18080` in
  the background, fetch `/`, find the GLB asset URL in the served JavaScript (`assets/*.glb`),
  fetch it and confirm it has the A4 hash; stop the server. Record under A9 as the scripted
  part.
- From the code, record under A8 where the count is chosen (`rebuild` and `concepts.ts`), that
  `beginCast` disposes the previous shell geometry and not the GLB geometry, that
  `loadCatModel` returns early once loaded, and that `?shells=4` gives 4 (B-1 test) on
  `concepts.html?theme=lineup` (A21's builder statement).

If a WebGL-capable browser runs in the session (for example a local Chrome with
`--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader`, reading the console
through `--enable-logging=stderr`), add temporary, uncommitted console logging and check:
- A8: drawn shell count (the `uShells` value and both shell geometries' `instanceCount`) after
  load and after a HUD restart with another member count, with and without `?shells=N`; a
  window resize across 640 px leaves it until the next restart, which then gives the rule's
  count for the new class (automatic) or the same count (override); one GLB request per load;
  with the GLB request delayed, no member is built and the source does not connect before it
  loads; after a restart, the previous cast's materials and shell geometries are disposed
  (`renderer.info.memory.geometries` and a temporary dispose log) and the GLB geometry is not.
- A9: the default-mode build served by the Go binary renders the cats.
- A9a: hover and click on members, including a hopping candidate.
- A24 packet delivery: on the main page, a stopped follower receives heartbeats
  (`target.receive()` runs on arrival, logged in `PacketSystem`) and is bumped.
Each executed check must show the behaviour stated above; a check that shows something else
(for example a GLB requested twice, a shell geometry not disposed, a click that misses a
hopping candidate) is a failure to fix and rerun, not a result to record.

**A24 delivery failure, the one recorded outcome that is neither a pass nor environment-blocked**
(spec A24, R30). If heartbeats to the stopped follower are launched but never arrive, or are
never launched, the implementer looks for the cause. A cause in this change is fixed and the
check rerun. Otherwise:
- `$EVID/evidence.md` under A24 records "not produced: heartbeats not delivered to the stopped
  follower on <revision>", what was observed, the cause found or that none was found, and that
  this is reported as a possible regression of the packet path (F12 expects delivery), not as a
  pass;
- the PR draft task (D-4) carries it into the pull request as written there; A24 stays open under R30, and the
  owner decides (a fix, or the owner's explicit acceptance recorded in the pull request);
- the batch summary flags it to the owner. Batch C may close with this record; it does not
  wait for the owner's decision, which the pull request carries.
This path covers only non-delivery. A heartbeat that arrives (`target.receive()` runs) without
bumping the stopped member is a failure of this change: it is fixed and rerun like any other
executed check, never recorded as "not produced".

Remove every temporary log and confirm with `git diff` that none remains.

Done when: `$EVID/evidence.md` holds, under A8, A9, A9a and A24, either a passing result or a
not-run note naming what the environment lacked, or, for A24 delivery only, the "not produced"
record above; the always-run items passed and are recorded; no executed check is left failing
(a delivered heartbeat without a bump is failing); no temporary code remains.
Depends on: C-5.

### C-7: Group C full check

First run the companion dev-server check of §0 on the revision that now loads the GLB through
`?url` and imports `GLTFLoader` and `MeshoptDecoder` in `concepts.ts` (R31 needs a working
companion dev preview; this is the check after group C, and D-5 repeats it on the final
revision, since D-2 may still change `web/src/scenery/lineup.ts`). A new warning or error
attributable to the fur page gets the A-8 remedy (which may edit `web/vite.config.ts`); one
from another part of this change is fixed within the spec or taken to the owner; one also in
the baseline log is recorded as pre-existing. Record the result under A7a (dev server, after
group C). Then, on the tree the last remedy left, run the Full check, the A7a build-output
audit of A-8 (both builds' outputs) and the grep below.

Done when: the dev-server check passes as §0 defines it (any remedy recorded under A7a for
D-3); the Full check passes on the final tree of the batch; the A7a build-output audit prints
nothing; and `grep -rnE 'uRimBoost|uFurTrail|uFurPuff|stripes|get\("rim'` over
`web/src/scene web/src/main.ts web/src/concepts.ts` prints nothing (A7, app part).
Depends on: C-6.

## Group D: Lineup spacing, evidence and pull request text

### D-1: Write and run the A21a sampling script

Write `$EVID/a21a/` (not committed; outside the repository), a Node script that poses the five
lineup cats in scene space as `concepts.html?theme=lineup` does, using the implementation's own
constants and formulas copied from C-2 to C-5 (state the source lines in the method): positions
from the `layout` of `web/src/scenery/lineup.ts` (`x = (i - 2) * spacing`, `z = -|x| * 0.12`);
the `mochiDeform` displacement; the `Mochi.step` springs at the page's substep rule; sleep slump
and the 0.14 rad tilt about the `squash` group; tail origin and swing; breathing at both
extremes; yaw `atan2(camera.x - x, camera.z - z)` with `lerpAngle(..., 1 - exp(-5 dt))`, and
the yaw each cat is created with at page load. Positions come from the GLB: load it in Node
with three's `GLTFLoader.parse` and `MeshoptDecoder` from `web/node_modules` (the GLB has no
images), or an equivalent reader; take `Body` and `Tail` vertices, the `Tail` rest origin and
`headTop`.

**Script inputs.** The spacing, and the camera parameters of A21a: per view, the fixed
distance, the orbit target and the default azimuth; the polar band (minimum and maximum); the
azimuth range (±30°). Their defaults are the spec's values, derived from `web/src/concepts.ts`
and the orbit controls' 1.2 rad maximum as in F10: `theme=lineup` orbits (0, 0.6, 0) at the
distance from the default camera (0, 2.6, 8.4), about 8.64; `focus=leader` orbits
(0, 0.95, 0) at the distance from (0, 1.9, 3.4), about 3.53; azimuth 0 for both; polar band
1.05 to 1.2 rad. The script prints the values it used. When the owner replaces the distances
or the band (A21, R24), the script is rerun with the owner's values passed as inputs, without
editing it.

**Two modes.** A *single-spacing run* (`--spacing <s>`) evaluates one spacing and reports its
numbers; a *spacing search* runs single-spacing runs from 1.35 upward in steps of 0.05 under
the stop rules below. D-2's final record and any owner-value rerun are single-spacing runs.

**Reproducible animation inputs.** The page draws each cat's `phase` from `Math.random()`
(C-4). The script does not: it takes the five phases as an input with a fixed default fixture,
`phase_i = i · 2π / 5` for cats i = 0..4, prints the fixture it used, and derives each cat's
first hop (`nextHop`, C-4) and breathing from it exactly as the page does. Member 1's sampled
window runs through the end of its second full hop cycle from its phase-derived first hop, so
a full cycle with its landing lies inside the window whatever the fixture. The sleep ramp of
member 4 (`sleep = damp(sleep, 1, 5, dt)`, asymptotic) is sampled every step from page load
until `1 - sleep < 1e-3`, its finite endpoint; after that the **held pose** (sleep = 1 exactly,
springs settled at the slumped squash) is sampled explicitly as one more animation sample.

**Samples, exactly as A21a lists them** (R24, F10, F10a). Camera position = target + distance
× the spherical direction of (polar, azimuth), since yaw depends on the camera position, not
only on distance and angles.
- Camera: for each view, azimuth from -30° to +30° of the default azimuth in steps of 5°
  (both ends included), polar from the band's minimum to its maximum in evenly spaced steps of
  at most 0.05 rad with both ends included (`ceil((max - min) / 0.05 - 1e-9) + 1` values, the
  tolerance absorbing floating-point error, which also
  covers an owner-supplied band whose width is not a multiple of 0.05): 13 × 4 = 52 positions
  per view at the defaults.
- Yaw: at each camera position, every cat's settled yaw. The yaw lag after page load (every
  cat at the yaw the page creates it with, the camera at the view's default position) and after
  every ordered jump between two sampled positions of the same view (every cat starting at its
  settled yaw for the first position, the camera at the second), each stepped with the page's
  easing at dt = 1/30 s, every step sampled, until every cat is within 0.5° of its settled yaw.
- Animation, at dt = 1/30 s, every step sampled: member 1's hop from page load through the end
  of its second full hop cycle, so that a full cycle with its landing (the widest landing
  spread), the wobble after it and the tail swing lies inside the sampled window; member 4
  from page load through its sleep ramp to the ramp's endpoint, then the held pose (sleep slump
  and 0.14 rad tilt), as defined above; every cat's breathing at both extremes.
- Per pair (A21a's per-pair product): a pair's poses are every combination of that pair's
  sampled yaw tuples (both views, settled, page-load lag and jump lag) with that pair's
  animation samples: member 1's samples for pairs 0-1 and 1-2, member 4's for pair 3-4, the
  other cat of the pair at rest, and both breathing extremes of both cats for every pair.
  Identical yaw tuples may be merged (exact equality only).
- Per cat, for the base-patch radius: every combination of that cat's sampled yaws with its own
  animation samples (member 1's hop for cat 1, member 4's ramp for cat 4, rest for the others,
  both breathing extremes).

**Measures.** Per pose and neighbouring pair (0-1, 1-2, 2-3, 3-4), tails included: clearance =
minimum distance between the two cats' posed vertices minus both coats' fur lengths; it is
recorded as negative (minus that distance) when a vertex of one cat lies inside the other cat's
closed `Body` mesh at that pose, detected with a ray-parity point-in-mesh test of the
nearest-pair vertices of both cats (or another stated containment method; judge edit after the
final Codex review). The minimum distance is
computed exactly over all vertex pairs (brute force, or an exact nearest-neighbour search such
as a k-d tree queried without approximation); the method names which. Per cat and pose: the
base-patch radius (`Body` vertices with rest y < 0.02, after deformation, tilt, yaw and
position, largest horizontal distance from the plinth's vertical axis).

**Skipping only by disjoint boxes.** The script evaluates every sampled pose of the grid above
(owner answer 8: the script is supporting evidence, with no proof between samples), with one
exact exception for pair poses. For each pair it first evaluates exactly the settled-yaw poses
at the default views, which seeds that pair's exact running minimum. After that it may skip a
pair pose only when the axis-aligned bounding boxes of the two posed cats, computed on that
pose's own posed vertices with each cat's fur length added on every side, are disjoint and
their gap is at least the pair's current exact minimum, so the skipped pose cannot lower the
reported minimum. Every reported per-pair minimum and its pose therefore come from an exactly
evaluated pose, and every pair has one (judge edit after the final Codex review).
Base-patch radii are evaluated for every per-cat pose. The script counts the poses evaluated
and skipped per pair and per cat. Implementation hint: cache each cat's deformed local vertices
per animation sample, and evaluate a pose in one cat's frame against an exact k-d tree built
once per animation sample, so only the rigid yaw/position transform changes per pose.

**Run time.** Before the full run, the implementer measures the evaluation rate on one pair
(pair 0-1, the one with member 1's hop) at spacing 1.35 for a representative slice of its
poses, and estimates the full run's time from the pose counts. If the full run is not practical
at that rate, the implementer reports the measured rate, the pose counts and the estimate, and
asks the owner; it does not coarsen any step beyond A21a's maxima and skips no pose except
by the disjoint-box rule above.

**Spacings.** Run the spacing search: spacing 1.35 and then candidate spacings in steps of 0.05
(Appendix 2, item 9):
- if a spacing meets item 9 (every pair's minimum clearance at least 0 and the maximum
  base-patch radius at most 4.0), stop: that spacing is the result;
- if a spacing's maximum base-patch radius exceeds 4.0, stop: the spacing before it is the
  largest *tested* spacing that keeps the base bound (the search does not claim that every
  larger spacing exceeds it, since spacing also changes the yaw targets), which D-2's fallback
  uses;
- if 1.35 itself exceeds 4.0, no tested spacing meets the base bound; the script reports that
  explicitly and no fallback spacing exists.

Done when: the script runs, and `$EVID/evidence.md` under A21a holds, per spacing tried: the
camera inputs used; the minimum clearance per pair with the pose where it occurs; the maximum
base-patch radius with the cat and pose where it occurs; a pose is named by view, camera
azimuth and polar angle, yaw source (settled, page-load lag step k, or jump from one sampled
position to another, step k), both cats' yaws, animation time and breathing extremes. Plus the
method (including the exact distance computation), the phase fixture, the sleep-ramp endpoint,
the sampling grid actually used (camera, yaw and animation steps), the evaluated pose counts
(evaluated and skipped per pair and per cat, every skip by the disjoint-box rule, with the
smallest box gap among skipped poses per pair), the measured rate, and which stop condition ended
the search (or the explicit statement that no tested spacing meets the base bound). If the run
was not practical, the task is not done: the measured rate and estimate are recorded and the
owner is asked.
Depends on: C-5.

### D-2: Set the lineup spacing

Choose the spacing by Appendix 2, item 9, from D-1's result. If it differs from 1.35, change
only the literal `1.35` in `web/src/scenery/lineup.ts` (owner answer 1); nothing else in that
file, the plinth, the facing logic or the camera limits changes (R24). Record a single-spacing
run of D-1 at the chosen spacing as the final A21a result, including the camera inputs (fixed
distances and polar band) for the owner to confirm. The search's own run at that spacing may be
reused as that record when nothing it depends on has changed since (the script, the phase
fixture, the camera inputs and the files it reads constants from); otherwise it is rerun.

- If a spacing met item 9, that spacing is used.
- If D-1 stopped at a spacing above the base bound without any spacing meeting item 9, the
  spacing before it (the largest tested spacing that keeps the base bound) is used and the
  clearance shortfall is recorded for the owner (A21 stays the pass/fail).
- If D-1 reports that no spacing meets the base bound (1.35 already exceeds 4.0), the literal
  is not changed; the implementer stops and asks the owner, since R24's base bound cannot be
  kept by any spacing this plan may choose.

If the owner later replaces the distances or the band (A21), D-1 is rerun (a single-spacing
run at the chosen spacing) with the owner's values as inputs and its numbers reported, and the
A21 visual check is repeated at those values, unless the owner's recorded acceptance of A21
waives the rerun or the recheck (R24, A21); a spacing change that the new numbers suggest goes
to the owner. **A measured violation stays open:** if such a rerun reports a maximum base-patch
radius above 4.0, R24's base bound is open. It stays open until a spacing is checked eligible
(maximum base-patch radius at most 4.0) by a run at the confirmed camera values and the owner
approves that spacing change, or until the owner explicitly changes the requirement. The A21
waiver covers the confirmation and the rerun only; it does not erase a violation a run has
measured. The pull request records the open item (D-4).

Done when: the chosen spacing's maximum base-patch radius is at most 4.0 in the recorded A21a
output (R24); `git diff BASE -- web/src/scenery/lineup.ts` shows that one literal or nothing;
the case used (item 9 met, or fallback with the shortfall recorded) is in the batch summary. In
the no-eligible-spacing case the task is not done: the owner is asked.
Depends on: D-1.

### D-3: Record the builder statements the owner cannot produce on a preview

From the code, add to `$EVID/evidence.md`:
- A24: `main.ts` and `concepts.ts` still call `theme.dress` and `theme.onRole` on the new
  `Mochi`; with `crownEnabled = false` the crown's target scale is 0 at once, and
  `crown.visible` follows the damped scale (`visible = crownScale > 0.01`): when disabled from
  startup the scale starts at 0, so the crown stays hidden from the first update; when disabled
  while shown, the crown shrinks and `crown.visible` turns false once the damped scale drops
  below 0.01 (cite the lines). A local check that sets it is allowed but not committed.
- A21: `concepts.html?theme=lineup&shells=4` draws 4 shells (`shellCount` override, B-1 test,
  C-5 wiring).
- R2a: every dev-server remedy made in A-8 or C-7, each with the batch it was made in, or
  "none needed" (D-5 adds any remedy its own rerun needs).

Done when: the three statements are recorded with file and line references.
Depends on: C-6, D-2.

### D-4: Draft the pull request title and body

Write `$EVID/pr-body.md` (English, personal repository; no absolute local path). Title:
`feat(web): furry mochi cats from the approved GLB`. Body sections:

1. Summary and spec link (`docs/fur-cats/2026-11-20-fur-cats-spec.md`), the layout of
   `web/src/assets/cat/` and `web/src/assets/cat-spike/`, and that `spike/fur-cats` is not
   merged.
2. Builder results from `$EVID/evidence.md`: A4, A5 (offline check and, if run, the Blender
   runs, with any diagnostic differences from the shipped GLB listed for the owner's
   judgement), A6, A7, A7a (including pre-existing dev-server warnings from the baseline and
   every remedy), A8, A9, A9a, A21a (method, grid, phase fixture, sleep-ramp endpoint, camera
   inputs, evaluated and box-skipped pose counts, chosen spacing and the D-2 case used,
   per-pair minima with poses, maximum base-patch radius against 4.0 with cat and pose, the
   fixed distances 8.64 and 3.53 and the polar band 1.05-1.2 rad for the owner to confirm),
   A24's builder statements.
   Every builder item the environment prevented is an unchecked box with its reason; no
   executed builder check is listed as failing (§0). If C-6 recorded the A24 delivery failure,
   it appears as an unchecked box: "A24 packet bump: not produced, heartbeats were not delivered
   to the stopped follower on <revision>; reported as a possible regression of the packet path
   (F12), not a pass. Open under R30 until fixed or explicitly accepted by the owner", with the
   observations and the cause found or not found, and room for the owner's decision and any
   acceptance.
3. Merge checklist:
   - A1: an unchecked box "CI passes on the pull request's head commit" (both production
     builds and `node --test scripts/*.test.mjs`).
   - If the work is queued for the night runner, the queue item sets `merge: owner` (R30).
   - One unchecked box per owner criterion A10-A24, worded from the spec.
   - The R30 carry-over rule, both conditions written out: an earlier owner pass or recorded
     acceptance carries over to the final preview only if
     `git diff --name-only <earlier> <final>` lists nothing outside `docs/`; and, for each A22
     and A23 case, also only if `main`'s deployed revision (the public site, the case's
     baseline) is the same as at the earlier comparison. A case whose baseline changed is
     compared with `main` again on the final preview. Each carried pass is listed with the
     revision it was judged on and, for A22/A23 cases, the `main` deployed revision it was
     compared with.
   - A21 on the companion dev preview with the three sweeps and the confirmation of the
     distance and band; if the owner replaces them, D-1 is rerun with the owner's values and
     the A21 visual check is repeated at them, unless the owner's recorded acceptance of A21
     waives that (R24). An unchecked box for R24's base bound states that if a rerun at the
     owner's values reports a maximum base-patch radius above 4.0, the base bound stays open
     until a spacing is checked eligible at the confirmed values or the owner explicitly
     changes the requirement; the A21 waiver does not erase a measured violation (D-2).
   - A16 / R20: if the label clearance fails, the builder reports it and refers it to the
     owner, and does not change the offsets 0.42 and 0.72 on its own.
   - A17: the timer ring size is a builder choice awaiting the owner's judgement of
     readability during the landing bounce (Appendix 2 item 8).
   - A22 and A23 as a table with one row per case (device, orientation, CSS viewport width,
     member count, shell count, preview revision, `main` deployed revision, ambient-occlusion
     setting on both, window length, frame-rate readings or why none) and the comparison
     conditions of spec §4; after any performance tuning, every owner criterion, every A22 and
     A23 case included, is re-judged by the owner on the tuned revision's preview (spec §4,
     R30).
   - A24's items and the promotion-mid-hop rule ("not observed on <revision>" while it has
     never failed).
4. Preview instructions (R31), each run in `web/` from the revision under review:
   - Build and serve: `npm run build:pages`, then
     `npm run preview:pages -- --host --port 4173 --strictPort` (9 members with `?members=9`);
     companion dev preview `npm run dev -- --host --port 5173 --strictPort`, opened at
     `/concepts.html`.
   - Reaching it from the phone under WSL. A server inside WSL is not reachable from the phone
     through WSL's own address. The owner runs these steps, since they change the Windows host:
     1. In WSL, read the WSL address: `hostname -I` (first address).
     2. In an administrator PowerShell on Windows, forward both ports to it:
        `netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=4173 connectaddress=<WSL address> connectport=4173`,
        and the same for 5173.
     3. Allow them through the Windows firewall on the private network only:
        `New-NetFirewallRule -DisplayName "quorum preview" -Direction Inbound -Protocol TCP -LocalPort 4173,5173 -Action Allow -Profile Private`.
        The rule applies only when Windows classifies the network as Private: check with
        `Get-NetConnectionProfile` (its `NetworkCategory`). If the Wi-Fi network is `Public`,
        the phone cannot connect; the owner either marks that trusted network Private or
        decides otherwise (a Public-profile rule is the owner's call, not a default).
     4. Read the Windows LAN address with `ipconfig` (the Wi-Fi or Ethernet adapter's IPv4
        address); the phone must be on the same network.
     5. The WSL address can change after WSL restarts; repeat step 2 with the new address
        when it does.
     6. Afterwards remove them:
        `netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=4173`
        (and 5173) and `Remove-NetFirewallRule -DisplayName "quorum preview"`.
     If WSL runs in mirrored networking mode, step 2 is not needed; step 3 still is.
   - Alternative: a Cloudflare Pages preview deploy of the same revision, only with the owner's
     OK (R31).
   - Before any performance judging (A22, A23), the same phone that will be judged first opens
     `http://<Windows LAN address>:4173/?members=9` (or the Pages preview URL with
     `?members=9`) and confirms the page loads with 9 members.
5. Choices for the owner to confirm: the spec's **(decided here)** items that the owner has not
   confirmed (notably O1's silent failed load, the A21a distance and band) and this plan's
   Appendix 2.
6. Known gaps (spec §6), recorded, not fixed.
7. The attribution line required for pull requests in the session that opens it.

Done when: `$EVID/pr-body.md` exists with every section; the A1 box, every owner criterion
A10-A24, every environment-blocked builder item (with its reason) and, if recorded, the A24
"not produced" item appear as unchecked boxes; the carry-over rule states both conditions; the
R24 base-bound rule for owner-value reruns is stated; the preview section has the WSL steps,
the firewall-profile check and the `?members=9` phone check; and the local-path grep pattern
finds nothing in it.
Depends on: A-7, C-6, D-2, D-3.

### D-5: Final check

Every check below compares the whole change with `BASE` (recorded before batch A, §0; read it
from `$EVID/base.txt` or the batch A summary). Because every earlier batch is already in a
`wip` commit, no check compares with `HEAD` alone. The steps run in this order, so that the
Full check and both output audits run on the final tree, after the last possible edit:

1. **Last remedies first: companion dev server on the final revision (R31).** Run the companion
   dev-server check of §0, since D-2 may have changed `web/src/scenery/lineup.ts` after C-7. A
   new warning or error attributable to the fur page gets the A-8 remedy (which may edit
   `web/vite.config.ts`); one from another part of this change is fixed within the spec or
   taken to the owner; one also in the baseline log is recorded as pre-existing. After any
   remedy the check is rerun until it passes.
2. **Refresh the evidence.** Any remedy from step 1 is added under A7a in `$EVID/evidence.md`
   (with "made in D-5") and to `$EVID/pr-body.md`; if a remedy changed a file, the D-3 R2a
   statement and the pull request's file layout are updated to match. No file in the
   repository changes after this step.
3. **Full check** on the final tree.
4. **Both output audits** on the final tree:
   - *Build-output audit (A7a):* after the Full check's two builds,
     `find internal/web/dist web/dist-pages` lists no `fur-page`, `chosen-fur-params.json`,
     `.py` or `run_v2.sh` file.
   - *Change audit (A7 and the file list):*
     - Outside `web/src/assets/cat-spike/`, the added lines of the change contain no `?rim` /
       `?rimColor` handling, rim multiplier, `stripes` pattern or motion-reactive fur term.
       Check added lines only (`git diff BASE -- . ':(exclude)web/src/assets/cat-spike' | grep '^+[^+]'`,
       plus the content of any untracked file `git status --short` lists): the removed lines
       include the old `web/src/scene/mochi.ts` canvas `stripes()` painter and its comments,
       which are not a failure. A line that asserts the pattern is absent (for example B-1's
       test that `PATTERNS` has no `stripes`) is not a `stripes` pattern either.
     - Anywhere: no image file, no file from `spike-artifacts/renders/`, and the local-path
       grep prints nothing (exit 1). All ten spike files of R2 and R2a are present:
       `build_cat_v2.py`, `build_cat.py`, `render_views.py`, `render_ear.py`,
       `sample_colors.py`, `run_v2.sh`, `fur-page/index.html`, `fur-page/main.js`,
       `fur-page/fur.js`, `chosen-fur-params.json`.
     - A4 hash again; A6: `git diff BASE -- web/package.json web/package-lock.json` prints
       nothing; `find web/src/assets -name '*.ts'` prints nothing.
     - `git diff --name-status BASE` together with `git status --short` lists exactly the
       intended files: `web/src/assets/**`, `scripts/web-cats.test.mjs`,
       `scripts/web-import-direction.test.mjs`, `web/src/scene/{coats,fur,cat,mochi}.ts`,
       `web/src/main.ts`, `web/src/concepts.ts`, `web/src/scenery/lineup.ts` only if D-2
       changed it, and `web/vite.config.ts` only if a dev-server remedy in A-8, C-7 or D-5
       changed it.
   The A6, A7 and A7a results are written to `$EVID/evidence.md` and, where D-4 lists them,
   refreshed in `$EVID/pr-body.md`.

If step 3 or 4 fails and the fix changes a file, the task restarts at step 1, so the final
Full check and audits always follow the last edit. Any fix in D-5 that changes behaviour or an
input checked earlier (cat code, `lineup.ts`, the GLB or the Blender scripts) also reruns the
affected builder checks (C-6 for cat code; D-1/D-2 for cat geometry, motion or `lineup.ts`;
A-7 for the Blender files) and refreshes their evidence and PR text before step 3 (judge edit
after the final Codex review).

Done when: steps 1-4 pass in that order with no repository file changed after step 2; the
results are in the batch summary; `$EVID/evidence.md` and `$EVID/pr-body.md` reflect the final
tree.
Depends on: D-4.

## Appendix 1: Coverage map

| Spec item | Task(s) |
| --- | --- |
| R0 | A-1, A-2, A-3, C-1 |
| R1 | A-1, C-3 |
| R2 | A-2, A-7 |
| R2a | A-4, A-5, A-6, A-8 |
| R3 | A-3, C-3 |
| R4 | A-8, D-5 |
| R5 | C-3, C-5, C-6 |
| R6 | C-2, C-3, C-4, C-6 |
| R7 | A-8, D-5 |
| R8, R9, R10 | C-2 |
| R11 | B-2, C-2, C-3 |
| R12 | B-1, B-2, C-3 |
| R13 | B-1, B-2, C-2 |
| R13a | B-1, B-2 |
| R13b | B-2 (table kept; owner A12 in D-4) |
| R14 | C-2, C-5 |
| R15, R16, R17, R18 | C-2, C-4 |
| R19, R20, R21, R22, R23 | C-3, C-4 |
| R24 | C-4, C-5, D-1, D-2, D-3 |
| R25, R26, R27 | B-1, B-2, C-3, C-5 |
| R28 | C-5 |
| R29 | A-1 to A-6 (one branch, one pull request) |
| R30, R31 | D-4; R31 companion dev preview also A-8, C-7, D-5 |
| R32 | A-8, D-4, D-5 |
| A1 [auto] | every group's full check; CI on the pull request (D-4 checklist) |
| A2, A3 [auto] | B-1, B-2 |
| A4 | A-1, A-7, D-5 |
| A5 | A-2 (offline), A-7 |
| A6 | A-8, D-5 |
| A7 | A-4, A-8, C-7, D-5 |
| A7a | A-5, A-6, A-7, A-8, D-5 |
| A8, A9, A9a | C-6 |
| A10-A20, A22, A23 [owner] | D-4 checklist |
| A21 [owner] | D-4 checklist; builder statement D-3 |
| A21a | D-1, D-2 |
| A24 [owner] | D-4 checklist; builder parts C-6, D-3 |
| E1, E2 | B-1, C-3, C-5, C-6 |
| E3, E4 | C-4; owner A24 |
| E5 | C-3; owner A19 |
| E6, E7, E9 | B-1, B-2 |
| E8 | C-6 (A9a); owner A18 |
| E10 | D-1; owner A21 |
| E11 | A-2, A-7 |

## Appendix 2: Choices made in this plan

These are builder choices the spec leaves open. The pull request lists them (D-4) for the
owner.

1. Directories: R0 = `web/src/assets/cat/`, R2a = `web/src/assets/cat-spike/` (the spec's own
   examples), so `scene` gains `assets` in the import-direction test.
2. Group order: the pure module and its tests (B) come before the app port (C), so C builds on a
   tested coat table and shell rule.
3. `build_cat_v2.py` runs its argument and path checks before importing `bpy` and `numpy`, so
   every refusal of A5 can also be checked without Blender; the real-Blender A5 stays required
   and is reported not run when Blender 5.3 is missing.
4. A third and a fourth `run_v2.sh` stub run (a failing build, and a build that exits 0 but
   writes no `cat_v2.blend`) check without Blender that neither render helper starts in either
   case; they support, and do not replace, A7a's real-Blender malformed-override run.
5. The skills directory variable is named `BLENDER_AGENT_SKILLS_DIR`.
6. GLSL pattern indices are interpolated from `PATTERNS` instead of written as numbers.
7. Each cat's first hop is offset by its phase; afterwards hops follow the spike's cycle.
8. Timer ring `RingGeometry(0.72, 0.82)`; sigils and stand radii unchanged. The inner edge
   clears the widest furry body at rest only; the landing spread briefly pushes the silhouette
   past 0.72. This is a builder choice awaiting the owner's A17 judgement of readability during
   the bounce; the spec records no owner acceptance of that overlap.
9. Lineup spacing: the smallest spacing from 1.35 upward, in steps of 0.05, at which A21a's
   minimum clearance over all sampled poses is at least 0 for every pair and the maximum
   base-patch radius is at most 4.0; 1.35 is kept (no code change) if it already meets both.
   This is a selection rule for the spacing, not a pass/fail threshold; A21 stays the owner's
   pass/fail (owner answer 8). The search stops at the first spacing that meets the rule (that
   spacing is used) or at the first spacing whose maximum base-patch radius exceeds 4.0 (the
   one before it, the largest tested spacing that keeps the base bound, is used, with the
   clearance shortfall recorded, D-2). If 1.35 already exceeds 4.0, no tested spacing meets the
   base bound; that is reported explicitly and the owner decides (D-2). Every sampled pose is
   evaluated, except pair poses whose posed bounding boxes (fur length added) are disjoint;
   a skipped pose never defines a reported minimum (D-1).
10. Shell geometries are created per rebuild with cloned attributes, so disposing them never
    touches the GLB geometry's GL buffers (C-2).
11. Builder evidence and the pull request text live in a fresh run-specific directory under
    `~/.cache/convergent/fur-cats-evidence/`, outside the repository, and are not committed.
12. The A21a script's phase fixture is `phase_i = i · 2π / 5` (the page draws phases at random),
    and member 4's sleep ramp ends when `1 - sleep < 1e-3`, followed by the held pose at
    sleep = 1 (D-1).
13. Every companion dev-server check, the baseline included, starts Vite with `--force`,
    compares its log with a baseline run on `BASE` (A-1) and waits for Vite's dependency scan
    outcome before stopping the server (§0).
