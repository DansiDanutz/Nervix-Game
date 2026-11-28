"""A01 backdrop (-x, behind the fountain): the arch closing the arcade street, the A12 hillside
with a village, cypresses, the aqueduct and a domed landmark on the hilltop, a hazy far ridge,
backdrop roofs that fill the sky gaps above the side rows, and the golden-hour world/sky.
"""

import math
import random

import bpy

from arrival_props import gable_roof_x

ARCH_X = -44.0
AQUEDUCT_X = -72.0
TEMPLE = (-132.0, 40.0)   # on a shoulder right of centre, low enough to stay inside the spawn frame
HILL_X0 = -50.0
HILL_SLOPE = 0.65
SKY_CAMERA_STRENGTH = 1.1   # what the camera sees
SKY_LIGHT_STRENGTH = 0.72   # ambient fill: low, so the golden sun models the shaded sides         # metres of rise per metre of depth: the spawn frame shows ~0.46 m/m above eye


def hill_height(x, y):
    """Backdrop terrain: flat at the town edge, climbing steadily west so the hill fills the sky
    above the roofs (A01/A12), a lateral swell, and a raised shoulder under the landmark."""
    run = max(HILL_X0 - x, 0.0)
    base = 160.0 * (1.0 - math.exp(-HILL_SLOPE * run / 160.0))
    s = min(run / 50.0, 1.0)
    swell = s * (9.0 * math.sin(y / 41.0 + 0.7) + 4.0 * math.sin(y / 17.0 + x / 29.0))
    shoulder = 6.0 * math.exp(-(((x - TEMPLE[0]) / 30.0) ** 2 + ((y - TEMPLE[1]) / 34.0) ** 2))
    return base + swell + shoulder - (0.3 if run == 0 else 0.0)


def build_skyline(kit, m):
    _end_arch(kit, m)
    _hills(kit, m)
    _aqueduct(kit, m)
    _temple(kit, m)
    _village(kit, m)
    _backdrop_rows(kit, m)


def _end_arch(kit, m):
    """Open three-bay gate closing the back street: low (top under the fountain crown in the spawn
    frame) and pierced, so the far paving, the hill and the aqueduct piers read through and above
    it instead of a solid backdrop slab."""
    g = "street_arch"
    kit.arcade(g, m["limestone"], "y", -8.6, 8.1, 3, 4.3, 4.2, 6.6, ARCH_X, 1.6, soffit=m["limestone_pale"])
    kit.box_mm(g, m["limestone_pale"], ARCH_X - 1.0, ARCH_X + 1.0, -8.8, 8.3, 6.6, 7.0)
    kit.box_mm(g, m["gold"], ARCH_X + 0.98, ARCH_X + 1.02, -8.8, 8.3, 6.45, 6.55)
    kit.box_mm(g, m["limestone"], ARCH_X - 0.8, ARCH_X + 0.8, -2.6, 2.1, 7.0, 8.0)
    kit.box_mm(g, m["plum"], ARCH_X + 0.82, ARCH_X + 0.88, -2.0, 1.5, 7.15, 7.85)
    for y in (-8.0, 7.5):
        kit.lathe(g, m["terracotta"], [(0.7, 0.0), (0.0, 1.1)], (ARCH_X, y, 7.0), segs=4)
    for y in (-3.1, 2.6):
        kit.box("street_arch_lantern", m["iron"], (0.5, 0.06, 0.06), (ARCH_X + 1.05, y, 4.0))
        kit.sphere("street_arch_glow", m["glow"], 0.2, (ARCH_X + 1.3, y, 3.7), scale=(1, 1, 1.3), segs=8, rings=6)


def _hills(kit, m):
    kit.grid_surface("hillside", m["hill"], -340.0, HILL_X0 + 6.0, -300.0, 300.0, 60, 90, hill_height)
    ridge = lambda x, y: 70.0 + 38.0 * math.sin(y / 57.0 + 1.3) ** 2 + 18.0 * math.sin(y / 23.0)  # noqa: E731
    kit.grid_surface("far_ridge", m["far_ridge"], -470.0, -330.0, -420.0, 420.0, 4, 70,
                     lambda x, y: ridge(x, y) * min(1.0, (-330.0 - x) / 60.0 + 0.4))


def _aqueduct(kit, m):
    x = AQUEDUCT_X
    y0, y1 = -150.0, 110.0
    base = hill_height(x, 0.0) - 2.0
    kit.arcade("aqueduct", m["haze_stone"], "y", y0, y1, 34, 5.4, base + 5.5, base + 8.4, x, 2.4,
               z0=base - 16.0, segs=6)
    kit.arcade("aqueduct", m["haze_stone"], "y", y0, y1, 68, 2.6, base + 9.8, base + 11.6, x, 2.0,
               z0=base + 8.4, segs=4)
    kit.box_mm("aqueduct", m["haze_stone_pale"], x - 1.4, x + 1.4, y0, y1, base + 11.6, base + 12.2)


def _temple(kit, m, sc=0.62):
    """Domed rotunda landmark (A01 hilltop), scaled to fit under the top of the spawn frame."""
    tx, ty = TEMPLE
    z = hill_height(tx, ty) - 0.5
    g = "landmark_temple"

    def p(prof):
        return [(r * sc, h * sc) for r, h in prof]
    kit.lathe(g, m["limestone_pale"], p([(13.0, -3.0), (13.0, 2.0), (11.5, 2.0), (11.5, 3.2), (0.0, 3.2)]),
              (tx, ty, z), segs=40)
    for k in range(18):
        a = 2 * math.pi * k / 18
        kit.cyl(g, m["limestone_pale"], 0.55 * sc, 8.0 * sc,
                (tx + 9.5 * sc * math.cos(a), ty + 9.5 * sc * math.sin(a), z + 3.2 * sc), verts=10)
    kit.lathe(g, m["limestone"], p([(10.6, 11.2), (10.6, 12.6), (0.0, 12.6)]), (tx, ty, z), segs=40)
    kit.lathe(g, m["plaster"], p([(7.4, 3.2), (7.4, 11.2)]), (tx, ty, z), segs=32, cap=False)
    kit.lathe(g, m["limestone"], p([(7.6, 12.6), (7.6, 15.6), (8.0, 16.0), (0.0, 16.0)]), (tx, ty, z), segs=40)
    prof = [(7.9 * math.cos(t), 16.0 + 8.6 * math.sin(t)) for t in [i * math.pi / 2 / 10 for i in range(11)]]
    prof[-1] = (0.0, 24.6)
    kit.lathe("landmark_dome", m["dome_rose"], p(prof), (tx, ty, z), segs=40, cap=False)
    kit.lathe("landmark_dome", m["gold"], p([(1.2, 24.4), (1.2, 26.2), (0.0, 27.8)]), (tx, ty, z), segs=16)
    for dx, dy in ((-16, -10), (-13, 17), (12, -13), (14, 14), (-4, 21)):
        _cypress(kit, "landmark_cypress", m, tx + dx, ty + dy, 1.1)


def _cypress(kit, name, m, x, y, s=1.0):
    z = hill_height(x, y) if x < HILL_X0 else 0.0
    kit.lathe(name, m["cypress"], [(0.0, 0.0), (0.9 * s, 1.2 * s), (1.1 * s, 3.5 * s), (0.8 * s, 6.5 * s),
                                   (0.0, 9.5 * s)], (x, y, z - 0.3), segs=8)


def _village(kit, m):
    rng = random.Random(1201)
    placed = 0
    while placed < 46:
        x = rng.uniform(-200.0, -95.0)
        y = rng.uniform(-150.0, 120.0)
        if abs(x - AQUEDUCT_X) < 9 or math.hypot(x - TEMPLE[0], y - TEMPLE[1]) < 26:
            continue
        z = hill_height(x, y)
        w, d, h = rng.uniform(6, 10), rng.uniform(5, 8), rng.uniform(3.2, 5.5)
        g = "hill_village"
        kit.box_mm(g, m["plaster"] if placed % 3 else m["limestone"], x - w / 2, x + w / 2, y - d / 2, y + d / 2,
                   z - 2.0, z + h)
        kit.prism_y(g, m["terracotta"], [(x - w / 2 - 0.4, z + h), (x, z + h + 2.2), (x + w / 2 + 0.4, z + h)],
                    y - d / 2 - 0.4, y + d / 2 + 0.4)
        placed += 1
    for k in range(170):
        x = rng.uniform(-230.0, -66.0)
        y = rng.uniform(-170.0, 150.0)
        if abs(x - AQUEDUCT_X) < 6:
            continue
        if k % 3 == 0:
            z = hill_height(x, y)
            kit.blob("hill_olives", m["olive"], rng.uniform(2.0, 3.4), (x, y, z + 1.5), scale=(1, 1, 0.8))
        else:
            _cypress(kit, "hill_cypress", m, x, y, rng.uniform(1.0, 1.6))
    for x, y in ((-48.0, -16.0), (-49.0, 14.5), (-58.0, -20.0), (-57.0, 19.0), (-20.0, -21.0), (-6.0, 25.0),
                 (-30.0, 24.0), (14.0, -21.0)):
        _cypress(kit, "town_cypress", m, x, y, 1.1)


def _backdrop_rows(kit, m):
    """Roofs that fill the sky gaps behind the side rows, A01's stacked hill town."""
    rng = random.Random(77)
    for side, (y0, y1) in (("left", (-34.0, -22.0)), ("right", (22.0, 34.0))):
        x = -46.0
        i = 0
        while x < 18.0:
            w = rng.uniform(7.0, 11.0)
            h = rng.uniform(11.0, 17.0)
            g = f"backdrop_{side}"
            kit.box_mm(g, m["plaster"] if i % 2 else m["ashlar"], x, x + w, y0, y1, 0.0, h)
            gable_roof_x(kit, f"backdrop_{side}_roof", m, x, x + w, y0, y1, h, 2.6, over=0.4)
            x += w + rng.uniform(0.0, 1.5)
            i += 1


def build_world(name="ArrivalWorld"):
    """Golden-hour gradient sky: warm peach horizon to rose and soft blue zenith, light clouds."""
    w = bpy.data.worlds.get(name) or bpy.data.worlds.new(name)
    w.use_fake_user = True  # kept in the file without being the scene world
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    cramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    stops = [(0.0, "#FFD08A"), (0.08, "#FFC892"), (0.2, "#FBB99C"), (0.34, "#F2B0B2"), (0.52, "#BFC3E6"),
             (0.85, "#8FB2E4")]
    el = ramp.color_ramp.elements
    while len(el) < len(stops):
        el.new(0.5)
    for e, (pos, hx) in zip(el, stops):
        e.position = pos
        e.color = (*_lin(hx), 1.0)
    noise.inputs["Scale"].default_value = 3.0
    noise.inputs["Detail"].default_value = 4.0
    tc_obj = tc.outputs["Generated"]
    nt.links.new(tc_obj, noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], cramp.inputs["Fac"])
    cramp.color_ramp.elements[0].position = 0.55
    cramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    cramp.color_ramp.elements[1].position = 0.75
    cramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(cramp.outputs["Color"], mix.inputs["Factor"])
    nt.links.new(ramp.outputs["Color"], mix.inputs[6])
    mix.inputs[7].default_value = (*_lin("#FFE1C6"), 1.0)
    nt.links.new(mix.outputs[2], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = SKY_CAMERA_STRENGTH
    amb = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(mix.outputs[2], amb.inputs["Color"])
    amb.inputs["Strength"].default_value = SKY_LIGHT_STRENGTH
    path = nt.nodes.new("ShaderNodeLightPath")
    pick = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(path.outputs["Is Camera Ray"], pick.inputs["Fac"])
    nt.links.new(amb.outputs["Background"], pick.inputs[1])
    nt.links.new(bg.outputs["Background"], pick.inputs[2])
    nt.links.new(pick.outputs["Shader"], out.inputs["Surface"])
    return w


def _lin(hx):
    h = hx.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)
