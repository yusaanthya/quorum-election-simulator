"""(v2 ear closeup) Render two close-ups of the left ear from cat_v2.blend. A spike aid. Run
from the repository root:

    "$BLENDER_EXE" -b <work-dir>/cat_v2.blend --factory-startup --python-exit-code 1 \
        -P web/src/assets/cat-spike/blender/render_ear.py -- <out-dir> [prefix]

Arguments after "--": the output directory for the renders and an optional render-name prefix
(default "render"). The output directory must be outside the repository (a usage rule, not a
check this script makes). The environment variable BLENDER_AGENT_SKILLS_DIR must name the
blender-agent-skills "skills" directory, which holds the turntable helper."""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if not argv:
    sys.exit("render_ear.py: usage: ... -P render_ear.py -- <out-dir> [prefix]")
OUT = argv[0]
prefix = argv[1] if len(argv) > 1 else "render"
SK = os.environ.get("BLENDER_AGENT_SKILLS_DIR")
if not SK:
    sys.exit("render_ear.py: set BLENDER_AGENT_SKILLS_DIR to the blender-agent-skills skills directory")
sys.path.insert(0, os.path.join(SK, "blender-lighting-lookdev", "scripts"))
import turntable  # noqa: E402

RES = 1024
NAMES = ["Body", "Tail", "Eye_L", "Eye_R", "Whiskers_L", "Whiskers_R"]

sc = bpy.context.scene
r = sc.render
r.resolution_x = r.resolution_y = RES
r.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = 48
sc.cycles.use_denoising = True
sc.view_settings.exposure = -2.1
try:
    sc.view_settings.view_transform = "Khronos PBR Neutral"
except TypeError as e:
    print("view transform", e)

res = turntable.run(objects=NAMES, rig="studio", frames=1, lens=105.0, backdrop=True, elevation=10.0)
print(res)
# lighter backdrop so the dark cat reads as a silhouette like the drawing; rim light stronger
bd = bpy.data.objects["LD_Backdrop"]
bsdf = next(n for n in bd.data.materials[0].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Base Color"].default_value = (0.9, 0.9, 0.92, 1)
bpy.data.objects["LD_Rim"].data.energy *= 1.6
sc.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.8, 0.82, 1)


cam = bpy.data.objects["LD_Cam"]
bpy.data.objects["LD_Pivot"].rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
body = bpy.data.objects["Body"]
co = np.array([v.co[:] for v in body.data.vertices])
sel = co[(co[:, 0] > 0.1) & (co[:, 2] > 0.8)]
apex = sel[np.argmax(sel[:, 2])]
target = Vector(apex) + Vector((0, 0, -0.04))
for k, dirv in enumerate(((0.35, -1, 0.2), (1, -0.3, 0.15))):
    d = Vector(dirv).normalized()
    cam.parent = None
    cam.location = target + d * 1.5
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 85
    cam.data.dof.use_dof = False
    cam.data.clip_start = 0.05
    sc.camera = cam
    r.filepath = os.path.join(OUT, f"{prefix}_ear_closeup.png" if k == 0 else f"{prefix}_ear_closeup_b.png")
    bpy.ops.render.render(write_still=True)
