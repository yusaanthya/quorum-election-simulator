"""Render front/side/back/three-quarter/top + concept comparison sheet from cat_v2.blend.
A spike aid. Run from the repository root:

    "$BLENDER_EXE" -b <work-dir>/cat_v2.blend --factory-startup --python-exit-code 1 \
        -P web/src/assets/cat-spike/blender/render_views.py -- <out-dir> <concept-drawing> [prefix]

Arguments after "--": the output directory for the renders, the path of the concept drawing
(never committed; at least 1760 x 1721 px, since the comparison crops it at fixed pixel
coordinates) and an optional render-name prefix (default "render"). The output directory must
be outside the repository (a usage rule, not a check this script makes). The environment
variable BLENDER_AGENT_SKILLS_DIR must name the blender-agent-skills "skills" directory, which
holds the turntable helper."""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(argv) < 2:
    sys.exit("render_views.py: usage: ... -P render_views.py -- <out-dir> <concept-drawing> [prefix]")
OUT, CONCEPT = argv[0], argv[1]
prefix = argv[2] if len(argv) > 2 else "render"
SK = os.environ.get("BLENDER_AGENT_SKILLS_DIR")
if not SK:
    sys.exit("render_views.py: set BLENDER_AGENT_SKILLS_DIR to the blender-agent-skills skills directory")
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

pivot = bpy.data.objects["LD_Pivot"]
cam = bpy.data.objects["LD_Cam"]
paths = {}
for view, rot in (("front", 0), ("side", 90), ("back", 180), ("threequarter", 38)):
    pivot.rotation_euler = (0, 0, math.radians(rot))
    bpy.context.view_layer.update()
    r.filepath = os.path.join(OUT, f"{prefix}_{view}.png")
    bpy.ops.render.render(write_still=True)
    paths[view] = r.filepath

# top view: camera straight above, front (-Y) at the bottom of the image
pivot.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
top = bpy.data.objects.new("TopCam", bpy.data.cameras.new("TopCam"))
top.data.lens = 85
sc.collection.objects.link(top)
c = pivot.location
top.location = (c.x, c.y, c.z + (cam.location - c).length)
top.rotation_euler = (0, 0, 0)
top.data.clip_end = 100
sc.camera = top
r.filepath = os.path.join(OUT, f"{prefix}_top.png")
bpy.ops.render.render(write_still=True)
paths["top"] = r.filepath
sc.camera = cam


def load(path):
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size
    a = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    return a.reshape(h, w, 4)


# comparison sheet: front render next to the owner's concept (cropped to the cat, resized)
front = load(paths["front"])
con = load(CONCEPT)
H = con.shape[0]
cy, cx, half = H - 1 - 1080, 1120, 640  # crop centre (image rows are bottom-up)
crop = con[cy - half:cy + half, cx - half:cx + half]
idx = (np.arange(RES) * (2 * half) / RES).astype(int)
crop = crop[idx][:, idx]
sheet = np.concatenate([crop, front], axis=1)
im = bpy.data.images.new("sheet", RES * 2, RES, alpha=True)
im.pixels.foreach_set(sheet.ravel())
im.filepath_raw = os.path.join(OUT, f"{prefix}_vs_concept.png")
im.file_format = "PNG"
im.save()
print("@@PATHS@@", paths, im.filepath_raw)
