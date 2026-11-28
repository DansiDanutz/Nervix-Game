"""Render the two OpenPoker evidence stills from the slice copy.

Run (headless, from the repository root):
    blender --background blender/scenes/nervix_city_slice_01.blend \
        --python blender/scripts/render_openpoker_slice.py -- --tag iter1 [--shot salon|facade|both]

The file on disk is not saved by this script. Each shot hides what is not part of it:
both shots hide the district (the shared Blender scene places the salon at the origin, inside the
plaza). The salon shot hides the facade and the ground. The facade shot moves the salon to its
district placement in memory (restored afterwards) so the front wall and loggia openings exist,
and hides the salon's interior lights.
Outputs: docs/evidence/slice/blender-<shot>-<tag>.png, and the canonical names without a tag
when --tag final is given.
"""

import argparse
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from openpoker_common import EVIDENCE_DIR, FACADE, MANAGED, SALON, SALON_PLACE  # noqa: E402

SHOTS = {
    "salon": ("cam.salon_threshold", "blender-salon-threshold"),
    "facade": ("cam.facade_threequarter", "blender-facade-threequarter"),
}
DISTRICT_CHILDREN = ("Plaza", "Street", "MerchantHouse", "Cafe", "Casino", "CafeInterior", "NPCs", "Props")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--tag", default="iter")
    p.add_argument("--shot", default="both", choices=["salon", "facade", "both"])
    return p.parse_args(argv)


def set_visibility(shot):
    managed = bpy.data.collections[MANAGED]
    hide_district = True
    for child in managed.children:
        if child.name in DISTRICT_CHILDREN:
            child.hide_render = hide_district
        elif child.name == FACADE:
            child.hide_render = shot == "salon"
        elif child.name == SALON:
            child.hide_render = False
    refs = bpy.data.collections.get("NERVIX_REFERENCES")
    if refs is not None:
        refs.hide_render = True
    ground = bpy.data.objects.get("render_ground")
    if ground is not None:
        ground.hide_render = shot == "salon"
    for o in bpy.data.objects:
        if o.get("nervix_salon_light"):
            o.hide_render = shot == "facade"


def shift_salon(delta):
    """In memory only: move the salon objects by delta (the placed position in the district)."""
    for o in bpy.data.collections[MANAGED].children[SALON].objects:
        o.location = (o.location.x + delta[0], o.location.y + delta[1], o.location.z + delta[2])


def render_shot(shot, tag):
    cam_name, stem = SHOTS[shot]
    scene = bpy.context.scene
    scene.camera = bpy.data.objects[cam_name]
    set_visibility(shot)
    placed = shot == "facade"
    if placed:
        # The facade shot shows the assembled casino: the salon at its district placement.
        shift_salon(SALON_PLACE)
    os.makedirs(EVIDENCE_DIR, exist_ok=True)
    name = f"{stem}.png" if tag == "final" else f"{stem}-{tag}.png"
    scene.render.filepath = os.path.join(EVIDENCE_DIR, name)
    try:
        bpy.ops.render.render(write_still=True)
    finally:
        if placed:
            shift_salon(tuple(-v for v in SALON_PLACE))
    print("RENDERED", shot, scene.render.filepath)


def main():
    args = parse_args()
    shots = ["salon", "facade"] if args.shot == "both" else [args.shot]
    for shot in shots:
        render_shot(shot, args.tag)
    return 0


if __name__ == "__main__":
    sys.exit(main())
