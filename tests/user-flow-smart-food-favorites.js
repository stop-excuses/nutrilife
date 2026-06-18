// Favorites flow on smart-food.html
// Covers:
//  - inactive vs active heart visuals
//  - multiple seeds per keyword (each click adds an independent seed)
//  - prior seeds STAY active when a new card of the same keyword is favorited
//  - fav row auto-expands on first add, smooth-scrolls into view
//  - per-card un-favorite leaves other seeds active
//  - last seed un-favorite removes the whole kw row
//  - × button removes the whole kw and resets all matching hearts
//  - cross-keyword: tuna + chicken coexist as two rows
//
// Usage: with `python -m http.server 8000` running:
//   node tests/user-flow-smart-food-favorites.js
const { chromium } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8000/smart-food.html';

// CSS.escape is not available in Node — emulate for selector building.
function cssEscape(value) {
  return String(value).replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~ ]/g, ch => '\\' + ch);
}

(async () => {
  const errors = [];
  const warnings = [];
  let total = 0, passed = 0;
  function step(name, ok, detail) {
    total++; if (ok) passed++;
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  }

  async function runSearch(page, query) {
    await page.fill('#offers-search', '');
    await page.waitForTimeout(80);
    await page.fill('#offers-search', query);
    await page.click('#offers-search-submit');
    // Search switches source to "all" which lazy-loads the ~10MB catalog and
    // re-renders the grid. Wait for the offers-status hint to clear and the
    // grid to settle so the offer ids we grab are from the final render.
    await page.waitForFunction(() => {
      const status = document.getElementById('offers-status');
      const txt = (status?.textContent || '').toLowerCase();
      return !txt.includes('зарежд');
    }, { timeout: 25000 });
    await page.waitForTimeout(800);
  }

  async function tunaCardIds(page) {
    return await page.locator('#offers-grid .offer-card').evaluateAll(cards =>
      cards
        .filter(c => /риба\s*тон/i.test(c.textContent || ''))
        .map(c => c.dataset.offerId)
        .filter(Boolean)
    );
  }

  async function chickenCardIds(page) {
    return await page.locator('#offers-grid .offer-card').evaluateAll(cards =>
      cards
        .filter(c => /пиле/i.test(c.textContent || ''))
        .map(c => c.dataset.offerId)
        .filter(Boolean)
    );
  }

  async function favoriteIds(page) {
    return await page.evaluate(() => JSON.parse(localStorage.getItem('nutrilife-favorites') || '[]'));
  }

  async function heartIsActive(page, offerId) {
    return await page.evaluate(id => {
      const el = document.querySelector(`.offer-img-area .fav-btn[data-offer-id="${CSS.escape(id)}"]`);
      return el ? el.classList.contains('active') : null;
    }, offerId);
  }

  async function heartLooksDistinct(page, offerId) {
    return await page.evaluate(id => {
      const el = document.querySelector(`.offer-img-area .fav-btn[data-offer-id="${CSS.escape(id)}"]`);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        active: el.classList.contains('active'),
        filter: cs.filter,
        transform: cs.transform,
        borderColor: cs.borderColor,
      };
    }, offerId);
  }

  async function clickHeart(page, offerId) {
    await page.click(`.offer-img-area .fav-btn[data-offer-id="${cssEscape(offerId)}"]`);
  }

  for (const profile of [
    { label: 'DESKTOP', viewport: { width: 1440, height: 900 } },
    { label: 'MOBILE 390x844', viewport: { width: 390, height: 844 } },
  ]) {
    console.log('\n=== ' + profile.label + ' ===');
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: profile.viewport });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`[${profile.label}] pageerror: ${e.message}`));
    page.on('console', m => {
      const text = m.text();
      // Ignore product-image CDN failures and other resource-load noise
      // unrelated to favorites logic.
      const isResourceNoise = /Failed to load resource/i.test(text)
        || /imgproxy/i.test(text)
        || /404|403/.test(text);
      if (m.type() === 'error' && !isResourceNoise) errors.push(`[${profile.label}] console.error: ${text}`);
      if (m.type() === 'warning' && !isResourceNoise) warnings.push(`[${profile.label}] console.warn: ${text}`);
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    // Clear AFTER load so reloads later in the test keep storage intact.
    await page.evaluate(() => localStorage.removeItem('nutrilife-favorites'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);

    // Initial: empty favorites
    const initFavs = await favoriteIds(page);
    step('Empty start: localStorage favorites is []', initFavs.length === 0, JSON.stringify(initFavs));
    const initEmpty = await page.locator('.fav-empty').count();
    step('Empty start: fav panel shows .fav-empty', initEmpty === 1);

    // Heart visual styles: inactive
    await runSearch(page, 'риба тон');
    const tunaCardCount = await page.locator('#offers-grid .offer-card').count();
    step(`Search 'риба тон' returns cards`, tunaCardCount >= 3, `${tunaCardCount} cards`);

    const tunaIds = await tunaCardIds(page);
    step('Got at least 3 tuna offer ids for multi-seed test', tunaIds.length >= 3, `${tunaIds.length} real-tuna cards`);

    const inactiveVis = await heartLooksDistinct(page, tunaIds[0]);
    step('Inactive heart: filter is grayscale', /grayscale/.test(inactiveVis?.filter || ''), inactiveVis?.filter);
    step('Inactive heart: transform none', inactiveVis?.transform === 'none', inactiveVis?.transform);

    // Click first heart -> active
    await clickHeart(page, tunaIds[0]);
    await page.waitForTimeout(500);
    const activeVis = await heartLooksDistinct(page, tunaIds[0]);
    step('After click: heart .active', activeVis?.active === true);
    step('Active heart: filter none (full color)', activeVis?.filter === 'none', activeVis?.filter);
    step('Active heart: scaled up', /matrix\(1\.12/.test(activeVis?.transform || ''), activeVis?.transform);

    // Fav panel: 'Риба тон' row appears, auto-expanded
    const kwLabel = await page.locator('#fav-panel .fav-item .fav-kw').first().textContent();
    step('Fav panel shows "Риба тон" row', (kwLabel || '').trim() === 'Риба тон', kwLabel);
    const expanded = await page.evaluate(() =>
      document.querySelector('#fav-panel .fav-item')?.classList.contains('expanded')
    );
    step('First-add: row auto-expanded', expanded === true);
    const insideOffers = await page.locator('#fav-panel .fav-item .fav-card').count();
    step('Row shows matching tuna offer cards inside', insideOffers >= 1, `${insideOffers} fav cards inside`);

    // Click second tuna card -> BOTH stay active
    await clickHeart(page, tunaIds[1]);
    await page.waitForTimeout(400);
    const a0 = await heartIsActive(page, tunaIds[0]);
    const a1 = await heartIsActive(page, tunaIds[1]);
    step('After 2nd tuna fav: first heart STILL active', a0 === true);
    step('After 2nd tuna fav: second heart active', a1 === true);
    const favs2 = await favoriteIds(page);
    step('Storage: one kw row with 2 seedOfferIds',
      favs2.length === 1 && Array.isArray(favs2[0].seedOfferIds) && favs2[0].seedOfferIds.length === 2,
      JSON.stringify(favs2));

    // Click third tuna card -> all three active
    await clickHeart(page, tunaIds[2]);
    await page.waitForTimeout(400);
    const allThreeActive = await Promise.all([
      heartIsActive(page, tunaIds[0]),
      heartIsActive(page, tunaIds[1]),
      heartIsActive(page, tunaIds[2]),
    ]);
    step('After 3rd tuna fav: all three hearts active', allThreeActive.every(x => x === true), JSON.stringify(allThreeActive));
    const favs3 = await favoriteIds(page);
    step('Storage: still 1 kw row with 3 seedOfferIds',
      favs3.length === 1 && favs3[0].seedOfferIds.length === 3,
      JSON.stringify(favs3.map(f => ({ kw: f.kw, n: f.seedOfferIds.length }))));

    // Un-favorite middle one — other two stay active
    await clickHeart(page, tunaIds[1]);
    await page.waitForTimeout(400);
    const stateAfterMid = await Promise.all([
      heartIsActive(page, tunaIds[0]),
      heartIsActive(page, tunaIds[1]),
      heartIsActive(page, tunaIds[2]),
    ]);
    step('Un-fav middle: first stays active', stateAfterMid[0] === true);
    step('Un-fav middle: middle now inactive', stateAfterMid[1] === false);
    step('Un-fav middle: third stays active', stateAfterMid[2] === true);
    const favsMid = await favoriteIds(page);
    step('Storage: 1 row, 2 seeds after un-fav middle',
      favsMid.length === 1 && favsMid[0].seedOfferIds.length === 2,
      JSON.stringify(favsMid.map(f => ({ kw: f.kw, n: f.seedOfferIds.length }))));

    // Add a different keyword — chicken
    await runSearch(page, 'пилешко филе');
    await page.waitForTimeout(400);
    let chickenIdsFinal = await chickenCardIds(page);
    if (chickenIdsFinal.length === 0) {
      await runSearch(page, 'пиле');
      chickenIdsFinal = await chickenCardIds(page);
    }
    step('Got at least 1 chicken offer id', chickenIdsFinal.length >= 1, `${chickenIdsFinal.length}`);
    await clickHeart(page, chickenIdsFinal[0]);
    await page.waitForTimeout(400);
    const twoRows = await page.locator('#fav-panel .fav-item').count();
    step('Two distinct keyword rows now', twoRows === 2, `${twoRows} fav rows`);

    // Go back to tuna and un-favorite remaining seeds — last one removes the row
    await runSearch(page, 'риба тон');
    await page.waitForTimeout(400);
    await clickHeart(page, tunaIds[0]);
    await page.waitForTimeout(300);
    const stillTunaRow1 = await page.locator('#fav-panel .fav-item[data-kw="риба тон"]').count();
    step('After removing 1 of 2 tuna seeds: tuna row still present', stillTunaRow1 === 1);
    await clickHeart(page, tunaIds[2]);
    await page.waitForTimeout(300);
    const stillTunaRow0 = await page.locator('#fav-panel .fav-item[data-kw="риба тон"]').count();
    step('After removing last tuna seed: tuna row GONE', stillTunaRow0 === 0);
    const rowsLeft = await page.locator('#fav-panel .fav-item').count();
    step('Chicken row still present', rowsLeft === 1, `${rowsLeft} rows`);

    // × button on chicken: removes whole kw, heart goes inactive
    await runSearch(page, 'пиле');
    await page.waitForTimeout(400);
    const chickenSeedHeartCount = await page.locator(`.offer-img-area .fav-btn[data-offer-id="${cssEscape(chickenIdsFinal[0])}"]`).count();
    if (chickenSeedHeartCount > 0) {
      await page.click('#fav-panel .fav-item .fav-rm');
      await page.waitForTimeout(300);
      const noRows = await page.locator('#fav-panel .fav-item').count();
      const empty = await page.locator('#fav-panel .fav-empty').count();
      step('× removes kw row', noRows === 0 && empty === 1);
      const heartAfterX = await heartIsActive(page, chickenIdsFinal[0]);
      step('× resets the chicken seed heart to inactive', heartAfterX === false || heartAfterX === null);
    }

    // Persistence across reload
    await clickHeart(page, chickenIdsFinal[0]);
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    await runSearch(page, 'пиле');
    await page.waitForTimeout(400);
    const afterReload = await heartIsActive(page, chickenIdsFinal[0]);
    step('Reload: heart still active for previously favorited seed', afterReload === true);
    const afterReloadStorage = await favoriteIds(page);
    step('Reload: storage round-trips seedOfferIds array',
      afterReloadStorage.length === 1 && Array.isArray(afterReloadStorage[0].seedOfferIds) && afterReloadStorage[0].seedOfferIds.length === 1,
      JSON.stringify(afterReloadStorage));

    await browser.close();
  }

  console.log(`\n=== Result: ${passed}/${total} steps passed ===`);
  console.log(`Errors: ${errors.length} | Warnings: ${warnings.length}`);
  errors.forEach(e => console.log('  ! ' + e));
  warnings.forEach(w => console.log('  ~ ' + w));
  process.exit(passed === total && errors.length === 0 ? 0 : 1);
})();
