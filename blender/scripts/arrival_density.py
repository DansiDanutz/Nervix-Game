"""Fidelity round 2 density (A01; judges: "no bougainvillea mass, no olive trees, no lavender
foreground, sparse clutter, the right frontage is nearly bare").

Adds: an olive tree, lavender and flowering glazed pots on the foreground balustrade (A01 lower
left); a lavender and olive planter at the lower right; bougainvillea climbing the casino front
and hanging under its loggias; garlands and flower boxes along the arcade's upper storey; and
clutter (amphorae, benches, urns, crates) by the cafe, the casino steps and the shops.
Geometry only; materials come from build_materials. All positions are Blender (x, y, z).
"""

import math

from arrival_props import amphorae, bench, crates, olive_crown, urn_with_flowers, wall_lantern

TERRACE = (3.8, 13.3, -10.4, -8.0)      # arrival_frontage._terrace_left bed (top z 0.55)
BED_TOP = 0.55
PIER_TOP = 1.6
CASINO_FRONT = 8.5
ARCADE_X, ARCADE_PLANE = (-42.0, -8.5), -8.5


def build_density(kit, m):
    _foreground_left(kit, m)
    _foreground_right(kit, m)
    _casino_bloom(kit, m)
    _arcade_bloom(kit, m)
    _clutter(kit, m)


def lavender_clump(kit, name, m, x, y, z, s=1.0, seed=0):
    for k in range(3):
        kit.card(name, m["card_lavender"], (x, y, z), 1.0 * s, 0.85 * s, k * math.pi / 3 + seed, cell=k + seed)


def _foreground_left(kit, m):
    x0, x1, y0, y1 = TERRACE
    for px in (4.1, 10.2):   # flowering glazed pots on the balustrade piers
        urn_with_flowers(kit, "terrace_left_pots", m, (px, y1 - 0.2, PIER_TOP), 0.3, mat="glaze_cobalt")
    k = 0
    x = x0 + 0.5
    while x < x1 - 0.4:      # lavender drifts in the bed behind the balustrade
        lavender_clump(kit, "terrace_left_lavender", m, x, y1 - 0.75 - 0.35 * (k % 2), BED_TOP, 1.1, seed=k)
        x, k = x + 0.7, k + 1
    # A tall olive whose crown fills the top-left corner of CAM_A01 (A01), clear of the balcony.
    kit.tube("terrace_left_olive", m["wood_dark"], [(9.5, -9.6, BED_TOP), (9.3, -9.4, 2.0), (9.0, -9.0, 3.6)],
             0.2, 0.13, sides=7)
    olive_crown(kit, "terrace_left_olive", m, 9.0, -9.0, 3.4, s=2.6, seed=1.3)
    for j in range(9):       # bougainvillea spilling over the balustrade coping
        px = x0 + 0.6 + j * 1.05
        kit.card("terrace_left_cascade", m["card_bloom"], (px, y1 + 0.06, 1.5), 1.0, 1.1, 0.0, cell=j, lift=1.0)


def _foreground_right(kit, m):
    x, y = 10.9, 4.3
    g = "plaza_planter_right"
    kit.cyl(g, m["ashlar"], 0.85, 0.5, (x, y, 0.0), verts=16)
    kit.lathe(g, m["limestone_pale"], [(0.92, 0.5), (0.95, 0.58), (0.0, 0.58)], (x, y, 0.0), segs=16)
    for k in range(5):
        a = 2 * math.pi * k / 5
        lavender_clump(kit, g + "_plants", m, x + 0.5 * math.cos(a), y + 0.5 * math.sin(a), 0.55, 0.9, seed=k)
    olive_crown(kit, g + "_plants", m, x, y, 0.55, s=1.1, seed=0.7)
    kit.tag(g, arrival_obstacle=True)


def _climb(kit, name, m, x, y, z0, z1, face, bloom_every=2, seed=0):
    k, z = 0, z0
    while z < z1:
        dx = 0.25 * math.sin(1.3 * k + seed)
        mat = m["card_bloom"] if k % bloom_every == 0 else m["card_vine"]
        kit.card(name, mat, (x + dx, y + face * 0.12, z), 1.2, 1.1, 0.0, cell=k + seed, tilt=-0.15 * face)
        kit.card(name, m["card_bloom"], (x + dx, y + face * 0.3, z + 0.35), 0.9, 0.8, 0.6 * (k % 2 * 2 - 1),
                 cell=k + seed + 1)
        k, z = k + 1, z + 0.65


def _casino_bloom(kit, m):
    """Bougainvillea up the casino front piers and hanging under each loggia sill (A01 right)."""
    y = CASINO_FRONT
    for i, x in enumerate((-7.0, -2.4, 2.4, 7.0)):
        _climb(kit, "casino_front_bougainvillea", m, x, y, 0.4, 5.2 if abs(x) < 3 else 7.6, -1.0, seed=i * 3)
    for lx in (-4.6, 0.0, 4.6):
        for j in range(5):
            px = lx - 1.2 + j * 0.6
            kit.card("casino_front_bougainvillea", m["card_bloom"], (px, y - 0.15, 5.05), 0.75, 1.0, 0.0,
                     cell=j, lift=0.95)


def _arcade_bloom(kit, m):
    """Garlands along the arcade cornice and a flower box under every upper window."""
    x0, x1 = ARCADE_X
    p = ARCADE_PLANE + 0.66
    x, k = x0 + 0.4, 0
    while x < x1:
        kit.card("arcade_garlands", m["card_bloom"] if k % 2 == 0 else m["card_vine"],
                 (x, p, 5.2 - 0.1 * math.sin(k * 1.1)), 0.95, 0.9, 0.0, cell=k, lift=0.85)
        x, k = x + 0.8, k + 1
    step = (x1 - x0) / 8
    for i in range(8):
        cx = x0 + (i + 0.5) * step
        kit.box("arcade_flowerboxes", m["clay"], (1.3, 0.3, 0.24), (cx, ARCADE_PLANE + 0.62, 5.95))
        for j in range(3):
            kit.card("arcade_flowerboxes", m["card_bloom"], (cx - 0.45 + j * 0.45, ARCADE_PLANE + 0.7, 6.0), 0.6,
                     0.55, 0.1 * (j - 1), cell=i + j)
            kit.card("arcade_flowerboxes", m["card_vine"], (cx - 0.45 + j * 0.45, ARCADE_PLANE + 0.8, 6.05), 0.45,
                     0.8, 0.0, cell=i + j + 1, lift=0.8)


def _clutter(kit, m):
    amphorae(kit, "cafe_clutter", m, -7.3, -9.95)
    amphorae(kit, "cafe_clutter", m, 2.0, -9.95)
    bench(kit, "terrace_left_bench", m, 5.6, -7.45, rot=math.pi)
    for x in (-5.3, 5.3):   # gilded urns either side of the casino steps
        urn_with_flowers(kit, "casino_step_urns", m, (x, CASINO_FRONT - 0.45, 0.0), 0.36, mat="gold")
    crates(kit, "arcade_clutter", m, -10.6, -12.0)
    amphorae(kit, "arcade_clutter", m, -24.0, -12.0)
    for i, x in enumerate((4.6, 12.4)):   # iron bracket lanterns on the corner house above the terrace
        wall_lantern(kit, f"corner_left_lantern_{i + 1}", m, x, -10.5, 3.1, 1.0)
    for g in ("cafe_clutter", "terrace_left_bench", "casino_step_urns", "arcade_clutter"):
        kit.tag(g, arrival_obstacle=True)
