"""Fidelity round 1 dressing (A01): cafe pergola with vines, the casino's gilded portal (swag
drapes, sunburst, gold columns, plum shell banners, gold lanterns), arcade and end-arch banners
with lanterns, and extra greenery and clutter. Geometry only; materials come from build_materials.
"""

import math

from arrival_density import build_density
from arrival_frontage import ARCADE_BAYS, ARCADE_PLANE, ARCADE_X, CAFE_FRONT, CAFE_X
from arrival_props import crates, flower_bush, potted_olive, urn_with_flowers, bench

FRONT_Y0 = 8.5             # casino front face (district frame)
DOOR_HALF, DOOR_SPRING = 1.3, 2.9
ARCH_X = -44.0


def shell_crest(kit, name, m, c, face, size, axis="y"):
    """Gold scallop: a fan plate with seven ribs, flat on a wall facing +-y (axis 'y') or +-x."""
    x, y, z = c

    def at(u, w):          # u along the wall, w up
        return (x + u, y, z + w) if axis == "y" else (x, y + u, z + w)
    pts = [at(size * math.cos(math.pi * k / 10), size * math.sin(math.pi * k / 10)) for k in range(11)]
    kit.poly(name, m["gold"], [at(0.0, 0.0)] + pts)
    for k in range(7):
        a = math.pi * (k + 0.5) / 7
        u, w = 0.5 * size * math.cos(a), 0.5 * size * math.sin(a)
        off = 0.02 * face
        cx, cy, cz = at(u, w)
        loc = (cx, cy + off, cz) if axis == "y" else (cx + off, cy, cz)
        rot = (0.0, math.pi / 2 - a, 0.0) if axis == "y" else (-(math.pi / 2 - a), 0.0, 0.0)
        kit.box(name, m["gold"], (0.035, 0.035, size), loc, rot=rot)
    kit.sphere(name, m["gold"], size * 0.16, at(0.0, -size * 0.12), segs=8, rings=5)


def banner(kit, name, m, x, y, z_top, length, face, axis="y", width=0.9):
    """Tall plum banner on a gold rod with a swallow-tail foot and a shell crest."""
    def at(u, w, d=0.0):
        return (x + u, y + face * d, w) if axis == "y" else (x + face * d, y + u, w)
    zb = z_top - length
    # r2: pleated cloth (judges: "flat colour with no folds"): vertical strips whose depth follows a
    # sine, flaring toward the foot, so the sun and the lightmap pick out real folds.
    n = PLEATS
    for k in range(n):
        u0, u1 = -width / 2 + width * k / n, -width / 2 + width * (k + 1) / n
        d0, d1 = _pleat(k, n), _pleat(k + 1, n)
        kit.poly(name, m["banner_cloth"], [at(u0, zb, d0 * 1.6), at(u1, zb, d1 * 1.6), at(u1, z_top, d1 * 0.4),
                                           at(u0, z_top, d0 * 0.4)])
    kit.poly(name, m["banner_cloth"], [at(-width / 2, zb, _pleat(0, n) * 1.6), at(0.0, zb - 0.35, 0.0),
                                       at(width / 2, zb, _pleat(n, n) * 1.6)])
    rod = (width + 0.2, 0.05, 0.05) if axis == "y" else (0.05, width + 0.2, 0.05)
    kit.box(name, m["gold"], rod, at(0.0, z_top + 0.05, 0.02))
    for w in (z_top - 0.18, zb + 0.12):
        trim = (width, 0.03, 0.05) if axis == "y" else (0.03, width, 0.05)
        kit.box(name, m["gold"], trim, at(0.0, w, 0.02))
    shell_crest(kit, name, m, at(0.0, z_top - length * 0.42, 0.11), face, width * 0.34, axis)


PLEATS = 8
PLEAT_DEPTH = 0.05


def _pleat(k, n):
    return PLEAT_DEPTH * (0.5 + 0.5 * math.sin(math.pi * 2.0 * k / n * 2.0))


def build_dressing(kit, m):
    _pergola(kit, m)
    _portal(kit, m)
    _arcade_dress(kit, m)
    _density(kit, m)
    build_density(kit, m)


def _pergola(kit, m):
    """Timber pergola over the cafe awning, vines on top and trailing off the front beam (A01)."""
    x0, x1 = CAFE_X
    f = CAFE_FRONT
    y_out, z = -7.55, 4.95
    g = "cafe_pergola"
    for x in (x0 + 0.35, (x0 + x1) / 2 + 1.0, x1 - 0.35):
        kit.box_mm(g, m["wood_dark"], x - 0.1, x + 0.1, y_out - 0.1, y_out + 0.1, 0.0, z)
        kit.box_mm(g, m["limestone_pale"], x - 0.2, x + 0.2, y_out - 0.2, y_out + 0.2, 0.0, 0.35)
    kit.box_mm(g, m["wood"], x0, x1, y_out - 0.12, y_out + 0.12, z - 0.1, z + 0.18)
    kit.box_mm(g, m["wood"], x0, x1, f + 0.3, f + 0.5, z - 0.1, z + 0.18)
    k = 0
    while x0 + 0.3 + k * 0.85 < x1:
        x = x0 + 0.3 + k * 0.85
        kit.box_mm(g, m["wood_dark"], x - 0.07, x + 0.07, f + 0.3, y_out + 0.45, z + 0.18, z + 0.36)
        k += 1
    kit.tag(g, arrival_obstacle=True)
    v = "cafe_pergola_vines"
    for k in range(int((x1 - x0) / 0.75)):
        x = x0 + 0.4 + k * 0.75
        mat = m["card_bloom"] if k % 3 == 1 else m["card_vine"]
        kit.card(v, mat, (x, f + 0.6, z + 0.3), 1.1, 3.2, 0.0, cell=k, tilt=-1.35)
        kit.card(v, m["card_vine"], (x + 0.2, y_out + 0.15, z + 0.25), 0.9, 1.2, 0.0, cell=k + 1, lift=1.1)
        if k % 2 == 0:
            kit.card(v, m["card_bloom"], (x - 0.2, y_out + 0.2, z + 0.4), 0.8, 0.7, 0.4, cell=k + 2)
    for x in (x0 + 0.35, x1 - 0.35):   # vines climbing the end posts
        for j in range(5):
            kit.card(v, m["card_vine"], (x, y_out, 0.6 + j * 0.85), 0.7, 1.0, (j % 2) * math.pi / 2, cell=j)


def _portal(kit, m):
    """A01 casino portal in the right third of CAM_A01: gold order, archivolt, sunburst, swags."""
    g = "casino_portal_gilt"
    y = FRONT_Y0 - 0.12
    for sx in (-1.0, 1.0):
        x = sx * 1.78
        kit.box(g, m["gold"], (0.5, 0.5, 0.25), (x, y, 0.72))
        kit.cyl(g, m["gold"], 0.17, 3.8, (x, y, 0.84), verts=14)
        kit.box(g, m["gold"], (0.55, 0.55, 0.3), (x, y, 4.75))
        for k in range(6):   # flutes
            kit.box(g, m["brass"], (0.03, 0.03, 3.6), (x + 0.17 * math.cos(k), y + 0.17 * math.sin(k), 2.7))
    kit.box_mm(g, m["gold"], -2.15, 2.15, y - 0.2, FRONT_Y0, 4.9, 5.15)
    arc = [(-1.42 * math.cos(math.pi * k / 16), y, DOOR_SPRING + 1.42 * math.sin(math.pi * k / 16)) for k in range(17)]
    kit.tube(g, m["gold"], arc, 0.09, sides=8)
    fan_c = (0.0, 9.66, DOOR_SPRING)
    for k in range(11):   # sunburst in the tympanum
        a = math.pi * (k + 0.5) / 11
        kit.box(g, m["gold"], (0.06, 0.03, 1.15), (fan_c[0] + 0.62 * math.cos(a), fan_c[1], fan_c[2] + 0.62 * math.sin(a)),
                rot=(0, math.pi / 2 - a, 0))
    kit.cyl(g, m["gold"], 0.25, 0.05, fan_c, verts=16, rot=(math.pi / 2, 0, 0))
    d = "casino_portal_drapes"
    swag = [(-1.95 + 3.9 * t / 10, y - 0.18, 4.55 - 0.75 * math.sin(math.pi * t / 10)) for t in range(11)]
    kit.tube(d, m["drape"], swag, 0.2, sides=8)
    for sx in (-1.0, 1.0):
        tail = [(sx * (1.95 - 0.25 * t / 6), y - 0.2, 4.6 - 0.48 * t) for t in range(7)]
        kit.tube(d, m["drape"], tail, 0.17, 0.1, sides=8)
        kit.sphere(d, m["gold"], 0.12, (sx * 1.6, y - 0.32, 1.75), segs=8, rings=5)   # tie-back tassel
    for sx in (-1.0, 1.0):
        banner(kit, "casino_portal_banners", m, sx * 2.75, y - 0.02, 8.1, 3.6, -1.0, width=1.0)
        px, py = sx * 2.3, 4.75
        kit.cyl("casino_portal_lamps", m["gold"], 0.07, 2.3, (px, py, 0.0), verts=8)
        kit.box("casino_portal_lamps", m["gold"], (0.32, 0.32, 0.2), (px, py, 0.1))
        kit.sphere("casino_portal_lamps_glow", m["lamp_glass"], 0.18, (px, py, 2.55), scale=(1, 1, 1.35), segs=10,
                   rings=6)
        kit.lathe("casino_portal_lamps", m["gold"], [(0.0, 2.78), (0.24, 2.82), (0.0, 3.15)], (px, py, 0.0), segs=8)
        kit.tag("casino_portal_lamps", arrival_obstacle=True)


def _arcade_dress(kit, m):
    """Plum shell banners on the end arch piers and warm hanging lanterns down the back street."""
    for y in (-6.6, -4.9, 4.4, 6.1):   # on the piers of the r2 grand arch (opening y -3.75..3.75)
        banner(kit, "street_arch_banners", m, ARCH_X + 1.25, y, 7.6, 3.6, 1.0, axis="x", width=0.95)
    x0, x1 = ARCADE_X                 # r2: one plum shell banner on every arcade pier (A01)
    step = (x1 - x0) / ARCADE_BAYS
    for i in range(ARCADE_BAYS + 1):
        banner(kit, "arcade_banners", m, x0 + i * step, ARCADE_PLANE + 0.6, 4.75, 2.5, 1.0, width=0.62)
    for k in range(7):
        x = -38.0 + k * 4.2
        kit.box("arcade_hanging_lanterns", m["iron"], (0.04, 0.04, 0.7), (x, -7.4, 4.55))
        kit.box("arcade_hanging_lanterns", m["brass"], (0.3, 0.3, 0.06), (x, -7.4, 4.2))
        kit.sphere("arcade_hanging_lanterns_glow", m["lamp_glass"], 0.15, (x, -7.4, 3.95), scale=(1, 1, 1.4),
                   segs=8, rings=5)


def _density(kit, m):
    """A01 greenery and clutter: olives, bougainvillea, urns, crates and benches on the edges."""
    for i, (x, y, s) in enumerate(((-11.3, -7.6, 1.1), (11.8, 11.6, 1.0), (-11.8, 6.8, 1.0), (-10.9, -3.6, 0.9))):
        potted_olive(kit, f"square_olive_{i + 1}", m, x, y, s)
        kit.tag(f"square_olive_{i + 1}", arrival_obstacle=True)
    for i, ang in enumerate((160.0, 200.0, 20.0, -20.0)):   # flower urns on the pale ring band
        a = math.radians(ang)
        name = f"square_urns_{i + 1}"
        urn_with_flowers(kit, name, m, (9.75 * math.cos(a), 9.75 * math.sin(a), 0.0), 0.36,
                         mat="clay" if i % 2 else "gold")
        kit.tag(name, arrival_obstacle=True)
    for x, y, r in ((-12.2, -6.2, 0.6), (12.3, 6.0, 0.5)):
        flower_bush(kit, "square_bougainvillea", m, x, y, 0.0, r=r)
    crates(kit, "square_clutter", m, -7.9, -6.9)
    bench(kit, "square_benches", m, 7.4, -6.9)
    kit.tag("square_benches", arrival_obstacle=True)
    kit.tag("square_clutter", arrival_obstacle=True)
    # Bougainvillea cascading over the corner house balcony and its door (A01 left).
    for k in range(6):
        x = 7.3 + k * 0.45
        kit.card("corner_left_bougainvillea", m["card_bloom"], (x, -9.55, 5.0), 0.8, 1.3, 0.0, cell=k, lift=1.2)
    for j in range(7):
        kit.card("corner_left_bougainvillea", m["card_bloom"] if j % 2 else m["card_vine"],
                 (4.0 + 0.2 * (j % 2), -10.3, 0.5 + j * 0.9), 1.1, 1.1, 0.0, cell=j)
