"""Canted east portal of the OpenPoker casino (A01 right side, read from the contract spawn).

The casino's main front (and the runtime door anchor at (0, -9.7)) faces the fountain along -y,
so from the spawn on the east street it is seen almost edge-on. This pavilion closes the
casino's south-east corner with an entrance front turned 45 degrees toward the spawn sightline:
gold-framed plum doors under a fan light, plum columns with gold capitals, plum/gold banners,
a small plum dome, and a wide red-carpet stair spilling onto the square. Generic only: no
venue name or catalogue. The interactive door stays the main front door; these doors are dressing.

Local frame: u runs along the front (0..WIDTH), v points out of the front toward the spawn
(negative v is inside the building), z is up. Blender frame, Z up.
"""

import math

from arrival_props import urn_with_flowers

ORIGIN = (7.8, 6.6)            # front-left corner (where the front meets the main facade's east end)
YAW = math.radians(45.0)       # front rotated 45 degrees from the main front (normal -y) toward +x
# Low portico (round 3): the pavilion is ~12 m from the spawn eye, where the frame top sits near
# z 7.2, so the cornice stays at 5.6 and its plum dome rises straight off the pediment into the
# top band of the spawn frame (one landmark: red steps -> doors -> pediment -> dome).
WIDTH, DEPTH, HEIGHT = 5.0, 2.8, 5.6
DOOR_HALF, DOOR_SPRING = 1.0, 2.75
ENT0 = 3.95                    # entablature bottom; pediment apex at ENT0 + 1.25
LAMP_DZ = -0.2
DOME_V = -1.3                  # dome centre, metres behind the front (inside the 2.8 m deep pavilion)
DOME_DRUM_R, DOME_R, DOME_RISE = 1.7, 1.9, 1.75
STEPS, RISE, RUN, LANDING = 5, 0.15, 0.42, 0.9
STAIR_U = (0.3, 4.7)
CARPET_HALF = 1.1
RUNNER_END = 4.4               # carpet runner across the paving, in metres out from the front

_T = (math.cos(YAW), math.sin(YAW))
_N = (math.sin(YAW), -math.cos(YAW))


def P(u, v, z):
    """Local (u, v, z) -> Blender world."""
    return (ORIGIN[0] + u * _T[0] + v * _N[0], ORIGIN[1] + u * _T[1] + v * _N[1], z)


def _b(kit, name, mat, u0, u1, v0, v1, z0, z1):
    kit.box(name, mat, (u1 - u0, v1 - v0, z1 - z0), P((u0 + u1) / 2, (v0 + v1) / 2, (z0 + z1) / 2), rot=(0, 0, YAW))


def _disc(kit, name, mat, r, v, z, depth, u=None):
    u = WIDTH / 2 if u is None else u
    kit.cyl(name, mat, r, depth, P(u, v, z), verts=28, rot=(math.pi / 2, 0, YAW))


def build_east_portal(kit, m):
    _body(kit, m)
    _doorway(kit, m)
    _order(kit, m)
    _banners(kit, m)
    _stair(kit, m)
    _dome_cap(kit, m)


def _body(kit, m):
    g = "casino_portal"
    _b(kit, g, m["ashlar"], 0.0, WIDTH, -DEPTH, 0.0, 0.0, HEIGHT)
    kit.box_mm(g, m["ashlar"], 7.8, 10.0, 9.7, 13.0, 0.0, HEIGHT - 0.4)   # ties the pavilion to the casino body
    kit.tag(g, arrival_obstacle=True, arrival_bevel=True)
    t = "casino_portal_trim"
    pale = m["limestone_pale"]
    _b(kit, t, pale, -0.05, WIDTH + 0.05, 0.0, 0.14, 0.0, 0.7)                       # plinth
    for u0 in (0.0, WIDTH - 0.45):                                                  # corner quoins
        for k in range(int((HEIGHT - 1.4) / 0.7)):
            w = 0.45 if k % 2 else 0.32
            a = u0 if u0 == 0.0 else WIDTH - w
            _b(kit, t, pale, a, a + w, 0.0, 0.1, 0.8 + k * 0.7, 1.15 + k * 0.7)
    _b(kit, t, pale, -0.25, WIDTH + 0.25, -DEPTH, 0.42, HEIGHT - 0.5, HEIGHT)        # cornice
    _b(kit, t, m["gold"], -0.2, WIDTH + 0.2, 0.0, 0.44, HEIGHT - 0.62, HEIGHT - 0.5)


def _doorway(kit, m):
    uc = WIDTH / 2
    z0 = STEPS * RISE
    d = "casino_portal_doors"
    _b(kit, d, m["plum_deep"], uc - DOOR_HALF - 0.1, uc + DOOR_HALF + 0.1, 0.0, 0.03, z0, DOOR_SPRING)
    _disc(kit, d, m["plum_deep"], DOOR_HALF + 0.1, 0.015, DOOR_SPRING, 0.03)
    _b(kit, d, m["plum"], uc - DOOR_HALF, uc + DOOR_HALF, 0.0, 0.07, z0, DOOR_SPRING - 0.05)
    _b(kit, d, m["gold"], uc - 0.03, uc + 0.03, 0.0, 0.09, z0, DOOR_SPRING - 0.05)
    for su in (-1.0, 1.0):  # raised gold panel mouldings and ring pulls
        for zz in (z0 + 0.5, z0 + 1.7):
            _b(kit, d, m["gold"], uc + su * 0.15, uc + su * 0.9, 0.06, 0.1, zz, zz + 0.05)
            _b(kit, d, m["gold"], uc + su * 0.15, uc + su * 0.9, 0.06, 0.1, zz + 0.9, zz + 0.95)
        kit.sphere(d, m["gold"], 0.09, P(uc + su * 0.28, 0.12, z0 + 1.35), segs=8, rings=6)
    # Fan light: glowing half disc with gold rays, framed by a gold arch moulding.
    _disc(kit, d, m["window_glow"], DOOR_HALF - 0.05, 0.05, DOOR_SPRING, 0.05)
    _b(kit, d, m["gold"], uc - DOOR_HALF, uc + DOOR_HALF, 0.0, 0.1, DOOR_SPRING - 0.08, DOOR_SPRING)
    for k in range(7):
        a = math.pi * (k + 1) / 8
        r = DOOR_HALF - 0.1
        kit.tube(d, m["gold"], [P(uc, 0.1, DOOR_SPRING), P(uc - r * math.cos(a), 0.1, DOOR_SPRING + r * math.sin(a))],
                 0.025, 0.025, sides=4)
    frame = [P(uc - DOOR_HALF - 0.12, 0.12, z0)]
    frame += [P(uc - (DOOR_HALF + 0.12) * math.cos(math.pi * k / 14), 0.12,
                DOOR_SPRING + (DOOR_HALF + 0.12) * math.sin(math.pi * k / 14)) for k in range(15)]
    frame += [P(uc + DOOR_HALF + 0.12, 0.12, z0)]
    kit.tube(d, m["gold"], frame, 0.09, 0.09, sides=6)
    kit.sphere(d, m["gold"], 0.2, P(uc, 0.2, DOOR_SPRING + DOOR_HALF + 0.25), scale=(1, 0.5, 1.3), segs=8, rings=6)
    # Plum drape swag over the door (A01 casino portal).
    swag = [P(uc - 1.6 + 3.2 * k / 10, 0.35, ENT0 - 0.05 - 0.25 * math.sin(math.pi * k / 10)) for k in range(11)]
    kit.tube("casino_portal_drape", m["plum"], swag, 0.14, 0.14, sides=6)


def _order(kit, m):
    """Two plum columns with gold bases and capitals carrying a pale entablature."""
    uc = WIDTH / 2
    z0 = STEPS * RISE
    g = "casino_portal_order"
    for su in (-1.0, 1.0):
        u = uc + su * 1.75
        shaft = ENT0 - 0.3 - (z0 + 0.25)
        kit.cyl(g, m["plum"], 0.22, shaft, P(u, 0.5, z0 + 0.25 + shaft / 2), verts=14)
        kit.box(g, m["gold"], (0.6, 0.6, 0.25), P(u, 0.5, z0 + 0.125), rot=(0, 0, YAW))
        kit.box(g, m["gold"], (0.62, 0.62, 0.3), P(u, 0.5, ENT0 - 0.15), rot=(0, 0, YAW))
        kit.cyl(g, m["gold"], 0.2, 0.08, P(u, 0.5, z0 + 1.6), verts=14)
    _b(kit, g, m["limestone_pale"], uc - 2.25, uc + 2.25, 0.0, 0.85, ENT0, ENT0 + 0.45)
    _b(kit, g, m["gold"], uc - 2.27, uc + 2.27, 0.0, 0.87, ENT0, ENT0 + 0.07)
    pts = [(uc - 2.4, ENT0 + 0.45), (uc, ENT0 + 1.25), (uc + 2.4, ENT0 + 0.45)]   # low pediment
    kit.poly(g, m["limestone_pale"], [P(u, 0.8, z) for u, z in pts])
    kit.poly(g, m["limestone_pale"], [P(u, 0.8, z) for u, z in reversed(pts)])
    for (ua, za), (ub, zb) in ((pts[0], pts[1]), (pts[1], pts[2])):
        kit.tube(g, m["gold"], [P(ua, 0.82, za + 0.04), P(ub, 0.82, zb + 0.04)], 0.06, 0.06, sides=4)
    kit.box(g, m["gold"], (0.36, 0.06, 0.36), P(uc, 0.84, ENT0 + 0.8), rot=(0, math.pi / 4, YAW))


def _banners(kit, m):
    """Plum banners with gold diamonds either side of the order, plus bracketed lanterns."""
    for u in (0.75, WIDTH - 0.75):
        b = "casino_portal_banners"
        kit.tube(b, m["gold"], [P(u - 0.5, 0.12, 4.85), P(u + 0.5, 0.12, 4.85)], 0.04, 0.04, sides=5)
        _b(kit, b, m["plum"], u - 0.42, u + 0.42, 0.04, 0.1, 2.95, 4.8)
        pts = [P(u - 0.42, 0.1, 2.95), P(u, 0.1, 2.6), P(u + 0.42, 0.1, 2.95)]
        kit.poly(b, m["plum"], pts)
        kit.poly(b, m["plum"], list(reversed(pts)))
        _b(kit, b, m["gold"], u - 0.36, u + 0.36, 0.1, 0.12, 4.5, 4.58)
        kit.box(b, m["gold"], (0.36, 0.04, 0.36), P(u, 0.13, 3.9), rot=(0, math.pi / 4, YAW))
        l = "casino_portal_lanterns"
        dz = LAMP_DZ
        _b(kit, l, m["iron"], u - 0.1, u + 0.1, 0.0, 0.05, 2.0 + dz, 2.7 + dz)          # wall plate
        kit.tube(l, m["iron"], [P(u, 0.05, 2.6 + dz), P(u, 0.35, 2.65 + dz), P(u, 0.45, 2.5 + dz)], 0.035, 0.035,
                 sides=4)
        kit.lathe(l, m["brass"], [(0.0, 0.0), (0.18, 0.02), (0.18, 0.08), (0.0, 0.1)], P(u, 0.45, 1.98 + dz), segs=8)
        kit.sphere(l + "_glow", m["glow"], 0.15, P(u, 0.45, 2.25 + dz), scale=(1, 1, 1.4), segs=10, rings=6)
        kit.lathe(l, m["brass"], [(0.0, 0.0), (0.2, 0.0), (0.0, 0.22)], P(u, 0.45, 2.46 + dz), segs=8)


def _stair(kit, m):
    """Five broad steps up to the landing, carpeted red with gold edges, the runner carried out
    across the paving toward the spawn street, stepped cheek walls and urns at the foot."""
    u0, u1 = STAIR_U
    uc = WIDTH / 2
    s = "casino_portal_stair"
    pale = m["limestone_pale"]
    out = [LANDING + (STEPS - 1 - k) * RUN for k in range(STEPS)]   # v extent of step k (k=0 bottom)
    for k in range(STEPS):
        _b(kit, s, pale, u0, u1, 0.0, out[k], k * RISE, (k + 1) * RISE)
        _b(kit, s + "_cheek", pale, u0 - 0.32, u0, 0.0, out[k], 0.0, (k + 1) * RISE + 0.55)
        _b(kit, s + "_cheek", pale, u1, u1 + 0.32, 0.0, out[k], 0.0, (k + 1) * RISE + 0.55)
    kit.tag(s, arrival_obstacle=True)
    kit.tag(s + "_cheek", arrival_obstacle=True)
    c = "casino_portal_carpet"
    for k in range(STEPS):
        top = (k + 1) * RISE
        v_back = out[k + 1] if k + 1 < STEPS else 0.0
        _b(kit, c, m["red_carpet"], uc - CARPET_HALF, uc + CARPET_HALF, v_back, out[k] + 0.01, top, top + 0.02)
        _b(kit, c, m["red_carpet"], uc - CARPET_HALF, uc + CARPET_HALF, out[k], out[k] + 0.02, k * RISE, top + 0.02)
        for su in (-1.0, 1.0):
            e = uc + su * CARPET_HALF
            _b(kit, c, m["gold"], e - 0.05, e + 0.05, v_back, out[k] + 0.03, top, top + 0.03)
    _b(kit, c, m["red_carpet"], uc - CARPET_HALF, uc + CARPET_HALF, out[0], RUNNER_END, 0.0, 0.025)
    for su in (-1.0, 1.0):
        e = uc + su * CARPET_HALF
        _b(kit, c, m["gold"], e - 0.06, e + 0.06, out[0], RUNNER_END, 0.0, 0.03)
    for i, u in enumerate((u0 - 0.16, u1 + 0.16)):
        x, y, _ = P(u, out[0] - 0.25, 0.0)
        urn_with_flowers(kit, f"casino_portal_urn_{i + 1}", m, (x, y, 0.55), 0.3)


def _dome_cap(kit, m):
    """The casino's plum/gold dome, seated straight on the low portico behind its pediment, so from
    the spawn the red steps, the doors, the pediment and the dome stack as one landmark."""
    from arrival_casino import _dome   # lazy: arrival_casino imports this module
    uc = WIDTH / 2
    x, y, _ = P(uc, DOME_V, 0.0)
    kit.box("casino_portal_attic", m["gold"], (4.0, 2.9, 0.06), (x, y, HEIGHT + 0.03), rot=(0, 0, YAW))
    _dome(kit, m, "casino_portal_dome", (x, y, HEIGHT), drum_r=DOME_DRUM_R, drum_h=0.3, dome_r=DOME_R,
          rise=DOME_RISE)
