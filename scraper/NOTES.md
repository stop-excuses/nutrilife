# Scraper Notes

## Architecture
- Primary data source: broshura.bg structured pages (`/h/`, `/fl/`, `/flr/`, `/p/`)
- Secondary: Kaufland PDF scraper (kaufland.bg, no rate limiting)
- No OCR — removed April 2026 (see decision below)
- Learning system: `data/custom_keywords.json` auto-promoted from run stats

## Key files
- `scraper.py` — main async Playwright scraper
- `store_scrapers.py` — per-store DOM parsers (Kaufland, Billa, Lidl, Fantastico, T-Market, Dar)
- `kaufland_pdf_scraper.py` — PDF offer extraction from kaufland.bg
- `off_enricher.py` — Open Food Facts macro enrichment (optional)
- `data/custom_keywords.json` — user/auto promoted food keywords
- `data/scraper_stats.json` — run history per store

## Workflow
```
python scraper/scraper.py     # scrape → data/offers.json
python sync_offers.py         # sync offers.json → data/offers.js (for GitHub Pages)
```

## Known issues / blockers
- broshura.bg returns 403 intermittently → retry+backoff is in place
- T-Market uses local DOM scraper (not broshura.bg), requires Playwright profile setup
- Fantastico/Dar use CSV exports from their own sites

## Removed: OCR fallback (April 2026)
OCR via brochure images (`/b/` pages on broshura.bg) was tested extensively but removed because:
- RapidOCR quality was inconsistent across stores (Kaufland: usable, Lidl/Fantastico: noisy)
- Added `brochure_ocr_poc.py`, `hybrid_brochure_merge.py`, `tesseract_ocr.py` — all deleted
- Structured DOM scraping + Kaufland PDF covers enough data without OCR complexity
- If OCR is reconsidered: start from Kaufland only, use RapidOCR, merge conservatively

## Deduplication priority
structured DOM/API (3) > brochure listing (2)
