"""Build the A01 arrival square into the collection ARRIVAL of the slice copy.

Run (headless, from the repository root):
    blender --background --python blender/scripts/build_arrival_slice.py

Opens blender/scenes/nervix_city_slice_01.blend, deletes and rebuilds ONLY the ARRIVAL collection
(objects, their meshes, the arrival camera and sun), then saves the slice file. The district file
is never opened; its sha256 is checked before and after.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from arrival_casino import build_casino  # noqa: E402
from arrival_frontage import HOUSE_DOOR_X, HOUSE_Y, build_frontage  # noqa: E402
from arrival_kit import Kit  # noqa: E402
from arrival_materials import build_materials  # noqa: E402
from arrival_people import build_people  # noqa: E402
from arrival_plots import build_plots  # noqa: E402
from arrival_dressing import build_dressing  # noqa: E402
from arrival_skyline import build_skyline, build_world  # noqa: E402
from arrival_skyline_far import build_skyline_far  # noqa: E402
from arrival_square import build_square  # noqa: E402
from arrival_street import build_street  # noqa: E402
from openpoker_common import DISTRICT_BLEND, SLICE_BLEND  # noqa: E402

ARRIVAL = "ARRIVAL"
CAM = "CAM_arrival_spawn"
SUN = "arrival_sun"
CAM_EYE = (21.98, 0.70, 1.98)     # runtime (21.98, 1.98, -0.70): settled cameraRig pose
CAM_TARGET = (13.0, 0.70, 1.52)   # runtime (13, 1.52, -0.70)
CAM_VFOV_DEG = 55.0
# Fidelity r1: low golden-hour sun from the left and behind the square (A01). It travels toward
# +x (the A01 camera) and +y (screen right), so long shadows fall forward-right over the paving
# and the casino front (normal -y) is lit. The elevation keeps the square out of the left
# rows' shadow (a 19 deg sun left the whole square in shade in fid-r1-iter1; at 32 deg from the
# left the 10 m cafe row still shaded it). ~40 deg from back-left lights the square and the casino.
SUN_TRAVEL = (0.55, 0.52, -0.55)   # r2: ~36 deg (was ~41), longer raking shadows
SUN_COLOUR = (1.0, 0.7, 0.42)
SUN_STRENGTH = 7.5        # r2: 9.0 washed the lit paving out to cream under AgX
SUN_ANGLE_DEG = 3.5
BEVEL_WIDTH = 0.07
EXPOSURE = 0.3            # AgX Punchy reads dark at golden hour; A01 is a bright warm painting


def sha256(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def reset_collection():
    coll = bpy.data.collections.get(ARRIVAL)
    if coll is None:
        coll = bpy.data.collections.new(ARRIVAL)
        bpy.context.scene.collection.children.link(coll)
    for o in list(coll.objects):
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:
            for store in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
                if data.name in store and store[data.name] == data:
                    store.remove(data)
                    break
    return coll


def add_camera(coll):
    cam = bpy.data.cameras.new(CAM)
    cam.sensor_fit = "VERTICAL"
    cam.angle_y = math.radians(CAM_VFOV_DEG)
    cam.clip_start = 0.1
    cam.clip_end = 1200.0
    o = bpy.data.objects.new(CAM, cam)
    o.location = CAM_EYE
    o.rotation_euler = (Vector(CAM_TARGET) - Vector(CAM_EYE)).to_track_quat("-Z", "Y").to_euler()
    coll.objects.link(o)
    return o


def add_sun(coll):
    ld = bpy.data.lights.new(SUN, "SUN")
    ld.energy = SUN_STRENGTH
    ld.color = SUN_COLOUR
    ld.angle = math.radians(SUN_ANGLE_DEG)
    o = bpy.data.objects.new(SUN, ld)
    travel = Vector(SUN_TRAVEL).normalized()
    o.rotation_euler = Vector((0.0, 0.0, -1.0)).rotation_difference(travel).to_euler()
    o.location = tuple(-60.0 * travel)
    coll.objects.link(o)
    return o


def add_markers(coll):
    door = bpy.data.objects.new("arrival_test_builder_door", None)
    door.empty_display_type = "SINGLE_ARROW"
    door.location = (HOUSE_DOOR_X, HOUSE_Y[1] + 0.9, 0.0)
    door["nervix_marker_kind"] = "door"
    door["nervix_slot"] = "test-builder-house"
    door["outward_blender"] = (0.0, 1.0, 0.0)
    coll.objects.link(door)
    spawn = bpy.data.objects.new("arrival_spawn", None)
    spawn.location = (19.0, -0.6, 0.0)
    spawn["nervix_marker_kind"] = "spawn"
    coll.objects.link(spawn)


def bevel_tagged(objs):
    for o in objs.values():
        if o.get("arrival_bevel"):
            mod = o.modifiers.new("chunky_bevel", "BEVEL")
            mod.width = BEVEL_WIDTH
            mod.segments = 1
            mod.limit_method = "ANGLE"
            mod.angle_limit = math.radians(40)


def configure_scene(scene, cam):
    scene.camera = cam
    scene.world = build_world()
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = EXPOSURE
    try:
        scene.view_settings.look = "AgX - Punchy"
    except TypeError:  # look names differ between builds; keep the base AgX look
        scene.view_settings.look = "None"
    scene.eevee.taa_render_samples = 32


def main():
    before = sha256(DISTRICT_BLEND)
    print("DISTRICT_SHA256_BEFORE", before)
    bpy.ops.wm.open_mainfile(filepath=SLICE_BLEND)
    assert os.path.abspath(bpy.data.filepath) == os.path.abspath(SLICE_BLEND)
    coll = reset_collection()
    m = build_materials()
    kit = Kit(coll)
    build_square(kit, m)
    build_frontage(kit, m)
    build_street(kit, m)
    build_casino(kit, m)
    build_skyline(kit, m)
    build_skyline_far(kit, m)
    build_dressing(kit, m)
    objs = kit.finalize()
    bevel_tagged(objs)
    people = build_people(coll)
    print("ARRIVAL_PEOPLE", [o.name for o in people])
    cam = add_camera(coll)
    add_sun(coll)
    add_markers(coll)
    print("ARRIVAL_PLOTS", [o.name for o in build_plots(coll)])
    configure_scene(bpy.context.scene, cam)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs.values())
    bpy.ops.wm.save_as_mainfile(filepath=SLICE_BLEND)
    after = sha256(DISTRICT_BLEND)
    print("ARRIVAL_BUILT objects", len(objs), "tris_pre_bevel", tris)
    print("DISTRICT_SHA256_AFTER", after)
    assert before == after, "district file changed"
    return 0


if __name__ == "__main__":
    sys.exit(main())
