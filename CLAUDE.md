# CLAUDE.md — NutriLife

Static website (HTML/CSS/JS). Motivates Bulgarians toward healthy living. 5 pages, linear flow, dark theme. Python scraper for weekly grocery offers. All content in Bulgarian.

## Files

```
index.html         Page 1 "Спри да се оправдаваш"
move.html          Page 2 "Движи се"
eat.html           Page 3 "Яж правилно"
cheap.html         Page 4 "Не е скъпо" — loads offers.json
start.html         Page 5 "Започни сега" — tracker with localStorage
css/style.css      Single CSS file — entire design system
js/main.js         Accordion, age selector, sliders, tracker
js/offers.js       Offers: load, filter, bulk, profile recommendations
data/offers.json   Weekly offers data
scraper/scraper.py Python scraper for broshura.bg
scraper/OCR_PROGRESS.md Ongoing OCR notes, test history, and next steps
.github/workflows/scrape.yml  Monday 06:00 UTC auto-scrape
```

No build step. Opens directly in browser.

## Navigation flow
```
index.html → move.html → eat.html → cheap.html → start.html
```
Each page: navbar with 5 dots (shows current page) + CTA button to next page.

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

## CSS components (style.css line references)
| Class | ~Line |
|---|---|
| `.navbar`, `.dot`, `.dot-wrapper` | 104 |
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

Color modifiers `.green`, `.red`, `.amber`, `.purple` work on most components. Utility: `.mt-16/.mt-24/.mt-32`, `.hidden`, `.fade-in`. Responsive breakpoint: 480px.

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
