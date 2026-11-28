"""Export the K2 house kit: one GLB per house variant (no Draco) plus manifest.json.

Run:
    blender --background blender/scenes/nervix_house_kit_01.blend \
        --python blender/scripts/k2_export_house_kit.py

Each house root is moved to the origin and its children lose the "<house_id>/" prefix just for the
export, then everything is restored; the .blend is never saved by this script.
Writes app/public/kits/k2/<house_id>.glb and app/public/kits/k2/manifest.json.
"""

import json
import os
import struct
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from k2_spec import build_manifest, house_id, variants  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "app", "public", "kits", "k2")
MAX_BYTES = 5 * 1024 * 1024


def glb_stats(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67 and version == 2, path
    jlen, _ = struct.unpack_from("<II", data, 12)
    gltf = json.loads(data[20:20 + jlen])
    tris = 0
    for node in gltf.get("nodes", []):
        if "mesh" not in node:
            continue
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            acc = gltf["accessors"][prim["indices"] if "indices" in prim else prim["attributes"]["POSITION"]]
            tris += acc["count"] // 3
    return {"triangles": tris, "bytes": len(data)}


def export_house(hid):
    root = bpy.data.objects[hid]
    kids = list(root.children_recursive)
    saved_loc = root.location.copy()
    renamed = []
    try:
        root.location = (0.0, 0.0, 0.0)
        for o in kids:
            old = o.name
            o.name = old.split("/", 1)[1]
            renamed.append((o, old))
        bpy.context.view_layer.update()
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        for o in [root, *kids]:
            o.select_set(True)
        bpy.context.view_layer.objects.active = root
        path = os.path.join(OUT_DIR, hid + ".glb")
        bpy.ops.export_scene.gltf(
            filepath=path, export_format="GLB", use_selection=True, export_extras=True, export_yup=True,
            export_apply=True, export_draco_mesh_compression_enable=False, export_cameras=False,
            export_lights=False, export_animations=False, export_image_format="AUTO")
    finally:
        for o, old in renamed:
            o.name = old
        root.location = saved_loc
    stats = glb_stats(path)
    assert stats["bytes"] < MAX_BYTES, (hid, stats)
    return stats


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    extra = {}
    for size, facade in variants():
        hid = house_id(size, facade)
        extra[hid] = export_house(hid)
        print(f"K2 exported {hid}: {extra[hid]}")
    with open(os.path.join(OUT_DIR, "manifest.json"), "w") as fh:
        json.dump(build_manifest(extra), fh, indent=2)
        fh.write("\n")
    print("K2 manifest written")


if __name__ == "__main__":
    main()
