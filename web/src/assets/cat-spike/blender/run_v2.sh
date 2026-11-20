#!/usr/bin/env bash
# Rebuild the cat with build_cat_v2.py, then render it with render_views.py and render_ear.py.
# A spike aid; see ../README.md.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: run_v2.sh <work-dir> <concept-drawing> ['<JSON>']

Builds <work-dir>/cat_v2.glb and <work-dir>/cat_v2.blend with build_cat_v2.py (the JSON
object, if given, overrides shape parameters), then writes the renders of render_views.py
and render_ear.py into <work-dir>. The work directory must be outside the repository and
must be empty or absent. $BLENDER_EXE names the Blender 5.3 executable;
BLENDER_AGENT_SKILLS_DIR (the blender-agent-skills "skills" directory) is passed through to
the render helpers.
EOF
}

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  usage
  exit 2
fi
if [ -z "${BLENDER_EXE:-}" ]; then
  echo "run_v2.sh: BLENDER_EXE is not set" >&2
  exit 2
fi

here=$(dirname "$(realpath "${BASH_SOURCE[0]}")")
r0=$(realpath "$here/../../cat")
root=$(realpath "$here/../../../../..")

work=$(realpath -m "$1")
concept=$2
if [ "$work" = "$root" ] || [ "${work#"$root"/}" != "$work" ]; then
  echo "run_v2.sh: refused: work directory $work is inside the repository" >&2
  exit 1
fi
if [ -e "$work" ] && [ -n "$(ls -A "$work")" ]; then
  echo "run_v2.sh: refused: work directory $work exists and is not empty" >&2
  exit 1
fi
mkdir -p "$work"

"$BLENDER_EXE" -b --factory-startup --python-exit-code 1 -P "$r0/build_cat_v2.py" -- "$work/cat_v2.glb" "${@:3}"
if [ ! -f "$work/cat_v2.blend" ]; then
  echo "run_v2.sh: $work/cat_v2.blend was not written" >&2
  exit 1
fi

"$BLENDER_EXE" -b "$work/cat_v2.blend" --factory-startup --python-exit-code 1 \
  -P "$here/render_views.py" -- "$work" "$concept" v2
"$BLENDER_EXE" -b "$work/cat_v2.blend" --factory-startup --python-exit-code 1 \
  -P "$here/render_ear.py" -- "$work" v2
