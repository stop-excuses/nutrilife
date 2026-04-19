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

## Store coverage (April 2026)
- Kaufland: DOM scraper (offers page only — promotions)
- Billa: ssbbilla.site HTML (weekly brochure — promotions only)
- Lidl: embedded JSON in category pages (promos + assortment)
- Fantastico: CSV export (all products — promos + assortment, ~2300 unique)
- Dar: CSV export (all products — Fantastico group, ~1300 unique)
- T-Market: requests scraper — 12 major category pages with pagination
  (~5300 unique products; promos + assortment; no Playwright needed)

## Known issues / blockers
- broshura.bg returns 403 intermittently → retry+backoff is in place
- Billa full catalog not available via ssbbilla.site (weekly brochure only)
- Kaufland catalog pages not yet scraped (only offers page)

## Removed: OCR fallback (April 2026)
OCR via brochure images (`/b/` pages on broshura.bg) was tested extensively but removed because:
- RapidOCR quality was inconsistent across stores (Kaufland: usable, Lidl/Fantastico: noisy)
- Added `brochure_ocr_poc.py`, `hybrid_brochure_merge.py`, `tesseract_ocr.py` — all deleted
- Structured DOM scraping + Kaufland PDF covers enough data without OCR complexity
- If OCR is reconsidered: start from Kaufland only, use RapidOCR, merge conservatively

## Deduplication priority
structured DOM/API (3) > brochure listing (2)
