"""K2 house kit: terracotta barrel-tile roofs (gable end to the street, or hipped), eaves with teal
rafter ends (A04), ridge and hip caps, chimney and the arched loggia pediment (A06).

Each roof face is described by its eave start P0, eave direction e, horizontal up-slope direction
h, eave length L, plan run R and a per-side inset at the top (0 for gable faces, R for hip faces).
"""

import math

from mathutils import Vector

from k2_geom import Part
from k2_spec import FACADES, SIZE_CLASSES

PITCH = math.radians(29)
OVERHANG = 0.45
TILE_U = 0.25
TILE_V = 0.36
TILE_LEN = 0.42
TILE_R = 0.105


def roof_faces(size, facade):
    s, f = SIZE_CLASSES[size], FACADES[facade]
    W, D, o, z = s.width, s.depth, OVERHANG, s.wall_h + 0.05
    X0, X1, Y0, Y1 = -W / 2 - o, W / 2 + o, -o, D + o
    if f.roof == "gable":               # ridge along y, gable end faces the street
        R = W / 2 + o
        return [
            (Vector((X1, Y0, z)), Vector((0, 1, 0)), Vector((-1, 0, 0)), Y1 - Y0, R, 0.0),
            (Vector((X0, Y1, z)), Vector((0, -1, 0)), Vector((1, 0, 0)), Y1 - Y0, R, 0.0),
        ]
    R = D / 2 + o                       # hip: ridge along x (W >= D)
    return [
        (Vector((X0, Y0, z)), Vector((1, 0, 0)), Vector((0, 1, 0)), X1 - X0, R, R),
        (Vector((X1, Y1, z)), Vector((-1, 0, 0)), Vector((0, -1, 0)), X1 - X0, R, R),
        (Vector((X1, Y0, z)), Vector((0, 1, 0)), Vector((-1, 0, 0)), Y1 - Y0, R, R),
        (Vector((X0, Y1, z)), Vector((0, -1, 0)), Vector((1, 0, 0)), Y1 - Y0, R, R),
    ]


def _frame(face):
    p0, e, h, L, R, inset = face
    rise = R * math.tan(PITCH)
    S = math.hypot(R, rise)
    s = (h * R + Vector((0, 0, rise))) / S
    n = e.cross(s).normalized()
    if n.z < 0:
        n = -n
    return p0, e, s, n, L, S, R, inset


def _corners(face):
    p0, e, s, n, L, S, R, inset = _frame(face)
    top_l, top_r = p0 + e * inset + s * S, p0 + e * (L - inset) + s * S
    pts = [p0, p0 + e * L, top_r]
    if (top_r - top_l).length > 1e-3:
        pts.append(top_l)
    return pts, n


def ridge_height(size, facade):
    s, f = SIZE_CLASSES[size], FACADES[facade]
    R = (s.width / 2 if f.roof == "gable" else s.depth / 2) + OVERHANG
    return s.wall_h + 0.05 + R * math.tan(PITCH)


def build_tiles(size, facade, mats):
    tiles = Part("roof_tiles", mats)
    under = Part("roof_structure", mats)
    faces = roof_faces(size, facade)
    for face in faces:
        p0, e, s, n, L, S, R, inset = _frame(face)
        corners, normal = _corners(face)
        under.slab(corners, 0.1, normal, "roof_dark")
        rows = int((S - 0.05) / TILE_V)
        for r in range(rows):
            v = r * TILE_V
            t_top = min(1.0, (v + TILE_LEN) / S)
            lo, hi = inset * t_top + TILE_R + 0.02, L - inset * t_top - TILE_R - 0.02
            u = TILE_U / 2
            while u <= L - TILE_U / 2 + 1e-6:
                if lo <= u <= hi:
                    origin = p0 + e * u + s * v + n * 0.005
                    length = min(TILE_LEN, S - v)
                    tiles.half_barrel(origin, e, s, n, TILE_R, length, "roof")
                u += TILE_U
        under.beam(p0 - n * 0.06, p0 + e * L - n * 0.06, 0.06, 0.16, "wood_dark", up=n)   # fascia
    _ridges(tiles, faces)
    return tiles, under


def _ridges(tiles, faces):
    tops = []
    for face in faces:
        p0, e, s, n, L, S, R, inset = _frame(face)
        tl, tr = p0 + e * inset + s * S, p0 + e * (L - inset) + s * S
        if (tr - tl).length > 1e-3:
            tops.append((tl, tr))
        if inset > 0:   # hip lines from the eave corners up to the ridge ends
            tiles.rod(p0 + Vector((0, 0, 0.06)), tl + Vector((0, 0, 0.06)), 0.12, "roof")
            tiles.rod(p0 + e * L + Vector((0, 0, 0.06)), tr + Vector((0, 0, 0.06)), 0.12, "roof")
    for a, b in tops[:1] or []:
        tiles.rod(a + Vector((0, 0, 0.07)), b + Vector((0, 0, 0.07)), 0.14, "roof", segments=10)
        tiles.sphere(a + Vector((0, 0, 0.08)), 0.17, "roof")
        tiles.sphere(b + Vector((0, 0, 0.08)), 0.17, "roof")


def build_eave_details(part, size, facade):
    """Teal rafter ends under the eaves (A04) and a gable rake board for gable roofs."""
    s, f = SIZE_CLASSES[size], FACADES[facade]
    W, D, z = s.width, s.depth, s.wall_h - 0.08
    n_front = max(3, int(W / 0.9))
    sides = [("y", D)] if f.roof == "gable" else [("x", W), ("y", D)]
    for axis, length in sides:
        n = max(3, int(length / 0.9))
        for i in range(n):
            t = -length / 2 + length * (i + 0.5) / n if axis == "x" else length * (i + 0.5) / n
            if axis == "y":
                for sx in (-1, 1):
                    part.box((sx * (W / 2 + 0.2), t, z), (0.4, 0.16, 0.18), "teal")
            else:
                for y, dy in ((-0.2, 0.4), (D + 0.2, 0.4)):
                    part.box((t, y, z), (0.16, dy, 0.18), "teal")
    if f.roof == "gable":   # rafter ends under the front and back rake
        rise = (W / 2 + OVERHANG) * math.tan(PITCH)
        for i in range(n_front):
            x = -W / 2 + W * (i + 0.5) / n_front
            zz = s.wall_h + (W / 2 - abs(x)) / (W / 2 + OVERHANG) * rise - 0.12
            for y in (-0.2, D + 0.2):
                part.box((x, y, zz), (0.14, 0.4, 0.16), "teal")


def build_gable_walls(part, size, facade):
    s = SIZE_CLASSES[size]
    if FACADES[facade].roof != "gable":
        return
    W, T = s.width, 0.35
    rise = (W / 2) * math.tan(PITCH) + 0.05
    from mathutils import Matrix
    for y in (0.0, s.depth - T):
        part.poly_prism([(-W / 2, s.wall_h), (W / 2, s.wall_h), (0.0, s.wall_h + rise)], T, "stone",
                        Matrix.Translation((0, y, 0)))


def build_chimney(part, size, facade):
    if not FACADES[facade].chimney:
        return
    s = SIZE_CLASSES[size]
    x, y = -s.width / 2 + 0.9, s.depth * 0.62
    top = ridge_height(size, facade) + 0.7
    part.box((x, y, (s.wall_h + top) / 2), (0.75, 0.75, top - s.wall_h), "stone")
    part.box((x, y, top + 0.06), (0.92, 0.92, 0.12), "stone_trim")
    for dx in (-0.2, 0.2):
        part.half_barrel(Vector((x + dx, y - 0.46, top + 0.12)), Vector((1, 0, 0)), Vector((0, 1, 0)),
                         Vector((0, 0, 1)), 0.13, 0.92, "roof")


def build_pediment(part, size, facade):
    """Arched pediment with a plum tympanum and a gold finial over the loggia facade (A06)."""
    if facade != "loggia":
        return
    from mathutils import Matrix
    s = SIZE_CLASSES[size]
    r = min(1.9, s.width * 0.24)
    z0 = s.wall_h
    segs = 18
    outline = [(math.cos(math.pi * (1 - i / segs)) * (r + 0.25), z0 + math.sin(math.pi * (1 - i / segs)) * (r + 0.25))
               for i in range(segs + 1)]
    part.poly_prism(outline, 0.4, "stone", Matrix.Translation((0, -0.05, 0)))
    tymp = [(math.cos(math.pi * (1 - i / segs)) * r, z0 + 0.12 + math.sin(math.pi * (1 - i / segs)) * (r - 0.1))
            for i in range(segs + 1)]
    part.poly_prism(tymp, 0.06, "plum", Matrix.Translation((0, -0.1, 0)))
    part.arch_ring(0.0, z0 + 0.12, -0.12, 2 * (r - 0.02), 0.16, 0.1, "gold", segs=14, voussoirs=False)
    part.poly_prism([(-0.22, z0 + 0.9), (0.0, z0 + 1.25), (0.22, z0 + 0.9), (0.0, z0 + 0.55)], 0.05, "gold",
                    Matrix.Translation((0, -0.15, 0)))
    part.cyl((0, 0.15, z0 + r + 0.38), 0.14, 0.18, "gold")
    part.sphere((0, 0.15, z0 + r + 0.62), 0.22, "gold")
