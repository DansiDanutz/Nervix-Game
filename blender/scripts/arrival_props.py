"""Shared building parts and street props for the arrival square (one style for every module).

All helpers take the Kit, a group name and the material dict. Walls facing +y use face=1,
walls facing -y use face=-1 (Blender frame, Z up).
"""

import math


def gable_roof_x(kit, name, m, x0, x1, y0, y1, eave_z, rise, over=0.6, thick=0.28):
    """Terracotta gable roof with its ridge along x, plus the stone gable infill."""
    yc = (y0 + y1) / 2.0
    a, b = y0 - over, y1 + over
    top = eave_z + rise
    pts = [(a, eave_z - thick), (a, eave_z), (yc, top + thick * 0.8), (b, eave_z), (b, eave_z - thick),
           (yc, top - thick * 0.6)]
    kit.prism_x(name, m["roof"], pts, x0 - over, x1 + over)
    kit.prism_x(name + "_gable", m["ashlar"], [(y0, eave_z - thick), (yc, top - thick), (y1, eave_z - thick)],
                x0, x1)


def wall_lantern(kit, name, m, x, y, z, face=1.0):
    """Brass wall lantern on an iron bracket, glowing."""
    kit.box(name, m["iron"], (0.24, 0.05, 0.62), (x, y + face * 0.025, z + 0.3))       # wall plate
    kit.box(name, m["iron"], (0.09, 0.44, 0.09), (x, y + face * 0.24, z + 0.62))       # arm
    kit.box(name, m["iron"], (0.05, 0.05, 0.14), (x, y + face * 0.42, z + 0.6))        # hanger
    kit.box(name, m["iron"], (0.06, 0.3, 0.06), (x, y + face * 0.18, z + 0.38), rot=(face * 0.8, 0, 0))  # strut
    kit.box(name, m["brass"], (0.3, 0.3, 0.06), (x, y + face * 0.42, z - 0.02))
    kit.box(name, m["brass"], (0.34, 0.34, 0.08), (x, y + face * 0.42, z + 0.5))
    kit.sphere(name + "_glow", m["glow"], 0.15, (x, y + face * 0.42, z + 0.24), scale=(1, 1, 1.4), segs=10,
               rings=6)
    for dx, dy in ((-0.14, -0.14), (0.14, -0.14), (-0.14, 0.14), (0.14, 0.14)):  # lantern cage posts
        kit.box(name, m["brass"], (0.035, 0.035, 0.5), (x + dx, y + face * 0.42 + dy, z + 0.24))


def potted_olive(kit, name, m, x, y, s=1.0):
    kit.lathe(name, m["clay"], [(0.0, 0.0), (0.3 * s, 0.0), (0.42 * s, 0.35 * s), (0.4 * s, 0.6 * s),
                                (0.46 * s, 0.66 * s), (0.0, 0.62 * s)], (x, y, 0.0), segs=16)
    kit.cyl(name, m["wood_dark"], 0.06 * s, 1.1 * s, (x, y, 0.6 * s), verts=6)
    for dx, dy, dz, r in ((0, 0, 1.75, 0.55), (0.3, 0.1, 1.5, 0.4), (-0.3, -0.1, 1.55, 0.42),
                          (0.05, -0.25, 2.0, 0.35)):
        kit.blob(name, m["olive"], r * s, (x + dx * s, y + dy * s, dz * s), scale=(1, 1, 0.85))


def flower_bush(kit, name, m, x, y, z, r=0.5, colour="flower_magenta"):
    kit.blob(name, m["leaf_dark"], r, (x, y, z + r * 0.6), scale=(1.2, 1.0, 0.8))
    for k in range(6):
        a = 2 * math.pi * k / 6
        kit.blob(name, m[colour], r * 0.35, (x + r * 0.7 * math.cos(a), y + r * 0.6 * math.sin(a), z + r * 0.95))


def urn_with_flowers(kit, name, m, base, r, mat="gold"):
    x, y, z = base
    kit.lathe(name, m[mat], [(0.0, 0.0), (r * 0.55, 0.0), (r * 0.6, 0.08), (r, r * 0.9),
                             (r * 0.85, r * 1.45), (r * 1.0, r * 1.6), (r * 0.9, r * 1.62),
                             (0.0, r * 1.5)], (x, y, z), segs=20)
    top = z + r * 1.55
    kit.blob(name, m["leaf_dark"], r * 1.1, (x, y, top + r * 0.35), scale=(1.1, 1.1, 0.7))
    for k in range(7):
        a = 2 * math.pi * k / 7
        kit.blob(name, m["flower_magenta"] if k % 3 else m["flower_violet"], r * 0.42,
                 (x + r * 0.75 * math.cos(a), y + r * 0.75 * math.sin(a), top + r * 0.6))
    kit.blob(name, m["flower_magenta"], r * 0.5, (x, y, top + r * 0.95))


def window(kit, name, m, x, y, z, w=1.0, h=1.5, face=1.0, glow=False):
    """Deep-set arched window: chunky stone jambs, sill, voussoir head, glass, open teal shutters."""
    f = face
    mat = m["window_glow"] if glow else m["window_dark"]
    rect = h - w / 2
    stone = m["limestone_pale"]
    for sx in (-1.0, 1.0):
        kit.box(name, stone, (0.2, 0.28, rect + 0.05), (x + sx * (w / 2 + 0.1), y + f * 0.14, z + rect / 2))
    kit.box(name, stone, (w + 0.6, 0.36, 0.14), (x, y + f * 0.18, z - 0.07))
    for k in range(5):
        t = math.pi * (k + 0.5) / 5
        kit.box(name, stone, (0.3, 0.28, 0.28 * w + 0.08),
                (x - (w / 2 + 0.1) * math.cos(t), y + f * 0.14, z + rect + (w / 2 + 0.1) * math.sin(t)),
                rot=(0, t - math.pi / 2, 0))
    kit.box(name + "_glass", mat, (w, 0.06, rect), (x, y + f * 0.03, z + rect / 2.0))
    kit.cyl(name + "_glass", mat, w / 2, 0.06, (x, y + f * 0.03, z + rect), verts=12, rot=(math.pi / 2, 0, 0))
    for sx in (-1.0, 1.0):
        sxc = x + sx * (w / 2 + 0.2 + w * 0.27)
        kit.box(name + "_shutter", m["teal"], (w * 0.54, 0.07, h * 0.9), (sxc, y + f * 0.05, z + h * 0.45))
        kit.box(name + "_shutter", m["teal_dark"], (w * 0.5, 0.03, 0.06), (sxc, y + f * 0.1, z + h * 0.45))


def bench(kit, name, m, x, y, rot=0.0):
    c, s = math.cos(rot), math.sin(rot)
    kit.box(name, m["wood"], (1.6, 0.45, 0.08), (x, y, 0.45), rot=(0, 0, rot))
    kit.box(name, m["wood"], (1.6, 0.06, 0.45), (x - s * 0.22, y + c * 0.22, 0.75), rot=(0, 0, rot))
    for k in (-0.7, 0.7):
        kit.box(name, m["limestone"], (0.12, 0.45, 0.45), (x + c * k, y + s * k, 0.22), rot=(0, 0, rot))


def lamp_post(kit, name, m, x, y):
    kit.cyl(name, m["iron"], 0.18, 0.4, (x, y, 0.0), verts=8)
    kit.cyl(name, m["iron"], 0.07, 3.2, (x, y, 0.4), verts=8)
    kit.lathe(name, m["brass"], [(0.16, 3.55), (0.28, 3.6), (0.24, 3.95), (0.3, 4.0), (0.0, 4.3)], (x, y, 0.0),
              segs=8)
    kit.sphere(name + "_glow", m["glow"], 0.2, (x, y, 3.8), scale=(1, 1, 1.2), segs=8, rings=6)


def stone_planter(kit, name, m, x0, x1, y0, y1, colour="flower_magenta"):
    """Chunky raised stone planter with a pale coping, dark leaves and flowers (street edges)."""
    kit.box_mm(name, m["ashlar"], x0, x1, y0, y1, 0.0, 0.62)
    kit.box_mm(name, m["limestone_pale"], x0 - 0.08, x1 + 0.08, y0 - 0.08, y1 + 0.08, 0.62, 0.76)
    n = max(1, int((x1 - x0) / 0.8))
    for k in range(n):
        x = x0 + (k + 0.5) * (x1 - x0) / n
        flower_bush(kit, name, m, x, (y0 + y1) / 2, 0.62, r=0.42,
                    colour=colour if k % 3 else "flower_violet")


def crates(kit, name, m, x, y):
    for j in range(3):
        kit.box(name, m["wood"], (0.6, 0.45, 0.4), (x + (j % 2) * 0.62, y, 0.2 + (j // 2) * 0.42),
                rot=(0, 0, 0.06 * (j - 1)))
        kit.blob(name, m["lemon"] if j % 2 else m["flower_magenta"], 0.22,
                 (x + (j % 2) * 0.62, y, 0.42 + (j // 2) * 0.42), scale=(1.2, 0.9, 0.5))


def amphorae(kit, name, m, x, y):
    kit.lathe(name, m["clay"], [(0.0, 0.0), (0.2, 0.0), (0.36, 0.4), (0.22, 0.85), (0.14, 1.0), (0.0, 1.0)],
              (x, y, 0.0), segs=12)
    kit.lathe(name, m["clay"], [(0.0, 0.0), (0.16, 0.0), (0.26, 0.3), (0.12, 0.6), (0.0, 0.6)],
              (x + 0.55, y, 0.0), segs=12)
