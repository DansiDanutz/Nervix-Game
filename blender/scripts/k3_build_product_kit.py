"""Build, save and export the K3 product display kit. Idempotent: it rebuilds only its own collection.

Run (headless only):
  blender --background --factory-startup --python blender/scripts/k3_build_product_kit.py

Outputs
  blender/scenes/nervix_product_kit_01.blend   (new kit file, single owner: K3)
  app/public/kits/k3/product_kit.glb           (no Draco)
  app/public/kits/k3/manifest.json
"""

import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import k3_spec as spec  # noqa: E402
from k3_fixtures import build_fixture, build_price_tag  # noqa: E402
from k3_geom import build_materials  # noqa: E402
from k3_products import build_product  # noqa: E402

OWNED_PREFIXES = ("asset.", "display.", "anchor.")


def open_kit_file():
    if os.path.exists(spec.KIT_BLEND):
        bpy.ops.wm.open_mainfile(filepath=spec.KIT_BLEND)
    else:
        bpy.ops.wm.read_homefile(use_empty=True)


def _remove_collection_tree(name):
    coll = bpy.data.collections.get(name)
    if not coll:
        return
    for child in list(coll.children):
        _remove_collection_tree(child.name)
    for obj in list(coll.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(coll)


def reset_owned():
    """Delete only what this script owns: its collection, and kit meshes that lost their users."""
    _remove_collection_tree(spec.KIT_COLLECTION)
    for mesh in list(bpy.data.meshes):
        if mesh.name.startswith(OWNED_PREFIXES) and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    coll = bpy.data.collections.new(spec.KIT_COLLECTION)
    bpy.context.scene.collection.children.link(coll)
    return coll


def _mesh_only(obj):
    """Keep the mesh datablock; drop the temporary object that built it."""
    mesh = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    return mesh


def build_meshes(coll, materials):
    sets = spec.build_display_sets()
    fixtures = {fid: _mesh_only(build_fixture(fid, spec.fixture_name(fid), coll, materials))
                for fid in sorted({d["fixture"] for d in sets})}
    products = {d["category"]: _mesh_only(build_product(d["category"], spec.product_name(d["category"]),
                                                       coll, materials))
                for d in sets}
    tag = _mesh_only(build_price_tag(coll, materials))
    return sets, fixtures, products, tag


def _empty(name, coll, loc, parent=None, size=0.1):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = size
    coll.objects.link(obj)
    obj.parent = parent
    obj.location = loc
    return obj


def _instance(name, mesh, coll, parent, loc):
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    obj.parent = parent
    obj.location = loc
    return obj


def assemble(coll, sets, fixtures, products, tag):
    """One display.<id> empty per category; children share the category and fixture meshes."""
    for d in sets:
        cid = d["category"]
        root = _empty(spec.display_name(cid), coll, d["position"], size=0.3)
        _instance(f"{spec.display_name(cid)}.fixture", fixtures[d["fixture"]], coll, root, (0, 0, 0))
        _instance(f"{spec.display_name(cid)}.product", products[cid], coll, root, d["product_offset"])
        anchor = _empty(spec.price_tag_anchor_name(cid), coll, d["price_tag_anchor"], parent=root)
        _instance(f"{spec.display_name(cid)}.price_tag", tag, coll, anchor, (0, 0, 0))


def export(coll):
    os.makedirs(spec.KIT_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in coll.objects:
        obj.select_set(True)
    glb = os.path.join(spec.KIT_DIR, spec.GLB_NAME)
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_draco_mesh_compression_enable=False, export_extras=False,
        export_cameras=False, export_lights=False, export_animations=False,
    )
    manifest = spec.build_manifest(spec.GLB_NAME)
    with open(os.path.join(spec.KIT_DIR, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    return glb


def main():
    bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backups
    open_kit_file()
    coll = reset_owned()
    materials = build_materials()
    sets, fixtures, products, tag = build_meshes(coll, materials)
    assemble(coll, sets, fixtures, products, tag)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=spec.KIT_BLEND, compress=True)
    glb = export(coll)
    print(f"K3 BUILD OK: {len(sets)} displays, {len(fixtures)} fixtures -> {glb}")


if __name__ == "__main__":
    main()
