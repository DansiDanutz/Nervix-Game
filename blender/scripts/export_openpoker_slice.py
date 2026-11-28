"""Export ONLY the two OpenPoker collections to GLB and write exports/slice/manifest.json.

Run:
    blender --background blender/scenes/nervix_city_slice_01.blend \
        --python blender/scripts/export_openpoker_slice.py

Outputs (exports/slice/):
    nervix_openpoker_facade.glb   authored in district coordinates (D)
    nervix_openpoker_salon.glb    authored around the salon origin (salon-local)
    manifest.json                 schema_version 1, markers, placement, collision, convention

Convention: Blender Z-up (bx, by, bz) exports as glTF Y-up runtime (bx, bz, -by). The salon
is placed in the district at SALON_PLACE (Blender), i.e. runtime SALON_PLACE_RUNTIME.
"""

import json
import os
import shutil
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from openpoker_common import (  # noqa: E402
    APP_SLICE_DIR, EXPORT_DIR, FACADE, FACADE_OFFSET, MANAGED, SALON, SALON_PLACE, SLICE_BLEND,
    runtime_of,
)
from openpoker_facade import THRESHOLD_LOCAL  # noqa: E402
from openpoker_salon import SALON_ENTRANCE_LOCAL, WALK_BOUNDS, solid_obstacles  # noqa: E402

SCHEMA_VERSION = 1
DISTRICT = "nervix_city_district_01"
EXPORT_SETTINGS = dict(export_format="GLB", use_selection=True, export_apply=False,
                       export_yup=True, export_extras=True, export_cameras=False,
                       export_lights=False, export_animations=False)


def export_collection(coll, path):
    bpy.ops.object.select_all(action="DESELECT")
    objs = list(coll.objects)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, **EXPORT_SETTINGS)
    bpy.ops.object.select_all(action="DESELECT")
    return os.path.getsize(path)


def marker_entry(o, frame):
    local = tuple(o.matrix_world.translation)
    district = tuple(local) if frame == "district" else tuple(
        local[i] + SALON_PLACE[i] for i in range(3))
    return {
        "id": o.get("nervix_asset_id"),
        "kind": o.get("nervix_marker_kind"),
        "slot": o.get("nervix_slot"),
        "asset": FACADE if frame == "district" else SALON,
        "position_blender_asset": [round(v, 4) for v in local],
        "position_runtime_asset": runtime_of(local),
        "position_blender_district": [round(v, 4) for v in district],
        "position_runtime_district": runtime_of(district),
    }


def facade_markers(coll):
    out = []
    for o in coll.objects:
        if o.get("nervix_marker_kind"):
            out.append(marker_entry(o, "district"))
    return out


def salon_markers(coll):
    return [marker_entry(o, "salon") for o in coll.objects if o.get("nervix_marker_kind")]


def collision_entries():
    """Salon-local AABBs in Blender (x, y) plus runtime (x, z = -y) in the salon and district frames."""
    out = []
    for name, (x0, x1, y0, y1) in sorted(solid_obstacles().items()):
        out.append({
            "id": name,
            "blender_asset": {"x": [x0, x1], "y": [y0, y1]},
            "runtime_asset": {"x": [x0, x1], "z": [round(-y1, 3), round(-y0, 3)]},
            "runtime_district": {"x": [x0, x1],
                                 "z": [round(-(y1 + SALON_PLACE[1]), 3), round(-(y0 + SALON_PLACE[1]), 3)]},
        })
    return out


def build_manifest(facade_bytes, salon_bytes, facade_coll, salon_coll):
    threshold_district = tuple(THRESHOLD_LOCAL[i] + FACADE_OFFSET[i] for i in range(3))
    return {
        "schema_version": SCHEMA_VERSION,
        "district": DISTRICT,
        "slice": "openpoker",
        "convention": {
            "blender_to_runtime": "runtime = (bx, bz, -by); Blender Z-up, glTF Y-up (export_yup=True)",
            "units": "metres",
            "runtime_forward": "-Z (Blender +Y)",
            "runtime_right": "+X",
            "runtime_up": "+Y (Blender +Z)",
            "salon_frame": "salon GLB is authored around its own origin; place it at salon_placement",
        },
        "assets": [
            {
                "id": FACADE, "file": f"{FACADE}.glb", "bytes": facade_bytes,
                "frame": "district", "placement_runtime": [0.0, 0.0, 0.0],
            },
            {
                "id": SALON, "file": f"{SALON}.glb", "bytes": salon_bytes,
                "frame": "salon_local",
                "placement_blender": list(SALON_PLACE),
                "placement_runtime": runtime_of(SALON_PLACE),
            },
        ],
        "facade": {
            "door_threshold": {
                "blender_district": [round(v, 4) for v in threshold_district],
                "runtime_district": runtime_of(threshold_district),
                "runtime_xz": [round(runtime_of(threshold_district)[0], 4),
                               round(runtime_of(threshold_district)[2], 4)],
                "floor_height_runtime_y": round(threshold_district[2], 4),
            },
            "facing": {
                "blender_outward": [0.0, -1.0, 0.0],
                "runtime_outward": [0.0, 0.0, 1.0],
                "note": "outward = toward the plaza; the player enters moving along runtime -Z",
            },
            "markers": facade_markers(facade_coll),
        },
        "salon": {
            "entrance_local": list(SALON_ENTRANCE_LOCAL),
            "entrance_runtime_local": runtime_of(SALON_ENTRANCE_LOCAL),
            "entrance_runtime_district": runtime_of(
                tuple(SALON_ENTRANCE_LOCAL[i] + SALON_PLACE[i] for i in range(3))),
            "walkable_note": "walkable x/z in runtime; WALK_BOUNDS z is Blender y (runtime z = -y)",
            "walkable_local_runtime": {
                "x": [WALK_BOUNDS["x_min"], WALK_BOUNDS["x_max"]],
                "z": [-WALK_BOUNDS["z_max"], -WALK_BOUNDS["z_min"]],
            },
            "walkable_runtime_district": {
                "x": [WALK_BOUNDS["x_min"], WALK_BOUNDS["x_max"]],
                "z": [round(-WALK_BOUNDS["z_max"] - SALON_PLACE[1], 3),
                      round(-WALK_BOUNDS["z_min"] - SALON_PLACE[1], 3)],
            },
            "collision": collision_entries(),
            "markers": salon_markers(salon_coll),
        },
    }


def runtime_layout(manifest):
    """Flat runtime contract read by app/src/scene/slice.ts.

    facade_door is in the district frame; everything under salon is in the
    salon GLB's own runtime frame (the game renders the salon as its own room).
    yaw follows the game rig: camera on +z at yaw 0, so a door facing runtime
    +z (outward) has yaw 0 for a player standing in front of it.
    """
    by_id = {m["id"]: m for m in manifest["salon"]["markers"]}

    def local(marker_id):
        p = by_id[marker_id]["position_runtime_asset"]
        return {"x": round(p[0], 3), "z": round(p[2], 3)}

    door = manifest["facade"]["door_threshold"]["runtime_xz"]
    walk = manifest["salon"]["walkable_local_runtime"]
    return {
        "facade_door": {"x": door[0], "z": door[1], "yaw": 0.0},
        "salon": {
            "spawn": {**local("openpoker_salon_spawn"), "yaw": 0.0},
            "exit": local("openpoker_salon_exit"),
            "dangg_door": local("openpoker_dangg_door"),
            "bounds": {"minX": walk["x"][0], "maxX": walk["x"][1], "minZ": walk["z"][0], "maxZ": walk["z"][1]},
            "obstacles": [
                {"minX": c["runtime_asset"]["x"][0], "maxX": c["runtime_asset"]["x"][1],
                 "minZ": c["runtime_asset"]["z"][0], "maxZ": c["runtime_asset"]["z"][1]}
                for c in manifest["salon"]["collision"]
                if "stair" not in c["id"]  # the gallery stair is walkable as steps
            ],
        },
    }


def main():
    bpy.ops.wm.open_mainfile(filepath=SLICE_BLEND)
    os.makedirs(EXPORT_DIR, exist_ok=True)
    root = bpy.data.collections[MANAGED]
    facade_coll = root.children[FACADE]
    salon_coll = root.children[SALON]
    fpath = os.path.join(EXPORT_DIR, f"{FACADE}.glb")
    spath = os.path.join(EXPORT_DIR, f"{SALON}.glb")
    fbytes = export_collection(facade_coll, fpath)
    sbytes = export_collection(salon_coll, spath)
    manifest = build_manifest(fbytes, sbytes, facade_coll, salon_coll)
    manifest["runtime_layout"] = runtime_layout(manifest)
    mpath = os.path.join(EXPORT_DIR, "manifest.json")
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    os.makedirs(APP_SLICE_DIR, exist_ok=True)
    for src in (fpath, spath, mpath):
        shutil.copy2(src, os.path.join(APP_SLICE_DIR, os.path.basename(src)))
    print("EXPORT", json.dumps({"facade_glb_bytes": fbytes, "salon_glb_bytes": sbytes,
                                 "total_glb_bytes": fbytes + sbytes,
                                 "manifest": mpath, "copied_to": APP_SLICE_DIR}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
