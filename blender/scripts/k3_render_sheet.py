"""Render one 3/4 tile per K3 display set plus a line-up, for the contact sheet (headless, EEVEE).

  blender --background blender/scenes/nervix_product_kit_01.blend \
          --python blender/scripts/k3_render_sheet.py -- <tile_dir>

The render rig lives in its own collection and is never saved into the kit .blend.
Compose the sheet afterwards with blender/scripts/k3_compose_sheet.py (system Python + Pillow).
"""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import k3_spec as spec  # noqa: E402
from k3_geom import hex_rgb, srgb_to_linear  # noqa: E402

TILE_W, TILE_H = 640, 760
LINEUP_W, LINEUP_H = 2560, 760
SAMPLES = 48
BACKDROP_HEX = "#FBF2E4"
FLOOR_HEX = "#EADBC4"
CAM_DIR = Vector((-0.55, -1.0, 0.42)).normalized()  # from target toward camera, front-left high


def _lin(hex_str):
    return (*(srgb_to_linear(c) for c in hex_rgb(hex_str)), 1.0)


def _engine(scene):
    items = {e.identifier for e in scene.render.bl_rna.properties["engine"].enum_items}
    for name in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        if name in items:
            return name
    return "CYCLES"


def rig():
    scene = bpy.context.scene
    coll = bpy.data.collections.new(spec.RENDER_COLLECTION)
    scene.collection.children.link(coll)
    scene.render.engine = _engine(scene)
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = SAMPLES
        if hasattr(scene.eevee, "use_raytracing"):
            scene.eevee.use_raytracing = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = -0.5
    world = bpy.data.worlds.new("k3_world")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = _lin(BACKDROP_HEX)
    bg.inputs["Strength"].default_value = 1.1
    scene.world = world

    bpy.ops.mesh.primitive_plane_add(size=40.0, location=(5.0, 0.0, 0.0))
    floor = bpy.context.active_object
    floor.name = "k3_render_floor"
    mat = bpy.data.materials.new("k3_render_floor")
    mat.use_nodes = True
    p = mat.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = _lin(FLOOR_HEX)
    p.inputs["Roughness"].default_value = 0.9
    floor.data.materials.append(mat)

    sun = bpy.data.lights.new("k3_sun", "SUN")
    sun.energy = 3.0
    sun.color = (1.0, 0.86, 0.68)
    sun.angle = math.radians(6)
    sun_obj = bpy.data.objects.new("k3_sun", sun)
    sun_obj.rotation_euler = (math.radians(50), 0.0, math.radians(-35))
    fill = bpy.data.lights.new("k3_fill", "AREA")
    fill.energy = 900.0
    fill.size = 6.0
    fill.color = (1.0, 0.93, 0.84)
    fill_obj = bpy.data.objects.new("k3_fill", fill)
    fill_obj.location = (5.0, -6.0, 4.0)
    fill_obj.rotation_euler = (math.radians(55), 0.0, 0.0)
    cam = bpy.data.cameras.new("k3_cam")
    cam.lens = 50
    cam_obj = bpy.data.objects.new("k3_cam", cam)
    for obj in (sun_obj, fill_obj, cam_obj):
        coll.objects.link(obj)
    for obj in list(floor.users_collection):
        obj.objects.unlink(floor)
    coll.objects.link(floor)
    scene.camera = cam_obj
    return cam_obj


def _aim(cam_obj, target, distance, direction=CAM_DIR):
    cam_obj.location = target + direction * distance
    cam_obj.rotation_euler = (target - cam_obj.location).to_track_quat("-Z", "Y").to_euler()


def _root(obj):
    while obj.parent:
        obj = obj.parent
    return obj


def isolate(cid):
    """Show only one display set (None shows all), so neighbours never leak into a tile."""
    keep = None if cid is None else spec.display_name(cid)
    for obj in bpy.data.collections[spec.KIT_COLLECTION].objects:
        obj.hide_render = keep is not None and _root(obj).name != keep


def render(path, w, h):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = argv[0] if argv else os.path.join(spec.EVIDENCE_DIR, "k3-tiles")
    os.makedirs(out, exist_ok=True)
    cam = rig()
    cam.data.lens = 50
    for d in spec.build_display_sets():
        fx = spec.FIXTURES[d["fixture"]]
        top = fx["product_z"] + spec.PRODUCTS[d["category"]]["size"][2]
        height = max(top, fx["size"][2])
        target = Vector(d["position"]) + Vector((0.0, 0.0, height * 0.5))
        isolate(d["category"])
        _aim(cam, target, 1.25 + height * 1.25)
        render(os.path.join(out, f"{d['category']}.png"), TILE_W, TILE_H)
    sets = spec.build_display_sets()
    mid = (sets[0]["position"][0] + sets[-1]["position"][0]) / 2
    isolate(None)
    cam.data.lens = 35
    _aim(cam, Vector((mid, 0.0, 0.7)), 12.5, Vector((0.0, -1.0, 0.28)).normalized())
    render(os.path.join(out, "lineup.png"), LINEUP_W, LINEUP_H)
    print(f"K3 RENDER OK -> {out}")


if __name__ == "__main__":
    main()
