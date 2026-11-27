"""Validate a Nervix World Blender scene against the asset conventions.

Run:
    blender --background blender/scenes/nervix_city_district_01.blend \
            --python blender/scripts/validate_scene.py

Read-only. Operates on the managed collection only; never deletes or rewrites
hand-edited data. Prints a JSON report and exits non-zero when a check fails.

Checks (Milestone 0 subset):
  - scene units are metric, scale 1.0
  - the managed collection exists and is not empty
  - a reference character is ~1.8 m tall
  - a doorway marker is ~2.1 m tall
  - every mesh has at least one material
  - idle and walk actions exist
  - collision markers are present
"""

import json
import sys

import bpy
from mathutils import Vector

MANAGED = "NERVIX_MANAGED"
CHARACTER = "nervix_ref_character"
DOORWAY = "nervix_ref_doorway"
REQUIRED_ACTIONS = {"idle", "walk"}
TOLERANCE = 0.15  # metres


def collection(name):
    return bpy.data.collections.get(name)


def world_height(obj):
    """Bounding-box height in world space, in metres."""
    corners = [obj.matrix_world @ Vector(v) for v in obj.bound_box]
    zs = [c.z for c in corners]
    return max(zs) - min(zs)


def main():
    scene = bpy.context.scene
    report = {"checks": [], "ok": True}

    def check(name, passed, detail):
        report["checks"].append({"name": name, "passed": bool(passed), "detail": detail})
        if not passed:
            report["ok"] = False

    unit = scene.unit_settings
    check(
        "metric_units",
        unit.system == "METRIC" and abs(unit.scale_length - 1.0) < 1e-6,
        f"system={unit.system} scale_length={unit.scale_length}",
    )

    managed = collection(MANAGED)
    meshes = [o for o in (managed.all_objects if managed else []) if o.type == "MESH"]
    check("managed_collection", managed is not None and bool(meshes),
          f"collection={MANAGED} meshes={len(meshes)}")

    char = bpy.data.objects.get(CHARACTER)
    check("character_height", char is not None and abs(world_height(char) - 1.8) <= TOLERANCE,
          f"{CHARACTER} height={world_height(char):.3f}m" if char else f"{CHARACTER} missing")

    door = bpy.data.objects.get(DOORWAY)
    check("doorway_height", door is not None and abs(world_height(door) - 2.1) <= TOLERANCE,
          f"{DOORWAY} height={world_height(door):.3f}m" if door else f"{DOORWAY} missing")

    unshaded = [o.name for o in meshes if not o.data.materials]
    check("materials_assigned", not unshaded, f"meshes_without_material={unshaded}")

    actions = {a.name for a in bpy.data.actions}
    missing = REQUIRED_ACTIONS - actions
    check("animation_actions", not missing, f"missing={sorted(missing)}")

    markers = [o for o in meshes if o.get("nervix_collision")]
    check("collision_markers", bool(markers), f"collision_markers={len(markers)}")

    print("NERVIX_VALIDATION " + json.dumps(report, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())