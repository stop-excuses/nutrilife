#!/usr/bin/env bash
set -e

echo "=== Scraper ==="
python scraper/scraper.py

echo "=== Translate new ingredients ==="
python translate_ingredients.py

echo "=== Sync JS files ==="
python sync_offers.py

echo "=== Commit & push ==="
git add data/offers.json data/offers.js data/all_products.json data/all_products.js
git diff --cached --quiet && echo "Nothing changed." && exit 0

git commit -m "Update offers data $(date '+%Y-%m-%d')"
git push origin master
