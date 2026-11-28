"""Shared constants and helpers for the OpenPoker casino slice (Blender 4.x/5.x, headless).

Coordinate convention
  Blender is Z-up. glTF export uses export_yup=True, so a Blender point (bx, by, bz)
  becomes runtime (x, y, z) = (bx, bz, -by). Yaw-free runtime forward is -Z, which is
  Blender +Y. Right-hand side in both frames is +X.

Frames
  District frame (D): the Blender world of nervix_city_district_01. The facade GLB is
  authored directly in D. The salon GLB is authored around its own origin (floor centre,
  salon-local). Its placement in D is SALON_PLACE.
"""

import math
import os

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCENE_DIR = os.path.join(ROOT, "blender", "scenes")
DISTRICT_BLEND = os.path.join(SCENE_DIR, "nervix_city_district_01.blend")
SLICE_BLEND = os.path.join(SCENE_DIR, "nervix_city_slice_01.blend")
TEXTURE_DIR = os.path.join(ROOT, "blender", "textures", "openpoker")
EXPORT_DIR = os.path.join(ROOT, "exports", "slice")
APP_SLICE_DIR = os.path.join(ROOT, "app", "public", "slice")
EVIDENCE_DIR = os.path.join(ROOT, "docs", "evidence", "slice")

MANAGED = "NERVIX_MANAGED"
CASINO_OLD = "Casino"
FACADE = "nervix_openpoker_facade"
SALON = "nervix_openpoker_salon"
RENDER = "nervix_openpoker_render"
OWNED = (FACADE, SALON, RENDER)

# District placement. The facade front face sits at D y = 8.5, the old casino front.
FACADE_OFFSET = (0.0, 8.5, 0.0)
# Salon-local origin in D. Salon entrance (local y = -7) lands on the facade door plane
# (D y = 9.7, floor D z = 0.6).
SALON_PLACE = (0.0, 16.7, 0.6)

PI = math.pi
SALON_ENTRANCE_LOCAL = (0.0, -7.0, 0.0)


def srgb(hex_str):
    """'#RRGGBB' -> linear RGB tuple, so Principled base colours read as the sRGB values."""
    h = hex_str.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def hexf(hex_str):
    """'#RRGGBB' -> sRGB floats, for values written into PNG textures (already display-encoded)."""
    h = hex_str.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def runtime_of(p):
    """Blender (x, y, z) -> glTF runtime (x, y, z) used by export_yup=True."""
    return [round(p[0], 4), round(p[2], 4), round(-p[1], 4)]


def in_scene_collections(name):
    return bpy.data.collections.get(name)


def new_material(name, colour, rough=0.8, metal=0.0, emit=0.0, emit_colour=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit > 0.0:
        bsdf.inputs["Emission Color"].default_value = (*(emit_colour or colour), 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit
    return m


def textured_material(name, image_path, rough=0.85, tex_scale=2.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    img = bpy.data.images.load(image_path, check_existing=True)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    m["uv_tex_scale"] = tex_scale
    return m


def set_box_projection_uv(obj):
    """Box-project UVs in world space so tiles line up across objects (metres per repeat)."""
    me = obj.data
    scale = float(obj.data.materials[0].get("uv_tex_scale", 2.0))
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    layer = me.uv_layers.active.data
    mw = obj.matrix_world
    rot = mw.to_3x3()
    for poly in me.polygons:
        n = rot @ poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            w = mw @ me.vertices[me.loops[li].vertex_index].co
            if az >= ax and az >= ay:
                uv = (w.x, w.y)
            elif ay >= ax:
                uv = (w.x, w.z)
            else:
                uv = (w.y, w.z)
            layer[li].uv = (uv[0] / scale, uv[1] / scale)


def resolve_collection(scene_root, name):
    """Find or create the child collection `name` under the managed root."""
    root = bpy.data.collections.get(MANAGED)
    if root is None:
        raise RuntimeError("NERVIX_MANAGED missing from the district copy")
    for child in list(root.children):
        if child.name == name:
            return child
    c = bpy.data.collections.new(name)
    root.children.link(c)
    return c


def clear_owned_collection(coll):
    """Remove only objects (and their meshes) inside one of our own collections."""
    for o in list(coll.objects):
        data = o.data if o.type in {"MESH", "CAMERA", "LIGHT"} else None
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Camera):
                bpy.data.cameras.remove(data)
            elif isinstance(data, bpy.types.Light):
                bpy.data.lights.remove(data)


def vec(*xyz):
    return Vector(xyz)
