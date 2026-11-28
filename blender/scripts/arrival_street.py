"""East street enclosure (where the player spawns) and the corner fillers of the square.

Pedestrian-walkthrough lesson: the spawn street is 8 m wide between 3-5 storey facades on both
sides, so the spawn frame has no void and opens onto the square. Chunky stone surrounds, deep
window reveals, open teal shutters, balconies and human-scale props along the walls only
(the centre of the street, |y| < 2.6, stays clear so the sightline to the fountain is open).
Palette: A01 cream/honey stone, teal, plum, gold (not Cinque Terre's red and yellow).
"""

import math

from arrival_props import (amphorae, crates, flower_bush, gable_roof_x, potted_olive, stone_planter,
                           wall_lantern, window)

STOREY = 3.3
LEFT_FRONT, RIGHT_FRONT = -4.0, 4.0
DEPTH = 11.0

# (x0, x1, storeys) per side; the left side starts after the merchant house (x 13.8..22.8).
# The right row starts at x 19.2, just outside the spawn frame's right edge: the street flares
# open over its last ~6 m (setback block behind, out of frame) so the casino's canted east
# portal and red stair fill the right of the arrival view instead of a street wall.
LEFT_ROW = [(22.8, 30.0, 4), (30.0, 37.5, 3), (37.5, 46.0, 5), (46.0, 54.0, 4), (54.0, 62.0, 3),
            (62.0, 72.0, 4)]
RIGHT_ROW = [(19.2, 22.4, 3), (22.4, 29.5, 4), (29.5, 38.0, 3), (38.0, 45.5, 5), (45.5, 54.0, 4),
             (54.0, 62.0, 3), (62.0, 72.0, 4)]
SKINS = ("plaster", "ashlar", "limestone", "plaster_rose", "ashlar")
AWNINGS = ("teal_light", "plum", "teal_light", "cloth_cream")


def build_street(kit, m):
    for i, (x0, x1, n) in enumerate(LEFT_ROW):
        _facade(kit, m, f"street_left_{i + 1:02d}", x0, x1, LEFT_FRONT, 1.0, n, i)
    for i, (x0, x1, n) in enumerate(RIGHT_ROW):
        _facade(kit, m, f"street_right_{i + 1:02d}", x0, x1, RIGHT_FRONT, -1.0, n, i + 3)
    _facade(kit, m, "corner_left", 3.4, 13.6, -10.5, 1.0, 2, 1, door=True)   # A01 cottage scale
    _facade(kit, m, "corner_right", 8.2, 17.0, 13.0, -1.0, 3, 2, door=False)
    _facade(kit, m, "flare_right", 17.0, 19.2, 11.0, -1.0, 3, 4, door=False)   # setback, outside the frame
    _street_props(kit, m)


def _facade(kit, m, name, x0, x1, fy, face, storeys, idx, door=True):
    """One building: body, plinth, string courses, windows, optional balcony, door, roof."""
    h = storeys * STOREY + 0.6
    back = fy - face * DEPTH
    y0, y1 = sorted((fy, back))
    skin = m[SKINS[idx % len(SKINS)]]
    kit.box_mm(name, skin, x0, x1, y0, y1, 0.0, h)
    kit.tag(name, arrival_obstacle=True, arrival_bevel=True)
    trim = m["limestone_pale"]
    fo = fy + face * 0.12
    kit.box_mm(name + "_trim", trim, x0, x1, *sorted((fy, fo)), 0.0, 0.6)  # plinth
    for s in range(1, storeys):
        kit.box_mm(name + "_trim", trim, x0, x1, *sorted((fy, fy + face * 0.16)), s * STOREY + 0.45,
                   s * STOREY + 0.62)
    kit.box_mm(name + "_trim", trim, x0 - 0.15, x1 + 0.15, *sorted((fy, fy + face * 0.35)), h - 0.4, h)
    for xq in (x0 + 0.2, x1 - 0.2):  # quoins
        for k in range(int(h / 0.8)):
            kit.box(name + "_trim", trim, (0.42 if k % 2 else 0.3, 0.1, 0.36), (xq, fy + face * 0.05, 0.5 + k * 0.8))
    gable_roof_x(kit, name + "_roof", m, x0, x1, y0, y1, h, 2.0 + 0.3 * (idx % 3), over=0.9)
    for k in range(int((x1 - x0) / 0.8)):   # timber corbels under the deep eave
        kit.box(name + "_corbels", m["wood_dark"], (0.16, 0.75, 0.2), (x0 + 0.4 + k * 0.8, fy + face * 0.4, h - 0.15))
    w = x1 - x0
    cols = max(2, int(w / 2.7))
    xs = [x0 + (k + 0.5) * w / cols for k in range(cols)]
    door_col = idx % cols
    for s in range(storeys):
        z = s * STOREY + (0.9 if s else 0.0)
        for k, x in enumerate(xs):
            if s == 0:
                if door and k == door_col:
                    _door(kit, m, name, x, fy, face, idx)
                elif idx % 2 == 0:
                    _shopfront(kit, m, name, x, fy, face, w / cols - 0.6, idx + k)
                else:
                    window(kit, name + "_win", m, x, fy, 1.0, w=1.0, h=2.0, face=face, glow=(k + idx) % 3 == 0)
                continue
            window(kit, name + "_win", m, x, fy, z, w=0.95, h=1.85, face=face,
                   glow=(k + s + idx) % 5 == 0)
            if s == 1 and (k + idx) % 2 == 0:
                _balcony(kit, m, name, x, fy, face, z)
            elif s == 1 and k < cols - 1 and (k + idx) % 2 == 1:
                _banner(kit, m, name, (x + xs[k + 1]) / 2, fy, face, z + 0.2)
            elif s >= 2 and (k + s) % 3 == 0:
                kit.box(name + "_flowerbox", m["clay"], (1.1, 0.3, 0.22), (x, fy + face * 0.32, z + 0.05))
                flower_bush(kit, name + "_flowers", m, x, fy + face * 0.35, z + 0.08, r=0.34,
                            colour="flower_magenta" if k % 2 else "flower_violet")


def _door(kit, m, name, x, fy, face, idx):
    """Arched door (A01): stone jambs and voussoir arch, plank leaf with iron straps, ring knocker."""
    stone = m["limestone_pale"]
    for sx in (-1.0, 1.0):
        kit.box(name + "_trim", stone, (0.32, 0.36, 2.0), (x + sx * 0.8, fy + face * 0.18, 1.0))
    for k in range(9):   # voussoirs round the arch head
        a = math.pi * k / 8
        kit.box(name + "_trim", stone, (0.34, 0.38, 0.22), (x - 0.8 * math.cos(a), fy + face * 0.19,
                                                             2.0 + 0.8 * math.sin(a)), rot=(0, math.pi / 2 - a, 0))
    leaf = m["teal"] if idx % 2 else m["wood"]
    kit.box(name + "_door", leaf, (1.28, 0.08, 2.0), (x, fy + face * 0.02, 1.0))
    kit.cyl(name + "_door", leaf, 0.64, 0.08, (x, fy + face * 0.02, 2.0), verts=16, rot=(math.pi / 2, 0, 0))
    for k in range(5):   # vertical planks
        kit.box(name + "_door", m["wood_dark"], (0.02, 0.1, 2.5), (x - 0.5 + k * 0.25, fy + face * 0.03, 1.25))
    for z in (0.6, 1.7):
        kit.box(name + "_door", m["iron"], (1.2, 0.04, 0.06), (x, fy + face * 0.07, z))
    kit.tube(name + "_door", m["brass"], [(x + 0.32 + 0.11 * math.cos(t * 0.785), fy + face * 0.1,
                                           1.2 + 0.11 * math.sin(t * 0.785)) for t in range(9)], 0.02, sides=6)
    kit.box(name + "_trim", stone, (1.9, 0.5, 0.14), (x, fy + face * 0.25, 0.07))
    wall_lantern(kit, name + "_lantern", m, x + 1.3, fy, 2.6, face)


def _shopfront(kit, m, name, x, fy, face, w, k):
    stone = m["limestone_pale"]
    for sx in (-1.0, 1.0):
        kit.box(name + "_trim", stone, (0.3, 0.34, 2.9), (x + sx * (w / 2 + 0.15), fy + face * 0.17, 1.45))
    kit.box(name + "_trim", stone, (w + 0.6, 0.34, 0.3), (x, fy + face * 0.17, 3.05))
    kit.box(name + "_shop", m["interior"], (w, 0.06, 2.6), (x, fy + face * 0.02, 1.4))
    kit.box(name + "_shop", m["wood"], (w, 0.3, 0.9), (x, fy + face * 0.15, 0.45))
    aw = m[AWNINGS[k % len(AWNINGS)]]
    y_wall, y_out = fy + face * 0.3, fy + face * 1.4
    pts = [(x - w / 2, y_wall, 3.0), (x - w / 2, y_out, 2.6), (x + w / 2, y_out, 2.6), (x + w / 2, y_wall, 3.0)]
    kit.poly(name + "_awning", aw, pts if face > 0 else list(reversed(pts)))
    kit.poly(name + "_awning", aw, list(reversed(pts)) if face > 0 else pts)
    kit.box(name + "_awning", aw, (w, 0.04, 0.22), (x, y_out, 2.5))


def _balcony(kit, m, name, x, fy, face, z):
    kit.box(name + "_balcony", m["limestone"], (1.9, 0.9, 0.18), (x, fy + face * 0.45, z - 0.1))
    for sx in (-0.6, 0.6):
        kit.box(name + "_balcony", m["limestone"], (0.18, 0.6, 0.3), (x + sx, fy + face * 0.3, z - 0.32))
    kit.box(name + "_balcony_rail", m["iron"], (1.9, 0.05, 0.05), (x, fy + face * 0.88, z + 0.9))
    for k in range(9):
        kit.box(name + "_balcony_rail", m["iron"], (0.03, 0.03, 0.9), (x - 0.88 + k * 0.22, fy + face * 0.88, z + 0.45))
    flower_bush(kit, name + "_flowers", m, x - 0.55, fy + face * 0.6, z, r=0.3)


def _banner(kit, m, name, x, fy, face, z):
    """Plum hanging banner with a gold diamond, flat against the wall (never across the street)."""
    from arrival_dressing import shell_crest
    kit.box(name + "_banner", m["iron"], (0.9, 0.5, 0.05), (x, fy + face * 0.25, z + 2.0))
    kit.box(name + "_banner", m["banner_cloth"], (0.75, 0.05, 1.7), (x, fy + face * 0.45, z + 1.1))
    kit.poly(name + "_banner", m["banner_cloth"], [(x - 0.375, fy + face * 0.45, z + 0.25),
                                                   (x + 0.375, fy + face * 0.45, z + 0.25), (x, fy + face * 0.45, z - 0.1)])
    kit.box(name + "_banner", m["gold"], (0.8, 0.07, 0.05), (x, fy + face * 0.47, z + 1.9))
    shell_crest(kit, name + "_banner", m, (x, fy + face * 0.49, z + 1.05), face, 0.24)


def _street_props(kit, m):
    """Planters, lamps, pots and crates along the walls; the centre |y| < 2.4 stays clear and
    nothing taller than a lamp stands inside the spawn-to-fountain corridor."""
    stone_planter(kit, "street_planter_left", m, 16.6, 18.6, -4.15, -3.35)   # clear of the house door (x 15)
    stone_planter(kit, "street_planter_right", m, 20.4, 22.3, 2.85, 3.65, colour="flower_violet")  # clear of the stair
    kit.tag("street_planter_left", arrival_obstacle=True, arrival_bevel=True)
    kit.tag("street_planter_right", arrival_obstacle=True, arrival_bevel=True)
    for side in (-1.0, 1.0):  # kerb: pale stone channel along each wall (5 cm, walkable)
        y0, y1 = sorted((side * 3.85, side * 4.05))
        kit.box_mm("paving_kerb", m["limestone_pale"], 13.4, 70.0, y0, y1, 0.0, 0.06)
    spots = [(23.5, -3.3), (27.0, -3.4), (33.5, -3.3), (40.0, -3.4), (48.0, -3.3),
             (24.5, 3.3), (31.0, 3.4), (37.0, 3.3), (44.0, 3.4), (52.0, 3.3)]
    for i, (x, y) in enumerate(spots):
        g = f"street_props_{i + 1:02d}"
        kind = i % 3
        if kind == 0:
            potted_olive(kit, g, m, x, y, 0.8)
        elif kind == 1:
            crates(kit, g, m, x, y)
        else:
            amphorae(kit, g, m, x, y)
        kit.tag(g, arrival_obstacle=True)
