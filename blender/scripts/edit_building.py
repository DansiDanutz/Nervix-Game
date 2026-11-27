"""Demonstrate criterion 16: edit a building in Blender and re-export.

Run:
    blender --background blender/scenes/nervix_city_district_01.blend \
            --python blender/scripts/edit_building.py

Changes the merchant house wall colour and lifts its sign, then saves. The
merchant assignment, NPC, enabled apps, orders and campaigns live in Postgres and
are keyed by stable slot id, so they must survive the re-export.
"""

import bpy

mat = bpy.data.materials.get("sandstone")
if mat and mat.use_nodes:
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.78, 0.66, 0.52, 1.0)

sign = bpy.data.objects.get("nervix_house_sign")
if sign:
    sign.location.z += 0.5

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print("EDITED", bpy.data.filepath, "sign_z", round(sign.location.z, 3) if sign else None)