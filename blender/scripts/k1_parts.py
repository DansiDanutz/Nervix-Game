"""K1 swappable parts: garments, hair and accessories. Each part is its own skinned mesh so the
runtime shows the ones a preset lists. All geometry is generic: no emblem, name or logo.
"""

import math

from k1_geometry import PartBuilder


def _skirt_weights(hips_share):
    """Hem weights: hips_share on hips, the rest split between thighs by side (+X is left)."""
    def weights(a):
        left = 0.5 * (1.0 + math.cos(a))
        rest = 1.0 - hips_share
        return {"hips": hips_share, "thigh_L": rest * left, "thigh_R": rest * (1.0 - left)}
    return weights


def _garment(pb, profile, hem_slot="trim"):
    rings = [((0, y, z), rx, ry, w) for (z, y, rx, ry, w) in profile]
    pb.loft(rings, "tunic", segs=14)
    z, y, rx, ry, w = profile[-1]
    pb.loft([((0, y, z + 0.035), rx + 0.004, ry + 0.004, w), ((0, y, z - 0.004), rx + 0.006, ry + 0.006, w)],
            hem_slot, segs=14)


def tunic_knee(pb):
    _garment(pb, [
        (1.07, 0.0, 0.162, 0.118, {"hips": 1.0}),
        (0.93, 0.0, 0.178, 0.135, {"hips": 1.0}),
        (0.76, 0.004, 0.2, 0.158, _skirt_weights(0.6)),
        (0.56, 0.008, 0.214, 0.172, _skirt_weights(0.35)),
    ])


ROBE_PROFILE = [
    (1.07, 0.0, 0.162, 0.118, {"hips": 1.0}),
    (0.93, 0.0, 0.18, 0.136, {"hips": 1.0}),
    (0.74, 0.005, 0.205, 0.162, _skirt_weights(0.55)),
    (0.5, 0.01, 0.225, 0.182, _skirt_weights(0.35)),
    (0.28, 0.014, 0.238, 0.196, _skirt_weights(0.25)),
    (0.13, 0.016, 0.248, 0.205, _skirt_weights(0.2)),
]


def robe_long(pb):
    _garment(pb, ROBE_PROFILE)
    # Trimmed front facings, read as the open coat edges of A13 and the A01 robes.
    for s in (1.0, -1.0):
        path = []
        for z, y, rx, ry, w in ROBE_PROFILE[1:]:
            x = s * 0.035 * (1.0 + (0.93 - z))
            front = y - ry * (1.0 - (x / rx) ** 2) ** 0.5 - 0.004
            path.append(((x, front, z), 0.014, 0.004, w))
        pb.loft(path, "trim", segs=4, phase=math.pi / 4)


HEAD = {"head": 1.0}


def _cap(pb, grow=1.0, back=0.015):
    pb.ellipsoid((0, back, 1.678), (0.112 * grow, 0.118 * grow, 0.118 * grow), "hair", HEAD,
                 segs=12, rings=7)


def _curls(pb, spots, radius, segs=7, rings=4):
    """spots: (polar from crown in degrees, azimuth in degrees with 0 = +X, 90 = back)."""
    for polar, azimuth in spots:
        p, a = math.radians(polar), math.radians(azimuth)
        d = (math.sin(p) * math.cos(a), math.sin(p) * math.sin(a), math.cos(p))
        centre = (0.118 * d[0], 0.012 + 0.124 * d[1], 1.652 + 0.12 * d[2])
        pb.ellipsoid(centre, (radius, radius, radius * 0.9), "hair", HEAD, segs=segs, rings=rings, axis=d)


def hair_curly(pb):
    _cap(pb)
    spots = [(5, 0), (32, -90), (30, -50), (30, -130), (32, 0), (32, 180), (35, 45), (35, 135),
             (35, 90), (62, 90), (62, 50), (62, 130), (60, 15), (60, 165), (55, -25), (55, -155),
             (88, 70), (88, 110), (88, 90), (80, 25), (80, 155)]
    _curls(pb, spots, 0.046)


def hair_bob(pb):
    _cap(pb, grow=1.04)
    spots = [(5, 0), (30, -80), (30, -110), (30, -40), (30, -140), (34, 0), (34, 180), (36, 60),
             (36, 120), (36, 90), (64, 90), (64, 45), (64, 135), (62, 10), (62, 170), (58, -30),
             (58, -150), (92, 60), (92, 120), (92, 90), (88, 15), (88, 165), (104, 25), (104, 155),
             (110, 70), (110, 110), (100, 0), (100, 180)]
    _curls(pb, spots, 0.054)


def hair_bun(pb):
    _cap(pb, grow=1.02)
    pb.ellipsoid((0, 0.125, 1.6), (0.058, 0.05, 0.052), "hair", HEAD, segs=10, rings=6, axis=(0, 1, 0.3))
    for s in (1.0, -1.0):
        pb.ellipsoid((s * 0.085, -0.03, 1.72), (0.05, 0.065, 0.045), "hair", HEAD, segs=8, rings=5,
                     axis=(s, -0.3, 0.6))
    pb.loft([((0, 0.06, 1.605), 0.065, 0.03, HEAD), ((0, 0.075, 1.6), 0.066, 0.03, HEAD)], "trim", segs=10)


def shawl(pb):
    chest = {"chest": 1.0}

    def over_arms(share):
        # Sides of the drape follow the upper arms so swinging arms stay inside it.
        def weights(a):
            c = math.cos(a)
            arm = "upper_arm_L" if c > 0 else "upper_arm_R"
            w = share * max(0.0, abs(c) - 0.4) / 0.6
            return {"chest": 1.0 - w, arm: w}
        return weights

    def hem(depth):
        # Lower at the front and back (sin a = -1 front, +1 back), highest over the arms,
        # dipping further on the figure's left front like the A15 drape.
        def dz(a):
            return -depth * (abs(math.sin(a)) ** 1.5) - 0.04 * max(0.0, math.cos(a) * -math.sin(a))
        return dz

    rings = [
        ((0, 0.006, 1.49), 0.084, 0.078, chest),
        ((0.0, 0.008, 1.465), 0.2, 0.135, chest),
        ((0.0, 0.012, 1.42), 0.28, 0.17, over_arms(0.3), hem(0.02)),
        ((0.0, 0.016, 1.33), 0.29, 0.182, over_arms(0.6), hem(0.06)),
        ((0.0, 0.02, 1.27), 0.295, 0.19, over_arms(0.7), hem(0.11)),
    ]
    pb.loft(rings, "accent", segs=16)
    pb.loft([((0.0, 0.02, 1.29), 0.298, 0.193, over_arms(0.7), hem(0.11)),
             ((0.0, 0.02, 1.268), 0.299, 0.194, over_arms(0.7), hem(0.11))], "trim", segs=16)
    pb.ellipsoid((-0.12, -0.15, 1.43), (0.03, 0.012, 0.03), "trim", chest, segs=8, rings=4,
                 axis=(0, -1, 0.3))


def apron(pb):
    chest, spine = {"chest": 1.0}, {"spine": 1.0}
    hem = _skirt_weights(0.5)
    panel = [
        ((0, -0.14, 1.33), 0.2, chest),
        ((0, -0.128, 1.18), 0.21, spine),
        ((0, -0.13, 1.04), 0.25, {"hips": 1.0}),
        ((0, -0.16, 0.86), 0.28, {"hips": 1.0}),
        ((0, -0.188, 0.7), 0.3, hem),
        ((0, -0.198, 0.6), 0.31, hem),
    ]
    k = 1.0 / math.sqrt(2.0)
    rings = [(c, w * k, 0.012 * k, wt) for (c, w, wt) in panel]
    pb.loft(rings, "accent", segs=4, cap_start="flat", cap_end="flat", phase=math.pi / 4)
    pb.loft([((0, -0.2, 0.62), 0.315 * k, 0.016 * k, hem), ((0, -0.202, 0.6), 0.315 * k, 0.016 * k, hem)],
            "trim", segs=4, phase=math.pi / 4)
    pb.loft([((0, 0, 0.965), 0.192, 0.148, {"hips": 1.0}), ((0, 0, 1.05), 0.19, 0.146, {"hips": 1.0})],
            "accent", segs=14, cap_start="flat", cap_end="flat")  # sash
    for s in (1.0, -1.0):
        pb.loft([((s * 0.085, -0.142, 1.33), 0.012, 0.006, chest),
                 ((s * 0.1, -0.11, 1.43), 0.012, 0.006, chest),
                 ((s * 0.1, 0.02, 1.47), 0.012, 0.006, chest),
                 ((s * 0.09, 0.13, 1.36), 0.012, 0.006, chest),
                 ((s * 0.085, 0.13, 1.05), 0.012, 0.006, {"hips": 1.0})], "leather", segs=4,
                phase=math.pi / 4)


def satchel(pb):
    hips = {"hips": 1.0}
    pb.box((-0.205, 0.0, 0.94), (-0.205, 0.0, 0.8), 0.07, 0.16, "leather", hips)
    pb.box((-0.244, 0.0, 0.945), (-0.244, 0.0, 0.875), 0.012, 0.164, "leather", hips)  # flap
    pb.box((-0.252, -0.0, 0.9), (-0.252, 0.0, 0.88), 0.008, 0.026, "trim", hips)  # clasp
    strap = [
        ((0.12, -0.11, 1.43), {"chest": 1.0}),
        ((0.0, -0.135, 1.24), {"chest": 0.6, "spine": 0.4}),
        ((-0.15, -0.12, 1.02), {"hips": 1.0}),
        ((-0.2, -0.05, 0.94), hips),
    ]
    back = [
        ((0.12, 0.1, 1.45), {"chest": 1.0}),
        ((0.0, 0.135, 1.24), {"chest": 0.6, "spine": 0.4}),
        ((-0.16, 0.11, 1.0), hips),
        ((-0.2, 0.05, 0.94), hips),
    ]
    for path in (strap, back):
        pb.loft([(c, 0.016, 0.005, w) for c, w in path], "leather", segs=4, phase=math.pi / 4)
    pb.loft([((0.125, -0.005, 1.475), 0.016, 0.005, {"chest": 1.0}),
             ((0.125, -0.11, 1.43), 0.016, 0.005, {"chest": 1.0})], "leather", segs=4, phase=math.pi / 4)
    pb.loft([((0.125, 0.1, 1.45), 0.016, 0.005, {"chest": 1.0}),
             ((0.125, -0.005, 1.475), 0.016, 0.005, {"chest": 1.0})], "leather", segs=4, phase=math.pi / 4)


BUILDERS = {
    "tunic_knee": (tunic_knee, ("tunic", "trim")),
    "robe_long": (robe_long, ("tunic", "trim")),
    "hair_curly": (hair_curly, ("hair",)),
    "hair_bob": (hair_bob, ("hair",)),
    "hair_bun": (hair_bun, ("hair", "trim")),
    "shawl": (shawl, ("accent", "trim")),
    "apron": (apron, ("accent", "trim", "leather")),
    "satchel": (satchel, ("leather", "trim")),
}


def build_part(part_id, name, collection, rig, materials):
    fn, slots = BUILDERS[part_id]
    pb = PartBuilder(slots)
    fn(pb)
    return pb.build(name, collection, rig, materials), pb.triangles()
