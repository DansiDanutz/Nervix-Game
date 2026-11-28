"""Render the street spawn view (CAM_arrival_spawn, the game's first-frame pose) in EEVEE or Cycles.

Run:
    blender --background --python blender/scripts/arrival_render_spawn.py -- [--engine cycles]
        [--samples 64] [--out docs/evidence/slice/blender-arrival-street.png]

Opens the slice file read-only (never saved); visibility is isolated in memory exactly like
render_arrival_slice.py. The district .blend is never opened.
"""

import argparse
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from arrival_camera import use_engine  # noqa: E402
from openpoker_common import EVIDENCE_DIR, ROOT, SLICE_BLEND  # noqa: E402
from render_arrival_slice import isolate  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--engine", choices=("eevee", "cycles"), default="cycles")
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--out", default=os.path.join(EVIDENCE_DIR, "blender-arrival-street.png"))
    args = p.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=SLICE_BLEND)
    scene = bpy.context.scene
    isolate()
    scene.camera = bpy.data.objects["CAM_arrival_spawn"]
    use_engine(scene, args.engine, args.samples)
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    scene.render.resolution_percentage = 100
    out = args.out if os.path.isabs(args.out) else os.path.join(ROOT, args.out)
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("RENDERED", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
