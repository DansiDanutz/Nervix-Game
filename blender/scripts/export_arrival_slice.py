"""Export the A01 arrival square (collection ARRIVAL) and merge runtime_layout.plaza into the
slice manifests.

Run (headless, from the repository root):
    blender --background blender/scenes/nervix_city_slice_01.blend \
        --python blender/scripts/export_arrival_slice.py

Writes app/public/slice/nervix_arrival_square.glb (+ copy in exports/slice/), no Draco.
Every runtime anchor is computed from named Blender objects:
  fountain        <- fountain_basin (radius) and fountain_tiers (top_y), centred on their bbox
  obstacles       <- objects tagged arrival_obstacle: AABB per connected part in the walkable
                     height band, overlapping parts merged
  obstacle top_y  <- highest point (runtime y) of the merged parts, so the camera can ignore low ones
  test_builder_door <- empty arrival_test_builder_door (+ its outward direction)
  plots           <- runtime_layout.plots[]: the plot_<district>_<n> door empties (arrival_plots.py)
  spawn           <- empty arrival_spawn
  lighting        <- arrival_sun and the ArrivalWorld constants used for the Blender render
The district .blend is never opened; the slice file is not saved.
Pass `-- --manifest-only` to merge the manifests without re-exporting the GLB (geometry unchanged):
the shipped plaza fields are kept as they are, obstacles gain top_y from the shipped GLB, and the
plots are read from the open scene.
"""

import json
import math
import os
import shutil
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from arrival_bake import LM_JPG, LM_META  # noqa: E402
from arrival_glb_lightmap import inject  # noqa: E402
from arrival_obstacle_top import with_top_y  # noqa: E402
from arrival_plots import read_plots, validate_plots  # noqa: E402
from arrival_skyline import SKY_LIGHT_STRENGTH  # noqa: E402
from build_arrival_slice import ARRIVAL, EXPOSURE, SUN, sha256  # noqa: E402
from openpoker_common import APP_SLICE_DIR, DISTRICT_BLEND, EXPORT_DIR, ROOT  # noqa: E402

CONTRACT = os.path.join(ROOT, "shared", "contracts", "house-plots.json")

GLB = "nervix_arrival_square.glb"
MAX_BYTES = 20 * 1024 * 1024     # fidelity r1 budget: GLB incl. the embedded lightmap atlas
MAX_TRIS = 350_000
SPAWN_YAW = math.pi / 2           # facing -x (runtime), toward the fountain
BOUNDS_BLENDER = (-42.0, 34.0, -13.0, 13.0)   # x0, x1, y0, y1: square, east street, back street
WALK_BAND = (0.25, 1.8)           # parts entirely below/above this height do not block walking
MERGE_GAP = 0.05
REQUIRED_CHUNKS = ["nervix_plaza", "nervix_street", "nervix_merchanthouse", "nervix_cafe", "nervix_props",
                   "nervix_cafeinterior", "nervix_npcs"]
DISTRICT_CHUNK_COLLECTIONS = {"Plaza": "nervix_plaza", "Street": "nervix_street",
                              "MerchantHouse": "nervix_merchanthouse", "Cafe": "nervix_cafe",
                              "Casino": "nervix_casino", "CafeInterior": "nervix_cafeinterior",
                              "NPCs": "nervix_npcs", "Props": "nervix_props"}
# Lighting for three.js, matched to the Blender render (ArrivalWorld + arrival_sun).
# hemi_sky is the cool lavender bounce of the Blender sky's upper half; the gradient stops are the
# ArrivalWorld ramp (horizon peach, mid rose-lavender, zenith soft blue) for a client sky dome.
LIGHTING_COLOURS = {"background": "#f6c4a0", "fog": "#efc3a3", "hemi_sky": "#cfc4d8", "hemi_ground": "#a8775c"}
SKY_GRADIENT = {"horizon": "#ffcda0", "mid": "#ddc8d8", "zenith": "#8db7e8"}   # ArrivalWorld stops (fid r1)
FILL = {"color": "#b9c2e0", "intensity": 0.35}   # low cool fill standing in for Blender's sky bounce
FOG_NEAR, FOG_FAR = 70.0, 460.0
SUN_DISTANCE = 60.0
SUN_RUNTIME_SCALE = 0.45          # Blender sun W/m^2 -> three.js directional intensity
HEMI_RUNTIME_SCALE = 1.2


def runtime_xz(p):
    return round(p[0], 3) + 0.0, round(-p[1], 3) + 0.0   # + 0.0: no "-0.0" in the JSON


def hex_of(rgb):
    return "#" + "".join(f"{max(0, min(255, round(c * 255))):02x}" for c in rgb)


def arrival_meshes():
    return [o for o in bpy.data.collections[ARRIVAL].all_objects if o.type == "MESH"]


# ---- geometry facts ---------------------------------------------------------------------
def world_bbox(o, depsgraph):
    ev = o.evaluated_get(depsgraph)
    pts = [ev.matrix_world @ v.co for v in ev.data.vertices]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]


def fountain(depsgraph):
    basin = bpy.data.objects["fountain_basin"]
    lo, hi = world_bbox(basin, depsgraph)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    ev = basin.evaluated_get(depsgraph)   # octagonal basin: the circle must reach its corners
    radius = max(math.hypot((ev.matrix_world @ v.co).x - cx, (ev.matrix_world @ v.co).y - cy)
                 for v in ev.data.vertices)
    top = world_bbox(bpy.data.objects["fountain_tiers"], depsgraph)[1][2]
    x, z = runtime_xz((cx, cy))
    return {"x": x, "z": z, "radius": round(radius, 3), "top_y": round(top, 3)}


def _parts(o, depsgraph):
    """World-space AABBs (x0, x1, y0, y1, z0, z1) of each connected part of an evaluated mesh."""
    ev = o.evaluated_get(depsgraph)
    me = ev.data
    parent = list(range(len(me.vertices)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for e in me.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            parent[a] = b
    boxes = {}
    mw = ev.matrix_world
    for v in me.vertices:
        p = mw @ v.co
        r = find(v.index)
        b = boxes.get(r)
        boxes[r] = [p.x, p.x, p.y, p.y, p.z, p.z] if b is None else [
            min(b[0], p.x), max(b[1], p.x), min(b[2], p.y), max(b[3], p.y), min(b[4], p.z), max(b[5], p.z)]
    return list(boxes.values())


def _overlap(a, b, gap):
    return a[0] <= b[1] + gap and b[0] <= a[1] + gap and a[2] <= b[3] + gap and b[2] <= a[3] + gap


def _merge(boxes, gap):
    """Merge parts overlapping in plan into (x0, x1, y0, y1, top) boxes; top is the highest z."""
    boxes = [b[:4] + [b[5]] for b in boxes]
    changed = True
    while changed:
        changed = False
        out = []
        for b in boxes:
            for i, o in enumerate(out):
                if _overlap(o, b, gap):
                    out[i] = [min(o[0], b[0]), max(o[1], b[1]), min(o[2], b[2]), max(o[3], b[3]), max(o[4], b[4])]
                    changed = True
                    break
            else:
                out.append(b)
        boxes = out
    return boxes


def obstacles(depsgraph, meshes=None):
    """Merge per object (so a wall and the chair next to it stay separate), then convert.
    `meshes` defaults to the ARRIVAL meshes of the open scene."""
    x0, x1, y0, y1 = BOUNDS_BLENDER
    result = []
    for o in arrival_meshes() if meshes is None else meshes:
        if not o.get("arrival_obstacle"):
            continue
        parts = [b for b in _parts(o, depsgraph) if b[5] > WALK_BAND[0] and b[4] < WALK_BAND[1]]
        for b in _merge(parts, MERGE_GAP):
            if b[1] < x0 or b[0] > x1 or b[3] < y0 or b[2] > y1:
                continue
            result.append({"minX": round(b[0], 2), "maxX": round(b[1], 2),
                           "minZ": round(-b[3], 2), "maxZ": round(-b[2], 2), "top_y": round(b[4], 2)})
    result.sort(key=lambda r: (r["minX"], r["minZ"]))
    return result


def shipped_obstacles(path):
    """Obstacles of the GLB the client actually draws: import it in memory (node extras carry
    arrival_obstacle), run the same AABB pass, then remove what was imported."""
    known = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    imported = [o for o in bpy.data.objects if o not in known]
    try:
        bpy.context.view_layer.update()
        return obstacles(bpy.context.evaluated_depsgraph_get(), [o for o in imported if o.type == "MESH"])
    finally:
        for o in imported:
            bpy.data.objects.remove(o, do_unlink=True)


def shipped_plaza():
    """--manifest-only: keep every shipped plaza field; obstacles gain top_y from the shipped GLB."""
    with open(os.path.join(APP_SLICE_DIR, "manifest.json")) as fh:
        plaza = json.load(fh)["runtime_layout"]["plaza"]
    bare = [{k: v for k, v in b.items() if k != "top_y"} for b in plaza["obstacles"]]
    return {**plaza, "obstacles": with_top_y(bare, shipped_obstacles(os.path.join(APP_SLICE_DIR, GLB)))}


def replaces_chunks():
    """District chunks whose geometry overlaps the arrival bounds, plus the required list."""
    x0, x1, y0, y1 = BOUNDS_BLENDER
    found = set(REQUIRED_CHUNKS)
    report = {}
    for cname, chunk in DISTRICT_CHUNK_COLLECTIONS.items():
        c = bpy.data.collections.get(cname)
        if c is None:
            report[chunk] = "collection missing in slice file"
            continue
        pts = [o.matrix_world @ Vector(v) for o in c.all_objects if o.type == "MESH" for v in o.bound_box]
        if not pts:
            report[chunk] = "no meshes"
            continue
        lo = [min(p[i] for p in pts) for i in range(2)]
        hi = [max(p[i] for p in pts) for i in range(2)]
        hit = lo[0] <= x1 and hi[0] >= x0 and lo[1] <= y1 and hi[1] >= y0
        report[chunk] = f"bbox x {lo[0]:.1f}..{hi[0]:.1f} y {lo[1]:.1f}..{hi[1]:.1f} overlap={hit}"
        if hit and chunk != "nervix_casino":   # the client already hides the casino chunk
            found.add(chunk)
    for k, v in sorted(report.items()):
        print("CHUNK", k, v)
    return sorted(found)


def lighting():
    sun = bpy.data.objects[SUN]
    pos = sun.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0)) * SUN_DISTANCE   # towards the sun
    return {
        "background": LIGHTING_COLOURS["background"],
        "fog": {"color": LIGHTING_COLOURS["fog"], "near": FOG_NEAR, "far": FOG_FAR},
        "sun": {"position": [round(pos.x, 2), round(pos.z, 2), round(-pos.y, 2)],
                "color": hex_of(sun.data.color),
                "intensity": round(sun.data.energy * SUN_RUNTIME_SCALE, 2)},
        "hemisphere": {"sky": LIGHTING_COLOURS["hemi_sky"], "ground": LIGHTING_COLOURS["hemi_ground"],
                       "intensity": round(SKY_LIGHT_STRENGTH * HEMI_RUNTIME_SCALE, 2)},
        "sky_gradient": dict(SKY_GRADIENT),
        "fill": dict(FILL),
        # The bake and the Blender renders are graded under AgX with this exposure (stops -> linear).
        "view": {"tone_mapping": "agx", "exposure": round(2.0 ** EXPOSURE, 4)},
    }


def door_anchor():
    d = bpy.data.objects["arrival_test_builder_door"]
    ox, oy, _ = d["outward_blender"]
    rx, rz = ox, -oy                    # outward (away from the door) in the runtime frame
    x, z = runtime_xz(d.matrix_world.translation)
    return {"x": x, "z": z, "yaw": round(math.atan2(rx, rz), 6)}


def spawn_anchor():
    x, z = runtime_xz(bpy.data.objects["arrival_spawn"].matrix_world.translation)
    return {"x": x, "z": z, "yaw": round(SPAWN_YAW, 6)}


# ---- export ------------------------------------------------------------------------------
def export_glb(path):
    for o in bpy.data.objects:
        o.select_set(False)
    objs = arrival_meshes()
    for o in objs:
        o.hide_set(False)
        o.hide_viewport = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_extras=True, export_cameras=False, export_lights=False,
                              export_animations=False, export_draco_mesh_compression_enable=False,
                              export_image_format="JPEG")
    return os.path.getsize(path)


def triangles(depsgraph):
    total = 0
    for o in arrival_meshes():
        me = o.evaluated_get(depsgraph).data
        total += sum(len(p.vertices) - 2 for p in me.polygons)
    return total


def merge_manifest(path, plaza, plots, asset):
    with open(path) as fh:
        manifest = json.load(fh)
    layout = manifest.setdefault("runtime_layout", {})
    layout["plaza"] = {**layout.get("plaza", {}), **plaza}          # merge: never drop other fields
    layout["plots"] = plots
    if asset is not None:
        _merge_asset(manifest, asset)
    with open(path, "w") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")


def _merge_asset(manifest, asset):
    old = next((a for a in manifest.get("assets", []) if a.get("id") == asset["id"]), {})
    assets = [a for a in manifest.get("assets", []) if a.get("id") != asset["id"]]
    manifest["assets"] = assets + [{**old, **asset}]


def check_plots(plots, plaza):
    with open(CONTRACT) as fh:
        contract_ids = [p["id"] for p in json.load(fh)["plots"]]
    errors = validate_plots(plots, plaza["obstacles"], plaza["bounds"], plaza["spawn"], plaza["fountain"],
                            contract_ids)
    assert not errors, "invalid plots: " + "; ".join(errors)


def check(plaza):
    b = plaza["bounds"]
    s = plaza["spawn"]
    assert b["minX"] <= s["x"] <= b["maxX"] and b["minZ"] <= s["z"] <= b["maxZ"], "spawn outside bounds"
    for o in plaza["obstacles"]:
        assert not (o["minX"] <= s["x"] <= o["maxX"] and o["minZ"] <= s["z"] <= o["maxZ"]), f"spawn in {o}"
    d = plaza["test_builder_door"]
    for o in plaza["obstacles"]:
        assert not (o["minX"] <= d["x"] <= o["maxX"] and o["minZ"] <= d["z"] <= o["maxZ"]), f"door in {o}"
    f = plaza["fountain"]
    assert abs(f["x"]) < 0.05 and abs(f["z"]) < 0.05, "fountain not at the origin"
    fog = plaza["lighting"]["fog"]
    assert 0 <= fog["near"] < fog["far"]


def export_asset(depsgraph):
    """Export the GLB (+ baked lightmap) and return its manifest asset entry."""
    tris = triangles(depsgraph)
    app_glb = os.path.join(APP_SLICE_DIR, GLB)
    size = export_glb(app_glb)
    lightmap = None
    if os.path.exists(LM_META) and os.path.exists(LM_JPG):
        with open(LM_META) as fh:
            meta = json.load(fh)
        info = inject(app_glb, LM_JPG, meta["scale"])
        size = info["bytes"]
        lightmap = {"mode": "lightmap", "texcoord": 1, "texture": info["texture"], "scale": meta["scale"],
                    "encoding": meta["encoding"], "size": meta["size"], "samples": meta["samples"],
                    "materials": info["materials"], "primitives": info["primitives"],
                    "semantics": "final = albedo * srgb_decode(texel) * scale; occlusionTexture carries the same "
                                 "atlas for clients without lightmap support"}
        print("LIGHTMAP_INJECTED", json.dumps(info))
    os.makedirs(EXPORT_DIR, exist_ok=True)
    shutil.copyfile(app_glb, os.path.join(EXPORT_DIR, GLB))
    assert size < MAX_BYTES, f"GLB too large: {size}"
    assert tris < MAX_TRIS, f"too many triangles: {tris}"
    print("ARRIVAL_EXPORT", os.path.relpath(app_glb, ROOT), "bytes", size, "tris", tris)
    asset = {"id": "nervix_arrival_square", "file": GLB, "bytes": size, "triangles": tris, "frame": "district",
             "placement_runtime": [0.0, 0.0, 0.0], "draco": False}
    return asset if lightmap is None else {**asset, "baked_lighting": lightmap}


def live_plaza(depsgraph):
    x0, x1, y0, y1 = BOUNDS_BLENDER
    return {
        "glb": GLB,
        "spawn": spawn_anchor(),
        "fountain": fountain(depsgraph),
        "bounds": {"minX": x0, "maxX": x1, "minZ": -y1, "maxZ": -y0},
        "obstacles": obstacles(depsgraph),
        "test_builder_door": door_anchor(),
        "replaces_chunks": replaces_chunks(),
        "lighting": lighting(),
    }


def main():
    manifest_only = "--manifest-only" in sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else False
    before = sha256(DISTRICT_BLEND)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    plaza = shipped_plaza() if manifest_only else live_plaza(depsgraph)
    check(plaza)
    plots = read_plots(bpy.data.collections[ARRIVAL])
    check_plots(plots, plaza)
    live = obstacles(bpy.context.evaluated_depsgraph_get())
    check_plots(plots, {**plaza, "obstacles": live})   # also clear of the scene props not exported yet
    asset = None if manifest_only else export_asset(depsgraph)
    for d in (APP_SLICE_DIR, EXPORT_DIR):
        merge_manifest(os.path.join(d, "manifest.json"), plaza, plots, asset)
    assert sha256(DISTRICT_BLEND) == before, "district file changed"
    print("ARRIVAL_MANIFEST", "glb_exported", asset is not None, "obstacles", len(plaza["obstacles"]),
          "plots", [p["id"] for p in plots])
    print("PLAZA_JSON", json.dumps(plaza))
    print("PLOTS_JSON", json.dumps(plots))
    return 0


if __name__ == "__main__":
    sys.exit(main())
