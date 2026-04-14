# NutriLife — AI Context

Static website (HTML/CSS/JS) motivating Bulgarians toward healthy living. 5 pages, linear flow, dark theme. Python scraper for weekly grocery offers. All content in Bulgarian.

## Quick orientation

```
index.html → move.html → eat.html → cheap.html → start.html
"Оправдания"  "Движение"  "Хранене"    "Цени"      "Старт"
```

Each page: fixed navbar with 5 dots (current page highlighted) + CTA button to next page.

**Live site**: https://stop-excuses.github.io/nutrilife/  
**Repo**: https://github.com/stop-excuses/nutrilife  
**Hosting**: GitHub Pages, `master` branch

## Files

```
index.html / move.html / eat.html / cheap.html / start.html   5 pages
css/style.css      Single CSS file — entire design system
js/main.js         Accordion, age selector, sliders, tracker
js/offers.js       Offers: load, filter, bulk, profile recommendations
data/offers.json   Weekly offers data (raw JSON)
data/offers.js     Weekly offers data (JS variable for GitHub Pages)
sync_offers.py     Sync offers.json → offers.js after scraping
scraper/scraper.py Main scraper — broshura.bg via Playwright
scraper/NOTES.md   Scraper decisions, known issues, tested approaches
```

## Implementation rule

Prefer proven libraries over hand-rolled implementations. Examples: `Fuse.js` for fuzzy search, `BeautifulSoup`/`requests` for HTML extraction, existing JSON feeds. Custom code only when library adds more fragility than value.

## Scraper workflow

```
python scraper/scraper.py   # → data/offers.json
python sync_offers.py       # → data/offers.js (required for GitHub Pages)
```

Supports: Lidl, Kaufland, Billa, Fantastico, T-Market, Dar. Kaufland also has a PDF scraper. Read `scraper/NOTES.md` before touching scraper code.

## Colors

| Name | Hex | Usage |
|---|---|---|
| Background | `#0a0a0a` | body |
| Text | `#f0efe8` | primary |
| Muted | `#b0afa6` | paragraphs |
| Green | `#3B6D11` / `#97C459` | positive, buttons, accents |
| Red | `#E24B4A` | negative, statistics |
| Amber | `#BA7517` | warning |
| Purple | `#7F77DD` / `#534AB7` | page 5 theme |

Card backgrounds: red `#110a0a`/`#2a1414`, green `#0d1a08`/`#2a3d1e`, purple `#0f0d1a`/`#2a2442`, amber `#1a1408`/`#3d2e14`

## CSS components (style.css)

| Class | ~Line |
|---|---|
| `.navbar`, `.dot` | 104 |
| `.stat-box`, `.stat-card` | 198, 239 |
| `.cards-grid` | 270 |
| `.accordion-item` | 286 |
| `.stat-pill` | 363 |
| `.research` | 402 |
| `.progress-bar` | 418 |
| `.age-btn`, `.age-content` | 465 |
| `.timeline` | 508 |
| `.info-box` | 551 |
| `.cta-section` | 575 |
| `.btn-green/.btn-red/.btn-purple` | 619 |
| `input[type="range"]` | 683 |
| `.comparison` | 717 |
| `.offer-card` | 770 |
| `.filter-btn` | 880 |
| `.tracker-item` | 911 |
| `.week-chart` | 972 |
| `.meal-card` | 1070 |
| `.bulk-card` | 1094 |
| `.savings-box` | 1118 |
| `.shopping-list` | 1135 |

Color modifiers `.green`, `.red`, `.amber`, `.purple` work on most components.  
Utilities: `.mt-16/.mt-24/.mt-32`, `.hidden`, `.fade-in`. Responsive breakpoint: 480px.

## JS functions

**main.js**: `initAccordions()`, `initAgeSelector()`, `initSliders()`, `initProgressBars()`, `initTracker()`, `updateTrackerProgress()`, `updateWeekChart()`, `window.updateSteps()`, `window.updateProtein()`

**offers.js**: `loadOffers()`, `renderOffers()`, `renderBulkRecommendations()`, `renderProfileRecommendations()`, category/profile filter handlers

**Data attributes**: `data-age`, `data-output`, `data-fn`, `data-width`, `data-habit`, `data-category`, `data-profile`

## Offer JSON schema

```json
{
  "id": "string", "store": "Lidl|Kaufland|Billa|T-Market",
  "name": "string", "emoji": "🥚",
  "category": "protein|canned|grain|legume|dairy|nuts|fat|vegetable",
  "new_price": 3.49, "old_price": 4.29, "discount_pct": 19,
  "valid_until": "2026-01-19",
  "weight_raw": "500г", "weight_grams": 500, "price_per_kg": 6.98,
  "shelf_life": "1-2г|малотраен|...", "is_bulk_worthy": true,
  "health_score": 1-10,
  "diet_tags": ["high_protein","keto","mediterranean","vegetarian","budget"]
}
```

Health scores: 10 (риба тон, зехтин) → 9 (яйца, пилешко, леща, нахут) → 8 (овес, скир) → 7 (кисело мляко, сирене) → 6 (ориз, хляб)

## Page sections reference

**index.html** (488 lines): Hero (22) → Огледалото stats (34) → Age buttons (63) → Accordions (154) → Timeline (403) → CTA (466)

**move.html** (314 lines): Hero (22) → 6 accordions мозък/настроение/сън/хормони/сърце/стави (34) → Тежести/HIIT (176) → Крачки slider (241) → Мускули (270) → CTA (291)

**eat.html** (329 lines): Hero (22) → 3 принципа (44) → Топ 15 храни accordions (147) → Протеин калкулатор slider (277) → Примерен ден (291) → CTA (322)

**cheap.html** (242 lines): Hero comparison (22) → Ден по ден (47) → Промоции `#offers-grid` (132) → Bulk `#bulk-recommendations` (156) → Профилни `#profile-recommendations` (166) → Пазарна листа (185) → CTA (234)

**start.html** (317 lines): Hero (22) → 7-дневен план accordions (46) → Tracker 6 checkboxes localStorage (230) → Седмичен chart (272) → CTA (305)
