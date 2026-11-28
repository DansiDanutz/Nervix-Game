"""Materials and the two authored textures (ashlar walls, flagstone floor) for the OpenPoker slice."""

import os
import random

import bpy

from openpoker_common import TEXTURE_DIR, hexf, new_material, srgb, textured_material


def _save_png(name, width, height, rows):
    """rows: list of height lists of (r, g, b) sRGB floats, top row first."""
    os.makedirs(TEXTURE_DIR, exist_ok=True)
    path = os.path.join(TEXTURE_DIR, name)
    img = bpy.data.images.new(name, width, height, alpha=False)
    flat = []
    for row in reversed(rows):  # Blender images are bottom-up
        for r, g, b in row:
            flat.extend((r, g, b, 1.0))
    img.pixels.foreach_set(flat)
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    return path


def make_ashlar_texture():
    """Honey limestone ashlar, 512 px = 2 m, courses of 0.5 m with staggered joints."""
    rng = random.Random(7)
    size, course = 512, 64
    base = hexf("#E0BC84")
    joint = hexf("#A88656")
    blocks = {}
    rows = []
    for y in range(size):
        r_idx = y // course
        row = []
        for x in range(size):
            x2 = (x + (r_idx % 2) * 64) % size
            bx = x2 // 128
            key = (r_idx, bx)
            if key not in blocks:
                blocks[key] = 0.93 + rng.random() * 0.12
            shade = blocks[key]
            in_joint = (y % course) < 3 or (x2 % 128) < 3
            if in_joint:
                c = joint
            else:
                noise = 0.98 + rng.random() * 0.04
                c = tuple(min(1.0, v * shade * noise) for v in base)
            row.append(tuple(c))
        rows.append(row)
    return _save_png("ashlar_honey.png", size, size, rows)


def make_flagstone_texture():
    """Pale limestone flagstones with muted rose diamonds, 512 px = 2 m (4 x 4 flags)."""
    rng = random.Random(11)
    size, tile = 512, 128
    pale = hexf("#E8D2A8")
    joint = hexf("#B9996A")
    rose = hexf("#C98A7E")
    tones = {}
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            i, j = x // tile, y // tile
            u = (x % tile) / tile - 0.5
            v = (y % tile) / tile - 0.5
            if (i, j) not in tones:
                tones[(i, j)] = 0.95 + rng.random() * 0.08
            on_joint = (x % tile) < 2 or (y % tile) < 2
            if on_joint:
                c = joint
            elif (i + j) % 4 == 0 and abs(u) + abs(v) < 0.22:
                c = rose
            else:
                t = tones[(i, j)] * (0.98 + rng.random() * 0.04)
                c = tuple(min(1.0, v_ * t) for v_ in pale)
            row.append(tuple(c))
        rows.append(row)
    return _save_png("flagstone_pale.png", size, size, rows)


def build_materials():
    ashlar = make_ashlar_texture()
    flags = make_flagstone_texture()
    m = {
        "ashlar": textured_material("oc_ashlar_honey", ashlar, rough=0.9, tex_scale=4.0),
        "flags": textured_material("oc_flagstone", flags, rough=0.75, tex_scale=2.0),
        "limestone": new_material("oc_limestone_honey", srgb("#E2C08A"), rough=0.85),
        "limestone_pale": new_material("oc_limestone_pale", srgb("#EED9B0"), rough=0.8),
        "plum": new_material("oc_plum_velvet", srgb("#6E1F3A"), rough=0.9),
        "plum_deep": new_material("oc_plum_deep", srgb("#4A1126"), rough=0.9),
        "gold": new_material("oc_gold", srgb("#D9A93F"), rough=0.3, metal=1.0),
        "brass": new_material("oc_brass", srgb("#B8893A"), rough=0.35, metal=0.9),
        "walnut": new_material("oc_walnut", srgb("#5A3420"), rough=0.55),
        "walnut_dark": new_material("oc_walnut_dark", srgb("#3B2116"), rough=0.6),
        "felt": new_material("oc_green_felt", srgb("#1F6B4A"), rough=0.95),
        "terracotta": new_material("oc_terracotta", srgb("#B5573A"), rough=0.7),
        "clay": new_material("oc_clay_pot", srgb("#B8703F"), rough=0.75),
        "olive": new_material("oc_olive_leaf", srgb("#6E8A3A"), rough=0.7),
        "lemon": new_material("oc_lemon_leaf", srgb("#86A24A"), rough=0.7),
        "lemon_fruit": new_material("oc_lemon_fruit", srgb("#E9C332"), rough=0.5),
        "glass": new_material("oc_glass_leaded", srgb("#B8D8C2"), rough=0.05),
        "iron": new_material("oc_iron_dark", srgb("#2A2420"), rough=0.5, metal=0.6),
        "plaster": new_material("oc_plaster_cream", srgb("#EAD9B8"), rough=0.9),
        "sky": new_material("oc_window_view", srgb("#A9CBE0"), rough=1.0, emit=1.2,
                            emit_colour=srgb("#C9E2F0")),
        "glow": new_material("oc_lantern_glow", srgb("#FFD08A"), rough=0.4, emit=8.0,
                             emit_colour=srgb("#FFB55A")),
        "red": new_material("oc_roulette_red", srgb("#A3202A"), rough=0.5),
        "black": new_material("oc_roulette_black", srgb("#1B1B1D"), rough=0.5),
        "zero": new_material("oc_roulette_zero", srgb("#1F6B4A"), rough=0.5),
        "ivory": new_material("oc_ivory", srgb("#F2E6CC"), rough=0.6),
        "sign": new_material("oc_blank_sign", srgb("#6E1F3A"), rough=0.7),
    }
    return m
