"""K3 display fixtures (floor centre origin, front faces -Y) and the blank price tag.

Sizes come from k3_spec.FIXTURES. Every fixture fits the assumed K2 slot envelope.
"""

import k3_spec as spec
from k3_geom import SLOT_GLASS, MeshBuilder


def _front(fid):
    return -spec.FIXTURES[fid]["size"][1] / 2


def _tag_stand(b, fid):
    """Brass post with a holder plate whose front face is the fixture front, for low fixtures."""
    x, z = spec.FIXTURES[fid]["tag"]
    y = _front(fid) + 0.006
    b.cyl(0.01, z - 0.04, (x, y + 0.01, (z - 0.04) / 2), "brass", segs=8)
    b.box((0.15, 0.012, 0.09), (x, y, z - 0.035), "brass", bevel=0.003)


def dais(b):
    b.box((0.82, 0.56, 0.06), (0.0, 0.03, 0.03), "sandstone", bevel=0.012)
    b.box((0.76, 0.5, 0.04), (0.0, 0.03, 0.08), "wine", bevel=0.01)
    b.box((0.7, 0.44, 0.004), (0.0, 0.03, 0.1), "wine_light", bevel=0.0)
    for sx in (-1, 1):
        b.box((0.78, 0.012, 0.012), (0.0, 0.03 + sx * 0.245, 0.1), "brass", bevel=0.002)
    _tag_stand(b, "dais")


def rack(b):
    for sy in (-1, 1):
        b.box((0.8, 0.06, 0.17), (0.0, 0.0 + sy * 0.22, 0.105), "wood_dark", bevel=0.008)
    for i in range(7):
        b.box((0.1, 0.54, 0.03), (-0.345 + i * 0.115, 0.0, 0.205), "wood", bevel=0.005)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box((0.07, 0.07, 0.025), (sx * 0.36, sy * 0.22, 0.0125), "wood_dark", bevel=0.004)
            b.box((0.04, 0.006, 0.04), (sx * 0.36, sy * 0.253, 0.12), "brass", bevel=0.002)
    _tag_stand(b, "rack")


def _plinth_body(b, w):
    b.box((w, w, 0.1), (0.0, 0.0, 0.05), "sandstone_dark", bevel=0.015)
    b.box((w - 0.1, w - 0.1, 0.7), (0.0, 0.0, 0.45), "sandstone", bevel=0.01)
    for z in (0.24, 0.42, 0.6):  # ashlar coursing, as on the A04/A06 stonework
        b.box((w - 0.088, w - 0.088, 0.012), (0.0, 0.0, z), "sandstone_dark", bevel=0.0)
    b.box((w - 0.2, 0.014, 0.52), (0.0, -(w - 0.1) / 2, 0.45), "brass", bevel=0.004)
    b.box((w - 0.24, 0.02, 0.48), (0.0, -(w - 0.1) / 2, 0.45), "wine", bevel=0.004)
    b.box((w - 0.02, w - 0.02, 0.08), (0.0, 0.0, 0.84), "sandstone", bevel=0.015)
    b.box((w - 0.04, w - 0.04, 0.04), (0.0, 0.0, 0.9), "brass", bevel=0.006)


def plinth(b):
    _plinth_body(b, 0.5)


def vitrine(b):
    _plinth_body(b, 0.52)
    b.cyl(0.2, 0.03, (0.0, 0.0, 0.935), "brass", segs=32)
    b.cyl(0.19, 0.36, (0.0, 0.0, 1.13), None, segs=32, slot=SLOT_GLASS)
    b.lathe([(0.19, 0.0), (0.17, 0.045), (0.11, 0.085), (0.02, 0.1)], (0.0, 0.0, 1.31), None,
            segs=32, slot=SLOT_GLASS)
    b.torus(0.192, 0.008, (0.0, 0.0, 1.31), "brass", segs=32, ring_segs=6)
    b.sphere(0.02, (0.0, 0.0, 1.4), "brass", segs=10, rings=6)


def counter(b):
    b.box((0.98, 0.56, 0.08), (0.0, 0.0, 0.04), "wood_dark", bevel=0.01)
    b.box((0.92, 0.5, 0.8), (0.0, 0.01, 0.48), "teal", bevel=0.01)
    for i in range(7):
        b.box((0.03, 0.012, 0.66), (-0.39 + i * 0.13, -0.245, 0.47), "teal_dark", bevel=0.004)
    b.box((0.9, 0.012, 0.03), (0.0, -0.247, 0.82), "teal_dark", bevel=0.004)
    b.box((0.98, 0.58, 0.06), (0.0, 0.0, 0.92), "wood_dark", bevel=0.012)
    b.box((0.96, 0.01, 0.022), (0.0, -0.284, 0.875), "brass", bevel=0.003)


def shelf(b):
    b.box((0.88, 0.02, 1.66), (0.0, 0.18, 0.89), "teal", bevel=0.004)
    for sx in (-1, 1):
        b.box((0.04, 0.4, 1.74), (sx * 0.45, -0.01, 0.87), "wood", bevel=0.008)
    for z in (0.1, 0.48, 0.845, 1.36):
        b.box((0.86, 0.38, 0.03), (0.0, -0.01, z), "wood", bevel=0.006)
        b.box((0.86, 0.006, 0.02), (0.0, -0.203, z), "brass", bevel=0.002)
    b.box((0.94, 0.42, 0.06), (0.0, 0.0, 1.77), "wood_dark", bevel=0.01)
    for x, sw, h in ((-0.3, "terracotta", 0.2), (-0.12, "ceramic", 0.16), (0.2, "terracotta", 0.24)):
        b.lathe([(0.04, 0.0), (0.07, h * 0.4), (0.06, h * 0.8), (0.035, h), (0.03, h)],
                (x, 0.05, 0.115), sw, segs=16)
    for x, sw in ((-0.25, "ceramic"), (0.0, "terracotta"), (0.27, "ceramic")):
        b.lathe([(0.035, 0.0), (0.06, 0.08), (0.04, 0.16), (0.034, 0.16)], (x, 0.05, 1.375), sw, segs=16)


def price_tag(b):
    """Blank brass-framed card, origin at its back centre, face toward -Y."""
    w, d, h = spec.PRICE_TAG["size"]
    b.box((w, d, h), (0.0, -d / 2, 0.0), "brass", bevel=0.003)
    b.box((w - 0.02, 0.004, h - 0.02), (0.0, -d - 0.001, 0.0), "cream", bevel=0.0)


BUILDERS = {"dais": dais, "rack": rack, "plinth": plinth, "vitrine": vitrine,
            "counter": counter, "shelf": shelf}


def build_fixture(fid, name, collection, materials):
    b = MeshBuilder()
    BUILDERS[fid](b)
    return b.to_object(name, collection, materials)


def build_price_tag(collection, materials):
    b = MeshBuilder()
    price_tag(b)
    return b.to_object(spec.PRICE_TAG["name"], collection, materials)
