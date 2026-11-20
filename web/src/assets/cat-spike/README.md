# Cat spike aids

These files are kept from the spike that shaped the cat model. They are aids for tuning and
comparing the model, not part of the app, and they are not needed to rebuild the GLB: the
shipped model and its canonical source, `build_cat_v2.py`, live in `../cat/` (see its
README). No app module, `index.html` or `concepts.html` references this directory, and
neither production build contains it.

- `blender/build_cat.py`: the v1 model of the spike (writes `cat.blend`).
- `blender/render_views.py`: front, side, back, three-quarter and top renders of
  `cat_v2.blend`, and a sheet comparing the front render with the concept drawing.
- `blender/render_ear.py`: two close-ups of the left ear of `cat_v2.blend`.
- `blender/sample_colors.py`: prints colours sampled from the concept drawing; writes no file.
- `blender/run_v2.sh`: builds the model with `../cat/build_cat_v2.py`, then runs both render
  helpers on the result.
- `fur-page/`: the fur comparison page used to tune the fur (`index.html`, `main.js`,
  `fur.js`). It still holds the spike's tuning code (a `stripes` pattern, a fur-reacts toggle,
  a rim colour of its own) that the app does not ship.
- `chosen-fur-params.json`: the fur settings chosen on that page.

## Running the Blender scripts

All commands run from the repository root with Blender 5.3 headless. `$BLENDER_EXE` names the
Blender 5.3 executable. Output directories must be outside the repository: only `run_v2.sh`
checks this, for the other scripts it is a usage rule. The concept drawing is never
committed; pass its path as an argument. `render_views.py` crops it at fixed pixel
coordinates, so it must be at least 1760 × 1721 px.

The render helpers use the `turntable` helper of blender-agent-skills: set
`BLENDER_AGENT_SKILLS_DIR` to that project's `skills` directory (the one holding
`blender-lighting-lookdev/`). There is no default; the helpers stop with a message when it is
unset.

```sh
out=$(mktemp -d)

# v1 model; an optional quoted JSON object overrides shape parameters as the last argument
"$BLENDER_EXE" -b --factory-startup --python-exit-code 1 -P web/src/assets/cat-spike/blender/build_cat.py -- "$out"

# renders of a cat_v2.blend written by build_cat_v2.py (prefix optional, default "render")
"$BLENDER_EXE" -b "$out/cat_v2.blend" --factory-startup --python-exit-code 1 \
  -P web/src/assets/cat-spike/blender/render_views.py -- "$out" path/to/concept.png v2
"$BLENDER_EXE" -b "$out/cat_v2.blend" --factory-startup --python-exit-code 1 \
  -P web/src/assets/cat-spike/blender/render_ear.py -- "$out" v2

# colours of the concept drawing
"$BLENDER_EXE" -b --factory-startup --python-exit-code 1 \
  -P web/src/assets/cat-spike/blender/sample_colors.py -- path/to/concept.png
```

### run_v2.sh

```sh
web/src/assets/cat-spike/blender/run_v2.sh <work-dir> <concept-drawing> ['<JSON>']
```

It refuses a `<work-dir>` inside the repository and one that exists and is not empty, before
starting Blender or creating anything; otherwise it creates `<work-dir>` if needed. It then
runs `build_cat_v2.py` with output `<work-dir>/cat_v2.glb` (the quoted JSON object, if given,
is passed on as the shape override) and stops with a non-zero exit if that run fails or
`<work-dir>/cat_v2.blend` is missing. Only then does it run `render_views.py` (prefix `v2`)
and `render_ear.py` on that `cat_v2.blend`, writing their renders into `<work-dir>`. It needs
`$BLENDER_EXE` and passes `BLENDER_AGENT_SKILLS_DIR` through unchanged. Every Blender call
passes `--python-exit-code 1`, and any failure makes the script exit non-zero.

## Opening the fur page

The page loads three from jsDelivr through an import map, so it needs network access to
jsDelivr. It loads the committed model by a path relative to itself
(`../../cat/cat_v2.glb`), so serve a directory that contains both, for example:

```sh
cd web/src
python3 -m http.server
```

Then open `http://localhost:8000/assets/cat-spike/fur-page/`.
