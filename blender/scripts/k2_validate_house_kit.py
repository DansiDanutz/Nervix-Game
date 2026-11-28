"""Validate the K2 house kit .blend against k2_spec. Prints one CHECK line per rule.

Run:
    blender --background blender/scenes/nervix_house_kit_01.blend \
        --python blender/scripts/k2_validate_house_kit.py
Exit code 0 only when every check passes (including the district .blend sha256).
"""

import hashlib
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from k2_spec import (BANNED_IDENTITY_TOKENS, PART_NAMES, door_spec, house_id, sign_spec, slot_specs,  # noqa: E402
                     station_spec, variants)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DISTRICT = os.path.join(ROOT, "blender", "scenes", "nervix_city_district_01.blend")
DISTRICT_SHA256 = "420ebb0e788e47900f4a3b3d6163b15746ef1ce3deaad1d26e5cca5d8fd89676"
MAX_TRIS = 350_000
FAILURES = []


def check(name, ok, detail=""):
    print(f"CHECK {name}: {'PASS' if ok else 'FAIL'} {detail}".rstrip())
    if not ok:
        FAILURES.append(name)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def near(obj, pos):
    return (obj.location - Vector(pos)).length < 1e-3


def main():
    for size, facade in variants():
        hid = house_id(size, facade)
        root = bpy.data.objects.get(hid)
        check(f"{hid} root", root is not None)
        if root is None:
            continue
        kids = {o.name.split("/", 1)[1]: o for o in root.children}
        missing = [p for p in PART_NAMES if p not in kids]
        check(f"{hid} parts", not missing, str(missing))
        check(f"{hid} awning option", "opt_awning" in kids)
        d, sg, st = door_spec(size, facade), sign_spec(size, facade), station_spec(size, facade)
        for key, pos in (("anchor_door", d["position"]), ("anchor_sign", sg["position"]),
                         ("anchor_station", st["position"])):
            check(f"{hid} {key}", key in kids and kids[key].type == "EMPTY" and near(kids[key], pos))
        slots = slot_specs(size, facade)
        ok = all(s["name"] in kids and near(kids[s["name"]], s["position"]) for s in slots)
        check(f"{hid} slots", ok and 6 <= len(slots) <= 12, f"{len(slots)} slots")
        total = sum(tris(o) for o in root.children if o.type == "MESH")
        check(f"{hid} triangles", total < MAX_TRIS, str(total))
    names = " ".join(o.name for o in bpy.data.objects).lower() + " ".join(m.name for m in bpy.data.materials).lower()
    hits = [t for t in BANNED_IDENTITY_TOKENS if t.lower() in names]
    check("identity-free names", not hits, str(hits))
    check("district sha256 unchanged", sha256(DISTRICT) == DISTRICT_SHA256)
    print("VERDICT", "PASS" if not FAILURES else f"FAIL {FAILURES}")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
