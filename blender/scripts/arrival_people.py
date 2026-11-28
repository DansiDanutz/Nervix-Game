"""A01 pedestrians as static posed figures in the ARRIVAL collection.

Uses the W0 character kit app/public/kits/k1/k1_pedestrian.glb (read only, never modified): the
GLB is imported into a temporary collection, the rig is posed on a frame of its walk/idle clip,
the chosen part meshes are frozen into new static meshes with A01 costume colours, and every
imported datablock is removed again. Without the kit, simple stylised figures are built instead.
Figures are decoration: never obstacles, never lightmapped (they stay lit at runtime).
"""

import math
import os

import bpy
from mathutils import Matrix

from arrival_materials import _flat
from openpoker_common import ROOT

K1_GLB = os.path.join(ROOT, "app", "public", "kits", "k1", "k1_pedestrian.glb")
TMP = "K1_IMPORT_TMP"
# (name, (x, y) Blender, facing yaw (rad, 0 = +x), clip, frame, parts, palette)
FIGURES = [
    ("people_woman_teal", (4.2, 4.4), math.radians(-160), "walk", 9,
     ("body", "robe_long", "hair_bun", "shawl"),
     {"tunic": "#2F8A84", "trim": "#E2B85C", "legs": "#2F8A84", "skin": "#D9A47E", "hair": "#3B2418",
      "leather": "#6B4128", "accent": "#F1E3C6", "eyes": "#2B2118"}),
    ("people_man_arcade", (-15.5, -5.2), math.radians(10), "walk", 3,
     ("body", "robe_long", "hair_curly", "satchel"),
     {"tunic": "#C98F5A", "trim": "#7A2445", "legs": "#5A2A44", "skin": "#C98E66", "hair": "#2E1C12",
      "leather": "#5A3420", "accent": "#E8D9B8", "eyes": "#2B2118"}),
    ("people_walker_street", (-27.0, 1.6), math.radians(185), "walk", 17,
     ("body", "tunic_knee", "hair_bob", "apron"),
     {"tunic": "#B5651D", "trim": "#E0C07A", "legs": "#4A3328", "skin": "#F0C9A0", "hair": "#5B3A22",
      "leather": "#5A3420", "accent": "#3F6F6A", "eyes": "#2B2118"}),
    ("people_cafe_guest", (-1.6, -6.6), math.radians(120), "idle", 20,
     ("body", "robe_long", "hair_curly", "shawl"),
     {"tunic": "#7A2445", "trim": "#E2B85C", "legs": "#3A2030", "skin": "#B57A55", "hair": "#1E140E",
      "leather": "#5A3420", "accent": "#F1E3C6", "eyes": "#2B2118"}),
    # r3 hero figures (judges: "A13-A15 not identifiable on the plaza"): the merchant beside the
    # fountain, the cafe keeper at the cafe edge and the traveller at the foot of the casino carpet.
    ("people_a13_merchant", (-5.6, 3.4), math.radians(-15), "idle", 12,
     ("body", "robe_long", "hair_curly", "satchel"),
     {"tunic": "#7C2346", "trim": "#D9A24A", "legs": "#EADBC0", "skin": "#C98E66", "hair": "#3A2218",
      "leather": "#6B4128", "accent": "#EADBC0", "eyes": "#2B2118"}),
    ("people_a14_cafe_keeper", (-4.4, -6.2), math.radians(25), "idle", 4,
     ("body", "tunic_knee", "hair_bun", "apron"),
     {"tunic": "#F1E3C6", "trim": "#2F8A80", "legs": "#4A3328", "skin": "#D9A47E", "hair": "#2E1C12",
      "leather": "#5A3420", "accent": "#2F8A80", "eyes": "#2B2118"}),
    ("people_a15_traveller", (1.9, 4.6), math.radians(-115), "walk", 24,
     ("body", "tunic_knee", "hair_curly", "satchel"),
     {"tunic": "#C98F5A", "trim": "#7A2445", "legs": "#5A4030", "skin": "#B57A55", "hair": "#1E140E",
      "leather": "#5A3420", "accent": "#3F6F6A", "eyes": "#2B2118"}),
]


def build_people(coll):
    if not os.path.exists(K1_GLB):
        return _fallback(coll)
    tmp = bpy.data.collections.new(TMP)
    bpy.context.scene.collection.children.link(tmp)
    layer = bpy.context.view_layer.layer_collection.children[TMP]
    bpy.context.view_layer.active_layer_collection = layer
    before = {k: set(getattr(bpy.data, k)) for k in ("meshes", "materials", "images", "actions", "armatures")}
    bpy.ops.import_scene.gltf(filepath=K1_GLB)
    rig = next(o for o in tmp.all_objects if o.type == "ARMATURE")
    parts = {o.name: o for o in tmp.all_objects if o.type == "MESH"}
    made = []
    try:
        for name, (x, y), yaw, clip, frame, want, palette in FIGURES:
            _pose(rig, clip, frame)
            place = Matrix.Translation((x, y, 0.0)) @ Matrix.Rotation(yaw + math.pi / 2, 4, "Z")
            made.append(_freeze(coll, name, parts, want, palette, place))
    finally:
        _cleanup(tmp, before)
        bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection
    return made


def _pose(rig, clip, frame):
    act = next((a for a in bpy.data.actions if clip in a.name.lower()), None)
    if act is not None:
        rig.animation_data_create()
        rig.animation_data.action = act
        try:   # Blender 4.4+ slotted actions
            if act.slots:
                rig.animation_data.action_slot = act.slots[0]
        except AttributeError:
            pass
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


def _freeze(coll, name, parts, want, palette, place):
    """Join the evaluated (posed) part meshes into one static mesh with costume materials."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new(name)
    import bmesh
    bm = bmesh.new()
    mats = []
    for pid in want:
        src = next((o for n, o in parts.items() if n == f"k1_{pid}" or n.startswith(f"k1_{pid}.")), None)
        if src is None:
            continue
        ev = src.evaluated_get(dg)
        tmp_me = bpy.data.meshes.new_from_object(ev, depsgraph=dg)
        tmp_me.transform(place @ src.matrix_world)
        remap = []
        for slot in tmp_me.materials:
            key = _slot_key(slot.name if slot else "")
            mat = _flat(f"ar_people_{name}_{key}", palette.get(key, "#C9A27E"), 0.7)
            if mat not in mats:
                mats.append(mat)
            remap.append(mats.index(mat))
        off = len(bm.faces)
        bm.from_mesh(tmp_me)
        bm.faces.ensure_lookup_table()
        for f in bm.faces[off:]:
            f.material_index = remap[f.material_index] if f.material_index < len(remap) else 0
        bpy.data.meshes.remove(tmp_me)
    bm.to_mesh(me)
    bm.free()
    for mat in mats:
        me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    o["arrival_people"] = True
    coll.objects.link(o)
    return o


def _slot_key(slot_name):
    n = slot_name.lower()
    for key in ("skin", "hair", "eyes", "tunic", "trim", "legs", "leather", "accent"):
        if key in n:
            return key
    return "tunic"


def _cleanup(tmp, before):
    for o in list(tmp.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(tmp)
    for kind, old in before.items():
        store = getattr(bpy.data, kind)
        for d in list(store):
            if d not in old and d.users == 0:
                store.remove(d)


def _fallback(coll):
    """No kit on disk: capsule-and-sphere robed figures from bmesh primitives."""
    from arrival_kit import Kit
    kit = Kit(coll)
    for name, (x, y), _yaw, _clip, _frame, _want, pal in FIGURES:
        robe = _flat(f"ar_people_{name}_tunic", pal["tunic"], 0.8)
        skin = _flat(f"ar_people_{name}_skin", pal["skin"], 0.6)
        hair = _flat(f"ar_people_{name}_hair", pal["hair"], 0.7)
        kit.lathe(name, robe, [(0.0, 0.0), (0.32, 0.0), (0.22, 0.9), (0.2, 1.35), (0.12, 1.48), (0.0, 1.5)],
                  (x, y, 0.0), segs=12)
        kit.sphere(name, skin, 0.12, (x, y, 1.62), segs=10, rings=7)
        kit.sphere(name, hair, 0.125, (x, y, 1.67), scale=(1, 1, 0.7), segs=10, rings=7)
    objs = kit.finalize()
    for o in objs.values():
        o["arrival_people"] = True
    return list(objs.values())
