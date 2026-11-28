"""Render the K2 house kit contact sheet: rows = size class (small, medium, large); columns =
facades (shutters, awning, loggia) at a 3/4 street view, then an interior cutaway with the slot
markers (gold cubes) and the merchant station (teal cone). Does not save the .blend.

Run:
    blender --background blender/scenes/nervix_house_kit_01.blend \
        --python blender/scripts/k2_render_sheet.py
Writes docs/evidence/kits/k2-sheet.png and docs/evidence/kits/k2-compare-A04.png.
"""

import math
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from k2_materials import flat, srgb  # noqa: E402
from k2_roof import ridge_height  # noqa: E402
from k2_spec import FACADES, SIZE_CLASSES, house_id, interior_bounds, slot_specs, station_spec  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "docs", "evidence", "kits")
TILE = 520
TMP = tempfile.mkdtemp(prefix="k2_sheet_")


def setup_scene():
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    sc.render.resolution_x = sc.render.resolution_y = TILE
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    world = bpy.data.worlds.new("k2_world")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (*srgb("#F3DDC0"), 1.0)
    bg.inputs["Strength"].default_value = 0.9
    sc.world = world
    sun = bpy.data.objects.new("k2_sun", bpy.data.lights.new("k2_sun", "SUN"))
    sun.data.energy = 3.6
    sun.data.color = srgb("#FFE6C2")
    sun.data.angle = math.radians(3)
    sun.rotation_euler = (math.radians(50), math.radians(-12), math.radians(-35))
    sc.collection.objects.link(sun)
    ground = bpy.data.meshes.new("k2_ground")
    ground.from_pydata([(-3000, -3000, -0.005), (3000, -3000, -0.005), (3000, 3000, -0.005), (-3000, 3000, -0.005)],
                       [], [(0, 1, 2, 3)])
    g = bpy.data.objects.new("k2_ground", ground)
    g.data.materials.append(flat("k2_render_ground", "#EAD3B4", 0.95))
    sc.collection.objects.link(g)
    cam = bpy.data.objects.new("k2_cam", bpy.data.cameras.new("k2_cam"))
    cam.data.lens = 50
    cam.data.clip_end = 20000
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam


def aim(cam, target, direction, dist):
    loc = Vector(target) + Vector(direction).normalized() * dist
    cam.location = loc
    cam.rotation_euler = (Vector(target) - loc).to_track_quat("-Z", "Y").to_euler()


def show_only(root_name, interior=False):
    for o in bpy.data.objects:
        if o.name.startswith("k2_") or o.type in {"LIGHT", "CAMERA"}:
            continue
        mine = o.name == root_name or o.name.startswith(root_name + "/")
        hide = not mine
        if mine and interior:
            base = o.name.split("/", 1)[-1]
            hide = not (base.startswith("interior_") and base != "interior_ceiling")
        if mine and not interior and o.get("k2_option") and not o.get("k2_default_visible"):
            hide = True
        o.hide_render = hide


def markers(root, size, facade):
    made = []
    gold, teal = flat("k2_render_slot", "#F2C14E", 0.4, emit=0.6), flat("k2_render_station", "#2F9F94", 0.5)
    for s in slot_specs(size, facade):
        me = bpy.data.meshes.new("k2_m")
        h = 0.16
        me.from_pydata([(x, y, z) for x in (-h, h) for y in (-h, h) for z in (0, 2 * h)], [],
                       [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)])
        me.materials.append(gold)
        o = bpy.data.objects.new("k2_marker", me)
        o.location = root.location + Vector(s["position"])
        bpy.context.scene.collection.objects.link(o)
        made.append(o)
    st = station_spec(size, facade)
    bpy.ops.mesh.primitive_cone_add(radius1=0.25, depth=1.7, location=root.location + Vector(st["position"]) + Vector((0, 0, 0.85)))
    cone = bpy.context.active_object
    cone.name = "k2_station_marker"
    cone.data.materials.append(teal)
    made.append(cone)
    return made


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def load_rgb(path, size=None):
    img = bpy.data.images.load(path)
    if size:
        img.scale(*size)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    cream = np.array([0.96, 0.90, 0.82], np.float32)
    a = px[..., 3:4]
    px = px[..., :3] * a + cream * (1 - a)
    bpy.data.images.remove(img)
    return px


def save_rgb(arr, path):
    h, w, _ = arr.shape
    img = bpy.data.images.new("k2_sheet_out", w, h, alpha=False)
    rgba = np.concatenate([arr, np.ones((h, w, 1), np.float32)], axis=2)[::-1]
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def main():
    sc, cam = setup_scene()
    sizes, facades = list(SIZE_CLASSES), list(FACADES)
    tiles = {}
    for r, size in enumerate(sizes):
        s = SIZE_CLASSES[size]
        for c, facade in enumerate(facades):
            root = bpy.data.objects[house_id(size, facade)]
            show_only(root.name)
            top = ridge_height(size, facade)
            target = root.location + Vector((0, s.depth * 0.3, top * 0.45))
            aim(cam, target, (-0.55, -1.0, 0.33), 1.55 * max(s.width, top) / math.tan(cam.data.angle / 2) * 0.5)
            tiles[(r, c)] = render(os.path.join(TMP, f"{size}_{facade}.png"))
        facade = facades[r]
        root = bpy.data.objects[house_id(size, facade)]
        show_only(root.name, interior=True)
        made = markers(root, size, facade)
        x0, x1, y0, y1, _, _ = interior_bounds(size)
        target = root.location + Vector(((x0 + x1) / 2, (y0 + y1) / 2 + 0.3, 0.6))
        aim(cam, target, (0.35, -1.0, 1.25), 1.05 * s.width / math.tan(cam.data.angle / 2))
        tiles[(r, 3)] = render(os.path.join(TMP, f"{size}_{facade}_interior.png"))
        for o in made:
            bpy.data.objects.remove(o)
    sheet = np.ones((TILE * 3, TILE * 4, 3), np.float32)
    for (r, c), path in tiles.items():
        sheet[r * TILE:(r + 1) * TILE, c * TILE:(c + 1) * TILE] = load_rgb(path)
    os.makedirs(OUT_DIR, exist_ok=True)
    save_rgb(sheet, os.path.join(OUT_DIR, "k2-sheet.png"))
    ref = os.path.join(ROOT, "assets", "references", "A04-merchant-house-v2.png")
    a04 = load_rgb(ref, (int(TILE * 1536 / 1024), TILE))
    strip = np.concatenate([a04, load_rgb(tiles[(0, 0)]), load_rgb(tiles[(1, 1)])], axis=1)
    save_rgb(strip, os.path.join(OUT_DIR, "k2-compare-A04.png"))
    print("K2 sheet written", os.path.join(OUT_DIR, "k2-sheet.png"))


if __name__ == "__main__":
    main()
