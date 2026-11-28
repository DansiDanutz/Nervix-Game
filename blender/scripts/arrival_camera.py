"""Create or update CAM_A01, the judged A01 camera, and write its runtime pose for the game.

Run (headless, from the repository root):
    blender --background --python blender/scripts/arrival_camera.py -- [options]

Options
  --eye X Y Z / --target X Y Z / --vfov DEG   override the pose (Blender frame, Z-up)
  --render TAG    render 1672x941 to docs/evidence/slice/iterations/a01cam-<TAG>.png
  --final         render to docs/evidence/slice/blender-A01-camera.png
  --save          save CAM_A01 into the slice .blend and write app/public/slice/a01-camera.json

Only the object CAM_A01 (in its own collection A01_CAMERA) is created or changed; no scene
content is touched. Renders isolate the arrival square exactly like render_arrival_slice.py.
The district .blend is never opened; its sha256 is checked before and after.
Runtime frame: Blender (x, y, z) -> runtime (x, z, -y). Three.js fov is vertical, matching the
camera's sensor_fit VERTICAL angle_y.
"""

import argparse
import hashlib
import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from openpoker_common import APP_SLICE_DIR, DISTRICT_BLEND, EVIDENCE_DIR, SLICE_BLEND  # noqa: E402
from render_arrival_slice import isolate  # noqa: E402

CAM = "CAM_A01"
COLLECTION = "A01_CAMERA"
WIDTH, HEIGHT = 1672, 941
# Final pose after 10 iterations (docs/evidence/slice/iterations/a01cam-iter*.png); see the rubric.
EYE = (15.6, -1.2, 6.0)
TARGET = (-14.094, -4.583, 3.385)
VFOV_DEG = 66.0
POSE_JSON = os.path.join(APP_SLICE_DIR, "a01-camera.json")
# Landmarks printed after each solve so the frame can be compared with A01 by numbers too.
LANDMARKS = {
    "fountain_base": (0.0, 0.0, 0.3),
    "fountain_spout": (0.0, 0.0, 7.0),
    "casino_portal_doors": (9.65, 8.3, 2.5),
    "casino_front_doors": (0.0, 9.7, 2.4),
    "cafe_awning": (-2.5, -9.0, 3.7),
    "house_door": (15.0, -4.4, 1.8),
    "street_arch": (-44.0, 0.0, 4.0),
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--eye", type=float, nargs=3, default=EYE)
    p.add_argument("--target", type=float, nargs=3, default=TARGET)
    p.add_argument("--vfov", type=float, default=VFOV_DEG)
    p.add_argument("--render", default=None)
    p.add_argument("--final", action="store_true")
    p.add_argument("--save", action="store_true")
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--engine", choices=("eevee", "cycles"), default="eevee")
    p.add_argument("--tag", default=None, help="with --render: output name fid-<tag>.png instead of a01cam-")
    return p.parse_args(argv)


def ensure_camera(eye, target, vfov_deg):
    coll = bpy.data.collections.get(COLLECTION)
    if coll is None:
        coll = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(coll)
    obj = bpy.data.objects.get(CAM)
    if obj is None:
        obj = bpy.data.objects.new(CAM, bpy.data.cameras.new(CAM))
        coll.objects.link(obj)
    cam = obj.data
    cam.sensor_fit = "VERTICAL"
    cam.angle_y = math.radians(vfov_deg)
    cam.clip_start = 0.1
    cam.clip_end = 1200.0
    obj.location = eye
    obj.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
    return obj


def to_runtime(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def pose_record(eye, target, vfov_deg):
    fwd = (Vector(target) - Vector(eye)).normalized()
    yaw = math.degrees(math.atan2(-fwd.x, -(-fwd.y)))  # runtime yaw: 0 faces -Z, +90 faces -X
    return {
        "id": "A01",
        "source": "blender/scripts/arrival_camera.py (CAM_A01 in nervix_city_slice_01.blend)",
        "convention": "runtime = (blender_x, blender_z, -blender_y); fov is vertical degrees",
        "width": WIDTH,
        "height": HEIGHT,
        "position": to_runtime(eye),
        "target": to_runtime(target),
        "up": [0, 1, 0],
        "fov": round(vfov_deg, 4),
        "near": 0.1,
        "far": 1200,
        "yaw_deg": round(yaw, 3),
        "pitch_deg": round(math.degrees(math.asin(fwd.z)), 3),
        "blender": {"eye": list(eye), "target": list(target)},
    }


def report(scene, cam):
    for name, p in LANDMARKS.items():
        c = world_to_camera_view(scene, cam, Vector(p))
        print(f"LANDMARK {name:22s} u={c.x:.3f} v={1 - c.y:.3f} depth={c.z:.1f}")


def use_engine(scene, engine, samples):
    """EEVEE for quick looks; Cycles (GPU when available, denoised) for the judged frames."""
    if engine == "eevee":
        scene.render.engine = "BLENDER_EEVEE"
        scene.eevee.taa_render_samples = samples
        return
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for dev in prefs.devices:
            dev.use = True
        scene.cycles.device = "GPU"
    except (KeyError, TypeError, AttributeError):
        scene.cycles.device = "CPU"


def render(scene, cam, path, samples, engine="eevee"):
    isolate()
    scene.camera = cam
    use_engine(scene, engine, samples)
    scene.render.resolution_x, scene.render.resolution_y = WIDTH, HEIGHT
    scene.render.resolution_percentage = 100
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)


def main():
    args = parse_args()
    before = sha256(DISTRICT_BLEND)
    bpy.ops.wm.open_mainfile(filepath=SLICE_BLEND)
    scene = bpy.context.scene
    saved_res = (scene.render.resolution_x, scene.render.resolution_y)
    scene.render.resolution_x, scene.render.resolution_y = WIDTH, HEIGHT
    cam = ensure_camera(tuple(args.eye), tuple(args.target), args.vfov)
    bpy.context.view_layer.update()
    report(scene, cam)
    if args.save:
        # Save before rendering, with the scene's own resolution restored, so only CAM_A01
        # (and its collection) reaches the file; render isolation stays in memory.
        scene.render.resolution_x, scene.render.resolution_y = saved_res
        bpy.ops.wm.save_as_mainfile(filepath=SLICE_BLEND)
        scene.render.resolution_x, scene.render.resolution_y = WIDTH, HEIGHT
        with open(POSE_JSON, "w") as fh:
            json.dump(pose_record(tuple(args.eye), tuple(args.target), args.vfov), fh, indent=2)
            fh.write("\n")
        print("SAVED", SLICE_BLEND, POSE_JSON)
    if args.final:
        render(scene, cam, os.path.join(EVIDENCE_DIR, "blender-A01-camera.png"), args.samples, args.engine)
    elif args.render:
        name = f"fid-{args.render}.png" if args.tag == "fid" else f"a01cam-{args.render}.png"
        render(scene, cam, os.path.join(EVIDENCE_DIR, "iterations", name), args.samples, args.engine)
    after = sha256(DISTRICT_BLEND)
    print("DISTRICT_SHA256", before, after)
    assert before == after, "district file changed"
    return 0


if __name__ == "__main__":
    sys.exit(main())
