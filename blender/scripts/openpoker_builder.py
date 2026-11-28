"""Primitive builder for the OpenPoker slice. Every object is linked into one owned collection."""

import math
import os

import bmesh
import bpy

from openpoker_common import PI, set_box_projection_uv


class Frame:
    """Builds objects at frame-local coordinates shifted by a fixed offset into the district."""

    def __init__(self, coll, offset=(0.0, 0.0, 0.0)):
        self.coll = coll
        self.off = offset

    # ---- placement -------------------------------------------------------
    def p(self, loc):
        return (loc[0] + self.off[0], loc[1] + self.off[1], loc[2] + self.off[2])

    def _link(self, o):
        for c in list(o.users_collection):
            c.objects.unlink(o)
        self.coll.objects.link(o)
        return o

    def _last(self, name):
        o = bpy.context.object
        o.name = name
        return self._link(o)

    # ---- solids ----------------------------------------------------------
    def box(self, name, size, loc, m, rot=(0, 0, 0), keep=False, shadow=True):
        bpy.ops.mesh.primitive_cube_add(size=1, location=self.p(loc), rotation=rot)
        o = self._last(name)
        o.scale = size
        o.data.materials.append(m)
        if keep:
            o["nervix_keep"] = True
        if not shadow:
            o.visible_shadow = False
        return o

    def cyl(self, name, r, depth, loc, m, rot=(0, 0, 0), verts=24, keep=False):
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth,
                                            location=self.p(loc), rotation=rot)
        o = self._last(name)
        o.data.materials.append(m)
        if keep:
            o["nervix_keep"] = True
        return o

    def sph(self, name, r, loc, m, scale=(1, 1, 1), segs=12, rings=8):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=segs, ring_count=rings,
                                             location=self.p(loc))
        o = self._last(name)
        o.scale = scale
        o.data.materials.append(m)
        return o

    def torus(self, name, major, minor, loc, m, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                         major_segments=48, minor_segments=8,
                                         location=self.p(loc), rotation=rot)
        o = self._last(name)
        o.data.materials.append(m)
        return o

    def prism(self, name, pts, y0, y1, m):
        """Extrude a convex polygon given in (x, z) frame-local coords across y0..y1."""
        bm = bmesh.new()
        ox, oy, oz = self.off
        front = [bm.verts.new((ox + x, oy + y0, oz + z)) for x, z in pts]
        back = [bm.verts.new((ox + x, oy + y1, oz + z)) for x, z in pts]
        bm.faces.new(front)
        bm.faces.new(list(reversed(back)))
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([front[i], front[j], back[j], back[i]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(m)
        o = bpy.data.objects.new(name, me)
        self.coll.objects.link(o)
        return o

    def ring(self, name, cx, cz, r_in, r_out, yc, depth, m, a0=0.0, a1=PI):
        """Arch voussoir ring in the XZ plane (normal Y), split into rotated boxes."""
        rm = (r_in + r_out) / 2.0
        n = max(6, int(round((a1 - a0) * rm / 0.32)))
        out = []
        for k in range(n):
            th = a0 + (k + 0.5) * (a1 - a0) / n
            x = cx + rm * math.cos(th)
            z = cz + rm * math.sin(th)
            seg = rm * (a1 - a0) / n
            out.append(self.box(f"{name}_{k:02d}", (r_out - r_in, depth, seg * 1.15),
                                (x, yc, z), m, rot=(0, -th, 0)))
        return out

    # ---- openings --------------------------------------------------------
    def cut(self, wall, horiz, c, w, z0, h, mid, depth=4.0, arch=True):
        """Cut a rectangular opening with an optional round head out of `wall`.

        horiz 'x': wall runs along X (front/back), opening centred at x = c, cut through Y.
        horiz 'y': wall runs along Y (side), opening centred at y = c, cut through X.
        h is the total height to the apex. mid is the wall's centre across its thickness.
        """
        r = w / 2.0
        rect_h = h - r if arch else h
        if horiz == "x":
            box_loc = (c, mid, z0 + rect_h / 2.0)
            box_size = (w, depth, rect_h)
            cyl_loc = (c, mid, z0 + rect_h)
            cyl_rot = (PI / 2, 0, 0)
        else:
            box_loc = (mid, c, z0 + rect_h / 2.0)
            box_size = (depth, w, rect_h)
            cyl_loc = (mid, c, z0 + rect_h)
            cyl_rot = (0, PI / 2, 0)
        cutters = []
        bpy.ops.mesh.primitive_cube_add(size=1, location=self.p(box_loc))
        cb = bpy.context.object
        cb.scale = box_size
        cutters.append(cb)
        if arch:
            bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=r, depth=depth,
                                                location=self.p(cyl_loc), rotation=cyl_rot)
            cutters.append(bpy.context.object)
        for cut_obj in cutters:
            _boolean(wall, cut_obj, "DIFFERENCE")

    # ---- post ------------------------------------------------------------
    def merge_by_material(self):
        """Join plain meshes that share one material into one object each (keeps GLB small)."""
        groups = {}
        for o in list(self.coll.objects):
            if o.type != "MESH" or o.parent or o.get("nervix_keep") or not o.data.materials:
                continue
            groups.setdefault(o.data.materials[0].name, []).append(o)
        for mname, objs in groups.items():
            if len(objs) < 2:
                if len(objs) == 1 and objs[0].data.materials[0].get("uv_tex_scale"):
                    set_box_projection_uv(objs[0])
                continue
            bpy.ops.object.select_all(action="DESELECT")
            for o in objs:
                o.select_set(True)
            bpy.context.view_layer.objects.active = objs[0]
            bpy.ops.object.join()
            merged = bpy.context.object
            merged.name = f"{self.coll.name}__{mname}"
            if merged.data.materials[0].get("uv_tex_scale"):
                set_box_projection_uv(merged)
        bpy.ops.object.select_all(action="DESELECT")

    def marker(self, name, loc, kind, asset_id, slot=None):
        o = bpy.data.objects.new(name, None)
        o.empty_display_type = "PLAIN_AXES"
        o.empty_display_size = 0.35
        o.location = self.p(loc)
        o["nervix_marker_kind"] = kind
        o["nervix_asset_id"] = asset_id
        if slot:
            o["nervix_slot"] = slot
        self.coll.objects.link(o)
        return o


def _boolean(target, cutter, op):
    bpy.context.view_layer.objects.active = target
    mod = target.modifiers.new("cut", "BOOLEAN")
    mod.object = cutter
    mod.operation = op
    mod.solver = "EXACT"
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
