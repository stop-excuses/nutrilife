"""
Enrich all_products.json with persistent product images from Open Food Facts.

Only updates products that still have no image or use the generic placeholder.
Matched image URLs are written into all_products.json, so the image is kept on
future weeks for the same product_id.

Usage:
    python scraper/enrich_images.py
    python sync_offers.py
"""

import json
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from off_enricher import get_off_image_match
from image_mapper import get_local_product_image, has_real_image

AP_PATH = Path(__file__).parent.parent / "data" / "all_products.json"
ENRICHABLE_CATEGORIES = {"protein", "dairy", "canned", "legume", "nuts", "grain", "fat", "vegetable"}
LOCAL_FALLBACK_CATEGORIES = ENRICHABLE_CATEGORIES | {"hygiene", "household", "pet"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Only process the first N matching products")
    args = parser.parse_args()

    data = json.loads(AP_PATH.read_text(encoding="utf-8"))
    products = data.get("products", [])

    targets = [
        product for product in products
        if (
            (
                not has_real_image(product)
                or str(product.get("image_source") or "") == "local_food_asset"
            )
            and product.get("category") in LOCAL_FALLBACK_CATEGORIES
        )
    ]
    if args.limit > 0:
        targets = targets[:args.limit]
    print(f"Products needing image enrichment: {len(targets)} / {len(products)}")

    enriched = 0
    missing = 0

    for index, product in enumerate(targets, start=1):
        name = product.get("name", "")
        category = product.get("category", "other")
        print(f"[{index}/{len(targets)}] {name[:80]}")

        local_image = get_local_product_image(name, category)
        if local_image:
            product["image"] = local_image
            product["image_source"] = "local_food_asset"
            product["image_match_generic"] = True
            print(f"  -> local fallback: {local_image}")
            enriched += 1
            continue

        if category not in ENRICHABLE_CATEGORIES:
            print("  -> no local non-food match")
            missing += 1
            continue

        match = get_off_image_match(name, category)
        image = match.get("image") if match else None

        if image:
            product["image"] = image
            product["image_source"] = "open_food_facts"
            product["off_matched_name"] = match.get("matched_name", "")
            product["image_match_generic"] = bool(match.get("generic"))
            print(f"  -> image found: {match.get('matched_name', '')[:80]}")
            enriched += 1
        else:
            print("  -> no image match")
            missing += 1

    AP_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone. Enriched: {enriched} | Still missing: {missing}")
    print("Run: python sync_offers.py")


if __name__ == "__main__":
    main()
