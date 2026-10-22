import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "scraper"))
from supplement_scrapers import calculate_price_units, parse_largest_weight_grams, extract_count_from_name, parse_count, detect_category, is_relevant_product  # noqa: E402

SOURCE_PATH = Path("data/supplements.json")
OUTPUT_PATH = Path("data/supplements.js")

# A real protein-powder serving is realistically 15-90 g. Anything a scraped
# "servings"/"serving_grams" number implies outside that range is noise picked
# up from an unrelated number on the page (review counts, a different size
# variant, promo text) and corrupts the price-per-dose math if trusted as-is.
MIN_SERVING_G = 15
MAX_SERVING_G = 90
ASSUMED_SERVING_G = 30
# Real protein powder never retails below ~0.015 BGN/g of product; anything
# cheaper means the scraped price or weight itself is wrong (wrong currency,
# a shipping/related-product price, or a single-dose sample's weight
# mistakenly replaced by a larger variant's weight from the same page).
MIN_BGN_PER_GRAM = 0.015
# Even small premium sample packs rarely exceed ~0.8-0.9 BGN/g; values well
# past that (checked against the real catalog: legit items top out ~0.82,
# then jump straight to 2.5+) mean servings/weight produced an impossibly
# tiny implied package for the price.
MAX_BGN_PER_GRAM = 1.2


def is_hair_cosmetic_junk(name):
    """Hair-care products (masks/conditioners) that mention "protein" as an
    ingredient get miscategorized as protein supplements by keyword matching."""
    low = (name or "").lower()
    return bool(re.search(r"коса\b|косопад|hair\s*mask|hair\s*conditioner", low))


def is_snack_food_junk(name):
    """Snack/baked-food formats (pasta, bread, pizza, cookies/crackers, cream
    spreads, porridge) have a much lower real protein-by-weight ratio than
    powder, so the assumed-serving fallback overstates their value — and
    they are not comparable to whey/isolate powder anyway. Only checks the
    product-type part of the name, not a flavor description ("... с вкус на
    бисквитки и крем" is a normal whey powder flavored cookies-and-cream,
    not an actual cookie/cream food product)."""
    low = (name or "").lower()
    product_type_part = re.split(r"с\s+вкус\s+на|with\s+.{0,3}\s*flavor", low, maxsplit=1)[0]
    return bool(re.search(
        r"паста\b|\bбисквитк|крекер|пица\b|каша\b|хляб\b|\bbread\b|\bcookies?\b|\bcrackers?\b|\bpizza\b|протеинов\s+стик|\bprotein\s+sticks?\b|фъстъчено.масло|peanut.butter|крем\b"
        r"|вафл|\bwafers?\b|\bbrownies?\b|брауни|сладолед|ice.cream|mug.cake|флапджак|flapjack|\boats\b|\bbars?\b|батон|\bdrinks?\b|\bbottle\b|бутилка|\bshakers?\b|шейкър",
        product_type_part,
    ))


def is_sample_junk(name):
    """Single-serving samples are not a package you can buy for value — their
    (often very low) per-dose price pollutes the top of the ranking."""
    low = (name or "").lower()
    return bool(re.search(r"\bsamples?\b|мостра|еднократна\s+доза", low))


def resolve_weight_grams(item):
    """Product pages sometimes yield an unrelated small number as weight_grams
    (e.g. grams of protein per serving instead of the package size, or an
    older regex missing "lbs"/full-word "грама" units). Re-derive from the
    (short, reliable) name text when the stored size differs substantially."""
    name_weight = parse_largest_weight_grams(item.get("name") or "")
    weight = item.get("weight_grams")
    if name_weight and (not weight or name_weight > weight * 1.5 or weight > name_weight * 1.5):
        return name_weight
    return weight


def protein_total_g(item, weight):
    """Total grams of protein in the package, using a trustworthy serving count.

    Falls back to an assumed standard scoop size when the scraped servings
    count implies an unrealistic per-serving weight, then caps the result at
    the package weight (a powder cannot contain more protein than it weighs).
    """
    active = item.get("active") or {}
    servings = item.get("servings")
    protein_g = active.get("protein_g")

    multiplier = servings
    if multiplier and weight:
        implied_serving_g = weight / multiplier
        if not (MIN_SERVING_G <= implied_serving_g <= MAX_SERVING_G):
            multiplier = None

    total = None
    if protein_g and multiplier:
        total = protein_g * multiplier
    elif protein_g and weight:
        total = protein_g * max(1, round(weight / ASSUMED_SERVING_G))
    elif active.get("estimated_total_protein_g"):
        ratio = active.get("estimated_protein_ratio_pct")
        total = weight * ratio / 100 if weight and ratio else active.get("estimated_total_protein_g")

    if not total:
        return None
    if weight and total > weight * 0.95:
        total = weight * 0.9
    return total


def repair_protein_units(item):
    """Recompute the comparable price per 25 g protein with sane serving math.

    Returns False if the item should be dropped entirely — either hair-care
    junk miscategorized as a protein supplement, or a price/weight combination
    so implausible (far below real retail cost per gram) that no honest
    per-dose price can be shown.
    """
    if item.get("category") != "protein":
        return True
    if is_hair_cosmetic_junk(item.get("name")):
        return False
    if is_snack_food_junk(item.get("name")):
        return False
    price = item.get("price_bgn")
    if not price:
        return True
    weight = resolve_weight_grams(item)
    if weight != item.get("weight_grams"):
        item["weight_grams"] = weight
    if weight and not (MIN_BGN_PER_GRAM <= price / weight <= MAX_BGN_PER_GRAM):
        return False
    total = protein_total_g(item, weight)
    if not total:
        return True
    if item.get('active', {}).get('estimated_total_protein_g'):
        item['active']['estimated_total_protein_g'] = round(total, 2)
    if weight and item.get('servings') and not (MIN_SERVING_G <= weight / item['servings'] <= MAX_SERVING_G):
        item['servings'] = None
    unit_value = round(price / (total / 25), 2)
    units = item.setdefault("price_per_active_unit", {})
    units["bgn_per_25g_protein"] = unit_value
    # Keep the latest price-history point in sync with the corrected unit value.
    history = item.get("price_history") or []
    if history:
        latest = history[-1]
        if abs((latest.get("price_bgn") or 0) - price) < 0.01:
            latest["unit_value"] = unit_value
    return True


def repair_vitamin_c_units(item):
    """Repair names like `Vitamin C 1000` when the label parser grabbed a
    nearby tablet/count number instead of the explicit dose in the name."""
    if item.get("category") != "vitamin_c":
        return
    name = (item.get("name") or "").lower()
    if not re.search(r"(?:vitamin[\s-]*c|витамин[\s-]*c|\bc)\s*[-:]?\s*1000(?:\s*(?:mg|мг))?\b", name, re.I):
        return
    active = item.setdefault("active", {})
    if (active.get("vitamin_c_mg") or 0) < 50:
        active["vitamin_c_mg"] = 1000
        units = calculate_price_units(
            item.get("category"), item.get("price_bgn"), active,
            item.get("weight_grams"), item.get("servings"), item.get("count"),
        )
        if units:
            item["price_per_active_unit"] = units


def repair_package_count(item):
    name = item.get('name', '')
    if re.search(r'\d\s*(?:мл|ml)\b', name, re.I) and not parse_largest_weight_grams(name):
        item['weight_grams'] = None
    count = extract_count_from_name(item.get('name', '')) or parse_count(item.get('name', ''))
    if not count or not item.get('servings') or item['servings'] <= count * 2:
        return
    # A ten-ampoule box cannot provide 1,666 full ampoules; page text included
    # another product's weight. Reuse the explicit package count, not that text.
    item['count'] = count
    item['servings'] = None
    units = calculate_price_units(item['category'], item.get('price_bgn'), item.get('active') or {}, item.get('weight_grams'), None, count)
    if units:
        item['price_per_active_unit'] = units
        history = item.get('price_history') or []
        if history and history[-1].get('price_bgn') == item.get('price_bgn'):
            history[-1]['unit_value'] = next(iter(units.values()))


def has_usable_package_price(item):
    # Reject a single sachet price paired with an entire creatine box's weight.
    # Keep it out of comparisons until its priced variant can be identified.
    if item.get('category') == 'creatine' and item.get('weight_grams'):
        return (item.get('price_bgn') or 0) / item['weight_grams'] >= 0.005
    return True


def main():
    data = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    supplements = data.get("supplements", [])
    for item in supplements:
        item.setdefault("availability_status", "unknown")
        repair_package_count(item)
        repair_vitamin_c_units(item)
    supplements = [item for item in supplements if has_usable_package_price(item)]
    supplements = [item for item in supplements if item.get('store') != 'FHL' or not detect_category(item.get('name', '')) or is_relevant_product(item['category'], item['name'], item.get('url', ''))]
    supplements = [item for item in supplements if not is_sample_junk(item.get("name"))]
    supplements = [item for item in supplements if repair_protein_units(item)]
    data["supplements"] = supplements
    data["total_supplements"] = len(supplements)
    data["sources"] = sorted({item["store"] for item in supplements})
    data["categories"] = sorted({item["category"] for item in supplements})
    # Persist repairs back so .json and .js stay consistent.
    SOURCE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        f.write("const SUPPLEMENTS_DATA = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";")
    print(f"supplements.js : {data.get('total_supplements', len(data.get('supplements', [])))} records")


if __name__ == "__main__":
    main()
