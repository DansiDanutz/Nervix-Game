"""Procedural PBR textures for fidelity round 1 (numpy, deterministic seeds, no downloads).

make_cobbles   irregular warm setts: per-stone hue, macro variation, pillowed relief, grout, AO.
               Writes albedo (AO multiplied in), _n (normal), _h (height) and _ao maps.
make_card      RGBA foliage atlas (2 x 2 variants): bougainvillea bracts on leaves, or vine leaves.
make_fabric    awning / drape cloth with soft folds (height -> normal), tinted by the material.
"""

import os

import numpy as np

from arrival_materials import TEX_DIR, _hex, _save, _save_normal, _voronoi


def _tile_noise(size, freqs, seed, amp=1.0):
    """Tileable low-frequency noise: a sum of integer-frequency sines with random phases."""
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:size, 0:size] / size
    out = np.zeros((size, size))
    for f in freqs:
        for _ in range(3):
            fx, fy = rng.integers(-f, f + 1, 2)
            if fx == 0 and fy == 0:
                fx = f
            out += np.sin(2 * np.pi * (fx * xs + fy * ys) + rng.uniform(0, 2 * np.pi)) / f
    out /= np.abs(out).max() + 1e-6
    return out * amp


def _save_grey(name, g):
    return _save(name, np.repeat(np.clip(g, 0.0, 1.0)[..., None], 3, axis=2))


def make_cobbles(name, colours, grout_hex, seed, size=1024, cells=18, grout=0.07, macro=0.09):
    """Irregular setts. cells per tile edge; grout in cell units of (F2 - F1)."""
    pal = np.array([_hex(c) for c in colours])
    ident, f1, f2 = _voronoi(size, cells, seed)
    rng = np.random.default_rng(seed + 1)
    n = cells * cells
    base = pal[rng.integers(0, len(pal), n)] * rng.uniform(0.88, 1.08, (n, 1))
    base = base + rng.normal(0.0, 0.025, (n, 3))          # per-stone hue drift
    tone = base[ident]
    edge = f2 - f1
    pillow = np.clip(edge / 0.42, 0.0, 1.0) ** 0.55
    m = _tile_noise(size, (1, 2, 3), seed + 2, macro)      # macro variation mask (wet/worn patches)
    tone = tone * (1.0 + m)[..., None] * np.array([1.0, 1.0 - 0.3 * macro, 1.0 - 0.6 * macro])
    speck = rng.normal(0.0, 0.03, (size, size))
    tone = tone * (1.0 + speck)[..., None]
    joint = edge < grout
    tilt = rng.normal(0.0, 0.12, (n, 2))                  # stones sit unevenly
    ys, xs = np.mgrid[0:size, 0:size] / size * cells
    height = np.where(joint, 0.0, 0.35 + 0.65 * pillow + tilt[ident, 0] * ((xs % 1) - 0.5)
                      + tilt[ident, 1] * ((ys % 1) - 0.5)) + 1.5 * speck * pillow
    ao = np.clip(0.45 + 0.55 * np.clip(edge / 0.3, 0.0, 1.0) ** 0.6, 0.0, 1.0)
    grout_c = _hex(grout_hex) * (1.0 + 0.5 * speck)[..., None]
    albedo = np.where(joint[..., None], grout_c, tone) * ao[..., None]
    _save_normal(name.replace(".png", "_n.png"), height, strength=3.0, out_size=512)
    _save_grey(name.replace(".png", "_h.png"), height[::2, ::2])
    _save_grey(name.replace(".png", "_ao.png"), ao[::2, ::2])
    return _save(name, albedo)


def _stamp(rgba, cx, cy, rx, ry, ang, colour, shade=0.25, vein=None):
    """Alpha-stamp one rotated ellipse (a leaf or a bract) into an RGBA float canvas."""
    h, w, _ = rgba.shape
    r = int(max(rx, ry)) + 2
    x0, x1, y0, y1 = max(0, int(cx) - r), min(w, int(cx) + r), max(0, int(cy) - r), min(h, int(cy) + r)
    if x0 >= x1 or y0 >= y1:
        return
    ys, xs = np.mgrid[y0:y1, x0:x1]
    c, s = np.cos(ang), np.sin(ang)
    u = ((xs - cx) * c + (ys - cy) * s) / rx
    v = (-(xs - cx) * s + (ys - cy) * c) / ry
    d = u * u + v * v
    inside = d < 1.0
    col = np.array(colour) * (1.0 - shade * np.clip(d, 0, 1) + 0.12 * u)[..., None]
    if vein is not None:
        col = np.where((np.abs(v) < 0.08)[..., None] & inside[..., None], np.array(vein), col)
    win = rgba[y0:y1, x0:x1]
    win[..., :3] = np.where(inside[..., None], col, win[..., :3])
    win[..., 3] = np.where(inside, 1.0, win[..., 3])


def make_card(name, kind, seed, size=512):
    """2 x 2 atlas of foliage clusters with alpha. kind 'bloom' (bougainvillea) or 'vine'."""
    rng = np.random.default_rng(seed)
    rgba = np.zeros((size, size, 4))
    half = size // 2
    leaf_cols = [_hex(c) for c in ("#4E6E2E", "#5F8236", "#3F5C27", "#6F8F3A")]
    bloom_cols = [_hex(c) for c in ("#D23C93", "#C12F86", "#E05AA6", "#B42A7A", "#A848B8")]
    if kind == "vine":
        leaf_cols += [_hex("#86A03E"), _hex("#9DB04A")]
    for cell in range(4):
        ox, oy = (cell % 2) * half, (cell // 2) * half
        n_leaf = 150 if kind == "vine" else 110
        for _ in range(n_leaf):
            a, rr = rng.uniform(0, 2 * np.pi), half * 0.42 * np.sqrt(rng.random())
            cx, cy = ox + half / 2 + rr * np.cos(a), oy + half / 2 + rr * np.sin(a) * 0.9
            _stamp(rgba, cx, cy, rng.uniform(9, 15), rng.uniform(5, 8), rng.uniform(0, np.pi),
                   leaf_cols[rng.integers(len(leaf_cols))] * rng.uniform(0.8, 1.1), 0.3,
                   vein=_hex("#2E4419"))
        if kind == "bloom":
            for _ in range(70):
                a, rr = rng.uniform(0, 2 * np.pi), half * 0.38 * np.sqrt(rng.random())
                cx, cy = ox + half / 2 + rr * np.cos(a), oy + half / 2 + rr * np.sin(a) * 0.9
                col = bloom_cols[rng.integers(len(bloom_cols))] * rng.uniform(0.85, 1.12)
                for k in range(3):   # three papery bracts round a pale centre
                    b = rng.uniform(0, 2 * np.pi) + k * 2.094
                    _stamp(rgba, cx + 4 * np.cos(b), cy + 4 * np.sin(b), 6.5, 4.5, b, col, 0.35)
                _stamp(rgba, cx, cy, 1.6, 1.6, 0.0, _hex("#F4E9C8"), 0.0)
    # Keep cell borders empty so mip bleeding never shows seams.
    rgba[:2], rgba[-2:], rgba[:, :2], rgba[:, -2:] = 0, 0, 0, 0
    rgba[half - 2:half + 2], rgba[:, half - 2:half + 2] = 0, 0
    return _save_rgba(name, rgba)


def _save_rgba(name, rgba):
    import bpy
    os.makedirs(TEX_DIR, exist_ok=True)
    path = os.path.join(TEX_DIR, name)
    h, w, _ = rgba.shape
    img = bpy.data.images.get(name) or bpy.data.images.new(name, w, h, alpha=True)
    if tuple(img.size) != (w, h):
        img.scale(w, h)
    img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set(np.clip(rgba[::-1], 0, 1).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)
    return path


def make_fabric(name="ar_fabric.png", size=256, seed=7):
    """Near-white cloth with vertical folds and a fine weave (multiplied by each cloth tint)."""
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:size, 0:size] / size
    folds = 0.5 + 0.5 * np.sin(2 * np.pi * (6 * xs + 0.15 * np.sin(2 * np.pi * 2 * ys)))
    weave = 0.03 * np.sin(2 * np.pi * 96 * xs) * np.sin(2 * np.pi * 96 * ys)
    grey = 0.82 + 0.16 * folds + weave + rng.normal(0, 0.01, (size, size))
    _save_normal(name.replace(".png", "_n.png"), folds * 0.6 + weave, strength=1.8, out_size=256)
    return _save_grey(name, grey)


def make_rubble(name="ar_rubble.png", size=1024, seed=91, rows=12):
    """Coursed honey limestone (A01 walls): courses of varying height, stones of varying length with
    rounded, chipped arrises, per-stone hue, grain and recessed mortar. Writes _n alongside."""
    rng = np.random.default_rng(seed)
    pal = np.array([_hex(c) for c in ("#E2BF8C", "#D9B07C", "#EACB98", "#D4A877", "#E6C38E", "#CFA372")])
    heights = rng.uniform(0.7, 1.3, rows)
    edges = np.concatenate([[0], np.cumsum(heights / heights.sum() * size)]).astype(int)
    albedo = np.zeros((size, size, 3))
    height = np.zeros((size, size))
    ys, xs = np.mgrid[0:size, 0:size]
    for r in range(rows):
        y0, y1 = edges[r], edges[r + 1]
        cuts = [0]
        while cuts[-1] < size:
            cuts.append(cuts[-1] + int(rng.uniform(0.9, 2.2) * (y1 - y0)))
        cuts[-1] = size
        shift = int(rng.uniform(0, size))
        for a, b in zip(cuts, cuts[1:]):
            col = pal[rng.integers(len(pal))] * rng.uniform(0.9, 1.06) + rng.normal(0, 0.015, 3)
            sl = (slice(y0, y1), slice(0, size))
            xx = (xs[sl] - shift) % size
            inside = (xx >= a) & (xx < b)
            du = np.minimum(xx - a, b - 1 - xx) / max((b - a) / 2, 1)
            dv = np.minimum(ys[sl] - y0, y1 - 1 - ys[sl]) / max((y1 - y0) / 2, 1)
            d = np.clip(np.minimum(du * (b - a) / (y1 - y0), dv) * 6.0, 0, 1)
            chip = rng.normal(0, 0.15, d.shape) * (d < 0.6)
            h = np.clip(d + chip, 0, 1) ** 0.5
            albedo[sl] = np.where(inside[..., None], col * (0.72 + 0.28 * h)[..., None], albedo[sl])
            height[sl] = np.where(inside, 0.5 + 0.5 * h, height[sl])
    grain = _tile_noise(size, (16, 32, 48), seed + 1, 0.05) + rng.normal(0, 0.025, (size, size))
    mortar = height < 0.52
    albedo = np.where(mortar[..., None], _hex("#9C8266") * 0.85, albedo * (1 + grain)[..., None])
    height = height + grain
    _save_normal(name.replace(".png", "_n.png"), height, strength=4.0, out_size=512)
    return _save(name, albedo)
