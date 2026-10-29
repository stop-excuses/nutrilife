"""Check the publishable HTML and local assets without making network requests."""
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit
import unittest

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]


class SiteIntegrityTests(unittest.TestCase):
    def test_local_links_and_assets_exist(self):
        for page in ROOT.glob("*.html"):
            document = BeautifulSoup(page.read_text(), "html.parser")
            for element in document.select("[src],link[href],a[href]"):
                target = element.get("src", element.get("href", ""))
                url = urlsplit(target)
                if url.scheme or url.netloc or not url.path:
                    continue
                with self.subTest(page=page.name, target=target):
                    self.assertTrue((page.parent / unquote(url.path)).exists())

    def test_unique_ids(self):
        for page in ROOT.glob("*.html"):
            document = BeautifulSoup(page.read_text(), "html.parser")
            ids = Counter(element["id"] for element in document.select("[id]"))
            with self.subTest(page=page.name):
                self.assertEqual([key for key, count in ids.items() if count > 1], [])

    def test_main_navigation_has_all_eight_destinations(self):
        expected = {
            "index.html", "health-check.html", "move.html", "eat.html",
            "smart-food.html", "smart-supplements.html", "start.html", "mental.html",
        }
        for filename in expected:
            document = BeautifulSoup((ROOT / filename).read_text(), "html.parser")
            with self.subTest(page=filename):
                self.assertEqual({link.get("href") for link in document.select(".navbar a")}, expected)

    def test_no_typographic_quotes_in_class_attributes(self):
        for page in ROOT.glob("*.html"):
            with self.subTest(page=page.name):
                self.assertNotIn("class=”", page.read_text())
                self.assertNotIn("class=“", page.read_text())


if __name__ == "__main__":
    unittest.main()
