#!/usr/bin/env python3
"""Merge a pazarko_extra.json (BulMag/Avanti) into the main data/pazarko.json.

Used when we scrape new stores incrementally without re-fetching everything.
After: re-run enrich + import + sync.
"""
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
MAIN = os.path.join(ROOT, "data", "pazarko.json")
EXTRA = os.path.join(ROOT, "data", "pazarko_extra.json")


def main():
    if not os.path.exists(EXTRA):
        print(f"[skip] {EXTRA} not present")
        return
    with open(MAIN, encoding="utf-8") as f:
        main_data = json.load(f)
    with open(EXTRA, encoding="utf-8") as f:
        extra = json.load(f)

    main_products = main_data.get("products", [])
    extra_products = extra.get("products", [])

    # Use (store, product_name) as dedup key
    seen = {(p.get("store"), p.get("product_name")) for p in main_products}
    added = 0
    for p in extra_products:
        key = (p.get("store"), p.get("product_name"))
        if key not in seen:
            main_products.append(p)
            seen.add(key)
            added += 1

    main_data["products"] = main_products
    by_store = {}
    for p in main_products:
        s = p.get("store") or "?"
        by_store[s] = by_store.get(s, 0) + 1
    main_data["by_store_count"] = by_store

    with open(MAIN, "w", encoding="utf-8") as f:
        json.dump(main_data, f, ensure_ascii=False, indent=2)

    os.remove(EXTRA)
    print(f"[ok] merged +{added} products from extra; total {len(main_products)}")
    for s, n in sorted(by_store.items(), key=lambda x: -x[1]):
        print(f"  {s:12s} {n}")


if __name__ == "__main__":
    main()
