"""Print colours sampled from the concept drawing at fixed points. A spike aid; it writes no
file. Run from the repository root:

    "$BLENDER_EXE" -b --factory-startup --python-exit-code 1 \
        -P web/src/assets/cat-spike/blender/sample_colors.py -- <image>

The argument after "--" is the path of the image (the concept drawing, never committed)."""
import sys

import bpy, numpy as np
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(argv) != 1:
    sys.exit("sample_colors.py: usage: ... -P sample_colors.py -- <image>")
im = bpy.data.images.load(argv[0])
im.colorspace_settings.name = "Non-Color"   # read raw sRGB bytes
w, h = im.size
a = np.empty(w*h*4, np.float32); im.pixels.foreach_get(a); a = a.reshape(h, w, 4)
def s(x, y, r=6):  # image coords (top-left origin, 2048 space)
    p = a[h-1-y-r:h-1-y+r, x-r:x+r, :3].reshape(-1,3).mean(0)
    return "#%02x%02x%02x" % tuple(int(round(v*255)) for v in p)
k = 1.06
for name,(x,y) in {"body":(1000,1150),"body2":(900,750),"ear_L":(680,650),"ear_R":(1300,640),"tail":(1500,880),"tail2":(1420,1050),"eye_ring":(675,900),"eye_centre":(750,900),"highlight":(797,928),"whisker":(640,1040)}.items():
    print(name, s(int(x*k), int(y*k), 4 if name in ("highlight","whisker") else 8))
