"""Materials and procedural textures for the A01 arrival square.

Palette sampled by eye from A01/A03/A04/A05: honey limestone, sandy-rose cobbles, plum/burgundy
bands, teal shutters and awnings, terracotta roofs, brass and gold accents.
Materials are get-or-create (prefix "ar_") so rebuilding never piles up ".001" copies.
Textures are written to blender/textures/arrival/ with numpy (fast, deterministic seeds).
"""

import os

import bpy
import numpy as np

from openpoker_common import ROOT, srgb

TEX_DIR = os.path.join(ROOT, "blender", "textures", "arrival")
ASHLAR = os.path.join(ROOT, "blender", "textures", "openpoker", "ashlar_honey.png")


def _hex(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


def _save(name, rgb):
    """rgb: (H, W, 3) sRGB floats, row 0 = top."""
    os.makedirs(TEX_DIR, exist_ok=True)
    path = os.path.join(TEX_DIR, name)
    h, w, _ = rgb.shape
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1))], axis=2)[::-1]
    img = bpy.data.images.get(name) or bpy.data.images.new(name, w, h, alpha=False)
    if tuple(img.size) != (w, h):
        img.scale(w, h)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    return path


def _voronoi(size, cells, seed):
    """Tileable jittered-grid Voronoi: returns (cell id, F1, F2) per pixel."""
    rng = np.random.default_rng(seed)
    jit = rng.random((cells, cells, 2)) * 0.8 + 0.1
    ys, xs = np.mgrid[0:size, 0:size] / size * cells
    gx, gy = np.floor(xs).astype(int), np.floor(ys).astype(int)
    best = np.full((size, size), 9.0)
    second = np.full((size, size), 9.0)
    ident = np.zeros((size, size), int)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            cx, cy = gx + dx, gy + dy
            jx, jy = jit[cy % cells, cx % cells, 0], jit[cy % cells, cx % cells, 1]
            d = np.hypot(xs - (cx + jx), ys - (cy + jy))
            cid = (cy % cells) * cells + (cx % cells)
            closer = d < best
            second = np.where(closer, best, np.minimum(second, d))
            ident = np.where(closer, cid, ident)
            best = np.where(closer, d, best)
    return ident, best, second


def make_bricks(name, colours, joint_hex, seed, size=512, rows=16, per_row=8):
    """Running-bond pavers, used for the plum bands and the pale fountain surround."""
    pal = np.array([_hex(c) for c in colours])
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:size, 0:size]
    rh = size // rows
    bw = size // per_row
    r_idx = ys // rh
    xo = (xs + (r_idx % 2) * (bw // 2)) % size
    b_idx = xo // bw
    cid = (r_idx % rows) * per_row + (b_idx % per_row)
    tone = pal[rng.integers(0, len(pal), rows * per_row)][cid]
    tone = tone * rng.uniform(0.92, 1.06, rows * per_row)[cid][..., None]
    tone = tone * rng.normal(1.0, 0.03, (size, size, 1))
    du = np.minimum(xo % bw, bw - xo % bw) / (bw / 2.0)
    dv = np.minimum(ys % rh, rh - ys % rh) / (rh / 2.0)
    tone = tone * (0.84 + 0.16 * np.clip(np.minimum(du, dv) * 3.0, 0, 1))[..., None]  # pillowed edges
    joint = ((ys % rh) < 3) | ((xo % bw) < 3)
    height = np.where(joint, 0.0, np.clip(np.minimum(du, dv) * 3.0, 0, 1) * 0.6 + 0.4)
    height = height + rng.normal(0.0, 0.04, (size, size))
    # Texture-space ambient occlusion: joints and pillowed edges darken a little more (baked).
    ao = 0.9 + 0.1 * np.clip(height, 0.0, 1.0)
    albedo = np.where(joint[..., None], _hex(joint_hex), tone) * ao[..., None]
    _save_normal(name.replace(".png", "_n.png"), height, strength=2.5)
    return _save(name, albedo)


def _save_normal(name, height, strength=2.0, out_size=256):
    """Tangent-space normal map from a tileable height field (OpenGL / glTF convention: +Y up)."""
    step = max(1, height.shape[0] // out_size)
    h = height[::step, ::step]
    gx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 * strength
    gy = (np.roll(h, 1, axis=0) - np.roll(h, -1, axis=0)) * 0.5 * strength   # row 0 = top
    n = np.stack([-gx, -gy, np.ones_like(h)], axis=2)
    n = n / np.linalg.norm(n, axis=2, keepdims=True)
    return _save(name, n * 0.5 + 0.5)


def make_stone_grain(name="ar_stone_grain.png", size=512, seed=61):
    """Near-white limestone grain (multiplied by each stone tint): soft block tones, fine pitting,
    faint bedding streaks, and darker texture-space AO in the hairline joints. Writes a normal map."""
    ident, f1, f2 = _voronoi(size, 10, seed)
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:size, 0:size] / size
    block = rng.uniform(0.95, 1.0, 100)[ident]
    edge = np.clip((f2 - f1) * 9.0, 0.0, 1.0)
    pits = rng.random((size, size)) < 0.012
    streak = 0.015 * np.sin(2 * np.pi * (ys * 7 + 0.15 * np.sin(2 * np.pi * xs * 3)))
    fine = rng.normal(0.0, 0.018, (size, size))
    grey = block * (0.95 + 0.05 * edge) + streak + fine - 0.07 * pits
    height = 0.25 * edge + 0.4 * block + 2.0 * fine - 0.4 * pits
    _save_normal(name.replace(".png", "_n.png"), height, strength=1.6)
    return _save(name, np.repeat(np.clip(grey, 0.0, 1.0)[..., None], 3, axis=2))


def make_ashlar_normal(src=ASHLAR, name="ar_ashlar_n.png"):
    """Normal map from the existing honey ashlar albedo (dark mortar = low)."""
    img = bpy.data.images.load(src, check_existing=True)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    lum = px[..., 0] * 0.3 + px[..., 1] * 0.59 + px[..., 2] * 0.11
    return _save_normal(name, (lum - lum.mean()) / (lum.std() + 1e-6) * 0.25, strength=2.0)


def make_roof_tiles(name="ar_roof_tiles.png", size=256):
    """Terracotta barrel tiles: rows of rounded courses with a dark shadow line."""
    ys, xs = np.mgrid[0:size, 0:size] / size
    rng = np.random.default_rng(5)
    course = (ys * 8) % 1.0
    barrel = 0.5 + 0.5 * np.cos((xs * 10 % 1.0 - 0.5) * np.pi * 2)
    base = _hex("#B95E3C") * (0.82 + 0.22 * barrel[..., None])
    base = base * (0.75 + 0.25 * np.clip(course / 0.2, 0, 1))[..., None]
    base = base * rng.uniform(0.9, 1.08, (8, 10))[(ys * 8).astype(int) % 8, (xs * 10).astype(int) % 10][..., None]
    return _save(name, base)


def make_hill(name="ar_hill.png", size=256):
    """Dry golden hillside with olive scrub patches (A12), large scale, tileable."""
    ident, f1, f2 = _voronoi(size, 9, 21)
    rng = np.random.default_rng(22)
    pick = rng.random(81)[ident]
    grass = _hex("#C9A060") * rng.uniform(0.9, 1.08, 81)[ident][..., None]
    scrub = _hex("#7C8A45") * rng.uniform(0.85, 1.1, 81)[ident][..., None]
    rock = _hex("#B99A80")
    out = np.where((pick < 0.45)[..., None], scrub, np.where((pick < 0.6)[..., None], rock, grass))
    return _save(name, out * rng.normal(1.0, 0.03, (size, size, 1)))


def _image_material(name, path, rough, uv_scale, tint=None, normal=None, normal_strength=0.6):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type not in {"BSDF_PRINCIPLED", "OUTPUT_MATERIAL"}:
            nt.nodes.remove(n)
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Specular IOR Level"].default_value = 0.3
    img = bpy.data.images.load(path, check_existing=True)
    img.reload()
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    if tint is None:
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    else:  # multiply the texture by a tint (exports as glTF baseColorFactor)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(tex.outputs["Color"], mix.inputs[6])
        mix.inputs[7].default_value = (*srgb(tint), 1.0)
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    if normal is not None:
        nimg = bpy.data.images.load(normal, check_existing=True)
        nimg.reload()
        nimg.colorspace_settings.name = "Non-Color"
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = nimg
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    m["uv_scale"] = uv_scale
    return m


def _n(path):
    return path.replace(".png", "_n.png")


def _flat(name, hex_c, rough=0.8, metal=0.0, emit=0.0, emit_hex=None, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type not in {"BSDF_PRINCIPLED", "OUTPUT_MATERIAL"}:
            nt.nodes.remove(n)
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*srgb(hex_c), 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Emission Color"].default_value = (*srgb(emit_hex or hex_c), 1.0)
    b.inputs["Emission Strength"].default_value = emit
    b.inputs["Alpha"].default_value = alpha
    if alpha < 1.0:
        try:
            m.surface_render_method = "BLENDED"
        except AttributeError:
            pass
    m["uv_scale"] = 2.0
    return m


def _sky_tinted(mat, tint_hex="#BFD8F0"):
    """Pool surface: teal body (emissive so it holds at the spawn's grazing angle) with a sky-blue sheen."""
    b = mat.node_tree.nodes.get("Principled BSDF")
    for key in ("Specular Tint",):
        if key in b.inputs and b.inputs[key].type == "RGBA":
            b.inputs[key].default_value = (*srgb(tint_hex), 1.0)
    if "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = 0.08   # grazing view: keep the teal, a sky sheen only
    return mat


def build_materials():
    cobble = make_bricks("ar_setts.png", ["#DDB58F", "#E6C49E", "#D2A684", "#DCA990", "#E9CDA9", "#CFA081",
                                          "#E0B69A"], "#9C7A5E", 13, rows=14, per_row=10)
    plum = make_bricks("ar_plum_pavers.png", ["#7A2846", "#8C3553", "#69203C", "#933E5A"], "#4A1A2C", 31)
    pale = make_bricks("ar_pale_pavers.png", ["#EBD3AE", "#E2C39C", "#F0DCBA", "#DDBB95"], "#B08F6C", 41,
                       rows=8, per_row=4)
    roof = make_roof_tiles()
    hill = make_hill()
    grain = make_stone_grain()
    ashlar_n = make_ashlar_normal()
    return {
        "cobble": _image_material("ar_cobble", cobble, 0.85, 2.4, normal=_n(cobble)),
        "plum_band": _image_material("ar_plum_band", plum, 0.8, 1.6, normal=_n(plum)),
        "pale_band": _image_material("ar_pale_band", pale, 0.8, 1.8, normal=_n(pale)),
        "ashlar": _image_material("ar_ashlar", ASHLAR, 0.9, 4.0, normal=ashlar_n),
        "ashlar_shade": _image_material("ar_ashlar_shade", ASHLAR, 0.9, 4.0, tint="#A88E86", normal=ashlar_n),
        "roof": _image_material("ar_roof_tiles", roof, 0.7, 2.0),
        "hill": _image_material("ar_hillside", hill, 0.95, 40.0),
        "far_ridge": _flat("ar_far_ridge", "#B99AA6", 0.95),
        "dome_rose": _flat("ar_dome_rose", "#C77B7E", 0.5, 0.3),
        "ground": _flat("ar_ground_far", "#C79D72", 0.95),
        "limestone": _image_material("ar_limestone", grain, 0.85, 2.2, tint="#E8C590", normal=_n(grain)),
        "limestone_pale": _image_material("ar_limestone_pale", grain, 0.8, 1.6, tint="#F3E1BA", normal=_n(grain)),
        "plaster": _image_material("ar_plaster_warm", grain, 0.9, 3.0, tint="#EACC9E", normal=_n(grain),
                                   normal_strength=0.35),
        # Aerial-perspective stone for the far aqueduct: lighter and rosier, so the cream/gold/plum
        # fountain in front of it keeps its contrast as the focal point.
        # Fountain stone: warmer, more saturated cream than the rosy haze of the aqueduct behind it.
        "fountain_stone": _image_material("ar_fountain_stone", grain, 0.7, 1.2, tint="#EDCB94", normal=_n(grain)),
        "haze_stone": _flat("ar_haze_stone", "#E2C6B4", 0.95),
        "haze_stone_pale": _flat("ar_haze_stone_pale", "#EAD3C2", 0.95),
        "plum": _flat("ar_plum", "#7A2445", 0.75),
        "plum_deep": _flat("ar_plum_deep", "#521530", 0.85),
        "red_carpet": _flat("ar_red_carpet", "#9A1E35", 0.9),
        "gold": _flat("ar_gold", "#E0B04A", 0.3, 1.0),
        "brass": _flat("ar_brass", "#B88A3A", 0.35, 0.9),
        "teal": _flat("ar_teal", "#2F7F78", 0.6),
        "plaster_rose": _flat("ar_plaster_rose", "#E3B59A", 0.9),
        "lemon": _flat("ar_lemon", "#E7C63A", 0.5),
        "teal_dark": _flat("ar_teal_dark", "#235F5A", 0.65),
        "teal_light": _flat("ar_teal_awning", "#3C978C", 0.75),
        "wood": _flat("ar_wood", "#6B4026", 0.6),
        "wood_dark": _flat("ar_wood_dark", "#3E2518", 0.65),
        "terracotta": _flat("ar_terracotta", "#B4593A", 0.7),
        "clay": _flat("ar_clay_pot", "#B86A3E", 0.65),
        "iron": _flat("ar_iron", "#2B2420", 0.5, 0.6),
        "olive": _flat("ar_olive_leaf", "#6F8A3C", 0.75),
        "leaf_dark": _flat("ar_leaf_dark", "#47612E", 0.8),
        "cypress": _flat("ar_cypress", "#34502C", 0.85),
        "flower_magenta": _flat("ar_flower_magenta", "#C2388F", 0.6, emit=0.15),
        "flower_violet": _flat("ar_flower_violet", "#9A5BC2", 0.6, emit=0.1),
        "flower_white": _flat("ar_flower_white", "#F3E6D8", 0.6),
        "water": _sky_tinted(_flat("ar_water", "#1C7F8E", 0.3, emit=0.9, emit_hex="#2A9FB0")),
        # Constant alpha (glTF carries it to the client): thin, partly transparent, softly emissive.
        "water_fall": _flat("ar_water_fall", "#D2F2F2", 0.05, emit=0.6, emit_hex="#A6EAE6", alpha=0.65),
        "water_foam": _flat("ar_water_foam", "#F2FCFC", 0.3, emit=0.6, emit_hex="#FFFFFF", alpha=0.85),
        "glow": _flat("ar_lantern_glow", "#FFC77A", 0.4, emit=4.0, emit_hex="#FFA94A"),
        "window_glow": _flat("ar_window_glow", "#E9A55A", 0.5, emit=1.6, emit_hex="#F2A45A"),
        "window_dark": _flat("ar_window_dark", "#3A2A24", 0.4),
        "interior": _flat("ar_interior_warm", "#7A4A2C", 0.7, emit=0.5, emit_hex="#C9782F"),
        "cloth_cream": _flat("ar_cloth_cream", "#F1E3C6", 0.85),
        "blank_sign": _flat("ar_blank_sign", "#7A4A2A", 0.6),
    }
