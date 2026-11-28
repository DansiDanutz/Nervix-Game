"""K2 house kit: facade details (teal X-rail balcony, loggia balustrade and curtains, plum banners,
door hood) and the optional scalloped awning node opt_awning."""

import math

from mathutils import Matrix

from k2_geom import Part
from k2_spec import FACADES, FLOOR_Z, SIZE_CLASSES, door_spec, mirror, storey_base, window_specs


def _banner(p, x, z_top, length, y=-0.12, width=0.5):
    p.rod((x - width / 2 - 0.08, y, z_top), (x + width / 2 + 0.08, y, z_top), 0.025, "brass", 6)
    pts = [(x - width / 2, z_top), (x + width / 2, z_top), (x + width / 2, z_top - length + 0.2),
           (x, z_top - length), (x - width / 2, z_top - length + 0.2)]
    p.poly_prism(list(reversed(pts)), 0.03, "plum", Matrix.Translation((0, y + 0.02, 0)))
    cz = z_top - length + 0.42
    p.poly_prism([(x, cz - 0.13), (x + 0.1, cz), (x, cz + 0.13), (x - 0.1, cz)], 0.02, "gold",
                 Matrix.Translation((0, y - 0.005, 0)))


def _balcony(p, size, facade):
    s = SIZE_CLASSES[size]
    W, z = s.width, storey_base(size, 1)
    x0, x1, y0 = -W / 2 + 0.3, W / 2 - 0.3, -0.85
    p.box_minmax((x0, y0, z - 0.1), (x1, 0.0, z + 0.1), "stone_trim")
    for x in (x0 + 0.2, x1 - 0.2):
        p.box_minmax((x - 0.14, -0.6, z - 0.42), (x + 0.14, 0.0, z - 0.1), "stone_trim")
    posts = [x0 + 0.12 + (x1 - x0 - 0.24) * i / 4 for i in range(5)]
    for x in posts:
        p.box((x, y0 + 0.12, z + 0.55), (0.22, 0.22, 0.9), "stone_trim")
    p.box_minmax((x0, y0, z + 0.98), (x1, y0 + 0.24, z + 1.08), "stone_trim")
    for a, b in zip(posts, posts[1:]):
        a, b = a + 0.11, b - 0.11
        yy = y0 + 0.12
        for zz in (z + 0.16, z + 0.92):
            p.box(((a + b) / 2, yy, zz), (b - a, 0.06, 0.06), "teal")
        for xa, xb in ((a, b), (b, a)):
            p.beam((xa, yy, z + 0.16), (xb, yy, z + 0.92), 0.05, 0.06, "teal", up=(0, -1, 0))
        p.box(((a + b) / 2, yy - 0.12, z + 1.17), (b - a - 0.1, 0.24, 0.18), "clay")
        for i in range(4):
            xx = a + 0.12 + i * (b - a - 0.24) / 3
            p.sphere((xx, yy - 0.12, z + 1.33), 0.12, "flower" if i % 2 else "olive", 6, 4)


def _loggia(p, size, facade):
    s = SIZE_CLASSES[size]
    z = storey_base(size, 1)
    bays = [w for w in window_specs(size, facade) if w["kind"] == "loggia"]
    x0 = min(w["x"] - w["width"] / 2 for w in bays) - 0.25
    x1 = max(w["x"] + w["width"] / 2 for w in bays) + 0.25
    p.box_minmax((x0, -0.32, z + 0.05), (x1, 0.02, z + 0.2), "stone_trim")
    p.box_minmax((x0, -0.3, z + 1.0), (x1, -0.04, z + 1.1), "stone_trim")
    x = x0 + 0.15
    while x < x1 - 0.1:
        p.cyl((x, -0.17, z + 0.6), 0.055, 0.8, "stone_trim", 8, radius2=0.075, smooth=True)
        x += 0.2
    for w in bays:
        bx, bw = w["x"], w["width"]
        for side in (-1, 1):
            p.box((bx + side * (bw / 2 - 0.2), 0.2, z + 0.25 + 1.0), (0.32, 0.05, 2.0), "plum")
            p.box((bx + side * (bw / 2 - 0.2), 0.16, z + 1.25), (0.36, 0.04, 0.06), "gold")
        p.box((bx, 0.24, z + 0.25 + 1.0), (bw - 0.1, 0.02, 2.0), "plum")
        p.rod((bx, 0.05, z + 2.55), (bx, 0.05, z + 2.25), 0.012, "iron", 6)
        p.box((bx, 0.05, z + 2.12), (0.16, 0.16, 0.24), "glow")
    _ = s


def _door_hood(p, size, facade):
    d = door_spec(size, facade)
    x, dw, dh = d["position"][0], d["width"], d["height"]
    p.arch_ring(x, FLOOR_Z + dh - dw / 2, -0.28, dw + 0.5, 0.26, 0.2, "plum", segs=12, voussoirs=False)
    p.arch_ring(x, FLOOR_Z + dh - dw / 2, -0.3, dw + 1.02, 0.05, 0.04, "gold", segs=12, voussoirs=False)


def build_details(root, coll, mats, size, facade):
    s, f = SIZE_CLASSES[size], FACADES[facade]
    m = mirror(facade)
    p = Part("facade_details", mats)
    if f.balcony:
        _balcony(p, size, facade)
        _banner(p, -m * (s.width / 2 - 1.0), storey_base(size, 1) - 0.12, 0.85, y=-0.7)
    if f.loggia:
        _loggia(p, size, facade)
        _door_hood(p, size, facade)
        d = door_spec(size, facade)
        for sd in (-1, 1):
            _banner(p, sd * (d["width"] / 2 + 1.05), storey_base(size, 1) - 0.15, 1.3, width=0.42)
    if facade == "awning":
        _banner(p, m * (s.width / 2 - 0.55), storey_base(size, 1) + 2.2, 1.4, width=0.45)
        for k in range(2, s.storeys):
            _banner(p, m * (s.width / 2 - 0.55), storey_base(size, k) + 2.2, 1.4, width=0.45)
    return p.finish(root, coll)


def build_awning(root, coll, mats, size, facade):
    """Scalloped teal awning (A05) over the shop window, or over the door when there is none."""
    shop = [w for w in window_specs(size, facade) if w["kind"] == "shop"]
    if shop:
        x, width = shop[0]["x"], shop[0]["width"] + 0.3
        zt = shop[0]["sill"] + shop[0]["height"] + 0.06
    else:
        d = door_spec(size, facade)
        x, width = d["position"][0], d["width"] + 0.8
        zt = FLOOR_Z + d["height"] + 0.28
    depth, drop = 1.15, 0.5
    p = Part("opt_awning", mats)
    a, b = x - width / 2, x + width / 2
    corners = [(a, -0.03, zt), (a, -depth, zt - drop), (b, -depth, zt - drop), (b, -0.03, zt)]
    p.slab(corners, 0.03, (0, -drop, -depth), "teal_awning")
    n = max(4, int(width / 0.32))
    sw = width / n
    for i in range(n):
        cx = a + sw * (i + 0.5)
        pts = [(cx + math.cos(math.pi + math.pi * k / 8) * sw / 2, zt - drop + math.sin(math.pi + math.pi * k / 8) * sw * 0.45)
               for k in range(9)]
        p.poly_prism([(cx - sw / 2, zt - drop + 0.12)] + pts + [(cx + sw / 2, zt - drop + 0.12)], 0.02,
                     "teal_awning" if i % 2 == 0 else "cream", Matrix.Translation((0, -depth - 0.01, 0)))
    p.beam((a, -depth - 0.02, zt - drop + 0.13), (b, -depth - 0.02, zt - drop + 0.13), 0.03, 0.04, "cream")
    for xx in (a + 0.05, b - 0.05):
        p.rod((xx, 0.0, zt - drop - 0.35), (xx, -depth + 0.05, zt - drop - 0.02), 0.02, "brass", 6)
        p.sphere((xx, -depth - 0.02, zt - drop + 0.02), 0.05, "brass", 6, 4)
    return p.finish(root, coll)
