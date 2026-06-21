// Real-user QA for smart-supplements.html — checks for confidence labels,
// protein warnings, search/filter/sort flows, and that "no label" warnings
// only appear when the page genuinely has no readable protein grams.
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
    const cards = await page.locator('.supplement-card').count();
    step('Initial supplement cards rendered', cards > 0, `${cards} cards`);

    // 2. Confidence labels: "Етикет: реален етикет/частична сметка/само ориентир"
    const confTextSet = new Set(await page.locator('.supplement-confidence').allTextContents());
    step('Confidence labels present', confTextSet.size > 0, [...confTextSet].join(' | '));

    // 2b. Label details dropdown exposes the extracted label/math evidence
    const details = page.locator('.supplement-label-details').first();
    await details.scrollIntoViewIfNeeded();
    await details.locator('summary').click();
    await page.waitForTimeout(200);
    const detailsText = await details.textContent();
    step('Label details dropdown opens', /Прочетено от етикета|Опаковка|Как е категоризирано/.test(detailsText || ''), (detailsText || '').slice(0, 120));
    const unclearForms = await page.locator('.supplement-form-row').evaluateAll(nodes => nodes
      .map(node => node.textContent || '')
      .filter(text => /форма неясна|формула неясна|неприложимо/i.test(text))
    );
    step('Visible form labels are specific', unclearForms.length === 0, `${unclearForms.length} vague labels`);

    // 3. Protein category — examine low-confidence cards
    await page.click('[data-category="protein"]');
    await page.waitForTimeout(500);
    const proteinCards = await page.locator('.supplement-card').count();
    step('Protein view loads', proteinCards > 0, `${proteinCards} cards`);

    // Inspect each visible card: confidence + warning combo
    const cardData = await page.locator('.supplement-card').evaluateAll(nodes => nodes.map(n => ({
      name: n.querySelector('h3')?.textContent?.trim() || '',
      store: (n.querySelector('.supplement-meta span:nth-child(2)')?.textContent || '').trim(),
      confidence: (n.querySelector('.supplement-confidence')?.className.match(/supplement-confidence (\w+)/) || [, ''])[1],
      confText: (n.querySelector('.supplement-confidence')?.textContent || '').trim(),
      warning: (n.querySelector('.supplement-warning')?.textContent || '').trim(),
    })));
    console.log(`  Sample protein cards: ${cardData.length}`);
    cardData.slice(0, 6).forEach(c => console.log(`    [${c.confidence}] ${c.store} | ${c.name.substring(0, 50)} | warn="${c.warning.substring(0, 60)}"`));

    const lowProteinCards = cardData.filter(c => c.confidence === 'low');
    const highProteinCards = cardData.filter(c => c.confidence === 'high');
    step('Some protein cards are high-confidence (real label)', highProteinCards.length > 0, `${highProteinCards.length} high`);
    step('High-confidence cards have NO warning', highProteinCards.every(c => !c.warning), `${highProteinCards.filter(c => c.warning).length} with stray warning`);
    step('Low-confidence cards DO have warning', lowProteinCards.every(c => c.warning), `${lowProteinCards.filter(c => !c.warning).length} missing warning`);
    // The fix: warning text should differentiate (estimate vs no-label)
    const oldCopy = lowProteinCards.filter(c => /не успяхме автоматично да прочетем/i.test(c.warning));
    step('No old "не успяхме автоматично да прочетем" copy', oldCopy.length === 0, `${oldCopy.length} cards still using old copy`);

    // 4. Confidence labels on cards (confidence filter buttons were removed; verify via card classes)
    const confClasses = await page.locator('.supplement-confidence').evaluateAll(nodes => nodes.map(n => n.className));
    const hasHighClass = confClasses.some(c => /\bhigh\b/.test(c));
    step('Confidence CSS classes present on cards', confClasses.length > 0 && (hasHighClass || confClasses.some(c => /\blow\b|\bmedium\b/.test(c))), `${confClasses.length} confidence labels`);

    // Reset category back to all before broad searches
    await page.click('[data-category="all"]');
    await page.waitForTimeout(300);

    // 5. New measurable categories render and sort by active-dose price
    for (const cat of ['electrolytes', 'collagen', 'iron']) {
      await page.click(`[data-category="${cat}"]`);
      await page.waitForTimeout(400);
      const cards = await page.locator('.supplement-card').count();
      const prices = await page.locator('.supplement-card .supplement-price-row strong').evaluateAll(nodes => nodes
        .map(node => Number((node.textContent || '').replace(',', '.').match(/[0-9.]+/)?.[0]))
        .filter(Number.isFinite)
      );
      const sorted = prices.every((price, idx) => idx === 0 || price >= prices[idx - 1] - 0.0001);
      step(`Category ${cat} active-dose sort`, cards > 0 && sorted, `${cards} cards, first=${prices.slice(0, 5).join(', ')}`);
    }

    // Reset category back to all before broad searches
    await page.click('[data-category="all"]');
    await page.waitForTimeout(300);

    // 6. Search common terms
    for (const q of ['креатин', 'витамин d', 'витамин c', 'омега', 'магнезий', 'протеин', 'цинк', 'фибри', 'електролити', 'колаген', 'желязо']) {
      await runSearch(page, q);
      const c = await page.locator('.supplement-card').count();
      step(`Search "${q}"`, c > 0, `${c} cards`);
    }

    // 7. Empty search
    await runSearch(page, 'zzznotreal999');
    const emptyMsg = await page.locator('.supplements-empty, #supplements-grid').textContent();
    step('Empty search shows a state', !!emptyMsg, `len=${(emptyMsg || '').length}`);
    await page.fill('#supplements-search', '');
    await page.click('#supplements-search-submit');
    await page.waitForTimeout(300);

    // 8. Sort options
    for (const s of ['unit', 'price', 'name']) {
      const btn = page.locator(`[data-sort="${s}"]`).first();
      if (await btn.count() > 0) {
        await btn.click();
        await page.waitForTimeout(300);
        const c = await page.locator('.supplement-card').count();
        step(`Sort ${s}`, c > 0, `${c} cards`);
      }
    }

    // 9. Watch/compare buttons
    const watchBtn = page.locator('.watch-price-btn').first();
    if (await watchBtn.count() > 0) {
      await watchBtn.scrollIntoViewIfNeeded();
      await watchBtn.click();
      await page.waitForTimeout(300);
      step('Watch button clickable', true);
    }
    const cmpBtn = page.locator('.compare-supplement-btn').first();
    if (await cmpBtn.count() > 0) {
      await cmpBtn.scrollIntoViewIfNeeded();
      await cmpBtn.click();
      await page.waitForTimeout(300);
      step('Compare button clickable', true);
    }

    // 10. Product dialog
    const card = page.locator('.supplement-card').first();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await page.waitForTimeout(400);
    const dialogCount = await page.locator('#supplement-product-overlay .supplement-dialog-screen').count();
    const historyCount = await page.locator('#supplement-product-overlay .supplement-price-history-detail').count();
    step('Supplement card opens product dialog', dialogCount === 1, `history sections: ${historyCount}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // 11. Mobile overflow check
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
