"""K1 base body: head and face, torso, arms, hands, trousers, boots and belt (one mesh).

Proportions follow the A13/A14/A15 sheets: about 6.7 heads, a slightly large head, soft
shoulders, cuffed baggy trousers and tall boots. The figure faces Blender -Y.
"""

from k1_geometry import PartBuilder

BODY_SLOTS = ("skin", "hair", "eyes", "tunic", "trim", "legs", "leather")


def _blend(a, b, t):
    return {a: 1.0 - t, b: t} if a != b else {a: 1.0}


def _head(pb):
    head = {"head": 1.0}
    pb.ellipsoid((0, -0.01, 1.64), (0.105, 0.115, 0.135), "skin", head, segs=14, rings=9)
    pb.ellipsoid((0, -0.03, 1.575), (0.075, 0.07, 0.05), "skin", head, segs=10, rings=5)  # jaw
    pb.ellipsoid((0, -0.122, 1.628), (0.017, 0.022, 0.03), "skin", head, segs=6, rings=4)  # nose
    for s in (1.0, -1.0):
        pb.ellipsoid((s * 0.104, 0.0, 1.635), (0.03, 0.022, 0.034), "skin", head, segs=6, rings=4,
                     axis=(s, 0, 0))
        pb.ellipsoid((s * 0.043, -0.112, 1.664), (0.019, 0.01, 0.026), "eyes", head, segs=8, rings=4,
                     axis=(0, 0, 1))
        pb.box((s * 0.022, -0.113, 1.706), (s * 0.066, -0.11, 1.712), 0.012, 0.01, "hair", head)
    pb.box((-0.02, -0.116, 1.583), (0.02, -0.116, 1.583), 0.008, 0.008, "eyes", head)  # mouth


def _torso(pb):
    rings = [
        ((0, 0.0, 0.86), 0.15, 0.11, {"hips": 1.0}),
        ((0, 0.0, 0.95), 0.158, 0.115, {"hips": 1.0}),
        ((0, 0.0, 1.05), 0.155, 0.11, _blend("hips", "spine", 0.5)),
        ((0, 0.0, 1.16), 0.16, 0.115, {"spine": 1.0}),
        ((0, -0.005, 1.27), 0.178, 0.125, _blend("spine", "chest", 0.6)),
        ((0, 0.0, 1.36), 0.19, 0.125, {"chest": 1.0}),
        ((0, 0.005, 1.43), 0.15, 0.1, {"chest": 1.0}),
        ((0, 0.005, 1.465), 0.075, 0.068, _blend("chest", "neck", 0.5)),
    ]
    pb.loft(rings, "tunic", segs=12, cap_start="flat", cap_end="flat")
    pb.loft([((0, 0.005, 1.44), 0.052, 0.05, {"neck": 1.0}),
             ((0, 0.0, 1.57), 0.048, 0.048, _blend("neck", "head", 0.7))], "skin", segs=8)
    pb.loft([((0, 0.004, 1.438), 0.082, 0.074, {"chest": 1.0}),
             ((0, 0.004, 1.47), 0.072, 0.066, _blend("chest", "neck", 0.5))], "trim", segs=12)
    belt = {"hips": 1.0}
    pb.loft([((0, 0, 0.975), 0.186, 0.142, belt), ((0, 0, 1.035), 0.184, 0.14, belt)],
            "leather", segs=14, cap_start="flat", cap_end="flat")
    pb.ellipsoid((0, -0.142, 1.005), (0.03, 0.012, 0.03), "trim", belt, segs=10, rings=4, axis=(0, -1, 0))


def _arm(pb, side, s):
    ua, fa, hd = f"upper_arm_{side}", f"forearm_{side}", f"hand_{side}"
    pb.ellipsoid((s * 0.175, 0.0, 1.39), (0.072, 0.07, 0.07), "tunic", _blend("chest", ua, 0.5),
                 segs=8, rings=5)
    rings = [
        ((s * 0.19, 0.0, 1.40), 0.058, 0.058, _blend("chest", ua, 0.7)),
        ((s * 0.215, 0.005, 1.30), 0.053, 0.053, {ua: 1.0}),
        ((s * 0.228, 0.008, 1.245), 0.048, 0.048, {ua: 1.0}),
        ((s * 0.245, 0.012, 1.12), 0.043, 0.043, _blend(ua, fa, 0.5)),
        ((s * 0.26, 0.008, 1.00), 0.041, 0.04, {fa: 1.0}),
        ((s * 0.275, 0.0, 0.89), 0.031, 0.03, _blend(fa, hd, 0.3)),
    ]
    pb.loft(rings, ["tunic", "tunic", "skin", "skin", "skin"], segs=8, cap_start="flat", cap_end="flat")
    pb.loft([((s * 0.226, 0.008, 1.27), 0.058, 0.058, {ua: 1.0}),
             ((s * 0.23, 0.009, 1.24), 0.055, 0.055, {ua: 1.0})], "trim", segs=8)
    pb.loft([((s * 0.268, 0.004, 0.955), 0.04, 0.04, {fa: 1.0}),
             ((s * 0.273, 0.001, 0.905), 0.036, 0.036, {fa: 1.0})], "leather", segs=8)
    hand = {hd: 1.0}
    pb.ellipsoid((s * 0.284, -0.006, 0.828), (0.029, 0.044, 0.064), "skin", hand, segs=8, rings=5)
    pb.ellipsoid((s * 0.27, -0.04, 0.85), (0.013, 0.013, 0.03), "skin", hand, segs=6, rings=4,
                 axis=(-s * 0.3, -0.5, -1.0))


def _leg(pb, side, s):
    th, sh, ft = f"thigh_{side}", f"shin_{side}", f"foot_{side}"
    rings = [
        ((s * 0.088, 0.0, 0.94), 0.085, 0.092, _blend("hips", th, 0.5)),
        ((s * 0.092, 0.0, 0.76), 0.084, 0.088, {th: 1.0}),
        ((s * 0.095, 0.0, 0.54), 0.08, 0.082, _blend(th, sh, 0.5)),
        ((s * 0.095, 0.006, 0.43), 0.082, 0.084, {sh: 1.0}),
        ((s * 0.095, 0.01, 0.37), 0.062, 0.062, {sh: 1.0}),
        ((s * 0.095, 0.014, 0.2), 0.054, 0.056, {sh: 1.0}),
        ((s * 0.095, 0.018, 0.11), 0.05, 0.054, _blend(sh, ft, 0.4)),
    ]
    pb.loft(rings, ["legs", "legs", "legs", "legs", "leather", "leather"], segs=9, cap_start="flat",
            cap_end="flat")
    pb.loft([((s * 0.095, 0.01, 0.325), 0.066, 0.068, {sh: 1.0}),
             ((s * 0.095, 0.01, 0.375), 0.069, 0.071, {sh: 1.0})], "leather", segs=9)
    foot = {ft: 1.0}
    rings = [
        ((s * 0.095, 0.055, 0.058), 0.045, 0.055, foot),
        ((s * 0.095, 0.0, 0.06), 0.052, 0.06, foot),
        ((s * 0.097, -0.09, 0.048), 0.05, 0.048, foot),
        ((s * 0.1, -0.145, 0.04), 0.04, 0.036, foot),
    ]
    pb.loft(rings, "leather", segs=8, cap_start="flat", cap_end=(s * 0.1, -0.168, 0.036))


def build_body(collection, rig, materials, name):
    pb = PartBuilder(BODY_SLOTS)
    _head(pb)
    _torso(pb)
    for side, s in (("L", 1.0), ("R", -1.0)):
        _arm(pb, side, s)
        _leg(pb, side, s)
    return pb.build(name, collection, rig, materials), pb.triangles()
