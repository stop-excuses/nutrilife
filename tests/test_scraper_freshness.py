import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scraper"))

from scraper import merge_unavailable_stores


class MergeUnavailableStoresTests(unittest.TestCase):
    def test_partial_scan_keeps_unattempted_previous_failure(self):
        result = merge_unavailable_stores(
            {"T-Market"},
            {"Billa", "Dar"},
            {"Billa"},
        )
        self.assertEqual(result, ["Dar", "T-Market"])

    def test_success_clears_only_that_stores_previous_failure(self):
        result = merge_unavailable_stores(
            {"T-Market", "Dar"},
            {"T-Market", "Kaufland"},
            {"T-Market", "Kaufland"},
        )
        self.assertEqual(result, ["Dar"])

    def test_current_failures_are_added(self):
        result = merge_unavailable_stores(
            set(),
            {"Billa", "Dar"},
            {"Billa"},
        )
        self.assertEqual(result, ["Dar"])


if __name__ == "__main__":
    unittest.main()
