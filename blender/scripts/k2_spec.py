"""K2 house kit: pure layout spec (no bpy), shared by the Blender builders, exporter and tests.

Local frame of every house (Blender units = metres): origin on the ground at the centre of the
front facade plane; the facade faces -y and the building extends to +y. The runtime/glTF frame is
(x, z, -y), so the facade faces runtime +Z and the door's outward vector is (0, 0, 1).
Everything here is generic and identity-free: no merchant names, only geometry and anchor names.
"""

from dataclasses import dataclass

KIT_NAME = "k2_house_kit"
KIT_VERSION = 1
BLEND_REL = "blender/scenes/nervix_house_kit_01.blend"
WALL_T = 0.35            # exterior wall thickness
FLOOR_Z = 0.12           # interior floor and front step top
CEILING_Z = 3.4          # interior ceiling (ground storey)
SHELF_LEVELS = (0.95, 1.6)
TABLE_TOP = 0.85
CORRIDOR_DEPTH = 1.6     # clear walkway inside the door
BANNED_IDENTITY_TOKENS = ("DanGG", "OpenPoker", "Test Builder", "test_builder", "NervixPay", "usr_", "demo_")


@dataclass(frozen=True)
class SizeClass:
    name: str
    width: float
    depth: float
    storeys: int
    ground_h: float
    upper_h: float
    door_w: float
    door_h: float
    counter_w: float
    back_cols: int
    table_slots: int
    side_cols: int

    @property
    def wall_h(self):
        return self.ground_h + self.upper_h * (self.storeys - 1)


@dataclass(frozen=True)
class Facade:
    name: str
    roof: str            # "gable" (gable end to the street) or "hip"
    door_side: str       # "right", "left" or "center"
    shop_window: bool    # big arched shop window beside the door
    balcony: bool        # teal X-railing balcony on the first upper storey
    loggia: bool         # recessed arcade with balustrade on the first upper storey
    awning_default: bool # opt_awning visible by default
    chimney: bool


SIZE_CLASSES = {
    "small": SizeClass("small", 5.0, 5.0, 2, 3.6, 3.0, 1.2, 2.4, 1.6, 2, 2, 0),
    "medium": SizeClass("medium", 7.0, 6.0, 2, 3.6, 3.0, 1.3, 2.5, 1.8, 3, 3, 0),
    "large": SizeClass("large", 9.0, 7.0, 3, 3.8, 3.0, 1.4, 2.7, 2.0, 3, 2, 2),
}

FACADES = {
    "shutters": Facade("shutters", "gable", "right", True, True, False, False, True),
    "awning": Facade("awning", "hip", "left", True, False, False, True, False),
    "loggia": Facade("loggia", "hip", "center", False, False, True, False, False),
}

PART_NAMES = (
    "exterior_walls", "exterior_trim", "roof_tiles", "roof_structure", "windows", "door_frame",
    "door_leaf", "sign_board", "sign_bracket", "lanterns", "planters", "facade_details",
    "interior_floor", "interior_walls", "interior_ceiling", "interior_furniture", "interior_lights",
)


def house_id(size, facade):
    return f"house_{size}_{facade}"


def variants():
    return [(s, f) for s in SIZE_CLASSES for f in FACADES]


def variant_ids():
    return [house_id(s, f) for s, f in variants()]


def to_runtime(v):
    x, y, z = v
    return (float(x), float(z), float(-y) + 0.0)


def _r(v):
    return [round(c, 4) + 0.0 for c in v]


def mirror(facade):
    """+1 when the door is on the right (or centred), -1 when it is on the left."""
    return -1.0 if FACADES[facade].door_side == "left" else 1.0


def interior_bounds(size):
    s = SIZE_CLASSES[size]
    return (-s.width / 2 + WALL_T, s.width / 2 - WALL_T, WALL_T, s.depth - WALL_T, FLOOR_Z, CEILING_Z)


def door_spec(size, facade):
    s = SIZE_CLASSES[size]
    side = FACADES[facade].door_side
    edge = s.width / 2 - WALL_T - 0.3 - s.door_w / 2
    x = {"right": edge, "left": -edge, "center": 0.0}[side]
    return {"position": (round(x, 4), 0.0, FLOOR_Z), "outward": (0.0, -1.0, 0.0),
            "width": s.door_w, "height": s.door_h}


def door_corridor(size, facade):
    d = door_spec(size, facade)
    y = WALL_T + CORRIDOR_DEPTH / 2
    return {"center": (d["position"][0], y, 0.0), "size": (d["width"] + 0.4, CORRIDOR_DEPTH, 2.0)}


def window_specs(size, facade):
    """Facade openings: storey 0 = ground. kind: shop (through, glazed), window (recessed, shuttered)."""
    s, f = SIZE_CLASSES[size], FACADES[facade]
    m = mirror(facade)
    door_x = door_spec(size, facade)["position"][0]
    out = []
    if f.shop_window:
        far = -m * (s.width / 2 - 0.55)
        near = door_x - m * (s.door_w / 2 + 0.45)
        w = abs(near - far)
        out.append({"storey": 0, "kind": "shop", "x": round((near + far) / 2, 4), "width": round(w, 4),
                    "sill": 0.75, "height": 2.25 if size == "large" else 2.05})
    else:
        gap = (s.width / 2 - 0.5) - (s.door_w / 2 + 0.6)
        for sign in (-1, 1):
            x = sign * (s.door_w / 2 + 0.6 + gap / 2)
            out.append({"storey": 0, "kind": "window", "x": round(x, 4), "width": min(1.0, gap - 0.2),
                        "sill": 1.0, "height": 1.6})
    n_up = 2 if size == "small" else 3
    span = s.width - 2.2
    for storey in range(1, s.storeys):
        for i in range(n_up):
            x = -span / 2 + span * (i + 0.5) / n_up
            if storey == 1 and f.loggia:      # recessed arcade bay instead of a window
                out.append({"storey": storey, "kind": "loggia", "x": round(x, 4),
                            "width": round(span / n_up - 0.35, 4), "sill": 0.15, "height": 2.45})
            else:
                out.append({"storey": storey, "kind": "window", "x": round(x, 4), "width": 0.9,
                            "sill": 0.75, "height": 1.55})
    return out


def storey_base(size, storey):
    s = SIZE_CLASSES[size]
    return 0.0 if storey == 0 else s.ground_h + s.upper_h * (storey - 1)


def sign_spec(size, facade):
    s = SIZE_CLASSES[size]
    d = door_spec(size, facade)
    m = mirror(facade)
    if facade == "shutters":      # hanging board on an iron bracket beside the door (A04)
        return {"position": (round(d["position"][0] - m * 0.95, 4), -0.42, 3.0), "normal": (0.0, -1.0, 0.0),
                "size": (1.4, 0.55), "style": "hanging"}
    if facade == "awning":        # flat board on the wall above the awning (A05)
        win = window_specs(size, facade)[0]
        return {"position": (win["x"], -0.08, s.ground_h - 0.36), "normal": (0.0, -1.0, 0.0),
                "size": (min(2.0, win["width"] - 0.3), 0.42), "style": "wall"}
    return {"position": (0.0, -0.1, s.ground_h - 0.5), "normal": (0.0, -1.0, 0.0),   # frieze plaque (A06)
            "size": (2.0, 0.5), "style": "plaque"}


def _counter(size, facade):
    s = SIZE_CLASSES[size]
    x0, x1, y0, y1, _, _ = interior_bounds(size)
    m = mirror(facade)
    cx = m * ((x1 - x0) / 2 - 0.2 - s.counter_w / 2)
    return {"kind": "counter", "center": (round(cx, 4), round(y1 - 1.1, 4), 0.5),
            "size": (s.counter_w, 0.6, 1.0)}


def furniture(size, facade):
    """Interior furniture boxes (plan centre + size). Slots rest on shelves and tables."""
    s = SIZE_CLASSES[size]
    x0, x1, y0, y1, _, _ = interior_bounds(size)
    m = mirror(facade)
    half = (x1 - x0) / 2
    counter = _counter(size, facade)
    inner_edge = counter["center"][0] - m * s.counter_w / 2
    a, b = -m * (half - 0.1), inner_edge - m * 0.3
    out = [counter, {"kind": "shelf", "center": (round((a + b) / 2, 4), round(y1 - 0.22, 4), 1.1),
                     "size": (round(abs(b - a), 4), 0.4, 2.2), "axis": "x", "cols": s.back_cols}]
    if s.side_cols:
        sy0, sy1 = y0 + 1.9, y0 + 1.9 + 1.2 * s.side_cols
        out.append({"kind": "shelf", "center": (round(-m * (half - 0.22), 4), round((sy0 + sy1) / 2, 4), 1.1),
                    "size": (0.4, round(sy1 - sy0, 4), 2.2), "axis": "y", "cols": s.side_cols})
    tlen = 0.6 * s.table_slots
    tx = -m * (0.05 + tlen / 2) if facade != "loggia" else -m * (0.9 + tlen / 2)
    out.append({"kind": "table", "center": (round(tx, 4), round(y0 + (y1 - y0) * 0.5, 4), TABLE_TOP / 2),
                "size": (round(tlen, 4), 0.7, TABLE_TOP), "cols": s.table_slots})
    return out


def slot_specs(size, facade):
    out = []
    for f in furniture(size, facade):
        if f["kind"] == "shelf":
            cx, cy, _ = f["center"]
            along = 0 if f["axis"] == "x" else 1
            length = f["size"][along]
            for z in SHELF_LEVELS:
                for i in range(f["cols"]):
                    t = -length / 2 + length * (i + 0.5) / f["cols"]
                    pos = (cx + t, cy, z) if along == 0 else (cx, cy + t, z)
                    out.append(("shelf", pos, (min(0.55, length / f["cols"] - 0.1), 0.5, 0.32)))
        elif f["kind"] == "table":
            cx, cy, _ = f["center"]
            for i in range(f["cols"]):
                t = -f["size"][0] / 2 + f["size"][0] * (i + 0.5) / f["cols"]
                out.append(("table", (cx + t, cy, TABLE_TOP + FLOOR_Z), (0.5, 0.6, 0.5)))
    return [{"name": f"slot_{i}", "surface": kind, "position": tuple(round(c, 4) for c in pos),
             "max_extent": list(ext)} for i, (kind, pos, ext) in enumerate(out, start=1)]


def station_spec(size, facade):
    c = _counter(size, facade)
    _, _, _, y1, _, _ = interior_bounds(size)
    y = (c["center"][1] + c["size"][1] / 2 + y1) / 2
    return {"position": (c["center"][0], round(y, 4), FLOOR_Z), "facing": (0.0, -1.0, 0.0)}


def manifest_house(size, facade):
    s, f = SIZE_CLASSES[size], FACADES[facade]
    hid = house_id(size, facade)
    d, sg, st = door_spec(size, facade), sign_spec(size, facade), station_spec(size, facade)
    x0, x1, y0, y1, z0, z1 = interior_bounds(size)
    return {
        "id": hid, "file": hid + ".glb", "size_class": size, "facade": facade, "roof": f.roof,
        "footprint": {"width": s.width, "depth": s.depth}, "storeys": s.storeys, "wall_height": s.wall_h,
        "anchors": {
            "door": {"node": "anchor_door", "position": _r(to_runtime(d["position"])),
                     "outward": _r(to_runtime(d["outward"])), "width": d["width"], "height": d["height"]},
            "sign": {"node": "anchor_sign", "position": _r(to_runtime(sg["position"])),
                     "normal": _r(to_runtime(sg["normal"])), "size": list(sg["size"]), "style": sg["style"],
                     "surface_node": "sign_board"},
            "station": {"node": "anchor_station", "position": _r(to_runtime(st["position"])),
                        "facing": _r(to_runtime(st["facing"]))},
        },
        "slots": [{"node": sl["name"], "position": _r(to_runtime(sl["position"])), "surface": sl["surface"],
                   "max_extent": sl["max_extent"]} for sl in slot_specs(size, facade)],
        "interior": {"bounds": {"min": _r(to_runtime((x0, y1, z0))), "max": _r(to_runtime((x1, y0, z1)))},
                     "floor_y": FLOOR_Z, "ceiling_node": "interior_ceiling"},
        "options": [{"node": "opt_awning", "default_visible": f.awning_default}],
        "parts": list(PART_NAMES),
    }


def build_manifest(extra=None):
    houses = [manifest_house(s, f) for s, f in variants()]
    for h in houses:
        h.update((extra or {}).get(h["id"], {}))
    return {
        "kit": KIT_NAME, "version": KIT_VERSION, "units": "metres", "source_blend": BLEND_REL,
        "coordinate_system": "glTF/runtime: +Y up; origin on the ground at the centre of the front facade; "
                             "the facade faces +Z and the house extends to -Z. Blender (x, y, z) -> (x, z, -y).",
        "categories": {"size_class": list(SIZE_CLASSES), "facade": list(FACADES)},
        "anchor_conventions": {
            "anchor_door": "door threshold centre on the facade plane; extras.outward is the unit vector out of the house",
            "anchor_sign": "centre of the blank sign surface (sign_board); paint a runtime texture facing anchors.sign.normal",
            "anchor_station": "where a merchant NPC stands behind the counter; faces anchors.station.facing",
            "slot_N": "product display slot resting on a shelf or table; max_extent is [x, y, z] in metres",
            "opt_awning": "optional awning node; hide or show at runtime",
        },
        "houses": houses,
    }
