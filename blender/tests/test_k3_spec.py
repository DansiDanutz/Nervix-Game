"""K3 product display kit: pure spec tests (no bpy). Run: python3 -m unittest blender/tests/test_k3_spec.py"""

import json
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "blender", "scripts"))

import k3_spec as spec  # noqa: E402

CONTRACT = os.path.join(ROOT, "shared", "contracts", "product-categories.json")
BANNED = ("dangg", "openpoker", "test builder", "workshop")


def _contract_ids():
    with open(CONTRACT, encoding="utf-8") as fh:
        return [c["id"] for c in json.load(fh)["categories"]]


class ContractCoverage(unittest.TestCase):
    def test_every_contract_category_has_a_product_and_a_fixture(self):
        cats = spec.load_categories()
        self.assertEqual([c["id"] for c in cats], _contract_ids())
        for cat in cats:
            self.assertIn(cat["id"], spec.PRODUCTS, cat["id"])
            self.assertIn(cat["display"], spec.DISPLAY_FIXTURE, cat["display"])
            self.assertIn(spec.DISPLAY_FIXTURE[cat["display"]], spec.FIXTURES)

    def test_generic_fallback_product_exists(self):
        self.assertIn(spec.FALLBACK_ID, spec.PRODUCTS)
        self.assertIn(spec.FALLBACK_FIXTURE, spec.FIXTURES)

    def test_names_follow_asset_convention(self):
        self.assertEqual(spec.product_name("drink"), "asset.product.drink")
        self.assertEqual(spec.fixture_name("shelf"), "asset.fixture.shelf")
        self.assertEqual(spec.price_tag_anchor_name("drink"), "anchor.price_tag.drink")
        self.assertEqual(spec.display_name("drink"), "display.drink")


class SlotFit(unittest.TestCase):
    def test_fixtures_fit_the_slot_envelope(self):
        sw, sd, sh = spec.SLOT_ENVELOPE
        for fid, fx in spec.FIXTURES.items():
            w, d, h = fx["size"]
            self.assertLessEqual(w, sw, fid)
            self.assertLessEqual(d, sd, fid)
            self.assertLessEqual(h, sh, fid)

    def test_products_fit_their_fixture_surface_and_the_slot_height(self):
        for display in spec.build_display_sets():
            fx = spec.FIXTURES[display["fixture"]]
            pw, pd, ph = spec.PRODUCTS[display["category"]]["size"]
            sw, sd = fx["surface"]
            self.assertLessEqual(pw, sw, display["category"])
            self.assertLessEqual(pd, sd, display["category"])
            top = fx["product_z"] + ph
            self.assertLessEqual(top, spec.SLOT_ENVELOPE[2], display["category"])
            if "clear_height" in fx:
                self.assertLessEqual(ph, fx["clear_height"], display["category"])

    def test_price_tag_anchor_is_in_front_and_inside_the_slot(self):
        for display in spec.build_display_sets():
            fx = spec.FIXTURES[display["fixture"]]
            x, y, z = display["price_tag_anchor"]
            self.assertLessEqual(y, -fx["size"][1] / 2 + 1e-6, display["category"])
            self.assertGreaterEqual(y, -spec.SLOT_ENVELOPE[1] / 2, display["category"])
            self.assertLessEqual(abs(x), spec.SLOT_ENVELOPE[0] / 2)
            self.assertGreater(z, 0.0)
            self.assertLess(z, spec.SLOT_ENVELOPE[2])


class Palette(unittest.TestCase):
    def test_palette_is_16_distinct_swatches_with_the_a01_core(self):
        hexes = [s["hex"].upper() for s in spec.PALETTE]
        self.assertEqual(len(hexes), 16)
        self.assertEqual(len(set(hexes)), 16)
        names = {s["name"] for s in spec.PALETTE}
        for core in ("sandstone", "terracotta", "teal", "wine", "brass", "wood"):
            self.assertIn(core, names)

    def test_every_part_swatch_exists(self):
        names = {s["name"] for s in spec.PALETTE}
        for sw in spec.used_swatches():
            self.assertIn(sw, names)


class Manifest(unittest.TestCase):
    def test_manifest_is_pure_deterministic_and_identity_free(self):
        a = spec.build_manifest("product_kit.glb")
        b = spec.build_manifest("product_kit.glb")
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))
        text = json.dumps(a).lower()
        for word in BANNED:
            self.assertNotIn(word, text)

    def test_manifest_lists_categories_in_contract_order_plus_fallback(self):
        m = spec.build_manifest("product_kit.glb")
        self.assertEqual(m["kit"], "k3-product-display")
        self.assertEqual([c["id"] for c in m["categories"]], _contract_ids())
        self.assertEqual(m["fallback"]["product"], spec.product_name(spec.FALLBACK_ID))
        for c in m["categories"]:
            self.assertEqual(c["product"], spec.product_name(c["id"]))
            self.assertTrue(c["fixture"].startswith("asset.fixture."))
            self.assertEqual(c["price_tag_anchor"]["node"], spec.price_tag_anchor_name(c["id"]))
            self.assertEqual(len(c["price_tag_anchor"]["runtime_offset"]), 3)

    def test_runtime_offset_uses_the_repo_axis_mapping(self):
        # Blender (x, y, z) -> runtime (x, z, -y)
        self.assertEqual(spec.to_runtime((1.0, -2.0, 3.0)), [1.0, 3.0, 2.0])


if __name__ == "__main__":
    unittest.main()
