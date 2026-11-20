"""Build the mochi cat model (cat_v2) and export it as a GLB. All shape parameters live in P.

This script is the canonical source of the shipped GLB, cat_v2.glb in this directory. It needs
only Blender 5.3 run headless, with no add-on. Run it from the repository root and write into
a directory outside the repository:

    out=$(mktemp -d)
    "$BLENDER_EXE" -b --factory-startup --python-exit-code 1 -P web/src/assets/cat/build_cat_v2.py -- "$out/cat_v2.glb"
    "$BLENDER_EXE" -b --factory-startup --python-exit-code 1 -P web/src/assets/cat/build_cat_v2.py -- "$out/cat_v2.glb" '{"ear_h": 0.3}'

The first command builds the cat with the parameters in P. The second overrides shape
parameters: the quoted JSON object alone, as the last argument (it writes into the same
directory, so run out=$(mktemp -d) again first to keep both results). $BLENDER_EXE is the
Blender 5.3 executable.

Arguments are everything after the first "--": the output path of the GLB, then optionally
one JSON object whose keys are keys of P. The script writes the GLB at exactly that path and
cat_v2.blend in the same directory (creating the directory if needed), and prints a
@@REPORT@@ line. It refuses, with a message starting "build_cat_v2.py: refused:" and a
non-zero exit (under --python-exit-code 1, Blender exits non-zero too), before writing any
file or directory:
- no output path;
- an output path that does not end in ".glb" (case-sensitive, so OUT.GLB is refused);
- a second argument that does not start with "{" or is not a JSON object;
- any third argument (including a second JSON object);
- a JSON key that is not a key of P;
- an output path that resolves (made absolute, symbolic links resolved) to the shipped
  cat_v2.glb in this directory;
- an output path that resolves to a file named cat_v2.blend, or to the cat_v2.blend it writes;
- a cat_v2.blend beside the output path that is a symbolic link, or resolves to the shipped
  cat_v2.glb.

Output belongs outside the repository. That is a usage rule, not a check this script makes.
The cat_v2.blend is a by-product and is never committed; replacing the shipped GLB is a
separate copy made only under the regeneration rule in README.md.
"""
import json
import math
import os
import sys

P = dict(
    # body (metres): front view ~circular and a bit wider than tall, side view a lying egg
    H=1.07, A=0.58, Df=0.58, Db=0.655, zc=0.46, p_top=2.2, sink=0.17, floor_k=0.16,
    spread=2.0, bulge=0.075, bulge_z=-0.45, bulge_w=0.40, peak_fwd=0.03,
    # ears: lobes pushed out of the dome
    ear_elev=52.0, ear_fwd=-0.05, ear_tilt=24.0, ear_h=0.33, ear_ws=0.38, ear_wf=0.28,
    ear_pow=1.3, ear_tip=0.18, ear_pinch=0.35,
    round_lo=0.62, round_hi=0.95, round_lam=0.5, round_it=30,
    quad_faces=2750,
    # v2: post-remesh tip shaping (density zone, cuts, shaping zone, extra height, lateral pinch, smoothing)
    tip_dens_r=0.22, tip_cuts=2, tip_r=0.16, tip_ext=0.02, tip_pinch=0.95, tip_pow=1.6, tip_smooth=4,
    # eyes / whiskers in "arc" coordinates (x = arc length from the front centre line, z = height)
    eye_x=0.245, eye_z=0.66, eye_ro=0.135, eye_ri=0.088,
    hl_dx=0.062, hl_dz=-0.018, hl_rx=0.015, hl_rz=0.026,
    wh_x0=0.31, wh_z0=(0.47, 0.425, 0.38), wh_ang=(2.0, -11.0, -24.0), wh_len=(0.25, 0.24, 0.21),
    wh_w=0.026,
    # tail spine (cat's left/back, +X +Y)
    tail_pts=((0.10, 0.40, 0.30), (0.25, 0.59, 0.31), (0.42, 0.63, 0.38), (0.56, 0.57, 0.52),
              (0.64, 0.52, 0.68), (0.69, 0.54, 0.82)),
    tail_r=0.055, tail_r_tip=0.047,
)


def refuse(reason):
    sys.exit(f"build_cat_v2.py: refused: {reason}")


def check_args(argv):
    """Validate the arguments after the first "--" and return the output path. Every refusal
    happens here, before anything is written and before any Blender module is imported."""
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    if not args:
        refuse("no output path given after --")
    out = args[0]
    if not out.endswith(".glb"):
        refuse(f"output path {out!r} does not end in .glb")
    override = {}
    if len(args) > 1:
        raw = args[1]
        try:
            override = json.loads(raw) if raw.startswith("{") else None
        except ValueError:
            override = None
        if not isinstance(override, dict):
            refuse(f"argument {raw!r} after the output path is not a JSON object")
    if len(args) > 2:
        refuse(f"unexpected argument {args[2]!r}; give at most one JSON object")
    unknown = sorted(k for k in override if k not in P)
    if unknown:
        refuse(f"unknown shape parameter(s) {unknown}; keys must be keys of P")
    shipped = os.path.realpath(os.path.join(os.path.dirname(os.path.realpath(__file__)), "cat_v2.glb"))
    resolved = os.path.realpath(os.path.abspath(out))
    if resolved == shipped:
        refuse(f"output path {out!r} is the shipped GLB")
    companion = os.path.join(os.path.dirname(out) or ".", "cat_v2.blend")
    companion_resolved = os.path.realpath(os.path.abspath(companion))
    if os.path.basename(resolved) == "cat_v2.blend" or resolved == companion_resolved:
        refuse(f"output path {out!r} collides with the cat_v2.blend this script writes")
    if os.path.islink(companion):
        refuse(f"{companion!r} is a symbolic link")
    if companion_resolved == shipped:
        refuse(f"{companion!r} resolves to the shipped GLB")
    P.update(override)
    return out


OUT_PATH = check_args(sys.argv)

# Blender-only modules (and numpy) are imported after the checks, so every refusal above also
# works under plain python3.
import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


COL = dict(body=srgb("#3f3d5c"), ear=srgb("#4c4b6d"), ring=srgb("#f3b831"), centre=srgb("#211f36"),
           white=srgb("#f6f6f8"))


def norm(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- body
def body_points(u, ears=True):
    x, y, z = u.T
    rho = np.sqrt(x * x + y * y)
    hx = np.where(rho > 1e-9, x / np.maximum(rho, 1e-9), 0.0)
    hy = np.where(rho > 1e-9, y / np.maximum(rho, 1e-9), 0.0)
    phi = np.arctan2(z, rho)
    p = np.where(z > 0, P["p_top"], 2.0)
    c = np.abs(np.cos(phi)) ** (2 / p)
    s = np.sign(z) * np.abs(np.sin(phi)) ** (2 / p)
    zc = P["zc"]
    z_raw = np.where(s > 0, zc + s * (P["H"] - zc), zc + s * (zc + P["sink"]))
    k = P["floor_k"]  # polynomial smooth max with the floor plane z=0
    h = np.clip(0.5 + 0.5 * z_raw / k, 0, 1)
    zz = z_raw * h + k * h * (1 - h)
    push = zz - z_raw  # how much the floor squashed this point -> spreads outward (settling)
    grow = (1 + P["bulge"] * np.exp(-((s - P["bulge_z"]) / P["bulge_w"]) ** 2)) * (1 + P["spread"] * push)
    depth = (P["Df"] + P["Db"]) / 2 + (P["Db"] - P["Df"]) / 2 * np.tanh(3 * hy)
    X = hx * c * P["A"] * grow
    Y = hy * c * depth * grow - P["peak_fwd"] * np.maximum(s, 0) ** 2
    pts = np.stack([X, Y, zz], 1)
    fear = np.zeros(len(u))
    if ears:
        for side in (1, -1):
            el = math.radians(P["ear_elev"])
            ue = norm(np.array([side * math.cos(el), P["ear_fwd"], math.sin(el)]))
            t_az = norm(np.cross(ue, [0, 0, 1.0]))
            t_el = np.cross(t_az, ue)
            a1, a2 = u @ t_el, u @ t_az
            t = np.sqrt((a1 / P["ear_ws"]) ** 2 + (a2 / P["ear_wf"]) ** 2)
            t = np.where(u @ ue > 0, t, 9.0)
            r = P["ear_tip"]
            tr = (np.sqrt(t * t + r * r) - r) / (math.sqrt(1 + r * r) - r)
            f = np.clip(1 - tr, 0, 1) ** P["ear_pow"]
            tl = math.radians(P["ear_tilt"])
            de = norm(np.array([side * math.sin(tl), P["ear_fwd"] * 0.5, math.cos(tl)]))
            base = body_points(ue[None], ears=False)[0][0]
            rel = pts - base
            lat = rel - (rel @ de)[:, None] * de
            pts = pts + P["ear_h"] * f[:, None] * de - P["ear_pinch"] * f[:, None] * lat
            fear = np.maximum(fear, f)
    return pts, fear


def icosphere_mesh(name, ears):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=6, radius=1.0)
    u = norm(np.array([v.co[:] for v in bm.verts]))
    pts, fear = body_points(u, ears)
    if ears:  # round the ear tips: Laplacian smoothing on the dense mesh, masked to the upper ear
        e = np.array([[ed.verts[0].index, ed.verts[1].index] for ed in bm.edges])
        deg = np.bincount(e.ravel(), minlength=len(pts)).astype(float)
        w = (P["round_lam"] * smoothstep(P["round_lo"], P["round_hi"], fear))[:, None]
        for _ in range(P["round_it"]):
            acc = np.zeros_like(pts)
            np.add.at(acc, e[:, 0], pts[e[:, 1]])
            np.add.at(acc, e[:, 1], pts[e[:, 0]])
            pts = pts + w * (acc / deg[:, None] - pts)
    for v, p in zip(bm.verts, pts):
        v.co = p
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def ctx(ob):
    return bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob],
                                     selected_editable_objects=[ob])


def sharpen_tips(me):
    """v2: quadriflow leaves a flat tip face. Add local density around each ear apex, pull the verts
    near it toward a point (lateral pinch + a little extra height), then relax the zone lightly."""
    tl = math.radians(P["ear_tilt"])
    dirs = {side: norm(np.array([side * math.sin(tl), P["ear_fwd"] * 0.5, math.cos(tl)])) for side in (1, -1)}

    def apex_of(vv, side):
        cand = np.where((side * vv[:, 0] > 0.1) & (vv[:, 2] > 0.8))[0]
        return vv[cand[np.argmax(vv[cand] @ dirs[side])]]

    bm = bmesh.new()
    bm.from_mesh(me)
    vv = np.array([v.co[:] for v in bm.verts])
    zone = set()
    for side in (1, -1):
        apex = apex_of(vv, side)
        for f in bm.faces:
            if np.linalg.norm(np.array(f.calc_center_median()[:]) - apex) < P["tip_dens_r"]:
                zone.add(f)
    edges = list({ed for f in zone for ed in f.edges})
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=P["tip_cuts"], use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(me)
    me.update()
    co = np.array([v.co[:] for v in bm.verts])
    e = np.array([[ed.verts[0].index, ed.verts[1].index] for ed in bm.edges])
    bm.free()
    deg = np.bincount(e.ravel(), minlength=len(co)).astype(float)
    mask = np.zeros(len(co))
    for side in (1, -1):
        de = dirs[side]
        apex = apex_of(co, side)
        rel = co - apex
        d = np.linalg.norm(rel, axis=1)
        w = np.clip(1 - d / P["tip_r"], 0, 1) ** P["tip_pow"]
        w = w * (rel @ de > -P["tip_r"])
        lat = rel - (rel @ de)[:, None] * de
        co = co + P["tip_ext"] * w[:, None] * de - P["tip_pinch"] * w[:, None] * lat
        mask = np.maximum(mask, np.clip(1 - d / (P["tip_r"] * 1.4), 0, 1))
    for _ in range(P["tip_smooth"]):
        acc = np.zeros_like(co)
        np.add.at(acc, e[:, 0], co[e[:, 1]])
        np.add.at(acc, e[:, 1], co[e[:, 0]])
        co = co + 0.4 * mask[:, None] * (acc / deg[:, None] - co)
    me.vertices.foreach_set("co", co.ravel())
    me.update()


def build_body(col):
    me = icosphere_mesh("Body", ears=True)
    ob = bpy.data.objects.new("Body", me)
    col.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    with ctx(ob):
        res = bpy.ops.object.quadriflow_remesh(target_faces=P["quad_faces"], use_mesh_symmetry=True,
                                               use_preserve_sharp=False, use_preserve_boundary=False,
                                               smooth_normals=False, seed=1)
    print("quadriflow", res, len(ob.data.polygons))
    if len(ob.data.polygons) < 500 or len(ob.data.polygons) > 20000:
        raise RuntimeError("quadriflow failed")
    sharpen_tips(me)
    # the base body without ears decides how much lighter (ear-coloured) each vertex is
    base = icosphere_mesh("tmp_base", ears=False)
    bm = bmesh.new()
    bm.from_mesh(base)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    bpy.data.meshes.remove(base)
    me = ob.data
    # snap the flat bottom exactly to z=0
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    co[:, 2] -= co[:, 2].min()
    me.vertices.foreach_set("co", co.ravel())
    d = np.array([tree.find_nearest(Vector(c))[3] for c in co])
    m = smoothstep(0.02, 0.10, d)
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    cols = np.array(COL["body"])[None] * (1 - m[:, None]) + np.array(COL["ear"])[None] * m[:, None]
    ca.data.foreach_set("color", np.hstack([cols, np.ones((len(co), 1))]).ravel())
    me.color_attributes.active_color = ca
    me.shade_smooth()
    me.update()
    return ob


# ---------------------------------------------------------------- tail
def catmull(pts, n):
    pts = np.array(pts, float)
    pts = np.vstack([2 * pts[0] - pts[1], pts, 2 * pts[-1] - pts[-2]])
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1:i + 3]
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-2])
    return np.array(out)


def build_tail(col, body):
    spine = catmull(P["tail_pts"], 10)
    seg = np.linalg.norm(np.diff(spine, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)]) / seg.sum()
    # resample evenly
    L = seg.sum()
    n = max(int(L / 0.03), 12)
    ss = np.linspace(0, 1, n)
    spine = np.stack([np.interp(ss, s, spine[:, i]) for i in range(3)], 1)
    tang = norm(np.gradient(spine, axis=0))
    rad = P["tail_r"] + (P["tail_r_tip"] - P["tail_r"]) * ss
    # parallel-transport frames
    nrm = norm(np.cross(tang[0], [0, 0, 1.0]))
    frames = []
    for t in tang:
        nrm = norm(nrm - t * (nrm @ t))
        frames.append((nrm, np.cross(t, nrm)))
    seg_n = 14
    ang = np.linspace(0, 2 * math.pi, seg_n, endpoint=False)
    rings = []
    # root cap (buried inside the body) and tip cap: hemispheres
    def cap(center, t, f, r, sign):
        out = []
        for k in range(5, 0, -1) if sign > 0 else range(1, 6):
            a = k / 6 * math.pi / 2
            out.append((center + sign * t * r * math.sin(a), r * math.cos(a), f))
        return out
    ring_defs = cap(spine[0], tang[0], frames[0], rad[0], -1)[::-1]
    ring_defs = [(c, r, f) for c, r, f in ring_defs]
    ring_defs += [(spine[i], rad[i], frames[i]) for i in range(n)]
    ring_defs += cap(spine[-1], tang[-1], frames[-1], rad[-1], 1)[::-1]
    bm = bmesh.new()
    vr = []
    for c, r, (a, b) in ring_defs:
        vr.append([bm.verts.new(c + r * (math.cos(t) * a + math.sin(t) * b)) for t in ang])
    root_pole = bm.verts.new(spine[0] - tang[0] * rad[0])
    tip_pole = bm.verts.new(spine[-1] + tang[-1] * rad[-1])
    for i in range(len(vr) - 1):
        for j in range(seg_n):
            bm.faces.new((vr[i][j], vr[i][(j + 1) % seg_n], vr[i + 1][(j + 1) % seg_n], vr[i + 1][j]))
    for j in range(seg_n):
        bm.faces.new((root_pole, vr[0][(j + 1) % seg_n], vr[0][j]))
        bm.faces.new((tip_pole, vr[-1][j], vr[-1][(j + 1) % seg_n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # origin where the tail leaves the body (first spine point outside the body)
    btree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    origin = spine[0]
    for p in spine:
        hit = btree.ray_cast(Vector(p), Vector((0, 0, -1)))
        loc, nn, _, _ = btree.find_nearest(Vector(p))
        if (Vector(p) - loc).dot(nn) > 0:
            origin = p
            break
    for v in bm.verts:
        v.co -= Vector(origin)
    me = bpy.data.meshes.new("Tail")
    bm.to_mesh(me)
    bm.free()
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    ca.data.foreach_set("color", np.tile(COL["ear"] + [1.0], len(me.vertices)))
    me.color_attributes.active_color = ca
    me.shade_smooth()
    ob = bpy.data.objects.new("Tail", me)
    ob.location = origin
    col.objects.link(ob)
    return ob


# ---------------------------------------------------------------- decals (eyes, whiskers)
def project(btree, sx, sz, off):
    """arc-length coordinates on the front -> surface point + offset along the surface normal"""
    th = sx / P["A"]
    o = Vector((0, 0.05, sz))
    d = Vector((math.sin(th), -math.cos(th), 0))
    loc, nrm, _, _ = btree.ray_cast(o, d)
    if loc is None:
        raise RuntimeError(f"projection missed at {sx},{sz}")
    if nrm.dot(d) < 0:
        pass
    nrm = nrm if nrm.dot(d) > 0 else -nrm
    return loc + nrm * off, nrm


def decal_object(name, col, btree, parts, thick):
    """parts: list of (verts2d, faces, mat_index, offset). Builds a thin slab that sinks into the body."""
    bm = bmesh.new()
    for v2, faces, mi, off in parts:
        vs = []
        for sx, sz in v2:
            p, _ = project(btree, sx, sz, off)
            vs.append(bm.verts.new(p))
        for f in faces:
            face = bm.faces.new([vs[i] for i in f])
            face.material_index = mi
    # ring and centre share their seam: weld it so Solidify builds no hidden inner walls
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.normal_update()
    # outward = away from the body axis
    out = sum(((f.calc_center_median() - Vector((0, 0, f.calc_center_median().z))).normalized().dot(f.normal)
               for f in bm.faces))
    if out < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    sol = ob.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness, sol.offset, sol.use_even_offset = thick, -1.0, True
    with ctx(ob):
        bpy.ops.object.modifier_apply(modifier="Solidify")
    me.shade_smooth()
    return ob


def disc(cx, cz, rx, rz, r0=0.0, rings=4, seg=40, mi=0, off=0.004):
    """ellipse (r0=0) or annulus (r0 = inner fraction) as a polar grid"""
    v2, faces = [], []
    radii = np.linspace(r0, 1, rings + 1) if r0 > 0 else np.linspace(0, 1, rings + 1)[1:]
    for r in radii:
        for k in range(seg):
            a = 2 * math.pi * k / seg
            v2.append((cx + rx * r * math.cos(a), cz + rz * r * math.sin(a)))
    nr = len(radii)
    for i in range(nr - 1):
        for k in range(seg):
            a, b = i * seg + k, i * seg + (k + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    if r0 == 0:  # centre fan
        c = len(v2)
        v2.append((cx, cz))
        for k in range(seg):
            faces.append((c, (k + 1) % seg, k))
    return v2, faces, mi, off


def strip(x0, z0, ang, length, w, seg=14, mi=0, off=0.004):
    a = math.radians(ang)
    dx, dz = math.cos(a), math.sin(a)
    nx, nz = -dz, dx
    v2 = []
    r = w / 2
    cap = [r * (1 - math.cos(a)) for a in np.linspace(0.12, math.pi / 2, 5)]
    ds = cap + list(np.linspace(r, length - r, seg)[1:-1]) + [length - c for c in cap[::-1]]
    seg = len(ds) - 1
    for d in ds:
        e = min(d, length - d)
        hw = math.sqrt(max(r * r - (r - e) ** 2, 0.0)) if e < r else r
        t = d / length
        cx, cz = x0 + dx * t * length, z0 + dz * t * length
        v2 += [(cx + nx * hw, cz + nz * hw), (cx - nx * hw, cz - nz * hw)]
    faces = [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(seg)]
    return v2, faces, mi, off


def material(name, base, rough, spec=0.5, sheen=0.0, sheen_tint=(1, 1, 1), attr=None):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Roughness"].default_value = 0.45
        b.inputs["Sheen Tint"].default_value = (*sheen_tint, 1)
    if attr:
        a = nt.nodes.new("ShaderNodeVertexColor")
        a.layer_name = attr
        nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
    return m


# The blender-agent-skills export_asset.py "web" preset (version 1.3.2): its GLTF_BASE settings,
# then the "web" additions (a later value wins), written here so the script imports no add-on.
GLTF_BASE = dict(use_selection=True, export_format="GLB", export_yup=True, export_apply=True,
                 export_texcoords=True, export_normals=True, export_tangents=False,
                 export_materials="EXPORT", export_image_format="AUTO", export_animations=True,
                 export_animation_mode="ACTIONS", export_skins=True, export_morph=True,
                 export_influence_nb=4, export_def_bones=True, export_leaf_bone=False,
                 export_extras=False, export_cameras=False, export_lights=False)
GLTF_WEB = dict(GLTF_BASE, export_image_format="WEBP", export_image_quality=85,
                export_meshopt_compression_enable=True)
EXPORTED = ("Body", "Eye_L", "Eye_R", "Tail", "Whiskers_L", "Whiskers_R")


def export_glb(out):
    """Select Body and its children only, make Body active and export the GLB at exactly `out`."""
    for ob in bpy.context.view_layer.objects:
        ob.select_set(ob.name in EXPORTED)
    bpy.context.view_layer.objects.active = bpy.data.objects["Body"]
    res = bpy.ops.export_scene.gltf(filepath=os.path.abspath(out), **GLTF_WEB)
    if res != {"FINISHED"}:
        raise RuntimeError(f"glTF export failed: {res}")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    col = bpy.data.collections.new("Cat")
    sc.collection.children.link(col)
    m_fur = material("M_Fur", COL["body"], 0.9, spec=0.2, sheen=0.4, sheen_tint=(0.6, 0.6, 0.68), attr="Col")
    m_ring = material("M_EyeRing", COL["ring"], 0.6, spec=0.3)
    m_centre = material("M_EyeCentre", COL["centre"], 0.55, spec=0.3)
    m_white = material("M_White", COL["white"], 0.6, spec=0.3)

    body = build_body(col)
    body.data.materials.append(m_fur)
    tail = build_tail(col, body)
    tail.data.materials.append(m_fur)

    bpy.context.view_layer.update()
    btree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    objs = {}
    for side, tag in ((1, "L"), (-1, "R")):  # L = cat's left = +X
        ex = side * P["eye_x"]
        ri = P["eye_ri"] / P["eye_ro"]
        eye = decal_object(f"Eye_{tag}", col, btree, [
            disc(ex, P["eye_z"], P["eye_ro"], P["eye_ro"], r0=ri, rings=2, seg=32, mi=0, off=0.004),
            disc(ex, P["eye_z"], P["eye_ri"], P["eye_ri"], rings=3, seg=32, mi=1, off=0.004),
            # highlight sits on the viewer's right on both eyes, as in the drawing
            disc(ex + P["hl_dx"], P["eye_z"] + P["hl_dz"], P["hl_rx"], P["hl_rz"], rings=2, seg=20, mi=2,
                 off=0.008),
        ], thick=0.010)
        for m in (m_ring, m_centre, m_white):
            eye.data.materials.append(m)
        wparts = [strip(side * P["wh_x0"], z0, ang if side > 0 else 180 - ang, ln, P["wh_w"])
                  for z0, ang, ln in zip(P["wh_z0"], P["wh_ang"], P["wh_len"])]
        wh = decal_object(f"Whiskers_{tag}", col, btree, wparts, thick=0.008)
        wh.data.materials.append(m_white)
        objs[eye.name], objs[wh.name] = eye, wh

    # origins: eyes at their centre (blink scaling), whiskers at their mean; everything parented to Body
    for ob in list(objs.values()) + [tail]:
        if ob is not tail:
            me = ob.data
            co = np.empty(len(me.vertices) * 3)
            me.vertices.foreach_get("co", co)
            c = co.reshape(-1, 3).mean(0)
            me.vertices.foreach_set("co", (co.reshape(-1, 3) - c).ravel())
            me.update()
            ob.location = c
        ob.parent = body
    for ob in col.objects:  # UVs so the app can add textures later (asset-qa game profile)
        for o in col.objects:
            o.select_set(o == ob)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    os.makedirs(os.path.dirname(OUT_PATH) or ".", exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=os.path.abspath(os.path.join(os.path.dirname(OUT_PATH) or ".", "cat_v2.blend")))
    export_glb(OUT_PATH)
    rep = {}
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in col.objects:
        e = ob.evaluated_get(dg)
        m = e.to_mesh()
        if ob.name == "Body":
            v = np.array([q.co[:] for q in m.vertices])
            rep["dome_top_z"] = round(float(v[np.abs(v[:, 0]) < 0.08][:, 2].max()), 3)
            rep["max_width_z"] = round(float(v[np.argmax(v[:, 0]), 2]), 3)
            rep["contact_radius_x"] = round(float(np.abs(v[v[:, 2] < 0.004][:, 0]).max()), 3)
        rep[ob.name] = dict(tris=sum(len(p.vertices) - 2 for p in m.polygons),
                            ngons=sum(len(p.vertices) > 4 for p in m.polygons),
                            dims=[round(v, 3) for v in ob.dimensions])
        e.to_mesh_clear()
    print("@@REPORT@@" + json.dumps(rep))


main()
