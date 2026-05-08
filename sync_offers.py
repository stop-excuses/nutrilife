import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "scraper"))
try:
    from ingredients_analyzer import analyze_ingredients
    _ANALYZER = True
except ImportError:
    _ANALYZER = False
    def analyze_ingredients(text): return []

BGN_TO_EUR = 1.95583

# Patterns that mean "the listed price IS already per kg"
_SOLD_BY_KG_PATTERNS = [
    re.compile(r'\bвитрина\b', re.IGNORECASE),   # fresh counter / deli
    re.compile(r'(?<!\w)кг\s*$', re.IGNORECASE), # name ends with "кг"
    re.compile(r'\bна\s+тегло\b', re.IGNORECASE), # "на тегло"
]

def _is_sold_by_kg(name: str) -> bool:
    nl = (name or '').lower()
    return any(p.search(nl) for p in _SOLD_BY_KG_PATTERNS)

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

# ── Fix price_per_kg for "sold by weight" offers ─────────────────────────────
# Products like "пилешко от витрина" or "царевично пиле кг" are priced per kg.
# Build a name lookup from all_products, then patch any offer missing price_per_kg.
offers_data = json.loads(open("data/offers.json", encoding="utf-8").read())
prod_name_by_id = {
    p["product_id"]: p.get("name", "")
    for p in ap_data.get("products", [])
    if p.get("product_id")
}
fixed_ppk = 0
for offer in offers_data.get("offers", []):
    if offer.get("price_per_kg") is not None:
        continue
    pid = offer.get("product_id") or offer.get("id") or ""
    name = prod_name_by_id.get(pid, "")
    if _is_sold_by_kg(name) and offer.get("new_price") is not None:
        offer["price_per_kg"] = offer["new_price"]
        offer["price_per_kg_eur"] = round(offer["new_price"] / BGN_TO_EUR, 2)
        fixed_ppk += 1
if fixed_ppk:
    print(f"Fixed price_per_kg for {fixed_ppk} sold-by-weight offers")

# ── Write JS files ────────────────────────────────────────────────────────────
# Write all_products.js
with open("data/all_products.js", "w", encoding="utf-8") as f:
    f.write("const ALL_PRODUCTS_DATA = ")
    json.dump(ap_data, f, ensure_ascii=False, indent=2)
    f.write(";")
print(f"all_products.js : {ap_data.get('total_products', len(ap_data.get('products', [])))} records")

# Write offers.js (with price_per_kg fix already applied)
with open("data/offers.js", "w", encoding="utf-8") as f:
    f.write("const OFFERS_DATA = ")
    json.dump(offers_data, f, ensure_ascii=False, indent=2)
    f.write(";")
print(f"offers.js : {offers_data.get('total_offers', len(offers_data.get('offers', [])))} records")
