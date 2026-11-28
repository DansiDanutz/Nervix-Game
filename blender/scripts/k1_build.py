"""Build the K1 character kit into blender/scenes/nervix_characters_01.blend (idempotent).

Run (headless, from the repository root):
    blender --background --python blender/scripts/k1_build.py

Opens the kit file if it exists (else an empty scene), deletes everything the kit owns (the
K1_CHARACTER collection, its rig, meshes, k1_* materials and the four clips), rebuilds it from
these scripts and saves. The district .blend is never opened.
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from k1_anim import CLIPS, build_actions  # noqa: E402
from k1_body import build_body  # noqa: E402
from k1_common import (COLLECTION, K1_BLEND, PARTS, SLOT_METALLIC, SLOT_ROUGHNESS, SLOTS,  # noqa: E402
                       hex_to_linear, material_name, part_node, presets)
from k1_parts import build_part  # noqa: E402
from k1_rig import build_anchors, build_rig  # noqa: E402


def open_kit_file():
    if os.path.exists(K1_BLEND):
        bpy.ops.wm.open_mainfile(filepath=K1_BLEND)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)


def clear_owned():
    coll = bpy.data.collections.get(COLLECTION)
    if coll:
        for obj in list(coll.objects):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if isinstance(data, bpy.types.Mesh) and data.users == 0:
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Armature) and data.users == 0:
                bpy.data.armatures.remove(data)
        bpy.data.collections.remove(coll)
    for name in CLIPS:
        if name in bpy.data.actions:
            bpy.data.actions.remove(bpy.data.actions[name])
    for mat in [m for m in bpy.data.materials if m.name.startswith("k1_")]:
        bpy.data.materials.remove(mat)
    for block in (bpy.data.meshes, bpy.data.armatures):
        for item in [d for d in block if d.users == 0 and d.name.startswith("k1_")]:
            block.remove(item)


def make_materials(palette):
    out = {}
    for slot in SLOTS:
        mat = bpy.data.materials.new(material_name(slot))
        if mat.node_tree is None:
            mat.use_nodes = True
        mat.use_backface_culling = False
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = hex_to_linear(palette[slot])
        bsdf.inputs["Roughness"].default_value = SLOT_ROUGHNESS[slot]
        bsdf.inputs["Metallic"].default_value = SLOT_METALLIC.get(slot, 0.0)
        mat.diffuse_color = hex_to_linear(palette[slot])
        out[slot] = mat
    return out


def build():
    open_kit_file()
    clear_owned()
    coll = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    materials = make_materials(presets()[0]["palette"])
    rig = build_rig(coll)
    tris = {}
    for part_id, category, _ in PARTS:
        name = part_node(part_id)
        if category == "base":
            _, tris[part_id] = build_body(coll, rig, materials, name)
        else:
            _, tris[part_id] = build_part(part_id, name, coll, rig, materials)
    build_anchors(coll, rig)
    build_actions(rig)
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start, scene.frame_end = 0, 90
    os.makedirs(os.path.dirname(K1_BLEND), exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backup beside the kit file
    bpy.ops.wm.save_as_mainfile(filepath=K1_BLEND)
    for part_id, count in tris.items():
        print(f"K1 part {part_id}: {count} tris")
    print(f"K1 total tris: {sum(tris.values())}")
    print(f"K1 saved {K1_BLEND}")


if __name__ == "__main__":
    build()
