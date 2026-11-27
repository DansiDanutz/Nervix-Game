"""Build the Milestone 0 scene: a modular street corner, a door, a merchant sign
surface and one rigged character with idle and walk actions.

Run:
    blender --background --python blender/scripts/build_m0.py

Writes:
    blender/scenes/nervix_city_district_01.blend
    exports/nervix_city_district_01.glb
    exports/manifest.json

Idempotent: it rebuilds from an empty scene and only touches NERVIX_MANAGED.
"""

import json
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCENE_DIR = os.path.join(ROOT, "blender", "scenes")
EXPORT_DIR = os.path.join(ROOT, "exports")
BLEND = os.path.join(SCENE_DIR, "nervix_city_district_01.blend")
GLB = os.path.join(EXPORT_DIR, "nervix_city_district_01.glb")
MANIFEST = os.path.join(EXPORT_DIR, "manifest.json")

MANAGED = "NERVIX_MANAGED"


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    return scene


def collection(name, parent):
    coll = bpy.data.collections.new(name)
    parent.children.link(coll)
    return coll


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


def build():
    scene = reset()
    root = bpy.data.collections.new(MANAGED)
    scene.collection.children.link(root)
    c_street = collection("Street", root)
    c_building = collection("Building", root)
    c_char = collection("Character", root)
    c_props = collection("Props", root)

    sand = material("sandstone", (0.85, 0.78, 0.62))
    terracotta = material("terracotta", (0.62, 0.31, 0.20))
    timber = material("timber", (0.35, 0.22, 0.13))
    skin = material("skin", (0.91, 0.76, 0.62))

    # Street corner: paving plus a low kerb.
    bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 0, 0))
    paving = bpy.context.object
    paving.name = "nervix_street_paving"
    paving.data.materials.append(sand)
    paving["nervix_collision"] = True
    move_to(paving, c_street)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 4.2, 0.15))
    kerb = bpy.context.object
    kerb.name = "nervix_kerb"
    kerb.scale = (12, 0.3, 0.3)
    kerb.data.materials.append(sand)
    move_to(kerb, c_street)

    # Doorway: two posts and a lintel, 2.1 m tall overall.
    parts = []
    for x in (-0.55, 0.55):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 4.0, 1.05))
        post = bpy.context.object
        post.scale = (0.2, 0.2, 2.1)
        parts.append(post)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 4.0, 2.0))
    lintel = bpy.context.object
    lintel.scale = (1.3, 0.2, 0.2)
    parts.append(lintel)
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    door = bpy.context.object
    door.name = "nervix_ref_doorway"
    door.data.materials.append(timber)
    move_to(door, c_building)

    # Merchant sign surface.
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 3.85, 2.45), rotation=(1.5708, 0, 0))
    sign = bpy.context.object
    sign.name = "nervix_sign_surface"
    sign.scale = (2.0, 1.0, 1.0)
    sign.data.materials.append(terracotta)
    sign["nervix_marker_kind"] = "sign"
    sign["nervix_slot"] = "slot-01"
    move_to(sign, c_props)

    # Character: body + head joined, 1.8 m tall, bound to a two-bone rig.
    bpy.ops.mesh.primitive_cylinder_add(radius=0.3, depth=1.5, location=(0, 0, 0.75))
    body = bpy.context.object
    body.name = "nervix_body"
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(0, 0, 1.58))
    head = bpy.context.object
    head.name = "nervix_head"
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    head.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    char = bpy.context.object
    char.name = "nervix_ref_character"
    char.data.materials.append(skin)
    move_to(char, c_char)

    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = "nervix_rig"
    arm.data.name = "nervix_rig"
    bone = arm.data.edit_bones[0]
    bone.name = "spine"
    bone.head = (0, 0, 0)
    bone.tail = (0, 0, 1.8)
    bpy.ops.object.mode_set(mode="OBJECT")
    move_to(arm, c_char)

    char.parent = arm
    mod = char.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    group = char.vertex_groups.new(name="spine")
    group.add(list(range(len(char.data.vertices))), 1.0, "REPLACE")

    # Actions: idle and walk, keyed on the spine bone.
    arm.animation_data_create()
    for name, frames, angle in (("idle", (1, 12, 24), 0.05), ("walk", (1, 8, 16), 0.35)):
        action = bpy.data.actions.new(name)
        arm.animation_data.action = action
        try:
            if len(action.slots):
                arm.animation_data.action_slot = action.slots[0]
        except Exception as exc:  # slot API differs across versions
            print("slot note:", exc)
        pb = arm.pose.bones["spine"]
        pb.rotation_mode = "XYZ"
        for i, frame in enumerate(frames):
            pb.rotation_euler = (angle if i % 2 else 0.0, 0.0, 0.0)
            pb.keyframe_insert("rotation_euler", frame=frame)
        action.name = name
        action.use_fake_user = True

    arm.animation_data.action = bpy.data.actions["idle"]

    # Light and camera for review renders (not exported).
    bpy.ops.object.light_add(type="SUN", location=(6, -6, 10))
    bpy.context.object.data.energy = 3.0
    bpy.ops.object.camera_add(location=(6, -8, 4), rotation=(1.2, 0, 0.6))
    scene.camera = bpy.context.object

    return root


def export(root):
    os.makedirs(EXPORT_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in root.all_objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=GLB,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_animations=True,
    )
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
        "assets": [{"id": "nervix_city_district_01", "file": os.path.basename(GLB), "bytes": os.path.getsize(GLB)}],
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
    print("EXPORTED", GLB, os.path.getsize(GLB))
    return 0


if __name__ == "__main__":
    sys.exit(main())