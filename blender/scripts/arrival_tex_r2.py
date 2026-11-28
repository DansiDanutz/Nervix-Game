"""Procedural PBR textures for fidelity round 2 (numpy, deterministic seeds, no downloads).

make_sandstone   coursed rubble sandstone (A01 walls): irregular courses and stone lengths, wide
                 honey/rose/cream hue spread, per-stone mottling, chipped and worn arrises, pitting,
                 recessed dark mortar. Writes albedo (texture-space AO multiplied in) and _n.
make_barrel_tiles  terracotta barrel (canal) roof tiles: alternating caps and pans, overlap shadow
                 per course, per-tile hue and lichen. Writes albedo and a strong _n.
make_leaf_card   RGBA 2 x 2 atlases: 'olive' (slender silver-green leaves round twigs) and
                 'lavender' (grey-green tufts with violet flower spikes).
"""

import numpy as np

from arrival_materials import _hex, _save, _save_normal
from arrival_textures import _save_rgba, _stamp, _tile_noise

SANDSTONE = ("#E3BE8A", "#D8AC78", "#ECCB98", "#D2A47A", "#E8C49A", "#C99A70", "#E2B492", "#D9B9A0",
             "#CDA586", "#EFD3AA")
MORTAR = "#8A7258"


def _stone(rng, a, b, y0, y1, xs, ys, shift, size):
    """Mask, rounded-edge distance and chip field for one stone between a..b in row y0..y1."""
    xx = (xs - shift) % size
    inside = (xx >= a) & (xx < b)
    hw, hh = max((b - a) / 2, 1), max((y1 - y0) / 2, 1)
    du = 1.0 - np.abs(xx - (a + b - 1) / 2) / hw
    dv = 1.0 - np.abs(ys - (y0 + y1 - 1) / 2) / hh
    # rounded rectangle: soft corners instead of crisp brick edges
    eu, ev = np.clip(du * hw / 10.0, 0, 1), np.clip(dv * hh / 10.0, 0, 1)
    d = np.clip(1.0 - np.sqrt((1 - eu) ** 2 + (1 - ev) ** 2), 0, 1)
    chip = (rng.random(d.shape) < 0.04) * (d < 0.5)
    return inside, d, chip


def make_sandstone(name="ar_sandstone.png", size=1024, seed=93, rows=14):
    rng = np.random.default_rng(seed)
    pal = np.array([_hex(c) for c in SANDSTONE])
    heights = rng.uniform(0.6, 1.4, rows)
    edges = np.concatenate([[0], np.cumsum(heights / heights.sum() * size)]).astype(int)
    albedo = np.zeros((size, size, 3))
    height = np.zeros((size, size))
    ys, xs = np.mgrid[0:size, 0:size]
    mottle = _tile_noise(size, (6, 11, 17), seed + 5, 1.0)
    for r in range(rows):
        y0, y1 = edges[r], edges[r + 1]
        cuts = [0]
        while cuts[-1] < size:
            cuts.append(cuts[-1] + int(rng.uniform(0.8, 2.7) * (y1 - y0)))
        cuts[-1] = size
        shift = int(rng.uniform(0, size))
        sl = (slice(y0, y1), slice(0, size))
        for a, b in zip(cuts, cuts[1:]):
            inside, d, chip = _stone(rng, a, b, y0, y1, xs[sl], ys[sl], shift, size)
            col = pal[rng.integers(len(pal))] * rng.uniform(0.9, 1.07) + rng.normal(0, 0.018, 3)
            amp = rng.uniform(0.04, 0.12)
            bulge = rng.uniform(0.6, 1.0)
            h = np.clip(d * bulge, 0, 1) ** 0.45 - 0.35 * chip
            wear = np.clip(1.0 - d / 0.25, 0, 1) * 0.08          # pale worn arris
            tone = col * (1.0 + amp * mottle[sl])[..., None] * (0.78 + 0.22 * np.clip(h, 0, 1))[..., None]
            tone = tone + wear[..., None] - 0.18 * chip[..., None] * col
            albedo[sl] = np.where(inside[..., None], tone, albedo[sl])
            height[sl] = np.where(inside, 0.45 + 0.55 * h, height[sl])
    grain = _tile_noise(size, (24, 40, 64), seed + 1, 0.05) + rng.normal(0, 0.03, (size, size))
    pits = (rng.random((size, size)) < 0.006)
    mortar = height < 0.47
    mort = _hex(MORTAR) * (0.85 + 0.25 * rng.random((size, size)))[..., None]
    albedo = np.where(mortar[..., None], mort, albedo * (1 + grain - 0.25 * pits)[..., None])
    height = height + grain - 0.3 * pits
    _save_normal(name.replace(".png", "_n.png"), height, strength=5.0, out_size=512)
    return _save(name, albedo)


def make_barrel_tiles(name="ar_roof_barrel.png", size=1024, seed=5, courses=10, cols=12):
    """Rows run along u; v runs down the slope. Caps (convex) and pans (concave) alternate."""
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:size, 0:size] / size
    hue = np.array([_hex(c) for c in ("#B95E3C", "#C66C42", "#A9553A", "#D27E4E", "#9E4C33", "#C47452",
                                      "#B5644A")])
    row = (ys * courses).astype(int) % courses
    t_row = (ys * courses) % 1.0                      # 0 at the course's upper edge
    shift = (row % 2) * 0.5 / cols
    u = ((xs + shift) * cols) % 1.0
    col = ((xs + shift) * cols).astype(int) % cols
    cap = (col % 2 == 0)
    barrel = np.sin(np.pi * u)                        # 0 at tile edge, 1 at crown
    height = np.where(cap, 0.55 + 0.45 * barrel, 0.45 - 0.35 * barrel)
    overlap = np.clip(t_row / 0.18, 0, 1)              # each course tucks under the one above
    height = height * (0.65 + 0.35 * overlap) + 0.25 * t_row
    cell_hue = hue[rng.integers(0, len(hue), (courses, cols))][row, col]
    tone = cell_hue * rng.uniform(0.85, 1.1, (courses, cols))[row, col][..., None]
    shade = np.where(cap, 0.78 + 0.3 * barrel, 0.62 + 0.12 * (1 - barrel))
    tone = tone * shade[..., None] * (0.55 + 0.45 * overlap)[..., None]
    lichen = (rng.random((courses, cols)) < 0.1)[row, col] & (_tile_noise(size, (9, 15), seed + 3) > 0.2)
    tone = np.where(lichen[..., None], tone * 0.75 + 0.25 * _hex("#B7A46E"), tone)
    tone = tone * rng.normal(1.0, 0.03, (size, size, 1))
    _save_normal(name.replace(".png", "_n.png"), height, strength=7.0, out_size=512)
    return _save(name, tone)


def _olive_cell(rgba, rng, ox, oy, half):
    greens = [_hex(c) for c in ("#7E8E5A", "#8E9C6A", "#6B7A48", "#A3AE84", "#5E6E40")]
    for _ in range(9):                                   # twigs
        a = rng.uniform(0, 2 * np.pi)
        for t in np.linspace(0, 1, 12):
            _stamp(rgba, ox + half / 2 + t * half * 0.4 * np.cos(a), oy + half / 2 + t * half * 0.4 * np.sin(a),
                   2.0, 2.0, 0.0, _hex("#4A3A2A"), 0.0)
    for _ in range(320):
        a, rr = rng.uniform(0, 2 * np.pi), half * 0.44 * np.sqrt(rng.random())
        cx, cy = ox + half / 2 + rr * np.cos(a), oy + half / 2 + rr * np.sin(a) * 0.85
        _stamp(rgba, cx, cy, rng.uniform(8, 12), rng.uniform(2.0, 3.0), rng.uniform(0, np.pi),
               greens[rng.integers(len(greens))] * rng.uniform(0.85, 1.12), 0.25)


def _lavender_cell(rgba, rng, ox, oy, half):
    stem = [_hex(c) for c in ("#7C8A66", "#6E7C5A", "#8A9872")]
    violet = [_hex(c) for c in ("#8E6CC0", "#7A58B0", "#A07FD0", "#6C4C9E", "#9A72C8")]
    for _ in range(46):
        bx = ox + half / 2 + rng.normal(0, half * 0.14)
        top = oy + half * rng.uniform(0.08, 0.35)
        lean = rng.normal(0, 0.18)
        base = oy + half * 0.97
        for t in np.linspace(0, 1, 22):                  # stem from the base up to the spike
            y = base + (top - base) * t
            _stamp(rgba, bx + lean * (base - y) * 0.6, y, 1.4, 1.4, 0.0, stem[rng.integers(3)], 0.0)
        for t in np.linspace(0, 1, 9):                   # flower spike
            y = top + t * half * 0.16
            _stamp(rgba, bx + lean * (base - y) * 0.6 + rng.normal(0, 1.0), y, 3.2, 2.4, 0.0,
                   violet[rng.integers(len(violet))] * rng.uniform(0.85, 1.12), 0.3)
    for _ in range(60):                                  # grey-green tuft at the base
        cx, cy = ox + half / 2 + rng.normal(0, half * 0.16), oy + half * rng.uniform(0.75, 0.97)
        _stamp(rgba, cx, cy, rng.uniform(7, 11), 2.0, rng.uniform(1.2, 1.9), stem[rng.integers(3)], 0.25)


def make_leaf_card(name, kind, seed, size=512):
    rng = np.random.default_rng(seed)
    rgba = np.zeros((size, size, 4))
    half = size // 2
    for cell in range(4):
        ox, oy = (cell % 2) * half, (cell // 2) * half
        (_olive_cell if kind == "olive" else _lavender_cell)(rgba, rng, ox, oy, half)
    rgba[:2], rgba[-2:], rgba[:, :2], rgba[:, -2:] = 0, 0, 0, 0
    rgba[half - 2:half + 2], rgba[:, half - 2:half + 2] = 0, 0
    return _save_rgba(name, rgba)
