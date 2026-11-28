"""Render the arrival-square spawn view from CAM_arrival_spawn (the game camera pose).

Run:
    blender --background blender/scenes/nervix_city_slice_01.blend \
        --python blender/scripts/render_arrival_slice.py -- [--tag iter1] [--samples 32]

Visibility is changed in memory only (the file is not saved): the arrival square, the existing
OpenPoker facade dressing and the arrival sun render; the district chunks, the salon (authored at
the origin), the old render rig and reference planes do not.
--tag final writes docs/evidence/slice/blender-arrival-street.png; any other tag writes
docs/evidence/slice/iterations/blender-arrival-<tag>.png.
"""

import argparse
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from openpoker_common import EVIDENCE_DIR, FACADE  # noqa: E402

KEEP = {"ARRIVAL", FACADE}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--tag", default="iter")
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--percent", type=int, default=100)
    return p.parse_args(argv)


def isolate():
    keep_objs = set()
    for name in KEEP:
        c = bpy.data.collections.get(name)
        if c is None:
            raise RuntimeError(f"collection {name} missing")
        keep_objs.update(c.all_objects)
    for o in bpy.data.objects:
        o.hide_render = o not in keep_objs
    for c in bpy.data.collections:
        c.hide_render = False


def main():
    args = parse_args()
    scene = bpy.context.scene
    isolate()
    scene.camera = bpy.data.objects["CAM_arrival_spawn"]
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = args.samples
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    scene.render.resolution_percentage = args.percent
    if args.tag == "final":
        path = os.path.join(EVIDENCE_DIR, "blender-arrival-street.png")
    else:
        path = os.path.join(EVIDENCE_DIR, "iterations", f"blender-arrival-{args.tag}.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
