"""Fidelity round 1 materials: cobble PBR sets, alpha-clipped foliage cards, cloth, clouds,
polished gold. Called from arrival_materials.build_materials() and merged into its dict.

Alpha cards use Texture Alpha -> Math ROUND -> BSDF Alpha, which the glTF exporter writes as
alphaMode MASK (cutoff 0.5), double sided.
"""

import bpy

from arrival_materials import _flat, _image_material, _n
from arrival_tex_r2 import make_barrel_tiles, make_leaf_card, make_sandstone
from arrival_textures import make_card, make_cobbles, make_fabric
from openpoker_common import srgb

# Fidelity r2: warmer sand-to-rose setts (A01 reads darker and richer than r1's pale cream).
COBBLE_WARM = ["#D6A27F", "#E0B48C", "#C88E72", "#D4987F", "#E4BC96", "#BE8468", "#D8A888", "#B57E68",
               "#DDAA94", "#C9967A"]
COBBLE_PLUM = ["#7A2846", "#8C3553", "#69203C", "#933E5A", "#7E2E4E"]
COBBLE_CREAM = ["#EBD3AE", "#E2C59C", "#EFD9B8", "#DCBC92", "#E8CFA6"]


def _card_material(name, path):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type not in {"BSDF_PRINCIPLED", "OUTPUT_MATERIAL"}:
            nt.nodes.remove(n)
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Roughness"].default_value = 0.7
    b.inputs["Specular IOR Level"].default_value = 0.25
    img = bpy.data.images.load(path, check_existing=True)
    img.reload()
    img.alpha_mode = "STRAIGHT"
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Linear"
    rnd = nt.nodes.new("ShaderNodeMath")
    rnd.operation = "ROUND"
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], rnd.inputs[0])
    nt.links.new(rnd.outputs["Value"], b.inputs["Alpha"])
    m.use_backface_culling = False
    try:
        m.surface_render_method = "DITHERED"
    except AttributeError:
        pass
    m["uv_scale"] = 1.0
    return m


def _cloud(name, hex_c, emit_hex, strength):
    m = _flat(name, hex_c, 1.0, emit=strength, emit_hex=emit_hex)
    m.node_tree.nodes.get("Principled BSDF").inputs["Specular IOR Level"].default_value = 0.0
    return m


def _water(name):
    """Clear teal water: transmissive, low roughness, faint teal emission so it holds at grazing
    angles; a procedural ripple bump for the Blender render (the client animates its own normals)."""
    m = _flat(name, "#2F9AA6", 0.04, emit=0.25, emit_hex="#2A9FB0")
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Transmission Weight"].default_value = 0.85
    b.inputs["IOR"].default_value = 1.33
    b.inputs["Specular IOR Level"].default_value = 0.5
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.15
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def _glazed(name, hex_c, rough=0.22):
    """Glazed ceramic: a glossy clear coat over the body colour (glTF KHR_materials_clearcoat)."""
    m = _flat(name, hex_c, rough)
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Specular IOR Level"].default_value = 0.6
    if "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = 1.0
        b.inputs["Coat Roughness"].default_value = 0.06
    return m


def build_fid_materials():
    # r2: stones about 0.6x r1's size (cells up), darker recessed grout.
    warm = make_cobbles("ar_cobble_warm.png", COBBLE_WARM, "#6A5040", 13, cells=26, grout=0.085)
    plum = make_cobbles("ar_cobble_plum.png", COBBLE_PLUM, "#2C0C18", 31, cells=22, grout=0.08)
    cream = make_cobbles("ar_cobble_cream.png", COBBLE_CREAM, "#8A6E52", 41, cells=16, grout=0.07)
    olive_card = make_leaf_card("ar_card_olive.png", "olive", 5)
    lavender_card = make_leaf_card("ar_card_lavender.png", "lavender", 6)
    roof = make_barrel_tiles()
    bloom = make_card("ar_card_bloom.png", "bloom", 3)
    vine = make_card("ar_card_vine.png", "vine", 4)
    fabric = make_fabric()
    rubble = make_sandstone()
    out = {
        "ashlar": _image_material("ar_ashlar", rubble, 0.9, 3.2, normal=_n(rubble), normal_strength=1.0),
        "ashlar_shade": _image_material("ar_ashlar_shade", rubble, 0.9, 3.2, tint="#B8A49A", normal=_n(rubble),
                                        normal_strength=1.0),
        "cobble": _image_material("ar_cobble", warm, 0.88, 3.0, normal=_n(warm), normal_strength=1.0),
        "plum_band": _image_material("ar_plum_band", plum, 0.8, 2.4, normal=_n(plum), normal_strength=1.0),
        "pale_band": _image_material("ar_pale_band", cream, 0.82, 2.6, normal=_n(cream), normal_strength=0.9),
        "card_bloom": _card_material("ar_card_bloom", bloom),
        "card_vine": _card_material("ar_card_vine", vine),
        "card_olive": _card_material("ar_card_olive", olive_card),
        "card_lavender": _card_material("ar_card_lavender", lavender_card),
        "roof": _image_material("ar_roof_tiles", roof, 0.62, 2.4, normal=_n(roof), normal_strength=1.0),
        "drape": _image_material("ar_drape_plum", fabric, 0.85, 1.2, tint="#7C2348", normal=_n(fabric)),
        "awning_cloth": _image_material("ar_awning_cloth", fabric, 0.85, 1.0, tint="#3C978C", normal=_n(fabric)),
        "banner_cloth": _image_material("ar_banner_cloth", fabric, 0.85, 0.8, tint="#7A2445", normal=_n(fabric),
                                        normal_strength=0.4),
        "gold": _flat("ar_gold", "#F0C052", 0.18, 1.0),
        "brass": _flat("ar_brass", "#C99A44", 0.26, 1.0),
        "glaze_teal": _glazed("ar_glaze_teal", "#2E8A86"),
        "glaze_cobalt": _glazed("ar_glaze_cobalt", "#2D5296"),
        "clay": _glazed("ar_clay_pot", "#B8683C", rough=0.35),
        "cloud": _cloud("ar_cloud", "#FBE2D2", "#FFD9C2", 1.4),
        "cloud_shade": _cloud("ar_cloud_shade", "#E9B9BE", "#F2B7B4", 1.1),
        "mountain": _flat("ar_mountain", "#9A8AA8", 0.95),
        "mountain_far": _flat("ar_mountain_far", "#B9A9C0", 0.95),
        "skin": _flat("ar_skin", "#D9A47E", 0.6),
        "terrace": _flat("ar_terrace_wall", "#C9A47E", 0.95),
        "pool_floor": _flat("ar_pool_floor", "#2A747C", 0.5),
        "water": _water("ar_water"),
    }
    # Glass in lanterns: brighter, warmer core.
    out["lamp_glass"] = _flat("ar_lamp_glass", "#FFD9A0", 0.2, emit=6.0, emit_hex="#FFB060")
    b = out["gold"].node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*srgb("#F0C052"), 1.0)
    return out
