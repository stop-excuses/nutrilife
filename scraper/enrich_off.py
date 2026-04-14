"""
Enrich all_products.json with ingredients from Open Food Facts.
Matches products by keyword → English search term, takes best result by nutrient proximity.
Only processes products without ingredients_raw.

Usage:
    python scraper/enrich_off.py
    python sync_offers.py   # regenerate JS
"""

import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from ingredients_analyzer import analyze_ingredients

AP_PATH = Path(__file__).parent.parent / "data" / "all_products.json"

OFF_SEARCH_V2 = "https://world.openfoodfacts.org/api/v2/search"
OFF_SEARCH_V1 = "https://world.openfoodfacts.org/cgi/search.pl"
OFF_HEADERS = {"User-Agent": "NutriLife/1.0 (https://github.com/stop-excuses/nutrilife)"}

# (bg_substring, en_search_term)  — longest match wins, order matters
KEYWORD_MAP = [
    # Fish / seafood
    ("риба тон",            "canned tuna"),
    ("пушена сьомга",       "smoked salmon"),
    ("сьомга",              "salmon"),
    ("скумрия",             "canned mackerel"),
    ("херинга",             "herring"),
    ("сельодка",            "herring"),
    ("треска",              "cod fish"),
    ("пъстърва",            "trout"),
    ("ципура",              "sea bream"),
    ("лаврак",              "sea bass"),
    ("скарида",             "shrimp"),
    ("калмар",              "squid"),
    # Poultry / meat
    ("пилешки гърди",       "chicken breast"),
    ("пилешко гърди",       "chicken breast"),
    ("пилешко филе",        "chicken breast fillet"),
    ("пуешко гърди",        "turkey breast"),
    ("пуешко филе",         "turkey breast fillet"),
    ("пуешко",              "turkey"),
    ("пилешко",             "chicken"),
    ("пиле",                "chicken"),
    ("телешко",             "beef"),
    ("говеждо",             "beef"),
    ("свинско",             "pork"),
    # Dairy / eggs
    ("яйц",                 "eggs"),
    ("скир",                "skyr"),
    ("извара",              "quark cottage cheese"),
    ("кисело мляко",        "plain yogurt"),
    ("моцарела",            "mozzarella"),
    ("сирене",              "feta cheese"),
    ("извара",              "cottage cheese"),
    # Legumes / grains
    ("леща",                "lentils"),
    ("нахут",               "chickpeas"),
    ("боб",                 "beans"),
    ("фасул",               "beans"),
    ("овесени ядки",        "rolled oats"),
    ("овес",                "oats"),
    ("ориз",                "rice"),
    ("киноа",               "quinoa"),
    ("елда",                "buckwheat"),
    # Nuts / seeds / fats
    ("бадем",               "almonds"),
    ("орех",                "walnuts"),
    ("кашу",                "cashews"),
    ("фъстък",              "peanuts"),
    ("слънчогледово масло", "sunflower oil"),
    ("зехтин",              "olive oil"),
    ("кокосово масло",      "coconut oil"),
    # Spreads / sauces
    ("фъстъчено масло",     "peanut butter"),
    ("тахан",               "tahini"),
    ("хумус",               "hummus"),
    ("доматен сос",         "tomato sauce"),
    ("кетчуп",              "ketchup"),
    # Canned
    ("консерва",            "canned vegetables"),
    ("царевица",            "canned corn"),
    ("грах",                "canned peas"),
    # Dairy drinks
    ("прясно мляко",        "whole milk"),
    ("мляко",               "milk"),
    ("протеинов шейк",      "protein shake"),
    ("протеин",             "whey protein powder"),
]


def _search_off(term: str, n: int = 5) -> list[dict]:
    """Return up to n products from OFF matching term. Tries v2 then v1."""
    fields = "product_name,ingredients_text,nutriments"
    # v2 API
    try:
        r = requests.get(OFF_SEARCH_V2, params={
            "search_terms": term,
            "fields": fields,
            "page_size": n,
        }, headers=OFF_HEADERS, timeout=12)
        if r.status_code == 200 and r.text.strip():
            return r.json().get("products", [])
    except Exception:
        pass
    # v1 fallback
    try:
        r = requests.get(OFF_SEARCH_V1, params={
            "search_terms": term,
            "search_simple": 1,
            "action": "process",
            "json": 1,
            "page_size": n,
            "fields": fields,
        }, headers=OFF_HEADERS, timeout=12)
        if r.status_code == 200 and r.text.strip():
            return r.json().get("products", [])
    except Exception as e:
        print(f"  OFF error for '{term}': {e}")
    return []


def _best_match(products: list[dict], product: dict) -> dict | None:
    """Pick the OFF product closest to our product's macros."""
    macros = product.get("macros") or {}
    our_p = macros.get("p")
    our_f = macros.get("f")
    our_c = macros.get("c")

    candidates = [p for p in products if p.get("ingredients_text", "").strip()]
    if not candidates:
        return None

    if our_p is None:
        return candidates[0]  # no macro data, take first

    def score(p):
        n = p.get("nutriments", {})
        tp = n.get("proteins_100g", 0) or 0
        tf = n.get("fat_100g", 0) or 0
        tc = n.get("carbohydrates_100g", 0) or 0
        return abs(tp - our_p) + abs(tf - our_f) + abs(tc - our_c)

    return min(candidates, key=score)


def _find_keyword(name_lower: str) -> str | None:
    for bg, en in KEYWORD_MAP:
        if bg in name_lower:
            return en
    return None


def main():
    data = json.loads(AP_PATH.read_text(encoding="utf-8"))
    products = data.get("products", [])

    targets = [p for p in products if not p.get("ingredients_raw")]
    print(f"Products without ingredients: {len(targets)} / {len(products)}")

    enriched = 0
    skipped = 0

    for p in targets:
        name_lower = (p.get("name") or "").lower()
        term = _find_keyword(name_lower)
        if not term:
            skipped += 1
            continue

        print(f"  Searching OFF: '{term}'  ← {p.get('name', '?')[:50]}")
        results = _search_off(term)
        match = _best_match(results, p)
        time.sleep(0.5)  # be polite

        if not match:
            print(f"    no match found")
            continue

        raw = match["ingredients_text"].strip()
        flags = analyze_ingredients(raw)
        red   = sum(1 for f in flags if f["level"] == "red")
        amber = sum(1 for f in flags if f["level"] == "amber")

        p["ingredients_raw"]   = raw
        p["ingredients_source"] = "open_food_facts"
        p["off_matched_name"]  = match.get("product_name", "")
        p["ingredients_flags"] = flags
        p["junk_count"]        = red
        p["amber_count"]       = amber
        p["clean_label"]       = red == 0 and amber == 0

        flag_str = f"  🔴{red} 🟡{amber}" if (red or amber) else "  ✓ clean"
        print(f"    matched: {match.get('product_name','?')[:50]}{flag_str}")
        enriched += 1

    AP_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone. Enriched: {enriched}  Skipped (no keyword): {skipped}")
    print("Run: python sync_offers.py")


if __name__ == "__main__":
    main()
