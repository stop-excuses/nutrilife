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


# Map our store labels → pazarko store labels
STORE_ALIAS = {
    "Kaufland": ["Kaufland"],
    "Lidl": ["Lidl"],
    "Billa": ["Billa"],
    "Fantastico": ["Fantastico"],
    "T-Market": ["TMarket"],
    "Dar": ["Dar", "CBA"],
    "Metro": ["Metro"],
}

PLACEHOLDER_MARKERS = ("No-Image-Placeholder", "/images/foods/")


def is_real_image(image: str | None) -> bool:
    if not image or not isinstance(image, str):
        return False
    if any(m in image for m in PLACEHOLDER_MARKERS):
        return False
    return image.startswith("http")


def normalize_name(name: str) -> str:
    """Lowercase, strip whitespace + diacritics-light, keep BG chars."""
    s = (name or "").lower().strip()
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
        by_store[s].append({
            "name_norm": normalize_name(p.get("product_name", "")),
            "name_tokens": name_tokens(p.get("product_name", "")),
            "image_url": p["image_url"],
        })
    print(f"[pazarko] loaded {sum(len(v) for v in by_store.values())} products with images across {len(by_store)} stores")
    return by_store


def best_match(query_name: str, query_stores: list[str], index: dict[str, list[dict]]) -> str | None:
    """Find pazarko image_url for our (name, store) by token-overlap score."""
    q_tokens = name_tokens(query_name)
    if len(q_tokens) < 2:
        return None
    candidates: list[dict] = []
    for store in query_stores:
        for pazarko_store in STORE_ALIAS.get(store, []):
            candidates.extend(index.get(pazarko_store.lower(), []))
    if not candidates:
        return None

    best_score = 0
    best_url = None
    for c in candidates:
        common = q_tokens & c["name_tokens"]
        if len(common) < 2:
            continue
        # Jaccard-like score, slight bonus for high overlap
        score = len(common) / max(1, len(q_tokens | c["name_tokens"]))
        if score > best_score:
            best_score = score
            best_url = c["image_url"]
    if best_score >= 0.32:  # ~one-third token overlap minimum
        return best_url
    return None


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
