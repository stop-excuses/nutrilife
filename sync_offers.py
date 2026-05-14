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
MARKET_MEMORY_JSON = Path("data/market_memory.json")
MARKET_MEMORY_JS = Path("data/market_memory.js")

STORE_BY_PID_PREFIX = {
    "lidl": "Lidl",
    "kaufland": "Kaufland",
    "billa": "Billa",
    "fantastico": "Fantastico",
    "tmarket": "T-Market",
    "dar": "Dar",
}

# Patterns that mean "the listed price IS already per kg"
_SOLD_BY_KG_PATTERNS = [
    re.compile(r'\bвитрина\b', re.IGNORECASE),   # fresh counter / deli
    re.compile(r'(?<!\w)кг\s*$', re.IGNORECASE), # name ends with "кг"
    re.compile(r'\bна\s+тегло\b', re.IGNORECASE), # "на тегло"
]

def _is_sold_by_kg(name: str) -> bool:
    nl = (name or '').lower()
    return any(p.search(nl) for p in _SOLD_BY_KG_PATTERNS)

def _infer_store(product_id: str) -> str | None:
    prefix = (product_id or "").split("-", 1)[0]
    return STORE_BY_PID_PREFIX.get(prefix)

def _latest_price(history: list[dict]) -> float | None:
    for entry in reversed(history or []):
        if entry.get("price") is not None:
            return entry.get("price")
    return None

def _price_signal(latest: float | None, lowest: float | None, avg: float | None) -> str:
    if latest is None:
        return "unknown"
    if lowest and latest <= lowest * 1.03:
        return "buy"
    if avg and latest <= avg * 0.92:
        return "good"
    if avg and latest >= avg * 1.08:
        return "wait"
    return "normal"

def _compact_product(product: dict, offer_lookup: dict) -> dict:
    pid = product.get("product_id") or product.get("id")
    offer = offer_lookup.get(pid, {})
    history = product.get("price_history") or []
    latest = offer.get("new_price")
    if latest is None:
        latest = _latest_price(history)
    avg_price = product.get("avg_price")
    lowest_price = product.get("lowest_price")
    store = product.get("store") or offer.get("store") or _infer_store(pid)
    weight_grams = product.get("weight_grams")
    price_per_kg = None
    if latest is not None and weight_grams:
        price_per_kg = round((latest / weight_grams) * 1000, 2)

    recent_history = [
        [
            entry.get("date"),
            entry.get("price"),
            entry.get("old_price"),
            entry.get("discount_pct"),
        ]
        for entry in history[-16:]
        if entry.get("date") and entry.get("price") is not None
    ]

    compact = {
        "product_id": pid,
        "name": product.get("name"),
        "store": store,
        "emoji": product.get("emoji"),
        "category": product.get("category"),
        "weight_raw": product.get("weight_raw"),
        "weight_grams": weight_grams,
        "image": product.get("image"),
        "is_food": product.get("is_food"),
        "is_healthy": product.get("is_healthy"),
        "is_junk": product.get("is_junk"),
        "is_bulk_worthy": product.get("is_bulk_worthy"),
        "is_long_lasting": product.get("is_long_lasting"),
        "is_high_protein": product.get("is_high_protein"),
        "is_good_carb": product.get("is_good_carb"),
        "is_good_fat": product.get("is_good_fat"),
        "health_score": product.get("health_score"),
        "diet_tags": product.get("diet_tags") or [],
        "macros": product.get("macros"),
        "first_seen": product.get("first_seen"),
        "last_seen": product.get("last_seen"),
        "new_price": latest,
        "new_price_eur": round(latest / BGN_TO_EUR, 2) if latest is not None else None,
        "price_per_kg": price_per_kg,
        "price_per_kg_eur": round(price_per_kg / BGN_TO_EUR, 2) if price_per_kg is not None else None,
        "avg_price": avg_price,
        "lowest_price": lowest_price,
        "lowest_price_date": product.get("lowest_price_date"),
        "price_seen_count": len(history),
        "price_history": recent_history,
        "price_signal": _price_signal(latest, lowest_price, avg_price),
    }
    return {
        k: v for k, v in compact.items()
        if v is not None and v is not False and v != [] and v != {}
    }

def write_market_memory(ap_data: dict, offers_data: dict) -> dict:
    offer_lookup = {
        o.get("product_id"): o
        for o in offers_data.get("offers", [])
        if o.get("product_id")
    }
    products = [
        _compact_product(product, offer_lookup)
        for product in ap_data.get("products", [])
        if product.get("product_id") or product.get("id")
    ]
    products.sort(key=lambda p: (
        p.get("store") or "",
        -(p.get("health_score") or 0),
        p.get("name") or "",
    ))
    memory = {
        "generated_at": ap_data.get("generated_at"),
        "total_products": len(products),
        "products_with_price_history": sum(1 for p in products if p.get("price_seen_count", 0) > 0),
        "stores": sorted({p["store"] for p in products if p.get("store")}),
        "products": products,
    }
    MARKET_MEMORY_JSON.write_text(
        json.dumps(memory, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    MARKET_MEMORY_JS.write_text(
        "const MARKET_MEMORY_DATA = " + json.dumps(memory, ensure_ascii=False, separators=(",", ":")) + ";",
        encoding="utf-8",
    )
    return memory

# ── Enrich all_products with ingredients_flags where missing ─────────────────
ap_path = Path("data/all_products.json")
ap_data = json.loads(ap_path.read_text(encoding="utf-8"))
offers_data = json.loads(open("data/offers.json", encoding="utf-8").read())
offer_store_by_pid = {
    o.get("product_id"): o.get("store")
    for o in offers_data.get("offers", [])
    if o.get("product_id") and o.get("store")
}
enriched = 0
store_fixed = 0
for p in ap_data.get("products", []):
    pid = p.get("product_id") or p.get("id")
    if pid and not p.get("store"):
        store = offer_store_by_pid.get(pid) or _infer_store(pid)
        if store:
            p["store"] = store
            store_fixed += 1
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
elif store_fixed:
    ap_path.write_text(json.dumps(ap_data, ensure_ascii=False, indent=2), encoding="utf-8")
if store_fixed:
    print(f"Fixed store for {store_fixed} catalog products")

# ── Fix price_per_kg for "sold by weight" offers ─────────────────────────────
# Products like "пилешко от витрина" or "царевично пиле кг" are priced per kg.
# Build a name lookup from all_products, then patch any offer missing price_per_kg.
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

memory_data = write_market_memory(ap_data, offers_data)
print(f"market_memory.js : {memory_data.get('total_products', 0)} records")
