"""K2 house kit: stone shell with cut openings, trim, windows with teal shutters, door, blank sign,
lanterns, planters, balcony / loggia / banners, and the optional awning (A04, A05, A06 language)."""

import math

from mathutils import Matrix

from k2_geom import Part, arch_outline, cut, cutter_arch
from k2_spec import FACADES, FLOOR_Z, SIZE_CLASSES, WALL_T, door_spec, mirror, sign_spec, storey_base, window_specs

SHOP_RISE = 0.45
STONE_UV = {}


def _openings(size, facade):
    """(window, absolute bottom z, rise) for every facade opening."""
    out = []
    for w in window_specs(size, facade):
        z0 = storey_base(size, w["storey"]) + w["sill"]
        out.append((w, z0, SHOP_RISE if w["kind"] == "shop" else None))
    return out


def build_shell(root, coll, mats, size, facade):
    s = SIZE_CLASSES[size]
    W, D, H, T = s.width, s.depth, s.wall_h, WALL_T
    front = Part("exterior_walls", mats)
    front.box_minmax((-W / 2, 0, 0), (W / 2, T, H), "stone")
    obj = front.finish(root, coll)
    d = door_spec(size, facade)
    cutters = [cutter_arch("door", d["position"][0], FLOOR_Z, d["width"], d["height"], -0.2, T + 0.2)]
    for w, z0, rise in _openings(size, facade):
        through = w["kind"] == "shop"
        depth = T + 0.2 if through else (0.27 if w["kind"] == "loggia" else 0.12)
        cutters.append(cutter_arch(w["kind"], w["x"], z0, w["width"], w["height"], -0.2, depth, rise))
    cut(obj, cutters, coll)
    p = Part.reopen(obj, mats)
    p.box_minmax((-W / 2, D - T, 0), (W / 2, D, H), "stone")
    for sx in (-1, 1):
        x0, x1 = sorted((sx * W / 2, sx * (W / 2 - T)))
        p.box_minmax((x0, T, 0), (x1, D - T, H), "stone_shade" if sx > 0 else "stone")
    from k2_roof import build_gable_walls
    build_gable_walls(p, size, facade)
    return p.write(obj)


def _quoins(p, W, D, H):
    for cx, cy in ((-W / 2, 0.0), (W / 2, 0.0), (-W / 2, D), (W / 2, D)):
        sx, sy = (1 if cx > 0 else -1), (-1 if cy == 0 else 1)
        z, k = 0.55, 0
        while z + 0.36 < H - 0.2:
            lx, ly = (0.62, 0.36) if k % 2 == 0 else (0.36, 0.62)
            xs = sorted((cx + sx * 0.04, cx - sx * (lx - 0.04)))
            ys = sorted((cy + sy * 0.04, cy - sy * (ly - 0.04)))
            p.box_minmax((xs[0], ys[0], z + 0.01), (xs[1], ys[1], z + 0.35), "stone_trim")
            z += 0.36
            k += 1


def _band(p, W, D, z0, z1, out):
    p.box_minmax((-W / 2 - out, -out, z0), (W / 2 + out, 0.01, z1), "stone_trim")
    p.box_minmax((-W / 2 - out, D - 0.01, z0), (W / 2 + out, D + out, z1), "stone_trim")
    for sx in (-1, 1):
        x0, x1 = sorted((sx * (W / 2 + out), sx * (W / 2 - 0.01)))
        p.box_minmax((x0, -out, z0), (x1, D + out, z1), "stone_trim")


def build_trim(root, coll, mats, size, facade):
    s = SIZE_CLASSES[size]
    W, D, H = s.width, s.depth, s.wall_h
    d = door_spec(size, facade)
    p = Part("exterior_trim", mats)
    p.box_minmax((-W / 2 - 0.3, -0.95, 0), (W / 2 + 0.3, D + 0.3, FLOOR_Z), "stone_trim")      # base slab
    dx0, dx1 = d["position"][0] - d["width"] / 2, d["position"][0] + d["width"] / 2
    for a, b in ((-W / 2 - 0.07, dx0), (dx1, W / 2 + 0.07)):                                    # plinth
        p.box_minmax((a, -0.07, FLOOR_Z), (b, 0.01, 0.55), "stone_trim")
    for sx in (-1, 1):
        x0, x1 = sorted((sx * (W / 2 + 0.07), sx * (W / 2 - 0.01)))
        p.box_minmax((x0, 0, FLOOR_Z), (x1, D, 0.55), "stone_trim")
    _quoins(p, W, D, H)
    for k in range(1, s.storeys):
        z = storey_base(size, k)
        _band(p, W, D, z - 0.09, z + 0.09, 0.07)
    _band(p, W, D, H - 0.2, H + 0.05, 0.14)
    for w, z0, rise in _openings(size, facade):
        if w["kind"] == "loggia":
            continue
        p.box_minmax((w["x"] - w["width"] / 2 - 0.12, -0.13, z0 - 0.09), (w["x"] + w["width"] / 2 + 0.12, 0.05, z0),
                     "stone_trim")
        r = w["width"] / 2 if rise is None else rise
        p.arch_ring(w["x"], z0 + w["height"] - r, -0.06, w["width"], 0.17, 0.08, "stone_trim", rise=rise, segs=9)
    return p.finish(root, coll)


def build_windows(root, coll, mats, size, facade):
    p = Part("windows", mats)
    m = mirror(facade)
    for w, z0, rise in _openings(size, facade):
        x, ww, h = w["x"], w["width"], w["height"]
        if w["kind"] == "loggia":
            continue
        if w["kind"] == "shop":
            pts, spring = arch_outline(x, z0, ww - 0.02, h - 0.01, rise)
            p.poly_prism(pts, 0.03, "glass_shop", Matrix.Translation((0, WALL_T * 0.5, 0)))
            for xx in (x - ww / 2 + 0.05, x, x + ww / 2 - 0.05):
                p.box((xx, WALL_T * 0.5, (z0 + spring) / 2 + 0.2), (0.07, 0.08, spring - z0 + 0.4), "wood_dark")
            p.box((x, WALL_T * 0.5, spring), (ww, 0.08, 0.07), "wood_dark")
            p.box_minmax((x - ww / 2, -0.05, 0.56), (x + ww / 2, 0.0, z0 - 0.1), "teal")             # wainscot
            for i in range(int(ww / 0.22)):
                xx = x - ww / 2 + 0.11 + i * 0.22
                p.box((xx, -0.055, (0.56 + z0 - 0.1) / 2), (0.02, 0.012, z0 - 0.68), "teal_dark")
            continue
        pts, spring = arch_outline(x, z0, ww, h)
        p.poly_prism(pts, 0.03, "glass_dark", Matrix.Translation((0, 0.09, 0)))
        p.box((x, 0.08, (z0 + spring + ww / 2) / 2), (0.06, 0.04, spring + ww / 2 - z0), "wood_dark")
        p.box((x, 0.08, spring), (ww, 0.04, 0.06), "wood_dark")
        if w["storey"] == 0:                                   # ground windows: iron grille
            for i in range(1, 5):
                xx = x - ww / 2 + ww * i / 5
                p.box((xx, -0.02, z0 + (h - 0.2) / 2), (0.03, 0.03, h - 0.2), "iron")
            continue
        for side in (-1, 1):                                   # open teal shutters with battens
            cx = x + side * (ww / 2 + ww / 4 + 0.05)
            p.box((cx, -0.04, z0 + h / 2 - 0.05), (ww / 2, 0.05, h - 0.1), "teal")
            for zz in (z0 + 0.3, z0 + h - 0.45):
                p.box((cx, -0.07, zz), (ww / 2 - 0.06, 0.02, 0.08), "teal_dark")
            p.box((cx, -0.07, z0 + h / 2 - 0.05), (0.03, 0.02, h - 0.3), "teal_dark")
    _ = m
    return p.finish(root, coll)


def build_door(root, coll, mats, size, facade):
    d = door_spec(size, facade)
    m = mirror(facade)
    x, dw, dh = d["position"][0], d["width"], d["height"]
    frame = Part("door_frame", mats)
    frame.arch_ring(x, FLOOR_Z + dh - dw / 2, -0.08, dw, 0.24, 0.1, "stone_trim", segs=9)
    for side in (-1, 1):
        z = FLOOR_Z
        k = 0
        while z < FLOOR_Z + dh - dw / 2 - 0.1:
            wdt = 0.34 if k % 2 == 0 else 0.24
            frame.box((x + side * (dw / 2 + wdt / 2), -0.05, z + 0.2), (wdt, 0.1, 0.38), "stone_trim")
            z += 0.4
            k += 1
    frame.box((x, WALL_T / 2, FLOOR_Z + 0.005), (dw, WALL_T, 0.01), "brass")
    frame_obj = frame.finish(root, coll)
    leaf = Part("door_leaf", mats)
    pts, _ = arch_outline(-m * dw / 2, 0.0, dw - 0.06, dh - 0.03)
    hinge = Matrix.Translation((x + m * (dw / 2 - 0.05), WALL_T - 0.02, FLOOR_Z)) @ Matrix.Rotation(-m * math.radians(92), 4, "Z")
    leaf.poly_prism([(px + m * 0.03, pz) for px, pz in pts], 0.07, "wood", hinge)
    for zz in (0.35, dh - 0.9):
        leaf.poly_prism([(-m * 0.05, zz), (-m * (dw - 0.1), zz), (-m * (dw - 0.1), zz + 0.08), (-m * 0.05, zz + 0.08)],
                        0.09, "brass", hinge @ Matrix.Translation((0, -0.01, 0)))
    leaf.poly_prism([(-m * (dw - 0.25), 1.05), (-m * (dw - 0.15), 1.05), (-m * (dw - 0.15), 1.2),
                     (-m * (dw - 0.25), 1.2)], 0.11, "brass", hinge @ Matrix.Translation((0, -0.02, 0)))
    return frame_obj, leaf.finish(root, coll)


def build_sign(root, coll, mats, size, facade):
    sg = sign_spec(size, facade)
    (x, y, z), (w, h) = sg["position"], sg["size"]
    board = Part("sign_board", mats)
    board.box((x, y + 0.03, z), (w, 0.05, h), "sign_blank")
    for dz in (-h / 2, h / 2):
        board.box((x, y + 0.02, z + dz), (w + 0.1, 0.07, 0.06), "wood_dark")
    for dx in (-w / 2, w / 2):
        board.box((x + dx, y + 0.02, z), (0.06, 0.07, h + 0.1), "wood_dark")
    br = Part("sign_bracket", mats)
    if sg["style"] == "hanging":
        top = z + h / 2 + 0.17
        br.box((x, y + 0.03, top), (w + 0.3, 0.04, 0.04), "iron")
        for dx in (-w / 2 - 0.12, w / 2 + 0.12):
            br.box((x + dx, (y + 0.03) / 2, top), (0.04, abs(y), 0.04), "iron")
        for dx in (-w * 0.35, w * 0.35):
            br.rod((x + dx, y + 0.03, top), (x + dx, y + 0.03, z + h / 2 + 0.03), 0.012, "iron", 6)
        br.sphere((x - w / 2 - 0.18, y + 0.03, top), 0.05, "brass")
        br.sphere((x + w / 2 + 0.18, y + 0.03, top), 0.05, "brass")
    else:
        for dx in (-w / 2 + 0.08, w / 2 - 0.08):
            for dz in (-h / 2 + 0.08, h / 2 - 0.08):
                br.cyl((x + dx, y - 0.01, z + dz), 0.025, 0.03, "brass", 8, rot=(math.pi / 2, 0, 0))
        if sg["style"] == "plaque":
            br.box((x, y + 0.06, z), (w + 0.35, 0.04, h + 0.3), "stone_trim")
    return board.finish(root, coll), br.finish(root, coll)


def _lantern(p, x, z, y_wall=0.0):
    p.box((x, y_wall - 0.15, z + 0.42), (0.04, 0.3, 0.04), "iron")
    p.box((x, y_wall - 0.3, z), (0.15, 0.15, 0.26), "glow")
    for dx in (-0.08, 0.08):
        for dy in (-0.08, 0.08):
            p.box((x + dx, y_wall - 0.3 + dy, z), (0.025, 0.025, 0.28), "brass")
    p.cyl((x, y_wall - 0.3, z + 0.19), 0.13, 0.12, "brass", 8, radius2=0.03)
    p.box((x, y_wall - 0.3, z - 0.16), (0.2, 0.2, 0.05), "brass")


def build_lanterns(root, coll, mats, size, facade):
    d = door_spec(size, facade)
    m = mirror(facade)
    p = Part("lanterns", mats)
    x, dw = d["position"][0], d["width"]
    sides = (-1, 1) if facade == "loggia" else (-m,)
    for sd in sides:
        _lantern(p, x + sd * (dw / 2 + 0.5), FLOOR_Z + 2.0)
    return p.finish(root, coll)


def _pot(p, x, y, r=0.24):
    p.cyl((x, y, FLOOR_Z + r * 1.1), r, r * 2.2, "clay", 12, radius2=r * 0.75, smooth=True)
    p.cyl((x, y, FLOOR_Z + r * 2.25), r * 1.05, 0.08, "clay", 12, smooth=True)
    for i, (dx, dy, dz, rr) in enumerate(((0, 0, 0.55, 0.3), (0.15, 0.05, 0.8, 0.22), (-0.13, -0.04, 0.75, 0.24),
                                         (0.02, 0.1, 1.0, 0.18))):
        p.sphere((x + dx, y + dy, FLOOR_Z + r * 2.2 + dz), rr, "olive" if i % 2 == 0 else "leaf_dark", 8, 5)


def build_planters(root, coll, mats, size, facade):
    s = SIZE_CLASSES[size]
    p = Part("planters", mats)
    for sx in (-1, 1):
        _pot(p, sx * (s.width / 2 - 0.05), -0.55)
    for w, z0, _ in _openings(size, facade):
        if w["kind"] == "window" and w["storey"] >= 1:
            if FACADES[facade].balcony and w["storey"] == 1:
                continue                       # the balcony carries its own flower boxes
            bz = z0 - 0.2
            p.box((w["x"], -0.2, bz), (w["width"] + 0.1, 0.28, 0.22), "clay")
            for i in range(5):
                xx = w["x"] - w["width"] / 2 + 0.1 + i * (w["width"] - 0.2) / 4
                p.sphere((xx, -0.2, bz + 0.16), 0.11, "flower" if i % 2 else "olive", 6, 4)
    return p.finish(root, coll)
