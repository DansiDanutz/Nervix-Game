"""Build the OpenPoker casino slice (A16 facade + A17 salon) into the slice copy.

Run (headless, from the repository root):
    blender --background --python blender/scripts/build_openpoker_slice.py

Writes only to blender/scenes/nervix_city_slice_01.blend (a copy of the district file, created
on first run). The district file is never opened for writing. Re-running rebuilds only the
three owned child collections under NERVIX_MANAGED.
"""

import math
import os
import shutil
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from openpoker_common import (  # noqa: E402
    CASINO_OLD, DISTRICT_BLEND, FACADE, OWNED, RENDER, SALON, SALON_PLACE, SLICE_BLEND,
    clear_owned_collection, resolve_collection,
)
from openpoker_facade import build_facade  # noqa: E402
from openpoker_common import set_box_projection_uv  # noqa: E402
from openpoker_materials import build_materials  # noqa: E402
from openpoker_salon import SALON_ORIGIN_NOTE, SPAWN, build_salon  # noqa: E402


def sha256(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def open_slice_copy():
    if not os.path.exists(SLICE_BLEND):
        shutil.copy2(DISTRICT_BLEND, SLICE_BLEND)
    bpy.ops.wm.open_mainfile(filepath=SLICE_BLEND)
    assert os.path.abspath(bpy.data.filepath) == os.path.abspath(SLICE_BLEND), bpy.data.filepath


def hide_old_casino():
    old = bpy.data.collections.get(CASINO_OLD)
    if old is not None:
        old.hide_viewport = True
        old.hide_render = True


def add_lights_and_cameras(coll, materials):
    sun_data = bpy.data.lights.new("sun.openpoker", "SUN")
    sun_data.energy = 5.0
    sun_data.color = (1.0, 0.82, 0.58)
    sun_data.angle = math.radians(1.6)
    sun = bpy.data.objects.new("sun.openpoker", sun_data)
    coll.objects.link(sun)
    travel = Vector((1.0, 0.35, -0.62)).normalized()
    sun.rotation_euler = Vector((0.0, 0.0, -1.0)).rotation_difference(travel).to_euler()
    sun.location = (0.0, 0.0, 12.0)

    lanterns = [(-6.7, -5.6, 2.6), (-6.7, 2.9, 2.6), (6.7, -5.6, 2.6), (6.7, 2.9, 2.6),
                (-6.2, 8.7, 3.2), (6.2, 8.7, 3.2), (0.0, -6.3, 5.8)]
    for i, (x, y, z) in enumerate(lanterns):
        ld = bpy.data.lights.new(f"lantern_light_{i + 1}", "POINT")
        ld.energy = 220.0
        ld.color = (1.0, 0.7, 0.4)
        ld.shadow_soft_size = 0.25
        ld.use_shadow = False
        lo = bpy.data.objects.new(f"lantern_light_{i + 1}", ld)
        lo["nervix_salon_light"] = True
        lo.location = (x, y, z)
        coll.objects.link(lo)

    fill_data = bpy.data.lights.new("fill.salon_ceiling", "AREA")
    fill_data.energy = 260.0
    fill_data.color = (1.0, 0.86, 0.68)
    fill_data.size = 12.0
    fill_data.size_y = 14.0
    fill_data.use_shadow = False
    fill = bpy.data.objects.new("fill.salon_ceiling", fill_data)
    fill.location = (0.0, 1.0, 7.3)
    fill.rotation_euler = (0.0, 0.0, 0.0)
    coll.objects.link(fill)

    cam_s = bpy.data.cameras.new("cam.salon_threshold")
    cam_s.lens = 14.0
    cam_s.sensor_width = 36.0
    cam_so = bpy.data.objects.new("cam.salon_threshold", cam_s)
    cam_so.location = (SPAWN[0], SPAWN[1], SPAWN[2] + 1.65)
    cam_so.rotation_euler = (math.pi / 2, 0.0, 0.0)
    coll.objects.link(cam_so)

    cam_f = bpy.data.cameras.new("cam.facade_threequarter")
    cam_f.lens = 35.0
    cam_f.sensor_width = 36.0
    cam_fo = bpy.data.objects.new("cam.facade_threequarter", cam_f)
    eye = Vector((-16.5, -7.0, 2.0))
    target = Vector((0.5, 10.5, 6.2))
    cam_fo.location = eye
    cam_fo.rotation_euler = (target - eye).to_track_quat("-Z", "Y").to_euler()
    coll.objects.link(cam_fo)

    ground_mat = materials["flags"]
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0.0, 10.0, -0.01))
    ground = bpy.context.object
    ground.name = "render_ground"
    ground.scale = (60.0, 60.0, 1.0)
    ground.data.materials.append(ground_mat)
    for c in list(ground.users_collection):
        c.objects.unlink(ground)
    coll.objects.link(ground)
    ground["nervix_render_only"] = True
    set_box_projection_uv(ground)

    fig_data = bpy.data.meshes.new("figure_1_8m_mesh")
    fig_mesh = bpy.data.objects.new("figure_1_8m", fig_data)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12, radius1=0.22,
                          radius2=0.22, depth=1.8)
    bm.to_mesh(fig_data)
    bm.free()
    fig_mesh.location = (-4.6, -6.2, 0.9)
    fig_mesh.hide_render = True
    coll.objects.link(fig_mesh)
    return cam_so, cam_fo


def configure_scene(scene, salon_cam, facade_cam):
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1672
    scene.render.resolution_y = 941
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.eevee.taa_render_samples = 64
    scene.camera = salon_cam
    if scene.world is None:
        scene.world = bpy.data.worlds.new("NervixWorld")
    scene.world.use_nodes = False
    scene.world.color = (0.72, 0.58, 0.44)


def main():
    district_hash_before = sha256(DISTRICT_BLEND)
    print("DISTRICT_SHA256_BEFORE", district_hash_before)
    open_slice_copy()
    scene = bpy.context.scene
    hide_old_casino()
    materials = build_materials()

    facade_coll = resolve_collection(scene, FACADE)
    salon_coll = resolve_collection(scene, SALON)
    render_coll = resolve_collection(scene, RENDER)
    for coll in (facade_coll, salon_coll, render_coll):
        clear_owned_collection(coll)

    build_facade(facade_coll, materials)
    build_salon(salon_coll, materials)
    salon_cam, facade_cam = add_lights_and_cameras(render_coll, materials)
    configure_scene(scene, salon_cam, facade_cam)

    for coll in (facade_coll, salon_coll):
        coll.hide_render = False
        coll.hide_viewport = False
    render_coll.hide_render = False

    bpy.ops.wm.save_as_mainfile(filepath=SLICE_BLEND)
    district_hash_after = sha256(DISTRICT_BLEND)
    print("DISTRICT_SHA256_AFTER", district_hash_after)
    print("SLICE_SAVED", SLICE_BLEND, "| salon origin:", SALON_ORIGIN_NOTE, "| placed at D", SALON_PLACE)
    print("OBJECTS", {c.name: len(c.objects) for c in (facade_coll, salon_coll, render_coll)})
    assert district_hash_before == district_hash_after, "district file changed"
    return 0


if __name__ == "__main__":
    sys.exit(main())
