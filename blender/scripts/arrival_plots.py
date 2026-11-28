"""B2: generic plot doors in the arrival slice.

Each street plot of shared/contracts/house-plots.json (the seeded plots.id rows, migration 017 and
the seed fixtures) gets one door empty plot_<district>_<n> on a modelled door of the frontage or
the street facades, carrying its plot id, district, size class and outward vector. The exporter
reads these empties back into runtime_layout.plots[]. Empties never render and are not exported
to the GLB; no identity is baked (merchant names load at runtime from the server).

Run (headless, from the repository root) to rebuild only the plot empties in the slice file:
    blender --background --python blender/scripts/arrival_plots.py

The specs and validators below are pure (no bpy), so blender/tests/test_arrival_plots.py runs
them in plain Python.
"""

import math
import os
import sys
from dataclasses import dataclass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from arrival_frontage import ARCADE_STEP, HOUSE_DOOR_X, HOUSE_X, HOUSE_Y, SHOP_PLANE, arcade_bay_x  # noqa: E402
from arrival_street import LEFT_FRONT, LEFT_ROW, RIGHT_FRONT, RIGHT_IDX_OFFSET, RIGHT_ROW, ground_bays  # noqa: E402

DISTRICT = "merchant-quarter"     # plots.district of every contract street plot
MARKER_KIND = "plot_door"
DOOR_STEP_OUT = 0.9               # threshold in front of a street door (as arrival_test_builder_door)
ARCADE_THRESHOLD = 2.1            # arcade walkway threshold, metres in front of the shop plane
SIGHTLINE_CLEAR = 3.0             # min distance (m) from the spawn-to-fountain segment: the street
                                  # centre |y| < 2.6 stays clear, plots stand at the facades
DOOR_CLEARANCE = 0.3              # a threshold keeps this far from every walking obstacle
SIZE_CLASSES = ("small", "medium", "large")
SMALL_MAX_WIDTH, MEDIUM_MAX_WIDTH = 6.0, 8.0   # midpoints of the K2 widths 5 / 7 / 9 m


@dataclass(frozen=True)
class PlotSpec:
    plot_id: str
    district: str
    facade: str                   # the scene object group whose door this is
    door: tuple                   # Blender (x, y, z) of the plaza-side threshold
    outward: tuple                # Blender (x, y) unit vector from the facade into the street
    frontage: float               # facade width (m) behind the door, for the size class


def size_class(frontage):
    if frontage < SMALL_MAX_WIDTH:
        return "small"
    return "medium" if frontage < MEDIUM_MAX_WIDTH else "large"


def _street(plot_id, side, i, col=None):
    """A door (or the shopfront in column `col`) of the i-th facade of a street side."""
    left = side == "left"
    x0, x1, _ = (LEFT_ROW if left else RIGHT_ROW)[i]
    xs, door_col = ground_bays(x0, x1, i if left else i + RIGHT_IDX_OFFSET)
    face = 1.0 if left else -1.0
    front = LEFT_FRONT if left else RIGHT_FRONT
    x = xs[door_col if col is None else col]
    return PlotSpec(plot_id, DISTRICT, f"street_{side}_{i + 1:02d}", (x, front + face * DOOR_STEP_OUT, 0.0),
                    (0.0, face), x1 - x0)


def _arcade(plot_id, bay):
    return PlotSpec(plot_id, DISTRICT, f"arcade_bay_{bay:02d}", (arcade_bay_x(bay), SHOP_PLANE + ARCADE_THRESHOLD, 0.0),
                    (0.0, 1.0), ARCADE_STEP)


# Contract order. slot-12 is the A04 house door (the existing arrival_test_builder_door). The
# street doors inside the plaza bounds are crowded: the right row's by a planter and amphorae,
# street_left_01's by the r2 olive canopy (street_props_01), so slot-14 is street_right_02's
# shopfront and the rest are arcade shop bays.
PLOT_SPECS = (
    PlotSpec("slot-12", DISTRICT, "house", (HOUSE_DOOR_X, HOUSE_Y[1] + DOOR_STEP_OUT, 0.0), (0.0, 1.0),
             HOUSE_X[1] - HOUSE_X[0]),
    _arcade("slot-13", 7),
    _street("slot-14", "right", 1, col=1),
    _arcade("slot-15", 6),
    _arcade("slot-16", 5),
    _arcade("slot-17", 4),
    _arcade("slot-18", 3),
)


def object_name(spec):
    return f"plot_{spec.district}_{spec.plot_id.rsplit('-', 1)[-1]}"


def _r(v, nd=3):
    return round(v, nd) + 0.0         # + 0.0: no "-0.0" in the JSON


def runtime_point(p):
    """Blender (x, y, z) -> runtime [x, y, z] = (bx, bz, -by)."""
    return [_r(p[0]), _r(p[2]), _r(-p[1])]


def runtime_dir(d):
    """Blender plan direction (x, y) -> runtime [x, z] = (bx, -by)."""
    return [_r(d[0], 6), _r(-d[1], 6)]


def plot_record(spec):
    outward = runtime_dir(spec.outward)
    return {"id": spec.plot_id, "district": spec.district, "sizeClass": size_class(spec.frontage),
            "door": runtime_point(spec.door), "outward": outward,
            "yaw": _r(math.atan2(outward[0], outward[1]), 6)}


def segment_distance(p, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    length_sq = dx * dx + dz * dz
    t = 0.0 if length_sq == 0 else min(1.0, max(0.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length_sq))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))


def _inside(box, x, z, pad=0.0):
    return box["minX"] - pad <= x <= box["maxX"] + pad and box["minZ"] - pad <= z <= box["maxZ"] + pad


def _plot_errors(p, obstacles, bounds, spawn, fountain):
    pid, (x, _, z) = p["id"], p["door"]
    errors = []
    if not _inside(bounds, x, z):
        errors.append(f"{pid}: door outside the plaza bounds")
    if any(_inside(o, x, z, DOOR_CLEARANCE) for o in obstacles):
        errors.append(f"{pid}: door inside (or within {DOOR_CLEARANCE} m of) an obstacle")
    if segment_distance((x, z), (spawn["x"], spawn["z"]), (fountain["x"], fountain["z"])) <= SIGHTLINE_CLEAR:
        errors.append(f"{pid}: door on the spawn-to-fountain sightline")
    if abs(math.hypot(*p["outward"]) - 1.0) > 1e-3:
        errors.append(f"{pid}: outward is not a unit vector")
    if p["sizeClass"] not in SIZE_CLASSES:
        errors.append(f"{pid}: sizeClass {p['sizeClass']!r} is not one of {SIZE_CLASSES}")
    return errors


def validate_plots(plots, obstacles, bounds, spawn, fountain, contract_ids):
    """Every problem with runtime_layout.plots[] as a list of messages (empty when valid)."""
    ids = [p["id"] for p in plots]
    errors = [f"{i}: duplicate plot id" for i in sorted({i for i in ids if ids.count(i) > 1})]
    errors += [f"{i}: contract plot missing" for i in contract_ids if i not in ids]
    errors += [f"{i}: not a contract plot" for i in ids if i not in contract_ids]
    for p in plots:
        errors += _plot_errors(p, obstacles, bounds, spawn, fountain)
    return errors


# ---- Blender side (bpy only inside these functions) -------------------------------------
def build_plots(coll):
    """Idempotent: delete this module's plot empties, then add one per spec to `coll`."""
    import bpy
    for o in [o for o in bpy.data.objects if o.get("nervix_marker_kind") == MARKER_KIND]:
        bpy.data.objects.remove(o, do_unlink=True)
    made = []
    for spec in PLOT_SPECS:
        o = bpy.data.objects.new(object_name(spec), None)
        o.empty_display_type = "SINGLE_ARROW"     # arrow (+Z local) turned to point outward
        o.location = spec.door
        o.rotation_euler = (math.pi / 2, 0.0, math.atan2(-spec.outward[0], spec.outward[1]))
        o.hide_render = True
        o["nervix_marker_kind"] = MARKER_KIND
        o["nervix_plot_id"] = spec.plot_id
        o["nervix_district"] = spec.district
        o["nervix_size_class"] = size_class(spec.frontage)
        o["nervix_facade"] = spec.facade
        o["outward_blender"] = (spec.outward[0], spec.outward[1], 0.0)
        coll.objects.link(o)
        made.append(o)
    return made


def read_plots(coll):
    """runtime_layout.plots[] from the plot empties in `coll`, in contract (spec) order."""
    order = {s.plot_id: k for k, s in enumerate(PLOT_SPECS)}
    empties = [o for o in coll.all_objects if o.get("nervix_marker_kind") == MARKER_KIND]
    records = []
    for o in sorted(empties, key=lambda e: order.get(e["nervix_plot_id"], len(order))):
        out = runtime_dir(tuple(o["outward_blender"])[:2])
        records.append({"id": o["nervix_plot_id"], "district": o["nervix_district"],
                        "sizeClass": o["nervix_size_class"], "door": runtime_point(tuple(o.matrix_world.translation)),
                        "outward": out, "yaw": _r(math.atan2(out[0], out[1]), 6)})
    return records


def main():
    import bpy
    from build_arrival_slice import ARRIVAL, sha256
    from openpoker_common import DISTRICT_BLEND, SLICE_BLEND
    before = sha256(DISTRICT_BLEND)
    bpy.ops.wm.open_mainfile(filepath=SLICE_BLEND)
    made = build_plots(bpy.data.collections[ARRIVAL])
    bpy.ops.wm.save_as_mainfile(filepath=SLICE_BLEND)
    assert sha256(DISTRICT_BLEND) == before, "district file changed"
    print("PLOTS_BUILT", [o.name for o in made])
    print("DISTRICT_SHA256", before)
    return 0


if __name__ == "__main__":
    sys.exit(main())
