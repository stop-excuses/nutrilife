# OCR Progress

Current date context: 2026-04-10

This file tracks what has already been tested for brochure OCR, what worked, what failed, and what should be tried next.

## Goal

The main scraper currently extracts offers from structured pages:
- `/h/` store pages
- `/fl/` listing pages
- `/flr/` regional listing pages
- `/p/` product pages

It does **not** yet extract products directly from brochure image pages (`/b/`).

Brochure pages are important because some active brochures do not expose all products via structured listing pages.

## Relevant Files

- `scraper/brochure_ocr_poc.py`
  OCR proof of concept for brochure pages.
- `scraper/hybrid_brochure_merge.py`
  Merges OCR candidates with structured offers.
- `scraper/scraper.py`
  Main scraper. OCR is not yet integrated here.

## Confirmed Architecture Facts

1. Active brochures are exposed as `/b/<id>` pages.
2. `/b/` pages are mostly brochure viewers and image-driven content.
3. `/b/` pages do not provide a clean direct list of `/p/` product links.
4. OCR is therefore a valid fallback path for extracting more brochure products.
5. `broshura.bg` can return `403 Forbidden`, so OCR/structured scraping must be conservative.

## Active Brochure Discovery

Active brochures are now exported separately to:
- `data/brochures.json`
- `data/brochures.js`

This export is useful for deciding which brochure URLs are worth OCR testing.

## OCR Tests Run

### 1. Kaufland

Brochure:
- `https://www.broshura.bg/b/5962247`

Pages tested:
- 2
- 3

Commands used:

```powershell
python scraper/brochure_ocr_poc.py --brochure-url https://www.broshura.bg/b/5962247 --pages 2 3 --json-out data/ocr_test_kaufland_live.json
python scraper/hybrid_brochure_merge.py --brochure-url https://www.broshura.bg/b/5962247 --store Kaufland --pages 2 3 --offers-json data/hybrid_kaufland_output_v2.json --ocr-json-out data/hybrid_ocr_candidates_live.json --output-json data/hybrid_kaufland_output_live.json
```

Outputs:
- `data/ocr_test_kaufland_live.json`
- `data/ocr_test_kaufland_live_v2.json`
- `data/hybrid_ocr_candidates_live.json`
- `data/hybrid_kaufland_output_live.json`

Observed result:
- OCR candidates: 34-37 depending on filter version
- Useful additions exist
- OCR clearly found real food products not reliably present in the structured layer

Examples of useful OCR hits:
- `зелен лук връзка`
- `връзка краставици`
- `авокадо hass`
- `връзка моркови`
- `портокали сок`

Problems still present:
- duplicate detections at different prices
- OCR noise inside names
- mixed generic text with product names
- examples:
  - `ceptnonlimpahn краставици`
  - `печурки hepn домати`
  - `портокали сок cbhyebo`

Conclusion:
- Kaufland is the best current candidate for OCR fallback integration.

### 2. Lidl

Brochure:
- `https://www.broshura.bg/b/5954966`

Pages tested:
- 2
- 3

Command used:

```powershell
python scraper/hybrid_brochure_merge.py --brochure-url https://www.broshura.bg/b/5954966 --store Lidl --pages 2 3 --offers-json data/hybrid_kaufland_output_v2.json --ocr-json-out data/hybrid_ocr_candidates_lidl_live.json --output-json data/hybrid_lidl_output_live.json
```

Outputs:
- `data/hybrid_ocr_candidates_lidl_live.json`
- `data/hybrid_lidl_output_live.json`

Observed result:
- OCR candidates: 17
- merged usable results: only 2

Useful retained result:
- two mushroom detections (`печурки 500 г`) variants

Problems:
- weak OCR quality on Lidl brochure typography/layout
- many detections are too noisy to trust
- product names are often heavily corrupted

Conclusion:
- Lidl is not ready for OCR fallback with the current OCR pipeline.

### 3. Lidl after normalization pass v2

Same brochure:
- `https://www.broshura.bg/b/5954966`

Pages tested:
- 2
- 3

Command used:

```powershell
python scraper/hybrid_brochure_merge.py --brochure-url https://www.broshura.bg/b/5954966 --store Lidl --pages 2 3 --offers-json data/hybrid_kaufland_output_v2.json --ocr-json-out data/hybrid_ocr_candidates_lidl_live_v3.json --output-json data/hybrid_lidl_output_live_v3.json
```

Outputs:
- `data/hybrid_ocr_candidates_lidl_live_v3.json`
- `data/hybrid_lidl_output_live_v3.json`

Observed result:
- OCR candidates: 40
- merged retained results: 17

Useful retained families now include:
- `ягоди`
- `леща`
- `мляко прясно`
- `фузили`
- `ръжен хляб`
- `печурки`

Problems still present:
- some names still contain OCR garbage or mixed-script leftovers
- examples:
  - `Combino фузили meka пшеница fussili`
  - `вкус ръжен ръжено nwehuyeh хляб`
  - `aella hemcko kpabe масло масленост леща`

Conclusion:
- Lidl improved substantially with normalization/filtering
- still not clean enough for production OCR fallback
- worth continuing because recall improved sharply

### 4. Fantastico first pass

Brochure:
- `https://www.broshura.bg/b/5966009`

Pages tested:
- 2
- 3

Initial command used:

```powershell
python scraper/hybrid_brochure_merge.py --brochure-url https://www.broshura.bg/b/5966009 --store Fantastico --pages 2 3 --offers-json data/hybrid_kaufland_output_v2.json --ocr-json-out data/hybrid_ocr_candidates_fantastico_live.json --output-json data/hybrid_fantastico_output_live.json
```

Initial result:
- OCR candidates: 20
- merged usable results: 0

Conclusion:
- Fantastico initially failed food matching almost completely

### 5. Fantastico after targeted replacements

Same brochure:
- `https://www.broshura.bg/b/5966009`

Pages tested:
- 2
- 3

Command used:

```powershell
python scraper/hybrid_brochure_merge.py --brochure-url https://www.broshura.bg/b/5966009 --store Fantastico --pages 2 3 --offers-json data/hybrid_kaufland_output_v2.json --ocr-json-out data/hybrid_ocr_candidates_fantastico_live_v3.json --output-json data/hybrid_fantastico_output_live_v3.json
```

Outputs:
- `data/hybrid_ocr_candidates_fantastico_live_v3.json`
- `data/hybrid_fantastico_output_live_v3.json`

Observed result:
- OCR candidates: 22
- merged retained results: 9

Useful retained families now include:
- `козунак`
- `козуначена плитка боровинки`
- `сурови орехови ядки`

Problems still present:
- some Fantastico names still contain broken tokens
- examples:
  - `козунак tpaha козунак`
  - `козунак ориз rbбn`

Conclusion:
- Fantastico moved from unusable to partially usable
- targeted replacements help a lot for store-specific typography/OCR patterns

### 5a. Iteration loop summary after Fantastico/Lidl cleanup

Three consecutive tuning loops were run on the same brochure pairs for Lidl and Fantastico.

Loop intent:
1. increase recall with broader normalization
2. improve name cleanup without losing too much recall
3. add semantic conflict filtering for mixed-product OCR names

Lidl progression on brochure `https://www.broshura.bg/b/5954966`, pages `2-3`:
- `v3`: 17 retained
- `v4`: 16 retained
- `v5`: 14 retained

Interpretation:
- `v3` was the best recall step
- `v4` improved product names noticeably
- `v5` removed mixed-category garbage such as butter/lentil hybrid names
- current Lidl result is lower count but better precision

Examples of improvement:
- `Combino фузили meka пшеница fussili` -> `фузили мека пшеница`
- `вкус ръжен ръжено nwehuyeh хляб` -> `вкус ръжен ръжено пшеничен хляб`

Remaining Lidl problems:
- some dairy OCR is still corrupted:
  - `maslge hemckeoкраве масло`
  - `hemckeoкраве масло`
- some names are still too descriptive rather than canonical:
  - `ягоди българска`
  - `вкус ръжен ръжено пшеничен хляб`

Fantastico progression on brochure `https://www.broshura.bg/b/5966009`, pages `2-3`:
- `v3`: 9 retained
- `v4`: 9 retained
- `v5`: 7 retained

Interpretation:
- targeted replacements produced the big jump from zero to usable output
- semantic filtering then removed weak mixed-name candidates
- current Fantastico result is smaller but cleaner

Examples of improvement:
- `козунак tpaha козунак` -> removed by later filtering
- `козунак ориз rbбn` -> `козунак ориз`
- stable clean families remain:
  - `козуначена плитка боровинки`
  - `сурови орехови ядки`

Current tuning philosophy:
- first raise recall
- then accept small drops in count if the names become substantially more trustworthy

### 6. Kaufland non-food page check

Brochure:
- `https://www.broshura.bg/b/5962247`

Pages tested:
- 4
- 5

Command used:

```powershell
python scraper/hybrid_brochure_merge.py --brochure-url https://www.broshura.bg/b/5962247 --store Kaufland --pages 4 5 --offers-json data/hybrid_kaufland_output_v2.json --ocr-json-out data/hybrid_ocr_candidates_kaufland_p45.json --output-json data/hybrid_kaufland_output_p45.json
```

Observed result:
- OCR candidates: 18
- merged retained results: 14 structured only
- OCR did not add useful food results

Conclusion:
- these pages are mostly plants/decor
- current food filter correctly rejects them
- this confirms OCR should focus on brochure pages with actual food density, not all pages equally

### 7. Kaufland OCR Fallback Integration (Current)

Brochure:
- `https://www.broshura.bg/b/5962247`

Pages tested:
- 2
- 3

Command used:
- Автоматично извикване чрез `scraper.py` при изпълнение за Kaufland.

Резултати от 2026-04-10:
- Интегриран е `run_ocr_fallback` в основния скрапер.
- Подобрена нормализация (сертифициран, топ цена).
- Разширено филтриране на не-хранителни стоки (растения, тор, семена, 'henipaka').
- Успешно добавяне на липсващи оферти (зелен лук, краставици, авокадо, печурки) при недостатъчно структурирани данни (< 100 оферти).

Заключение:
- Kaufland OCR вече е в "алфа" продукция.

## OCR Filter Improvements Already Added

In `scraper/brochure_ocr_poc.py`:
- added `NON_FOOD_RE`
- improved OCR replacements
- added extra non-food keywords for flowers/decor-like OCR noise
- added more replacements for Lidl-style OCR drift:
  - `maako -> мляко`
  - `macho -> масло`
  - `pouзxog -> произход`
  - `ezunem -> египет`
  - `tbpuua -> турция`

This reduced some obvious false positives such as bouquet/flower-type OCR hits.

In `scraper/hybrid_brochure_merge.py`:
- added `clean_merge_name(...)`
- expanded food hints
- added high-noise rejection
- improved duplicate selection
- added repeated-token cleanup
- added semantic cluster conflict detection
- added targeted replacements for Fantastico-style OCR drift:
  - `koзyhak -> козунак`
  - `cypobh -> сурови`
  - `opexobn -> орехови`
  - `aakn -> ядки`
  - `nnutka -> плитка`
  - `cбopobhhkh -> боровинки`

## Current Practical Recommendation

Do not integrate OCR globally for all stores yet.

Recommended staged rollout:
1. Integrate OCR fallback only for Kaufland active brochures.
2. Keep OCR optional and conservative.
3. Merge only OCR candidates that pass:
   - food whitelist
   - OCR confidence threshold
   - duplicate detection
   - structured-match rejection
4. Later test additional stores one by one:
   - Billa
   - Fantastico
   - Lidl only after more tuning

## Main Blockers

### 1. Anti-bot / Rate Limit

`broshura.bg` sometimes returns `403 Forbidden`.

Main scraper mitigations already added:
- lower concurrency
- bigger random delays
- retry with backoff
- fail-safe against overwriting exports with empty data

### 2. OCR Quality Depends on Store Layout

OCR performance is not uniform.

Kaufland:
- promising

Lidl:
- medium after normalization pass

Fantastico:
- weak at first, now medium on selected pages after targeted replacements

This likely depends on:
- font shape
- text density
- background contrast
- price/name separation
- whether page sections are image tiles or decorative layouts

## Next Recommended Tasks

### Short-term

1. Add stricter post-filtering in `hybrid_brochure_merge.py`
   - reject obviously corrupted mixed tokens
   - reject generic layout words
   - collapse near-duplicate OCR names
   - distinguish "keep for recall" vs "keep for production" thresholds

2. Add OCR confidence tiers:
   - high
   - medium
   - reject

3. Add store-specific OCR profiles
   - Kaufland profile
   - Lidl profile
   - Fantastico profile

### Medium-term

1. Integrate Kaufland OCR fallback into `scraper.py`
2. Add separate output field for OCR-derived offers
3. Keep OCR-origin metadata:
   - `source`
   - `ocr_page`
   - `ocr_score`
   - `ocr_raw_name`

### Best current files to inspect

For strongest current recall/quality balance:
- Lidl:
  - recall-heavy: `data/hybrid_lidl_output_live_v3.json`
  - cleaner: `data/hybrid_lidl_output_live_v5.json`
- Fantastico:
  - recall-heavy and cleaner are close; latest cleaned result:
    - `data/hybrid_fantastico_output_live_v5.json`

## Suggested Standard Test Procedure

When another AI continues this work:

1. Read this file first.
2. Check `data/brochures.json` for active brochure URLs.
3. Start with one brochure only.
4. Run:

```powershell
python scraper/brochure_ocr_poc.py --brochure-url <URL> --pages 2 3 --json-out data/tmp_ocr.json
```

5. If output looks promising, run:

```powershell
python scraper/hybrid_brochure_merge.py --brochure-url <URL> --store <STORE> --pages 2 3 --offers-json <BASELINE_JSON> --ocr-json-out data/tmp_ocr_merge.json --output-json data/tmp_hybrid_output.json
```

6. Evaluate:
- number of OCR candidates
- useful food additions
- false positives
- duplicate quality

## Important Note About Baselines

Recent full scrapes became unstable because of `403 Forbidden`.

Do not trust the latest `data/offers.json` blindly as a good baseline if it was generated during a blocked run.

Prefer using a known-good structured baseline for merge experiments.
