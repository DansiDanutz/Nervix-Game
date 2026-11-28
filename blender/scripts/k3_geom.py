"""K3 geometry helpers: build one mesh from many bevelled parts, each mapped to a palette swatch.

Every part's UVs point at the centre of one swatch in a 4 x 4 atlas, so a whole product is one
primitive with one material (instancing-ready). Glass and glow use their own material slots.
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

import k3_spec as spec

ATLAS_PX = 256
ATLAS_GRID = 4
SLOT_PALETTE, SLOT_GLASS, SLOT_GLOW = 0, 1, 2
MATERIAL_NAMES = ("mat.k3_palette", "mat.k3_glass", "mat.k3_glow")
SWATCH_INDEX = {s["name"]: i for i, s in enumerate(spec.PALETTE)}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(hex_str):
    h = hex_str.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def swatch_uv(name):
    i = SWATCH_INDEX[name]
    col, row = i % ATLAS_GRID, i // ATLAS_GRID
    return ((col + 0.5) / ATLAS_GRID, (row + 0.5) / ATLAS_GRID)


def _atlas_pixels(value_fn):
    cell = ATLAS_PX // ATLAS_GRID
    flat = []
    for y in range(ATLAS_PX):
        for x in range(ATLAS_PX):
            i = (y // cell) * ATLAS_GRID + (x // cell)
            flat.extend(value_fn(spec.PALETTE[i]))
    return flat


def _save_image(name, value_fn, non_color):
    os.makedirs(spec.TEXTURE_DIR, exist_ok=True)
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name, ATLAS_PX, ATLAS_PX, alpha=False)
    img.pixels.foreach_set(_atlas_pixels(value_fn))
    img.filepath_raw = os.path.join(spec.TEXTURE_DIR, name)
    img.file_format = "PNG"
    img.save()
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    img.pack()
    return img


def _fresh_material(name):
    old = bpy.data.materials.get(name)
    if old:
        bpy.data.materials.remove(old)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    return mat, mat.node_tree.nodes["Principled BSDF"]


def build_materials():
    """Palette atlas (base colour + ORM), glass and glow. Returns the three materials."""
    base = _save_image("k3_palette_base.png", lambda s: (*hex_rgb(s["hex"]), 1.0), False)
    orm = _save_image("k3_palette_orm.png", lambda s: (1.0, s["rough"], s["metal"], 1.0), True)
    pal, bsdf = _fresh_material(MATERIAL_NAMES[0])
    nodes, links = pal.node_tree.nodes, pal.node_tree.links
    tex = nodes.new("ShaderNodeTexImage")
    tex.image, tex.interpolation = base, "Closest"
    tex_orm = nodes.new("ShaderNodeTexImage")
    tex_orm.image, tex_orm.interpolation = orm, "Closest"
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex_orm.outputs["Color"], sep.inputs["Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

    glass, gb = _fresh_material(MATERIAL_NAMES[1])
    gb.inputs["Base Color"].default_value = (0.92, 0.95, 0.94, 1.0)
    gb.inputs["Roughness"].default_value = 0.05
    gb.inputs["Alpha"].default_value = 0.22
    if hasattr(glass, "surface_render_method"):
        glass.surface_render_method = "BLENDED"
    if hasattr(glass, "blend_method"):
        glass.blend_method = "BLEND"

    glow, wb = _fresh_material(MATERIAL_NAMES[2])
    teal = tuple(srgb_to_linear(c) for c in hex_rgb("#5FD3C4"))
    wb.inputs["Base Color"].default_value = (*teal, 1.0)
    wb.inputs["Emission Color"].default_value = (*teal, 1.0)
    wb.inputs["Emission Strength"].default_value = 2.5
    wb.inputs["Roughness"].default_value = 0.2
    return pal, glass, glow


class MeshBuilder:
    """Accumulates parts into one bmesh. Units: metres, Blender Z-up."""

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.verify()
        self.slots_used = {SLOT_PALETTE}

    def _finish(self, before, swatch, bevel, smooth, slot):
        faces = [f for f in self.bm.faces if f not in before]
        if bevel > 0:
            self.bm.edges.index_update()  # deterministic order, so rebuilds are byte-identical
            edges = sorted({e for f in faces for e in f.edges}, key=lambda e: e.index)
            bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=2, affect="EDGES",
                            profile=0.5, clamp_overlap=True)
            faces = [f for f in self.bm.faces if f not in before]
        u, v = swatch_uv(swatch) if swatch else (0.5, 0.5)
        for f in faces:
            f.material_index = slot
            f.smooth = smooth
            for loop in f.loops:
                loop[self.uv].uv = (u, v)
        self.slots_used.add(slot)
        return faces

    def box(self, size, loc, swatch, bevel=0.006, rot=None, slot=SLOT_PALETTE):
        before = set(self.bm.faces)
        m = Matrix.Translation(loc) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*size, 1.0))
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        return self._finish(before, swatch, min(bevel, min(size) * 0.45), False, slot)

    def cyl(self, r, depth, loc, swatch, segs=20, r_top=None, bevel=0.0, rot=None, slot=SLOT_PALETTE):
        before = set(self.bm.faces)
        m = Matrix.Translation(loc) @ (rot or Matrix.Identity(4))
        bmesh.ops.create_cone(self.bm, cap_ends=True, segments=segs, radius1=r,
                              radius2=r if r_top is None else r_top, depth=depth, matrix=m)
        return self._finish(before, swatch, bevel, True, slot)

    def sphere(self, r, loc, swatch, scale=(1, 1, 1), segs=16, rings=10, slot=SLOT_PALETTE):
        before = set(self.bm.faces)
        m = Matrix.Translation(loc) @ Matrix.Diagonal((*scale, 1.0))
        bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=rings, radius=r, matrix=m)
        return self._finish(before, swatch, 0.0, True, slot)

    def ico(self, r, loc, swatch, scale=(1, 1, 1), subdiv=1, slot=SLOT_PALETTE):
        before = set(self.bm.faces)
        m = Matrix.Translation(loc) @ Matrix.Diagonal((*scale, 1.0))
        bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=r, matrix=m)
        return self._finish(before, swatch, 0.0, False, slot)

    def lathe(self, profile, loc, swatch, segs=24, slot=SLOT_PALETTE, cap=True):
        """profile: [(radius, z), ...] bottom to top; revolved about local Z."""
        before = set(self.bm.faces)
        ox, oy, oz = loc
        rings = []
        for r, z in profile:
            ring = [self.bm.verts.new((ox + r * math.cos(2 * math.pi * k / segs),
                                       oy + r * math.sin(2 * math.pi * k / segs), oz + z))
                    for k in range(segs)]
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for k in range(segs):
                k2 = (k + 1) % segs
                self.bm.faces.new((a[k], a[k2], b[k2], b[k]))
        if cap:
            self.bm.faces.new(list(reversed(rings[0])))
            self.bm.faces.new(rings[-1])
        return self._finish(before, swatch, 0.0, True, slot)

    def torus(self, r_major, r_minor, loc, swatch, segs=24, ring_segs=8, slot=SLOT_PALETTE):
        before = set(self.bm.faces)
        ox, oy, oz = loc
        grid = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            row = []
            for j in range(ring_segs):
                b = 2 * math.pi * j / ring_segs
                rr = r_major + r_minor * math.cos(b)
                row.append(self.bm.verts.new((ox + rr * math.cos(a), oy + rr * math.sin(a),
                                              oz + r_minor * math.sin(b))))
            grid.append(row)
        for i in range(segs):
            for j in range(ring_segs):
                i2, j2 = (i + 1) % segs, (j + 1) % ring_segs
                self.bm.faces.new((grid[i][j], grid[i2][j], grid[i2][j2], grid[i][j2]))
        return self._finish(before, swatch, 0.0, True, slot)

    def to_object(self, name, collection, materials):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts[:], dist=1e-5)
        old_mesh = bpy.data.meshes.get(name)
        if old_mesh:
            bpy.data.meshes.remove(old_mesh)
        mesh = bpy.data.meshes.new(name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        used = sorted(self.slots_used)
        remap = {slot: i for i, slot in enumerate(used)}
        for slot in used:
            mesh.materials.append(materials[slot])
        for poly in mesh.polygons:
            poly.material_index = remap[poly.material_index]
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        return obj


def rot_x(deg):
    return Matrix.Rotation(math.radians(deg), 4, "X")


def rot_y(deg):
    return Matrix.Rotation(math.radians(deg), 4, "Y")


def v(x, y, z):
    return Vector((x, y, z))
