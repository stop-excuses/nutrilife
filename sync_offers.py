import json
from datetime import datetime

# Read current offers
with open('data/offers.json', 'r', encoding='utf-8') as f:
    offers_data = json.load(f)

# --- Generate all_products ---
# These fields belong to the product itself (not price/promo specific)
PRODUCT_FIELDS = (
    'name', 'store', 'emoji', 'category', 'weight_raw', 'weight_grams',
    'shelf_life', 'is_food', 'is_healthy', 'is_bulk_worthy', 'is_long_lasting',
    'health_score', 'diet_tags', 'macros', 'is_junk', 'is_high_protein', 'image',
)

# Load existing all_products to preserve products from previous weeks
try:
    with open('data/all_products.json', 'r', encoding='utf-8') as f:
        raw = json.load(f).get('products', [])
    # Migrate old format: used 'id' instead of 'product_id'
    existing = {}
    for p in raw:
        pid = p.get('product_id') or p.get('id')
        if pid:
            p['product_id'] = pid
            existing[pid] = p
except FileNotFoundError:
    existing = {}

today = datetime.utcnow().strftime('%Y-%m-%d')

for offer in offers_data.get('offers', []):
    pid = offer.get('id')
    if not pid:
        continue

    product = {field: offer[field] for field in PRODUCT_FIELDS if field in offer}
    product['product_id'] = pid

    if pid not in existing:
        product['first_seen'] = today
        existing[pid] = product
    else:
        # Refresh mutable product fields, preserve first_seen
        for field in PRODUCT_FIELDS:
            if field in product:
                existing[pid][field] = product[field]

all_products = {
    'generated_at': datetime.utcnow().isoformat() + 'Z',
    'total_products': len(existing),
    'products': list(existing.values()),
}

with open('data/all_products.json', 'w', encoding='utf-8') as f:
    json.dump(all_products, f, ensure_ascii=False, indent=2)

with open('data/all_products.js', 'w', encoding='utf-8') as f:
    f.write('const ALL_PRODUCTS_DATA = ')
    json.dump(all_products, f, ensure_ascii=False, indent=2)
    f.write(';')

# --- Generate offers.js (unchanged format) ---
with open('data/offers.js', 'w', encoding='utf-8') as f:
    f.write('const OFFERS_DATA = ')
    json.dump(offers_data, f, ensure_ascii=False, indent=2)
    f.write(';')

print(f"all_products.js : {all_products['total_products']} products")
print(f"offers.js       : {len(offers_data.get('offers', []))} offers")
