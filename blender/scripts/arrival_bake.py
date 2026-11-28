"""Bake Cycles lighting + AO for the near arrival square into one lightmap atlas (fidelity r1).

Run after build_arrival_slice.py, before export_arrival_slice.py:
    blender --background --python blender/scripts/arrival_bake.py -- [--size 2048] [--samples 64]

Contract (shared with the client, see export_arrival_slice.py / arrival_glb_lightmap.py):
  * baked meshes get a second UV layer "LightmapUV" -> glTF TEXCOORD_1, object extras lightmap=true;
  * their static materials are swapped for "<name>_lm" copies with extras
    {"lightmap": true, "lightmap_scale": S, "lightmap_encoding": "srgb"};
  * texel (sRGB-decoded) * S = Cycles diffuse lighting (direct + indirect, sky + sun + lamps, so
    AO and bounce included), i.e. final colour = albedo * texel * S. The atlas is written to
    blender/textures/arrival/ar_lightmap.jpg and injected into the GLB by the export.
Dynamic surfaces (water, lamp glow, people, far skyline, clouds) are never baked.
The district .blend is never opened; its sha256 is checked before and after.
"""

import argparse
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from arrival_materials import TEX_DIR  # noqa: E402
from build_arrival_slice import ARRIVAL, sha256  # noqa: E402
from openpoker_common import DISTRICT_BLEND, SLICE_BLEND  # noqa: E402
from render_arrival_slice import isolate  # noqa: E402

LM_UV = "LightmapUV"
LM_IMAGE = "ar_lightmap"
LM_JPG = os.path.join(TEX_DIR, "ar_lightmap.jpg")
LM_META = os.path.join(TEX_DIR, "ar_lightmap.json")
LM_RAW = os.path.join(TEX_DIR, "ar_lightmap_raw.exr")
NEAR_X, NEAR_Y, MAX_SPAN = (-48.0, 36.0), 30.0, 150.0
DYNAMIC_MATS = {"ar_water", "ar_water_fall", "ar_water_foam", "ar_lantern_glow", "ar_lamp_glass",
                "ar_window_glow", "ar_interior_warm", "ar_cloud", "ar_cloud_shade", "ar_pool_floor"}
SKIP_PREFIX = ("sky_", "mountains", "hillside", "far_ridge", "hill_", "ground_far", "landmark_",
               "aqueduct", "people_", "fountain_falls", "fountain_splash", "fountain_water")
PERCENTILE = 99.5
WELD = 0.0005             # metres
ISLAND_MARGIN = 0.0003     # smart_project's margin is not scale-free: 0.002 cut the fill from 69% to 8.5%;
                           # 0.0003 keeps 52% fill (measured), with the 6 px bake margin for bleed


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--size", type=int, default=4096)     # r2: 2048 left blotchy lintels and buttresses
    p.add_argument("--samples", type=int, default=64)
    # r2: a long bake is stopped at ~15 min on this machine, so it can run as N processes, each
    # baking every N-th object into the shared float atlas (ar_lightmap_raw.exr between parts).
    p.add_argument("--part", type=int, default=0)
    p.add_argument("--parts", type=int, default=1)
    return p.parse_args(argv)


def bake_set():
    out = []
    for o in bpy.data.collections[ARRIVAL].all_objects:
        if o.type != "MESH" or o.name.startswith(SKIP_PREFIX) or o.get("arrival_people"):
            continue
        if all(s.material is None or s.material.name in DYNAMIC_MATS for s in o.material_slots):
            continue
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        lo = [min(p[i] for p in pts) for i in range(2)]
        hi = [max(p[i] for p in pts) for i in range(2)]
        cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
        if NEAR_X[0] <= cx <= NEAR_X[1] and abs(cy) <= NEAR_Y and max(hi[0] - lo[0], hi[1] - lo[1]) < MAX_SPAN:
            out.append(o)
    return out


def unwrap(objs):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        me = o.data
        lm = me.uv_layers.get(LM_UV) or me.uv_layers.new(name=LM_UV)
        me.uv_layers.active = lm
        me.uv_layers[0].active_render = True     # albedo keeps TEXCOORD_0
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # The kit emits a fresh vertex ring per face (annulus sectors, cards, polys), so every face was
    # its own lightmap island and margins ate the atlas (first 2048 bake). Weld coincident vertices
    # first so coplanar runs (paving rings, walls) unwrap as large islands. UVs stay per-loop.
    bpy.ops.mesh.remove_doubles(threshold=WELD)
    # One smart project over all objects in multi-object edit mode packs every island into one atlas
    # at a shared texel density (77% fill measured). A later pack_islands collapsed it (0.01% fill).
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=ISLAND_MARGIN, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def lm_material(mat, img):
    """Static copy of mat that carries the bake target node (unconnected: never exported)."""
    name = mat.name + "_lm"
    copy = bpy.data.materials.get(name)
    if copy is None:
        copy = mat.copy()
        copy.name = name
    node = copy.node_tree.nodes.get("lightmap_target") or copy.node_tree.nodes.new("ShaderNodeTexImage")
    node.name = "lightmap_target"
    node.image = img
    copy.node_tree.nodes.active = node
    copy["lightmap"] = True
    return copy


def assign_materials(objs, img):
    for o in objs:
        o["lightmap"] = True
        for slot in o.material_slots:
            m = slot.material
            if m is None or m.name in DYNAMIC_MATS:
                continue
            base = bpy.data.materials.get(m.name[:-3]) if m.name.endswith("_lm") else m
            slot.material = lm_material(base, img)


def _atlas(size, fresh):
    img = bpy.data.images.get(LM_IMAGE)
    if img is not None:
        bpy.data.images.remove(img)
    if fresh:
        return bpy.data.images.new(LM_IMAGE, size, size, float_buffer=True, alpha=False)
    img = bpy.data.images.load(LM_RAW)
    img.name = LM_IMAGE
    assert tuple(img.size) == (size, size), "raw atlas size differs from --size"
    return img


def save_raw(img):
    img.filepath_raw = LM_RAW
    img.file_format = "OPEN_EXR"
    img.save()


def bake(objs, size, samples, subset=None, fresh=True):
    img = _atlas(size, fresh)
    assign_materials(objs, img)
    objs_all, objs = objs, (subset if subset is not None else objs)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    # r2: diffuse lighting needs few bounces; 12 default bounces made a 4096 bake run past 15 min.
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 1
    scene.cycles.transmission_bounces = 2
    scene.cycles.transparent_max_bounces = 4
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
    except (KeyError, TypeError, AttributeError):
        scene.cycles.device = "CPU"
    for o in bpy.data.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:   # dynamic materials on baked objects need an active image node or the bake aborts
        for slot in o.material_slots:
            m = slot.material
            if m is not None and m.name in DYNAMIC_MATS:
                n = m.node_tree.nodes.get("lightmap_dummy") or m.node_tree.nodes.new("ShaderNodeTexImage")
                n.name = "lightmap_dummy"
                n.image = _dummy()
                m.node_tree.nodes.active = n
    print("BAKE_START", size, samples, scene.cycles.device, len(objs), file=sys.stderr, flush=True)
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, uv_layer=LM_UV, margin=6,
                        margin_type="EXTEND", use_clear=fresh, target="IMAGE_TEXTURES")
    del objs_all
    return img


def _dummy():
    d = bpy.data.images.get("ar_lightmap_dummy") or bpy.data.images.new("ar_lightmap_dummy", 8, 8)
    return d


def _smooth(rgb):
    """r2 light denoise: a separable 5-tap binomial blur, normalised over baked (non-empty) texels
    so empty atlas space never darkens island edges (judges: blotchy casino lintel and pediment)."""
    mask = (rgb.sum(axis=2) > 1e-6).astype(np.float32)[..., None]
    k = np.array([1.0, 4.0, 6.0, 4.0, 1.0], dtype=np.float32) / 16.0

    def blur(a):
        for axis in (0, 1):
            a = sum(k[i] * np.roll(a, i - 2, axis=axis) for i in range(5))
        return a
    num, den = blur(rgb * mask), blur(mask)
    return np.where(mask > 0, num / np.maximum(den, 1e-6), rgb)


def encode(img):
    """Scale by the 99.5th percentile, sRGB-encode, save an 8-bit JPEG; return the scale."""
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    rgb = _smooth(px.reshape(h, w, 4)[..., :3])
    lum = rgb.mean(axis=2)
    lit = lum[lum > 1e-4]
    scale = float(np.percentile(lit, PERCENTILE)) if lit.size else 1.0
    lin = np.clip(rgb / scale, 0.0, 1.0)
    enc = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    out = bpy.data.images.new("ar_lightmap_srgb", w, h, alpha=False)
    out.colorspace_settings.name = "Non-Color"     # bytes are written as given (already sRGB)
    out.pixels.foreach_set(np.concatenate([enc, np.ones((h, w, 1))], axis=2).astype(np.float32).ravel())
    out.filepath_raw = LM_JPG
    out.file_format = "JPEG"
    bpy.context.scene.render.image_settings.quality = 90
    out.save()
    bpy.data.images.remove(out)
    return scale, float(lit.size) / lum.size


def main():
    args = parse_args()
    before = sha256(DISTRICT_BLEND)
    bpy.ops.wm.open_mainfile(filepath=SLICE_BLEND)
    hidden = {o.name: o.hide_render for o in bpy.data.objects}
    isolate()
    objs = bake_set()
    print("BAKE_OBJECTS", len(objs))
    unwrap(objs)          # deterministic: every part unwraps the same built file identically
    subset = sorted(objs, key=lambda o: o.name)[args.part::args.parts]
    img = bake(objs, args.size, args.samples, subset, fresh=args.part == 0)
    if args.part < args.parts - 1:
        save_raw(img)
        print("BAKE_PART_DONE", args.part, args.parts, len(subset), file=sys.stderr, flush=True)
        return 0
    scale, coverage = encode(img)
    if os.path.exists(LM_RAW):
        os.remove(LM_RAW)
    for m in bpy.data.materials:
        if m.get("lightmap"):
            m["lightmap_scale"] = round(scale, 5)
            m["lightmap_encoding"] = "srgb"
    bpy.data.images.remove(img)
    for o in bpy.data.objects:   # the render isolation must not reach the saved file
        o.hide_render = hidden.get(o.name, False)
    with open(LM_META, "w") as fh:
        json.dump({"image": os.path.basename(LM_JPG), "size": args.size, "samples": args.samples,
                   "parts": args.parts,
                   "scale": round(scale, 5), "encoding": "srgb", "coverage": round(coverage, 3),
                   "objects": sorted(o.name for o in objs)}, fh, indent=2)
        fh.write("\n")
    bpy.ops.wm.save_as_mainfile(filepath=SLICE_BLEND)
    after = sha256(DISTRICT_BLEND)
    print("LIGHTMAP", LM_JPG, "scale", round(scale, 4), "coverage", round(coverage, 3))
    print("DISTRICT_SHA256", before, after)
    assert before == after, "district file changed"
    return 0


if __name__ == "__main__":
    sys.exit(main())
