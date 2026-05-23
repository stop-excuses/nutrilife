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

def _extract_weight(text: str) -> tuple[str | None, int | None]:
    if not text:
        return None, None

    value = text.lower()
    value = re.sub(
        r'(?<!\w)до\s+\d+(?:[.,]\d+)?\s*(?:кг|г|гр|л|мл|kg|g|gr|ml|l)\b',
        '',
        value,
    )

    units = {
        "кг": 1000, "kg": 1000,
        "гр": 1, "gr": 1,
        "г": 1, "g": 1,
        "мл": 1, "ml": 1,
        "л": 1000, "l": 1000,
    }
    unit_pat = "|".join(re.escape(unit) for unit in sorted(units, key=len, reverse=True))

    multi = re.search(rf'(\d+)\s*[xхXХ×]\s*(\d+(?:[.,]\d+)?)\s*({unit_pat})\b', value)
    if not multi:
        multi = re.search(rf'(\d+)\s*бр\.?\s*[xхXХ×]\s*(\d+(?:[.,]\d+)?)\s*({unit_pat})\b', value)
    if multi:
        count = int(multi.group(1))
        amount = float(multi.group(2).replace(",", "."))
        grams = int(count * amount * units[multi.group(3)])
        if 10 <= grams <= 50000:
            return multi.group(0).strip(), grams

    single = re.search(rf'(\d+(?:[.,]\d+)?)\s*({unit_pat})\b', value)
    if single:
        unit = single.group(2)
        if unit == "г" and re.match(r'\s*од', value[single.end():]):
            return None, None
        if unit in {"л", "l"} and value[single.end():single.end() + 1] in {"в", "v"}:
            return None, None
        amount = float(single.group(1).replace(",", "."))
        grams = int(amount * units[unit])
        if 10 <= grams <= 50000:
            return single.group(0).strip(), grams

    return None, None

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

def _write_text_atomic(path: Path, text: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)

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
    memory_json = json.dumps(memory, ensure_ascii=False, separators=(",", ":"))
    _write_text_atomic(MARKET_MEMORY_JSON, memory_json)
    _write_text_atomic(MARKET_MEMORY_JS, "const MARKET_MEMORY_DATA = " + memory_json + ";")
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
weight_fixed = 0
for p in ap_data.get("products", []):
    pid = p.get("product_id") or p.get("id")
    if pid and not p.get("store"):
        store = offer_store_by_pid.get(pid) or _infer_store(pid)
        if store:
            p["store"] = store
            store_fixed += 1
    weight_raw, weight_grams = _extract_weight(p.get("name") or "")
    existing_weight = p.get("weight_grams")
    should_fix_weight = (
        weight_grams
        and (
            not existing_weight
            or (weight_raw and re.search(r'[xхXХ×]', weight_raw) and weight_grams > existing_weight)
        )
    )
    if should_fix_weight:
            p["weight_raw"] = weight_raw
            p["weight_grams"] = weight_grams
            weight_fixed += 1
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

if enriched or weight_fixed:
    ap_path.write_text(json.dumps(ap_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Enriched {enriched} products with ingredients analysis")
elif store_fixed:
    ap_path.write_text(json.dumps(ap_data, ensure_ascii=False, indent=2), encoding="utf-8")
if store_fixed:
    print(f"Fixed store for {store_fixed} catalog products")
if weight_fixed:
    print(f"Fixed package weight for {weight_fixed} catalog products")

# ── Fix price_per_kg for "sold by weight" offers ─────────────────────────────
# Products like "пилешко от витрина" or "царевично пиле кг" are priced per kg.
# Build a name lookup from all_products, then patch any offer missing price_per_kg.
prod_name_by_id = {
    p["product_id"]: p.get("name", "")
    for p in ap_data.get("products", [])
    if p.get("product_id")
}
prod_weight_by_id = {
    p["product_id"]: p.get("weight_grams")
    for p in ap_data.get("products", [])
    if p.get("product_id") and p.get("weight_grams")
}
prod_weight_raw_by_id = {
    p["product_id"]: p.get("weight_raw")
    for p in ap_data.get("products", [])
    if p.get("product_id") and p.get("weight_raw")
}
fixed_ppk = 0
fixed_offer_weight = 0
for offer in offers_data.get("offers", []):
    pid = offer.get("product_id") or offer.get("id") or ""
    if (not offer.get("weight_grams") or (
        prod_weight_raw_by_id.get(pid)
        and re.search(r'[xхXХ×]', prod_weight_raw_by_id[pid])
        and prod_weight_by_id.get(pid, 0) > offer.get("weight_grams", 0)
    )) and prod_weight_by_id.get(pid):
        offer["weight_grams"] = prod_weight_by_id[pid]
        if prod_weight_raw_by_id.get(pid):
            offer["weight_raw"] = prod_weight_raw_by_id[pid]
        fixed_offer_weight += 1
    if offer.get("price_per_kg") is not None:
        continue
    name = prod_name_by_id.get(pid, "")
    weight_grams = offer.get("weight_grams") or prod_weight_by_id.get(pid)
    if weight_grams and offer.get("new_price") is not None:
        offer["price_per_kg"] = round((offer["new_price"] / weight_grams) * 1000, 2)
        offer["price_per_kg_eur"] = round(offer["price_per_kg"] / BGN_TO_EUR, 2)
        fixed_ppk += 1
    elif _is_sold_by_kg(name) and offer.get("new_price") is not None:
        offer["price_per_kg"] = offer["new_price"]
        offer["price_per_kg_eur"] = round(offer["new_price"] / BGN_TO_EUR, 2)
        offer["weight_raw"] = offer.get("weight_raw") or "на кг"
        fixed_ppk += 1
if fixed_ppk:
    print(f"Fixed price_per_kg for {fixed_ppk} current offers")
if fixed_offer_weight:
    print(f"Fixed package weight for {fixed_offer_weight} current offers")
if fixed_ppk or fixed_offer_weight:
    Path("data/offers.json").write_text(json.dumps(offers_data, ensure_ascii=False, indent=2), encoding="utf-8")

# ── Write JS files ────────────────────────────────────────────────────────────
# Write all_products.js
_write_text_atomic(
    Path("data/all_products.js"),
    "const ALL_PRODUCTS_DATA = " + json.dumps(ap_data, ensure_ascii=False, indent=2) + ";",
)
print(f"all_products.js : {ap_data.get('total_products', len(ap_data.get('products', [])))} records")

# Write offers.js (with price_per_kg fix already applied)
_write_text_atomic(
    Path("data/offers.js"),
    "const OFFERS_DATA = " + json.dumps(offers_data, ensure_ascii=False, indent=2) + ";",
)
print(f"offers.js : {offers_data.get('total_offers', len(offers_data.get('offers', [])))} records")

memory_data = write_market_memory(ap_data, offers_data)
print(f"market_memory.js : {memory_data.get('total_products', 0)} records")
