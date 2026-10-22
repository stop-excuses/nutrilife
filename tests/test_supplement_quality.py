import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "scraper"))

from supplement_scrapers import is_relevant_product
from sync_supplements import is_snack_food_junk, repair_protein_units


PROTEIN_STICK = "ВИТАМИНОВ ПРОТЕИНОВ СТИК ХРУПКАВА БИСКВИТА 40 г * 15 RICE UP!"


class SupplementQualityTests(unittest.TestCase):
    def test_protein_stick_is_not_scraped_as_a_protein_powder(self):
        self.assertFalse(is_relevant_product("protein", PROTEIN_STICK, "https://framar.bg/product/rice-up"))
        self.assertFalse(is_relevant_product("protein", "RICE UP Vitamin Protein Stick Box / 15 x 40 g", "https://silabg.com/product/rice-up"))

    def test_sync_repair_drops_existing_protein_stick(self):
        item = {
            "category": "protein",
            "name": PROTEIN_STICK,
            "price_bgn": 37.67,
            "weight_grams": 40,
            "active": {"protein_g": 40},
        }
        self.assertTrue(is_snack_food_junk(PROTEIN_STICK))
        self.assertFalse(repair_protein_units(item))

    def test_whey_with_cookie_flavor_stays_in_protein_category(self):
        name = "100% Whey Protein с вкус на бисквитки и крем"
        self.assertFalse(is_snack_food_junk(name))
        self.assertTrue(is_relevant_product("protein", name, "https://example.com/whey"))


if __name__ == "__main__":
    unittest.main()
