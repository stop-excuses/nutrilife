// Real-user QA for smart-supplements.html — checks core browse/search/sort
// flows, the animal-vs-plant protein-source filter, and that the removed
// compare/watch/confidence-label UI stays gone.
const { chromium } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8000/smart-supplements.html';

(async () => {
  let pass = 0, total = 0;
  const errors = [];
  const warnings = [];
  const issues = [];

  function step(name, ok, detail) {
    total++;
    if (ok) pass++;
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) issues.push(`${name} (${detail || ''})`);
  }

  async function runSearch(page, query) {
    await page.fill('#supplements-search', '');
    await page.waitForTimeout(100);
    await page.fill('#supplements-search', query);
    await page.click('#supplements-search-submit');
    await page.waitForTimeout(500);
  }

  function statusCount(text) {
    return Number((text || '').match(/\d+/)?.[0] || 0);
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
      if (m.type() === 'error') errors.push(`[${profile.label}] console.error: ${m.text()}`);
      if (m.type() === 'warning') warnings.push(`[${profile.label}] console.warn: ${m.text()}`);
    });

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);

    // 1. Initial load
    const cards = await page.locator('.supplement-card').count();
    step('Initial supplement cards rendered', cards > 0, `${cards} cards`);

    // 2. Compare/watch/confidence UI must stay removed
    step('No confidence pill', await page.locator('.supplement-confidence').count() === 0);
    step('No watch buttons', await page.locator('.watch-price-btn').count() === 0);
    step('No compare buttons', await page.locator('.compare-supplement-btn').count() === 0);
    step('No compare panel', await page.locator('#supplement-compare-panel').count() === 0);
    step('No watch panel', await page.locator('#supplements-watch-panel').count() === 0);

    // 3. Label details dropdown still exposes extracted label/math evidence
    const details = page.locator('.supplement-label-details').first();
    await details.scrollIntoViewIfNeeded();
    await details.locator('summary').click();
    await page.waitForTimeout(200);
    const detailsText = await details.textContent();
    step('Label details dropdown opens', /Прочетено от етикета|Опаковка|Как е категоризирано/.test(detailsText || ''), (detailsText || '').slice(0, 120));

    // 4. Protein category exposes the animal-vs-plant source filter
    await page.click('[data-category="protein"]');
    await page.waitForTimeout(500);
    const proteinAll = statusCount(await page.locator('#supplements-status').textContent());
    step('Protein view loads', proteinAll > 0, `${proteinAll} products`);
    step('Protein source filter visible in protein category', await page.locator('#protein-source-filters').isHidden() === false);

    await page.click('[data-category="all"]');
    await page.waitForTimeout(300);
    step('Protein source filter hidden outside protein', await page.locator('#protein-source-filters').isHidden());

    await page.click('[data-category="protein"]');
    await page.waitForTimeout(300);
    await page.click('[data-protein-source="animal"]');
    await page.waitForTimeout(400);
    const animalCount = statusCount(await page.locator('#supplements-status').textContent());
    const animalNames = await page.locator('.supplement-card h3').allTextContents();
    const plantWords = ['plant', 'растител', 'vegan', 'веган', 'soy', 'соев', 'соя', 'pea', 'грах', 'rice protein', 'оризов', 'hemp', 'коноп'];
    const animalHasPlant = animalNames.some(n => plantWords.some(s => n.toLowerCase().includes(s)));
    step('Animal filter excludes plant-named products', !animalHasPlant, animalNames.filter(n => plantWords.some(s => n.toLowerCase().includes(s))).join(', '));

    await page.click('[data-protein-source="plant"]');
    await page.waitForTimeout(400);
    const plantCount = statusCount(await page.locator('#supplements-status').textContent());
    step('Animal + plant partition the protein list', animalCount + plantCount === proteinAll && animalCount > 0 && plantCount > 0, `${animalCount} + ${plantCount} vs ${proteinAll}`);

    await page.click('[data-protein-source="all"]');
    await page.click('[data-category="all"]');
    await page.waitForTimeout(300);

    // 5. New l_carnitine/melatonin category chips work
    for (const cat of ['l_carnitine', 'melatonin']) {
      await page.click(`[data-category="${cat}"]`);
      await page.waitForTimeout(400);
      const c = await page.locator('.supplement-card').count();
      step(`Category ${cat} loads`, c > 0, `${c} cards`);
    }
    await page.click('[data-category="all"]');
    await page.waitForTimeout(300);

    // 6. Search common terms
    for (const q of ['креатин', 'витамин d', 'витамин c', 'омега', 'магнезий', 'протеин', 'цинк', 'фибри', 'електролити', 'колаген', 'желязо', 'карнитин', 'мелатонин']) {
      await runSearch(page, q);
      const c = await page.locator('.supplement-card').count();
      step(`Search "${q}"`, c > 0, `${c} cards`);
    }

    // 7. Empty search
    await runSearch(page, 'zzznotreal999');
    const emptyMsg = await page.locator('#supplements-grid').textContent();
    step('Empty search shows a state', !!emptyMsg, `len=${(emptyMsg || '').length}`);
    await page.fill('#supplements-search', '');
    await page.click('#supplements-search-submit');
    await page.waitForTimeout(300);

    // 8. Sort options
    for (const s of ['unit', 'price', 'store']) {
      const btn = page.locator(`[data-sort="${s}"]`).first();
      if (await btn.count() > 0) {
        await btn.click();
        await page.waitForTimeout(300);
        const c = await page.locator('.supplement-card').count();
        step(`Sort ${s}`, c > 0, `${c} cards`);
      }
    }

    // 9. Product dialog (no watch/compare buttons inside)
    const card = page.locator('.supplement-card').first();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await page.waitForTimeout(400);
    const dialogCount = await page.locator('#supplement-product-overlay .supplement-dialog-screen').count();
    const historyCount = await page.locator('#supplement-product-overlay .supplement-price-history-detail').count();
    step('Supplement card opens product dialog', dialogCount === 1, `history sections: ${historyCount}`);
    const dialogWatchCompare = await page.locator('#supplement-product-overlay .watch-price-btn, #supplement-product-overlay .compare-supplement-btn').count();
    step('Dialog has no compare/watch buttons', dialogWatchCompare === 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // 10. Mobile overflow check
    if (profile.viewport.width <= 480) {
      const bodyW = await page.evaluate(() => document.body.scrollWidth);
      step('No horizontal overflow', bodyW <= profile.viewport.width + 2, `bodyW=${bodyW} vs vp=${profile.viewport.width}`);
    }

    await browser.close();
  }

  console.log(`\n[FLOW] Passed ${pass}/${total} steps`);
  console.log(`[FLOW] Console errors: ${errors.length}`);
  errors.forEach(e => console.log('  ' + e));
  console.log(`[FLOW] Console warnings: ${warnings.length}`);
  warnings.slice(0, 10).forEach(w => console.log('  ' + w));
  if (issues.length) {
    console.log('\nIssues:');
    issues.forEach(i => console.log('  - ' + i));
  }

  process.exit(errors.length === 0 && pass === total ? 0 : 1);
})();
