"""Export the K1 character kit to app/public/kits/k1/ (GLB without Draco + manifest.json).

Run (headless, from the repository root):
    blender --background blender/scenes/nervix_characters_01.blend --python blender/scripts/k1_export.py

One GLB holds the rig, every part as a skinned mesh, the anchors and the four clips. The runtime
shows the base part plus the parts a preset lists, and recolours the k1_<slot> materials from the
preset palette. The .blend is not saved.
"""

import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from k1_anim import CLIPS  # noqa: E402
from k1_common import (COLLECTION, FPS, GLB_NAME, HEIGHT, KIT_DIR, MAX_GLB_BYTES, MAX_TRIS,  # noqa: E402
                       PARTS, RIG, SLOTS, material_name, part_node, presets)
from k1_rig import ANCHORS, BONES, anchor_node  # noqa: E402


def part_triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def export_glb(path):
    coll = bpy.data.collections[COLLECTION]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in coll.objects:
        obj.hide_set(False)
        obj.hide_render = False
        obj.select_set(True)
    rig = bpy.data.objects[RIG]
    rig.rotation_euler = (0, 0, 0)
    rig.animation_data.action = bpy.data.actions["idle"]
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_range=False,
        export_draco_mesh_compression_enable=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )


def manifest(tris):
    parts = [{"id": pid, "node": part_node(pid), "category": cat, "description": desc,
              "triangles": tris[pid]} for pid, cat, desc in PARTS]
    anchors = [{"name": n, "node": anchor_node(n), "bone": bone,
                "rest_position_m": [pos[0], pos[2], -pos[1]]} for n, (bone, pos) in ANCHORS.items()]
    clips = [{"name": n, "duration_s": d, "loop": True, "speed_mps": s, "root_motion": False}
             for n, (d, s) in CLIPS.items()]
    return {
        "kit": "k1",
        "category": "character",
        "version": 1,
        "description": "Stylised low-poly pedestrian (A01 / A13-A15 style), rigged, generic and identity-free.",
        "glb": GLB_NAME,
        "draco": False,
        "units": "metres",
        "up": "+Y",
        "forward": "+Z",
        "height_m": HEIGHT,
        "fps": FPS,
        "triangle_budget": MAX_TRIS,
        "skeleton": {"rig_node": RIG, "joints": list(BONES)},
        "material_slots": {slot: material_name(slot) for slot in SLOTS},
        "categories": {
            "base": "always shown",
            "garment": "exactly one per preset",
            "hair": "exactly one per preset",
            "accessory": "zero or more per preset",
        },
        "parts": parts,
        "anchors": anchors,
        "clips": clips,
        "presets": presets(),
        "contract": "shared/contracts/avatar-presets.json",
        "source": {"blend": "blender/scenes/nervix_characters_01.blend",
                   "build": "blender/scripts/k1_build.py", "export": "blender/scripts/k1_export.py"},
    }


def main():
    os.makedirs(KIT_DIR, exist_ok=True)
    path = os.path.join(KIT_DIR, GLB_NAME)
    export_glb(path)
    size = os.path.getsize(path)
    if size >= MAX_GLB_BYTES:
        raise SystemExit(f"K1 GLB too large: {size} bytes")
    tris = {pid: part_triangles(bpy.data.objects[part_node(pid)]) for pid, _, _ in PARTS}
    with open(os.path.join(KIT_DIR, "manifest.json"), "w", encoding="utf8") as fh:
        json.dump(manifest(tris), fh, indent=2)
        fh.write("\n")
    print(f"K1 exported {path} ({size} bytes, {sum(tris.values())} tris)")


if __name__ == "__main__":
    main()
