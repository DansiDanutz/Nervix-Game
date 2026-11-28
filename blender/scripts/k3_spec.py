"""K3 product display kit: pure data spec (no bpy), shared by the Blender builders and the tests.

Frames
  Blender is Z-up. A display set's origin is the floor centre of its fixture, and its front
  faces Blender -Y. Runtime (glTF, y-up) is (x, z, -y), so the front faces runtime +Z.
  Product meshes have their origin at the centre of their base; fixtures at floor centre.

Identity
  Nothing here names a merchant. Labels come from shared/contracts/product-categories.json,
  and price tags are blank surfaces that the runtime paints.
"""

import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONTRACT = os.path.join(ROOT, "shared", "contracts", "product-categories.json")
KIT_BLEND = os.path.join(ROOT, "blender", "scenes", "nervix_product_kit_01.blend")
TEXTURE_DIR = os.path.join(ROOT, "blender", "textures", "k3")
KIT_DIR = os.path.join(ROOT, "app", "public", "kits", "k3")
EVIDENCE_DIR = os.path.join(ROOT, "docs", "evidence", "kits")
GLB_NAME = "product_kit.glb"

KIT_ID = "k3-product-display"
KIT_COLLECTION = "k3_product_kit"
RENDER_COLLECTION = "k3_render"

# Assumed K2 display slot (width x, depth y, height z) in metres; reconcile with house_kit.json.
SLOT_ENVELOPE = (1.0, 0.7, 2.0)
LAYOUT_SPACING = 1.5
TAG_GAP = 0.002

FALLBACK_ID = "generic"
FALLBACK_FIXTURE = "plinth"

# 4 x 4 swatch atlas. Hex values are sRGB, sampled from A01/A04/A05/A06.
PALETTE = (
    {"name": "sandstone", "hex": "#E0BC84", "rough": 0.82, "metal": 0.0},
    {"name": "sandstone_dark", "hex": "#B98E5A", "rough": 0.85, "metal": 0.0},
    {"name": "cream", "hex": "#F1E2C4", "rough": 0.7, "metal": 0.0},
    {"name": "terracotta", "hex": "#C0583A", "rough": 0.75, "metal": 0.0},
    {"name": "teal", "hex": "#2F7F7A", "rough": 0.6, "metal": 0.0},
    {"name": "teal_dark", "hex": "#215E5B", "rough": 0.65, "metal": 0.0},
    {"name": "wine", "hex": "#7A2440", "rough": 0.7, "metal": 0.0},
    {"name": "wine_light", "hex": "#A33A5A", "rough": 0.7, "metal": 0.0},
    {"name": "brass", "hex": "#C9A04A", "rough": 0.32, "metal": 1.0},
    {"name": "wood", "hex": "#8A4A26", "rough": 0.62, "metal": 0.0},
    {"name": "wood_dark", "hex": "#5C3018", "rough": 0.66, "metal": 0.0},
    {"name": "olive", "hex": "#7C8A3C", "rough": 0.7, "metal": 0.0},
    {"name": "bread", "hex": "#D08A3E", "rough": 0.72, "metal": 0.0},
    {"name": "ceramic", "hex": "#EFE6D6", "rough": 0.35, "metal": 0.0},
    {"name": "lavender", "hex": "#9A7BC0", "rough": 0.7, "metal": 0.0},
    {"name": "charcoal", "hex": "#3A2A22", "rough": 0.8, "metal": 0.0},
)

# size = (w, d, h) footprint; surface = usable top (w, d); product_z = where the product base sits;
# tag = (x, z) of the price-tag anchor on the front face; clear_height = room above product_z.
FIXTURES = {
    "dais": {"size": (0.82, 0.62, 0.62), "surface": (0.76, 0.56), "product_z": 0.1,
             "tag": (0.3, 0.6), "swatches": ("wine", "wine_light", "brass", "sandstone")},
    "rack": {"size": (0.84, 0.58, 0.62), "surface": (0.78, 0.52), "product_z": 0.22,
             "tag": (0.32, 0.6), "swatches": ("wood", "wood_dark", "brass")},
    "plinth": {"size": (0.5, 0.5, 0.92), "surface": (0.44, 0.44), "product_z": 0.92,
               "tag": (0.0, 0.84), "swatches": ("sandstone", "sandstone_dark", "brass", "wine")},
    "vitrine": {"size": (0.52, 0.52, 1.42), "surface": (0.36, 0.36), "product_z": 0.92,
                "clear_height": 0.42, "tag": (0.0, 0.84),
                "swatches": ("sandstone", "sandstone_dark", "brass", "wine")},
    "counter": {"size": (0.98, 0.58, 0.95), "surface": (0.9, 0.5), "product_z": 0.95,
                "tag": (0.3, 0.88), "swatches": ("wood", "wood_dark", "teal", "teal_dark", "brass")},
    "shelf": {"size": (0.94, 0.42, 1.8), "surface": (0.86, 0.36), "product_z": 0.86,
              "clear_height": 0.46, "tag": (0.0, 0.83),
              "swatches": ("wood", "wood_dark", "teal", "brass", "terracotta", "ceramic")},
}

# Contract display kind -> fixture.
DISPLAY_FIXTURE = {
    "chair": "dais",
    "crate": "rack",
    "plinth": "vitrine",
    "counter": "counter",
    "shelf": "shelf",
    "sign": "plinth",
}

PRODUCTS = {
    "seat": {"size": (0.56, 0.54, 0.86), "swatches": ("wood", "wood_dark", "teal", "brass")},
    "bundle": {"size": (0.6, 0.44, 0.44), "swatches": ("wood", "wood_dark", "wine", "brass", "cream")},
    "digital": {"size": (0.22, 0.22, 0.34), "swatches": ("brass", "wine")},
    "drink": {"size": (0.48, 0.28, 0.34), "swatches": ("brass", "ceramic", "teal", "wood")},
    "food": {"size": (0.52, 0.34, 0.2), "swatches": ("wood", "bread", "ceramic", "olive")},
    "merch": {"size": (0.72, 0.3, 0.38), "swatches": ("teal", "wine", "cream", "terracotta", "ceramic")},
    "service": {"size": (0.38, 0.28, 0.42), "swatches": ("brass", "wine", "wood", "cream")},
    FALLBACK_ID: {"size": (0.32, 0.32, 0.3), "swatches": ("cream", "brass", "wine_light")},
}

PRICE_TAG = {"name": "asset.fixture.price_tag", "size": (0.13, 0.012, 0.08),
             "swatches": ("brass", "cream")}


def product_name(cid):
    return f"asset.product.{cid}"


def fixture_name(fid):
    return f"asset.fixture.{fid}"


def display_name(cid):
    return f"display.{cid}"


def price_tag_anchor_name(cid):
    return f"anchor.price_tag.{cid}"


def to_runtime(v):
    """Blender (x, y, z) -> runtime (x, z, -y), rounded, with no negative zeros."""
    x, y, z = v
    return [round(c, 4) + 0.0 for c in (x, z, -y)]


def load_categories(path=CONTRACT):
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return [dict(c) for c in data["categories"]]


def used_swatches():
    groups = [f["swatches"] for f in FIXTURES.values()] + [p["swatches"] for p in PRODUCTS.values()]
    return sorted({s for g in groups + [PRICE_TAG["swatches"]] for s in g})


def _display(cid, fid, label, kind, index):
    fx = FIXTURES[fid]
    tag_x, tag_z = fx["tag"]
    return {
        "category": cid,
        "label": label,
        "display_kind": kind,
        "fixture": fid,
        "position": (index * LAYOUT_SPACING, 0.0, 0.0),
        "product_offset": (0.0, 0.0, fx["product_z"]),
        "price_tag_anchor": (tag_x, -fx["size"][1] / 2 - TAG_GAP, tag_z),
    }


def build_display_sets(categories=None):
    """One display per contract category (contract order), then the generic fallback."""
    cats = categories if categories is not None else load_categories()
    sets = [_display(c["id"], DISPLAY_FIXTURE[c["display"]], c["label"], c["display"], i)
            for i, c in enumerate(cats)]
    sets.append(_display(FALLBACK_ID, FALLBACK_FIXTURE, "Generic item", "fallback", len(cats)))
    return sets


def _manifest_entry(d):
    return {
        "id": d["category"],
        "label": d["label"],
        "display_kind": d["display_kind"],
        "display": display_name(d["category"]),
        "product": product_name(d["category"]),
        "fixture": fixture_name(d["fixture"]),
        "product_offset": to_runtime(d["product_offset"]),
        "product_size_m": list(PRODUCTS[d["category"]]["size"]),
        "price_tag_anchor": {
            "node": price_tag_anchor_name(d["category"]),
            "runtime_offset": to_runtime(d["price_tag_anchor"]),
        },
        "layout_position": to_runtime(d["position"]),
    }


def build_manifest(glb_name=GLB_NAME, categories=None):
    sets = build_display_sets(categories)
    entries = [_manifest_entry(d) for d in sets]
    sw, sd, sh = SLOT_ENVELOPE
    return {
        "kit": KIT_ID,
        "version": 1,
        "generator": "blender/scripts/k3_build_product_kit.py",
        "glb": glb_name,
        "units": "m",
        "axes": {"blender_to_runtime": "(x, y, z) -> (x, z, -y)", "front": "runtime +z",
                 "product_origin": "base centre", "fixture_origin": "floor centre"},
        "slot_envelope_m": [sw, sd, sh],
        "slot_note": "Assumed K2 display slot (width, depth, height). Reconcile with house_kit.json.",
        "identity": "generic; no names, text or logos. Labels and prices are painted at runtime.",
        "price_tag": {"mesh": PRICE_TAG["name"], "size_m": list(PRICE_TAG["size"]),
                      "faces": "runtime +z", "origin": "back centre"},
        "fixtures": [{"id": fid, "mesh": fixture_name(fid), "size_m": list(fx["size"]),
                      "product_offset": to_runtime((0.0, 0.0, fx["product_z"]))}
                     for fid, fx in sorted(FIXTURES.items())],
        "categories": entries[:-1],
        "fallback": entries[-1],
    }
