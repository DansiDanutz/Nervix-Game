"""K1 low-poly geometry: lofted tubes, ellipsoids and boxes with per-vertex skin weights.

Every primitive is a loft of rings along a path. A ring has a centre, a side radius (rx) and a
front radius (ry). Rings are perpendicular to the local path direction, with `side` and `front`
axes picked so that side x front = direction; that makes the quad winding face outward for any
path direction, so no normal recalculation is needed (open garments stay correct too).

Weights per ring are a dict {bone: w} or a callable (angle) -> dict, where angle 0 is the side
axis (+X for a vertical path, the figure's left).
"""

import math

import bpy
from mathutils import Vector


def _basis(direction):
    d = direction.normalized()
    ref = Vector((0.0, 1.0, 0.0)) if abs(d.y) < 0.9 else Vector((0.0, 0.0, 1.0))
    side = ref.cross(d).normalized()
    front = d.cross(side).normalized()
    return side, front


class PartBuilder:
    """Accumulates one mesh part: verts, faces, material slot per face and weights per vert."""

    def __init__(self, slots):
        self.slots = list(slots)
        self.verts, self.faces, self.face_slots, self.weights = [], [], [], []

    def _vert(self, co, weights):
        self.verts.append(tuple(co))
        self.weights.append(dict(weights))
        return len(self.verts) - 1

    def _face(self, idx, slot):
        self.faces.append(tuple(idx))
        self.face_slots.append(self.slots.index(slot))

    def loft(self, rings, slot, segs=8, cap_start=None, cap_end=None, phase=0.0):
        """rings: list of (centre, rx, ry, weights[, dz]). slot: str or list per segment.

        dz, when given, is a callable (angle) -> vertical offset, for uneven hems and drapes.

        cap_start / cap_end: None (open), "flat" (fan at ring centre) or a point (pole).
        """
        centres = [Vector(r[0]) for r in rings]
        loops = []
        for i, ring in enumerate(rings):
            rx, ry, weights = ring[1], ring[2], ring[3]
            dz = ring[4] if len(ring) > 4 else None
            prev_c = centres[max(i - 1, 0)]
            next_c = centres[min(i + 1, len(rings) - 1)]
            side, front = _basis(next_c - prev_c)
            loop = []
            for j in range(segs):
                a = phase + 2.0 * math.pi * j / segs
                co = centres[i] + side * (rx * math.cos(a)) + front * (ry * math.sin(a))
                if dz is not None:
                    co.z += dz(a)
                w = weights(a) if callable(weights) else weights
                loop.append(self._vert(co, w))
            loops.append(loop)
        slots = slot if isinstance(slot, (list, tuple)) else [slot] * (len(rings) - 1)
        for i in range(len(loops) - 1):
            lo, hi = loops[i], loops[i + 1]
            for j in range(segs):
                k = (j + 1) % segs
                self._face((lo[j], lo[k], hi[k], hi[j]), slots[i])
        self._cap(loops[0], rings[0], cap_start, slots[0], start=True)
        self._cap(loops[-1], rings[-1], cap_end, slots[-1], start=False)

    def _cap(self, loop, ring, cap, slot, start):
        if cap is None:
            return
        centre = ring[0] if cap == "flat" else cap
        w = ring[3](0.0) if callable(ring[3]) else ring[3]
        c = self._vert(centre, w)
        n = len(loop)
        for j in range(n):
            k = (j + 1) % n
            self._face((c, loop[k], loop[j]) if start else (c, loop[j], loop[k]), slot)

    def ellipsoid(self, centre, radii, slot, weights, segs=10, rings=6, axis=(0.0, 0.0, 1.0)):
        """Ellipsoid along `axis`: radii = (side, front, along)."""
        c, ax = Vector(centre), Vector(axis).normalized()
        rx, ry, rz = radii
        ring_list = []
        for i in range(1, rings):
            t = math.pi * i / rings
            ring_list.append((c - ax * (rz * math.cos(t)), rx * math.sin(t), ry * math.sin(t), weights))
        self.loft(ring_list, slot, segs, cap_start=tuple(c - ax * rz), cap_end=tuple(c + ax * rz))

    def box(self, start, end, width, depth, slot, weights):
        """Rectangular bar from start to end; width along side axis, depth along front axis."""
        k = 1.0 / math.sqrt(2.0)
        self.loft([(start, width * k, depth * k, weights), (end, width * k, depth * k, weights)],
                  slot, segs=4, cap_start="flat", cap_end="flat", phase=math.pi / 4)

    def triangles(self):
        return sum(len(f) - 2 for f in self.faces)

    def build(self, name, collection, rig, materials):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts, [], self.faces)
        for slot in self.slots:
            mesh.materials.append(materials[slot])
        mesh.polygons.foreach_set("material_index", self.face_slots)
        mesh.update()
        for poly in mesh.polygons:
            poly.use_smooth = True
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        groups = {}
        for vi, weights in enumerate(self.weights):
            total = sum(weights.values()) or 1.0
            for bone, w in weights.items():
                if bone not in groups:
                    groups[bone] = obj.vertex_groups.new(name=bone)
                groups[bone].add([vi], w / total, "REPLACE")
        obj.parent = rig
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = rig
        return obj
