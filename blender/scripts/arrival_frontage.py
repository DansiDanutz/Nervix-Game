"""Left frontage of the A01 square (runtime +z, Blender -y): the A04 merchant house lining the
spawn street (door near the square end), the A05 cafe with its scalloped teal awning and
terrace, the A08 arcade receding west, plus A10 planting, A11 lanterns and the foreground
terrace balustrade.

Identity is never baked: the house carries a blank hanging board and the door marker only.
"""

import math

from arrival_props import (bench, flower_bush, gable_roof_x, lamp_post, potted_olive, urn_with_flowers,
                           wall_lantern, window)

HOUSE_X = (13.8, 22.8)
HOUSE_Y = (-11.1, -4.6)        # lines the left of the spawn street; front at y = -4.6 faces +y
HOUSE_DOOR_X = 15.0            # door near the square end so it reads in the spawn frame
CAFE_X = (-8.5, 3.4)
CAFE_FRONT = -10.5
ARCADE_X = (-42.0, -8.5)
ARCADE_PLANE = -8.5
ARCADE_BAYS = 8
ARCADE_STEP = (ARCADE_X[1] - ARCADE_X[0]) / ARCADE_BAYS
SHOP_PLANE = -12.5


def build_frontage(kit, m):
    _house(kit, m)
    _cafe(kit, m)
    _cafe_terrace(kit, m)
    _arcade(kit, m)
    _terrace_left(kit, m)
    _lantern_posts(kit, m)
    _greenery(kit, m)


def _flower_box(kit, name, m, x, y, z, w, face=1.0):
    """Clay sill box with bougainvillea leaf cards and a trailing vine card (alpha cards, A01/A04)."""
    kit.box(name, m["clay"], (w, 0.32, 0.26), (x, y + face * 0.2, z))
    n = max(2, int(w / 0.45))
    for k in range(n):
        px = x - w / 2 + (k + 0.5) * w / n
        kit.card(name, m["card_bloom"], (px, y + face * 0.24, z + 0.05), 0.6, 0.55, 0.15 * (k % 3 - 1), cell=k)
        kit.card(name, m["card_bloom"], (px, y + face * 0.26, z + 0.05), 0.55, 0.5, math.pi / 2, cell=k + 1)
        if k % 2 == 0:   # vine trailing over the front of the box
            kit.card(name, m["card_vine"], (px, y + face * 0.38, z + 0.1), 0.45, 0.8, 0.0, cell=k + 2, lift=0.8)


def _vine(kit, name, m, x, y, z0, z1, face=1.0, sway=0.25, seed=0):
    """Climbing vine: overlapping leaf cards up a wall, every third card in bougainvillea bloom."""
    k, z = 0, z0
    while z < z1:
        dx = sway * math.sin(1.7 * k + seed)
        mat = m["card_bloom"] if k % 3 == 1 else m["card_vine"]
        kit.card(name, mat, (x + dx, y + face * 0.16, z), 1.0, 1.0, 0.0, cell=k + seed, tilt=-0.12 * face)
        kit.card(name, m["card_vine"], (x + dx, y + face * 0.3, z + 0.3), 0.8, 0.8, 0.5 * (k % 2 * 2 - 1),
                 cell=k + seed + 1)
        k, z = k + 1, z + 0.6


def _greenery(kit, m):
    """Round 3: vines and flower boxes along the left merchant frontage that the spawn sees
    (house corner x 13.8..16.2 in frame, the cafe front and its upper windows)."""
    fy = HOUSE_Y[1]
    # Ivy trailing along the house string course over the door, and a sill box at the lantern.
    for k in range(5):
        x = 14.1 + k * 0.5
        kit.card("house_vines", m["card_vine"], (x, fy + 0.3, 3.95), 0.7, 0.9, 0.0, cell=k, lift=0.9)
    _flower_box(kit, "house_flowerbox", m, 16.0, fy, 4.35, 1.1)
    # Cafe: a box under every upper window, a vine up each end pier and a garland on the cornice.
    x0, x1 = CAFE_X
    f = CAFE_FRONT + 0.3
    for k in range(4):
        _flower_box(kit, "cafe_flowerbox", m, x0 + 1.5 + k * 2.95, f, 5.2, 1.4)
    for vx, seed in ((x1 - 0.15, 0), (x0 + 0.15, 3)):
        _vine(kit, "cafe_vines", m, vx, f, 0.4, 8.0, seed=seed)
    for k in range(int((x1 - x0) / 0.7)):   # garland trailing from the cornice
        x = x0 + 0.35 + k * 0.7
        kit.card("cafe_vines", m["card_bloom"] if k % 3 == 0 else m["card_vine"],
                 (x, f + 0.45, 4.95 - 0.12 * math.sin(k * 1.3)), 0.9, 0.7, 0.0, cell=k, lift=0.6)


# ---- A04 merchant house ----------------------------------------------------------
def _house(kit, m):
    x0, x1 = HOUSE_X
    y0, fy = HOUSE_Y
    kit.box_mm("house_walls", m["ashlar"], x0, x1, y0, fy, 0.0, 7.8)
    kit.tag("house_walls", arrival_obstacle=True, arrival_bevel=True)
    kit.box_mm("house_trim", m["limestone_pale"], x0 - 0.15, x1 + 0.15, fy - 0.02, fy + 0.2, 0.0, 0.45)
    kit.box_mm("house_trim", m["limestone_pale"], x0 - 0.1, x1 + 0.1, fy - 0.02, fy + 0.25, 3.7, 3.9)
    for x, sgn in ((x0, 1.0), (x1, -1.0)):  # quoins on the street face and the square end
        for k in range(10):
            kit.box("house_trim", m["limestone_pale"], (0.5 if k % 2 else 0.35, 0.14, 0.38),
                    (x + sgn * 0.12, fy + 0.06, 0.6 + k * 0.72))
    gable_roof_x(kit, "house_roof", m, x0, x1, y0, fy, 7.8, 2.6)
    for k in range(11):  # teal rafter ends under the front eave (A04)
        kit.box("house_rafters", m["teal"], (0.18, 0.7, 0.18), (x0 + 0.3 + k * 0.84, fy + 0.25, 7.45))
    kit.box_mm("house_chimney", m["ashlar"], 20.1, 21.0, -9.3, -8.4, 8.0, 11.6)
    kit.box("house_chimney", m["terracotta"], (1.2, 1.2, 0.25), (20.55, -8.85, 11.7))
    _house_door(kit, m, HOUSE_DOOR_X, fy)
    _house_shop_window(kit, m, 18.7, fy)
    bench(kit, "house_bench", m, 21.4, fy + 0.75)
    kit.tag("house_bench", arrival_obstacle=True)
    _house_balcony(kit, m, fy)
    _house_planting(kit, m, fy)


def _house_door(kit, m, dx, fy):
    """Generic arched teal door, stone surround, lantern and a blank hanging board (no identity)."""
    kit.box("house_door_surround", m["limestone_pale"], (2.1, 0.22, 2.6), (dx, fy + 0.09, 1.55))
    kit.cyl("house_door_surround", m["limestone_pale"], 1.05, 0.22, (dx, fy + 0.09, 2.85), verts=24,
            rot=(math.pi / 2, 0, 0))
    kit.box("house_door", m["teal"], (1.5, 0.1, 2.35), (dx, fy + 0.2, 1.43))
    kit.cyl("house_door", m["teal"], 0.75, 0.1, (dx, fy + 0.2, 2.6), verts=20, rot=(math.pi / 2, 0, 0))
    for z in (0.7, 2.2):
        kit.box("house_door_iron", m["iron"], (1.4, 0.04, 0.06), (dx, fy + 0.26, z))
    kit.blob("house_door_iron", m["gold"], 0.09, (dx + 0.45, fy + 0.28, 1.3))
    kit.box("house_step", m["limestone_pale"], (2.2, 0.6, 0.18), (dx, fy + 0.3, 0.09))
    wall_lantern(kit, "house_lantern", m, dx + 1.35, fy, 2.7)
    kit.box("house_sign_arm", m["iron"], (0.06, 1.3, 0.06), (dx - 1.3, fy + 0.65, 4.3))
    kit.box("house_sign_board", m["blank_sign"], (0.1, 1.0, 0.62), (dx - 1.3, fy + 0.8, 3.85))
    kit.box("house_sign_board", m["gold"], (0.12, 1.08, 0.06), (dx - 1.3, fy + 0.8, 4.18))


def _house_shop_window(kit, m, wx, fy):
    """Arched shop window with warm display shelves and a teal panel (A04)."""
    kit.box("house_shopwin_surround", m["limestone_pale"], (3.0, 0.22, 2.4), (wx, fy + 0.09, 1.95))
    kit.cyl("house_shopwin_surround", m["limestone_pale"], 1.5, 0.22, (wx, fy + 0.09, 3.15), verts=24,
            rot=(math.pi / 2, 0, 0))
    kit.box("house_shopwin", m["interior"], (2.4, 0.1, 2.0), (wx, fy + 0.19, 2.15))
    kit.cyl("house_shopwin", m["interior"], 1.2, 0.1, (wx, fy + 0.19, 3.15), verts=20, rot=(math.pi / 2, 0, 0))
    for z in (1.6, 2.35, 3.05):
        kit.box("house_shopwin_shelf", m["wood"], (2.3, 0.2, 0.06), (wx, fy + 0.26, z))
        for k in range(5):
            kit.lathe("house_shopwin_goods", m["clay"] if k % 2 else m["teal"],
                      [(0.0, 0.0), (0.12, 0.0), (0.16, 0.15), (0.07, 0.3), (0.0, 0.3)],
                      (wx - 0.9 + k * 0.45, fy + 0.3, z + 0.03), segs=10)
    kit.box("house_shopwin_panel", m["teal"], (2.6, 0.14, 0.75), (wx, fy + 0.16, 0.72))
    for sx in (-1.0, 1.0):
        kit.box("house_shopwin_shutter", m["teal"], (0.7, 0.08, 2.6), (wx + sx * 1.95, fy + 0.12, 2.3))


def _house_balcony(kit, m, fy):
    bx0, bx1 = 17.9, 21.8   # starts above the spawn frame's top edge (no lattice cut off at the top)
    kit.box_mm("house_balcony", m["limestone"], bx0, bx1, fy, fy + 1.1, 4.1, 4.4)
    for x in (bx0 + 0.3, (bx0 + bx1) / 2, bx1 - 0.3):
        kit.box("house_balcony", m["limestone"], (0.3, 0.9, 0.5), (x, fy + 0.45, 3.85))
    kit.box_mm("house_balcony_rail", m["teal"], bx0, bx1, fy + 1.0, fy + 1.1, 5.25, 5.35)
    for k in range(int((bx1 - bx0) / 0.82)):  # X lattice panels
        cx = bx0 + 0.42 + k * 0.82
        for ang in (0.8, -0.8):
            kit.box("house_balcony_rail", m["teal"], (0.06, 0.06, 1.15), (cx, fy + 1.05, 4.85), rot=(0, ang, 0))
        kit.box("house_balcony_rail", m["teal"], (0.1, 0.1, 0.9), (cx - 0.41, fy + 1.05, 4.85))
    for wx in (16.0, 20.0):
        window(kit, "house_upper_window", m, wx, fy, 4.55, w=1.0, h=1.9)
        out = 1.25 if wx > bx0 else 0.25   # on the balcony, or a sill box on the wall
        kit.box("house_flowerbox", m["clay"], (1.1, 0.3, 0.25), (wx, fy + out, 5.45 if out > 1 else 4.45))
        flower_bush(kit, "house_flowers", m, wx, fy + out + 0.05, 5.5 if out > 1 else 4.5, r=0.42)
    kit.box("house_banner", m["plum"], (0.75, 0.05, 1.5), (18.0, fy + 1.15, 4.5))
    kit.box("house_banner_gold", m["gold"], (0.28, 0.05, 0.28), (18.0, fy + 1.19, 4.1), rot=(0, math.pi / 4, 0))


def _house_planting(kit, m, fy):
    potted_olive(kit, "house_pot_olive", m, 22.3, fy + 0.7, 0.9)
    urn_with_flowers(kit, "house_pot_urn", m, (13.95, fy + 0.5, 0.0), 0.4)
    kit.lathe("house_pot_clay", m["clay"], [(0.0, 0.0), (0.18, 0.0), (0.32, 0.35), (0.2, 0.7), (0.12, 0.9),
                                            (0.0, 0.9)], (16.15, fy + 0.4, 0.0), segs=14)
    for g in ("house_pot_olive", "house_pot_urn", "house_pot_clay"):
        kit.tag(g, arrival_obstacle=True)
    for k in range(9):  # climbing vine on the square corner, bougainvillea over the door
        kit.blob("house_vines", m["olive"] if k % 2 else m["leaf_dark"], 0.45, (13.95, fy + 0.25, 0.8 + k * 0.75),
                 scale=(0.8, 0.5, 1.1))
    for k in range(6):
        flower_bush(kit, "house_vines", m, 14.0 + k * 0.5, fy + 0.25, 3.3 + 0.12 * math.sin(k), r=0.3)


# ---- A05 cafe -------------------------------------------------------------------
def _cafe(kit, m):
    x0, x1 = CAFE_X
    f = CAFE_FRONT
    kit.arcade("cafe_walls", m["ashlar"], "x", x0, x1, 3, 2.7, 2.6, 4.4, f, 0.6, soffit=m["limestone_pale"])
    kit.box_mm("cafe_walls", m["ashlar"], x0, x1, -17.0, f + 0.3, 4.4, 8.4)
    kit.box_mm("cafe_walls", m["ashlar"], x0, x1, -17.0, -12.6, 0.0, 4.4)
    kit.box_mm("cafe_walls", m["ashlar"], x0, x0 + 0.3, -12.6, f, 0.0, 4.4)
    kit.box_mm("cafe_walls", m["ashlar"], x1 - 0.3, x1, -12.6, f, 0.0, 4.4)
    kit.tag("cafe_walls", arrival_obstacle=True, arrival_bevel=True)
    kit.box_mm("cafe_interior", m["interior"], x0 + 0.3, x1 - 0.3, -12.62, -12.55, 0.0, 4.4)
    kit.box_mm("cafe_interior", m["plaster"], x0 + 0.3, x1 - 0.3, -12.6, f - 0.3, 4.3, 4.4)
    for k in range(3):
        cx = x0 + (k + 0.5) * (x1 - x0) / 3
        kit.box("cafe_interior", m["wood"], (2.2, 0.5, 1.0), (cx, -12.2, 0.5))
        kit.sphere("cafe_interior_glow", m["glow"], 0.18, (cx, -11.4, 3.5), segs=10, rings=6)
        for j in range(4):
            kit.box("cafe_interior", m["clay"], (0.18, 0.18, 0.3), (cx - 0.6 + j * 0.4, -12.3, 1.15))
    for k in range(4):  # upper windows with teal shutters
        window(kit, "cafe_upper_window", m, x0 + 1.5 + k * 2.95, f + 0.3, 5.4, w=0.9, h=1.7, glow=k == 1)
    gable_roof_x(kit, "cafe_roof", m, x0, x1, -17.0, f + 0.3, 8.4, 2.2)
    kit.box_mm("cafe_cornice", m["limestone_pale"], x0 - 0.1, x1 + 0.1, f + 0.2, f + 0.5, 4.35, 4.6)
    # Teal scalloped awning (A05): sloped canvas, scallop valance with cream edge, iron rods.
    ax0, ax1, y_wall, y_out, z_wall, z_out = x0 + 0.2, x1 - 0.2, f + 0.3, f + 2.7, 4.15, 3.35
    kit.poly("cafe_awning", m["teal_light"], [(ax0, y_wall, z_wall), (ax0, y_out, z_out), (ax1, y_out, z_out),
                                               (ax1, y_wall, z_wall)])
    kit.poly("cafe_awning", m["teal_light"], [(ax1, y_wall, z_wall - 0.03), (ax1, y_out, z_out - 0.03),
                                               (ax0, y_out, z_out - 0.03), (ax0, y_wall, z_wall - 0.03)])
    n = int((ax1 - ax0) / 0.62)   # r2: deeper scallops with a cream edge and gold tassels (A01)
    for k in range(n):
        x = ax0 + 0.31 + k * (ax1 - ax0 - 0.62) / max(n - 1, 1)
        kit.cyl("cafe_awning_valance", m["cloth_cream"], 0.34, 0.03, (x, y_out + 0.01, z_out - 0.2), verts=14,
                rot=(math.pi / 2, 0, 0), smooth=False)
        kit.cyl("cafe_awning_valance", m["teal_light"], 0.3, 0.04, (x, y_out + 0.02, z_out - 0.18), verts=14,
                rot=(math.pi / 2, 0, 0), smooth=False)
        kit.sphere("cafe_awning_valance", m["gold"], 0.05, (x, y_out + 0.04, z_out - 0.56), segs=6, rings=4)
    kit.box_mm("cafe_awning_valance", m["teal_light"], ax0, ax1, y_out - 0.01, y_out + 0.03, z_out - 0.2, z_out + 0.05)
    for k in range(int((ax1 - ax0) / 0.9)):   # cream stripes on the canvas
        x = ax0 + 0.45 + k * 0.9
        kit.poly("cafe_awning_valance", m["cloth_cream"], [(x - 0.12, y_wall + 0.05, z_wall + 0.012),
                                                          (x - 0.12, y_out - 0.05, z_out + 0.012),
                                                          (x + 0.12, y_out - 0.05, z_out + 0.012),
                                                          (x + 0.12, y_wall + 0.05, z_wall + 0.012)])
    for x in (ax0 + 0.3, (ax0 + ax1) / 2, ax1 - 0.3):
        kit.box("cafe_awning_rods", m["iron"], (0.04, 2.5, 0.04), (x, (y_wall + y_out) / 2 - 0.05, (z_wall + z_out) / 2 - 0.1),
                rot=(math.atan2(z_wall - z_out, y_out - y_wall), 0, 0))
    for k in (1, 2):
        wall_lantern(kit, "cafe_lantern", m, x0 + k * (x1 - x0) / 3, f + 0.3, 2.9)


def _cafe_terrace(kit, m):
    tables = [(-6.6, -8.4), (-3.6, -7.0), (-0.5, -8.3), (1.9, -6.6)]
    for i, (x, y) in enumerate(tables):
        kit.cyl("cafe_terrace", m["iron"], 0.05, 0.75, (x, y, 0.0), verts=8)
        kit.cyl("cafe_terrace", m["iron"], 0.3, 0.04, (x, y, 0.0), verts=12)
        kit.cyl("cafe_terrace", m["wood"], 0.5, 0.05, (x, y, 0.74), verts=20)
        kit.cyl("cafe_terrace", m["cloth_cream"], 0.08, 0.12, (x, y, 0.79), verts=8)
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            cx, cy = x + 0.85 * math.cos(a), y + 0.85 * math.sin(a)
            kit.box("cafe_terrace", m["teal"], (0.42, 0.42, 0.05), (cx, cy, 0.46), rot=(0, 0, a))
            kit.box("cafe_terrace", m["teal"], (0.06, 0.42, 0.5), (x + 1.05 * math.cos(a), y + 1.05 * math.sin(a), 0.72),
                    rot=(0, 0, a))
            for j in (-0.16, 0.16):
                kit.box("cafe_terrace", m["iron"], (0.03, 0.03, 0.45),
                        (cx - math.sin(a) * j, cy + math.cos(a) * j, 0.22))
        if i % 2 == 0:  # teal umbrellas with scalloped edge on alternate tables
            kit.cyl("cafe_terrace", m["wood_dark"], 0.035, 2.3, (x, y, 0.0), verts=6)
            kit.lathe("cafe_terrace", m["teal_light"], [(1.35, 2.15), (0.7, 2.45), (0.0, 2.62)], (x, y, 0.0), segs=16,
                      cap=False)
            for k in range(16):
                a = 2 * math.pi * (k + 0.5) / 16
                kit.sphere("cafe_terrace", m["cloth_cream"], 0.13, (x + 1.33 * math.cos(a), y + 1.33 * math.sin(a), 2.08),
                           scale=(1, 1, 0.6), segs=6, rings=4)
        kit.cyl("cafe_terrace", m["clay"], 0.1, 0.12, (x + 0.15, y, 0.79), verts=8)
        kit.blob("cafe_terrace", m["flower_magenta"], 0.09, (x + 0.15, y, 0.97))
    kit.tag("cafe_terrace", arrival_obstacle=True)
    potted_olive(kit, "cafe_planters", m, -8.0, -9.6, 1.0)
    potted_olive(kit, "cafe_planters", m, 3.1, -9.7, 0.9)
    kit.tag("cafe_planters", arrival_obstacle=True)


# ---- A08 arcade -----------------------------------------------------------------
def _arcade(kit, m):
    x0, x1 = ARCADE_X
    p = ARCADE_PLANE
    step = ARCADE_STEP
    w = step - 0.9
    for i in range(ARCADE_BAYS + 1):
        x = x0 + i * step
        name = f"arcade_pier_{i:02d}"
        kit.box_mm(name, m["ashlar"], x - 0.45, x + 0.45, p - 0.45, p + 0.45, 0.0, 3.0)
        kit.box_mm(name, m["limestone_pale"], x - 0.55, x + 0.55, p - 0.55, p + 0.55, 0.0, 0.3)
        kit.box_mm(name, m["limestone_pale"], x - 0.55, x + 0.55, p - 0.55, p + 0.55, 2.85, 3.05)
        kit.tag(name, arrival_obstacle=True)
        if i < ARCADE_BAYS:
            cx = arcade_bay_x(i)
            kit.arch_bay("arcade_arches", m["ashlar"], "x", cx - w / 2, cx + w / 2, w, 3.05, 5.0, p, 0.9,
                         z0=3.05, soffit=m["limestone_pale"])
            _shop_interior(kit, m, cx, step)
            kit.poly("arcade_shop_awnings", m["teal"], [(cx - step / 2 + 0.8, SHOP_PLANE, 3.2),
                                                        (cx - step / 2 + 0.8, SHOP_PLANE + 1.0, 2.75),
                                                        (cx + step / 2 - 0.8, SHOP_PLANE + 1.0, 2.75),
                                                        (cx + step / 2 - 0.8, SHOP_PLANE, 3.2)])
            for j in range(3):
                kit.lathe("arcade_goods", m["clay"] if j != 1 else m["teal"],
                          [(0.0, 0.0), (0.22, 0.0), (0.3, 0.3), (0.14, 0.62), (0.0, 0.62)],
                          (cx - 0.9 + j * 0.9, SHOP_PLANE + 0.7, 0.0), segs=12)
            kit.sphere("arcade_lanterns", m["glow"], 0.16, (cx, p - 1.6, 3.9), scale=(1, 1, 1.3), segs=8, rings=6)
    kit.box_mm("arcade_upper", m["ashlar"], x0, x1, -18.0, p + 0.45, 5.0, 9.4)
    kit.box_mm("arcade_upper", m["plaster"], x0, x1, SHOP_PLANE, p, 4.9, 5.0)
    kit.box_mm("arcade_shops_wall", m["ashlar"], x0, x1, -18.0, SHOP_PLANE, 0.0, 5.0)
    kit.tag("arcade_shops_wall", arrival_obstacle=True)
    kit.box_mm("arcade_upper", m["limestone_pale"], x0, x1, p + 0.4, p + 0.65, 4.95, 5.25)
    for i in range(ARCADE_BAYS):
        window(kit, "arcade_upper_windows", m, x0 + (i + 0.5) * step, p + 0.45, 6.1, w=1.0, h=1.9, glow=i % 3 == 1)
    gable_roof_x(kit, "arcade_roof", m, x0, x1, -18.0, p + 0.45, 9.4, 2.4)


def arcade_bay_x(i):
    """Centre x of arcade bay i (0 = west end); the same float the arcade builder uses."""
    return ARCADE_X[0] + i * ARCADE_STEP + ARCADE_STEP / 2


def _shop_interior(kit, m, cx, step):
    """r2: a lit shopfront behind each arcade bay (A01/A08): warm glowing back wall, a wooden
    counter, shelves of glazed jars and a hanging lantern, so the colonnade reads as shops."""
    w = step - 1.6
    kit.box("arcade_shops", m["window_glow"], (w, 0.08, 2.7), (cx, SHOP_PLANE + 0.05, 1.45))
    kit.box("arcade_shop_fittings", m["wood_dark"], (w + 0.3, 0.14, 0.18), (cx, SHOP_PLANE + 0.1, 2.9))
    for z in (1.35, 2.05):
        kit.box("arcade_shop_fittings", m["wood"], (w - 0.2, 0.35, 0.05), (cx, SHOP_PLANE + 0.25, z))
        for j in range(5):
            mat = (m["glaze_teal"], m["clay"], m["glaze_cobalt"], m["lemon"], m["clay"])[(j + int(z * 10)) % 5]
            kit.cyl("arcade_shop_fittings", mat, 0.11, 0.26, (cx - w / 2 + 0.35 + j * (w - 0.7) / 4,
                                                             SHOP_PLANE + 0.27, z + 0.03), verts=8)
    kit.box("arcade_shop_fittings", m["wood"], (w - 0.4, 0.55, 0.9), (cx, SHOP_PLANE + 1.2, 0.45))
    kit.box("arcade_shop_fittings", m["cloth_cream"], (w - 0.3, 0.6, 0.04), (cx, SHOP_PLANE + 1.2, 0.92))
    kit.sphere("arcade_shop_lantern_glow", m["lamp_glass"], 0.17, (cx, SHOP_PLANE + 1.3, 2.55), scale=(1, 1, 1.3),
               segs=8, rings=6)


# ---- foreground ------------------------------------------------------------------
def _terrace_left(kit, m):
    """A01 bottom-left: raised planting bed behind a stone balustrade, lantern on a pier."""
    x0, x1, y0, y1 = 3.8, 13.3, -10.4, -8.0
    kit.box_mm("terrace_left", m["ashlar"], x0, x1, y0, y1, 0.0, 0.55)
    kit.box_mm("terrace_left", m["limestone_pale"], x0, x1, y1 - 0.3, y1, 0.55, 0.68)
    kit.box_mm("terrace_left", m["limestone_pale"], x0, x1, y1 - 0.3, y1, 1.35, 1.48)
    x = x0 + 0.2
    while x < x1:
        kit.lathe("terrace_left", m["limestone_pale"], [(0.09, 0.0), (0.12, 0.1), (0.07, 0.35), (0.11, 0.6),
                                                       (0.09, 0.67), (0.0, 0.67)], (x, y1 - 0.15, 0.68), segs=8)
        x += 0.32
    for px in (x0 + 0.3, 7.0, 10.2, x1 - 0.3):
        kit.box_mm("terrace_left", m["limestone"], px - 0.3, px + 0.3, y1 - 0.45, y1 + 0.05, 0.0, 1.6)
    kit.cyl("terrace_left_lantern", m["iron"], 0.08, 0.3, (7.0, y1 - 0.2, 1.6), verts=8)
    kit.lathe("terrace_left_lantern", m["brass"], [(0.22, 1.9), (0.26, 1.95), (0.0, 2.25)], (7.0, y1 - 0.2, 0.0),
              segs=8)
    kit.sphere("terrace_left_lantern_glow", m["glow"], 0.17, (7.0, y1 - 0.2, 1.75), scale=(1, 1, 1.3), segs=8,
               rings=6)
    for j in range(6):
        flower_bush(kit, "terrace_left_flowers", m, x0 + 0.8 + j * 1.6, y1 - 1.0 - (j % 2) * 0.7, 0.55,
                    r=0.6, colour="flower_magenta" if j % 3 else "flower_violet")
    kit.tag("terrace_left", arrival_obstacle=True)


def _lantern_posts(kit, m):
    # (12.9, 6.6) was dropped: it stood on the casino east portal's carpet runner.
    for i, (x, y) in enumerate(((12.9, -6.6), (-11.4, -7.3), (-11.4, 7.0))):
        lamp_post(kit, f"lamp_post_{i + 1}", m, x, y)
        kit.tag(f"lamp_post_{i + 1}", arrival_obstacle=True)
