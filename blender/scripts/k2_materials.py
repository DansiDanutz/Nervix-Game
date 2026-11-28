"""K2 house kit materials. Palette sampled by eye from A01/A04/A05/A06: honey limestone ashlar,
teal shutters and railings, terracotta roof, plum banners, brass, warm wood, warm plaster interior.

Get-or-create by name (prefix "k2_"), so rebuilding never piles up ".001" copies. Procedural
textures are generated with numpy and packed into the .blend (no loose files), deterministic seeds.
"""

import bpy
import numpy as np


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def _hex(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


def _image(name, rgb):
    """rgb: (H, W, 3) sRGB floats, row 0 = top. Packed into the .blend."""
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1))], axis=2)[::-1]
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.file_format = "PNG"
    img.pack()
    return img


def ashlar(name, colours, mortar, seed, size=512, rows=8):
    """Running-bond ashlar with random block lengths, pillowed edges, pits and baked joint AO."""
    rng = np.random.default_rng(seed)
    pal = np.array([_hex(c) for c in colours])
    out = np.zeros((size, size, 3))
    rh = size // rows
    ys, xs = np.mgrid[0:rh, 0:size]
    for r in range(rows):
        cuts, x = [0], 0
        while x < size - 90:
            x += int(rng.integers(70, 150))
            cuts.append(min(x, size))
        if cuts[-1] != size:
            cuts.append(size)
        cuts = np.array(cuts)
        bi = np.searchsorted(cuts, xs, side="right") - 1
        left, right = cuts[bi], cuts[np.minimum(bi + 1, len(cuts) - 1)]
        tone = pal[rng.integers(0, len(pal), len(cuts))][bi] * rng.uniform(0.95, 1.04, len(cuts))[bi][..., None]
        du = np.minimum(xs - left, right - xs) / 10.0
        dv = np.minimum(ys, rh - 1 - ys) / 8.0
        edge = np.clip(np.minimum(du, dv), 0, 1)
        joint = (np.minimum(xs - left, right - 1 - xs) < 2) | (ys < 3)
        block = np.where(joint[..., None], _hex(mortar), tone * (0.8 + 0.2 * edge)[..., None])
        out[r * rh:(r + 1) * rh] = np.roll(block, int(rng.integers(0, size)), axis=1)
    out *= rng.normal(1.0, 0.035, (size, size, 1))
    out -= 0.08 * (rng.random((size, size, 1)) < 0.01)
    return _image(name, out)


def tiles(name, colours, grout, seed, size=256, n=4):
    rng = np.random.default_rng(seed)
    pal = np.array([_hex(c) for c in colours])
    ys, xs = np.mgrid[0:size, 0:size]
    t = size // n
    cid = (ys // t) * n + (xs // t)
    out = pal[rng.integers(0, len(pal), n * n)][cid] * rng.uniform(0.92, 1.06, n * n)[cid][..., None]
    e = np.minimum(np.minimum(xs % t, t - 1 - xs % t), np.minimum(ys % t, t - 1 - ys % t))
    out = out * (0.86 + 0.14 * np.clip(e / 6.0, 0, 1))[..., None]
    out = np.where((e < 2)[..., None], _hex(grout), out)
    return _image(name, out * rng.normal(1.0, 0.03, (size, size, 1)))


def planks(name, colours, seed, size=256, n=8):
    rng = np.random.default_rng(seed)
    pal = np.array([_hex(c) for c in colours])
    ys, xs = np.mgrid[0:size, 0:size]
    w = size // n
    pid = xs // w
    out = pal[rng.integers(0, len(pal), n)][pid] * rng.uniform(0.9, 1.08, n)[pid][..., None]
    grain = 0.06 * np.sin(ys / 3.0 + 4.0 * np.sin(xs / 17.0 + pid)) + rng.normal(0, 0.02, (size, size))
    out = out * (1.0 + grain)[..., None]
    out = np.where(((xs % w) < 2)[..., None], out * 0.55, out)
    return _image(name, out)


def _base(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type not in {"BSDF_PRINCIPLED", "OUTPUT_MATERIAL"}:
            nt.nodes.remove(n)
    return m, nt, nt.nodes.get("Principled BSDF")


def flat(name, hex_c, rough=0.8, metal=0.0, emit=0.0, emit_hex=None, alpha=1.0):
    m, _, b = _base(name)
    b.inputs["Base Color"].default_value = (*srgb(hex_c), 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Emission Color"].default_value = (*srgb(emit_hex or hex_c), 1.0)
    b.inputs["Emission Strength"].default_value = emit
    b.inputs["Alpha"].default_value = alpha
    if alpha < 1.0:
        m.surface_render_method = "BLENDED"
    m["uv_scale"] = 1.0
    return m


def textured(name, img, rough, uv_scale, tint=None):
    m, nt, b = _base(name)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    b.inputs["Emission Strength"].default_value = 0.0
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    if tint is None:
        nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    else:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(tex.outputs["Color"], mix.inputs[6])
        mix.inputs[7].default_value = (*srgb(tint), 1.0)
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    m["uv_scale"] = uv_scale
    return m


def build_materials():
    stone_img = ashlar("k2_ashlar.png", ["#E2A866", "#D99B5C", "#EBB777", "#D69458", "#E5AE6E"], "#A8744A", 7)
    floor_img = tiles("k2_floor_tiles.png", ["#B9653F", "#C4734A", "#A95A38", "#C9805A"], "#7A4A30", 11)
    wood_img = planks("k2_planks.png", ["#8A5230", "#7A4528", "#94603A"], 3)
    return {
        "stone": textured("k2_stone", stone_img, 0.9, 2.2),
        "stone_trim": textured("k2_stone_trim", stone_img, 0.85, 1.4, tint="#FFE9C8"),
        "stone_shade": textured("k2_stone_shade", stone_img, 0.9, 2.2, tint="#D8BBA2"),
        "roof": flat("k2_roof_tile", "#B95A38", 0.7),
        "roof_dark": flat("k2_roof_under", "#7E3826", 0.85),
        "teal": flat("k2_teal", "#2F7F78", 0.6),
        "teal_dark": flat("k2_teal_dark", "#235F5A", 0.65),
        "teal_awning": flat("k2_teal_awning", "#3A9389", 0.8),
        "cream": flat("k2_cream_trim", "#F1E0BE", 0.8),
        "wood": textured("k2_wood", wood_img, 0.6, 1.2),
        "wood_dark": flat("k2_wood_dark", "#4A2C1A", 0.65),
        "sign_blank": textured("k2_sign_blank", wood_img, 0.55, 1.6, tint="#E6C8A0"),
        "iron": flat("k2_iron", "#2B2420", 0.5, 0.6),
        "brass": flat("k2_brass", "#C3963F", 0.35, 0.9),
        "glass_dark": flat("k2_glass_dark", "#3A2A24", 0.25, emit=0.35, emit_hex="#B9712F"),
        "glass_shop": flat("k2_glass_shop", "#CFE3DE", 0.05, alpha=0.18),
        "glow": flat("k2_lantern_glow", "#FFC77A", 0.4, emit=4.0, emit_hex="#FFA94A"),
        "plum": flat("k2_plum", "#7A2445", 0.75),
        "gold": flat("k2_gold", "#E0B04A", 0.3, 1.0),
        "plaster": flat("k2_plaster", "#EBCDA4", 0.92),
        "wainscot": flat("k2_wainscot", "#6E2A3E", 0.8),
        "floor": textured("k2_floor", floor_img, 0.8, 1.6),
        "clay": flat("k2_clay_pot", "#B86A3E", 0.65),
        "olive": flat("k2_olive_leaf", "#6F8A3C", 0.75),
        "leaf_dark": flat("k2_leaf_dark", "#47612E", 0.8),
        "flower": flat("k2_flower", "#C2388F", 0.6),
        "rug": flat("k2_rug", "#8C2C3E", 0.95),
    }
