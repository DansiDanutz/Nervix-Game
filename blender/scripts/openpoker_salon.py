"""A17 salon: the walkable interior of the OpenPoker casino.

Authored around the origin (salon-local). Floor top is z = 0, the entrance door plane is
y = -7 (runtime +Z), and the player looks toward +Y (runtime -Z). Interior is roughly
14 m wide (x -7..7) by 16 m deep (y -7..9), ceiling and gallery 7 to 8 m.
"""

import math

from openpoker_builder import Frame
from openpoker_common import PI, SALON, SALON_ENTRANCE_LOCAL
from openpoker_facade import _spade

ROOM_X = 7.0
ROOM_Y0, ROOM_Y1 = -7.0, 9.0
RC = (-2.8, 2.5)          # roulette centre
COUNTER_C = (-6.2, -1.2)  # reception arc centre
CARD_C = (5.3, -1.6)      # card table centre (alcove, kept inside the wide threshold frame)
DANGG_Y = -3.0            # Dangg door centreline on the alcove back wall
SPAWN = (0.0, -6.0, 0.0)
EXIT = (0.0, -7.6, 0.0)
RECEPTION = (-5.6, -1.2, 0.0)
ROULETTE = (RC[0], RC[1], 0.0)
CARD_TABLE = (CARD_C[0], CARD_C[1], 0.0)
DANGG_DOOR = (6.95, DANGG_Y, 0.0)
DANGG_SIGN = (6.94, DANGG_Y, 3.25)
STAIR_X = (2.4, 4.4)
STAIR_STEPS = 24
STAIR_RUN = 6.0
STAIR_RISE = 4.2

WALK_BOUNDS = {"x_min": -6.9, "x_max": 6.9, "z_min": -6.9, "z_max": 8.9}


def stool_positions():
    return [(RC[0] + 2.35 * math.cos(PI * a / 180.0), RC[1] + 2.35 * math.sin(PI * a / 180.0))
            for a in (45, 135, 225, 315)]


def chair_positions():
    out = []
    for a in (30, 90, 270, 330):
        r = 1.25
        out.append((a, CARD_C[0] + r * math.cos(math.radians(a)), CARD_C[1] + r * math.sin(math.radians(a))))
    return out


def build_salon(coll, m):
    f = Frame(coll)
    _shell(f, m)
    _piers_and_aisle(f, m)
    _gallery_and_stair(f, m)
    _reception(f, m)
    _roulette(f, m)
    _alcove(f, m)
    _lanterns_and_banner(f, m)
    _plants(f, m)
    _entrance_doors(f, m)
    _markers(f)
    f.merge_by_material()
    return f


def _shell(f, m):
    f.box("salon_floor", (14.0, 16.0, 0.3), (0, 1.0, -0.15), m["flags"])
    f.box("salon_ceiling", (14.0, 16.0, 0.4), (0, 1.0, 7.8), m["plaster"])
    left = f.box("salon_wall_left", (0.8, 16.0, 8.0), (-7.4, 1.0, 4.0), m["ashlar"])
    for yc in (-3.5, 0.5, 4.5):
        f.cut(left, "y", yc, 1.4, 1.4, 3.9, -7.4)
        f.box("salon_window_glass", (0.04, 1.2, 3.1), (-7.4, yc, 2.95), m["glass"], shadow=False)
        f.box("salon_window_bar", (0.06, 0.05, 3.1), (-7.4, yc, 2.95), m["iron"])
    right = f.box("salon_wall_right", (0.8, 16.0, 8.0), (7.4, 1.0, 4.0), m["ashlar"])
    f.cut(right, "y", DANGG_Y, 1.3, 0.0, 2.85, 7.4)
    back = f.box("salon_wall_back", (15.6, 0.8, 8.0), (0, 9.4, 4.0), m["ashlar"])
    for xc in (-4.4, 0.0, 4.4):
        f.cut(back, "x", xc, 2.2, 4.4, 3.1, 9.4)
        f.box("salon_arch_view", (2.2, 0.1, 3.1), (xc, 10.3, 5.95), m["sky"], keep=True)
        for sx in (-1.0, 1.0):
            f.box("salon_gallery_curtain", (0.35, 0.2, 2.8), (xc + sx * 1.0, 8.8, 5.9), m["plum"], keep=True)
    front = f.box("salon_wall_front", (15.6, 1.2, 8.6), (0, -7.6, 3.7), m["ashlar"])
    f.cut(front, "x", 0.0, 2.6, 0.0, 3.6, -7.6)
    for xc in (-4.6, 0.0, 4.6):
        f.cut(front, "x", xc, 2.4, 4.4, 2.8, -7.6)
        f.box("salon_loggia_recess", (2.4, 0.1, 2.8), (xc, -7.05, 5.8), m["walnut_dark"])


def _piers_and_aisle(f, m):
    # Central aisle borders (plum bands) and honey limestone piers between the wall openings.
    f.box("salon_aisle_band", (0.25, 16.0, 0.02), (0.9, 1.0, 0.01), m["plum"])
    f.box("salon_aisle_band_gold", (0.04, 16.0, 0.025), (0.62, 1.0, 0.012), m["gold"])
    f.box("salon_aisle_band_gold", (0.04, 16.0, 0.025), (1.18, 1.0, 0.012), m["gold"])
    for y in (-2.0, 6.5):
        f.box("salon_pier_left", (0.9, 0.9, 8.0), (-6.55, y, 4.0), m["limestone"])
    for y in (-0.3, 5.0):
        f.box("salon_pier_right", (0.9, 0.9, 8.0), (6.55, y, 4.0), m["limestone"])


def _gallery_and_stair(f, m):
    f.box("salon_gallery_floor", (11.0, 3.5, 0.2), (0, 7.25, 4.1), m["limestone"])
    f.box("salon_gallery_fascia_l", (7.9, 0.2, 0.7), (-1.55, 5.4, 3.85), m["limestone"])
    f.box("salon_gallery_fascia_r", (1.1, 0.2, 0.7), (4.95, 5.4, 3.85), m["limestone"])
    f.box("salon_gallery_rail_l", (7.9, 0.08, 0.08), (-1.55, 5.6, 5.15), m["walnut"])
    f.box("salon_gallery_rail_r", (1.1, 0.08, 0.08), (4.95, 5.6, 5.15), m["walnut"])
    for x in _frange(-5.4, 2.3, 0.22) + _frange(4.5, 5.4, 0.22):
        f.cyl("salon_baluster", 0.035, 0.9, (x, 5.6, 4.65), m["walnut"], verts=8)
    for sx in (-5.4, 5.4):
        f.box("salon_gallery_side_rail", (0.08, 3.5, 0.08), (sx, 7.25, 5.15), m["walnut"])
        for y in _frange(5.6, 9.0, 0.22):
            f.cyl("salon_baluster", 0.035, 0.9, (sx, y, 4.65), m["walnut"], verts=8)
    # Rear stair: one straight flight of 24 treads, runner per tread, balustrade on the inner side.
    x0, x1 = STAIR_X
    xc = (x0 + x1) / 2.0
    run = STAIR_RUN / STAIR_STEPS
    rise = STAIR_RISE / STAIR_STEPS
    for i in range(STAIR_STEPS):
        y0 = -0.5 + run * i
        ym = y0 + run / 2.0
        top = rise * (i + 1)
        f.box("salon_tread", (x1 - x0, run, top), (xc, ym, top / 2.0), m["limestone_pale"])
        f.box("salon_stair_runner", (1.5, run * 0.92, 0.02), (xc, ym, top + 0.01), m["plum"])
        if i % 3 == 0:
            f.cyl("salon_stair_baluster", 0.035, 0.9, (x0 - 0.05, ym, top + 0.45), m["walnut"], verts=8)
    slope = math.atan2(STAIR_RISE, STAIR_RUN)
    f.box("salon_stair_rail", (0.07, math.hypot(STAIR_RUN, STAIR_RISE), 0.08),
          (x0 - 0.05, 2.5, 3.04), m["walnut"], rot=(slope, 0, 0))


def _frange(a, b, step):
    out, v = [], a
    while v <= b + 1e-9:
        out.append(round(v, 3))
        v += step
    return out


def _reception(f, m):
    cx, cy = COUNTER_C
    r_in, r_out, height = 1.15, 1.9, 1.05
    a0, a1, n = -60.0, 40.0, 10
    step = (a1 - a0) / n
    for k in range(n):
        th = math.radians(a0 + (k + 0.5) * step)
        rm = (r_in + r_out) / 2.0
        chord = rm * math.radians(step)
        f.box("salon_counter", (r_out - r_in, chord * 1.08, height),
              (cx + rm * math.cos(th), cy + rm * math.sin(th), height / 2.0), m["walnut"],
              rot=(0, 0, th))
        f.box("salon_counter_top", (r_out - r_in + 0.12, chord * 1.1, 0.08),
              (cx + rm * math.cos(th), cy + rm * math.sin(th), height + 0.04), m["limestone_pale"],
              rot=(0, 0, th))
    spade_at(f, (cx + 1.93 * math.cos(math.radians(-10)), cy + 1.93 * math.sin(math.radians(-10))),
             0.6, math.radians(-10) + PI / 2, 0.35, m["gold"])
    bell = (cx + 1.5 * math.cos(math.radians(-25)), cy + 1.5 * math.sin(math.radians(-25)))
    f.cyl("salon_bell_base", 0.14, 0.05, (bell[0], bell[1], height + 0.1), m["brass"], verts=16)
    f.sph("salon_bell", 0.11, (bell[0], bell[1], height + 0.2), m["brass"])


def spade_at(f, xy, z, rz, scale, material):
    """Build a gold spade at the origin, then move and turn its parts into place."""
    before = set(f.coll.objects)
    _spade(f, (0.0, 0.0, z), scale, material)
    created = [o for o in f.coll.objects if o not in before]
    for o in created:
        ox, oy, oz = o.location.x, o.location.y, o.location.z
        c, s = math.cos(rz), math.sin(rz)
        o.location = (xy[0] + c * ox - s * oy, xy[1] + s * ox + c * oy, oz)
        o.rotation_euler.z += rz


def _roulette(f, m):
    rx, ry = RC
    f.cyl("salon_rug", 3.0, 0.02, (rx, ry, 0.01), m["plum"], verts=40)
    f.torus("salon_rug_gold", 2.9, 0.04, (rx, ry, 0.03), m["gold"])
    f.cyl("salon_pedestal", 1.1, 0.9, (rx, ry, 0.45), m["walnut"], verts=24)
    f.cyl("salon_pedestal_base", 1.22, 0.08, (rx, ry, 0.04), m["brass"], verts=24)
    f.cyl("salon_rim", 1.72, 0.16, (rx, ry, 0.97), m["walnut"], verts=36)
    f.torus("salon_rim_round", 1.7, 0.09, (rx, ry, 1.05), m["walnut"])
    f.cyl("salon_wheel", 1.3, 0.04, (rx, ry, 1.07), m["walnut_dark"], verts=36)
    f.torus("salon_wheel_fret", 1.2, 0.02, (rx, ry, 1.1), m["gold"])
    for k in range(37):
        th = 2.0 * PI * k / 37.0
        mat = m["zero"] if k == 0 else (m["red"] if k % 2 else m["black"])
        f.box("salon_pocket", (0.14, 0.12, 0.02),
              (rx + 1.2 * math.cos(th), ry + 1.2 * math.sin(th), 1.09), mat, rot=(0, 0, th))
    f.cyl("salon_spindle_cup", 0.18, 0.08, (rx, ry, 1.1), m["brass"], verts=16)
    f.cyl("salon_spindle", 0.08, 0.42, (rx, ry, 1.27), m["brass"], verts=12)
    f.sph("salon_spindle_finial", 0.16, (rx, ry, 1.55), m["brass"])
    for i, (sx, sy) in enumerate(stool_positions()):
        f.cyl("salon_stool_seat", 0.24, 0.12, (sx, sy, 0.66), m["plum"], verts=20)
        f.cyl("salon_stool_post", 0.05, 0.6, (sx, sy, 0.33), m["walnut"], verts=8)
        f.cyl("salon_stool_foot", 0.2, 0.04, (sx, sy, 0.02), m["brass"], verts=16)


def _alcove(f, m):
    plate = f.box("salon_alcove_arch_plate", (0.6, 6.0, 7.6), (4.5, -2.0, 3.8), m["ashlar"])
    f.cut(plate, "y", -2.0, 5.0, 0.0, 6.0, 4.5)
    f.box("salon_alcove_drape_a", (0.2, 0.8, 5.0), (4.95, -4.2, 2.5), m["plum"])
    f.box("salon_alcove_drape_b", (0.2, 0.8, 5.0), (4.95, 0.2, 2.5), m["plum"])
    cx, cy = CARD_C
    f.cyl("salon_card_top_rim", 0.9, 0.08, (cx, cy, 0.74), m["walnut"], verts=32)
    f.cyl("salon_card_felt", 0.82, 0.02, (cx, cy, 0.79), m["felt"], verts=32)
    f.cyl("salon_card_pedestal", 0.12, 0.72, (cx, cy, 0.36), m["walnut"], verts=12)
    f.cyl("salon_card_base", 0.4, 0.05, (cx, cy, 0.025), m["walnut"], verts=24)
    for a, px, py in chair_positions():
        rot = math.radians(a)
        f.box("salon_chair_seat", (0.5, 0.5, 0.08), (px, py, 0.46), m["plum"], rot=(0, 0, rot))
        bx, by = px + 0.22 * math.cos(rot), py + 0.22 * math.sin(rot)
        f.box("salon_chair_back", (0.07, 0.5, 0.5), (bx, by, 0.75), m["plum"], rot=(0, 0, rot))
    # Dangg house door: walnut leaf set into the alcove back wall, blank sign above it.
    f.box("salon_dangg_door", (0.1, 1.2, 2.2), (7.35, DANGG_Y, 1.1), m["walnut"], keep=True)
    f.box("salon_dangg_sign", (0.12, 2.0, 0.5), DANGG_SIGN, m["sign"], keep=True)


def _lanterns_and_banner(f, m):
    for x, y, z in ((-6.7, -5.6, 2.6), (-6.7, 2.9, 2.6), (6.7, -5.6, 2.6), (6.7, 2.9, 2.6),
                    (-6.2, 8.7, 3.2), (6.2, 8.7, 3.2)):
        f.box("salon_lantern_frame", (0.36, 0.4, 0.6), (x, y, z), m["brass"])
        f.sph("salon_lantern_glow", 0.16, (x, y, z), m["glow"])
    f.box("salon_banner", (1.0, 0.1, 3.6), (-5.6, 2.0, 5.6), m["plum"], keep=True)
    f.cyl("salon_banner_rod", 0.04, 1.1, (-5.6, 2.0, 7.45), m["brass"], rot=(0, PI / 2, 0), verts=8)
    spade_at(f, (-5.6, 1.88), 5.7, 0.0, 0.5, m["gold"])


def _plants(f, m):
    for (x, y), kind in (((-6.3, -5.9), "olive"), ((6.3, -5.9), "olive"),
                         ((-6.3, 7.4), "olive"), ((6.3, 7.4), "lemon")):
        f.cyl("salon_pot", 0.36, 0.7, (x, y, 0.35), m["clay"], verts=18)
        f.sph("salon_plant", 0.6, (x, y, 1.2), m["olive" if kind == "olive" else "lemon"])
        if kind == "lemon":
            for k in range(3):
                a = 2.0 * PI * k / 3.0
                f.sph("salon_lemon", 0.08, (x + 0.4 * math.cos(a), y + 0.4 * math.sin(a), 0.95),
                      m["lemon_fruit"])


def _entrance_doors(f, m):
    # Plum leaves, open at 90 degrees and folded flush against the two jambs inside the
    # 1.2 m reveal, so the opening stays clear (2.3 m) and the leaves read from outside.
    for side, name in ((-1.0, "L"), (1.0, "R")):
        f.box(f"salon_door_leaf_{name}", (0.12, 1.15, 2.3), (side * 1.22, -7.6, 1.15), m["plum"], keep=True)
        f.cyl(f"salon_door_handle_{name}", 0.03, 0.3, (side * 1.1, -7.0, 1.1), m["brass"],
              rot=(PI / 2, 0, 0), verts=8)


def _markers(f):
    f.marker("openpoker_salon_spawn", SPAWN, "spawn", "openpoker_salon_spawn", slot="openpoker-salon")
    f.marker("openpoker_salon_exit", EXIT, "exit", "openpoker_salon_exit", slot="openpoker-salon")
    f.marker("openpoker_reception", RECEPTION, "reception", "openpoker_reception", slot="openpoker-host")
    f.marker("openpoker_roulette", ROULETTE, "roulette", "openpoker_roulette", slot="openpoker-roulette")
    f.marker("openpoker_card_table", CARD_TABLE, "card_table", "openpoker_card_table",
             slot="openpoker-cards")
    f.marker("openpoker_dangg_door", DANGG_DOOR, "door", "openpoker_dangg_door", slot="dangg-house")
    f.marker("openpoker_dangg_sign", DANGG_SIGN, "sign", "openpoker_dangg_sign", slot="dangg-house")


def solid_obstacles():
    """Approximate AABBs (salon-local, x0 x1 z0 z1 where z is the Blender y axis) for runtime collision."""
    boxes = {
        "reception_counter": (-5.65, -4.3, -2.9, 0.1),
        "roulette_pedestal": (RC[0] - 1.25, RC[0] + 1.25, RC[1] - 1.25, RC[1] + 1.25),
        "alcove_plate_pier_front": (4.2, 4.8, -5.0, -4.5),
        "alcove_plate_pier_back": (4.2, 4.8, 0.5, 1.0),
        "card_table_pedestal": (CARD_C[0] - 0.9, CARD_C[0] + 0.9, CARD_C[1] - 0.9, CARD_C[1] + 0.9),
        "gallery_stair": (STAIR_X[0], STAIR_X[1], -0.5, 5.5),
    }
    for y in (-2.0, 6.5):
        boxes[f"pier_left_y{y:+.1f}"] = (-7.0, -6.1, y - 0.45, y + 0.45)
    for y in (-0.3, 5.0):
        boxes[f"pier_right_y{y:+.1f}"] = (6.1, 7.0, y - 0.45, y + 0.45)
    for i, (sx, sy) in enumerate(stool_positions()):
        boxes[f"roulette_stool_{i + 1}"] = (sx - 0.25, sx + 0.25, sy - 0.25, sy + 0.25)
    for a, px, py in chair_positions():
        boxes[f"card_chair_{a}"] = (px - 0.25, px + 0.25, py - 0.25, py + 0.25)
    for i, (px, py) in enumerate(((-6.3, -5.9), (6.3, -5.9), (-6.3, 7.4), (6.3, 7.4))):
        boxes[f"pot_{i + 1}"] = (px - 0.4, px + 0.4, py - 0.4, py + 0.4)
    return boxes


SALON_ORIGIN_NOTE = f"entrance local {SALON_ENTRANCE_LOCAL}; salon {SALON} authored around origin"
