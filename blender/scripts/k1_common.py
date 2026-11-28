"""K1 character kit: shared constants, material slots, parts and appearance presets.

The kit is generic and identity-free: no merchant or player names live here. Presets are
appearance only. The two presets in shared/contracts/avatar-presets.json are reused verbatim
(their six palette keys); the kit adds the `leather` and `accent` slots and four more presets
drawn from the A13 / A14 / A15 character sheets and the A01 plaza robes.

Coordinates: Blender Z-up, the figure faces Blender -Y (runtime +Z after the glTF Y-up export).
"""

import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCENE_DIR = os.path.join(ROOT, "blender", "scenes")
DISTRICT_BLEND = os.path.join(SCENE_DIR, "nervix_city_district_01.blend")
DISTRICT_SHA256 = "420ebb0e788e47900f4a3b3d6163b15746ef1ce3deaad1d26e5cca5d8fd89676"
K1_BLEND = os.path.join(SCENE_DIR, "nervix_characters_01.blend")
CONTRACT = os.path.join(ROOT, "shared", "contracts", "avatar-presets.json")
KIT_DIR = os.path.join(ROOT, "app", "public", "kits", "k1")
GLB_NAME = "k1_pedestrian.glb"
EVIDENCE_DIR = os.path.join(ROOT, "docs", "evidence", "kits")
REFERENCE_DIR = os.path.join(ROOT, "assets", "references")

COLLECTION = "K1_CHARACTER"
RIG = "k1_rig"
HEIGHT = 1.8
FPS = 30
MAX_TRIS = 8000
MAX_GLB_BYTES = 5 * 1024 * 1024

# Material slots. Runtime recolours a preset by setting each slot material's base colour.
SLOTS = ("skin", "hair", "eyes", "tunic", "trim", "legs", "leather", "accent")
SLOT_ROUGHNESS = {"skin": 0.55, "hair": 0.8, "eyes": 0.3, "tunic": 0.85, "trim": 0.4,
                  "legs": 0.9, "leather": 0.6, "accent": 0.85}
SLOT_METALLIC = {"trim": 0.45}


def material_name(slot):
    return f"k1_{slot}"


# Parts: (id, category, description). base parts are always shown; a preset picks exactly one
# garment and one hair, plus any accessories.
PARTS = (
    ("body", "base", "head, torso, arms, legs, hands, boots, belt"),
    ("tunic_knee", "garment", "knee-length tunic skirt with trim hem (A14/A15)"),
    ("robe_long", "garment", "ankle-length robe with trim hem (A01 plaza robes, A13 coat)"),
    ("hair_curly", "hair", "short curly crop (A14/A15)"),
    ("hair_bob", "hair", "full curly bob to the jaw (A13)"),
    ("hair_bun", "hair", "smooth cap with a low bun (A01 plaza walker)"),
    ("shawl", "accessory", "draped shoulder shawl with brooch (A15)"),
    ("apron", "accessory", "bib apron with straps (A14)"),
    ("satchel", "accessory", "hip satchel on a cross strap (A13/A15)"),
)


def part_node(part_id):
    return f"k1_{part_id}"


KIT_EXTRAS = {
    # contract preset id -> kit-only slots and parts
    "teal": {"leather": "#6b4128", "accent": "#e8d9b8", "parts": ["tunic_knee", "hair_curly", "satchel"]},
    "terracotta": {"leather": "#5a3420", "accent": "#3f6f6a", "parts": ["tunic_knee", "hair_bob", "shawl"]},
}

KIT_PRESETS = (
    {"id": "burgundy", "label": "Burgundy coat",
     "palette": {"tunic": "#7a2636", "trim": "#c9993f", "legs": "#e6d5b8", "skin": "#d9a27c",
                 "hair": "#3a2219", "eyes": "#2b2118", "leather": "#6b4128", "accent": "#7a2636"},
     "parts": ["robe_long", "hair_bob", "satchel"]},
    {"id": "linen", "label": "Linen and teal apron",
     "palette": {"tunic": "#e6d6b8", "trim": "#c9a96a", "legs": "#b48e62", "skin": "#c98e68",
                 "hair": "#3b2418", "eyes": "#2b2118", "leather": "#6b4128", "accent": "#3e6c68"},
     "parts": ["tunic_knee", "hair_curly", "apron"]},
    {"id": "traveller", "label": "Sand tunic and blue shawl",
     "palette": {"tunic": "#d8c095", "trim": "#8fa3a0", "legs": "#6e5a3e", "skin": "#b97b55",
                 "hair": "#2e1c14", "eyes": "#2b2118", "leather": "#6e4127", "accent": "#4b6f76"},
     "parts": ["tunic_knee", "hair_curly", "shawl", "satchel"]},
    {"id": "sage", "label": "Teal robe",
     "palette": {"tunic": "#3d7f7a", "trim": "#e3cf9e", "legs": "#efe3c8", "skin": "#9a6444",
                 "hair": "#22150f", "eyes": "#1f1813", "leather": "#5a3420", "accent": "#efe3c8"},
     "parts": ["robe_long", "hair_bun"]},
)


def load_contract():
    with open(CONTRACT, encoding="utf8") as fh:
        return json.load(fh)


def presets():
    """Contract presets first (palette values verbatim), then the kit presets."""
    out = []
    for cp in load_contract()["presets"]:
        extra = KIT_EXTRAS.get(cp["id"], {"leather": "#6b4128", "accent": "#e8d9b8",
                                          "parts": ["tunic_knee", "hair_curly"]})
        palette = {**cp["palette"], "leather": extra["leather"], "accent": extra["accent"]}
        out.append({"id": cp["id"], "label": cp["label"], "source": "contract",
                    "palette": palette, "parts": list(extra["parts"])})
    out.extend({**p, "source": "kit", "parts": list(p["parts"])} for p in KIT_PRESETS)
    return out


def hex_to_linear(hex_colour):
    """sRGB hex -> linear RGBA for Blender material colours."""
    def channel(v):
        c = int(v, 16) / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    h = hex_colour.lstrip("#")
    return (channel(h[0:2]), channel(h[2:4]), channel(h[4:6]), 1.0)
