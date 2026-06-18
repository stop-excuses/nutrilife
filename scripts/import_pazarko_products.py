#!/usr/bin/env python3
"""Import Metro (and other pazarko-only) products into market_memory.json.

Pazarko surfaces stores our direct scrapers don't cover yet (notably Metro,
which has ~11K products). This pulls them in as first-class catalog rows so
the Smart Food grid shows them alongside Kaufland/Lidl/Billa items.

Run after `python scraper/pazarko_scraper.py` produces data/pazarko.json.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

ROOT = os.path.join(os.path.dirname(__file__), "..")
PAZARKO_PATH = os.path.join(ROOT, "data", "pazarko.json")
# sync_offers.py rebuilds market_memory from all_products, so we write there.
ALL_PRODUCTS_PATH = os.path.join(ROOT, "data", "all_products.json")

# EUR -> BGN (fixed peg)
EUR_BGN = 1.95583

# Stores we want to import as new catalog rows (we lack any direct scraper).
IMPORT_STORES = {"Metro"}

# Map pazarko sub-category strings → our UI categories.
SUB_TO_CATEGORY = {
    "плодове и зеленчуци": "vegetable",
    "месо": "protein",
    "прясно месо": "protein",
    "риба": "protein",
    "млечни": "dairy",
    "сирене": "dairy",
    "кисело мляко": "dairy",
    "яйца": "protein",
    "хляб": "bread",
    "тестени": "bread",
    "основни храни": "grain",
    "зърнени": "grain",
    "ориз": "grain",
    "паста": "grain",
    "бобови": "legume",
    "ядки": "nuts",
    "семена": "nuts",
    "олио": "fat",
    "масло": "fat",
    "зехтин": "fat",
    "консерви": "canned",
    "замразени продукти": "frozen",
    "напитки": "drinks",
    "сладолед": "drinks",
    "снаксове и сладки изкушения": "sweets",
}


def normalize_name(name: str) -> str:
    s = (name or "").lower().strip()
    s = re.sub(r"[\s\-_/]+", " ", s)
    s = re.sub(r"[^а-яa-z0-9 ]", "", s)
    return s.strip()


def slug(text: str) -> str:
    s = normalize_name(text).replace(" ", "-")
    return re.sub(r"-+", "-", s).strip("-")[:80]


def infer_category(sub: str | None, name: str) -> str:
    sub_l = (sub or "").lower()
    for k, v in SUB_TO_CATEGORY.items():
        if k in sub_l:
            return v
    name_l = name.lower()
    if any(k in name_l for k in ["пилеш", "пиле", "телеш", "говеж", "свинск", "месо", "кайма", "риба"]):
        return "protein"
    if any(k in name_l for k in ["мляко", "сирене", "извара", "кашкавал", "йогурт"]):
        return "dairy"
    if any(k in name_l for k in ["хляб", "пълнозърнест"]):
        return "bread"
    return "other"


def parse_package_weight(name: str) -> tuple[int | None, str | None]:
    """Extract weight in grams from product name (best-effort)."""
    if not name:
        return None, None
    m = re.search(r"(\d+[\.,]?\d*)\s*(кг|кг\.|kg)\b", name, re.I)
    if m:
        kg = float(m.group(1).replace(",", "."))
        return int(kg * 1000), f"{m.group(1)} {m.group(2)}"
    m = re.search(r"(\d+[\.,]?\d*)\s*(г|гр|g)\b", name, re.I)
    if m:
        g = float(m.group(1).replace(",", "."))
        if 5 <= g <= 50000:
            return int(g), f"{int(g)} г"
    m = re.search(r"(\d+[\.,]?\d*)\s*(л|l|мл|ml)\b", name, re.I)
    if m:
        v = float(m.group(1).replace(",", "."))
        unit = m.group(2).lower()
        if unit in {"л", "l"}:
            return int(v * 1000), f"{m.group(1)} л"
        return int(v), f"{int(v)} мл"
    return None, None


def to_bgn(eur: float | None) -> float | None:
    if eur is None:
        return None
    return round(float(eur) * EUR_BGN, 2)


def build_memory_entry(p: dict, now_iso: str) -> dict | None:
    name = p.get("product_name", "").strip()
    store = p.get("store", "").strip()
    image = p.get("image_url")
    if not name or not store:
        return None

    price_bgn = to_bgn(p.get("price_eur"))
    old_price_bgn = to_bgn(p.get("old_price_eur"))
    weight_grams, weight_raw = parse_package_weight(name)
    price_per_kg = None
    if price_bgn and weight_grams and weight_grams >= 50:
        price_per_kg = round(price_bgn * 1000 / weight_grams, 2)
    category = infer_category(p.get("db_sub_category"), name)

    product_id = f"{slug(store)}-{slug(name)}"

    return {
        "product_id": product_id,
        "name": name,
        "store": store,
        "emoji": "🛒",
        "category": category,
        "weight_raw": weight_raw,
        "weight_grams": weight_grams,
        "image": image,
        "is_food": True,
        "is_healthy": False,
        "health_score": 5,
        "diet_tags": [],
        "macros": None,
        "first_seen": now_iso,
        "last_seen": now_iso,
        "new_price": price_bgn,
        "new_price_eur": p.get("price_eur"),
        "price_per_kg": price_per_kg,
        "price_per_kg_eur": round(price_per_kg / EUR_BGN, 2) if price_per_kg else None,
        "avg_price": price_bgn,
        "lowest_price": price_bgn,
        "lowest_price_date": now_iso[:10],
        "price_seen_count": 1,
        "price_history": [{
            "date": now_iso[:10],
            "price": price_bgn,
            "old_price": old_price_bgn,
            "discount_pct": None,
        }] if price_bgn else [],
        "price_signal": None,
        "_source": "pazarko",
    }


def main():
    if not os.path.exists(PAZARKO_PATH):
        print(f"[error] {PAZARKO_PATH} not found", file=sys.stderr)
        sys.exit(1)
    with open(PAZARKO_PATH, encoding="utf-8") as f:
        paz = json.load(f)
    products = paz.get("products", [])

    with open(ALL_PRODUCTS_PATH, encoding="utf-8") as f:
        all_products = json.load(f)
    ap_products = all_products.get("products", [])

    existing_ids = {p.get("product_id") for p in ap_products}
    now_iso = datetime.now(timezone.utc).isoformat()

    added = 0
    skipped_dup = 0
    for p in products:
        store = p.get("store", "")
        if store not in IMPORT_STORES:
            continue
        entry = build_memory_entry(p, now_iso)
        if not entry:
            continue
        if entry["product_id"] in existing_ids:
            skipped_dup += 1
            continue
        ap_products.append(entry)
        existing_ids.add(entry["product_id"])
        added += 1

    all_products["products"] = ap_products
    all_products["total_products"] = len(ap_products)
    with open(ALL_PRODUCTS_PATH, "w", encoding="utf-8") as f:
        json.dump(all_products, f, ensure_ascii=False, indent=2)
    print(f"[ok] imported {added} new products (skipped {skipped_dup} duplicates)")
    by_store = {}
    for p in ap_products:
        by_store[p.get("store") or "?"] = by_store.get(p.get("store") or "?", 0) + 1
    for s, n in sorted(by_store.items(), key=lambda x: -x[1]):
        print(f"  {s:12s} {n}")
    print("\nNext: run `python sync_offers.py` to regenerate market_memory.js")


if __name__ == "__main__":
    main()
