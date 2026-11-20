# Spec: furry mochi cats

Draft round 5 of the second resumed run (applies the review of round 4 of this run under
owner answers 8 and 9: A21, the owner's visual check, is the pass/fail for lineup clearance,
and A21a is the builder's sampling script, supporting evidence with no pass/fail threshold, so
the 0.01 m margin and the penetration-depth fallback are removed; the owner's explicit
acceptance of A21 under R30 may waive the camera-parameter confirmation and the rerun; R2 also
refuses a companion `cat_v2.blend` path that is a symbolic link or resolves to the shipped GLB,
with an A5 run for it; A5 gains refused runs for a missing output path and for `OUT.GLB`; A1
separates CI's JavaScript tests from the two production builds; R24's 1.35 estimate is called
a conservative screening estimate; A16 cross-references R30's rule for a promotion mid-hop;
§6 lists the review findings recorded but not fixed under owner answer 9).
Source: `requirements.md` in this directory, which carries the owner-approved
design `docs/fur-cats/2026-11-20-fur-cats-design.md` verbatim (cited below as "design §n") and
the owner's answers of 2026-11-20 (cited as "owner answer 1" to "owner answer 9"; answers 1
and 2 are the first set, 3 and 4 the second set, 5 and 6 the third set, 7 the fourth set, 8
and 9 the fifth set).
Grounded in `main` at `07ae729` and the local, unpushed branch `spike/fur-cats`
(`8531a6f`, `fc45d89`, `238e46e`, `128b5ea`).

Status of each item: unmarked = decided in the design (owner-approved, including the
design's "my call" items, and the owner answers); **(decided here)** = a choice this spec makes where the design is
silent, not yet confirmed by the owner.

## 1. Scope

In scope:

- Replace each member's procedural body, canvas coat, eyes and whiskers in
  `web/src/scene/mochi.ts` with one shared GLB cat with shell fur, five coats, a warm room rim
  and a base-anchored mochi bounce.
- Commit the approved GLB and the Blender script that builds it, with a GLB export step, plus
  the other spike Blender scripts, the fur comparison page and `chosen-fur-params.json`
  (owner answer 2).
- Widen the `lineup` theme's member spacing if needed so neighbouring cats do not intersect
  at the default lineup views and under small orbits from them (owner answers 1, 6 and 7).
- Choose the fur shell count per cast rebuild from member count and viewport.
- Keep every existing member behaviour and indicator (design §5.6).
- The new cats keep casting shadows (from the undeformed shape, as today's body casts them,
  `castShadow` in `web/src/scene/mochi.ts`) and keep being shaded by the ambient-occlusion pass
  (`GTAOPass` in `web/src/scene/stage.ts`) when it is on, as today.

Out of scope (design §3, §9): fur that reacts to motion in the app; shadows and ambient
occlusion that follow the bounce; changes to scenery (except the lineup spacing of owner
answers 1, 6 and 7), scene lights, HUD or simulation; viewer customisation,
more than five base coats, new member states; README and `docs/architecture.md` rewrites; the
follow-ups in §6.

## 2. Facts from the code that constrain the work

- F1. `scripts/web-import-direction.test.mjs` (run in CI) only lets `web/src/scene` import
  from `sim`. The spike's `import catUrl from "../assets/cat_v2.glb?url"` in
  `web/src/scene/cat.ts` fails it (`scene/cat.ts -> assets/cat_v2.glb?url`, verified by
  running the test on the spike tree).
- F2. CI runs `node --test scripts/*.test.mjs` before `npm ci`, and runs no other JavaScript
  tests (it also runs `go vet` and `go test -race ./...` for the Go code). Web tests import TypeScript source through Node's type stripping. A module under
  such a test therefore must not import `three` (or any package) at runtime, must use only
  erasable TypeScript syntax, and may import other local modules only with `import type`:
  `web/src` uses extensionless relative specifiers (for example `"./scene/mochi"`), which
  Node's ESM loader cannot resolve.
- F3. `web/vite.config.ts` sets `publicDir: false` in default mode, so the GLB is imported as a
  Vite asset URL (`?url`). Default mode output goes to `internal/web/dist`, embedded with
  `//go:embed all:dist`.
- F4. `main.ts` calls `rebuild(state.size)` on every `quorum_started`. The HUD buttons offer
  3, 5 and 7 members (`MEMBER_CHOICES` in `web/src/ui/hud.ts`). 9 members are reachable in both
  build modes: in default mode with `quorum serve --members 9` (clamped to 1-9 by `MaxMembers`
  in `internal/sim/session.go`; `POST /api/restart` with `{"members": 9}` is also accepted), and
  in `wasm` mode with `?members=9`.
- F5. The spike GLB (`web/src/assets/cat_v2.glb` on `spike/fur-cats`) is 167,652 bytes,
  SHA-256 `8e4cb63feca4a6de686e48d771375aaa5d0f0b55e0de9f54df2a6681e74c5a01`. Nodes:
  `Body` (identity transform) with children `Eye_L`, `Eye_R`, `Tail`, `Whiskers_L`,
  `Whiskers_R`. Materials `M_EyeRing`, `M_EyeCentre`, `M_White`, `M_Fur`. Extensions used:
  `EXT_meshopt_compression` (required), `KHR_materials_specular`, `KHR_materials_sheen`.
  Fur-bearing triangles per cat: `Body` 6,828 + `Tail` 1,176 = 8,004.
- F6. The spike Blender script `spike-artifacts/blender/build_cat_v2.py` is self-contained
  (it does not import `build_cat.py`), hard-codes a temporary output directory (`OUT`) and
  stops at `cat_v2.blend`. `spike-artifacts/` also holds the v1 script `build_cat.py`, render
  helpers (`render_views.py`, `render_ear.py`, `sample_colors.py`), `run_v2.sh` (which
  hard-codes a `cd` into a local temporary directory and runs `build_cat_v2.py`,
  `render_views.py` and `render_ear.py` from there), a fur comparison page
  (`fur-page/index.html`, `main.js`, `fur.js`), `chosen-fur-params.json` and renders, among them
  `renders/v2_vs_concept.png`, which likely shows the owner's concept drawing. Local paths in
  the files to commit: `OUT` set to a temporary directory in `build_cat.py`, `build_cat_v2.py`,
  `render_views.py` and `render_ear.py`; an absolute path to the owner's concept drawing
  (`CONCEPT` in `render_views.py` and `render_ear.py`, the image load in `sample_colors.py`); a
  `~`-relative path into a locally installed blender-agent-skills plugin cache (`SK` in
  `render_views.py` and `render_ear.py`, for its `turntable` helper); the `cd` in `run_v2.sh`;
  and docstrings and comments, for example `build_cat.py`'s docstring naming the `.blend` it
  writes in a temporary directory. This list is not exhaustive (R2a). The fur page and
  `chosen-fur-params.json` contain none. `run_v2.sh` today pipes Blender's output through
  `grep`, reads `$BLENDER_EXE`, passes its own arguments straight to `build_cat_v2.py`, and
  runs `render_views.py` and `render_ear.py` by bare name on `cat_v2.blend` in the directory it
  changed into. It has no `set -e` and no `--python-exit-code`; Blender exits 0 after a Python
  exception in a `-P` script unless `--python-exit-code` is given, so a failed build today
  still runs both helpers, on whatever `cat_v2.blend` is in that directory. Only
  `render_views.py` loads the concept drawing; `render_ear.py` defines the path but does not
  use it. `render_views.py` crops the concept drawing at fixed pixel coordinates (centre row
  `H - 1 - 1080`, column 1120, half-size 640), so the image must be at least 1760 px wide and
  1721 px tall. `sample_colors.py` has no prefix argument and writes no files; it prints
  colours sampled from the image.
- F6a. The fur page loads three r0.187 (and its `examples/jsm` add-ons, among them `lil-gui`)
  from jsDelivr through an import map, and loads the model from `../cat_v2.glb`, falling back to
  `../cat.glb` (the v1 model, which is not committed). It still contains the spike's tuning
  code: the `stripes` pattern, the fur-reacts toggle and terms, and a rim colour of its own.
- F7. The `lineup` theme (`web/src/scenery/lineup.ts`) spaces members 1.35 apart. The new body
  is 1.196 wide, plus up to 0.095 of fur on each side, and the landing spread widens the base
  further. Seen from above, the GLB's position bounds give the body x from -0.598 to 0.598 and
  z from -0.675 to 0.598 (front +z), and the tail (node at x 0.285, z -0.610) reaching about
  x 0.737 and z -0.682, so a cat reaches up to about 1.0 from its vertical axis (the corner of
  the tail's bounding box), before fur and tail swing. If each cat could take any yaw, a pair
  could need up to about 2.1 apart, and 5 cats at 2.1 would reach 4.2 + 1.05 = 5.25 from the
  centre, past the plinth's outer radius of 4.2 (`roundedCylinder(4.2, 0.5, 0.2)` in
  `lineup.ts`: 4.2 is the outer edge of the rounded rim, and the flat top ends at 4.0, inside
  the 0.2 bevel). These are bounding-box upper bounds, not measurements. Owner answers 6 and 7
  limit the clearance requirement to the default lineup views and small orbits (R24), so this
  any-yaw bound is background only and does not size the spacing.
- F8. The spike's `headTop` is the highest `Body` vertex with `|x| < 0.05` and `|z| < 0.2`
  (the dome top, about 1.07). `main` uses the constant `BODY_H = 1.1` for the same role.
- F9. `web/vite.config.ts` has no extra build inputs, so both production builds contain only
  `index.html` and what its modules import; the `wasm` build also copies `web/wasm-public/`.
  The import-direction test (F1) walks only `.ts` files under `web/src`, and its `area()` gives
  `..` for an import target outside `web/src`. Its `area` is the top-level folder of `web/src`
  (for `web/src/assets/cat/cat_v2.glb` that is `assets`, not `cat`). A `.ts` file in a top-level
  folder that is not a key of `ALLOWED` fails the test as an unknown folder. `web/src/assets`
  does not exist on `main`.
- F10. `concepts.html` with `?theme=lineup` shows a fixed frozen moment: 5 members with roles
  Follower, Candidate, Leader, Follower, Down from left to right, so member 1 is the only
  hopping candidate and member 4 is stopped. `concepts.ts` places the default lineup camera at
  (0, 2.6, 8.4) looking at (0, 0.6, 0) (a polar angle of about 1.34 rad), and for
  `?theme=lineup&focus=leader` at (0, 1.9, 3.4) looking at (0, 0.95, 0) (about 1.30 rad). Both
  are above the orbit controls' maximum polar angle of 1.2 rad (F10a), and the
  `controls.update()` that follows clamps them, keeping the distance and azimuth: the default
  lineup camera actually starts at polar 1.2 rad, distance about 8.64, at about (0, 3.73, 8.05);
  the `focus=leader` camera at polar 1.2 rad, distance about 3.53, at about (0, 2.23, 3.29).
  These clamped positions are "the default lineup views" in this spec. The orbit controls stay
  enabled on both. The page's `send()` returns early on the lineup, so no packets fly there and
  no lineup member is bumped. Member 4 is stopped (`alive: r !== "Down"` in `concepts.ts`), so
  after the page loads it ramps into the sleep pose and then holds it: it slumps by the
  implementation's sleep slump (R17; the spike's `SLEEP_SQUASH`, 0.12 in
  `spike/fur-cats:web/src/scene/mochi.ts`, which widens its base) and tilts by the sleep tilt (the spike's `squash.rotation.z = this.sleep * 0.14`, 0.14 rad when
  fully asleep). Only member 1's hop and its landing, member 4's slump and sleep tilt (the ramp
  into them and the held pose), breathing and yaw move the lineup cats. These make up "the
  lineup's shipped pose and animation" in this spec.
- F10a. Member yaw depends on the camera, so orbiting changes it. `Mochi.update` turns each
  member's root towards the camera position every frame:
  `yaw = atan2(camera.x - root.x, camera.z - root.z)`, approached with
  `lerpAngle(..., 1 - exp(-5 dt))` (`web/src/scene/mochi.ts` lines 301-302 on `main`; the same
  in `spike/fur-cats:web/src/scene/mochi.ts` lines 257-258). `concepts.ts` passes
  `stage.camera.position` (line 102), and the orbit controls move that camera. The controls
  (`web/src/scene/stage.ts`) have no azimuth limit, panning off, polar angle 0.45-1.2 rad,
  minimum distance 3 on the lineup (1.5 with `focus=leader`, set in `concepts.ts`) and maximum
  distance 34 or more (raised to 1.3 × the fit distance on resize). The polar angle is measured
  from straight above: 0.45 rad is the highest camera angle, 1.2 rad the lowest. So each lineup
  cat can be turned to any yaw, neighbours' yaws are coupled through the one camera position and
  differ most when the camera is close, and while the camera moves each yaw lags its target.
- F11. Theme hooks in use: only `academy` sets `memberLook`
  (`{ lampHeight: 1.4, lampIntensity: 2, sigilGlow: 2.2, sigilInk: 0 }`); `forest`, `sky` and
  `lineup` use the defaults. No theme defines `dress` or `onRole`, and nothing sets
  `crownEnabled` to false, although `main.ts` and `concepts.ts` call `dress` and `onRole` when
  present. The main page always uses `academy`.
- F12. The app has no frame-rate overlay or `?fps` parameter: `web/src/main.ts` reads only
  `slowmo` (the simulation's constant slow-down factor, 1-20, default 3), `members` and `ao`.
  The HUD has a pause button and a slow-down factor control. Clicking a member stops it
  (`main.ts`). Members send each message with `SendTo`, and `observedNetworker.SendTo`
  (`internal/core/quorum.go`) reports every message to the observer, which `main.ts` turns into
  a packet that calls the target's `receive()`, whether or not the target has stopped; a
  leader is therefore expected to keep sending heartbeats that reach a stopped follower.
- F13. The preview scripts live in `web/package.json` (`dev`, `build`, `build:pages`,
  `preview:pages`); there is no `package.json` at the repository root.

## 3. Requirements

### 3.1 Model asset and source

- R0. The shipped GLB, the Blender script that builds it (R2) and the document with its
  rebuild instructions (R3, a README) live together in one directory (requirements §5.1: the
  script next to the GLB, the rebuild instructions next to the script). The builder picks that
  directory under `web/src/`. The GLB import from `web/src/scene` must satisfy the
  import-direction test (F1), either by placing the directory inside `web/src/scene` or by
  placing it in a new top-level folder of `web/src` (for example the directory
  `web/src/assets/cat/` in the area `assets`). In the second case the area name `assets` (the
  top-level folder, not the directory `cat`) is added to the list of areas `scene` may import
  in `ALLOWED`, and the whole area `web/src/assets/`, including the R0 directory and the R2a
  directory, contains no `.ts` files, so the area needs no `ALLOWED` entry of its own (F9).
  In the first case the R0 and R2a directories contain no `.ts` files either. A directory
  outside `web/src` is not an option, since the test would have to allow `..` (F9).
- R1. The shipped GLB is the spike file, byte for byte (F5). It is imported as a Vite asset
  URL from the R0 directory.
- R2. The Blender 5.3 script that builds the model is committed as its source, in the R0
  directory. It is `build_cat_v2.py` with: the GLB export step added using the settings of the
  blender-agent-skills `web` preset (meshopt compression, sheen and specular extensions); the
  hard-coded temporary output directory replaced by an output path that is a required command
  argument; no absolute local paths. **(decided here)** The export calls Blender 5.3's built-in
  glTF exporter with those settings written into the script, so the script does not import the
  blender-agent-skills plugin or any other add-on. The script copies the whole `web` preset of
  the skills' `export_asset.py`: its `GLTF_BASE` values plus the `web` additions
  (`export_image_format="WEBP"`, `export_image_quality=85`,
  `export_meshopt_compression_enable=True`), not only the meshopt flag, so a regenerated GLB is
  exported as the approved one was. **(decided here)** Because `GLTF_BASE` sets
  `use_selection=True` and the spike script ends with only one object selected, the script
  selects `Body` and its children (`Eye_L`, `Eye_R`, `Tail`, `Whiskers_L`, `Whiskers_R`)
  immediately before exporting, so the export writes the whole cat.
  Arguments: everything after Blender's `--` belongs to the script. The script accepts exactly
  the required output path of the GLB, optionally followed by exactly one JSON-object argument
  overriding the shape parameters `P`, as the spike's `sys.argv[-1]` override does today (for
  example
  `blender -b --factory-startup --python-exit-code 1 -P <R0 dir>/build_cat_v2.py -- "$out/cat_v2.glb" '{"ear_h": 0.3}'`,
  with `$out` a directory outside the repository). The JSON override keeps working. The script
  fails before writing any file when the output path is missing, when the argument after the
  output path is not a JSON object (it does not start with `{` or does not parse to a JSON
  object), or when there is any further argument after it (including a second JSON object), so
  a mistyped override such as `ear_h=0.3` is never silently ignored. **(decided here)** It also
  fails before writing any file when the output path does not end in `.glb`, matched
  case-sensitively in lowercase (so `OUT.GLB` is refused), so the exporter
  writes the GLB at exactly the path given, with no suffix of its own added; every check of this
  requirement judges that path, the one written to disk. **(decided here)** It also
  fails before writing any file when the JSON object has a key that is not a key of `P`, so a
  misspelt shape key is never silently merged and ignored (the spike accepts it). **(decided here)** The script
  always also writes `cat_v2.blend` in the directory of the output GLB path as given (creating
  that directory if needed); `run_v2.sh` and the render helpers open that file (R2a). **(decided here)** The
  script refuses an output path that resolves (after making it absolute and resolving symbolic
  links) to the shipped GLB, located relative to the script itself: it fails before writing any
  file, the GLB or the `.blend`. **(decided here)** It also refuses, before writing any file,
  an output path that collides with the `cat_v2.blend` it would write, so the GLB and the
  `.blend` never overwrite each other. An output path whose own file name is `cat_v2.blend`
  already fails the `.glb` rule above, which subsumes that case. The collision is judged on the
  output path made absolute with symbolic links resolved: the script refuses if that resolved
  path has the file name `cat_v2.blend` (so a link whose name ends in `.glb` and whose target
  is named `cat_v2.blend`, in another directory, is refused), and also if it is the same path
  as the resolved `cat_v2.blend` it would write. **(decided here)** It also refuses, before
  writing any file, when the companion path it would write, `cat_v2.blend` in the directory of
  the output path as given, already exists as a symbolic link (whatever its target), or
  resolves (made absolute, symbolic links resolved) to the shipped GLB, so the `.blend` save
  never writes through a link or onto the shipped GLB. **(decided here)** Every
  refusal check of this requirement (missing output path, an output path not ending in `.glb`,
  invalid or extra arguments, an unknown `P` key, the shipped GLB, the `.blend` collision, a
  companion `cat_v2.blend` that is a symbolic link or resolves to the shipped GLB) runs before
  the script creates the
  output directory, so a refused run into a directory that does not exist yet leaves nothing
  behind, not even an empty directory. Under
  `--python-exit-code 1` (part of the documented command,
  R3) every failure of the script, this refusal and an invalid JSON override included, makes
  Blender exit non-zero. The script's docstring is updated to the documented command (R3). `build_cat_v2.py` is the
  canonical source of the GLB (owner answer 2); it is self-contained (F6), so rebuilding the
  GLB needs no other committed file and only Blender 5.3.
- R2a. The other spike files are committed as spike aids (owner answer 2): `build_cat.py`,
  `render_views.py`, `render_ear.py`, `sample_colors.py`, `run_v2.sh`, the fur comparison page
  (`fur-page/index.html`, `main.js`, `fur.js`) and `chosen-fur-params.json`.
  - Location: **(decided here)** one directory beside the R0 directory, with the same parent
    (for example `web/src/assets/cat-spike/`), holding `blender/`, `fur-page/` and
    `chosen-fur-params.json`. It contains no `.ts` files, so the import-direction test does not
    walk it (F9). No app module, `index.html` or `concepts.html` references it, it is not under
    `web/wasm-public/`, and it is not added as a build input, so neither production build
    contains it (F9).
  - Cleanup: every local path in these files, including those in docstrings and comments, is
    replaced by a command argument, an environment variable or a path relative to the file
    (F6 lists the known ones but is not exhaustive): output directories by an
    output-directory argument; the concept drawing by a path argument (the drawing itself is
    never committed, R4); the blender-agent-skills `turntable` helper by **(decided here)** an
    environment variable naming the skills' `skills` directory, with no default path into a
    plugin cache. Docstrings and comments describe the new commands. Renders are written to
    the given output directory, never into the repository tree. **(decided here)** Only
    `run_v2.sh` enforces that rule (it refuses a work directory inside the repository, below).
    For `render_views.py`, `render_ear.py` and `build_cat_v2.py` run on their own, keeping
    output outside the repository is a documented usage rule, stated in their docstrings and in
    the R0 and R2a READMEs, not a check they make; `build_cat_v2.py` still enforces its own
    refusals of R2.
  - Render helpers: `render_views.py` takes its output directory and the concept-drawing path
    as arguments after Blender's `--`; `render_ear.py` takes its output directory and may drop
    its unused concept path (F6); `sample_colors.py` takes the image path as an argument.
    `render_views.py` and `render_ear.py` keep their optional render-name prefix;
    `sample_colors.py` has none and still only prints colours (F6). The exact argument order is
    the builder's and is given in each docstring and in the R2a README.
  - `run_v2.sh` **(decided here)**: `run_v2.sh <work-dir> <concept-drawing> ['<JSON>']`, with
    Blender taken from `$BLENDER_EXE` as in the spike and the skills directory from the
    environment variable above, passed through unchanged. It does not `cd` anywhere.
    - It runs under `set -euo pipefail`, and does not pipe Blender's output through `grep` or
      any other filter, so Blender's exit status is never lost. Every Blender call it makes
      passes `--python-exit-code 1` (F6).
    - Before starting Blender, and before creating anything, it refuses, exiting non-zero, a
      `<work-dir>` inside the repository: one that, made absolute with symbolic links resolved
      (for a path that does not exist yet, through its nearest existing ancestor), lies in the
      repository working tree, located relative to the script itself. **(decided here)** So
      renders never land in the repository tree. The R2a README and the script's usage text
      say the work directory must be outside the repository.
    - Before starting Blender it refuses, exiting non-zero, a `<work-dir>` that exists and is
      not empty; it creates `<work-dir>` if it is absent. So every `cat_v2.glb` and
      `cat_v2.blend` the helpers can see there comes from this invocation.
    - It runs `build_cat_v2.py` from the R0 directory, located by a path relative to the script
      itself, with output path `<work-dir>/cat_v2.glb` and the JSON override, if given,
      forwarded as the last argument; that run writes `<work-dir>/cat_v2.blend` (R2). If that
      run exits non-zero, or `<work-dir>/cat_v2.blend` does not exist after it, `run_v2.sh`
      exits non-zero and starts neither helper.
    - Only then does it run `render_views.py` and `render_ear.py`, located by a path relative
      to the script itself, on that freshly written `<work-dir>/cat_v2.blend`, passing
      `<work-dir>` as their output directory and the concept-drawing path to
      `render_views.py`. A failing helper makes `run_v2.sh` exit non-zero.
  - The fur page loads the committed GLB by a relative path from its own location, and the
    `../cat.glb` fallback is removed (F6a). **(decided here)** Its other content, including its
    `stripes`, fur-reacts and rim tuning code, stays as in the spike: it is a preserved tuning
    tool, not shipped app code. This reads the design's "do not ship" (§3, §5.3, §10) as "not
    in the app or either production build" (A7a checks both builds); R13, R14 and A7 apply to
    the app.
  - The Vite dev server, which the companion preview of R31 uses, scans every `*.html` under its
    root for dependencies to pre-bundle, so it also scans the fur page. Its bare `three` imports
    resolve in `node_modules`, so this is expected to be harmless. A working companion dev
    preview is required before A21 (R31). If `npm run dev` warns or fails because of the fur
    page, the builder may fix it within the R2a layout without changing the app: for example by
    adjusting the fur page's imports, or by a dev-only Vite setting that keeps the spike-aids
    directory out of the dev server's dependency scan. Such a fix leaves the spike-aids
    directory where this item puts it, leaves app modules, `index.html` and `concepts.html`
    unchanged, and leaves the output of both production builds unchanged; the builder states
    the fix in the pull request. Any other remedy (moving the directory elsewhere, changing the
    app, or dropping the fur page) goes to the owner, and A21 waits for that decision.
  - A short README in that directory says what these files are (spike aids, not needed to
    rebuild the GLB), how to run the scripts, and how to open the fur page: from a static file
    server rooted at a directory that contains both the page and the GLB, for example
    `python3 -m http.server` run in `web/src/`, then the page's path; it needs network access to
    jsDelivr for three. If the Vite dev server also serves it, the README may say so.
  - No file under `spike-artifacts/renders/` is committed (owner answer 2).
- R3. A README in the R0 directory gives the rebuild command. The command states its working
  directory (for example the repository root) and writes the GLB into a directory outside the
  repository that is given as an argument (for example `out=$(mktemp -d)`, then the R2 command
  with `"$out/cat_v2.glb"`); it includes `--python-exit-code 1` (R2). The README says that the
  script refuses the shipped GLB as its output, an output path that collides with the
  `cat_v2.blend` it writes, and a companion `cat_v2.blend` path that is a symbolic link or
  resolves to the shipped GLB (R2), that output belongs outside the repository (R2a), that replacing the shipped GLB is a
  separate copy made only under the regeneration rule below, and that the `cat_v2.blend`
  written beside the output GLB is a by-product that is never committed. It also gives the
  regeneration contract:
  objects `Body` and `Tail`; `Eye_L`, `Eye_R`, `Whiskers_L`, `Whiskers_R` children of `Body`;
  material `M_EyeRing` on the eye rings and `M_Fur` on body and tail; `Body` origin at bottom
  centre; `Tail` origin where it leaves the body; front is -Y in Blender (+Z in three.js). It
  also lists, as derived from the loader code rather than from the design, the structure the
  loader relies on: `Body` has an identity transform (the code treats `Body` space as the cat's
  space for the landmarks); `Tail` is a direct child of `Body`, and `Tail.position` is read as
  its origin in body space; the eye and whisker positions are read the same way; on each eye
  object, the ring is a direct child mesh whose material is named `M_EyeRing` (the glTF loader
  splits a multi-material eye into child meshes). If the implemented loader relies on a
  different structure, the README lists that structure instead. It states that the `Col` / `COLOR_0`
  vertex colour is not part of the contract and not used, that a regenerated GLB counts as the
  same cat only if it keeps the contract and the owner agrees it looks the same, and that any
  shape change goes to the owner.
- R4. No Tripo images, concept drawing or other third-party reference images are committed.

### 3.2 Loading

- R5. The GLB is loaded once with `GLTFLoader` and three's `MeshoptDecoder`, and every member
  is a clone of it. Loading completes before the source connects, so no member is built before
  it. This holds on the main page and on `concepts.html`.
- R6. Rebuilding the cast does not reload the GLB and does not dispose the cached GLB
  geometry; per-cat materials are disposed with the member. Shell geometry, if it is separate
  from the GLB geometry (for example the spike's instanced shell geometries), is owned by the
  rebuild that creates it: each rebuild creates it with that rebuild's shell count (R25), and
  the next rebuild disposes it, without disposing the cached GLB geometry it was built from or
  any geometry the new cast still uses. No member of a new cast draws with a previous rebuild's
  shell count.
- R7. No new runtime dependency is added to `web/package.json`.

### 3.3 Fur

- R8. Body and tail carry shell fur as in design §5.2: each shell is pushed out along the
  normal in the vertex shader; a strand-noise threshold discards fragments and rises per layer,
  so strands taper; roots are darker and tips carry a rim; gravity droop and light wind sway
  are applied; a procedural fur normal map, sampled triplanar in object space, covers the base
  layer. Shared settings: strand thickness 0.46, gravity 0.43, wind 0.19, normal strength 0.94,
  normal tiles per metre 9 (the shell count is R25-R27). The fur is static apart from wind
  sway: no motion-reactive fur terms.
- R9. Face mask: fur length eases to zero around the eyes and whiskers over about 0.13 m with
  no abrupt edge, the bare skin there takes the coat's bald tint, and fur fades at the flat base.
- R10. Shells are offset after the bounce deformation, so fur stays on the body while it
  deforms.

### 3.4 Coats

- R11. The five coats of design §5.3 (colours, eye colours, whisker colour, fur length,
  density, root darkness, bald tint, tip rim, scatter, room rim, pattern seed 1-5) are applied
  as shader or material parameters on the one shared GLB, not baked textures. The hex values
  are sRGB. They are set through `THREE.Color` with three's colour management on, as the spike
  does, which converts them to the linear working colour space; the shaders receive those
  converted linear values. The raw sRGB components of a hex value are never passed to a shader
  as if they were linear. The GLB's vertex colours are not used.
- R12. Member `id` uses coat `id % 5` with pattern seed `seed(id % 5) + 100 * floor(id / 5)`.
  Only the calico patches and the British bicolour's white edge use the seed. The `solid` and
  `points` patterns and the strand placement ignore it, so a repeated Bombay, white or Ragdoll
  looks the same as the original (design §5.3).
- R13. Patterns: `solid` (second colour tints the ears only, by distance to the ear tips; the
  tail stays the base colour), `patches`, `points`, `bicolour`, as in design §5.3. The pattern
  rules of design §5.3 govern where each colour appears; the coat table's colour annotations
  do not override them. In particular the Bombay's second colour (`#4c4b6d`, annotated "ears,
  tail" in the table) tints the ears only, and the Bombay's tail stays the base colour. The base
  layer and every shell evaluate the same colour. The spike's `stripes` pattern is removed, and
  pattern indices in TypeScript and GLSL stay consistent after its removal.
- R13b. Light whiskers are never placed on white fur, for any coat (design §5.3,
  owner-approved readability; owner answer 5). The light whiskers are the Bombay's `#ebebef`
  and the Ragdoll's `#ffffff`. White fur means the white coat colours only: the white cat's base
  `#f7f5f2`, the calico's white base `#f4efe8` and the British bicolour's white areas
  `#f2efea`. Cream, such as the Ragdoll's base `#f1e6d2`, is not white fur (owner answer 5).
  - With the coat table as it stands, no light whisker sits on a white coat colour: the Bombay
    has no white fur, the Ragdoll's base is cream, and the white cat, calico and British
    bicolour have darker whiskers (`#aaa6ae`, `#7d7880`, `#86828c`). The rule is met by the
    coat table and stays a check (A12), not a shader change.
  - The Ragdoll keeps its approved spike look: its `#ffffff` whiskers and its `points` face
    mask as in the spike (`spike/fur-cats:web/src/scene/fur.ts` and the `uFace` / `uMuzzle`
    landmarks in `spike/fur-cats:web/src/scene/cat.ts`). The face mask is not widened or
    reshaped, and the coat table's colours are not changed, to serve this rule (owner answer 5).
- R13a. **(decided here)** The coat table, coat selection for a member id (R12) and the
  shell-count rule (R26, R27, including the R27 parsing of the raw `?shells` value) live in a pure module that meets F2: no runtime import of `three`
  or any package, no access to `window` or `document` at load time or inside these functions.
  The shell-count function takes the member count, the viewport width (or a small-screen flag)
  and the raw `?shells` value as arguments.

### 3.5 Rim light

- R14. A fresnel rim of colour `#ffe0c0` is added in the cat materials only (base fur layer,
  every shell, tail), weighted towards fur tips, absent on the bald skin, with per-coat strength
  equal to the "room rim" column. Scene lights are unchanged. The spike's `?rim` and
  `?rimColor` parameters and the rim multiplier uniform behind them are removed.

### 3.6 Motion

- R15. One vertex deformation is applied identically to the body, the body's shells, the eyes,
  the whiskers and the closed lids: base-anchored squash and stretch that roughly preserves
  volume (on landing the base spreads widest and the top flattens; before take-off the body
  stretches while the base is on the ground), plus a top lag weighted 0 at the base to 1 at the
  top, driven by a damped spring per cat. Ears follow the top. The tail mesh and the tail's
  shells are not deformed by it: they are moved and rotated together, rigidly, by R16, so the
  tail fur stays on the tail.
- R16. The tail swings on its own spring about its origin, and its origin follows the deformed
  surface (the deformation's displacement of the tail's rest origin).
- R17. Starting values: hop height 0.3 m, squash amount 1, wobble stiffness 120, wobble damping
  6, sleep slump 0.12 (the spike's `SLEEP_SQUASH`: the squash a fully stopped member slumps
  into). Triggers are those of `Mochi.update` today: candidates hop, a received message bumps, a
  role change pops, a stopped member slumps, everyone breathes. Each cat has its own phase.
- R18. The uniform-scale hop and squash of today's `Mochi.update` are removed; the hover
  enlargement stays.

### 3.7 Kept behaviour

- R19. Leader crown, lamp and lamp light follow the deformed head, at the spike's positions,
  with `headTop` as in F8 and `head` = the vertical displacement the deformation gives the
  crown's rest point:
  - crown: rest y = `headTop + furLength - 0.05` (on the fur between the ears); drawn at
    rest y + `head`, as a child of the squash group, as in the spike, so it also takes the hop,
    the hover enlargement and the sleep tilt;
  - lamp: y = `headTop + 0.55 + hopY + head + 0.04 * sin(1.6 t)`;
  - lamp light: y = `headTop + MemberLook.lampHeight + hopY + head`.
- R20. Name label: `0.42` above the ear tips plus the coat's fur length; `0.72` instead of
  `0.42` while leading, blended by the lamp level as today. As in the spike and on `main`, the
  label is a child of the member's root, not of the hop or squash group: it does not move with
  the hop or the head deformation, so its offsets must clear the ears and fur at the top of a
  hop and during a stretch, not only at rest. Clearance means the rendered label's lower edge,
  not its CSS2D anchor point, stays above the visible ear tips and fur, and above the leader
  lamp while leading, at the default camera distance. **(decided here)** Clearance is required
  in steady states: a follower (at rest, breathing), a hopping candidate (top of the hop and the
  stretch) and a leader with the lamp fully lit (lamp bob included). Transitions (the lamp
  fading in or out and the label offset blending after a promotion or demotion, including a
  promotion mid-hop) are judged by the owner only as "does not look broken". If A16 fails on clearance, the builder reports it
  in the pull request and does not change the design's offsets (0.42, 0.72, design §5.6) on
  its own; the owner decides the remedy.
- R21. Election timer ring, campaign sigil and leader sigil stay readable around the wider,
  furry body (radius about 0.6, about 0.69 with fur, against today's ring
  `RingGeometry(0.62, 0.72)`). The builder may resize the ring, the sigils or the stand radius,
  keeping their look.
- R22. Hover and click hit the new body (`hitMesh` is the `Body` mesh); click stops a member.
  Facing and turning, the sleep tilt, and the grey tint for a stopped member (on fur and skin)
  work as today. **(decided here)** The message anchor used by packets takes the spike's
  formula, `y = headTop * (0.55 - 0.15 * sleep)`, in place of today's
  `BODY_H * (0.55 - 0.15 * sleep)` (F8; about 0.59 against 0.61 when awake).
- R23. Sleep eyes: the GLB open eyes are hidden and a downward closed-lid arc is drawn at each
  ring centre, in that eye's colour, deforming with the body.
- R24. `MemberLook` hooks (lamp height and intensity, sigil glow and ink), `crownEnabled`,
  `theme.dress` and `theme.onRole` keep working; `concepts.html`, including `?theme=lineup`,
  renders the new cats.
  In the lineup, neighbouring cats, tails included, do not intersect in the lineup's shipped
  pose and animation (F10: at rest, breathing, through member 1's hop and its landing spread,
  and with the stopped member 4 ramping into and then holding its sleep slump (R17) and its
  sleep tilt of 0.14 rad, so pair 3-4 is judged with member 4 slumped and tilted), under these
  camera conditions (owner answers 6 and 7):
  - at both default lineup views, `concepts.html?theme=lineup` and
    `concepts.html?theme=lineup&focus=leader`, at the clamped camera positions of F10;
  - under small orbits from each default view. A small orbit reaches up to ±30° (±0.52 rad) of
    azimuth from the default view's azimuth (owner answer 7). **(decided here)** It is a camera
    position at the default view's distance (the distance at page load, before any zoom: about
    8.64 on the lineup, about 3.53 with `focus=leader`) whose azimuth is within that ±30° and
    whose polar angle is within the reachable part of ±0.15 rad of the default view's polar
    angle, that is 1.05 to 1.2 rad, since 1.2 rad is the controls' maximum (F10a). It covers
    the cats while they turn towards a camera moving within that range and after they settle
    (yaw follows the camera, F10a). The fixed distance and the 1.05-1.2 rad polar band are this
    spec's choice, not the owner's; the pull request lists both for the owner to confirm. That
    confirmation is part of A21 and so gates the merge under R30: while it is not recorded, A21
    stays open. If the owner picks a different distance or polar band, A21a is rerun with the
    owner's values and its numbers under them are reported. The owner's explicit acceptance of
    A21 under R30 may waive this confirmation and the rerun; the pull request then records
    what the owner accepted (for example A21 accepted with the distance and band unconfirmed,
    or without the rerun).

  The pass/fail for this clearance is the owner's visual check, A21 (owner answer 8). The
  builder's sampling script, A21a, is supporting evidence: it samples these camera conditions
  together with the shipped pose and animation and the yaw lag, is used to choose the spacing,
  and its method, sampling grid and numbers go in the pull request, but it has no pass/fail
  threshold and no proof of clearance between samples is required (no triangle-interior
  intersection test, no bound on motion between samples, no exact shell displacement; owner
  answer 8).

  Camera positions beyond small orbits (larger azimuth, zooming in, higher camera angles) are
  not part of the requirement: slight tail overlap between neighbours there is accepted, since
  this is a dev-only page (owner answer 6), and the spacing is not sized for them.
  The builder may widen the member spacing in `web/src/scenery/lineup.ts` for this (owner
  answer 1: an approved exception to the design §3 scenery non-goal, limited to that spacing),
  and changes nothing else there, nor the plinth, the facing logic or the camera limits.
  The row stays on the plinth in the sense of owner answer 7: at both default views and under
  small orbits, each cat's base footprint lies on the plinth, through the hop's landing spread
  and member 4's slump and sleep tilt. **(decided here)** The base footprint is the base patch,
  and this is its definition, not an example: the `Body` vertices whose rest y is below 0.02,
  transformed by the deformation, the sleep tilt, the yaw and the cat's position; its extent is
  their largest horizontal distance from the plinth's vertical axis. It is not the body's widest
  silhouette seen from above. Tail and fur are not part of it and may overhang the plinth edge
  in the air (owner answer 7).
  **(decided here)** The base footprint is bounded by radius 4.0, where the plinth's flat top
  ends, since the base sits on that flat top; 4.2 is the plinth's outer radius, the outer edge
  of its 0.2 rounded bevel (F7), and is not the bound. This bound stays a requirement: the
  chosen spacing keeps the maximum base-patch radius that A21a reports over its sampled poses
  at most 4.0, and that reported number is how the bound is checked (no proof between samples,
  owner answer 8).
  As a conservative screening estimate (the two maximum body half-widths plus the nominal fur
  lengths, not a measurement of the posed surfaces), today's 1.35 looks too tight even at rest
  for some pairs: calico (fur 0.065) next to Ragdoll (fur 0.095) gives 0.663 + 0.693 = 1.356,
  before the tail past the right edge and the yaw. The actual clearance depends on the posed
  surfaces, which A21a samples.
  **(decided here)** If the owner sees overlap they find unacceptable at the chosen spacing
  (A21), A21 stays open under R30 and the owner decides the remedy (owner answer 8); the
  builder reports A21a's numbers for that spacing and changes nothing beyond the spacing on its
  own.

### 3.8 Performance safeguard

- R25. The shell count is chosen on every cast rebuild, before that rebuild builds its first
  member, from that game's member count `n` and the viewport, classed by the actual CSS
  viewport width: small = `window.innerWidth < 640` (the ambient-occlusion breakpoint),
  otherwise desktop. A phone in landscape narrower than 640 px is therefore small. Body and
  tail draw exactly that many shells. **(builder's choice)** How the shells are drawn is the
  builder's (requirements §8); the spike shares instanced shell geometries and a shell uniform,
  and if that is kept, both the instance counts and the uniform are set from the chosen count.
- R26. Default rule: shells = `clamp(floor(5 * S / n), 6, 22)` with `S = 22` on a desktop and
  `S = 10` on a small screen (fur triangles per cat are the same for every member, so the
  triangle budget reduces to this). **(decided here: `floor`, so the budget is not exceeded
  above the minimum.)** The 6-shell minimum takes precedence over the budget: at 9 members on a
  small screen, 6 shells give 54 cat-shells against a budget of 50, and that is accepted.
  Resulting counts under the default rule (an example; criteria below refer to the counts the
  implemented rule gives):

  | n | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | desktop | 22 | 22 | 22 | 22 | 22 | 18 | 15 | 13 | 12 |
  | small | 22 | 22 | 16 | 12 | 10 | 8 | 7 | 6 | 6 |

  The builder may refine the constants after measuring, keeping these invariants (1-6
  **(decided here)**, as this spec's tightening of design §7's "refine the numbers"; 7 from
  owner answer 3). The invariants apply to the automatic counts the rule gives; a `?shells`
  override (R27) is outside them and keeps its 1-64 range:
  1. desktop with 5 members gives 22;
  2. every result is in 6-22;
  3. on each screen class, the count does not increase with `n`;
  4. a small screen never gets more shells than a desktop for the same `n`;
  5. at 5 members, a small screen gets strictly fewer shells than a desktop;
  6. on a desktop, 9 members get strictly fewer shells than 5 members;
  7. on a small screen, 9 members always get strictly fewer shells than 5 members, with no
     exception, so the small-screen count at 5 members is above the 6-shell minimum (owner
     answer 3). A flat small-screen count from 5 to 9 members, including a 6-shell plateau, is
     not allowed.

  The default rule meets invariants 6 and 7: 22 at 5 and 12 at 9 on a desktop, 10 at 5 and 6 at
  9 on a small screen.
- R27. `?shells=N` overrides the rule on every rebuild, on the main page and on
  `concepts.html`: `N` rounded and clamped to 1-64 as in the spike. The spike's `clampNumber`
  turns an empty `?shells=` into `Number("") = 0` and so 1 shell; this spec ignores an empty
  value instead, so `clampNumber` is not copied unchanged. **(decided here)** `N` is a
  numeric override only if, after trimming whitespace, it is non-empty and `Number(N)` is a
  finite number; any other value (absent, empty, whitespace-only, non-numeric, `Infinity`,
  `NaN`) is ignored and the rule applies.
- R28. **(decided here)** `concepts.html` uses the same rule with its own member count and
  viewport, and honours `?shells=N` as in R27.

### 3.9 Delivery

- R29. Work lands through pull requests. The first implementation branch brings in the GLB,
  `build_cat_v2.py` and its README (R0-R3), and the spike aids of R2a with their README, local
  paths cleaned. Renders and the Tripo images are never committed (owner answer 2, R4). `spike/fur-cats` is not merged; spike code may be copied and cleaned up.
- R30. Before any merge that changes the cats, every [owner] criterion (A10-A24) passes, or
  is explicitly accepted by the owner, on the final preview (with the one exception below), since every merge to `main`
  deploys the public site. A night-runner queue item for any of this sets `merge: owner`.
  This is the one carry-over rule for every owner criterion, A22-A24 included:
  - The final preview is the preview (R31) of the revision being merged, together with its
    companion dev preview built from the same revision. A21 and the `concepts.html` parts of
    A24 are judged on the companion dev preview, the rest on the preview.
  - An owner pass judged on an earlier revision's preview carries over to the final preview
    only if, between that earlier revision and the final revision, no file outside `docs/`
    changed: any Go, web, asset or configuration change invalidates it. This is judged on the
    tree diff between the two revisions (`git diff --name-only <earlier> <final>`), not on the
    commits the branch added, so a rebase onto a newer `main` that brings in a change outside
    `docs/` invalidates it too. Otherwise that criterion is re-judged on the final preview.
    For A22 and A23 the criterion is the case: each device, orientation and member count, and
    a case's pass also carries over only if `main`'s deployed revision (the A22/A23 baseline,
    the public site) did not change between the earlier preview's comparison and the final
    preview; otherwise the case is compared with `main` again on the final preview.
    **(decided here)** A recorded explicit owner acceptance carries over under the same
    condition as a pass.
  - The builder lists in the pull request every pass carried over, with the revision it was
    judged on.
  - A failed owner check stays open until a fix passes the owner's re-check on the final
    preview (under the rule above, a fix that changes any file outside `docs/` also sends
    every other criterion back to be re-judged on the final preview), or the owner explicitly
    accepts the failure and that acceptance is recorded in the pull request.
  - **(decided here)** The one exception applies only to A24's promotion mid-hop, no other
    item, and only while it has never been observed to fail on any revision. In that case, if
    it was not seen on the final revision, it is recorded in the pull request as "not observed
    on <revision>", with the final revision's ID, and does not block the merge; if it is seen
    on the final revision, it is judged like any other item. Once it has been observed to fail
    on any revision, the exception no longer applies and the failed-check rule above governs:
    it stays open until it is seen passing the owner's re-check on the final preview, or the
    owner's explicit acceptance is recorded in the pull request; not seeing it on the final
    revision does not close it.
- R31. A phone-reachable preview is provided for that check (for example a LAN-bound preview
  with Windows port forwarding, or a Cloudflare Pages preview deploy). It must allow 9 members.
  **(decided here)** It runs the `wasm` build, because that is what the public site runs:
  `npm run build:pages` then `npm run preview:pages -- --host`, both run in `web/` (F13), as is
  every `npm` command in this spec (the preview serves
  `web/dist-pages`, so the build must come first and from the same revision; in a sandboxed
  session the build needs `GOCACHE` pointed at a writable directory), or a Pages preview
  deploy. 9 members are reached with `?members=9` (F4). A deploy needs the owner's OK.
  `concepts.html` is not part of either production build and is not added to one; for A21 a
  companion dev preview is run from the same revision, `npm run dev -- --host` (Vite dev server,
  LAN-bound), opened at `/concepts.html`. That companion preview must work before A21 is judged;
  if the fur page breaks it, R2a says what the builder may fix and what goes to the owner.
- R32. Committed files contain no absolute local paths.

## 4. Acceptance criteria

Tags: **[auto]** checked by CI, a build or a unit test; **[builder]** run or inspected by the
builder, with the result stated in the pull request; **[owner]** judged by the owner on the
pre-merge preview (R30, R31), at the default camera distance unless stated.

Build, tests and static checks

- A1 [auto] CI passes. Its JavaScript tests are `node --test scripts/*.test.mjs` (including the
  import-direction test), the only JavaScript tests CI runs (F2). Separately from those tests,
  CI runs the two production builds, `npm run build:pages` and `npm run build`, and both
  succeed. (R0, R1, R5, R7)
- A2 [auto] A test in `scripts/*.test.mjs` covers the shell-count rule through the R13a
  module: the R26 table, or under refined constants the seven R26 invariants for `n` = 1..9 on
  both screen classes; and the R27 override values of E7, including a fractional value and an
  invalid value. (R13a, R26, R27)
- A3 [auto] A test in `scripts/*.test.mjs` covers coat selection through the R13a module: ids
  0-4 get coats 0-4 with seeds 1-5; ids 5-8 get coats 0-3 with seeds 101-104. (R12, R13a)
- A4 [builder] The committed GLB has SHA-256
  `8e4cb63feca4a6de686e48d771375aaa5d0f0b55e0de9f54df2a6681e74c5a01` and 167,652 bytes. (R1)
- A5 [builder] The README rebuild command (R3), run as written, from the working directory it
  states and into the directory outside the repository it names, with Blender 5.3 headless and
  no add-on or plugin installed beyond Blender's own, writes a GLB that meets the R3 contract
  and uses `EXT_meshopt_compression`, `KHR_materials_sheen` and `KHR_materials_specular`, and
  writes `cat_v2.blend` beside it. A second run of the same command with one JSON shape
  override (for example a different `ear_h`) and a separate output directory writes a GLB whose
  `Body` differs from the first run's in the overridden way (for example the `Body`
  bounding-box height or ear-tip height changes). The same command with the output path set to
  the shipped GLB, once as a repository-relative path and once through a symbolic link that
  points to the shipped GLB (created in a new, empty temporary directory outside the
  repository, and passed as that link's path), exits non-zero and writes no file (the
  temporary directory holds only the link afterwards). One run of the same command with no
  argument after Blender's `--` (no output path) exits non-zero and writes no file (`git status`
  shows no new or changed file). Five more runs of the same command each
  exit non-zero and write no file: one with the override `ear_h=0.3` (not JSON) whose output
  path lies in a directory that does not exist yet (a not-yet-created subdirectory of a new,
  empty temporary directory outside the repository), and that directory still does not exist
  afterwards; and, into new, empty directories outside the repository, one with two JSON
  objects after the output path, one with a JSON object holding a key that is not in `P`, one
  with the output path named `cat_v2.blend`, and one with it named `OUT.GLB` (both refused
  by R2's case-sensitive `.glb` rule). One more run into a new, empty temporary directory
  outside the repository passes the path of a symbolic link of another name (for example
  `out.glb`) whose target is a file path named `cat_v2.blend` in a second new, empty directory
  outside the repository: it exits non-zero and writes no file (the first directory holds only
  the link, the second stays empty). One more run passes a valid output path `out.glb` in a
  new, empty temporary directory outside the repository that already holds a symbolic link
  named `cat_v2.blend` pointing to the shipped GLB: it exits non-zero and writes no file (the
  directory holds only the link afterwards, and A4 still holds). In every refused run the output directory, if it did not
  exist before, is not created (R2). The shipped GLB is not overwritten. The regenerated
  GLBs are verification output only and are not committed in this
  work; a later replacement of the shipped GLB follows R3 (same contract, owner agrees it looks
  the same). A4 still holds after these runs. The script, the README and the shipped GLB are in
  one directory. (R0, R1, R2, R3)
- A6 [builder] `web/package.json` dependencies are unchanged. (R7)
- A7 [builder] Outside the R2a spike-aids directory, the diff contains no `?rim` /
  `?rimColor` handling or rim multiplier, no `stripes` pattern and no motion-reactive fur terms.
  Anywhere in the diff: no Tripo images, no concept drawing or other third-party reference
  image, no files from `spike-artifacts/renders/`, no absolute local path under any prefix
  (for example `/home/`, `/tmp/`, `/Users/`, `/mnt/`, `/private/` or a Windows drive letter),
  including in docstrings and comments, and no path into a local plugin cache, `~`-relative or
  not. All ten spike files of R2 and R2a are present. (R2, R2a, R4, R8, R13, R14, R29, R32)
- A7a [builder] After `npm run build` and `npm run build:pages`, neither `internal/web/dist`
  nor `web/dist-pages` contains a file from the spike-aids directory (the fur page,
  `chosen-fur-params.json` or a Blender script). The fur page, opened as its README says, loads
  the committed GLB and renders; if the builder's session has no network access to jsDelivr,
  the builder reports that this check was not run, and why. The companion dev preview
  (`npm run dev`) starts and serves
  `/concepts.html` with the spike-aids directory in place, and any fix made under R2a is stated
  in the pull request. Always: the Python files compile, with `PYTHONPYCACHEPREFIX` set to a
  temporary directory outside the repository so no `__pycache__` is written next to them
  (`PYTHONPYCACHEPREFIX="$(mktemp -d)" python3 -m py_compile ...`), and `run_v2.sh` passes
  `bash -n`. Also always, since both refusals happen before Blender starts (R2a), the builder
  runs `run_v2.sh` twice with `$BLENDER_EXE` pointing at a stub script outside the repository
  that only writes a marker file outside the repository when it is called, and with any
  readable file as the concept drawing:
  - once with a `<work-dir>` that already holds a file, and reports that it exited non-zero,
    left that directory's contents unchanged and never called the stub (no marker file);
  - once with a `<work-dir>` inside the repository that does not exist yet (for example a new
    directory under `web/`), and reports that it exited non-zero, created nothing, never called
    the stub, and that `git status` shows no new or changed file.

  When Blender 5.3 and the blender-agent-skills `turntable` helper are available, the builder
  also runs `run_v2.sh` with the real Blender:
  - once into a new, empty temporary directory outside the repository, with a PNG of at least
    1760 × 1721 px standing in for the concept drawing (F6), and reports that `cat_v2.glb` and
    `cat_v2.blend` were written there, that both render helpers ran on that `cat_v2.blend` and
    wrote their renders there, that `run_v2.sh` exited 0, and that `git status` shows no new
    or changed file in the repository compared with before the run;
  - once into another new, empty temporary directory with a malformed JSON override that starts
    with `{` (for example `'{"ear_h":'`), run under `bash -x` so its output traces every command
    it invokes, and reports that it exited non-zero, that no render file was written there, and
    that no traced Blender invocation runs `render_views.py` or `render_ear.py`.

  Otherwise the builder reports that these two Blender runs of `run_v2.sh` were not made, and
  why. (R2, R2a, R31)
- A8 [builder] With `?shells=N` and without it, the number of shells actually drawn for body
  and tail equals the expected value after load and after a HUD restart with a different member
  count (if instancing is kept, the shell uniform and both shell geometries' instance counts
  equal it). Resizing the window across 640 CSS px leaves the count unchanged until the next
  HUD restart (E2). That restart then gives:
  - without `?shells` (automatic count): the count the rule gives for the new screen class and
    the restart's member count;
  - with a valid `?shells=N` (override): the same count as before the resize, `N` rounded and
    clamped as in R27, whatever the screen class and member count.

  The GLB is
  fetched once per page load. With the GLB request delayed (for example by devtools network
  throttling), no member is built and the source does not connect until the GLB has loaded.
  After a restart, every per-cat material of the previous cast is disposed; if the
  implementation has shell geometry separate from the GLB geometry, the previous rebuild's
  shell geometry is disposed; the cached GLB geometry is not disposed. (R5, R6, R25, R27)
- A9 [builder] The default-mode build served by the Go binary loads the GLB and shows the
  cats. (F3)
- A9a [builder] Picking at the very edge of a body during a full stretch may miss (picking
  uses the resting `Body` triangles, O5), but hover and click do not feel broken in normal use,
  including clicks on a hopping candidate. (R22, design §9)

Owner checks on the preview

- A10 [owner] Each of members 0-4 shows the design §5.3 coat and is identifiable; the cat is
  the approved `cat_v2` shape (soft pointed ears, no mouth or nose, tail curling up and visible
  past the right edge from the front).
- A11 [owner] The Bombay reads as a black coal ball and does not vanish into the room.
- A12 [owner] The white cat reads clean white, not grey or dirty. For each of the five coats,
  no light whisker (the Bombay's or the Ragdoll's) is placed on white fur, in the sense of
  R13b and owner answer 5 (the white cat's base, the calico's white base, the British
  bicolour's white areas; cream is not white fur). The Ragdoll keeps its spike look: white
  whiskers and the spike's face mask, with no mask reshaping; its whiskers lying on its cream
  base does not fail this item. (R11, R13b)
- A13 [owner] No fur grows over the eyes or whiskers; there is no dark "bald ring" around
  them; fur does not pass through the floor.
- A14 [owner] The warm rim is visible on fur edges and the scenery is lit as on `main`. The
  cats cast shadows on the floor and are shaded by ambient occlusion where it is on, as on
  `main`.
- A15 [owner] Candidates hop with base-anchored squash and stretch; the top wobbles back after
  landing; the tail swings on its own; bumps, pops, slump and breathing are visible; cats are
  out of phase; eyes, whiskers and fur stay on the body and tail throughout.
- A16 [owner] The leader's crown, lamp and lamp light (the lit patch on the floor and the cat)
  ride the head through the bounce. The rendered label's lower edge stays above the visible
  ear tips and fur in the R20 steady states (a follower, a hopping candidate through the
  bounce, a leader with the lamp lit, where it also stays above the lamp). Transitions such as a
  promotion, its lamp fade-in and the label's offset blend do not look broken. A promotion
  mid-hop is judged under R30's rule for it (its one exception while never observed to fail,
  its failed-check rule once observed to fail), as A24 states. (R19, R20, R30)
- A17 [owner] The timer ring and both sigils read clearly around the furry body.
- A18 [owner] Hover highlights and click stops the member. A click at the very edge of a body
  during a stretch may miss (O5); picking does not feel broken. (A9a is the builder's check of
  the same.)
- A19 [owner] A stopped member tilts, greys, and shows two downward lid arcs in its own eye
  colours (odd eyes stay odd); it wakes with open eyes on restart.
- A20 [owner] With 9 members (`?members=9`), members 5-8 repeat coats 0-3, and member 7's
  calico patches differ from member 2's.
- A21 [owner] On the companion dev preview (R31), `concepts.html` with the default theme and
  `?theme=lineup` shows the new cats. On `?theme=lineup` and on `?theme=lineup&focus=leader`
  the owner takes a visual sanity look, each time:
  - first at the default lineup view as the page loads, without touching the camera (the
    clamped position of F10), watching the cats at rest and breathing, member 1 hop and
    member 4 slump and tilt;
  - then, without zooming, dragging the camera slowly to about 30° to the left of the default
    view and back, then to about 30° to the right and back;
  - then raising the camera to the top of the confirmed polar band (drag downwards a little)
    and repeating the left and right sweep there. If the owner replaces the distance or the
    band, this visual check is repeated at the new values, not only A21a's rerun (judge edit
    after the final Codex review).

  No two neighbouring cats in view visibly intersect, tails included, and each cat's base in
  view sits on the plinth's flat top; tails and fur overhanging the plinth edge in the air do
  not fail this item (owner answer 7). This visual check is the pass/fail for lineup
  clearance (owner answer 8); A21a's numbers are supporting evidence the owner may consult, and
  the base bound of 4.0 is checked by A21a's reported radius (R24). With `focus=leader` the
  owner judges only what is in frame. Slight tail overlap beyond small orbits (larger azimuth, zooming in, higher
  camera angles) is accepted and does not fail this item (owner answer 6). With
  `?theme=lineup&shells=4` the fur is visibly sparser than without the override, and the
  builder states in the pull request that 4 shells are drawn there. (R24, R27, R28, owner
  answers 1, 6 and 7)
  The owner also confirms, or replaces, the fixed distance and the polar band that A21a lists
  (R24); A21 passes only with that confirmation recorded in the pull request. If the owner
  picks a different distance or band, A21a is rerun with it, and its numbers reported, before
  A21 passes. The owner's explicit acceptance of A21 under R30 may waive the confirmation and
  the rerun; the pull request records what was accepted. If the owner sees overlap they find
  unacceptable at the chosen spacing, A21 stays open under R30 and the owner decides (R24).
- A21a [builder] Lineup sampling check: supporting evidence, used to choose the spacing, with
  no pass/fail threshold of its own (owner answer 8; A21 is the pass/fail). The builder runs an
  uncommitted script, kept outside the repository, that poses the lineup cats in scene space as
  the page does, with the implementation's own constants and formulas (positions from the
  chosen spacing, deformation, springs, sleep slump and tilt, tail swing, breathing, yaw
  easing), and states the method in the pull request. It samples every combination of:
  - camera: both default views (F10), each at its fixed default distance (about 8.64 on the
    lineup, about 3.53 with `focus=leader`), azimuth -30° to +30° from the default azimuth in
    steps of at most 5°, and polar angle over 1.05 to 1.2 rad in steps of at most 0.05 rad
    (R24);
  - yaw: at each sampled camera position, every cat's settled yaw (F10a); and **(decided
    here)** the yaw lag after a camera jump: for every ordered pair of sampled positions of the
    same view, and for the page load (every cat at the yaw the page creates it with, the camera
    at the default view), the yaws at each step of at most 1/30 s after the jump, computed with
    the page's easing (`lerpAngle(..., 1 - exp(-5 dt))`), until every cat is within 0.5° of its
    settled yaw. A slow drag is taken as covered by these jumps;
  - animation, in steps of at most 1/30 s: member 1's hop over a full cycle, its landing (the
    widest landing spread), the wobble after it and its tail swing included; member 4 from page
    load through its sleep ramp to the held pose (the sleep slump of R17 and the 0.14 rad
    tilt); and every cat's breathing at both extremes.

  **(decided here)** The product may be taken per pair: for each neighbouring pair, only the
  animation of that pair's two cats is combined with the camera and yaw samples (member 1's
  phase for pairs 0-1 and 1-2, member 4's for pair 3-4, and both breathing extremes of the two
  cats for every pair), since a pair's clearance does not depend on the other cats.

  In every sampled pose it checks every neighbouring pair (0-1, 1-2, 2-3, 3-4), tails
  included. Pair clearance is the distance between the two cats' posed mesh vertices minus both
  coats' fur lengths (body and tail carry fur), or another method the pull request states; a
  pose where the method finds one cat's surface inside the other counts as negative clearance.
  These are sampled estimates, not a proof: no clearance between samples is required (owner
  answer 8). The script may skip a pose that a stated conservative bound shows clear. The pull
  request states the method, the sampling grid actually used (camera, yaw and animation steps),
  the lineup spacing chosen, and reports the minimum clearance per pair, with the pose where it
  occurs, and the maximum base-patch radius (R24: `Body` vertices with rest y < 0.02,
  transformed by deformation, tilt, yaw and position, their largest horizontal distance from
  the plinth's vertical axis) against 4.0, with the cat and pose where it occurs. There is no
  clearance threshold. The reported base-patch radius is how R24's base bound is checked: the
  chosen spacing keeps it at most 4.0. It also lists the fixed distance and the polar band
  (decided here, R24) for the owner to confirm under A21; if the owner picks others, the script
  is rerun with them and its numbers reported, unless the owner's acceptance of A21 waives the
  rerun (R24). (R24, owner answers 6, 7 and 8)

Performance checks A22 and A23 (owner answer 4). Each case is one device, orientation and
member count. Every case is compared with `main`, whether or not `main` is smooth there. The
`main` baseline is the public site (the `wasm` build of `main`, the same build mode as the R31
preview), run on the same device under the same conditions: same orientation, same member
count, same ambient-occlusion setting, with `?shells` omitted on the preview so the automatic
rule chooses the count. Also the same simulation speed: `?slowmo` omitted on both (the default
factor), the HUD's slow-down factor and its automatic election slow-down (`autoSlow`, on by
default) left at their defaults on both, and neither paused. And the same camera framing: the
page's default camera on both, not orbited or zoomed, in a browser window of the same size.

- The owner compares each case visually. A case passes when the owner judges the new cats not
  noticeably slower than `main` in the same case and, where `main` is smooth, smooth too;
  otherwise it fails (design §4). So a noticeable slowdown fails even if the new cats feel
  smooth, and a case where `main` itself is not smooth passes when the new cats are not
  noticeably slower there.
- Both the preview and `main` are observed over a window of the same length (for example
  30 s) during comparable activity: at least one election occurs within the window on each
  side (one starts at each new game, and stopping the leader by clicking it starts another);
  the window does not have to be covered by elections throughout.
- For every case, the builder records in the pull request the device, orientation, CSS
  viewport width, member count and shell count, the revision ID of the preview and of `main`'s
  deployed revision it was compared with, the ambient-occlusion setting actually in effect on
  both, the length of the observation window, and a frame-rate reading of the preview and of
  `main` over that window where the device allows one; where it does not, the record says why
  no reading was taken. The owner takes the readings on their own devices with a browser tool
  (for example a browser frame-rate meter); the app has no frame-rate overlay or `?fps`
  parameter (F12) and none is added. The owner reviews each paired reading, where there is one,
  together with the visual comparison; the pass rule above stays the owner's visual judgement.
- A failed case stays open, as any failed owner check does under R30, until one of two things
  closes it:
  - the builder tunes the rule within the R26 invariants and the owner re-checks the case
    against `main` as above on the tuned revision's preview, and the re-check passes; a
    re-check that fails leaves it open (tune again, or the owner accepts it). Which other
    criteria must be re-judged after tuning is decided by R30's carry-over rule alone, not by
    whether a case's shell count changed: tuning changes files outside `docs/`, so no earlier
    pass carries over and every owner criterion, every A22 and A23 case included, is re-judged
    on the final preview; or
  - the owner explicitly accepts the case, and that acceptance is recorded in the pull request.
- Merge gate: as R30 states, every case passes or carries a recorded explicit owner
  acceptance on the final preview, directly or carried over under R30's rule.
- The builder does not change the 640 px breakpoint, the screen classing or the R26 invariants
  on its own; any such change is the owner's decision.

- A22 [owner] Desktop, 5 and 9 members: each case passes or is owner-accepted as above, on
  the final preview under R30's carry-over rule; the look at 5 members matches the approved
  spike look.
- A23 [owner] Phone, 5 and 9 members, in portrait and in landscape: each case passes or is
  owner-accepted as above, on the final preview under R30's carry-over rule, with `main`
  compared in the same orientation. Reload the page after each rotation, so the
  shell count matches the orientation (E2). The phone gets the counts the implemented rule
  gives for its CSS viewport width in each orientation (under the default rule, a landscape
  width of 640 px or more is a desktop: 22 shells at 5 members, 12 at 9); landscape is usually
  the worst case.

Behaviour checklist

- A24 [owner] On the final preview (main page) and its companion dev preview
  (`concepts.html`), each item looks right and does not look broken: fur, eyes, whiskers, lids
  and tail stay on the cat, and crown, lamp and label stay in place. How to produce each:
  - Facing and turning (R22): drag to orbit the camera on the main page and on
    `concepts.html?theme=lineup`; each cat turns smoothly to face the camera (F10a).
  - `MemberLook` hooks per theme (R24, F11): the main page and `concepts.html` (default theme)
    show `academy`'s look, a leader's lamp high and bright and the sigils glowing;
    `concepts.html?theme=forest`, `?theme=sky` and `?theme=lineup` show the default look.
    `dress`, `onRole` and `crownEnabled = false` are used by no theme (F11), so they cannot be
    produced on a preview; instead the builder states in the pull request that both pages still
    call `dress` and `onRole` on the new cat and that `crownEnabled = false` still keeps the
    crown hidden (by reading the code path or a local check that is not committed).
  - A stop mid-hop (E3): during an election, click a hopping candidate while it is in the air
    (the simulation slows during an election; the HUD factor control or `?slowmo=` slows it
    further). Producible on demand, though the timing takes a few tries.
  - A packet bump on a stopped member (E3), on the main page (the lineup sends no packets,
    F10): with a live leader, click a follower to stop it. The builder first confirms, on the
    dev or preview build, that the leader's heartbeats are delivered to the stopped follower:
    packets fly to it and complete their flight, and `target.receive()` runs on arrival
    (checked with a temporary, uncommitted log or breakpoint in `PacketSystem`; judge edit
    after the final Codex review). A packet that launches but never arrives is a delivery
    failure, handled as below, not a missing bump. Given delivery, the bump is required:
    each arriving packet bumps the stopped member while it is slumped and tilted, and a
    delivered packet with no bump fails this item. Only if delivery itself does not happen is
    the state recorded in the pull request as not produced, and the builder reports that as a
    possible regression of the packet path (F12 expects delivery), not as a pass; like a
    failed check, it then needs a fix or the owner's explicit acceptance under R30.
  - A promotion mid-hop (E4): cannot be produced on demand. It occurs when a hopping candidate
    wins an election; the owner watches elections (stopping the leader starts one) and observes
    it when it occurs.
  The promotion mid-hop, the one state observed only when it occurs, falls under R30's one
  exception while it has never been observed to fail on any revision: if it was not seen on
  the final revision, it is recorded in the pull request as "not observed on <revision>", with
  the final revision's ID, and that does not block the merge. Once it has been observed to
  fail on any revision, R30's failed-check rule governs it instead. Every produced or observed item passes or is owner-accepted on the
  final preview under R30's carry-over rule. (R19, R20, R22, R23, R24, E3, E4)

## 5. Edge cases

In scope:

- E1. A HUD restart with a different member count re-chooses the shell count (R25), without
  reloading the GLB (R6).
- E2. Resizing the window across 640 px does not change the shell count until the next
  rebuild. **(decided here)** That rebuild re-chooses the automatic count for the new screen
  class; a valid `?shells=N` override keeps drawing the same count (A8).
- E3. Reachable stop and bounce combinations, composing with the deformation and with the lids
  deforming with the body (R23):
  - a candidate stopped mid-air: the hop finishes its jump while the sleep slump and sleep tilt
    ramp in;
  - a stopped member that receives a packet: `receive()` bumps it while it is slumped and
    tilted.
- E4. A member that becomes leader mid-hop: crown and lamp follow the deformed head (R19);
  the label during that transition is judged only as "does not look broken" (R20).
- E5. Odd-eyed white asleep: each lid takes its own eye colour (R23).
- E6. 9 members on a small screen, with no `?shells` override: the automatic count the
  implemented rule gives, never below 6 (R26; 6 under the default rule). A `?shells` override
  may go below 6 (R27, E7).
- E7. `?shells=` empty, whitespace-only, non-numeric, `Infinity`, `2.6`, 0 or 100: ignored,
  ignored, ignored, ignored, 3, 1, 64 (R27).
- E8. Click at the very edge of a stretched body: may miss (O5); A9a and A18 check it does not
  feel broken.
- E9. 9 members on a phone in landscape: classed by its actual CSS viewport width (R25), as a
  desktop when 640 px or wider and as small otherwise, and gets the count the implemented rule
  gives for that class (under the default rule, 12 on a desktop, 6 on a small screen) (R26,
  A23).
- E10. Lineup cats turning while the camera moves within the small-orbit range: their yaws lag
  the camera (F10a). The owner's sweep in A21 judges whether neighbours visibly intersect,
  before and after they settle; A21a samples the lag as supporting evidence (R24, owner
  answer 8).
- E11. An output path for `build_cat_v2.py` that is a symbolic link to the shipped GLB, one
  that does not end in lowercase `.glb` (for example `cat_v2.blend` or `OUT.GLB`), or a link
  whose resolved target is named `cat_v2.blend`, or a valid output path whose companion
  `cat_v2.blend` already exists as a symbolic link or resolves to the shipped GLB: refused
  before any file is written (R2, A5).

Out of scope:

- O1. A fallback model or degraded mode when the GLB fails to load. **(decided here)** Expected
  behaviour on a failed load: the error reaches the browser console (an uncaught error from the
  module's top-level `await` of the load is enough), no members are built and the source does
  not connect. Nothing is shown in the HUD log. This spec treats that silent state as expected
  rather than a bug; the owner has not confirmed it yet.
- O2. Shell counts adapting to measured frame rate, or changing mid-game on resize.
- O3. Distinguishing repeated Bombay, white or Ragdoll coats beyond the name label.
- O4. Fixing fur graininess at distance unless the owner asks (design §8).
- O5. Raycasting the deformed silhouette.
- O6. Lineup clearance beyond small orbits (more than ±30° of azimuth, zooming in, higher
  camera angles): slight tail overlap there is accepted (owner answers 6 and 7, R24). Keeping
  tails and fur within the plinth edge: they may overhang it in the air; only each cat's base
  footprint stays on the plinth (owner answer 7, R24).
- O7. The Ragdoll's white whiskers over its cream base: cream is not white fur, so this is
  the approved look, and the face mask is not reshaped (owner answer 5, R13b).
- O8. Enforced in-repository output checks in `render_views.py`, `render_ear.py` and
  `build_cat_v2.py` run on their own: a documented usage rule only (R2a).
- O9. Proof of lineup clearance between A21a's samples: triangle-interior intersection tests,
  bounds on motion between samples, and the exact fur shell displacement after droop and wind
  sway (owner answer 8).

## 6. Known gaps (recorded, not fixed)

From design §9: whiskers turn brownish under the warm room light; shadows and ambient occlusion
do not follow the bounce; README screenshot `docs/visualizer-preview.png` to refresh after
release; `npm run build:pages` in a sandboxed agent session needs `GOCACHE` pointed at a
writable directory; with 6 to 9 members, a repeated Bombay, white or Ragdoll looks the same as
the original, while the repeated calico gets different patches and the British Shorthair does
not repeat (R12); picking uses the resting `Body` triangles.

Review findings recorded but not fixed (owner answer 9: they depend only on inputs or states
not seen in a real run):

- A21a's vertex-distance metric can miss two triangle interiors crossing while their vertices
  stay apart, and does not bound the shell displacement from droop and wind sway (owner
  answer 8 makes A21a supporting evidence, so this is not fixed).
- A21a does not sample a camera drag or reversal that starts with the cats already lagging,
  breathing phases between the two extremes, or motion between samples (owner answer 8).
- `build_cat_v2.py` checks its output and companion paths before writing; a link or file
  created at those paths after the check and before the write is not guarded.
- An output path that is a hard link to the shipped GLB is not recognised by resolving
  symbolic links; it is not guarded (A4 and `git status` would show the change).
- If the public site redeploys while the owner is still judging A22/A23 cases on the same final
  preview, R30 does not say whether cases compared before that redeploy are repeated.
