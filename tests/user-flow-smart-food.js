// Real-user exploration of smart-food.html
// Mimics a person searching foods, filtering, expanding cards, favoriting.
const { chromium } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8000/smart-food.html';

function log(msg) { console.log('[FLOW] ' + msg); }

(async () => {
  const errors = [];
  const warnings = [];
  let totalSteps = 0, passed = 0;

  function step(name, ok, detail) {
    totalSteps++;
    if (ok) passed++;
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  }

  async function runSearch(page, query) {
    await page.fill('#offers-search', '');
    await page.waitForTimeout(100);
    await page.fill('#offers-search', query);
    await page.click('#offers-search-submit');
    await page.waitForTimeout(600);
  }

  // Desktop run
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

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // 1. Initial load
    const initialCards = await page.locator('#offers-grid .offer-card').count();
    step('Initial offer cards rendered', initialCards > 0, `${initialCards} cards`);

    const statusText = (await page.locator('#offers-status').textContent() || '').trim();
    step('Status bar updated (not stuck on loading)', !statusText.toLowerCase().includes('зареждане'), statusText);

    // 2. Search common foods (user-like)
    const queries = ['яйца', 'кисело мляко', 'пиле', 'ориз', 'риба тон', 'зехтин', 'банани', 'сирене'];
    for (const q of queries) {
      await runSearch(page, q);
      const c = await page.locator('#offers-grid .offer-card').count();
      const empty = await page.locator('.offers-empty').count();
      step(`Search "${q}"`, c > 0 || empty > 0, `${c} cards, empty=${empty}`);
    }
    await runSearch(page, 'яйца');
    const eggCards = await page.locator('#offers-grid .offer-card').evaluateAll(cards =>
      cards.map(card => (card.textContent || '').toLowerCase())
    );
    const eggSweetMatches = eggCards.filter(text =>
      ['вафл', 'шоколад', 'бонбон', 'raffaello', 'рафаело', 'lambertz', 'пълнеж'].some(word => text.includes(word))
    );
    const eggPackMatches = eggCards.filter(text =>
      /\b\d+\s*(?:бр|бр\.|броя)\b/i.test(text) || text.includes('кора яйца') || text.includes('пресни яйц')
    );
    step('Search "яйца" excludes dessert eggs', eggSweetMatches.length === 0, `${eggSweetMatches.length} bad matches`);
    step('Search "яйца" shows real egg packs', eggCards.length > 0 && eggPackMatches.length === eggCards.length, `${eggPackMatches.length}/${eggCards.length} real packs`);

    // 3. Empty/nonexistent search → reset works
    await runSearch(page, 'zzznotreal999');
    const emptyVisible = await page.locator('.offers-empty').count();
    const resetBtn = page.locator('[data-reset-offers]');
    step('Empty state shows reset button', emptyVisible > 0 && (await resetBtn.count()) > 0);
    if (await resetBtn.count() > 0) {
      await resetBtn.first().click();
      await page.waitForTimeout(600);
      const afterReset = await page.locator('#offers-grid .offer-card').count();
      step('Reset button restores offers', afterReset > 0, `${afterReset} cards`);
    }

    // 4. Filter combos
    const advancedFilters = page.locator('.advanced-filter-panel summary');
    if (await advancedFilters.count() > 0) {
      await advancedFilters.click();
      await page.waitForTimeout(150);
    }
    await page.click('[data-category="dairy"]');
    await page.waitForTimeout(300);
    await page.click('[data-store="Kaufland"]');
    await page.waitForTimeout(300);
    const comboCount = await page.locator('#offers-grid .offer-card').count();
    step('Category dairy + store Kaufland', comboCount >= 0, `${comboCount} cards`);

    await page.click('[data-category="all"]');
    await page.click('[data-store="all"]');
    await page.waitForTimeout(300);

    // 5. Sort options
    for (const s of ['price_per_kg', 'health', 'protein_value', 'recommended']) {
      await page.click(`[data-sort="${s}"]`);
      await page.waitForTimeout(300);
      const c = await page.locator('#offers-grid .offer-card').count();
      step(`Sort ${s}`, c > 0, `${c} cards`);
    }

    // 6. Diet filter
    await page.click('[data-diet="keto"]');
    await page.waitForTimeout(300);
    const ketoC = await page.locator('#offers-grid .offer-card').count();
    step('Diet keto', ketoC >= 0, `${ketoC} cards`);
    await page.click('[data-diet="all"]');
    await page.waitForTimeout(200);

    // 7. Source: all products (catalog)
    await page.click('[data-source="all"]');
    await page.waitForTimeout(1200);
    const allSrcC = await page.locator('#offers-grid .offer-card').count();
    step('Source: all products (catalog)', allSrcC > 0, `${allSrcC} cards`);
    await page.click('[data-source="promo"]');
    await page.waitForTimeout(600);

    // 8. Pagination
    const pageBtns = page.locator('#offers-pagination button');
    const pageCount = await pageBtns.count();
    step('Pagination renders', pageCount > 0, `${pageCount} buttons`);
    if (pageCount >= 2) {
      await pageBtns.nth(1).click();
      await page.waitForTimeout(400);
      const p2 = await page.locator('#offers-grid .offer-card').count();
      step('Pagination page 2', p2 > 0, `${p2} cards`);
      // back to page 1
      const p1btn = page.locator('#offers-pagination button[data-page="1"]').first();
      if (await p1btn.count() > 0 && await p1btn.isEnabled()) {
        await p1btn.click();
        await page.waitForTimeout(300);
      }
    }

    // 9. Card product dialog
    const firstCard = page.locator('#offers-grid .offer-card').first();
    await firstCard.scrollIntoViewIfNeeded();
    await firstCard.click();
    await page.waitForTimeout(400);
    const dialogCount = await page.locator('#offer-product-overlay .fav-product-screen').count();
    const dialogTitle = dialogCount ? await page.locator('#offer-product-overlay .fav-screen-summary h3').first().textContent() : '';
    step('Card opens product dialog', dialogCount === 1, `${(dialogTitle || '').trim().slice(0, 60)}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // 10. Favorite (watch list)
    const favBtn = page.locator('#offers-grid .offer-card .fav-btn').first();
    if (await favBtn.count() > 0) {
      await favBtn.scrollIntoViewIfNeeded();
      await favBtn.click();
      await page.waitForTimeout(400);
      const favItems = await page.locator('#fav-panel .fav-item').count();
      const favText = await page.locator('#fav-panel').innerText();
      step('Favorite click adds to watch list', favItems > 0 && favText.includes('Пазарен списък'), `items visible: ${favItems}`);
    }

    // 11. Weekly editorial shortlist is intentionally not shown on Smart Food.
    const shortlistCount = await page.locator('#weekly-shortlist-section, #protein-value-section, #price-comparison, #bulk-section, #watchout-section').count();
    step('No editorial shortlist on utility page', shortlistCount === 0, `sections: ${shortlistCount}`);

    // 12. Overflow check (mobile only)
    if (profile.viewport.width <= 480) {
      const bodyW = await page.evaluate(() => document.body.scrollWidth);
      step('No horizontal overflow', bodyW <= profile.viewport.width + 2, `bodyW=${bodyW} vs vp=${profile.viewport.width}`);
    }

    await browser.close();
  }

  console.log(`\n[FLOW] Passed ${passed}/${totalSteps} steps`);
  console.log(`[FLOW] Console errors: ${errors.length}`);
  if (errors.length) errors.forEach(e => console.log('  ' + e));
  console.log(`[FLOW] Console warnings: ${warnings.length}`);
  if (warnings.length) warnings.slice(0, 10).forEach(w => console.log('  ' + w));

  process.exit(errors.length === 0 && passed === totalSteps ? 0 : 1);
})();
