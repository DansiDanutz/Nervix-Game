"""Fidelity round 1 skyline layers (A01 top band): terraced hillside with olive rows, a cascading
waterfall below the summit temple, distant mountain ranges and warm pink-gold clouds.
Everything here is far scenery: never an obstacle, never lightmapped (see arrival_bake.py).
"""

import math
import random

from arrival_skyline import HILL_X0, TEMPLE, hill_height

TERRACE_XS = (-84.0, -96.0, -108.0, -121.0)
WATERFALL = (-112.0, 50.0)           # right of the temple and above the casino dome, as in A01
CLOUD_SEED = 77


def build_skyline_far(kit, m):
    _terraces(kit, m)
    _olive_scatter(kit, m)
    _waterfall(kit, m)
    _mountains(kit, m)
    _clouds(kit, m)


def _terraces(kit, m):
    """Dry-stone retaining walls along the contours (lines of constant x) with an olive row each."""
    for x in TERRACE_XS:
        y = -110.0
        while y < 110.0:
            y1 = y + 6.0
            z0, z1 = hill_height(x, y), hill_height(x, y1)
            kit.poly("hill_terraces", m["terrace"], [(x + 0.3, y, z0 - 1.6), (x + 0.3, y1, z1 - 1.6),
                                                     (x + 0.3, y1, z1 + 1.1), (x + 0.3, y, z0 + 1.1)])
            kit.poly("hill_terraces", m["haze_stone"], [(x + 0.3, y, z0 + 1.1), (x + 0.3, y1, z1 + 1.1),
                                                        (x - 1.5, y1, z1 + 1.3), (x - 1.5, y, z0 + 1.3)])
            y = y1


def _olive_scatter(kit, m):
    rng = random.Random(4242)
    for x in TERRACE_XS:
        for k in range(26):
            y = -100.0 + k * 8.0 + rng.uniform(-2.0, 2.0)
            xx = x - 3.0 - rng.uniform(0.0, 3.0)
            z = hill_height(xx, y)
            r = rng.uniform(1.4, 2.1)
            kit.blob("hill_olives", m["olive"] if k % 3 else m["leaf_dark"], r, (xx, y, z + r * 0.8),
                     scale=(1.0, 1.0, 0.8))
    for k in range(60):   # loose olives on the slopes between the terraces
        xx = rng.uniform(-150.0, HILL_X0 - 6.0)
        y = rng.uniform(-120.0, 120.0)
        z = hill_height(xx, y)
        r = rng.uniform(1.2, 2.4)
        kit.blob("hill_olives", m["olive"], r, (xx, y, z + r * 0.7), scale=(1.0, 1.0, 0.85))


def _waterfall(kit, m):
    """A01: water falls in two drops down a rosy crag right of the temple. The crag face looks
    along +x (toward the camera) so the falls read upright; a slope-hugging ribbon was foreshortened
    to a blob (fid-r1-iter6e). Projects to u ~0.70, v 0.12..0.2 in CAM_A01."""
    wx, wy = WATERFALL
    base = hill_height(wx, wy)
    top = base + 13.0
    kit.box_mm("hill_crag", m["haze_stone"], wx - 14.0, wx, wy - 4.5, wy + 5.5, base - 2.0, top)
    kit.box_mm("hill_crag", m["haze_stone"], wx - 12.0, wx - 1.5, wy - 7.5, wy - 5.5, base - 2.0, top - 4.0)
    kit.box_mm("hill_crag", m["haze_stone"], wx - 12.0, wx - 2.5, wy + 5.5, wy + 8.0, base - 2.0, top - 6.0)
    kit.box_mm("hill_crag", m["haze_stone_pale"], wx - 0.9, wx + 0.6, wy - 5.8, wy + 5.8, base + 7.0, base + 7.8)
    for z0, z1, w, dx in ((base + 7.8, top, 4.6, 0.05), (base - 0.5, base + 7.0, 5.8, 0.7)):   # r2: wider
        kit.poly("hill_waterfall", m["water_fall"], [(wx + dx, wy - w / 2, z0), (wx + dx, wy + w / 2, z0),
                                                     (wx + dx, wy + w / 2, z1), (wx + dx, wy - w / 2, z1)])
        for j in range(6):
            yy = wy - w / 2 + (j + 0.5) * w / 6
            kit.tube("hill_waterfall", m["water_foam"], [(wx + dx + 0.1, yy, z1), (wx + dx + 0.15, yy, (z0 + z1) / 2),
                                                         (wx + dx + 0.2, yy, z0)], 0.16, 0.3, sides=5)
        kit.blob("hill_waterfall", m["water_foam"], 1.6, (wx + dx + 0.8, wy, z0 + 0.3), scale=(1.0, 1.8, 0.5))
    kit.annulus("hill_waterfall_pool", m["water"], 0.0, 4.0, base - 0.2, segs=16, centre=(wx + 3.5, wy))
    for dy in (-9.5, 10.5):
        _cypress_far(kit, m, wx - 1.0, wy + dy, hill_height(wx - 1.0, wy + dy))


def _cypress_far(kit, m, x, y, z):
    kit.lathe("hill_crag_trees", m["cypress"], [(0.0, 0.0), (1.0, 1.3), (1.2, 3.8), (0.9, 7.0), (0.0, 10.0)],
              (x, y, z - 0.5), segs=8)


def _mountains(kit, m):
    """Two hazy ranges far beyond the far ridge, so the hill reads as the front of a valley."""
    def range_fn(base, amp, f1, f2, ph):
        return lambda x, y: base + amp * (0.55 * math.sin(y / f1 + ph) ** 2 + 0.45 * abs(math.sin(y / f2 + 2 * ph)))
    near = range_fn(95.0, 85.0, 61.0, 27.0, 0.4)
    far = range_fn(120.0, 110.0, 83.0, 39.0, 1.9)
    kit.grid_surface("mountains", m["mountain"], -620.0, -560.0, -700.0, 700.0, 2, 120,
                     lambda x, y: near(x, y) * (x + 620.0) / 60.0)
    kit.grid_surface("mountains", m["mountain_far"], -820.0, -760.0, -900.0, 900.0, 2, 120,
                     lambda x, y: far(x, y) * (x + 820.0) / 60.0)


def _clouds(kit, m):
    """Banks of flattened puffs: lit cream tops over rose undersides, low in the west sky."""
    rng = random.Random(CLOUD_SEED)
    banks = [(-420.0, -250.0, 190.0), (-520.0, -110.0, 250.0), (-480.0, 40.0, 255.0), (-430.0, 200.0, 205.0),
             (-380.0, 300.0, 160.0), (-400.0, -360.0, 150.0), (-560.0, 130.0, 290.0), (-300.0, -190.0, 150.0)]
    for i, (cx, cy, cz) in enumerate(banks):
        n = rng.randint(7, 11)
        for k in range(n):
            dy = (k - n / 2) * rng.uniform(14.0, 20.0)
            r = rng.uniform(14.0, 26.0)
            loc = (cx + rng.uniform(-15, 15), cy + dy, cz + rng.uniform(-6, 8))
            kit.blob("sky_clouds", m["cloud_shade"], r, (loc[0], loc[1], loc[2] - r * 0.25),
                     scale=(0.6, 1.5, 0.4), subdiv=2)
            kit.blob("sky_clouds", m["cloud"], r * 0.85, (loc[0] + 4.0, loc[1] + r * 0.2, loc[2] + r * 0.12),
                     scale=(0.6, 1.4, 0.45), subdiv=2)
