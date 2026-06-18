#!/usr/bin/env python3
"""Enrich data/offers.json + data/market_memory.json with pazarko.bg image URLs.

For each offer/product that lacks a real image_url, find the closest
pazarko.bg product by (name fuzzy match + store) and borrow its image_url.

Run after `python scraper/pazarko_scraper.py` produces data/pazarko.json.
"""

import json
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
PAZARKO_PATH = os.path.join(ROOT, "data", "pazarko.json")
OFFERS_PATH = os.path.join(ROOT, "data", "offers.json")
# sync_offers.py rebuilds market_memory from all_products, so we write there.
ALL_PRODUCTS_PATH = os.path.join(ROOT, "data", "all_products.json")


# Match quality knobs — chosen so that the tests/image-match-quality.js
# suite stays under its 5% wrong-match threshold.
MIN_JACCARD = 0.65          # token overlap (was 0.32 — too loose)
MIN_SHARED_TOKENS = 3       # need at least N matching tokens
REJECT_ON_BRAND_MISMATCH = True

# Map our store labels -> pazarko store labels. Cross-store matching is OFF
# because borrowing a Kaufland image for a Billa product gave "right category,
# wrong brand" hits all over the catalog.
STORE_ALIAS = {
    "Kaufland": ["Kaufland"],
    "Lidl": ["Lidl"],
    "Billa": ["Billa"],
    "T-Market": ["TMarket"],
    "Metro": ["Metro"],
    "BulMag": ["BulMag"],
    "Avanti": ["Avanti"],
}

# Words that can never differ between match and candidate — if our product
# says "пилешки бургер" we must NOT borrow an image whose name contains
# "маршмелоу". One such conflict is enough to reject the match.
FOOD_TYPE_GROUPS = [
    # Proteins
    {"пилешк", "пиле"},
    {"телешк", "говежд"},
    {"свинск"},
    {"пуешк", "пуе"},
    {"риба", "тон", "сьомга", "скумрия", "ципура", "лаврак", "пъстърва", "херинга", "треска"},
    {"яйц", "яйца"},
    # Dairy
    {"кисело мляко", "йогурт"},
    {"извара", "скир", "cottage"},
    {"сирене"},
    {"кашкавал"},
    {"моцарела"},
    # Pantry / dry
    {"леща"}, {"нахут"}, {"боб", "фасул"}, {"грах"},
    {"ориз"}, {"овес", "овесен"}, {"паста", "спагети", "макарон"},
    {"брашно"}, {"хляб"},
    # Sweets / snacks
    {"шоколад"}, {"бисквит"}, {"вафл"}, {"бонбон"},
    {"маршмелоу", "маршмалоу"},
    # Misc
    {"маслин"}, {"зехтин"}, {"олио"}, {"оцет"},
    {"кафе"}, {"чай"}, {"вино"}, {"бира"}, {"вода"},
    {"спанак"}, {"домат"}, {"краставиц"}, {"чушк"}, {"картоф"},
    {"банан"}, {"ябъл"}, {"круш"}, {"портокал"}, {"мандарин"},
    {"бургер"}, {"кюфте"}, {"колбас", "салам", "шунка"},
]

PLACEHOLDER_MARKERS = ("No-Image-Placeholder", "/images/foods/")


def is_real_image(image: str | None) -> bool:
    if not image or not isinstance(image, str):
        return False
    if any(m in image for m in PLACEHOLDER_MARKERS):
        return False
    return image.startswith("http")


PROMO_PREFIX_RE = re.compile(
    r"^\s*("
    r"супер\s+цена|"
    r"промо(ция)?|"
    r"акция|"
    r"нова\s+цена|"
    r"нова\s+ниска\s+цена|"
    r"оферта|"
    r"спестявате?|"
    r"сега\s+в\s+billa|"
    r"ново\s+в\s+billa|"
    r"ново\s+от\s+billa|"
    r"само\s+в\s+billa"
    r")\s*[-–—:]+\s*",
    re.IGNORECASE,
)


def strip_promo_prefix(s: str) -> str:
    prev, cur = None, s or ""
    while cur != prev:
        prev = cur
        cur = PROMO_PREFIX_RE.sub("", cur)
    return cur


def normalize_name(name: str) -> str:
    """Lowercase, strip our own promo prefixes + punctuation, keep BG chars."""
    s = strip_promo_prefix(name or "").lower().strip()
    s = re.sub(r"[\s\-_/]+", " ", s)
    s = re.sub(r"[^а-яa-z0-9 ]", "", s)
    return s.strip()


def name_tokens(name: str) -> set[str]:
    return {t for t in normalize_name(name).split() if len(t) >= 3}


def load_pazarko_index() -> dict[str, list[dict]]:
    """Return {store_lower: [products...]}."""
    if not os.path.exists(PAZARKO_PATH):
        print(f"[error] {PAZARKO_PATH} not found — run scraper/pazarko_scraper.py first")
        sys.exit(1)
    with open(PAZARKO_PATH, encoding="utf-8") as f:
        data = json.load(f)
    products = data.get("products", [])
    by_store: dict[str, list[dict]] = defaultdict(list)
    for p in products:
        if not p.get("image_url"):
            continue
        s = (p.get("store") or "").lower()
        name = p.get("product_name", "")
        by_store[s].append({
            "name_orig": name,
            "name_norm": normalize_name(name),
            "name_tokens": name_tokens(name),
            "brand": extract_brand(name),
            "image_url": p["image_url"],
        })
    print(f"[pazarko] loaded {sum(len(v) for v in by_store.values())} products with images across {len(by_store)} stores")
    return by_store


GENERIC_BRAND_WORDS = {
    "био", "еко", "премиум", "екстра", "натурален", "натурална", "класически",
    "класическа", "български", "българска", "българско", "пресен", "пресни",
    "свежо", "свеж", "охладен", "охладено", "замразен", "замразено", "сухо",
    "супер", "цена", "промо", "ново", "нов", "нова",
}

# Supermarket house-label brands. If the candidate image carries one of these
# and our product clearly has a different real brand (or none we can extract),
# we refuse the borrow — borrowing a "BILLA Kисело мляко" photo for a
# "Ел Би Kисело мляко" listing puts a wrong-brand carton in front of users.
SUPERMARKET_LABELS = {
    "billa", "kaufland", "lidl", "metro", "fantastico", "tmarket",
    "bulmag", "avanti", "clever",
}


def extract_brand(name: str) -> str | None:
    """Extract a likely brand token — first ALL-CAPS or Capitalized non-generic word."""
    words = re.split(r"[\s.,/\-]+", strip_promo_prefix(name or ""))
    for w in words:
        if len(w) < 3:
            continue
        lower = w.lower()
        if lower in GENERIC_BRAND_WORDS:
            continue
        if re.fullmatch(r"[A-Z][A-Z0-9]{2,}", w):
            return lower
        if re.fullmatch(r"[А-Я][А-Яа-я0-9]{2,}", w):
            return lower
    return None


def food_type_conflict(name_a: str, name_b: str) -> bool:
    """Reject if names belong to clearly different food-type buckets.

    Example: "Нахут" vs "Ементалер" — both Billa, both have "Clever"
    brand, but they're different products. If our name says "нахут" and
    candidate's says "ементалер", the image must NOT be borrowed.
    """
    a_low, b_low = name_a.lower(), name_b.lower()
    a_groups = {i for i, g in enumerate(FOOD_TYPE_GROUPS) if any(k in a_low for k in g)}
    b_groups = {i for i, g in enumerate(FOOD_TYPE_GROUPS) if any(k in b_low for k in g)}
    if a_groups and b_groups and a_groups.isdisjoint(b_groups):
        return True
    return False


def best_match(query_name: str, query_stores: list[str], index: dict[str, list[dict]]) -> str | None:
    """Find pazarko image_url that's plausibly the same product.

    Rules: same store, high jaccard, brand agrees, no food-type conflict.
    Returns None if no candidate clears all gates — better an empty card
    than a wrong-brand image.
    """
    q_tokens = name_tokens(query_name)
    if len(q_tokens) < 2:
        return None
    q_brand = extract_brand(query_name)

    candidates: list[dict] = []
    for store in query_stores:
        for pazarko_store in STORE_ALIAS.get(store, []):
            candidates.extend(index.get(pazarko_store.lower(), []))
    if not candidates:
        return None

    best_score = 0.0
    best_url = None
    for c in candidates:
        c_tokens = c["name_tokens"]
        shared = q_tokens & c_tokens
        if len(shared) < MIN_SHARED_TOKENS:
            continue

        jacc = len(shared) / max(1, len(q_tokens | c_tokens))

        # Inclusion test: one name is essentially a subset of the other
        # (e.g. "Billa Premium Сладолед 500 мл" ⊂ "BILLA Premium Сладолед
        # с ядки макадамия 500 МЛ"). For these, a weaker jaccard is fine
        # because the brand+core-noun overlap is total.
        ours_in_theirs = q_tokens.issubset(c_tokens)
        theirs_in_ours = c_tokens.issubset(q_tokens)
        is_inclusion = ours_in_theirs or theirs_in_ours

        if jacc < MIN_JACCARD and not (is_inclusion and jacc >= 0.45):
            continue

        # Brand gate
        c_brand = c.get("brand") or extract_brand(c.get("name_orig", ""))
        if REJECT_ON_BRAND_MISMATCH and q_brand and c_brand and q_brand != c_brand:
            continue
        # Supermarket-label gate: if candidate is a house-brand and our product
        # doesn't share that brand (or we couldn't read ours), reject.
        if c_brand in SUPERMARKET_LABELS and q_brand != c_brand:
            continue

        # Food-type gate
        if food_type_conflict(query_name, c.get("name_orig", "")):
            continue

        if jacc > best_score:
            best_score = jacc
            best_url = c["image_url"]

    return best_url


def enrich_file(path: str, index: dict[str, list[dict]], items_key: str = "products") -> int:
    if not os.path.exists(path):
        print(f"[skip] {path} not found")
        return 0
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    items = data.get(items_key) or data.get("offers") or []
    if not items:
        print(f"[skip] {path}: no items under '{items_key}' or 'offers'")
        return 0

    upgraded = 0
    for it in items:
        if is_real_image(it.get("image")):
            continue
        stores = it.get("available_stores") or ([it["store"]] if it.get("store") else [])
        if not stores:
            continue
        url = best_match(it.get("name", ""), stores, index)
        if url:
            it["image"] = url
            upgraded += 1

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[ok] {os.path.basename(path)}: +{upgraded} images enriched (out of {len(items)} items)")
    return upgraded


def main():
    index = load_pazarko_index()

    enrich_file(OFFERS_PATH, index, "offers")
    enrich_file(ALL_PRODUCTS_PATH, index, "products")

    print("\nNext: run `python sync_offers.py` to regenerate data/offers.js + data/market_memory.js.")


if __name__ == "__main__":
    main()
