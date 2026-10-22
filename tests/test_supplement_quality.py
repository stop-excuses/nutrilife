import sys
import unittest
from unittest.mock import patch
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "scraper"))

from supplement_scrapers import is_relevant_product
import supplement_scrapers as scraper
from sync_supplements import is_snack_food_junk, repair_protein_units, repair_package_count, has_usable_package_price


PROTEIN_STICK = "ВИТАМИНОВ ПРОТЕИНОВ СТИК ХРУПКАВА БИСКВИТА 40 г * 15 RICE UP!"


class SupplementQualityTests(unittest.TestCase):
    def test_ten_ampoules_do_not_become_1666_servings(self):
        item = {'name': 'Витамин C ампули за пиене 5 мл х10 ампули Дансон', 'category': 'vitamin_c', 'price_bgn': 13.03, 'servings': 1666, 'active': {'vitamin_c_mg': 500}, 'weight_grams': 30000}
        repair_package_count(item)
        self.assertEqual(item['count'], 10)
        self.assertIsNone(item['weight_grams'])
        self.assertEqual(item['price_per_active_unit']['bgn_per_1000mg_vitamin_c'], 2.61)

    def test_single_sachet_price_is_not_used_for_an_entire_creatine_box(self):
        self.assertFalse(has_usable_package_price({'category': 'creatine', 'price_bgn': 1.19, 'weight_grams': 390}))
        self.assertTrue(has_usable_package_price({'category': 'creatine', 'price_bgn': 71.4, 'weight_grams': 390}))

    def test_multipack_name_repairs_larger_unrelated_protein_weight(self):
        item = {'name': 'Renew Whey Protein Isolate 30x30 грама', 'category': 'protein', 'price_bgn': 114, 'weight_grams': 2000, 'active': {'estimated_total_protein_g': 1700, 'estimated_protein_ratio_pct': 85}}
        self.assertTrue(repair_protein_units(item))
        self.assertEqual(item['weight_grams'], 900)
        self.assertEqual(item['price_per_active_unit']['bgn_per_25g_protein'], 3.73)

    def test_fhl_euro_price_uses_current_product_not_old_or_related_prices(self):
        soup = scraper.BeautifulSoup('<span class="fhl-price-output"><span class="opt1">63.92 €</span><span><del>79.90 €</del></span></span><div class="fhl-product-card__price">8.00 €</div>', 'html.parser')
        price, euro, currency, _, _ = scraper.parse_source_price('FHL', soup)
        self.assertEqual((price, euro, currency), (125.02, 63.92, 'EUR'))
        self.assertEqual(scraper.extract_promo_info(soup, price, 'FHL')['discount_pct'], 20)

    def test_product_package_weight_wins_over_larger_related_package(self):
        source = next(s for s in scraper.SOURCES if s.name == 'FHL')
        html = '<h1>Anabolic Whey 2000g</h1><span class="fhl-price-output"><span class="opt1">63.92 €</span></span><aside>Other whey 5000g</aside>'
        with patch.object(scraper, 'fetch', return_value=html):
            product = scraper.parse_product(source, 'https://www.fhl.bg/products/product/6775/whey.html', 'protein')
        self.assertIsNotNone(product)
        self.assertEqual(product['weight_grams'], 2000)

    def test_forced_fhl_category_does_not_bypass_snack_exclusions(self):
        source = next(s for s in scraper.SOURCES if s.name == 'FHL')
        for name in ['Protein Bar 70g', 'Еднократна доза Whey']:
            with self.subTest(name=name), patch.object(scraper, 'fetch', return_value=f'<h1>{name}</h1>'):
                self.assertIsNone(scraper.parse_product(source, 'https://www.fhl.bg/products/product/1/snack.html', 'protein'))

    def test_fhl_related_vitamin_d_cannot_be_classified_as_vitamin_b(self):
        source = next(s for s in scraper.SOURCES if s.name == 'FHL')
        with patch.object(scraper, 'fetch', return_value='<h1>Vitamin D3 1000IU - 180 Caps</h1>'):
            self.assertIsNone(scraper.parse_product(source, 'https://www.fhl.bg/products/product/1/vitamin-d3.html', 'vitamin_b'))

    def test_fhl_discovery_accepts_new_product_cards_without_promoted_cross_sells(self):
        source = next(s for s in scraper.SOURCES if s.name == 'FHL')
        listing = 'https://www.fhl.bg/products/listing/87/surovatachen-protein.html'
        product = 'https://www.fhl.bg/products/product/6775/whey.html'
        html = f'<a href="/products/product/1/collagen.html">Promo</a><h3 class="fhl-product-card__title"><a href="{product}">Whey</a></h3>'
        with patch.object(scraper, 'fetch', side_effect=[f'<url><loc>{listing}</loc></url>', html]):
            self.assertEqual(scraper.discover_fhl_urls(source, 10, {'protein'}), {'protein': [product]})

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

    def test_empty_discovery_refreshes_known_urls_within_scope_and_limit(self):
        source = next(s for s in scraper.SOURCES if s.name == 'FHL')
        existing = {
            'https://www.fhl.bg/one': {'store': 'FHL', 'category': 'protein'},
            'https://www.fhl.bg/two': {'store': 'FHL', 'category': 'protein'},
            'https://www.fhl.bg/three': {'store': 'FHL', 'category': 'creatine'},
            'https://other.bg/four': {'store': 'Other', 'category': 'protein'},
        }
        with patch.object(scraper, 'SOURCES', [source]), patch.object(scraper, 'discover_urls', return_value={}), patch.object(scraper, 'scrape_one', return_value=None) as fetch, patch.object(scraper.time, 'sleep'):
            scraper.scrape(1, categories={'protein'}, existing_by_url=existing)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(fetch.call_args.args[:3], (source, 'protein', 'https://www.fhl.bg/one'))

    def test_multi_source_direct_urls_use_their_own_store(self):
        urls = ['https://www.fhl.bg/protein', 'https://workout.bg/protein']
        with patch.object(scraper, 'scrape_one', return_value=None) as fetch:
            scraper.scrape(2, sources={'fhl', 'workoutbg'}, categories={'protein'}, urls=urls)
        actual = {call.args[2]: call.args[0].name for call in fetch.call_args_list}
        self.assertEqual(actual, dict(zip(urls, ['FHL', 'WorkoutBG'])))


if __name__ == "__main__":
    unittest.main()
