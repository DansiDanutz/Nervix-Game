"""Give each shipped plaza obstacle a top_y (runtime height, m) so the camera can ignore low ones.

Pure (no bpy). `measured` boxes come from the geometry the client draws (the shipped GLB) and may
be split differently from the shipped footprints (glTF splits meshes at UV/normal seams), so a
shipped box takes the highest top of the measured boxes lying mostly inside it.
"""

INSIDE_FRACTION = 0.5     # a measured box belongs to a shipped box when this share of it lies inside
PAD = 0.01                # metres: gives the zero-thickness planes glTF splits off an area


def _area(b):
    return (b["maxX"] - b["minX"]) * (b["maxZ"] - b["minZ"])


def _padded(b):
    return {"minX": b["minX"] - PAD, "maxX": b["maxX"] + PAD, "minZ": b["minZ"] - PAD, "maxZ": b["maxZ"] + PAD}


def _overlap(a, b):
    w = min(a["maxX"], b["maxX"]) - max(a["minX"], b["minX"])
    d = min(a["maxZ"], b["maxZ"]) - max(a["minZ"], b["minZ"])
    return max(0.0, w) * max(0.0, d)


def _owner(m, shipped):
    """Index of the tightest shipped box holding most of `m` (so a lamp standing on a low stair
    belongs to its own obstacle, not to the stair), or None."""
    pm = _padded(m)
    holders = [i for i, s in enumerate(shipped) if _overlap(pm, _padded(s)) >= INSIDE_FRACTION * _area(pm)]
    return min(holders, key=lambda i: _area(shipped[i])) if holders else None


def with_top_y(shipped, measured):
    """New list: each shipped box (footprint and order unchanged) plus top_y. ValueError when a
    shipped box has no measured geometry, so a stale manifest is never silently annotated."""
    tops = {}
    for m in measured:
        i = _owner(m, shipped)
        if i is not None:
            tops[i] = max(tops.get(i, m["top_y"]), m["top_y"])
    missing = [s for i, s in enumerate(shipped) if i not in tops]
    if missing:
        raise ValueError(f"no measured geometry for obstacles {missing}")
    return [{**s, "top_y": tops[i]} for i, s in enumerate(shipped)]
