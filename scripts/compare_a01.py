"""A01 strip and support metrics: reference | Blender CAM_A01 | game ?cam=a01.

Run from the repository root (Pillow only, no numpy):
    python3 scripts/compare_a01.py [--ref PATH] [--blender PATH] [--game PATH]
                                   [--strip PATH] [--metrics PATH] [--metric-width 836]

Writes the strip (docs/evidence/slice/compare-A01-baseline.png by default) and a JSON of
SSIM (luma, 8x8 windows) and mean CIEDE76 colour difference (CIELAB, D65) for the whole frame
and a 3x3 grid, for each pair. The numbers are a support signal for the judges, not a verdict:
A01 is a painting, so a perfect geometric match still differs in texture and light.
"""

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
EVIDENCE = os.path.join(ROOT, "docs", "evidence", "slice")
DEFAULTS = {
    "ref": os.path.join(ROOT, "assets", "references", "A01-plaza.png"),
    "blender": os.path.join(EVIDENCE, "blender-A01-camera.png"),
    "game": os.path.join(EVIDENCE, "game-A01-camera.png"),
    "strip": os.path.join(EVIDENCE, "compare-A01-baseline.png"),
    "metrics": os.path.join(EVIDENCE, "a01-metrics.json"),
}
FRAME = (1672, 941)
PANEL_WIDTH = 836
HEADER = 44
GAP = 8
WINDOW = 8
SSIM_C1 = (0.01 * 255) ** 2
SSIM_C2 = (0.03 * 255) ** 2
GRID = 3
ROW_NAMES = ("top", "mid", "bottom")
COL_NAMES = ("left", "centre", "right")
LABELS = ("A01 reference (art target)", "Blender: CAM_A01", "Game: ?cam=a01 (GPU, DEV)")
FONT_PATHS = ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/SFNS.ttf")


def parse_args(argv):
    p = argparse.ArgumentParser()
    for key in ("ref", "blender", "game", "strip", "metrics"):
        p.add_argument(f"--{key}", default=DEFAULTS[key])
    p.add_argument("--metric-width", type=int, default=836)
    return p.parse_args(argv)


def load(path):
    if not os.path.isfile(path):
        raise FileNotFoundError(f"missing image: {path}")
    img = Image.open(path).convert("RGB")
    if img.size != FRAME:
        img = img.resize(FRAME, Image.LANCZOS)
    return img


def pixels(img):
    """Flat pixel list; Pillow 13 renamed getdata (removed in Pillow 14)."""
    getter = getattr(img, "get_flattened_data", None) or img.getdata
    return list(getter())


def font(size):
    for path in FONT_PATHS:
        if os.path.isfile(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def build_strip(images, path):
    ph = round(PANEL_WIDTH * FRAME[1] / FRAME[0])
    width = PANEL_WIDTH * len(images) + GAP * (len(images) - 1)
    strip = Image.new("RGB", (width, ph + HEADER), (24, 22, 26))
    draw = ImageDraw.Draw(strip)
    f = font(22)
    for i, (img, label) in enumerate(zip(images, LABELS)):
        x = i * (PANEL_WIDTH + GAP)
        strip.paste(img.resize((PANEL_WIDTH, ph), Image.LANCZOS), (x, HEADER))
        draw.text((x + 12, 10), label, fill=(240, 236, 228), font=f)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    strip.save(path)
    return strip.size


def srgb_to_linear(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


LINEAR = [srgb_to_linear(float(i)) for i in range(256)]
WHITE = (0.95047, 1.0, 1.08883)


def lab_f(t):
    return t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116


def to_lab(img):
    out = []
    for r, g, b in pixels(img):
        lr, lg, lb = LINEAR[r], LINEAR[g], LINEAR[b]
        x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / WHITE[0]
        y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
        z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / WHITE[2]
        fx, fy, fz = lab_f(x), lab_f(y), lab_f(z)
        out.append((116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)))
    return out


def regions(w, h):
    yield "whole", (0, 0, w, h)
    for r in range(GRID):
        for c in range(GRID):
            box = (c * w // GRID, r * h // GRID, (c + 1) * w // GRID, (r + 1) * h // GRID)
            yield f"{ROW_NAMES[r]}-{COL_NAMES[c]}", box


def window_ssim(a, b, w, x0, y0):
    n = WINDOW * WINDOW
    sa = sb = saa = sbb = sab = 0.0
    for y in range(y0, y0 + WINDOW):
        row = y * w
        for x in range(x0, x0 + WINDOW):
            pa, pb = a[row + x], b[row + x]
            sa += pa
            sb += pb
            saa += pa * pa
            sbb += pb * pb
            sab += pa * pb
    ma, mb = sa / n, sb / n
    va, vb, cov = saa / n - ma * ma, sbb / n - mb * mb, sab / n - ma * mb
    return ((2 * ma * mb + SSIM_C1) * (2 * cov + SSIM_C2)) / ((ma * ma + mb * mb + SSIM_C1) * (va + vb + SSIM_C2))


def ssim(a, b, w, box):
    x0, y0, x1, y1 = box
    vals = [window_ssim(a, b, w, x, y)
            for y in range(y0, y1 - WINDOW + 1, WINDOW) for x in range(x0, x1 - WINDOW + 1, WINDOW)]
    return sum(vals) / len(vals)


def delta_e(la, lb, w, box):
    x0, y0, x1, y1 = box
    total, n = 0.0, 0
    for y in range(y0, y1):
        row = y * w
        for x in range(x0, x1):
            p, q = la[row + x], lb[row + x]
            total += math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2)
            n += 1
    return total / n


def prepare(img, mw):
    mh = round(mw * FRAME[1] / FRAME[0])
    small = img.resize((mw, mh), Image.LANCZOS)
    return {"luma": pixels(small.convert("L")), "lab": to_lab(small), "size": (mw, mh)}


def compare(pa, pb):
    w, h = pa["size"]
    return {name: {"ssim": round(ssim(pa["luma"], pb["luma"], w, box), 4),
                   "delta_e": round(delta_e(pa["lab"], pb["lab"], w, box), 2)}
            for name, box in regions(w, h)}


def main(argv):
    args = parse_args(argv)
    paths = {"reference": args.ref, "blender": args.blender, "game": args.game}
    images = {k: load(p) for k, p in paths.items()}
    strip_size = build_strip(list(images.values()), args.strip)
    prepared = {k: prepare(v, args.metric_width) for k, v in images.items()}
    pairs = {
        "reference_vs_blender": ("reference", "blender"),
        "reference_vs_game": ("reference", "game"),
        "blender_vs_game": ("blender", "game"),
    }
    report = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "inputs": {k: os.path.relpath(p, ROOT) for k, p in paths.items()},
        "strip": os.path.relpath(args.strip, ROOT),
        "strip_size": list(strip_size),
        "method": {
            "metric_size": list(prepared["reference"]["size"]),
            "ssim": f"luma, {WINDOW}x{WINDOW} non-overlapping windows, mean",
            "delta_e": "CIE76 in CIELAB (sRGB, D65), mean per pixel",
            "grid": "3x3: rows top/mid/bottom, columns left/centre/right",
            "note": "Support signal only; the judged rubric (docs/art-direction/a01-rubric.md) decides.",
        },
        "pairs": {name: compare(prepared[a], prepared[b]) for name, (a, b) in pairs.items()},
    }
    os.makedirs(os.path.dirname(args.metrics), exist_ok=True)
    with open(args.metrics, "w") as fh:
        json.dump(report, fh, indent=2)
        fh.write("\n")
    for name, res in report["pairs"].items():
        print(f"{name:22s} whole ssim={res['whole']['ssim']:.3f} dE={res['whole']['delta_e']:.1f}")
    print("STRIP", args.strip)
    print("METRICS", args.metrics)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (FileNotFoundError, OSError) as err:
        print(f"compare_a01: {err}", file=sys.stderr)
        sys.exit(1)
