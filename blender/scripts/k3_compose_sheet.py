"""Compose the K3 contact sheet: line-up, one tile per display, and the A04/A05/A06 references.

  python3 blender/scripts/k3_compose_sheet.py <tile_dir> [iteration-label]

Runs under system Python with Pillow (not inside Blender). Writes docs/evidence/kits/k3-sheet.png.
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import k3_spec as spec  # noqa: E402

COLS = 4
TILE = (480, 570)
LINEUP_H = 420
REF_H = 300
PAD = 16
LABEL_H = 34
BG = (246, 231, 207)
INK = (74, 40, 30)
REFS = ("A04-merchant-house-v2.png", "A05-cafe-v2.png", "A06-casino-v2.png", "A17-casino-salon.png")


def _font(size):
    for path in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc"):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _fit_h(img, h):
    return img.resize((round(img.width * h / img.height), h), Image.LANCZOS)


def compose(tile_dir, label):
    sets = spec.build_display_sets()
    rows = -(-len(sets) // COLS)
    width = COLS * TILE[0] + (COLS + 1) * PAD
    lineup = Image.open(os.path.join(tile_dir, "lineup.png")).convert("RGB")
    lineup = lineup.resize((width - 2 * PAD, round(lineup.height * (width - 2 * PAD) / lineup.width)))
    refs = [_fit_h(Image.open(os.path.join(spec.ROOT, "assets", "references", r)).convert("RGB"), REF_H)
            for r in REFS]
    title_h = 56
    height = (title_h + lineup.height + PAD + rows * (TILE[1] + LABEL_H + PAD)
              + LABEL_H + REF_H + 2 * PAD)
    sheet = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(sheet)
    draw.text((PAD, 14), f"K3 product display kit - {label} (Blender EEVEE, generic, identity-free)",
              fill=INK, font=_font(26))
    y = title_h
    sheet.paste(lineup, (PAD, y))
    y += lineup.height + PAD
    small = _font(20)
    for i, d in enumerate(sets):
        col, row = i % COLS, i // COLS
        x0 = PAD + col * (TILE[0] + PAD)
        y0 = y + row * (TILE[1] + LABEL_H + PAD)
        tile = Image.open(os.path.join(tile_dir, f"{d['category']}.png")).convert("RGB").resize(TILE)
        sheet.paste(tile, (x0, y0))
        text = f"{spec.product_name(d['category'])}  on  {d['fixture']}  ({d['display_kind']})"
        draw.text((x0 + 4, y0 + TILE[1] + 6), text, fill=INK, font=small)
    y += rows * (TILE[1] + LABEL_H + PAD)
    draw.text((PAD, y + 4), "References: A04 merchant house | A05 cafe | A06 casino | A17 salon",
              fill=INK, font=small)
    x = PAD
    for ref in refs:
        if x + ref.width > width - PAD:
            ref = ref.crop((0, 0, width - PAD - x, ref.height))
        sheet.paste(ref, (x, y + LABEL_H))
        x += ref.width + PAD
        if x >= width - PAD:
            break
    os.makedirs(spec.EVIDENCE_DIR, exist_ok=True)
    out = os.path.join(spec.EVIDENCE_DIR, "k3-sheet.png")
    sheet.save(out, optimize=True)
    print(f"K3 SHEET -> {out} ({width}x{height})")


if __name__ == "__main__":
    compose(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "iteration")
