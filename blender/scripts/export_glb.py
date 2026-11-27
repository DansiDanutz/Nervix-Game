"""Export the managed Nervix World collections to glTF 2.0 (GLB) plus a manifest.

Run:
    blender --background blender/scenes/nervix_city_district_01.blend \
            --python blender/scripts/export_glb.py -- \
            --outdir ../../exports --district nervix_city_district_01

Writes one GLB per top-level child of the managed collection and a
schema-versioned manifest.json describing stable IDs, slots and markers.

Only the managed collection is exported. Hand-edited objects outside it are
left untouched. Existing exports are overwritten predictably; no duplicates.
"""

import argparse
import json
import os
import sys

import bpy

MANAGED = "NERVIX_MANAGED"
SCHEMA_VERSION = 1


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--outdir", default="exports")
    p.add_argument("--district", default="nervix_city_district_01")
    return p.parse_args(argv)


def asset_id(obj):
    return obj.get("nervix_asset_id") or obj.name


def marker_record(obj):
    return {
        "id": asset_id(obj),
        "kind": obj.get("nervix_marker_kind"),
        "slot": obj.get("nervix_slot"),
        "position": [round(v, 4) for v in obj.matrix_world.translation],
    }


def main():
    args = parse_args()
    outdir = os.path.abspath(args.outdir)
    os.makedirs(outdir, exist_ok=True)

    managed = bpy.data.collections.get(MANAGED)
    if managed is None:
        print(f"NERVIX_EXPORT_ERROR missing collection {MANAGED}")
        return 1

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "district": args.district,
        "assets": [],
        "markers": [],
    }

    for child in managed.children:
        filename = f"{asset_id(child)}.glb"
        path = os.path.join(outdir, filename)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in child.all_objects:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=False,
            export_yup=True,
        )
        manifest["assets"].append({
            "id": asset_id(child),
            "file": filename,
            "bytes": os.path.getsize(path),
        })
        manifest["markers"].extend(
            marker_record(o) for o in child.all_objects if o.get("nervix_marker_kind")
        )

    manifest_path = os.path.join(outdir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)

    print("NERVIX_EXPORT " + json.dumps(
        {"assets": len(manifest["assets"]), "markers": len(manifest["markers"]),
         "manifest": manifest_path}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())