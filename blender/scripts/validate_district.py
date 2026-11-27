"""Validate the Milestone 1 district.

Run:
    blender --background blender/scenes/nervix_city_district_01.blend \
            --python blender/scripts/validate_district.py

Read-only. Prints a JSON report and exits non-zero when a check fails.
"""

import json
import sys

import bpy
from mathutils import Vector

MANAGED = "NERVIX_MANAGED"
TOLERANCE = 0.15


def height(obj):
    corners = [obj.matrix_world @ Vector(v) for v in obj.bound_box]
    zs = [c.z for c in corners]
    return max(zs) - min(zs)


def main():
    report = {"checks": [], "ok": True}

    def check(name, passed, detail):
        report["checks"].append({"name": name, "passed": bool(passed), "detail": detail})
        if not passed:
            report["ok"] = False

    scene = bpy.context.scene
    unit = scene.unit_settings
    check("metric_units", unit.system == "METRIC" and abs(unit.scale_length - 1.0) < 1e-6,
          f"system={unit.system} scale_length={unit.scale_length}")

    root = bpy.data.collections.get(MANAGED)
    objects = list(root.all_objects) if root else []
    meshes = [o for o in objects if o.type == "MESH"]
    check("managed_collection", root is not None and len(meshes) > 20, f"meshes={len(meshes)}")

    markers = [o for o in objects if o.get("nervix_marker_kind")]
    kinds = [o["nervix_marker_kind"] for o in markers]
    buildings = [o for o in markers if o["nervix_marker_kind"] == "building"]
    slots = [o for o in markers if o["nervix_marker_kind"] == "property_slot"]
    check("buildings", len(buildings) >= 3, f"buildings={len(buildings)}")
    check("property_slots", len(slots) >= 3, f"slots={len(slots)}")
    check("ad_surface", "ad_surface" in kinds, "ad_surface present" if "ad_surface" in kinds else "missing")
    check("interior", "interior" in kinds, "interior present" if "interior" in kinds else "missing")

    npcs = [o for o in meshes if o.name.startswith("nervix_npc_")]
    check("npc_variants", len(npcs) == 3, f"npcs={len(npcs)}")

    fountain = [o for o in meshes if o.name.startswith("nervix_fountain")]
    check("fountain", len(fountain) >= 4, f"fountain_parts={len(fountain)}")

    heights = [height(o) for o in npcs]
    check("npc_height", all(abs(h - 1.8) <= TOLERANCE for h in heights) and len(heights) == 3,
          f"heights={[round(h, 3) for h in heights]}")

    doors = [o for o in meshes if "door" in o.name]
    check("doorway_height", any(abs(height(o) - 2.1) <= TOLERANCE for o in doors),
          f"doors={[round(height(o), 3) for o in doors]}")

    unshaded = [o.name for o in meshes if not o.data.materials]
    check("materials_assigned", not unshaded, f"meshes_without_material={unshaded}")

    actions = {a.name for a in bpy.data.actions}
    expected = {f"nervix_npc_{n}_{a}" for n in ("merchant", "cafe", "host") for a in ("idle", "walk")}
    check("animation_actions", expected.issubset(actions), f"missing={sorted(expected - actions)}")

    print("NERVIX_VALIDATION " + json.dumps(report, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())