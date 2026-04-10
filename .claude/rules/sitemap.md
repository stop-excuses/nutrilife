# Sitemap — NutriLife

## Page flow
```
index.html → move.html → eat.html → cheap.html → start.html
"Оправдания"  "Движение"  "Хранене"    "Цени"      "Старт"
```

## index.html — "Спри да се оправдаваш" (488 lines)

| # | Section | Line | Content |
|---|---------|------|---------|
| 1 | Hero | 22 | "Спри да се оправдаваш", 72% stat box |
| 2 | Огледалото | 34 | 4 stat cards (наднормено тегло, диабет, седене, сърце) |
| 3 | Лично засягане | 63 | 4 age buttons (20-50+), progress bars per age group |
| 4 | Оправданията | 154 | Accordion cards — excuses with stat pills |
| 5 | Какво печелиш | 403 | Timeline (1м/3м/1г), genes box, men box |
| 6 | CTA | 466 | "Утре сутринта" → move.html |

## move.html — "Движи се" (314 lines)

| # | Section | Line | Content |
|---|---------|------|---------|
| 1 | Hero | 22 | "Тялото е направено да се движи", 150 мин stat |
| 2 | Не е само за тялото | 34 | 6 green accordions (мозък, настроение, сън, хормони, сърце, стави) — всеки с 2 research citations |
| 3 | Тежести или HIIT? | 176 | 2 green accordions + препоръка box |
| 4 | Крачки | 241 | 3 stat cards (2000/5000/8000+) + interactive slider |
| 5 | Мускули | 270 | 2 stat cards (3-5% загуба, всяка възраст) |
| 6 | CTA | 291 | "30 мин на ден" → eat.html |

## eat.html — "Яж правилно" (329 lines)

| # | Section | Line | Content |
|---|---------|------|---------|
| 1 | Hero | 22 | "Храненето не е диета", 3 принципа icons |
| 2 | 3-те принципа | 44 | Протеин (1.6-2г/кг), Реална храна, Захарта — with research citations |
| 3 | Топ 15 храни | 147 | 15 green accordions (яйца→банан), всяка с протеин/цена/score |
| 4 | Протеин калкулатор | 277 | Weight slider → daily protein need |
| 5 | Примерен ден | 291 | 3 meal cards = 132г протеин, 6.80лв |
| 6 | CTA | 322 | "Плати по-малко" → cheap.html |

## cheap.html — "Не е скъпо" (242 lines)

| # | Section | Line | Content |
|---|---------|------|---------|
| 1 | Hero | 22 | 25лв vs 7лв comparison + savings box (540лв/м) |
| 2 | Сравнение ден по ден | 47 | 3 accordions (закуска/обяд/вечеря) with side-by-side |
| 3 | Промоции | 132 | Category filters → `#offers-grid` (from offers.json) |
| 4 | Bulk препоръки | 156 | `#bulk-recommendations` (is_bulk_worthy items) |
| 5 | Профилни препоръки | 166 | Profile filters → `#profile-recommendations` (top 5) |
| 6 | Пазарна листа | 185 | 7 items = ~47лв/седмица |
| 7 | Цена на боледуване | 208 | Диабет 200лв/м, операция 10000лв+ vs 2500лв/г здравословно |
| 8 | CTA | 234 | "Вземи плана" → start.html |

## start.html — "Започни сега" (317 lines)

| # | Section | Line | Content |
|---|---------|------|---------|
| 1 | Hero | 22 | "7 дни. Промени навика.", 30мин/7лв/0лв stats |
| 2 | 7-дневен план | 46 | 7 purple accordions (Ден 1-7), всеки с хранене + движение + цел |
| 3 | Daily tracker | 230 | 6 checkboxes (протеин, вода, движение, сън, без захар, без junk) → localStorage |
| 4 | Седмичен прогрес | 272 | 7-bar week chart from localStorage |
| 5 | След 7 дни | 290 | 3 options: повтори / добави / провери промоции |
| 6 | Финален CTA | 305 | "Днес." → scrolls to Ден 1 |

## style.css — component map (~1249 lines)

| Component | ~Line | Notes |
|---|---|---|
| Navbar & dots | 104 | Fixed top, blur backdrop, 5 dot navigation |
| Hero | 182 | Centered, padding-top for navbar |
| Stat box / card | 198 / 239 | Large and small stat displays |
| Cards grid | 270 | 2-col default, `.three` for 3-col |
| Accordion | 286 | max-height animation, `.green`/`.purple` variants |
| Stat pills | 363 | Inline badges, color variants |
| Research citation | 402 | Left green border, small text |
| Progress bar | 418 | Animated fill with `data-width` |
| Age buttons | 465 | 4-col grid, `.active` state |
| Timeline | 508 | Vertical green line with dots |
| Info box | 551 | Colored border box, variants |
| CTA section | 575 | Centered with step numbers |
| Buttons | 619 | `.btn-green`, `.btn-red`, `.btn-purple`, `.btn-outline` |
| Slider | 683 | Custom range input, green thumb |
| Comparison | 717 | 2-col `.bad` vs `.good` |
| Offer cards | 770 | Emoji + info + prices + meta |
| Filter buttons | 880 | Rounded, `.active` state |
| Tracker | 911 | Purple checkboxes with labels |
| Week chart | 972 | 7 vertical bars |
| Meal card | 1070 | Green card with meal label |
| Bulk card | 1094 | Green card with category label |
| Savings box | 1118 | Gradient green, large number |
| Shopping list | 1135 | Name + price rows |
| Responsive | 1213 | 480px breakpoint |

## JS entry points

**main.js** — loaded on every page. Auto-inits on DOMContentLoaded:
- Accordions (click to open/close)
- Age selector (index.html only)
- Range sliders (calls `window.updateSteps` / `window.updateProtein`)
- Progress bar scroll animation
- Tracker + week chart (start.html only, uses localStorage key `nutrilife-tracker-YYYY-MM-DD`)

**offers.js** — loaded on cheap.html only. Fetches `data/offers.json`, renders offers grid, bulk recommendations, profile recommendations. Filter buttons use `data-category` and `data-profile` attributes.

## Scraper (scraper.py)

Scrapes broshura.bg/i/3 (supermarkets) → filters healthy foods → adds health_score, diet_tags, weight parsing, shelf_life, is_bulk_worthy → exports to data/offers.json. Runs via GitHub Actions every Monday or manually.