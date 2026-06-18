// Favorites flow on smart-food.html (keyword-group model)
// Covers:
//  - inactive vs active heart visuals
//  - click ANY риба тон card -> ALL риба тон hearts auto-fill red
//  - "Риба тон" row auto-expands on add with all matching offers inside
//  - click any active heart of the group -> whole keyword goes off (all hearts inactive, row removed)
//  - × on watch-list row removes the whole keyword + resets all hearts
//  - cross-keyword: tuna + chicken coexist as two rows, independent toggles
//  - persistence across reload
//
// Usage: with `python -m http.server 8000` running:
//   node tests/user-flow-smart-food-favorites.js
const { chromium } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8000/smart-food.html';

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

  async function activeCountInGrid(page) {
    return await page.locator('#offers-grid .offer-img-area .fav-btn.active').count();
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
      const isResourceNoise = /Failed to load resource/i.test(text)
        || /imgproxy/i.test(text)
        || /404|403/.test(text);
      if (m.type() === 'error' && !isResourceNoise) errors.push(`[${profile.label}] console.error: ${text}`);
      if (m.type() === 'warning' && !isResourceNoise) warnings.push(`[${profile.label}] console.warn: ${text}`);
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem('nutrilife-favorites'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);

    // Empty start
    const initFavs = await favoriteIds(page);
    step('Empty start: localStorage favorites is []', initFavs.length === 0, JSON.stringify(initFavs));
    step('Empty start: fav panel shows .fav-empty', (await page.locator('.fav-empty').count()) === 1);

    // Search риба тон
    await runSearch(page, 'риба тон');
    const tunaCardCount = await page.locator('#offers-grid .offer-card').count();
    step(`Search 'риба тон' returns cards`, tunaCardCount >= 3, `${tunaCardCount} cards`);
    const tunaIds = await tunaCardIds(page);
    step('Got at least 3 real tuna offer ids', tunaIds.length >= 3, `${tunaIds.length} real-tuna cards`);

    // Inactive visuals
    const inactiveVis = await heartLooksDistinct(page, tunaIds[0]);
    step('Inactive heart: grayscale filter', /grayscale/.test(inactiveVis?.filter || ''), inactiveVis?.filter);
    step('Inactive heart: no transform', inactiveVis?.transform === 'none', inactiveVis?.transform);

    // Active visuals after click
    const allTunaInactiveBefore = await Promise.all(tunaIds.map(id => heartIsActive(page, id)));
    step('Before any click: all tuna hearts inactive', allTunaInactiveBefore.every(x => x === false));

    await clickHeart(page, tunaIds[0]);
    await page.waitForTimeout(500);
    const clickedVis = await heartLooksDistinct(page, tunaIds[0]);
    step('Clicked heart now .active', clickedVis?.active === true);
    step('Clicked heart: filter none (full color)', clickedVis?.filter === 'none', clickedVis?.filter);
    step('Clicked heart: scaled up', /matrix\(1\.12/.test(clickedVis?.transform || ''), clickedVis?.transform);

    // KEY: ALL other риба тон hearts also auto-fill red
    const sampleIds = tunaIds.slice(0, Math.min(5, tunaIds.length));
    const sampleActive = await Promise.all(sampleIds.map(id => heartIsActive(page, id)));
    const groupActiveCount = sampleActive.filter(x => x === true).length;
    step('Group auto-fill: all sampled риба тон hearts active', groupActiveCount === sampleIds.length, `${groupActiveCount}/${sampleIds.length}`);
    const totalActiveInGrid = await activeCountInGrid(page);
    step('Many hearts active in grid after single click', totalActiveInGrid >= tunaIds.length, `${totalActiveInGrid} active hearts (>= ${tunaIds.length} tuna)`);

    // Fav panel shows the group row
    const kwLabel = (await page.locator('#fav-panel .fav-item .fav-kw').first().textContent() || '').trim();
    step('Fav panel shows "Риба тон" row', kwLabel === 'Риба тон', kwLabel);
    const expanded = await page.evaluate(() =>
      document.querySelector('#fav-panel .fav-item')?.classList.contains('expanded')
    );
    step('First-add: row auto-expanded', expanded === true);
    const insideOffers = await page.locator('#fav-panel .fav-item .fav-card').count();
    step('Row shows matching tuna offer cards inside', insideOffers >= 1, `${insideOffers} fav cards inside`);

    // Storage: one kw entry
    const favsAfterAdd = await favoriteIds(page);
    step('Storage: one kw entry for риба тон',
      favsAfterAdd.length === 1 && favsAfterAdd[0].kw === 'риба тон',
      JSON.stringify(favsAfterAdd.map(f => f.kw)));

    // Click ANY tuna heart -> whole group toggles off
    await clickHeart(page, tunaIds[2]);
    await page.waitForTimeout(400);
    const allTunaInactive = await Promise.all(tunaIds.map(id => heartIsActive(page, id)));
    step('After clicking any active heart: ALL tuna hearts inactive', allTunaInactive.every(x => x === false));
    const favsAfterOff = await favoriteIds(page);
    step('Storage: tuna kw removed', favsAfterOff.length === 0, JSON.stringify(favsAfterOff));
    step('Watch-list row gone', (await page.locator('#fav-panel .fav-item').count()) === 0);

    // Re-add tuna, then add chicken — two independent rows
    await clickHeart(page, tunaIds[0]);
    await page.waitForTimeout(400);
    await runSearch(page, 'пилешко филе');
    let chickenIds = await chickenCardIds(page);
    if (chickenIds.length === 0) {
      await runSearch(page, 'пиле');
      chickenIds = await chickenCardIds(page);
    }
    step('Got at least 1 chicken offer id', chickenIds.length >= 1, `${chickenIds.length}`);
    await clickHeart(page, chickenIds[0]);
    await page.waitForTimeout(400);
    const twoRows = await page.locator('#fav-panel .fav-item').count();
    step('Two distinct keyword rows now', twoRows === 2, `${twoRows} fav rows`);

    // All chicken hearts auto-fill in the now-visible chicken results
    const chickenSampleActive = await Promise.all(chickenIds.slice(0, 5).map(id => heartIsActive(page, id)));
    step('All chicken hearts active after single click', chickenSampleActive.every(x => x === true), JSON.stringify(chickenSampleActive));

    // × button: removes only that kw, other kw row stays
    await page.click('#fav-panel .fav-item[data-kw="пилешко"] .fav-rm');
    await page.waitForTimeout(300);
    const rowsLeft = await page.locator('#fav-panel .fav-item').count();
    step('× removes only its keyword (tuna row stays)', rowsLeft === 1);
    const remainingKw = (await page.locator('#fav-panel .fav-item .fav-kw').first().textContent() || '').trim();
    step('Remaining row is "Риба тон"', remainingKw === 'Риба тон', remainingKw);
    const chickenHeartsAfterX = await Promise.all(chickenIds.slice(0, 5).map(id => heartIsActive(page, id)));
    step('× resets all chicken hearts to inactive', chickenHeartsAfterX.every(x => x === false));

    // Reload persistence
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    await runSearch(page, 'риба тон');
    const tunaAfterReload = await tunaCardIds(page);
    const tunaActiveAfterReload = await Promise.all(tunaAfterReload.slice(0, 5).map(id => heartIsActive(page, id)));
    step('Reload: tuna group still active', tunaActiveAfterReload.length > 0 && tunaActiveAfterReload.every(x => x === true), JSON.stringify(tunaActiveAfterReload));
    const favsAfterReload = await favoriteIds(page);
    step('Reload: storage round-trips kw',
      favsAfterReload.length === 1 && favsAfterReload[0].kw === 'риба тон',
      JSON.stringify(favsAfterReload.map(f => f.kw)));

    await browser.close();
  }

  console.log(`\n=== Result: ${passed}/${total} steps passed ===`);
  console.log(`Errors: ${errors.length} | Warnings: ${warnings.length}`);
  errors.forEach(e => console.log('  ! ' + e));
  warnings.forEach(w => console.log('  ~ ' + w));
  process.exit(passed === total && errors.length === 0 ? 0 : 1);
})();
