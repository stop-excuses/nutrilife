import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "scraper"))
try:
    from ingredients_analyzer import analyze_ingredients
    _ANALYZER = True
except ImportError:
    _ANALYZER = False
    def analyze_ingredients(text): return []

# ── Enrich all_products with ingredients_flags where missing ─────────────────
ap_path = Path("data/all_products.json")
ap_data = json.loads(ap_path.read_text(encoding="utf-8"))
enriched = 0
for p in ap_data.get("products", []):
    if "ingredients_flags" in p:
        continue
    raw = (p.get("macros") or {}).get("ingredients") or p.get("ingredients_raw") or ""
    if not raw:
        continue
    p["ingredients_raw"] = raw
    p["ingredients_flags"] = analyze_ingredients(raw)
    red = sum(1 for f in p["ingredients_flags"] if f["level"] == "red")
    amber = sum(1 for f in p["ingredients_flags"] if f["level"] == "amber")
    p["junk_count"] = red
    p["amber_count"] = amber
    p["clean_label"] = red == 0 and amber == 0
    enriched += 1

if enriched:
    ap_path.write_text(json.dumps(ap_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Enriched {enriched} products with ingredients analysis")

# ── Write JS files ────────────────────────────────────────────────────────────
for name, var in [("offers", "OFFERS_DATA"), ("all_products", "ALL_PRODUCTS_DATA")]:
    data = json.loads(open(f"data/{name}.json", encoding="utf-8").read())
    with open(f"data/{name}.js", "w", encoding="utf-8") as f:
        f.write(f"const {var} = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";")
    total = data.get("total_products") or data.get("total_offers") or 0
    print(f"{name}.js : {total} records")
