"""A01 fountain (fidelity round 1): wide low octagonal basin with plum + gold frieze panels and
gold crests, short carved pedestal, one wide carved lower bowl, a small upper bowl and finial,
gold urns on the platform, transparent teal water, falling streams, arcing jets and splash.

Mesh names kept for the runtime contract: fountain_basin (collision radius), fountain_tiers
(top_y), fountain_water, fountain_falls, fountain_urn_*.
"""

import math

from arrival_props import urn_with_flowers

TAU = 2 * math.pi
OCT = TAU / 16              # 8-sided lathe phase: one flat face looks along +x (toward the camera)
BASIN_R = 4.0               # octagon circumradius
APOTHEM = BASIN_R * math.cos(math.pi / 8)
WALL_T = 0.32
RIM_TOP = 0.92
POOL_Z = 0.8
POOL_FLOOR = 0.42
PED = [(0.62, 0.42), (0.62, 0.55), (0.5, 0.62), (0.42, 0.8), (0.36, 1.0), (0.44, 1.08), (0.3, 1.16)]
# r2: squat, wide carved bowl with a rounded bead-moulded lip (judges: "plain turned shapes").
BOWL = [(0.3, 1.16), (0.8, 1.22), (1.55, 1.35), (2.12, 1.5), (2.34, 1.6), (2.44, 1.7), (2.4, 1.78),
        (2.3, 1.82), (2.2, 1.78), (1.4, 1.62), (0.0, 1.58)]
UPPER = [(0.26, 1.6), (0.18, 1.85), (0.28, 1.98), (0.17, 2.1), (0.55, 2.2), (0.92, 2.36), (0.98, 2.46),
         (0.88, 2.46), (0.0, 2.38)]
FINIAL = [(0.16, 2.38), (0.2, 2.5), (0.1, 2.62), (0.16, 2.7), (0.05, 2.9), (0.0, 2.98)]
LOWER_LIP_R, LOWER_LIP_Z = 2.44, 1.78
UPPER_LIP_R, UPPER_LIP_Z = 0.98, 2.46
URN_ANGLES = (45.0, 135.0, 225.0, 315.0)
URN_R = 4.2
URN_SIZE = 0.38


def build_fountain(kit, m, platform_top):
    o = (0.0, 0.0, 0.0)
    stone = m["fountain_stone"]
    r_in = (APOTHEM - WALL_T) / math.cos(math.pi / 8)
    kit.lathe("fountain_basin", stone,
              [(BASIN_R - 0.06, 0.16), (BASIN_R - 0.06, RIM_TOP - 0.16), (BASIN_R + 0.08, RIM_TOP - 0.12),
               (BASIN_R + 0.1, RIM_TOP), (r_in - 0.04, RIM_TOP), (r_in - 0.04, RIM_TOP - 0.08),
               (r_in, RIM_TOP - 0.1), (r_in, POOL_FLOOR), (0.0, POOL_FLOOR)], o, segs=8, smooth=False,
              cap=False, phase=OCT)
    kit.lathe("fountain_basin", stone, [(BASIN_R + 0.02, 0.1), (BASIN_R + 0.02, 0.2)], o, segs=8,
              smooth=False, cap=False, phase=OCT)
    kit.annulus("fountain_pool_floor", m["pool_floor"], 0.0, r_in, POOL_FLOOR + 0.01, segs=8)
    _frieze(kit, m)
    kit.lathe("fountain_tiers", stone, PED + BOWL[1:], o, segs=48, cap=False)
    kit.lathe("fountain_tiers", stone, UPPER, o, segs=36, cap=False)
    _carving(kit, m)
    kit.lathe("fountain_spout", m["gold"], FINIAL, o, segs=20, cap=False)
    kit.annulus("fountain_water", m["water"], 0.0, r_in + 0.01, POOL_Z, segs=8)
    kit.annulus("fountain_water", m["water"], 0.0, 2.22, LOWER_LIP_Z - 0.06, segs=48)
    kit.annulus("fountain_water", m["water"], 0.0, 0.9, UPPER_LIP_Z - 0.05, segs=36)
    _water(kit, m)
    for i, ang in enumerate(URN_ANGLES):
        a = math.radians(ang)
        urn_with_flowers(kit, f"fountain_urn_{i + 1}", m, (URN_R * math.cos(a), URN_R * math.sin(a),
                                                            platform_top), URN_SIZE)
        kit.tag(f"fountain_urn_{i + 1}", arrival_obstacle=True)
    for i, ang in enumerate((22.0, -22.0)):   # plum pots on the lower step, either side of the sightline
        a = math.radians(ang)
        x, y, z = 4.62 * math.cos(a), 4.62 * math.sin(a), 0.16
        g = f"fountain_planter_{i + 1}"
        kit.lathe(g, m["plum_deep"], [(0.0, 0.0), (0.25, 0.0), (0.3, 0.42), (0.33, 0.48), (0.0, 0.48)],
                  (x, y, z), segs=16)
        kit.blob(g, m["leaf_dark"], 0.36, (x, y, z + 0.72), scale=(1.0, 1.0, 0.8))
        for k in range(4):
            kit.card(g, m["card_bloom"], (x, y, z + 0.4), 0.8, 0.75, k * math.pi / 4, cell=k)
        kit.tag(g, arrival_obstacle=True)
    kit.tag("fountain_basin", arrival_obstacle=True)


def _face_frame(k):
    """Centre direction, tangent and apothem point of octagon face k (k = 0 faces +x)."""
    a = TAU * k / 8
    return (math.cos(a), math.sin(a)), (-math.sin(a), math.cos(a)), a


def _frieze(kit, m):
    """A01: each face carries a plum panel in a gold frame with a gold shell crest."""
    w = 2 * BASIN_R * math.sin(math.pi / 8)
    pw, z0, z1 = w * 0.72, 0.28, RIM_TOP - 0.24
    zc = (z0 + z1) / 2
    for k in range(8):
        (nx, ny), (tx, ty), a = _face_frame(k)
        d = APOTHEM + 0.03
        cx, cy = nx * d, ny * d
        kit.box("fountain_inlay", m["plum"], (0.04, pw, z1 - z0), (cx, cy, zc), rot=(0, 0, a))
        for s in (-1, 1):
            kit.box("fountain_inlay_gold", m["gold"], (0.05, 0.05, z1 - z0 + 0.05),
                    (cx + tx * s * pw / 2, cy + ty * s * pw / 2, zc), rot=(0, 0, a))
        for z in (z0, z1):
            kit.box("fountain_inlay_gold", m["gold"], (0.05, pw + 0.05, 0.05), (cx, cy, z), rot=(0, 0, a))
        _shell(kit, m, (cx + nx * 0.03, cy + ny * 0.03, zc - 0.11), a)
        # corner pilaster at the vertex between faces k and k+1
        va = a + TAU / 16
        kit.box("fountain_basin_piers", m["limestone_pale"], (0.26, 0.3, RIM_TOP - 0.2),
                (math.cos(va) * (BASIN_R - 0.02), math.sin(va) * (BASIN_R - 0.02), (RIM_TOP - 0.2) / 2 + 0.12),
                rot=(0, 0, va))


def _shell(kit, m, base, a):
    """Gold scallop crest: a fan of five ribs over a half disc, facing outward along angle a."""
    bx, by, bz = base
    tx, ty = -math.sin(a), math.cos(a)
    kit.cyl("fountain_inlay_gold", m["gold"], 0.2, 0.03, (bx, by, bz + 0.02), verts=14,
            rot=(0, math.pi / 2, a))
    for j in range(5):
        b = math.radians(-60 + 30 * j)
        kit.box("fountain_inlay_gold", m["gold"], (0.035, 0.035, 0.3),
                (bx + tx * 0.13 * math.sin(b), by + ty * 0.13 * math.sin(b), bz + 0.13 * math.cos(b) + 0.02),
                rot=(0, 0, a))


def _carving(kit, m):
    """Gadrooned undersides (convex lobes following each bowl), a fluted pedestal, gold lips."""
    st = m["fountain_stone"]
    for k in range(28):
        a = TAU * (k + 0.5) / 28
        c, s = math.cos(a), math.sin(a)
        prof = [(0.72, 1.24), (1.2, 1.29), (1.7, 1.39), (2.1, 1.5), (2.3, 1.6)]
        kit.tube("fountain_tiers_carving", st, [(r * c, r * s, z - 0.02) for r, z in prof], 0.07, 0.13, sides=6)
    for k in range(16):
        a = TAU * (k + 0.5) / 16
        c, s = math.cos(a), math.sin(a)
        prof = [(0.22, 2.12), (0.5, 2.2), (0.78, 2.31), (0.95, 2.42)]
        kit.tube("fountain_tiers_carving", st, [(r * c, r * s, z - 0.015) for r, z in prof], 0.035, 0.07, sides=5)
    for k in range(12):   # flutes on the pedestal
        a = TAU * k / 12
        kit.tube("fountain_tiers_carving", st, [(r * math.cos(a), r * math.sin(a), z)
                                               for r, z in ((0.6, 0.5), (0.47, 0.75), (0.39, 0.98))], 0.045,
                 sides=5)
    for r, z in ((LOWER_LIP_R, LOWER_LIP_Z - 0.08), (UPPER_LIP_R, UPPER_LIP_Z)):
        kit.lathe("fountain_trim_gold", m["gold"], [(r + 0.02, z - 0.06), (r + 0.02, z + 0.01)], (0, 0, 0),
                  segs=48, cap=False)
    kit.lathe("fountain_trim_plum", m["plum"], [(0.0, 1.88), (0.33, 1.88), (0.36, 1.97), (0.33, 2.05),
                                                (0.0, 2.05)], (0, 0, 0), segs=24)


def _stream(lip_r, lip_z, land_z, a, out):
    pts = []
    for k in range(8):
        t = k / 7.0
        r = lip_r + out * t ** 0.6
        pts.append((r * math.cos(a), r * math.sin(a), lip_z - (lip_z - land_z) * t * t))
    return pts


def _water(kit, m):
    for k in range(12):   # upper bowl -> lower bowl
        a = TAU * (k + 0.5) / 12
        kit.tube("fountain_falls", m["water_fall"], _stream(UPPER_LIP_R, UPPER_LIP_Z - 0.01, LOWER_LIP_Z - 0.06, a,
                                                             0.18), 0.03, 0.018, sides=5)
    # r2: a continuous translucent curtain from the lower lip to the pool (A01 sheets of water),
    # plus a few heavier streams, instead of 18 wire-thin strands.
    curtain = [(LOWER_LIP_R + 0.3 * t ** 0.6, LOWER_LIP_Z - 0.03 - (LOWER_LIP_Z - POOL_Z) * t * t)
               for t in (0.0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.0)]
    kit.lathe("fountain_falls", m["water_fall"], list(reversed(curtain)), (0, 0, 0), segs=48, cap=False)
    for k in range(12):   # lower bowl -> pool
        a = TAU * k / 12
        kit.tube("fountain_falls", m["water_fall"], _stream(LOWER_LIP_R, LOWER_LIP_Z - 0.01, POOL_Z, a, 0.33),
                 0.06, 0.035, sides=6)
    top = FINIAL[-1][1]
    kit.tube("fountain_falls", m["water_fall"], [(0, 0, top - 0.05), (0, 0, top + 0.35), (0, 0, top + 0.55)],
             0.045, 0.02)
    for k in range(8):    # crown jets arcing back into the upper bowl
        a = TAU * k / 8
        kit.tube("fountain_falls", m["water_fall"],
                 [(0.42 * t * math.cos(a), 0.42 * t * math.sin(a), top + 0.45 + 0.2 * t - 1.0 * t * t)
                  for t in (0.0, 0.25, 0.5, 0.75, 1.0)], 0.025, 0.015, sides=5)
    kit.annulus("fountain_splash", m["water_foam"], LOWER_LIP_R + 0.2, LOWER_LIP_R + 0.36, POOL_Z + 0.01, segs=48)
    kit.annulus("fountain_splash", m["water_foam"], UPPER_LIP_R + 0.12, UPPER_LIP_R + 0.26, LOWER_LIP_Z - 0.06,
                segs=36)
    for k in range(16):   # spray beads where the streams land
        a = TAU * (k + 0.3) / 16
        r = LOWER_LIP_R + 0.28
        kit.blob("fountain_splash", m["water_foam"], 0.07, (r * math.cos(a), r * math.sin(a), POOL_Z + 0.06),
                 scale=(1, 1, 0.6))
