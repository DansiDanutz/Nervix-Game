"""Render the K1 contact sheet to docs/evidence/kits/k1-sheet.png (the .blend is not saved).

Run (headless, from the repository root):
    blender --background blender/scenes/nervix_characters_01.blend --python blender/scripts/k1_render.py

Row 1: every preset at three-quarter view (idle). Row 2: the first preset front, side and back,
then walk, run and talk poses. Row 3: the reference figures (A01 plaza walkers, A13, A14, A15)
at the same tile height, so the sheet is read side by side with the art.
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from k1_anim import frame_count  # noqa: E402
from k1_common import (COLLECTION, EVIDENCE_DIR, PARTS, REFERENCE_DIR, RIG, SLOTS,  # noqa: E402
                       hex_to_linear, material_name, part_node, presets)

TILE_W, TILE_H = 300, 520
BACKGROUND = "#f7e9da"
TMP = os.path.join(EVIDENCE_DIR, "_k1_tiles")
# Reference crops: (file, x0, y0, x1, y1) in pixels, top-left origin.
REFERENCE_CROPS = [
    ("A01-plaza.png", 1055, 425, 1105, 500),
    ("A01-plaza.png", 1462, 475, 1515, 570),
    ("A13-merchant.png", 110, 20, 520, 990),
    ("A14-cafe-keeper.png", 100, 20, 530, 990),
    ("A15-traveler.png", 90, 15, 545, 990),
    ("A15-traveler.png", 1000, 15, 1450, 990),
]


def setup_scene():
    scene = bpy.context.scene
    engines = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = TILE_W, TILE_H
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("k1_sheet_world")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = hex_to_linear(BACKGROUND)
    bg.inputs["Strength"].default_value = 0.9
    scene.world = world
    cam_data = bpy.data.cameras.new("k1_sheet_cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.05
    cam = bpy.data.objects.new("k1_sheet_cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0.0, -6.0, 0.98)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.camera = cam
    sun = bpy.data.objects.new("k1_sheet_sun", bpy.data.lights.new("k1_sheet_sun", "SUN"))
    sun.data.energy = 3.2
    sun.data.color = (1.0, 0.93, 0.84)
    sun.rotation_euler = (math.radians(50), math.radians(-12), math.radians(-35))
    scene.collection.objects.link(sun)
    fill = bpy.data.objects.new("k1_sheet_fill", bpy.data.lights.new("k1_sheet_fill", "SUN"))
    fill.data.energy = 1.0
    fill.data.color = (0.85, 0.85, 1.0)
    fill.rotation_euler = (math.radians(70), 0, math.radians(150))
    scene.collection.objects.link(fill)
    floor = bpy.data.meshes.new("k1_sheet_floor")
    floor.from_pydata([(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [], [(0, 1, 2, 3)])
    floor_obj = bpy.data.objects.new("k1_sheet_floor", floor)
    mat = bpy.data.materials.new("sheet_floor")
    mat.diffuse_color = hex_to_linear("#e9d3bd")
    floor.materials.append(mat)
    scene.collection.objects.link(floor_obj)
    return scene


def apply_preset(preset):
    for slot in SLOTS:
        mat = bpy.data.materials[material_name(slot)]
        mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = \
            hex_to_linear(preset["palette"][slot])
    for part_id, category, _ in PARTS:
        obj = bpy.data.objects[part_node(part_id)]
        obj.hide_render = not (category == "base" or part_id in preset["parts"])


def render_tile(scene, rig, path, clip="idle", frame=0, yaw_deg=-30):
    rig.animation_data.action = bpy.data.actions[clip]
    rig.rotation_euler = (0, 0, math.radians(yaw_deg))
    scene.frame_set(frame)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def load_rgba(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)  # bottom-up rows


def fit(arr, w, h, background):
    """Scale to fit w x h (nearest), centred on the background colour."""
    ah, aw = arr.shape[:2]
    scale = min(w / aw, h / ah)
    nw, nh = max(1, int(aw * scale)), max(1, int(ah * scale))
    ys = (np.arange(nh) / scale).astype(int).clip(0, ah - 1)
    xs = (np.arange(nw) / scale).astype(int).clip(0, aw - 1)
    out = np.empty((h, w, 4), dtype=np.float32)
    out[:] = background
    y0, x0 = (h - nh) // 2, (w - nw) // 2
    out[y0:y0 + nh, x0:x0 + nw] = arr[ys][:, xs]
    return out


def reference_tiles(background):
    tiles = []
    for name, x0, y0, x1, y1 in REFERENCE_CROPS:
        full = load_rgba(os.path.join(REFERENCE_DIR, name))
        h = full.shape[0]
        crop = full[h - y1:h - y0, x0:x1]
        tiles.append(fit(crop, TILE_W, TILE_H, background))
    return tiles


def save_sheet(rows, path):
    sheet = np.concatenate([np.concatenate(r, axis=1) for r in reversed(rows)], axis=0)
    h, w = sheet.shape[:2]
    img = bpy.data.images.new("k1_sheet", w, h, alpha=True)
    img.pixels.foreach_set(sheet.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


def main():
    os.makedirs(TMP, exist_ok=True)
    scene = setup_scene()
    rig = bpy.data.objects[RIG]
    all_presets = presets()
    row1 = []
    for preset in all_presets:
        apply_preset(preset)
        row1.append(render_tile(scene, rig, os.path.join(TMP, f"preset_{preset['id']}.png")))
    apply_preset(all_presets[0])
    poses = [("front", "idle", 0, 0), ("side", "idle", 0, -90), ("back", "idle", 0, 180),
             ("walk", "walk", frame_count("walk") // 4, -60), ("run", "run", frame_count("run") // 4, -60),
             ("talk", "talk", frame_count("talk") // 4, -25)]
    row2 = [render_tile(scene, rig, os.path.join(TMP, f"pose_{n}.png"), c, f, y) for n, c, f, y in poses]
    background = np.array(list(hex_to_srgb(BACKGROUND)) + [1.0], dtype=np.float32)
    rows = [[load_rgba(p) for p in row1], [load_rgba(p) for p in row2], reference_tiles(background)]
    out = os.path.join(EVIDENCE_DIR, "k1-sheet.png")
    save_sheet(rows, out)
    for name in os.listdir(TMP):
        os.remove(os.path.join(TMP, name))
    os.rmdir(TMP)
    print(f"K1 sheet {out}")


def hex_to_srgb(hex_colour):
    h = hex_colour.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


if __name__ == "__main__":
    main()
