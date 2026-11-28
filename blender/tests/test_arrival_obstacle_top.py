"""Unit tests for obstacle top_y assignment (pure Python, no Blender needed).

Run:  python3 -m unittest discover -s blender/tests -p 'test_arrival_*.py'
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts"))

from arrival_obstacle_top import with_top_y  # noqa: E402


def box(x0, x1, z0, z1, top=None):
    b = {"minX": x0, "maxX": x1, "minZ": z0, "maxZ": z1}
    return b if top is None else {**b, "top_y": top}


class WithTopYTest(unittest.TestCase):
    def test_identical_footprint_takes_its_top(self):
        self.assertEqual(with_top_y([box(0, 1, 0, 1)], [box(0, 1, 0, 1, 0.6)]), [box(0, 1, 0, 1, 0.6)])

    def test_split_parts_inside_one_shipped_box_take_the_highest(self):
        shipped = [box(-7.8, 7.8, -9.7, -8.5)]
        measured = [box(-7.8, -1.3, -9.7, -8.5, 8.6), box(1.3, 7.8, -9.7, -8.5, 8.4)]
        self.assertEqual(with_top_y(shipped, measured)[0]["top_y"], 8.6)

    def test_a_tall_neighbour_that_only_touches_does_not_raise_a_low_box(self):
        shipped = [box(0, 2, 0, 2), box(2, 10, 0, 2)]
        measured = [box(0, 2.05, 0, 2, 0.4), box(1.95, 10, 0, 2, 8.0)]
        self.assertEqual([b["top_y"] for b in with_top_y(shipped, measured)], [0.4, 8.0])

    def test_a_lamp_standing_on_a_low_stair_does_not_raise_the_stair(self):
        # The west perron (top 0.6) and the casino portal lamp (its own obstacle, 2.3 m) inside it.
        shipped = [box(-6.65, -1.45, -7.3, -4.6), box(-2.37, -2.23, -4.82, -4.68)]
        measured = [box(-5.9, -1.45, -7.3, -4.6, 0.6), box(-4.4, -1.45, -5.8, -5.8, 0.6),
                    box(-2.37, -2.23, -4.82, -4.68, 2.3)]
        self.assertEqual([b["top_y"] for b in with_top_y(shipped, measured)], [0.6, 2.3])

    def test_degenerate_measured_planes_still_count(self):
        self.assertEqual(with_top_y([box(0, 2, 0, 2)], [box(1, 1, 0, 2, 0.45)])[0]["top_y"], 0.45)

    def test_footprints_and_order_are_kept_and_inputs_not_mutated(self):
        shipped = [box(5, 6, 5, 6), box(0, 1, 0, 1)]
        measured = [box(0, 1, 0, 1, 1.0), box(5, 6, 5, 6, 2.0)]
        out = with_top_y(shipped, measured)
        self.assertEqual([(b["minX"], b["top_y"]) for b in out], [(5, 2.0), (0, 1.0)])
        self.assertNotIn("top_y", shipped[0])

    def test_a_box_with_no_measured_geometry_is_an_error(self):
        with self.assertRaises(ValueError):
            with_top_y([box(0, 1, 0, 1)], [box(5, 6, 5, 6, 1.0)])


if __name__ == "__main__":
    unittest.main()
