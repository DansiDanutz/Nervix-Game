"""Build the Nervix World district (Milestone 1, visual pass).

Run:
    blender --background --python blender/scripts/build_district.py

Palette is sampled from the four concept images in docs/references, so the
materials carry the references' own sandstone / terracotta / cream / teal.
Reference planes live in a separate collection that is never exported.

Writes:
    blender/scenes/nervix_city_district_01.blend
    exports/<chunk>.glb + manifest.json
"""

import json
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REF_DIR = os.path.join(ROOT, "docs", "references")
SCENE_DIR = os.path.join(ROOT, "blender", "scenes")
EXPORT_DIR = os.path.join(ROOT, "exports")
BLEND = os.path.join(SCENE_DIR, "nervix_city_district_01.blend")
MANIFEST = os.path.join(EXPORT_DIR, "manifest.json")
MANAGED = "NERVIX_MANAGED"
REFERENCES = "NERVIX_REFERENCES"

REFS = [
    ("ref1-city-overview.png", "City overview"),
    ("ref2-merchant-buildings.png", "Merchant buildings"),
    ("ref3-character-lineup.png", "Character lineup"),
    ("ref4-cafe-interior.png", "Cafe interior"),
]


def sample_palette(path):
    """Average colour of an image, in linear RGBA (Blender's own pixels)."""
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    px = list(img.pixels)
    r = g = b = n = 0.0
    step = max(4, (w * h) // 4096)
    for i in range(0, w * h, step):
        o = i * 4
        if px[o + 3] < 0.5:
            continue
        r += px[o]; g += px[o + 1]; b += px[o + 2]; n += 1
    if n == 0:
        return (0.8, 0.75, 0.65, 1.0)
    return (r / n, g / n, b / n, 1.0)


def mat(name, colour, roughness=0.8, metallic=0.0):
    colour = tuple(colour) if len(colour) == 4 else (*colour, 1.0)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = colour
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return m


def move(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


def box(name, size, loc, material, coll, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    o.data.materials.append(material)
    return move(o, coll)


def cyl(name, r, depth, loc, material, coll, verts=16, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, vertices=verts, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    return move(o, coll)


def sph(name, r, loc, material, coll, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=12, ring_count=8)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.data.materials.append(material)
    return move(o, coll)


def cone(name, r1, r2, depth, loc, material, coll, verts=4, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, vertices=verts, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    return move(o, coll)


def no_shadow(o):
    o.visible_shadow = False
    return o


def join_static(coll):
    """Merge non-marker, non-modified meshes in a collection into one object."""
    meshes = [o for o in coll.objects
              if o.type == "MESH" and not o.get("nervix_marker_kind") and not o.modifiers and "door" not in o.name]
    if len(meshes) < 2:
        return
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    meshes[0].name = f"{coll.name.lower()}_static"


def marker(o, kind, slot=None, collision=False):
    o["nervix_marker_kind"] = kind
    if slot:
        o["nervix_slot"] = slot
    if collision:
        o["nervix_collision"] = True
    return o


def window(name, loc, w, h, frame, glass, coll, facing="y"):
    if facing == "y":
        box(f"{name}_frame", (w, 0.12, h), loc, frame, coll)
        box(f"{name}_glass", (w * 0.78, 0.06, h * 0.74), (loc[0], loc[1] - 0.05, loc[2]), glass, coll)
    else:
        box(f"{name}_frame", (0.12, w, h), loc, frame, coll)
        box(f"{name}_glass", (0.06, w * 0.78, h * 0.74), (loc[0] - 0.05, loc[1], loc[2]), glass, coll)


def door(name, loc, w, h, material, coll):
    box(name, (w, 0.14, h), (loc[0], loc[1], h / 2), material, coll)
    sph(f"{name}_handle", 0.05, (loc[0] + w * 0.32, loc[1] - 0.1, h * 0.5), material, coll)


def roof(name, loc, w, d, h, material, coll):
    cone(name, w * 0.78, 0.0, h, (loc[0], loc[1], loc[2] + h / 2), material, coll, verts=4, rot=(0, 0, 0.785))


def awning(name, loc, w, d, material, coll):
    box(name, (w, d, 0.1), loc, material, coll, rot=(0.16, 0, 0))
    for i, x in enumerate((-w / 2 + 0.2, w / 2 - 0.2)):
        cyl(f"{name}_pole_{i}", 0.05, 2.2, (loc[0] + x, loc[1] - d / 2 + 0.1, 1.1), material, coll, 8)


def tree(name, loc, trunk, leaf, coll, scale=1.0):
    cyl(f"{name}_trunk", 0.16 * scale, 1.6 * scale, (loc[0], loc[1], 0.8 * scale), trunk, coll, 10)
    for i, (dx, dy, dz, r) in enumerate(((0, 0, 2.1, 0.9), (0.45, 0.2, 1.8, 0.6), (-0.4, -0.2, 1.9, 0.65))):
        no_shadow(sph(f"{name}_leaf{i}", r * scale, (loc[0] + dx * scale, loc[1] + dy * scale, dz * scale), leaf, coll, (1, 1, 0.85)))


def lamp(name, loc, metal, glow, coll):
    cyl(f"{name}_post", 0.07, 2.6, (loc[0], loc[1], 1.3), metal, coll, 8)
    box(f"{name}_head", (0.36, 0.36, 0.3), (loc[0], loc[1], 2.7), glow, coll)


def bench(name, loc, wood, metal, coll, rot=0):
    box(f"{name}_seat", (1.8, 0.5, 0.12), (loc[0], loc[1], 0.55), wood, coll, rot=(0, 0, rot))
    box(f"{name}_back", (1.8, 0.12, 0.5), (loc[0], loc[1] + 0.2, 0.85), wood, coll, rot=(0, 0, rot))
    for i, dx in enumerate((-0.7, 0.7)):
        box(f"{name}_leg{i}", (0.12, 0.5, 0.55), (loc[0] + dx, loc[1], 0.28), metal, coll)


def character(name, loc, shirt, skin, hair, coll, yaw=0.0, scale=1.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.3 * scale, depth=1.5 * scale, location=(loc[0], loc[1], 0.75 * scale))
    body = bpy.context.object
    body.name = f"{name}_body"
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22 * scale, location=(loc[0], loc[1], 1.58 * scale))
    head = bpy.context.object
    head.name = f"{name}_head"
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True); head.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(shirt)
    move(obj, coll)

    hair_o = sph(f"{name}_hair", 0.23 * scale, (loc[0], loc[1] + 0.02, 1.66 * scale), hair, coll, (1, 1, 0.7))
    hair_o.parent = obj

    bpy.ops.object.armature_add(enter_editmode=True, location=(loc[0], loc[1], 0))
    arm = bpy.context.object
    arm.name = f"{name}_rig"
    bone = arm.data.edit_bones[0]
    bone.name = "spine"
    bone.head = (0, 0, 0); bone.tail = (0, 0, 1.8 * scale)
    bpy.ops.object.mode_set(mode="OBJECT")
    move(arm, coll)

    obj.parent = arm
    m = obj.modifiers.new("Armature", "ARMATURE"); m.object = arm
    g = obj.vertex_groups.new(name="spine")
    g.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")

    arm.animation_data_create()
    for an, frames, ang in (("idle", (1, 12, 24), 0.05), ("walk", (1, 8, 16), 0.35)):
        a = bpy.data.actions.new(f"{name}_{an}")
        arm.animation_data.action = a
        pb = arm.pose.bones["spine"]; pb.rotation_mode = "XYZ"
        for i, f in enumerate(frames):
            pb.rotation_euler = (ang if i % 2 else 0.0, 0, 0)
            pb.keyframe_insert("rotation_euler", frame=f)
        a.name = f"{name}_{an}"; a.use_fake_user = True
    return obj


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    if scene.world is None:
        scene.world = bpy.data.worlds.new("NervixWorld")

    root = bpy.data.collections.new(MANAGED); scene.collection.children.link(root)
    refs = bpy.data.collections.new(REFERENCES); scene.collection.children.link(refs)

    def sub(n):
        c = bpy.data.collections.new(n); root.children.link(c); return c

    c_plaza, c_street = sub("Plaza"), sub("Street")
    c_house, c_cafe = sub("MerchantHouse"), sub("Cafe")
    c_casino = sub("Casino")
    c_interior, c_npc, c_props = sub("CafeInterior"), sub("NPCs"), sub("Props")

    # Palette sampled from the references (data, not guesswork).
    p1 = sample_palette(os.path.join(REF_DIR, REFS[0][0]))
    p2 = sample_palette(os.path.join(REF_DIR, REFS[1][0]))
    p3 = sample_palette(os.path.join(REF_DIR, REFS[2][0]))
    p4 = sample_palette(os.path.join(REF_DIR, REFS[3][0]))
    print("PALETTE", [round(c, 3) for c in p1], [round(c, 3) for c in p2], [round(c, 3) for c in p3], [round(c, 3) for c in p4])

    sand = mat("sandstone", p1)
    cream = mat("cream_stone", p4)
    terra = mat("terracotta", p2)
    teal = mat("teal_awning", (0.10, 0.42, 0.40))
    timber = mat("timber", (0.28, 0.17, 0.10))
    marble = mat("marble", (0.86, 0.85, 0.81), 0.35)
    plum = mat("plum", p3)
    brass = mat("brass", (0.72, 0.55, 0.24), 0.3, 0.6)
    skin = mat("skin", (0.91, 0.74, 0.60))
    hair_m = mat("hair_merchant", (0.18, 0.12, 0.08))
    hair_c = mat("hair_cafe", (0.35, 0.20, 0.10))
    hair_h = mat("hair_host", (0.10, 0.08, 0.07))
    glow = mat("lantern_glow", (1.0, 0.82, 0.45))
    glass = mat("glass", (0.55, 0.75, 0.78), 0.15)

    # Reference planes (never exported).
    for i, (fname, label) in enumerate(REFS):
        path = os.path.join(REF_DIR, fname)
        img = bpy.data.images.load(path, check_existing=True)
        m = bpy.data.materials.new(f"ref_{i}")
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 1.0
        bpy.ops.mesh.primitive_plane_add(size=4, location=(12 + (i % 2) * 5, -14 - (i // 2) * 5, 2))
        o = bpy.context.object
        o.name = f"ref_{i+1}_{label.replace(' ', '_')}"
        o.data.materials.append(m)
        move(o, refs)

    # Plaza.
    marker(box("nervix_plaza", (26, 26, 0.1), (0, 0, -0.05), sand, c_plaza), "ground", collision=True)
    cyl("fountain_base", 3.2, 0.5, (0, 0, 0.25), marble, c_plaza, 20)
    cyl("fountain_bowl", 2.4, 0.35, (0, 0, 0.68), marble, c_plaza, 20)
    cyl("fountain_column", 0.28, 1.5, (0, 0, 1.6), marble, c_plaza, 12)
    cyl("fountain_upper", 1.1, 0.25, (0, 0, 2.4), marble, c_plaza, 16)
    sph("fountain_finial", 0.32, (0, 0, 2.75), brass, c_plaza)

    # Streets.
    box("street_ns", (6, 26, 0.08), (0, 9, -0.04), cream, c_street)
    box("street_ew", (26, 6, 0.08), (9, 0, -0.04), cream, c_street)
    for i, x in enumerate(range(-12, 13, 3)):
        box(f"kerb_{i}", (1.6, 0.3, 0.2), (x, 6.2, 0.05), marble, c_street)

    # Merchant house: two storeys, balcony, shopfront.
    marker(box("house", (7, 6, 6), (-9, 0, 3), sand, c_house), "building", "slot-01", True)
    roof("house_roof", (-9, 0, 6.0), 7.4, 6.4, 1.8, terra, c_house)
    box("house_band", (7.2, 6.2, 0.25), (-9, 0, 3.4), cream, c_house)
    door("house_door", (-9, 3.05, 0), 1.3, 2.1, timber, c_house)
    window("house_w1", (-11, 3.05, 2.2), 1.1, 1.2, timber, glass, c_house)
    window("house_w2", (-7, 3.05, 2.2), 1.1, 1.2, timber, glass, c_house)
    window("house_w3", (-11, 3.05, 4.6), 1.1, 1.2, timber, glass, c_house)
    window("house_w4", (-7, 3.05, 4.6), 1.1, 1.2, timber, glass, c_house)
    box("house_balcony", (4.2, 1.2, 0.18), (-9, 3.4, 3.5), cream, c_house)
    for i, x in enumerate((-10.8, -9.9, -9.0, -8.1, -7.2)):
        no_shadow(cyl(f"baluster_{i}", 0.05, 0.7, (x, 3.95, 3.95), cream, c_house, 8))
    marker(box("house_sign", (2.6, 0.12, 0.9), (-9, 3.15, 3.0), plum, c_house), "sign", "slot-01")
    awning("house_awning", (-9, 3.6, 2.6), 3.4, 1.4, teal, c_house)

    # Cafe: shopfront, awning, tables outside.
    marker(box("cafe", (8, 6, 4.2), (9, 0, 2.1), cream, c_cafe), "building", "slot-02", True)
    roof("cafe_roof", (9, 0, 4.2), 8.4, 6.4, 1.4, terra, c_cafe)
    door("cafe_door", (9, 3.05, 0), 1.4, 2.1, timber, c_cafe)
    window("cafe_w1", (6.6, 3.05, 1.9), 1.6, 1.4, timber, glass, c_cafe)
    window("cafe_w2", (11.4, 3.05, 1.9), 1.6, 1.4, timber, glass, c_cafe)
    marker(box("cafe_sign", (2.4, 0.12, 0.8), (9, 3.15, 3.3), plum, c_cafe), "sign", "slot-02")
    awning("cafe_awning", (9, 3.8, 2.9), 6.2, 2.0, teal, c_cafe)
    for i, (x, y) in enumerate(((6.4, 4.6), (9.0, 4.8), (11.6, 4.6))):
        cyl(f"cafe_table_{i}", 0.55, 0.08, (x, y, 0.75), timber, c_props, 20)
        cyl(f"cafe_table_leg_{i}", 0.08, 0.75, (x, y, 0.38), timber, c_props, 8)
        for j, dx in enumerate((-0.8, 0.8)):
            no_shadow(cyl(f"cafe_chair_{i}_{j}", 0.28, 0.06, (x + dx, y, 0.45), timber, c_props, 16))

    # Cafe interior.
    marker(box("cafe_floor", (8, 6, 0.06), (9, 0, 0.03), cream, c_interior), "interior", "slot-02")
    box("counter", (5.0, 0.9, 1.1), (9, 0.6, 0.55), timber, c_interior)
    box("counter_top", (5.2, 1.0, 0.08), (9, 0.6, 1.14), marble, c_interior)
    for i, x in enumerate((7.0, 9.0, 11.0)):
        no_shadow(cyl(f"stool_{i}", 0.3, 0.7, (x, -0.4, 0.35), timber, c_interior, 16))
    box("shelf", (3.0, 0.35, 1.6), (9, 2.6, 1.2), timber, c_interior)
    for i, x in enumerate((8.0, 9.0, 10.0)):
        no_shadow(sph(f"jar_{i}", 0.14, (x, 2.55, 1.9), brass, c_interior))
    box("rug", (4.0, 2.4, 0.02), (9, -1.6, 0.07), plum, c_interior)
    for i, x in enumerate((7.2, 10.8)):
        cyl(f"pendant_{i}", 0.22, 0.18, (x, 0.6, 2.6), glow, c_interior, 16)

    # Casino: arches, columns, steps.
    marker(box("casino", (13, 7, 7), (0, 12, 3.5), sand, c_casino), "building", "slot-03", True)
    roof("casino_roof", (0, 12, 7.0), 13.6, 7.6, 2.0, terra, c_casino)
    for i, x in enumerate((-4.2, 0, 4.2)):
        cyl(f"casino_arch_{i}", 1.2, 3.6, (x, 8.4, 1.8), cream, c_casino, 20)
        box(f"casino_pier_{i}", (0.5, 0.5, 3.6), (x + 1.4, 8.4, 1.8), cream, c_casino)
    marker(box("casino_sign", (4.6, 0.12, 1.1), (0, 8.35, 5.6), plum, c_casino), "sign", "slot-03")
    for i in range(3):
        box(f"casino_step_{i}", (6.0, 0.6, 0.16), (0, 8.0 - i * 0.55, 0.08 + i * 0.16), marble, c_casino)

    # Props: ad surface, slots, trees, lamps, benches.
    marker(box("ad_plaza", (3.2, 0.2, 2.0), (-4.5, -6.5, 1.0), brass, c_props), "ad_surface", "plaza-1")
    for i, slot in enumerate(("slot-01", "slot-02", "slot-03")):
        bpy.ops.object.empty_add(type="PLAIN_AXES", location=(7 + i * 2.2, -8, 0))
        e = bpy.context.object
        e.name = f"slot_{i+1}"
        e["nervix_marker_kind"] = "property_slot"
        e["nervix_slot"] = slot
        move(e, c_props)
    for i, (x, y) in enumerate(((-5, -5), (5, -5), (-5, 5), (5, 5), (-11, -6), (11, -6))):
        tree(f"tree_{i}", (x, y), timber, teal, c_props, 0.9)
    for i, (x, y) in enumerate(((-3.5, -3.5), (3.5, -3.5), (-3.5, 3.5), (3.5, 3.5))):
        lamp(f"lamp_{i}", (x, y), brass, glow, c_props)
    for i, (x, y, r) in enumerate(((-6.5, 2.5, 0), (6.5, 2.5, 0), (0, -7.5, 1.57))):
        bench(f"bench_{i}", (x, y), timber, brass, c_props, r)
    for i, (x, y) in enumerate(((-7.5, -2.5), (7.5, -2.5))):
        box(f"crate_{i}", (0.8, 0.8, 0.8), (x, y, 0.4), timber, c_props)

    # Three distinct NPC variants.
    character("nervix_npc_merchant", (-7.0, -2.6, 0), plum, skin, hair_m, c_npc, 0.4)
    character("nervix_npc_cafe", (7.0, -2.4, 0), teal, skin, hair_c, c_npc, -0.5)
    character("nervix_npc_host", (2.6, 8.8, 0), terra, skin, hair_h, c_npc, 3.0, 1.05)

    for c in (c_street, c_props, c_interior, c_house, c_cafe, c_casino):
        join_static(c)

    # Light + camera.
    bpy.ops.object.light_add(type="SUN", location=(14, -12, 18))
    sun = bpy.context.object
    sun.data.energy = 3.2
    sun.data.angle = 0.2
    bpy.ops.object.light_add(type="AREA", location=(-10, -8, 12))
    fill = bpy.context.object
    fill.data.energy = 400
    fill.data.size = 12
    bpy.ops.object.camera_add(location=(16, -20, 9), rotation=(1.15, 0, 0.68))
    scene.camera = bpy.context.object
    scene.world.color = (0.55, 0.72, 0.80)

    return root


def export(root):
    os.makedirs(EXPORT_DIR, exist_ok=True)
    assets = []

    def export_objs(objs, aid):
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        path = os.path.join(EXPORT_DIR, f"{aid}.glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                                  export_apply=False, export_yup=True, export_animations=True)
        assets.append({"id": aid, "file": os.path.basename(path), "bytes": os.path.getsize(path)})

    export_objs(list(root.all_objects), "nervix_city_district_01")
    for c in root.children:
        export_objs(list(c.all_objects), f"nervix_{c.name.lower()}")

    markers = [{
        "id": o.get("nervix_asset_id") or o.name,
        "kind": o.get("nervix_marker_kind"),
        "slot": o.get("nervix_slot"),
        "position": [round(v, 4) for v in o.matrix_world.translation],
    } for o in root.all_objects if o.get("nervix_marker_kind")]

    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump({"schema_version": 1, "district": "nervix_city_district_01",
                   "assets": assets, "markers": markers}, fh, indent=2)
    print("MANIFEST", len(assets), "assets", len(markers), "markers")


def main():
    os.makedirs(SCENE_DIR, exist_ok=True)
    root = build()
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    export(root)
    print("SAVED", BLEND)
    return 0


if __name__ == "__main__":
    sys.exit(main())