"""Unit tests for the B2 plot-door spec of the arrival slice (pure Python, no Blender needed).

Run:  python3 -m unittest discover -s blender/tests -p 'test_arrival_*.py'
"""

import json
import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts"))

import arrival_plots as ap  # noqa: E402

CONTRACT = os.path.join(HERE, "..", "..", "shared", "contracts", "house-plots.json")
SPAWN = {"x": 19.0, "z": 0.6}
FOUNTAIN = {"x": 0.0, "z": 0.0}
BOUNDS = {"minX": -42.0, "maxX": 34.0, "minZ": -13.0, "maxZ": 13.0}


def contract():
    with open(CONTRACT) as fh:
        return json.load(fh)


def records():
    return [ap.plot_record(s) for s in ap.PLOT_SPECS]


def validate(plots, obstacles=()):
    return ap.validate_plots(plots, list(obstacles), BOUNDS, SPAWN, FOUNTAIN, [p["id"] for p in contract()["plots"]])


class SpecTest(unittest.TestCase):
    def test_ids_equal_the_contract_street_plots_in_order(self):
        self.assertEqual([s.plot_id for s in ap.PLOT_SPECS], [p["id"] for p in contract()["plots"]])

    def test_salon_plot_is_never_a_street_door(self):
        ids = {s.plot_id for s in ap.PLOT_SPECS}
        for sid in contract()["salon_plots"]:
            self.assertNotIn(sid, ids)

    def test_at_least_six_plots_all_in_the_seeded_district(self):
        self.assertGreaterEqual(len(ap.PLOT_SPECS), 6)
        self.assertTrue(all(s.district == "merchant-quarter" for s in ap.PLOT_SPECS))

    def test_object_name_is_plot_district_n(self):
        self.assertEqual(ap.object_name(ap.PLOT_SPECS[0]), "plot_merchant-quarter_12")
        self.assertEqual(len({ap.object_name(s) for s in ap.PLOT_SPECS}), len(ap.PLOT_SPECS))

    def test_slot_12_is_the_existing_test_builder_door(self):
        r = records()[0]
        self.assertEqual(r["id"], "slot-12")
        self.assertEqual(r["door"], [15.0, 0.0, 3.7])
        self.assertAlmostEqual(r["yaw"], math.pi, places=5)

    def test_specs_are_immutable(self):
        with self.assertRaises(Exception):
            ap.PLOT_SPECS[0].plot_id = "slot-99"


class SizeClassTest(unittest.TestCase):
    def test_frontage_width_maps_to_the_k2_size_classes(self):
        self.assertEqual(ap.size_class(4.19), "small")
        self.assertEqual(ap.size_class(7.1), "medium")
        self.assertEqual(ap.size_class(9.0), "large")


class RecordTest(unittest.TestCase):
    def test_record_shape_and_runtime_frame(self):
        for r in records():
            self.assertEqual(set(r), {"id", "district", "sizeClass", "door", "outward", "yaw"})
            self.assertEqual(len(r["door"]), 3)
            self.assertEqual(len(r["outward"]), 2)
            self.assertAlmostEqual(math.hypot(*r["outward"]), 1.0, places=6)
            self.assertAlmostEqual(r["yaw"], math.atan2(r["outward"][0], r["outward"][1]), places=5)
            self.assertIn(r["sizeClass"], ("small", "medium", "large"))

    def test_blender_to_runtime(self):
        self.assertEqual(ap.runtime_point((1.0, 2.0, 3.0)), [1.0, 3.0, -2.0])
        self.assertEqual(ap.runtime_dir((0.0, 1.0)), [0.0, -1.0])
        self.assertNotIn("-0.0", json.dumps(ap.runtime_dir((0.0, -1.0))))


class ValidateTest(unittest.TestCase):
    def test_the_exported_spec_is_valid(self):
        self.assertEqual(validate(records()), [])

    def test_no_plot_is_on_the_spawn_to_fountain_sightline(self):
        for r in records():
            d = ap.segment_distance((r["door"][0], r["door"][2]), (SPAWN["x"], SPAWN["z"]), (0.0, 0.0))
            self.assertGreater(d, ap.SIGHTLINE_CLEAR, r["id"])

    def test_duplicate_ids_are_rejected(self):
        plots = records()
        errors = validate(plots + [dict(plots[1])])
        self.assertTrue(any("duplicate" in e for e in errors), errors)

    def test_door_inside_an_obstacle_is_rejected(self):
        r = records()[1]
        x, z = r["door"][0], r["door"][2]
        box = {"minX": x - 0.5, "maxX": x + 0.5, "minZ": z - 0.5, "maxZ": z + 0.5}
        self.assertTrue(any("obstacle" in e for e in validate(records(), [box])))

    def test_door_on_the_sightline_is_rejected(self):
        bad = {**records()[1], "door": [10.0, 0.0, 0.3]}
        self.assertTrue(any("sightline" in e for e in validate([bad] + records()[2:] + records()[:1])))

    def test_door_outside_bounds_and_missing_contract_id_are_rejected(self):
        plots = records()
        far = {**plots[2], "door": [60.0, 0.0, -3.1]}
        errors = validate([plots[0], plots[1], far] + plots[4:])
        self.assertTrue(any("bounds" in e for e in errors), errors)
        self.assertTrue(any("slot-15" in e and "missing" in e for e in errors), errors)

    def test_bad_outward_and_size_class_are_rejected(self):
        bad = {**records()[1], "outward": [0.0, 0.0], "sizeClass": "huge"}
        errors = validate([records()[0], bad] + records()[2:])
        self.assertTrue(any("outward" in e for e in errors), errors)
        self.assertTrue(any("sizeClass" in e for e in errors), errors)


class ExportedManifestTest(unittest.TestCase):
    """The exported app manifest carries the plots and an obstacle top_y, and keeps old fields."""

    def setUp(self):
        with open(os.path.join(HERE, "..", "..", "app", "public", "slice", "manifest.json")) as fh:
            self.layout = json.load(fh)["runtime_layout"]

    def test_plots_are_the_spec_records_and_valid(self):
        plaza = self.layout["plaza"]
        self.assertEqual(self.layout["plots"], records())
        self.assertEqual(ap.validate_plots(self.layout["plots"], plaza["obstacles"], plaza["bounds"], plaza["spawn"],
                                           plaza["fountain"], [p["id"] for p in contract()["plots"]]), [])

    def test_every_plaza_obstacle_has_a_top_y(self):
        for o in self.layout["plaza"]["obstacles"]:
            self.assertIsInstance(o.get("top_y"), (int, float), o)
            self.assertGreater(o["top_y"], 0.0, o)

    def test_old_fields_are_kept(self):
        plaza = self.layout["plaza"]
        for key in ("glb", "spawn", "fountain", "bounds", "obstacles", "test_builder_door", "replaces_chunks", "lighting"):
            self.assertIn(key, plaza)
        self.assertIn("facade_door", self.layout)
        self.assertIn("salon", self.layout)


class SegmentTest(unittest.TestCase):
    def test_segment_distance(self):
        self.assertAlmostEqual(ap.segment_distance((5.0, 3.0), (0.0, 0.0), (10.0, 0.0)), 3.0)
        self.assertAlmostEqual(ap.segment_distance((13.0, 4.0), (0.0, 0.0), (10.0, 0.0)), 5.0)
        self.assertAlmostEqual(ap.segment_distance((3.0, 4.0), (0.0, 0.0), (0.0, 0.0)), 5.0)


if __name__ == "__main__":
    unittest.main()
