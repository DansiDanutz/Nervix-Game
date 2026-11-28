"""K2 house kit: mesh-building helpers (bmesh), box-projected UVs and boolean cutting.

A Part accumulates primitives into one bmesh with per-face material slots, then becomes one mesh
object. Everything is created from scratch on each build, so rebuilding is idempotent.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector


def _mat(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    m = Matrix.Translation(Vector(loc))
    m = m @ Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y") @ Matrix.Rotation(rot[0], 4, "X")
    return m @ Matrix.Diagonal((*scale, 1.0))


class Part:
    def __init__(self, name, materials):
        self.name = name
        self.materials = materials      # key -> bpy material
        self.slots = []                 # ordered material keys
        self.bm = bmesh.new()

    def _slot(self, key):
        if key not in self.slots:
            self.slots.append(key)
        return self.slots.index(key)

    def _tag(self, verts, key):
        idx = self._slot(key)
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = idx
            f.smooth = False
        return faces

    def box(self, center, size, key, rot=(0, 0, 0)):
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=_mat(center, rot, size))
        return self._tag(r["verts"], key)

    def box_minmax(self, lo, hi, key):
        c = [(a + b) / 2 for a, b in zip(lo, hi)]
        s = [max(1e-4, b - a) for a, b in zip(lo, hi)]
        return self.box(c, s, key)

    def cyl(self, center, radius, depth, key, segments=12, rot=(0, 0, 0), radius2=None, smooth=False):
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segments,
                                  radius1=radius, radius2=radius if radius2 is None else radius2,
                                  depth=depth, matrix=_mat(center, rot))
        faces = self._tag(r["verts"], key)
        if smooth:
            for f in faces:
                f.smooth = True
        return faces

    def sphere(self, center, radius, key, segs=10, rings=6, scale=(1, 1, 1)):
        r = bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=rings, radius=radius,
                                      matrix=_mat(center, (0, 0, 0), scale))
        faces = self._tag(r["verts"], key)
        for f in faces:
            f.smooth = True
        return faces

    def poly_prism(self, outline, depth, key, matrix):
        """Extrude a 2D outline (x, z in the local plane) by depth along local -y, then transform."""
        n = len(outline)
        front = [self.bm.verts.new(matrix @ Vector((x, 0.0, z))) for x, z in outline]
        back = [self.bm.verts.new(matrix @ Vector((x, depth, z))) for x, z in outline]
        faces = [self.bm.faces.new(list(reversed(front))), self.bm.faces.new(back)]
        for i in range(n):
            j = (i + 1) % n
            faces.append(self.bm.faces.new((front[i], front[j], back[j], back[i])))
        idx = self._slot(key)
        for f in faces:
            f.material_index = idx
        return faces

    def arch_ring(self, cx, z_spring, y_front, width, thick, depth, key, rise=None, segs=10, voussoirs=True):
        """Arch of stone blocks (voussoirs) over an opening of 'width' whose arc starts at z_spring.
        rise=None gives a semicircle; a smaller rise gives a flatter segmental arch."""
        (ox, oz), radius, a_lo, a_hi = arch_geometry(cx, z_spring, width, rise)
        for i in range(segs):
            a0 = a_hi - (a_hi - a_lo) * i / segs
            a1 = a_hi - (a_hi - a_lo) * (i + 1) / segs
            pts = [(ox + math.cos(a) * radius, oz + math.sin(a) * radius) for a in (a0, a1)]
            pts += [(ox + math.cos(a) * (radius + thick), oz + math.sin(a) * (radius + thick)) for a in (a1, a0)]
            if voussoirs:
                mx = sum(p[0] for p in pts) / 4
                mz = sum(p[1] for p in pts) / 4
                pts = [(mx + (x - mx) * 0.96, mz + (z - mz) * 0.96) for x, z in pts]
            self.poly_prism(pts, depth, key, Matrix.Translation((0, y_front, 0)))

    def half_barrel(self, origin, axis_u, axis_v, normal, radius, length, key, segs=5):
        """Half cylinder lying on a plane: across axis_u, along axis_v, bulging along normal."""
        rings = []
        for t in (0.0, length):
            ring = []
            for i in range(segs + 1):
                a = math.pi * i / segs
                p = origin + axis_v * t + axis_u * (math.cos(a) * radius) + normal * (math.sin(a) * radius * 0.9)
                ring.append(self.bm.verts.new(p))
            rings.append(ring)
        idx = self._slot(key)
        out = []
        for i in range(segs):
            out.append(self.bm.faces.new((rings[0][i], rings[0][i + 1], rings[1][i + 1], rings[1][i])))
        out.append(self.bm.faces.new(list(reversed(rings[0]))))
        out.append(self.bm.faces.new(rings[1]))
        for f in out:
            f.material_index = idx
            f.smooth = True
        return out

    def rod(self, a, b, radius, key, segments=8):
        a, b = Vector(a), Vector(b)
        d = b - a
        rot = d.normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segments, radius1=radius,
                                  radius2=radius, depth=d.length, matrix=Matrix.Translation((a + b) / 2) @ rot)
        faces = self._tag(r["verts"], key)
        for f in faces:
            f.smooth = True
        return faces

    def beam(self, a, b, width, height, key, up=(0, 0, 1)):
        """Box from point a to point b with a cross-section width x height (height along 'up')."""
        a, b = Vector(a), Vector(b)
        x = (b - a).normalized()
        z = Vector(up)
        y = z.cross(x).normalized()
        z = x.cross(y)
        rot = Matrix((x, y, z)).transposed().to_4x4()
        m = Matrix.Translation((a + b) / 2) @ rot @ Matrix.Diagonal(((b - a).length, width, height, 1.0))
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        return self._tag(r["verts"], key)

    def slab(self, corners, thickness, normal, key):
        """Planar polygon (3D corners, CCW seen from 'normal') thickened by 'thickness' against the normal."""
        n = Vector(normal).normalized()
        top = [self.bm.verts.new(Vector(c)) for c in corners]
        bot = [self.bm.verts.new(Vector(c) - n * thickness) for c in corners]
        faces = [self.bm.faces.new(top), self.bm.faces.new(list(reversed(bot)))]
        k = len(corners)
        for i in range(k):
            j = (i + 1) % k
            faces.append(self.bm.faces.new((top[j], top[i], bot[i], bot[j])))
        idx = self._slot(key)
        for f in faces:
            f.material_index = idx
        return faces

    @classmethod
    def reopen(cls, obj, materials):
        """Continue building on an existing mesh object (e.g. after boolean cuts)."""
        p = cls(obj.name, materials)
        rev = {m.name: k for k, m in materials.items() if m}
        keys = [rev[m.name] if m else None for m in obj.data.materials]
        default = next(k for k in keys if k)          # faces made by a cutter take the wall material
        p.bm.from_mesh(obj.data)
        for f in p.bm.faces:
            key = keys[f.material_index] if f.material_index < len(keys) else None
            f.material_index = p._slot(key or default)
        return p

    def write(self, obj, uv_scale=None):
        me = obj.data
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        self.bm.to_mesh(me)
        self.bm.free()
        me.materials.clear()
        for key in self.slots:
            me.materials.append(self.materials[key])
        for layer in list(me.uv_layers):
            me.uv_layers.remove(layer)
        box_uv(obj, uv_scale or {})
        return obj

    def finish(self, parent, collection, uv_scale=None):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        self.bm.to_mesh(me)
        self.bm.free()
        for key in self.slots:
            me.materials.append(self.materials[key])
        obj = bpy.data.objects.new(self.name, me)
        collection.objects.link(obj)
        obj.parent = parent
        box_uv(obj, uv_scale or {})
        return obj


def box_uv(obj, uv_scale):
    """World-ish box projection: each face projects on its dominant axis, scaled per material."""
    me = obj.data
    if not me.polygons:
        return
    uv = me.uv_layers.new(name="UVMap")
    mats = [m.get("uv_scale", 1.0) if m else 1.0 for m in me.materials]
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        s = uv_scale.get(poly.material_index, mats[poly.material_index] if mats else 1.0)
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                u, v = co.y, co.z
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            uv.data[li].uv = (u / s, v / s)


def cut(obj, cutters, collection):
    """Apply EXACT boolean differences of each cutter Part/obj to obj, without bpy.ops."""
    temps = []
    for i, c in enumerate(cutters):
        me = bpy.data.meshes.new(f"{obj.name}_cut{i}")
        bmesh.ops.recalc_face_normals(c.bm, faces=c.bm.faces[:])
        c.bm.to_mesh(me)
        c.bm.free()
        t = bpy.data.objects.new(me.name, me)
        collection.objects.link(t)
        t.parent = obj.parent
        t.matrix_local = obj.matrix_local.copy()
        temps.append(t)
        mod = obj.modifiers.new(f"cut{i}", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.object = t
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    new_me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.clear()
    obj.data = new_me
    new_me.name = old.name
    bpy.data.meshes.remove(old)
    for t in temps:
        m = t.data
        bpy.data.objects.remove(t)
        bpy.data.meshes.remove(m)
    return obj


def arch_geometry(cx, z_spring, width, rise=None):
    """Circle centre, radius and angle range (radians, a_lo..a_hi) of an arch springing at z_spring."""
    c = width / 2
    if rise is None or rise >= c:
        return (cx, z_spring), c, 0.0, math.pi
    radius = (c * c + rise * rise) / (2 * rise)
    oz = z_spring + rise - radius
    half = math.asin(c / radius)
    return (cx, oz), radius, math.pi / 2 - half, math.pi / 2 + half


def arch_outline(cx, z0, width, height, rise=None, segs=16):
    """Closed 2D outline (x, z): rectangle from z0 topped by an arch; total height 'height'."""
    r = width / 2 if rise is None else min(rise, width / 2)
    spring = z0 + height - r
    (ox, oz), radius, a_lo, a_hi = arch_geometry(cx, spring, width, rise)
    pts = [(cx - width / 2, z0), (cx + width / 2, z0)]
    pts += [(ox + math.cos(a_lo + (a_hi - a_lo) * i / segs) * radius,
             oz + math.sin(a_lo + (a_hi - a_lo) * i / segs) * radius) for i in range(segs + 1)]
    return pts, spring


def cutter_arch(name, cx, z0, width, height, y0, y1, rise=None, segs=16):
    """Closed cutter volume for an arched opening, from y0 to y1."""
    p = Part(name, {"x": None})
    pts, _ = arch_outline(cx, z0, width, height, rise, segs)
    p.poly_prism(pts, y1 - y0, "x", Matrix.Translation((0, y0, 0)))
    return p


def empty(name, loc, parent, collection, props=None, display="PLAIN_AXES", size=0.25):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = display
    e.empty_display_size = size
    e.location = loc
    collection.objects.link(e)
    e.parent = parent
    for k, v in (props or {}).items():
        e[k] = v
    return e
