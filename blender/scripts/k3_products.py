"""K3 product meshes: one generic, identity-free mesh per category, base centred at the origin.

Each builder stays inside PRODUCTS[<id>]["size"] (w, d, h) from k3_spec. No text, no logos.
"""

from k3_geom import SLOT_GLOW, MeshBuilder, rot_x, rot_y


def seat(b):
    """Cushioned café armchair after A05: wood frame, teal cushion and back, brass feet."""
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.cyl(0.02, 0.42, (sx * 0.23, sy * 0.21, 0.23), "wood", segs=10)
            b.cyl(0.024, 0.02, (sx * 0.23, sy * 0.21, 0.01), "brass", segs=10)
        b.cyl(0.018, 0.17, (sx * 0.25, -0.2, 0.565), "wood", segs=10)
        b.box((0.05, 0.46, 0.04), (sx * 0.25, 0.0, 0.66), "wood", bevel=0.012)
        b.cyl(0.022, 0.42, (sx * 0.23, 0.225, 0.64), "wood", segs=10)
    b.box((0.52, 0.5, 0.06), (0.0, 0.0, 0.45), "wood_dark", bevel=0.01)
    b.box((0.47, 0.45, 0.08), (0.0, -0.01, 0.52), "teal", bevel=0.03)
    b.box((0.42, 0.06, 0.28), (0.0, 0.215, 0.68), "teal", bevel=0.025, rot=rot_x(-6))
    b.box((0.54, 0.06, 0.05), (0.0, 0.23, 0.83), "wood", bevel=0.015)


def bundle(b):
    """Slatted crate with a tied cloth bundle and a rolled textile on top."""
    b.box((0.48, 0.38, 0.25), (0.0, 0.0, 0.135), "wood", bevel=0.01)
    for z in (0.06, 0.2):
        for sy in (-1, 1):
            b.box((0.5, 0.02, 0.045), (0.0, sy * 0.195, z), "wood_dark", bevel=0.005)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box((0.04, 0.04, 0.27), (sx * 0.235, sy * 0.185, 0.135), "wood_dark", bevel=0.006)
            b.box((0.045, 0.006, 0.045), (sx * 0.235, sy * 0.21, 0.24), "brass", bevel=0.002)
    b.sphere(1.0, (0.1, 0.04, 0.33), "wine", scale=(0.15, 0.12, 0.085), segs=14, rings=8)
    b.sphere(0.03, (0.1, 0.04, 0.41), "wine", scale=(1.0, 0.7, 0.6), segs=8, rings=5)
    b.cyl(0.055, 0.42, (-0.03, -0.1, 0.315), "cream", segs=16, rot=rot_y(90))
    for x in (-0.15, 0.09):
        b.cyl(0.058, 0.02, (x, -0.1, 0.315), "brass", segs=16, rot=rot_y(90))


def digital(b):
    """Glowing faceted crystal on a brass stand (no screen, no logo)."""
    b.lathe([(0.1, 0.0), (0.1, 0.02), (0.065, 0.045), (0.04, 0.07), (0.045, 0.08), (0.07, 0.095)],
            (0.0, 0.0, 0.0), "brass", segs=24)
    b.ico(0.068, (0.0, 0.0, 0.205), None, scale=(1.0, 1.0, 1.75), subdiv=1, slot=SLOT_GLOW)
    b.torus(0.095, 0.006, (0.0, 0.0, 0.2), "brass", segs=28, ring_segs=6)
    for k in range(3):
        b.box((0.014, 0.014, 0.05), (0.0 + (k - 1) * 0.06, -0.06 + abs(k - 1) * 0.02, 0.115),
              "brass", bevel=0.003)


def drink(b):
    """Wooden tray with a teal jug, two ceramic cups and a brass goblet."""
    b.box((0.46, 0.26, 0.02), (0.0, 0.0, 0.01), "wood", bevel=0.008)
    b.lathe([(0.055, 0.0), (0.085, 0.06), (0.09, 0.11), (0.07, 0.18), (0.04, 0.23), (0.034, 0.27),
             (0.048, 0.31), (0.044, 0.315)], (-0.12, 0.02, 0.02), "teal", segs=24)
    b.torus(0.091, 0.006, (-0.12, 0.02, 0.11), "brass", segs=24, ring_segs=6)
    for x, y in ((0.06, -0.05), (0.06, 0.06)):
        b.lathe([(0.032, 0.0), (0.042, 0.06), (0.046, 0.075), (0.04, 0.075)], (x, y, 0.02),
                "ceramic", segs=18)
    b.lathe([(0.03, 0.0), (0.03, 0.01), (0.008, 0.022), (0.008, 0.08), (0.032, 0.1), (0.04, 0.15),
             (0.036, 0.15)], (0.17, 0.0, 0.02), "brass", segs=18)


def food(b):
    """Bread board after the A05 counter: two loaves, a boule and a bowl of olives."""
    b.box((0.5, 0.32, 0.03), (0.0, 0.0, 0.015), "wood", bevel=0.01)
    b.sphere(1.0, (-0.14, 0.04, 0.06), "bread", scale=(0.11, 0.06, 0.05), segs=16, rings=8)
    b.sphere(1.0, (-0.02, -0.06, 0.06), "bread", scale=(0.1, 0.055, 0.045), segs=16, rings=8)
    b.sphere(1.0, (0.12, 0.06, 0.065), "bread", scale=(0.075, 0.075, 0.055), segs=16, rings=8)
    for x in (-0.17, -0.11):
        b.box((0.012, 0.07, 0.008), (x, 0.04, 0.108), "wood", bevel=0.002)
    b.lathe([(0.03, 0.0), (0.05, 0.03), (0.052, 0.045), (0.046, 0.045)], (0.17, -0.09, 0.03),
            "ceramic", segs=18)
    for dx, dy in ((0.0, 0.0), (0.02, 0.012), (-0.018, 0.014), (0.006, -0.02)):
        b.sphere(0.014, (0.17 + dx, -0.09 + dy, 0.078), "olive", segs=8, rings=5)


def merch(b):
    """Folded textiles and two ceramic pots, the A04 shop window in miniature."""
    stack = (("teal", 0.3, 0.24), ("wine", 0.29, 0.23), ("cream", 0.3, 0.24), ("terracotta", 0.28, 0.22))
    for i, (sw, w, d) in enumerate(stack):
        b.box((w, d, 0.055), (-0.18, 0.0, 0.03 + i * 0.058), sw, bevel=0.018)
    b.lathe([(0.05, 0.0), (0.085, 0.08), (0.1, 0.15), (0.08, 0.24), (0.05, 0.29), (0.06, 0.33),
             (0.054, 0.33)], (0.11, 0.0, 0.0), "terracotta", segs=24)
    b.torus(0.098, 0.006, (0.11, 0.0, 0.16), "cream", segs=24, ring_segs=6)
    b.lathe([(0.04, 0.0), (0.06, 0.07), (0.055, 0.14), (0.03, 0.19), (0.036, 0.23), (0.032, 0.23)],
            (0.28, 0.03, 0.0), "ceramic", segs=20)
    b.torus(0.058, 0.005, (0.28, 0.03, 0.09), "teal", segs=20, ring_segs=6)


def service(b):
    """A brass service bell on a wine cloth beside a blank easel board (painted at runtime)."""
    b.box((0.34, 0.24, 0.012), (0.0, -0.02, 0.006), "wine", bevel=0.004)
    b.lathe([(0.07, 0.012), (0.068, 0.02), (0.06, 0.05), (0.045, 0.075), (0.02, 0.09), (0.006, 0.1)],
            (0.09, -0.05, 0.0), "brass", segs=24)
    b.cyl(0.008, 0.02, (0.09, -0.05, 0.11), "brass", segs=8)
    tilt = rot_x(-12)
    b.box((0.2, 0.02, 0.24), (-0.08, 0.06, 0.27), "wood", bevel=0.008, rot=tilt)
    b.box((0.17, 0.006, 0.2), (-0.08, 0.048, 0.27), "cream", bevel=0.002, rot=tilt)
    for sx in (-1, 1):
        b.box((0.018, 0.018, 0.4), (-0.08 + sx * 0.085, 0.07, 0.2), "wood_dark", bevel=0.004, rot=tilt)
    b.box((0.018, 0.018, 0.36), (-0.08, 0.08, 0.18), "wood_dark", bevel=0.004, rot=rot_x(14))
    b.sphere(0.014, (-0.08, 0.035, 0.405), "brass", segs=8, rings=5)


def generic(b):
    """Fallback: a cream parcel tied with a brass ribbon and a bow."""
    b.box((0.28, 0.28, 0.24), (0.0, 0.0, 0.12), "cream", bevel=0.02)
    b.box((0.29, 0.04, 0.245), (0.0, 0.0, 0.122), "brass", bevel=0.004)
    b.box((0.04, 0.29, 0.245), (0.0, 0.0, 0.122), "brass", bevel=0.004)
    for sx in (-1, 1):
        b.sphere(1.0, (sx * 0.04, 0.0, 0.262), "wine_light", scale=(0.05, 0.025, 0.025), segs=10, rings=6)


BUILDERS = {
    "seat": seat, "bundle": bundle, "digital": digital, "drink": drink, "food": food,
    "merch": merch, "service": service, "generic": generic,
}


def build_product(cid, name, collection, materials):
    b = MeshBuilder()
    BUILDERS[cid](b)
    return b.to_object(name, collection, materials)
