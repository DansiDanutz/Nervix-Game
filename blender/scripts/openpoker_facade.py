"""A16 facade: the exterior dressing of the OpenPoker casino.

Authored in facade-local coordinates (front face at y = 0, plaza at -y, ground z = 0) and
offset into the district at FACADE_OFFSET. The front wall itself (with the door and loggia
openings) belongs to the salon collection, so this collection adds only exterior pieces.
"""

import math

from openpoker_builder import Frame
from openpoker_common import FACADE, FACADE_OFFSET, PI

DOOR_X = 1.3          # half width of the door opening
DOOR_SILL = 0.6       # sill height above the plaza (top of the four steps)
DOOR_ARCH_C = 2.9     # arch springing height (door rectangle top)
DOOR_R = 1.3
LOGGIA_XS = (-4.6, 0.0, 4.6)
LOGGIA_Z0 = 5.0
LOGGIA_R = 1.2
FRONT_HALF = 7.8      # outer half width of the facade
ROOF_Z = 8.6          # parapet / roof base height in the district frame
THRESHOLD_LOCAL = (0.0, 1.2, DOOR_SILL)   # door plane, inside the 1.2 m reveal


def build_facade(coll, m):
    f = Frame(coll, FACADE_OFFSET)
    _stairs_and_plinths(f, m)
    _door_surround(f, m)
    _lanterns(f, m)
    _loggia_dressing(f, m)
    _banners(f, m)
    _pediment(f, m)
    _roof_and_cornice(f, m)
    _markers(f)
    f.merge_by_material()
    return f


def _stairs_and_plinths(f, m):
    # Broad shallow stair, four treads, rising 0.15 m each, plum runner.
    for k in range(1, 5):
        y0, y1 = -1.2 + 0.3 * (k - 1), -1.2 + 0.3 * k
        top = 0.15 * k
        ym = (y0 + y1) / 2.0
        f.box(f"fac_step_{k}", (5.6, 0.3, top), (0, ym, top / 2.0), m["limestone_pale"])
        f.box(f"fac_runner_{k}", (1.8, 0.28, 0.02), (0, ym, top + 0.01), m["plum"], keep=True)
        for sx in (-0.92, 0.92):
            f.box(f"fac_runner_gold_{k}_{sx:+.0f}", (0.06, 0.28, 0.025), (sx, ym, top + 0.012),
                  m["gold"], keep=True)
    # Olive plinths with gold urns, flanking the stair.
    for sx in (-4.0, 4.0):
        f.box("fac_plinth", (1.0, 0.8, 1.0), (sx, -0.6, 0.5), m["limestone_pale"])
        f.cyl("fac_urn", 0.42, 0.5, (sx, -0.6, 1.25), m["gold"], verts=20)
        f.sph("fac_olive", 0.62, (sx, -0.6, 1.95), m["olive"], scale=(1, 1, 1.1))


def _door_surround(f, m):
    # Projecting arch surround with gold trim and pilasters, around the plum door plane.
    f.ring("fac_door_surround", 0.0, DOOR_ARCH_C, DOOR_R, DOOR_R + 0.6, -0.2, 0.4, m["limestone"])
    f.ring("fac_door_gold", 0.0, DOOR_ARCH_C, DOOR_R - 0.1, DOOR_R + 0.02, -0.45, 0.1, m["gold"])
    for sx in (-1.0, 1.0):
        f.box("fac_pilaster", (0.6, 0.4, 2.4), (sx * 2.6, -0.2, 1.8), m["limestone"])
    f.box("fac_door_sill", (2.8, 0.7, 0.12), (0, -0.35, DOOR_SILL + 0.06), m["limestone_pale"])


def _lanterns(f, m):
    for sx in (-1.0, 1.0):
        x = sx * 2.8
        f.box("fac_lantern_base", (0.34, 0.34, 0.08), (x, -0.25, 3.0), m["brass"])
        f.box("fac_lantern_cap", (0.34, 0.34, 0.08), (x, -0.25, 3.62), m["brass"])
        f.sph("fac_lantern_glow", 0.2, (x, -0.25, 3.31), m["glow"], scale=(0.85, 0.85, 1.25))


def _loggia_dressing(f, m):
    # Projecting string course under the loggia.
    f.box("fac_string_course", (15.6, 2.1, 0.5), (0, 0.15, 4.75), m["limestone"])
    for cx in LOGGIA_XS:
        # Plum curtains tied either side of each open arch.
        for sx in (-1.0, 1.0):
            f.box("fac_curtain", (0.5, 0.2, 2.6), (cx + sx * 1.05, 0.25, 5.95), m["plum"], keep=True)
        # Balustrade across the lower part of each arch.
        for k in range(-3, 4):
            f.cyl("fac_baluster", 0.045, 0.6, (cx + k * 0.3, 0.6, 5.3), m["limestone_pale"], verts=8)
        f.box("fac_loggia_rail", (2.4, 0.14, 0.12), (cx, 0.6, 5.65), m["limestone_pale"])


def _banners(f, m):
    for sx in (-1.0, 1.0):
        x = sx * 6.8
        f.box("fac_banner", (1.1, 0.12, 4.0), (x, -0.3, 5.5), m["plum"], keep=True)
        f.box("fac_banner_diamond", (0.5, 0.1, 0.5), (x, -0.37, 5.0), m["gold"], rot=(0, PI / 4, 0), keep=True)
        f.sph("fac_banner_knob", 0.12, (x, -0.3, 7.6), m["gold"])
        f.cyl("fac_banner_rod", 0.04, 1.3, (x, -0.3, 7.7), m["gold"], rot=(0, PI / 2, 0), verts=8)


def _pediment(f, m):
    # Curved pediment: plum half-disc with a gold rim behind it, one centred gold spade.
    _half_disc(f, 2.8, -0.22, m["plum"], "fac_pediment_plum")
    _half_disc(f, 3.0, -0.12, m["gold"], "fac_pediment_gold")
    _spade(f, (0.0, -0.5, 9.9), 1.0, m["gold"])
    f.sph("fac_finial", 0.42, (0, -0.2, 11.8), m["gold"])
    f.cyl("fac_finial_base", 0.22, 0.3, (0, -0.2, 11.35), m["gold"])


def _half_disc(f, radius, yc, material, name):
    # Half disc: a 24-sided fan clipped to the upper half.
    pts = [(radius * math.cos(PI * k / 24.0), radius * math.sin(PI * k / 24.0)) for k in range(25)]
    poly = [(0.0, 0.0)] + pts
    poly = [(x, z + ROOF_Z) for x, z in poly]
    f.prism(name, poly, yc - 0.05, yc + 0.05, material)


def _spade(f, centre, scale, material):
    """Gold spade in the XZ plane facing the plaza (normal -Y), built around `centre`."""
    cx, cy, cz = centre
    tri = [(cx, cz + 0.95 * scale), (cx - 0.6 * scale, cz + 0.05 * scale),
           (cx + 0.6 * scale, cz + 0.05 * scale)]
    f.prism("fac_spade_top", tri, cy - 0.05, cy + 0.05, material)
    for sx in (-1.0, 1.0):
        f.cyl("fac_spade_lobe", 0.34 * scale, 0.1, (cx + sx * 0.32 * scale, cy, cz - 0.02 * scale),
              material, rot=(PI / 2, 0, 0), verts=24)
    f.box("fac_spade_stem", (0.14 * scale, 0.1, 0.6 * scale), (cx, cy, cz - 0.45 * scale), material)
    f.box("fac_spade_foot", (0.6 * scale, 0.1, 0.12 * scale), (cx, cy, cz - 0.62 * scale), material)


def _roof_and_cornice(f, m):
    for sx, ang in ((1.0, 12.0), (-1.0, -12.0)):
        f.box("fac_roof_tile", (5.2, 18.0, 0.35), (sx * 5.3, 9.0, ROOF_Z + 0.2), m["terracotta"],
              rot=(0, math.radians(ang), 0))
    f.box("fac_cornice", (16.2, 0.5, 0.4), (0, -0.25, ROOF_Z - 0.2), m["limestone_pale"])
    for sx in (-1.0, 1.0):
        f.box("fac_cornice_return", (0.3, 4.0, 0.4), (sx * 7.95, 2.0, ROOF_Z - 0.2), m["limestone_pale"])
    # Blank sign surface on the cornice band, centred. No text.
    f.box("fac_sign_board", (5.6, 0.12, 0.36), (0, -0.56, ROOF_Z - 0.2), m["sign"], keep=True)


def _markers(f):
    f.marker("openpoker_facade_threshold", THRESHOLD_LOCAL, "threshold",
             "openpoker_facade_threshold", slot="openpoker-threshold")
    f.marker("openpoker_facade_sign", (0.0, -0.56, ROOF_Z - 0.2), "sign", "openpoker_facade_sign",
             slot="openpoker-facade")
