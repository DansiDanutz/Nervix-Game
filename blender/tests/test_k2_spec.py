"""Unit tests for the K2 house-kit layout spec (pure Python, no Blender needed).

Run:  python3 -m unittest discover -s blender/tests -p 'test_k2_*.py'
"""

import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts"))

import k2_spec as spec  # noqa: E402

EPS = 1e-6


def box_overlap(a, b):
    """Axis-aligned overlap in plan (x, y) of two boxes given as {center, size}."""
    for i in (0, 1):
        if abs(a["center"][i] - b["center"][i]) >= (a["size"][i] + b["size"][i]) / 2.0 - EPS:
            return False
    return True


class VariantMatrix(unittest.TestCase):
    def test_three_sizes_by_three_facades(self):
        self.assertEqual(list(spec.SIZE_CLASSES), ["small", "medium", "large"])
        self.assertEqual(list(spec.FACADES), ["shutters", "awning", "loggia"])
        ids = spec.variant_ids()
        self.assertEqual(len(ids), 9)
        self.assertEqual(len(set(ids)), 9)
        self.assertIn("house_small_shutters", ids)
        self.assertIn("house_large_loggia", ids)

    def test_sizes_grow(self):
        s, m, l = (spec.SIZE_CLASSES[k] for k in ("small", "medium", "large"))
        self.assertLess(s.width, m.width)
        self.assertLess(m.width, l.width)
        self.assertLessEqual(s.storeys, l.storeys)

    def test_every_facade_has_a_roof_kind_and_awning_flag(self):
        for f in spec.FACADES.values():
            self.assertIn(f.roof, {"gable", "hip"})
            self.assertIsInstance(f.awning_default, bool)
        self.assertTrue(spec.FACADES["awning"].awning_default)


class Slots(unittest.TestCase):
    def test_slot_counts_between_6_and_12_and_grow_with_size(self):
        for facade in spec.FACADES:
            counts = [len(spec.slot_specs(size, facade)) for size in spec.SIZE_CLASSES]
            for c in counts:
                self.assertGreaterEqual(c, 6)
                self.assertLessEqual(c, 12)
            self.assertEqual(counts, sorted(counts))
            self.assertEqual(counts[0], 6)
            self.assertEqual(counts[-1], 12)

    def test_slot_names_are_slot_1_to_n(self):
        for size, facade in spec.variants():
            names = [s["name"] for s in spec.slot_specs(size, facade)]
            self.assertEqual(names, [f"slot_{i}" for i in range(1, len(names) + 1)])

    def test_slots_inside_interior_and_spaced(self):
        for size, facade in spec.variants():
            x0, x1, y0, y1, z0, z1 = spec.interior_bounds(size)
            slots = spec.slot_specs(size, facade)
            for s in slots:
                x, y, z = s["position"]
                self.assertTrue(x0 < x < x1 and y0 < y < y1 and z0 < z < z1, (size, facade, s))
                self.assertIn(s["surface"], {"shelf", "table"})
                self.assertEqual(len(s["max_extent"]), 3)
            for i, a in enumerate(slots):
                for b in slots[i + 1:]:
                    d = math.dist(a["position"], b["position"])
                    self.assertGreaterEqual(d, 0.45, (size, facade, a["name"], b["name"]))

    def test_slots_rest_on_furniture(self):
        for size, facade in spec.variants():
            furn = spec.furniture(size, facade)
            for s in spec.slot_specs(size, facade):
                x, y, _ = s["position"]
                hits = [f for f in furn if f["kind"] in {"shelf", "table"}
                        and abs(x - f["center"][0]) <= f["size"][0] / 2 + EPS
                        and abs(y - f["center"][1]) <= f["size"][1] / 2 + EPS]
                self.assertTrue(hits, (size, facade, s["name"]))


class Anchors(unittest.TestCase):
    def test_door_outward_is_unit_horizontal_and_points_away(self):
        for size, facade in spec.variants():
            door = spec.door_spec(size, facade)
            ox, oy, oz = door["outward"]
            self.assertAlmostEqual(math.hypot(ox, oy, oz), 1.0)
            self.assertAlmostEqual(oz, 0.0)
            # The building lies on +y; outward must point to -y (out of the front facade).
            self.assertLess(oy, 0.0)
            w = spec.SIZE_CLASSES[size].width
            self.assertLessEqual(abs(door["position"][0]) + door["width"] / 2, w / 2 - spec.WALL_T)
            self.assertGreaterEqual(door["height"], 2.2)
            self.assertGreaterEqual(door["width"], 1.1)

    def test_door_corridor_is_clear_of_furniture(self):
        for size, facade in spec.variants():
            corridor = spec.door_corridor(size, facade)
            for f in spec.furniture(size, facade):
                self.assertFalse(box_overlap(corridor, f), (size, facade, f["kind"]))

    def test_furniture_does_not_overlap(self):
        for size, facade in spec.variants():
            furn = spec.furniture(size, facade)
            for i, a in enumerate(furn):
                for b in furn[i + 1:]:
                    self.assertFalse(box_overlap(a, b), (size, facade, a["kind"], b["kind"]))

    def test_station_is_behind_counter_and_faces_door_side(self):
        for size, facade in spec.variants():
            st = spec.station_spec(size, facade)
            counter = [f for f in spec.furniture(size, facade) if f["kind"] == "counter"]
            self.assertEqual(len(counter), 1)
            c = counter[0]
            self.assertGreater(st["position"][1], c["center"][1] + c["size"][1] / 2)
            self.assertLess(st["facing"][1], 0.0)
            x0, x1, y0, y1, _, _ = spec.interior_bounds(size)
            self.assertTrue(x0 < st["position"][0] < x1 and y0 < st["position"][1] < y1)

    def test_sign_faces_the_street_and_has_a_size(self):
        for size, facade in spec.variants():
            sign = spec.sign_spec(size, facade)
            self.assertEqual(tuple(sign["normal"]), (0.0, -1.0, 0.0))
            self.assertLess(sign["position"][1], 0.0)   # in front of the facade plane
            self.assertGreater(sign["position"][2], 2.0)
            self.assertGreater(sign["size"][0], sign["size"][1])

    def test_windows_do_not_overlap_the_door(self):
        for size, facade in spec.variants():
            door = spec.door_spec(size, facade)
            dx0 = door["position"][0] - door["width"] / 2
            dx1 = door["position"][0] + door["width"] / 2
            w = spec.SIZE_CLASSES[size].width
            for win in spec.window_specs(size, facade):
                self.assertLessEqual(abs(win["x"]) + win["width"] / 2, w / 2 - 0.4, (size, facade, win))
                if win["storey"] == 0:
                    self.assertTrue(win["x"] + win["width"] / 2 <= dx0 - 0.2
                                    or win["x"] - win["width"] / 2 >= dx1 + 0.2, (size, facade, win))


class Runtime(unittest.TestCase):
    def test_to_runtime_maps_blender_axes(self):
        self.assertEqual(spec.to_runtime((1.0, 2.0, 3.0)), (1.0, 3.0, -2.0))
        self.assertEqual(spec.to_runtime((0.0, -1.0, 0.0)), (0.0, 0.0, 1.0))

    def test_manifest_entry_shape(self):
        for size, facade in spec.variants():
            e = spec.manifest_house(size, facade)
            self.assertEqual(e["id"], spec.house_id(size, facade))
            self.assertEqual(e["file"], e["id"] + ".glb")
            self.assertEqual(e["anchors"]["door"]["outward"], [0.0, 0.0, 1.0])
            self.assertEqual(e["anchors"]["door"]["node"], "anchor_door")
            self.assertEqual(e["anchors"]["sign"]["node"], "anchor_sign")
            self.assertEqual(e["anchors"]["station"]["node"], "anchor_station")
            self.assertEqual(len(e["slots"]), len(spec.slot_specs(size, facade)))
            self.assertIn("opt_awning", [o["node"] for o in e["options"]])

    def test_manifest_is_identity_free(self):
        import json
        text = json.dumps(spec.build_manifest()).lower()
        for token in spec.BANNED_IDENTITY_TOKENS:
            self.assertNotIn(token.lower(), text)


if __name__ == "__main__":
    unittest.main()
