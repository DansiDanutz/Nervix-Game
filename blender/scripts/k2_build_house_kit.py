"""Build the K2 house kit .blend from scratch (idempotent: the file is entirely script-generated).

Run:
    blender --background --factory-startup --python blender/scripts/k2_build_house_kit.py

Writes blender/scenes/nervix_house_kit_01.blend with one collection per house variant
(3 size classes x 3 facades). Object names carry a "<house_id>/" prefix in the .blend so they stay
unique; the exporter strips it, so each GLB has plain node names (slot_1, anchor_door, ...).
Never touches nervix_city_district_01.blend or the slice .blend.
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import k2_details  # noqa: E402
import k2_exterior  # noqa: E402
import k2_interior  # noqa: E402
import k2_roof  # noqa: E402
from k2_geom import Part, empty  # noqa: E402
from k2_materials import build_materials  # noqa: E402
from k2_spec import (BLEND_REL, FACADES, SIZE_CLASSES, door_spec, house_id, sign_spec, to_runtime,  # noqa: E402
                     variants)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BLEND = os.path.join(ROOT, BLEND_REL)
KIT_COLLECTION = "K2_HouseKit"
GRID_X, GRID_Y = 14.0, 16.0


def _named(objs, prefix):
    for o in objs:
        base = o.name.split(".")[0]
        o.name = prefix + base
        if o.data is not None:
            o.data.name = prefix + base
    return objs


def _roof(root, coll, mats, size, facade):
    tiles, under = k2_roof.build_tiles(size, facade, mats)
    k2_roof.build_eave_details(under, size, facade)
    k2_roof.build_chimney(under, size, facade)
    k2_roof.build_pediment(under, size, facade)
    return [tiles.finish(root, coll), under.finish(root, coll)]


def _anchors(root, coll, size, facade, prefix):
    d, sg = door_spec(size, facade), sign_spec(size, facade)
    out = [
        empty(prefix + "anchor_door", d["position"], root, coll,
              {"k2_anchor": "door", "outward": list(to_runtime(d["outward"])), "width": d["width"],
               "height": d["height"]}, display="SINGLE_ARROW", size=0.8),
        empty(prefix + "anchor_sign", sg["position"], root, coll,
              {"k2_anchor": "sign", "normal": list(to_runtime(sg["normal"])), "size": list(sg["size"]),
               "style": sg["style"]}, display="PLAIN_AXES", size=0.3),
    ]
    out[0].rotation_euler = (0, 0, 0)
    return out + k2_interior.build_anchors(root, coll, size, facade, prefix)


def build_house(kit, mats, size, facade, col, row):
    hid = house_id(size, facade)
    prefix = hid + "/"
    coll = bpy.data.collections.new("K2_" + hid)
    kit.children.link(coll)
    root = empty(hid, (col * GRID_X, row * GRID_Y, 0.0), None, coll, {"k2_house": hid, "k2_size_class": size,
                                                                       "k2_facade": facade}, size=1.0)

    def add(objs):
        return _named(objs if isinstance(objs, (list, tuple)) else [objs], prefix)

    add(k2_exterior.build_shell(root, coll, mats, size, facade))
    add(k2_exterior.build_trim(root, coll, mats, size, facade))
    add(k2_exterior.build_windows(root, coll, mats, size, facade))
    add(k2_exterior.build_door(root, coll, mats, size, facade))
    add(k2_exterior.build_sign(root, coll, mats, size, facade))
    add(k2_exterior.build_lanterns(root, coll, mats, size, facade))
    add(k2_exterior.build_planters(root, coll, mats, size, facade))
    add(k2_details.build_details(root, coll, mats, size, facade))
    awning = add(k2_details.build_awning(root, coll, mats, size, facade))[0]
    awning["k2_option"] = True
    awning["k2_default_visible"] = FACADES[facade].awning_default
    awning.hide_render = not FACADES[facade].awning_default
    add(_roof(root, coll, mats, size, facade))
    add(k2_interior.build_shell(root, coll, mats, size))
    add(k2_interior.build_furniture(root, coll, mats, size, facade))
    add(_anchors(root, coll, size, facade, ""))   # add() applies the prefix once
    return root


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    kit = bpy.data.collections.new(KIT_COLLECTION)
    scene.collection.children.link(kit)
    mats = build_materials()
    sizes, facades = list(SIZE_CLASSES), list(FACADES)
    for size, facade in variants():
        build_house(kit, mats, size, facade, facades.index(facade), sizes.index(size))
        print(f"K2 built {house_id(size, facade)}")
    _ = Part
    os.makedirs(os.path.dirname(BLEND), exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
    print(f"K2 saved {BLEND}")


if __name__ == "__main__":
    main()
