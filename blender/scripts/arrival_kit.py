"""Fast bmesh geometry kit for the arrival square (no bpy.ops per primitive).

Geometry is accumulated per named group; finalize() turns each group into one mesh object
(world-space vertices, identity transform) with box-projected or polar UVs per face.
Group names become glTF node names, so the fountain groups start with "fountain".
"""

import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

UV_BOX, UV_POLAR = 0, 1
TAU = 2.0 * math.pi


def _mat(loc, rot=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)):
    return (Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4()
            @ Matrix.Diagonal((*scale, 1.0)))


class Group:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []
        self.uv_layer = self.bm.faces.layers.int.new("uvmode")
        self.props = {}

    def mat_index(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)


class Kit:
    def __init__(self, coll):
        self.coll = coll
        self.groups = {}

    def g(self, name):
        if name not in self.groups:
            self.groups[name] = Group(name)
        return self.groups[name]

    def tag(self, name, **props):
        self.g(name).props.update(props)

    # ---- low level -------------------------------------------------------
    def _faces(self, grp, faces, m, smooth=False, uvmode=UV_BOX):
        mi = grp.mat_index(m)
        for f in faces:
            f.material_index = mi
            f.smooth = smooth
            f[grp.uv_layer] = uvmode

    def poly(self, name, m, pts, smooth=False, uvmode=UV_BOX):
        grp = self.g(name)
        vs = [grp.bm.verts.new(Vector(p)) for p in pts]
        f = grp.bm.faces.new(vs)
        self._faces(grp, [f], m, smooth, uvmode)
        return f

    def _prim(self, name, m, fn, smooth, **kw):
        grp = self.g(name)
        res = fn(grp.bm, **kw)
        faces = {f for v in res["verts"] for f in v.link_faces}
        self._faces(grp, faces, m, smooth)

    # ---- primitives ------------------------------------------------------
    def box(self, name, m, size, loc, rot=(0.0, 0.0, 0.0)):
        self._prim(name, m, bmesh.ops.create_cube, False, size=1.0,
                   matrix=_mat(loc, rot, size))

    def box_mm(self, name, m, x0, x1, y0, y1, z0, z1):
        """Axis-aligned box from min/max corners."""
        self.box(name, m, (x1 - x0, y1 - y0, z1 - z0),
                 ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))

    def cyl(self, name, m, r, h, loc, verts=20, r_top=None, rot=(0.0, 0.0, 0.0), smooth=True):
        """Cylinder/cone standing on loc (loc z = base) unless rot is given (then centred)."""
        centre = (loc[0], loc[1], loc[2] + h / 2.0) if rot == (0.0, 0.0, 0.0) else loc
        self._prim(name, m, bmesh.ops.create_cone, smooth, cap_ends=True, cap_tris=False,
                   segments=verts, radius1=r, radius2=r if r_top is None else r_top, depth=h,
                   matrix=_mat(centre, rot))

    def sphere(self, name, m, r, loc, scale=(1.0, 1.0, 1.0), segs=12, rings=8):
        self._prim(name, m, bmesh.ops.create_uvsphere, True, u_segments=segs, v_segments=rings,
                   radius=r, matrix=_mat(loc, (0, 0, 0), scale))

    def blob(self, name, m, r, loc, scale=(1.0, 1.0, 1.0), subdiv=1):
        """Foliage/flower lump. Smooth-shaded so the GLB shares vertices (flat icospheres triple them)."""
        self._prim(name, m, bmesh.ops.create_icosphere, True, subdivisions=subdiv, radius=r,
                   matrix=_mat(loc, (0, 0, 0), scale))

    def lathe(self, name, m, profile, centre, segs=32, smooth=True, cap=True):
        """Revolve [(r, z), ...] (bottom to top) around the vertical axis at centre (x, y, z0)."""
        grp = self.g(name)
        cx, cy, cz = centre
        rings = []
        for r, z in profile:
            if r <= 1e-4:
                rings.append([grp.bm.verts.new((cx, cy, cz + z))])
                continue
            rings.append([grp.bm.verts.new((cx + r * math.cos(TAU * k / segs),
                                            cy + r * math.sin(TAU * k / segs), cz + z))
                          for k in range(segs)])
        faces = []
        for a, b in zip(rings, rings[1:]):
            for k in range(segs):
                k2 = (k + 1) % segs
                if len(a) == 1 and len(b) == 1:
                    continue
                if len(a) == 1:
                    faces.append(grp.bm.faces.new((a[0], b[k], b[k2])))
                elif len(b) == 1:
                    faces.append(grp.bm.faces.new((a[k], b[0], a[k2])))
                else:
                    faces.append(grp.bm.faces.new((a[k], a[k2], b[k2], b[k])))
        if cap:
            for ring, top in ((rings[0], False), (rings[-1], True)):
                if len(ring) > 2:
                    faces.append(grp.bm.faces.new(ring if top else list(reversed(ring))))
        self._faces(grp, faces, m, smooth)

    def annulus(self, name, m, r_in, r_out, z, segs=96, centre=(0.0, 0.0), uvmode=UV_POLAR, arc=None):
        """Flat ring (top face only) between r_in and r_out at height z; arc=(a0, a1) for a sector."""
        grp = self.g(name)
        cx, cy = centre
        faces = []
        lo, hi = arc or (0.0, TAU)
        for k in range(segs):
            a0, a1 = lo + (hi - lo) * k / segs, lo + (hi - lo) * (k + 1) / segs
            pts = [(r_out, a0), (r_out, a1), (r_in, a1), (r_in, a0)]
            if r_in <= 1e-4:
                pts = pts[:3]
            vs = [grp.bm.verts.new((cx + r * math.cos(a), cy + r * math.sin(a), z)) for r, a in pts]
            faces.append(grp.bm.faces.new(vs))
        self._faces(grp, faces, m, False, uvmode)

    def square_minus_circle(self, name, m, half, r, z, segs=96):
        """Flat paving from a circle of radius r out to the square |x|,|y| <= half."""
        grp = self.g(name)
        faces = []
        for k in range(segs):
            a0, a1 = TAU * k / segs, TAU * (k + 1) / segs
            def sq(a):
                c, s = math.cos(a), math.sin(a)
                t = half / max(abs(c), abs(s))
                return (t * c, t * s, z)
            vs = [grp.bm.verts.new((r * math.cos(a0), r * math.sin(a0), z)), grp.bm.verts.new(sq(a0)),
                  grp.bm.verts.new(sq(a1)), grp.bm.verts.new((r * math.cos(a1), r * math.sin(a1), z))]
            faces.append(grp.bm.faces.new(vs))
        self._faces(grp, faces, m, False, UV_POLAR)

    def prism_x(self, name, m, pts_yz, x0, x1):
        """Extrude a polygon given in (y, z) along x from x0 to x1 (roofs, gables)."""
        grp = self.g(name)
        a = [grp.bm.verts.new((x0, y, z)) for y, z in pts_yz]
        b = [grp.bm.verts.new((x1, y, z)) for y, z in pts_yz]
        faces = [grp.bm.faces.new(list(reversed(a))), grp.bm.faces.new(b)]
        n = len(pts_yz)
        for i in range(n):
            j = (i + 1) % n
            faces.append(grp.bm.faces.new((a[i], a[j], b[j], b[i])))
        bmesh.ops.recalc_face_normals(grp.bm, faces=faces)
        self._faces(grp, faces, m)

    def prism_y(self, name, m, pts_xz, y0, y1):
        grp = self.g(name)
        a = [grp.bm.verts.new((x, y0, z)) for x, z in pts_xz]
        b = [grp.bm.verts.new((x, y1, z)) for x, z in pts_xz]
        faces = [grp.bm.faces.new(list(reversed(a))), grp.bm.faces.new(b)]
        n = len(pts_xz)
        for i in range(n):
            j = (i + 1) % n
            faces.append(grp.bm.faces.new((a[i], a[j], b[j], b[i])))
        bmesh.ops.recalc_face_normals(grp.bm, faces=faces)
        self._faces(grp, faces, m)

    def arch_bay(self, name, m, axis, u0, u1, w, spring, top, plane, thick, z0=0.0, segs=12,
                 soffit=None):
        """One arched bay of a wall: piers either side of an opening of width w.

        axis 'x': the wall runs along x at y = plane (thickness along y).
        axis 'y': the wall runs along y at x = plane. u is the coordinate along the wall.
        """
        uc, r = (u0 + u1) / 2.0, w / 2.0

        def pt(u, z, d):
            return (u, plane + d, z) if axis == "x" else (plane + d, u, z)

        h = thick / 2.0
        # piers
        for a, b in ((u0, uc - r), (uc + r, u1)):
            if b - a > 1e-3:
                if axis == "x":
                    self.box_mm(name, m, a, b, plane - h, plane + h, z0, top)
                else:
                    self.box_mm(name, m, plane - h, plane + h, a, b, z0, top)
        grp = self.g(name)
        faces, sf = [], []
        arc = [(uc - r * math.cos(math.pi * k / segs), spring + r * math.sin(math.pi * k / segs))
               for k in range(segs + 1)]
        along_x = axis == "x"
        for d in (-h, h):
            keep = along_x == (d < 0)
            for (ua, za), (ub, zb) in zip(arc, arc[1:]):
                vs = [grp.bm.verts.new(pt(ua, za, d)), grp.bm.verts.new(pt(ub, zb, d)),
                      grp.bm.verts.new(pt(ub, top, d)), grp.bm.verts.new(pt(ua, top, d))]
                faces.append(grp.bm.faces.new(vs if keep else list(reversed(vs))))
        for (ua, za), (ub, zb) in zip(arc, arc[1:]):
            vs = [grp.bm.verts.new(pt(ua, za, -h)), grp.bm.verts.new(pt(ub, zb, -h)),
                  grp.bm.verts.new(pt(ub, zb, h)), grp.bm.verts.new(pt(ua, za, h))]
            sf.append(grp.bm.faces.new(list(reversed(vs)) if along_x else vs))
        top_f = [grp.bm.verts.new(pt(uc - r, top, -h)), grp.bm.verts.new(pt(uc + r, top, -h)),
                 grp.bm.verts.new(pt(uc + r, top, h)), grp.bm.verts.new(pt(uc - r, top, h))]
        faces.append(grp.bm.faces.new(top_f if along_x else list(reversed(top_f))))
        self._faces(grp, faces, m)
        self._faces(grp, sf, soffit or m)

    def arcade(self, name, m, axis, u0, u1, n, w, spring, top, plane, thick, z0=0.0, soffit=None, segs=12):
        step = (u1 - u0) / n
        for i in range(n):
            self.arch_bay(name, m, axis, u0 + i * step, u0 + (i + 1) * step, w, spring, top, plane,
                          thick, z0, segs=segs, soffit=soffit)

    def grid_surface(self, name, m, x0, x1, y0, y1, nx, ny, height_fn, smooth=True):
        grp = self.g(name)
        rows = []
        for j in range(ny + 1):
            y = y0 + (y1 - y0) * j / ny
            rows.append([grp.bm.verts.new((x0 + (x1 - x0) * i / nx, y,
                                           height_fn(x0 + (x1 - x0) * i / nx, y)))
                         for i in range(nx + 1)])
        faces = []
        for j in range(ny):
            for i in range(nx):
                faces.append(grp.bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1],
                                               rows[j + 1][i])))
        self._faces(grp, faces, m, smooth)

    def tube(self, name, m, pts, r0, r1=None, sides=6):
        """Open tube swept along a polyline [(x, y, z), ...], radius tapering r0 -> r1 (water streams)."""
        grp = self.g(name)
        r1 = r0 if r1 is None else r1
        n = len(pts)
        rings = []
        for i, p in enumerate(pts):
            p = Vector(p)
            d = (Vector(pts[min(i + 1, n - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
            side = d.cross(Vector((0.0, 0.0, 1.0)))
            if side.length < 1e-4:
                side = Vector((1.0, 0.0, 0.0))
            side.normalize()
            up = side.cross(d).normalized()
            r = r0 + (r1 - r0) * i / max(n - 1, 1)
            rings.append([grp.bm.verts.new(p + r * (math.cos(TAU * k / sides) * side + math.sin(TAU * k / sides) * up))
                          for k in range(sides)])
        faces = []
        for a, b in zip(rings, rings[1:]):
            for k in range(sides):
                k2 = (k + 1) % sides
                faces.append(grp.bm.faces.new((a[k], a[k2], b[k2], b[k])))
        self._faces(grp, faces, m, True)

    # ---- output ------------------------------------------------------------
    def finalize(self):
        out = {}
        for name, grp in self.groups.items():
            bm = grp.bm
            bm.normal_update()
            me = bpy.data.meshes.new(name)
            uvl = bm.loops.layers.uv.new("UVMap")
            for f in bm.faces:
                _uv_face(f, uvl, grp.mats[f.material_index], f[grp.uv_layer])
            bm.faces.layers.int.remove(grp.uv_layer)
            bm.to_mesh(me)
            bm.free()
            for mt in grp.mats:
                me.materials.append(mt)
            o = bpy.data.objects.new(name, me)
            for k, v in grp.props.items():
                o[k] = v
            self.coll.objects.link(o)
            out[name] = o
        self.groups = {}
        return out


def _uv_face(f, uvl, m, mode):
    s = float(m.get("uv_scale", 2.0))
    if mode == UV_POLAR:
        c = f.calc_center_median()
        ac = math.atan2(c.y, c.x)
        for lp in f.loops:
            p = lp.vert.co
            a = math.atan2(p.y, p.x)
            a += TAU * round((ac - a) / TAU)
            lp[uvl].uv = (a * math.hypot(c.x, c.y) / s, math.hypot(p.x, p.y) / s)
        return
    n = f.normal
    ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
    for lp in f.loops:
        p = lp.vert.co
        if az >= ax and az >= ay:
            uv = (p.x, p.y)
        elif ay >= ax:
            uv = (p.x, p.z)
        else:
            uv = (p.y, p.z)
        lp[uvl].uv = (uv[0] / s, uv[1] / s)

