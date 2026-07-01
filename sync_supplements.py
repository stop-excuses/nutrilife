import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "scraper"))
from supplement_scrapers import parse_largest_weight_grams  # noqa: E402

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
        r"паста\b|\bбисквитк|крекер|пица\b|каша\b|хляб\b|\bbread\b|\bcookies?\b|\bcrackers?\b|\bpizza\b|фъстъчено.масло|peanut.butter|крем\b",
        product_type_part,
    ))


def resolve_weight_grams(item):
    """Product pages sometimes yield an unrelated small number as weight_grams
    (e.g. grams of protein per serving instead of the package size, or an
    older regex missing "lbs"/full-word "грама" units). Re-derive from the
    (short, reliable) name text and prefer it when clearly larger."""
    name_weight = parse_largest_weight_grams(item.get("name") or "")
    weight = item.get("weight_grams")
    if name_weight and (not weight or name_weight > weight * 1.5):
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
        total = active.get("estimated_total_protein_g")

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


def main():
    data = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    supplements = data.get("supplements", [])
    for item in supplements:
        item.setdefault("availability_status", "unknown")
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
