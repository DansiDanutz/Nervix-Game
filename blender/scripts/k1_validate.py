"""Validate the K1 character kit. Prints one CHECK line per rule and a final verdict.

Run (headless, from the repository root):
    blender --background blender/scenes/nervix_characters_01.blend --python blender/scripts/k1_validate.py

Exit code 0 only when every check passes. The .blend is not saved.
"""

import hashlib
import json
import os
import struct
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from k1_anim import CLIPS, frame_count  # noqa: E402
from k1_common import (COLLECTION, DISTRICT_BLEND, DISTRICT_SHA256, GLB_NAME, HEIGHT, KIT_DIR,  # noqa: E402
                       MAX_GLB_BYTES, MAX_TRIS, PARTS, RIG, SLOTS, material_name, part_node, presets)
from k1_rig import ANCHORS, BONES, anchor_node  # noqa: E402

HEIGHT_TOLERANCE = 0.05
FAILURES = []


def check(name, ok, detail=""):
    print(f"CHECK {name}: {'PASS' if ok else 'FAIL'} {detail}".rstrip())
    if not ok:
        FAILURES.append(name)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def glb_json(path):
    with open(path, "rb") as fh:
        data = fh.read()
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length])


def evaluated_z_range(objects):
    deps = bpy.context.evaluated_depsgraph_get()
    lo, hi = float("inf"), float("-inf")
    for obj in objects:
        ev = obj.evaluated_get(deps)
        mesh = ev.to_mesh()
        for v in mesh.vertices:
            z = (ev.matrix_world @ v.co).z
            lo, hi = min(lo, z), max(hi, z)
        ev.to_mesh_clear()
    return lo, hi


def check_scene():
    coll = bpy.data.collections.get(COLLECTION)
    check("collection", coll is not None)
    rig = bpy.data.objects.get(RIG)
    check("rig", rig is not None and rig.type == "ARMATURE")
    check("bones", set(BONES) == {b.name for b in rig.data.bones}, f"{len(rig.data.bones)} bones")
    dupes = [o.name for o in bpy.data.objects if o.name.startswith("k1_") and "." in o.name]
    check("idempotent (no duplicate k1_ objects)", not dupes, ",".join(dupes))
    for pid, _, _ in PARTS:
        obj = bpy.data.objects.get(part_node(pid))
        ok = obj is not None and any(m.type == "ARMATURE" and m.object == rig for m in obj.modifiers)
        check(f"part {pid} skinned", ok)
        slots = {m.name for m in obj.data.materials}
        check(f"part {pid} slots", slots <= {material_name(s) for s in SLOTS}, ",".join(sorted(slots)))
        unweighted = [v.index for v in obj.data.vertices if not v.groups]
        check(f"part {pid} fully weighted", not unweighted, f"{len(unweighted)} unweighted")
    for name in ANCHORS:
        empty = bpy.data.objects.get(anchor_node(name))
        check(f"anchor {name}", empty is not None and empty.parent == rig and empty.parent_type == "BONE")
    for name in CLIPS:
        action = bpy.data.actions.get(name)
        ok = action is not None and int(action.frame_range[1]) == frame_count(name)
        check(f"clip {name}", ok, f"frames {tuple(action.frame_range) if action else None}")
    return rig


def check_presets(rig):
    rig.animation_data.action = bpy.data.actions["idle"]
    bpy.context.scene.frame_set(0)
    rig.data.pose_position = "REST"
    bpy.context.view_layer.update()
    tris = {pid: sum(len(p.vertices) - 2 for p in bpy.data.objects[part_node(pid)].data.polygons)
            for pid, _, _ in PARTS}
    check("kit triangles", sum(tris.values()) < MAX_TRIS, f"{sum(tris.values())}")
    for preset in presets():
        shown = [pid for pid, cat, _ in PARTS if cat == "base" or pid in preset["parts"]]
        count = sum(tris[p] for p in shown)
        lo, hi = evaluated_z_range([bpy.data.objects[part_node(p)] for p in shown])
        check(f"preset {preset['id']} triangles", count < MAX_TRIS, f"{count}")
        check(f"preset {preset['id']} height", abs(hi - HEIGHT) < HEIGHT_TOLERANCE and abs(lo) < 0.02,
              f"{lo:.3f}..{hi:.3f} m")
    rig.data.pose_position = "POSE"


def check_feet_planted(rig):
    """Lowest body vertex over the walk and run cycles stays near the ground (no float or sink)."""
    body = bpy.data.objects[part_node("body")]
    for clip in ("walk", "run"):
        rig.animation_data.action = bpy.data.actions[clip]
        lows = []
        for frame in range(0, frame_count(clip), 3):
            bpy.context.scene.frame_set(frame)
            lows.append(evaluated_z_range([body])[0])
        check(f"{clip} ground contact", -0.04 < min(lows) and max(lows) < 0.08,
              f"lowest {min(lows):.3f}..{max(lows):.3f} m")


def check_export():
    path = os.path.join(KIT_DIR, GLB_NAME)
    check("glb exists", os.path.exists(path))
    if not os.path.exists(path):
        return
    size = os.path.getsize(path)
    check("glb size", size < MAX_GLB_BYTES, f"{size} bytes")
    gltf = glb_json(path)
    check("glb no draco", "KHR_draco_mesh_compression" not in gltf.get("extensionsUsed", []))
    names = {a["name"] for a in gltf.get("animations", [])}
    check("glb clips", set(CLIPS) <= names, ",".join(sorted(names)))
    check("manifest", os.path.exists(os.path.join(KIT_DIR, "manifest.json")))


def main():
    rig = check_scene()
    check_presets(rig)
    check_feet_planted(rig)
    check_export()
    check("district sha256 unchanged", sha256(DISTRICT_BLEND) == DISTRICT_SHA256)
    print(f"K1 VALIDATE: {'PASS' if not FAILURES else 'FAIL ' + ', '.join(FAILURES)}")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
