#!/usr/bin/env python3
"""
translate_ingredients.py
Translates ingredients_raw (any language) → ingredients_bg (Bulgarian) + ingredients_en (English)
for every product in data/all_products.json that doesn't already have both fields.

Usage: python translate_ingredients.py
Requires: pip install deep-translator
"""

import json
import time
from pathlib import Path
from deep_translator import GoogleTranslator

AP_PATH = Path("data/all_products.json")

tr_bg = GoogleTranslator(source="auto", target="bg")
tr_en = GoogleTranslator(source="auto", target="en")


def translate(text: str, translator) -> str:
    try:
        result = translator.translate(text)
        time.sleep(0.3)
        return result or text
    except Exception as e:
        print(f"    [warn] {e}")
        return text


def main():
    data = json.loads(AP_PATH.read_text(encoding="utf-8"))
    products = data.get("products", [])

    updated = 0
    for p in products:
        raw = p.get("ingredients_raw", "")
        if not raw:
            continue
        has_bg = bool(p.get("ingredients_bg"))
        has_en = bool(p.get("ingredients_en"))
        if has_bg and has_en:
            continue

        name = p.get("name", "?")
        print(f"  {name[:50]} … ", end="", flush=True)

        if not has_bg:
            p["ingredients_bg"] = translate(raw, tr_bg)
        if not has_en:
            p["ingredients_en"] = translate(raw, tr_en)

        print("done")
        updated += 1

    if updated:
        AP_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nTranslated {updated} products. Run: python sync_offers.py")
    else:
        print("Nothing to translate.")


if __name__ == "__main__":
    print("=== NutriLife ingredient translator ===")
    main()
