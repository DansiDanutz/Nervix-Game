"""Validate the K3 product kit .blend (headless). Exit 1 on any failure.

  blender --background blender/scenes/nervix_product_kit_01.blend \
          --python blender/scripts/k3_validate_product_kit.py
"""

import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import k3_spec as spec  # noqa: E402

TOL = 0.002
MAX_MATERIALS_PER_MESH = 2
MAX_PRODUCT_TRIS = 12_000
BANNED = ("dangg", "openpoker", "test builder", "workshop")


def _tris(mesh):
    return sum(len(p.vertices) - 2 for p in mesh.polygons)


def _dims(mesh):
    xs, ys, zs = zip(*(v.co[:] for v in mesh.vertices))
    return (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)), min(zs)


def _fits(name, dims, size, errors):
    for axis, (got, limit) in enumerate(zip(dims, size)):
        if got > limit + TOL:
            errors.append(f"{name}: axis {'xyz'[axis]} {got:.3f} > {limit:.3f}")


def check_meshes(errors, stats):
    sets = spec.build_display_sets()
    for d in sets:
        name = spec.product_name(d["category"])
        mesh = bpy.data.meshes.get(name)
        if mesh is None:
            errors.append(f"missing {name}")
            continue
        dims, zmin = _dims(mesh)
        _fits(name, dims, spec.PRODUCTS[d["category"]]["size"], errors)
        if abs(zmin) > TOL:
            errors.append(f"{name}: base at z={zmin:.3f}, expected 0")
        if _tris(mesh) > MAX_PRODUCT_TRIS:
            errors.append(f"{name}: {_tris(mesh)} triangles")
        stats[name] = _tris(mesh)
    for fid, fx in spec.FIXTURES.items():
        mesh = bpy.data.meshes.get(spec.fixture_name(fid))
        if mesh is None:
            errors.append(f"missing {spec.fixture_name(fid)}")
            continue
        _fits(mesh.name, _dims(mesh)[0], fx["size"], errors)
        stats[mesh.name] = _tris(mesh)
    for mesh in bpy.data.meshes:
        if mesh.name.startswith("asset.") and len(mesh.materials) > MAX_MATERIALS_PER_MESH:
            errors.append(f"{mesh.name}: {len(mesh.materials)} materials")


def check_scene(errors):
    coll = bpy.data.collections.get(spec.KIT_COLLECTION)
    if coll is None:
        errors.append("kit collection missing")
        return
    names = [o.name for o in coll.objects]
    for o in bpy.data.objects:
        if o.type in ("FONT", "CURVE", "GPENCIL", "GREASEPENCIL"):
            errors.append(f"text/curve object {o.name}")
    dupes = [n for n in names if "." in n and n.rsplit(".", 1)[-1].isdigit()]
    if dupes:
        errors.append(f"duplicate-suffixed objects (not idempotent): {dupes[:5]}")
    for d in spec.build_display_sets():
        for n in (spec.display_name(d["category"]), spec.price_tag_anchor_name(d["category"])):
            if n not in names:
                errors.append(f"missing object {n}")
    blob = " ".join([*names, *(m.name for m in bpy.data.meshes),
                     *(m.name for m in bpy.data.materials)]).lower()
    for word in BANNED:
        if word in blob:
            errors.append(f"identity string {word!r} in datablock names")


def main():
    errors, stats = [], {}
    check_scene(errors)
    check_meshes(errors, stats)
    report = {"status": "FAIL" if errors else "PASS", "errors": errors,
              "triangles": stats, "total_triangles": sum(stats.values())}
    print("K3 VALIDATE " + json.dumps(report, indent=1))
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
