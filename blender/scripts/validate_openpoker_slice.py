"""Validate the OpenPoker slice copy. Prints one CHECK line per rule and a final verdict.

Run:
    blender --background blender/scenes/nervix_city_slice_01.blend \
        --python blender/scripts/validate_openpoker_slice.py

Exit code 0 only when every check passes.
"""

import hashlib
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from openpoker_common import DISTRICT_BLEND, FACADE, MANAGED, SALON, SLICE_BLEND  # noqa: E402
from openpoker_salon import WALK_BOUNDS, solid_obstacles  # noqa: E402

EXPECTED_DISTRICT_SHA256 = "420ebb0e788e47900f4a3b3d6163b15746ef1ce3deaad1d26e5cca5d8fd89676"
MIN_DOOR_HEIGHT = 2.1
ADULT_HEIGHT = 1.8
REQUIRED_MARKERS = {
    "spawn", "exit", "reception", "roulette", "card_table", "door", "sign", "threshold",
}
DOOR_LEAVES = ("salon_door_leaf_L", "salon_door_leaf_R", "salon_dangg_door")
FAILURES = []


def check(name, ok, detail=""):
    print(f"CHECK {name}: {'PASS' if ok else 'FAIL'} {detail}".rstrip())
    if not ok:
        FAILURES.append(name)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_slice():
    bpy.ops.wm.open_mainfile(filepath=SLICE_BLEND)


def owned(name):
    root = bpy.data.collections.get(MANAGED)
    return root.children.get(name) if root else None


def inside(x, y, box):
    x0, x1, y0, y1 = box
    return x0 <= x <= x1 and y0 <= y <= y1


def main():
    load_slice()
    facade = owned(FACADE)
    salon = owned(SALON)
    check("collections_exist", facade is not None and salon is not None,
          f"facade={facade is not None} salon={salon is not None}")

    leaves = [bpy.data.objects.get(n) for n in DOOR_LEAVES]
    heights = [o.dimensions.z for o in leaves if o is not None]
    check("door_height_min_2_1m", len(heights) == len(DOOR_LEAVES) and min(heights) >= MIN_DOOR_HEIGHT,
          f"leaf heights={[round(h, 2) for h in heights]}")

    fig = bpy.data.objects.get("figure_1_8m")
    fig_ok = fig is not None and abs(fig.dimensions.z - ADULT_HEIGHT) < 0.01
    check("adult_1_8m_figure_present", fig_ok, f"height={fig.dimensions.z if fig else None}")
    if fig_ok:
        r = fig.dimensions.x / 2.0
        cx, cy = fig.location.x, fig.location.y
        inside_bounds = (WALK_BOUNDS["x_min"] + r <= cx <= WALK_BOUNDS["x_max"] - r
                         and WALK_BOUNDS["z_min"] + r <= cy <= WALK_BOUNDS["z_max"] - r)
        blocked = [k for k, b in solid_obstacles().items()
                   if inside(cx, cy, (b[0] - r, b[1] + r, b[2] - r, b[3] + r))]
        clears_door = 3.6 > ADULT_HEIGHT
        check("adult_1_8m_fits_salon", inside_bounds and not blocked and clears_door,
              f"at=({cx:.2f},{cy:.2f}) blocked_by={blocked or 'none'} door_clear_top=3.6")

    markers = [o for c in (facade, salon) if c for o in c.objects if o.get("nervix_marker_kind")]
    kinds = {o["nervix_marker_kind"] for o in markers}
    missing = sorted(REQUIRED_MARKERS - kinds)
    props_ok = all(o.get("nervix_asset_id") for o in markers)
    check("markers_present", not missing and props_ok,
          f"kinds={sorted(kinds)} missing={missing} props_ok={props_ok}")

    text_objs = [o.name for o in bpy.data.objects if o.type in {"FONT", "CURVE", "SURFACE", "META"}]
    check("no_text_objects", not text_objs, f"found={text_objs or 'none'}")

    bad_types = []
    for c in (facade, salon):
        for o in c.objects:
            if o.type not in {"MESH", "EMPTY"}:
                bad_types.append(f"{o.name}:{o.type}")
    check("owned_collections_export_types", not bad_types, f"bad={bad_types or 'none'}")

    old = bpy.data.collections.get("Casino")
    check("old_casino_excluded", old is not None and old.hide_viewport and old.hide_render,
          "Casino collection hidden in the copy")

    digest = sha256(DISTRICT_BLEND)
    check("district_file_unchanged", digest == EXPECTED_DISTRICT_SHA256, f"sha256={digest}")

    print("VALIDATION", "FAIL" if FAILURES else "PASS", f"failures={FAILURES}" if FAILURES else "")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
