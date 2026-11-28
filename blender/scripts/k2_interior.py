"""K2 house kit: enterable interior shell (terracotta floor, plaster walls with a plum wainscot,
beamed ceiling), shelves and a display table carrying slot_N empties, and the merchant counter with
the anchor_station empty. Layout comes from k2_spec so tests and the runtime see the same numbers."""

from k2_geom import Part, empty
from k2_spec import (CEILING_Z, FLOOR_Z, SHELF_LEVELS, TABLE_TOP, furniture, interior_bounds, slot_specs,
                     station_spec, to_runtime)


def build_shell(root, coll, mats, size):
    x0, x1, y0, y1, z0, z1 = interior_bounds(size)
    floor = Part("interior_floor", mats)
    floor.box_minmax((x0, y0, FLOOR_Z - 0.02), (x1, y1, FLOOR_Z + 0.006), "floor")
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    floor.box((cx, cy + 0.2, FLOOR_Z + 0.009), ((x1 - x0) * 0.45, (y1 - y0) * 0.35, 0.006), "rug")
    walls = Part("interior_walls", mats)
    t = 0.02
    walls.box_minmax((x0, y1 - t, z0), (x1, y1, z1), "plaster")
    walls.box_minmax((x0, y0, z0), (x0 + t, y1, z1), "plaster")
    walls.box_minmax((x1 - t, y0, z0), (x1, y1, z1), "plaster")
    walls.box_minmax((x0, y1 - t - 0.01, z0), (x1, y1 - t, 0.95), "wainscot")
    walls.box_minmax((x0 + t, y0, z0), (x0 + t + 0.01, y1, 0.95), "wainscot")
    walls.box_minmax((x1 - t - 0.01, y0, z0), (x1 - t, y1, 0.95), "wainscot")
    for x, y, sx, sy in ((cx, y1 - t - 0.02, x1 - x0, 0.03), (x0 + t + 0.02, cy, 0.03, y1 - y0),
                         (x1 - t - 0.02, cy, 0.03, y1 - y0)):
        walls.box((x, y, 0.97), (sx, sy, 0.05), "wood_dark")
    ceil = Part("interior_ceiling", mats)
    ceil.box_minmax((x0, y0, z1), (x1, y1, z1 + 0.05), "plaster")
    n = max(3, int((y1 - y0) / 1.1))
    for i in range(n):
        y = y0 + (y1 - y0) * (i + 0.5) / n
        ceil.box((cx, y, z1 - 0.09), (x1 - x0, 0.16, 0.18), "wood_dark")
    lights = Part("interior_lights", mats)
    for i in range(2 if x1 - x0 < 5 else 3):
        lx = x0 + (x1 - x0) * (i + 0.5) / (2 if x1 - x0 < 5 else 3)
        lights.rod((lx, cy, z1), (lx, cy, z1 - 0.55), 0.012, "iron", 6)
        lights.box((lx, cy, z1 - 0.72), (0.2, 0.2, 0.3), "glow")
        lights.cyl((lx, cy, z1 - 0.53), 0.16, 0.1, "brass", 8, radius2=0.04)
        lights.box((lx, cy, z1 - 0.9), (0.24, 0.24, 0.05), "brass")
    return [p.finish(root, coll) for p in (floor, walls, ceil, lights)]


def _shelf(p, f):
    cx, cy, _ = f["center"]
    sx, sy, sz = f["size"]
    along_x = f["axis"] == "x"
    if along_x:   # back panel against the wall behind the shelf
        p.box((cx, cy + sy / 2 - 0.02, FLOOR_Z + sz / 2), (sx, 0.04, sz), "wood_dark")
    else:
        wall = 1.0 if cx > 0 else -1.0
        p.box((cx + wall * (sx / 2 - 0.02), cy, FLOOR_Z + sz / 2), (0.04, sy, sz), "wood_dark")
    for z in (FLOOR_Z + 0.25, *SHELF_LEVELS, FLOOR_Z + sz - 0.02):
        p.box((cx, cy, z - 0.02), (sx, sy, 0.04), "wood")
    ends = [(cx - sx / 2 + 0.02, cy), (cx + sx / 2 - 0.02, cy)] if along_x else [(cx, cy - sy / 2 + 0.02), (cx, cy + sy / 2 - 0.02)]
    for ex, ey in ends:
        p.box((ex, ey, FLOOR_Z + sz / 2), (0.04 if along_x else sx, sy if along_x else 0.04, sz), "wood")
    cols = f["cols"]
    length = sx if along_x else sy
    for i in range(1, cols):
        t = -length / 2 + length * i / cols
        pos = (cx + t, cy, FLOOR_Z + sz / 2) if along_x else (cx, cy + t, FLOOR_Z + sz / 2)
        p.box(pos, (0.03 if along_x else sx, sy if along_x else 0.03, sz), "wood")


def _table(p, f):
    cx, cy, _ = f["center"]
    sx, sy, _ = f["size"]
    top = FLOOR_Z + TABLE_TOP
    p.box((cx, cy, top - 0.03), (sx, sy, 0.06), "wood")
    p.box((cx, cy, top - 0.09), (sx - 0.1, sy - 0.1, 0.06), "wood_dark")
    for dx in (-sx / 2 + 0.08, sx / 2 - 0.08):
        for dy in (-sy / 2 + 0.08, sy / 2 - 0.08):
            p.box((cx + dx, cy + dy, (FLOOR_Z + top - 0.06) / 2), (0.07, 0.07, top - 0.06 - FLOOR_Z), "wood_dark")


def _counter(p, f):
    cx, cy, _ = f["center"]
    sx, sy, sz = f["size"]
    p.box((cx, cy, FLOOR_Z + sz / 2 - 0.03), (sx, sy, sz - 0.06), "wood")
    p.box((cx, cy - sy / 2 - 0.005, FLOOR_Z + 0.5), (sx - 0.12, 0.01, 0.62), "teal")
    p.box((cx, cy, FLOOR_Z + sz - 0.025), (sx + 0.08, sy + 0.08, 0.05), "stone_trim")
    p.box((cx, cy - sy / 2 - 0.045, FLOOR_Z + sz - 0.07), (sx + 0.08, 0.02, 0.04), "brass")
    p.box((cx, cy - sy / 2 - 0.01, FLOOR_Z + 0.06), (sx, 0.02, 0.12), "wood_dark")


def build_furniture(root, coll, mats, size, facade):
    p = Part("interior_furniture", mats)
    for f in furniture(size, facade):
        {"shelf": _shelf, "table": _table, "counter": _counter}[f["kind"]](p, f)
    return p.finish(root, coll)


def build_anchors(root, coll, size, facade, prefix):
    out = []
    for i, s in enumerate(slot_specs(size, facade), start=1):
        out.append(empty(prefix + s["name"], s["position"], root, coll,
                         {"k2_slot": i, "k2_surface": s["surface"], "k2_max_extent": s["max_extent"]},
                         display="CUBE", size=0.12))
    st = station_spec(size, facade)
    out.append(empty(prefix + "anchor_station", st["position"], root, coll,
                     {"k2_anchor": "station", "facing": list(to_runtime(st["facing"]))}, display="SINGLE_ARROW",
                     size=0.6))
    return out
