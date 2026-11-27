"""Build Milestone 1: the first Nervix World district.

Run:
    blender --background --python blender/scripts/build_district.py

Creates an editable scene with a central plaza and fountain, a street, a merchant
house, a cafe with a working interior, a casino exterior, three merchant NPC
variants, an advertising surface and stable property slots.

Writes:
    blender/scenes/nervix_city_district_01.blend
    exports/<asset>.glb  (one per chunk)
    exports/manifest.json

The script is idempotent: it starts from an empty scene and only touches
NERVIX_MANAGED. Hand-edited collections are never deleted.
"""

import json
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCENE_DIR = os.path.join(ROOT, "blender", "scenes")
EXPORT_DIR = os.path.join(ROOT, "exports")
BLEND = os.path.join(SCENE_DIR, "nervix_city_district_01.blend")
MANIFEST = os.path.join(EXPORT_DIR, "manifest.json")
MANAGED = "NERVIX_MANAGED"


def material(name, colour, roughness=0.8):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def move_to(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


def box(name, size, location, mat, coll, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    obj.data.materials.append(mat)
    move_to(obj, coll)
    return obj


def cylinder(name, radius, depth, location, mat, coll, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=location, vertices=vertices)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    move_to(obj, coll)
    return obj


def sphere(name, radius, location, mat, coll):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    move_to(obj, coll)
    return obj


def marker(obj, kind, slot=None, collision=False):
    obj["nervix_marker_kind"] = kind
    if slot:
        obj["nervix_slot"] = slot
    if collision:
        obj["nervix_collision"] = True
    return obj


def character(name, location, shirt, skin, coll, yaw=0.0):
    """A rigged 1.8 m character with idle and walk actions."""
    bpy.ops.mesh.primitive_cylinder_add(radius=0.3, depth=1.5, location=(location[0], location[1], 0.75))
    body = bpy.context.object
    body.name = f"{name}_body"
    body.rotation_euler = (0, 0, yaw)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(location[0], location[1], 1.58))
    head = bpy.context.object
    head.name = f"{name}_head"
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    head.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(shirt)
    move_to(obj, coll)

    bpy.ops.object.armature_add(enter_editmode=True, location=(location[0], location[1], 0))
    arm = bpy.context.object
    arm.name = f"{name}_rig"
    bone = arm.data.edit_bones[0]
    bone.name = "spine"
    bone.head = (0, 0, 0)
    bone.tail = (0, 0, 1.8)
    bpy.ops.object.mode_set(mode="OBJECT")
    move_to(arm, coll)

    obj.parent = arm
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    group = obj.vertex_groups.new(name="spine")
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")

    arm.animation_data_create()
    for action_name, frames, angle in (("idle", (1, 12, 24), 0.05), ("walk", (1, 8, 16), 0.35)):
        action = bpy.data.actions.new(f"{name}_{action_name}")
        arm.animation_data.action = action
        pb = arm.pose.bones["spine"]
        pb.rotation_mode = "XYZ"
        for i, frame in enumerate(frames):
            pb.rotation_euler = (angle if i % 2 else 0.0, 0.0, 0.0)
            pb.keyframe_insert("rotation_euler", frame=frame)
        action.name = f"{name}_{action_name}"
        action.use_fake_user = True
    return obj, arm


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    root = bpy.data.collections.new(MANAGED)
    scene.collection.children.link(root)

    def sub(name):
        c = bpy.data.collections.new(name)
        root.children.link(c)
        return c

    c_plaza = sub("Plaza")
    c_street = sub("Street")
    c_house = sub("MerchantHouse")
    c_cafe = sub("Cafe")
    c_casino = sub("Casino")
    c_interior = sub("CafeInterior")
    c_npc = sub("NPCs")
    c_props = sub("Props")

    sand = material("sandstone", (0.85, 0.78, 0.62))
    cream = material("cream_stone", (0.92, 0.87, 0.76))
    terra = material("terracotta", (0.62, 0.31, 0.20))
    teal = material("teal_awning", (0.16, 0.45, 0.43))
    timber = material("timber", (0.35, 0.22, 0.13))
    marble = material("marble", (0.88, 0.88, 0.85), 0.4)
    plum = material("plum", (0.36, 0.23, 0.37))
    brass = material("brass", (0.72, 0.58, 0.28), 0.35)
    skin = material("skin", (0.91, 0.76, 0.62))

    # Plaza and fountain.
    plaza = box("nervix_plaza", (24, 24, 0.1), (0, 0, -0.05), sand, c_plaza)
    marker(plaza, "ground", collision=True)
    cylinder("nervix_fountain_base", 3.0, 0.6, (0, 0, 0.3), marble, c_plaza)
    cylinder("nervix_fountain_bowl", 2.2, 0.4, (0, 0, 0.8), marble, c_plaza)
    cylinder("nervix_fountain_column", 0.3, 1.6, (0, 0, 1.8), marble, c_plaza, 12)
    sphere("nervix_fountain_top", 0.45, (0, 0, 2.75), brass, c_plaza)

    # Streets.
    box("nervix_street_ns", (6, 24, 0.08), (0, 8, -0.04), cream, c_street)
    box("nervix_street_ew", (24, 6, 0.08), (8, 0, -0.04), cream, c_street)

    # Merchant house.
    house = box("nervix_house", (6, 6, 5), (-8, 0, 2.5), sand, c_house)
    marker(house, "building", "slot-01", collision=True)
    box("nervix_house_roof", (7, 7, 0.6), (-8, 0, 5.3), terra, c_house, rotation=(0, 0, 0.785))
    box("nervix_house_door", (1.2, 0.2, 2.1), (-8, 3.05, 1.05), timber, c_house)
    marker(box("nervix_house_sign", (2.4, 0.1, 0.8), (-8, 3.1, 3.2), plum, c_house), "sign", "slot-01")
    box("nervix_house_window", (1.0, 0.1, 1.0), (-9.6, 3.05, 2.6), brass, c_house)
    box("nervix_house_window2", (1.0, 0.1, 1.0), (-6.4, 3.05, 2.6), brass, c_house)

    # Cafe with awning and a working interior.
    cafe = box("nervix_cafe", (7, 5, 4), (8, 0, 2.0), cream, c_cafe)
    marker(cafe, "building", "slot-02", collision=True)
    box("nervix_cafe_roof", (7.6, 5.6, 0.5), (8, 0, 4.25), terra, c_cafe)
    box("nervix_cafe_awning", (7, 2.0, 0.12), (8, 3.4, 3.0), teal, c_cafe, rotation=(0.12, 0, 0))
    marker(box("nervix_cafe_sign", (2.2, 0.1, 0.7), (8, 3.1, 3.6), plum, c_cafe), "sign", "slot-02")
    box("nervix_cafe_counter", (4.5, 0.8, 1.1), (8, 1.2, 0.55), timber, c_interior)
    box("nervix_cafe_table", (1.2, 1.2, 0.08), (6.6, 2.2, 0.75), timber, c_interior)
    box("nervix_cafe_table2", (1.2, 1.2, 0.08), (9.4, 2.2, 0.75), timber, c_interior)
    marker(box("nervix_cafe_floor", (7, 5, 0.06), (8, 0, 0.03), cream, c_interior), "interior", "slot-02")

    # Casino exterior with arches.
    casino = box("nervix_casino", (12, 6, 6), (0, 11, 3.0), sand, c_casino)
    marker(casino, "building", "slot-03", collision=True)
    box("nervix_casino_roof", (12.8, 6.8, 0.6), (0, 11, 6.3), terra, c_casino)
    for x in (-4, 0, 4):
        cylinder(f"nervix_casino_arch_{x}", 1.1, 3.4, (x, 7.9, 1.7), cream, c_casino, 16)
    marker(box("nervix_casino_sign", (4.0, 0.1, 1.0), (0, 7.85, 5.0), plum, c_casino), "sign", "slot-03")

    # Advertising surface and property slots.
    marker(box("nervix_ad_plaza", (3.0, 0.2, 2.0), (-4, -6, 1.0), brass, c_props), "ad_surface", "plaza-1")
    for i, slot in enumerate(("slot-01", "slot-02", "slot-03")):
        bpy.ops.object.empty_add(type="PLAIN_AXES", location=(6 + i * 2, -8, 0))
        e = bpy.context.object
        e.name = f"nervix_slot_{i + 1}"
        e["nervix_marker_kind"] = "property_slot"
        e["nervix_slot"] = slot
        move_to(e, c_props)

    # Three merchant NPC variants.
    npcs = []
    for name, loc, colour, yaw in (
        ("nervix_npc_merchant", (-6.5, -2.5, 0), plum, 0.4),
        ("nervix_npc_cafe", (6.2, -2.2, 0), teal, -0.5),
        ("nervix_npc_host", (2.5, 8.6, 0), terra, 3.0),
    ):
        body, arm = character(name, loc, colour, skin, c_npc, yaw)
        npcs.append((body, arm))

    # Light and camera for review (not exported).
    bpy.ops.object.light_add(type="SUN", location=(12, -10, 16))
    bpy.context.object.data.energy = 3.5
    bpy.ops.object.camera_add(location=(14, -18, 10), rotation=(1.15, 0, 0.65))
    scene.camera = bpy.context.object

    return root


def export(root):
    os.makedirs(EXPORT_DIR, exist_ok=True)
    assets = []

    def export_objects(objects, asset_id):
        bpy.ops.object.select_all(action="DESELECT")
        for o in objects:
            o.select_set(True)
        path = os.path.join(EXPORT_DIR, f"{asset_id}.glb")
        bpy.ops.export_scene.gltf(
            filepath=path, export_format="GLB", use_selection=True,
            export_apply=False, export_yup=True, export_animations=True,
        )
        assets.append({"id": asset_id, "file": os.path.basename(path), "bytes": os.path.getsize(path)})

    export_objects(list(root.all_objects), "nervix_city_district_01")
    for coll in root.children:
        export_objects(list(coll.all_objects), f"nervix_{coll.name.lower()}")

    markers = [
        {
            "id": o.get("nervix_asset_id") or o.name,
            "kind": o.get("nervix_marker_kind"),
            "slot": o.get("nervix_slot"),
            "position": [round(v, 4) for v in o.matrix_world.translation],
        }
        for o in root.all_objects
        if o.get("nervix_marker_kind")
    ]
    manifest = {
        "schema_version": 1,
        "district": "nervix_city_district_01",
        "assets": assets,
        "markers": markers,
    }
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
    print("MANIFEST", json.dumps(manifest))


def main():
    os.makedirs(SCENE_DIR, exist_ok=True)
    root = build()
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    export(root)
    print("SAVED", BLEND)
    return 0


if __name__ == "__main__":
    sys.exit(main())