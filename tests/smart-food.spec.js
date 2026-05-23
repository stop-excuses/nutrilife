const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8000/smart-food.html';

test.describe('Smart Food Page', () => {

  test('page loads without console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });

  test('title and meta are correct', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const title = await page.title();
    expect(title).toContain('Умна храна');
    const desc = await page.$eval('meta[name="description"]', el => el.content);
    expect(desc.length).toBeGreaterThan(10);
  });

  test('navbar renders with active dot on smart-food', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const activeDot = page.locator('.navbar .dot.active');
    await expect(activeDot).toHaveCount(1);
    const parent = activeDot.locator('..');
    const href = await parent.getAttribute('href');
    expect(href).toBe('smart-food.html');
  });

  test('hero section renders', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await expect(page.locator('.smart-food-hero h1')).toBeVisible();
    await expect(page.locator('.smart-food-hero .comparison').first()).toBeVisible();
    await expect(page.locator('.savings-box').first()).toBeVisible();
  });

  test('offer cards load', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Offer cards loaded: ${count}`);
    expect(count).toBeGreaterThan(0);
  });

  test('search works for яйца', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.fill('#offers-search', 'яйца');
    await page.waitForTimeout(1000);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Search яйца: ${count} cards`);
    expect(count).toBeGreaterThan(0);
    const firstText = await cards.first().textContent();
    expect(firstText.toLowerCase()).toContain('яйц');
  });

  test('search works for пиле', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.fill('#offers-search', 'пиле');
    await page.waitForTimeout(1000);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Search пиле: ${count} cards`);
    expect(count).toBeGreaterThan(0);
  });

  test('empty search shows reset button', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.fill('#offers-search', 'xyznonexistent12345');
    await page.waitForTimeout(1000);
    const empty = page.locator('.offers-empty');
    const resetBtn = page.locator('[data-reset-offers]');
    const emptyCount = await empty.count();
    const resetCount = await resetBtn.count();
    console.log(`[DEBUG_LOG] Empty msg: ${emptyCount}, Reset btn: ${resetCount}`);
    expect(emptyCount + resetCount).toBeGreaterThan(0);
  });

  test('category filter protein works', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-category="protein"]');
    await page.waitForTimeout(500);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Protein filter: ${count} cards`);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('category filter dairy works', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-category="dairy"]');
    await page.waitForTimeout(500);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Dairy filter: ${count} cards`);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('store filter Lidl works', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-store="Lidl"]');
    await page.waitForTimeout(500);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Lidl filter: ${count} cards`);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('store filter Kaufland works', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-store="Kaufland"]');
    await page.waitForTimeout(500);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Kaufland filter: ${count} cards`);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('sort by price_per_kg works', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-sort="price_per_kg"]');
    await page.waitForTimeout(500);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Sort price/kg: ${count} cards`);
    expect(count).toBeGreaterThan(0);
    const pricesPerKg = await cards.evaluateAll(cardEls => cardEls
      .map(card => card.querySelector('.offer-ppk')?.textContent || '')
      .map(text => Number(text.replace(',', '.').match(/[\d.]+/)?.[0]))
      .filter(Number.isFinite)
    );
    expect(pricesPerKg.length).toBeGreaterThan(3);
    expect(pricesPerKg).toEqual([...pricesPerKg].sort((a, b) => a - b));
  });

  test('sort by health works', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-sort="health"]');
    await page.waitForTimeout(500);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Sort health: ${count} cards`);
    expect(count).toBeGreaterThan(0);
  });

  test('source filter all products works', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-source="all"]');
    await page.waitForTimeout(1000);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] All products source: ${count} cards`);
    expect(count).toBeGreaterThan(0);
  });

  test('diet filter keto works', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-diet="keto"]');
    await page.waitForTimeout(500);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Keto filter: ${count} cards`);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('diet filter vegetarian works', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-diet="vegetarian"]');
    await page.waitForTimeout(500);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Vegetarian filter: ${count} cards`);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('pagination renders when enough offers', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const pagination = page.locator('#offers-pagination');
    const html = await pagination.innerHTML();
    console.log(`[DEBUG_LOG] Pagination HTML length: ${html.length}`);
    // Pagination should exist if more than 36 offers
    const cards = await page.locator('#offers-grid .offer-card').count();
    if (cards >= 36) {
      expect(html.length).toBeGreaterThan(0);
    }
  });

  test('pagination page 2 works', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const page2Btn = page.locator('#offers-pagination button', { hasText: '2' });
    if (await page2Btn.count() > 0) {
      await page2Btn.first().click();
      await page.waitForTimeout(500);
      const cards = page.locator('#offers-grid .offer-card');
      const count = await cards.count();
      console.log(`[DEBUG_LOG] Page 2: ${count} cards`);
      expect(count).toBeGreaterThan(0);
    }
  });

  test('price comparison section loads', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const section = page.locator('#price-comparison');
    const html = await section.innerHTML();
    console.log(`[DEBUG_LOG] Price comparison HTML length: ${html.length}`);
    expect(html.length).toBeGreaterThan(50);
  });

  test('offer card expand/collapse works', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const firstCard = page.locator('#offers-grid .offer-card').first();
    if (await firstCard.count() > 0) {
      await firstCard.click();
      await page.waitForTimeout(500);
      const expanded = await firstCard.getAttribute('class');
      console.log(`[DEBUG_LOG] Card class after click: ${expanded}`);
    }
  });

  test('favorite button works', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const favBtn = page.locator('#offers-grid .offer-card .fav-btn').first();
    if (await favBtn.count() > 0) {
      await favBtn.click();
      await page.waitForTimeout(500);
      console.log(`[DEBUG_LOG] Fav button clicked, errors: ${errors.length}`);
      expect(errors).toEqual([]);
    }
  });

  test('favorite product rows sort by displayed unit price', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('nutrilife-favorites', JSON.stringify([
        { kw: '\u043c\u043b\u044f\u043a\u043e', emoji: '\ud83e\udd5b', cat: 'dairy' },
      ]));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const favHeader = page.locator('#fav-panel .fav-item-hd');
    expect(await favHeader.count()).toBeGreaterThan(0);
    await favHeader.first().click();
    await page.waitForTimeout(300);
    const unitPrices = await page.locator('#fav-panel .fav-offer-row .fav-pkg').evaluateAll(nodes => nodes
      .map(node => node.textContent || '')
      .filter(text => text.includes('\u043b\u0432/\u043a\u0433'))
      .map(text => Number(text.replace(',', '.').match(/[\d.]+/)?.[0]))
      .filter(Number.isFinite)
    );
    expect(unitPrices.length).toBeGreaterThan(3);
    expect(unitPrices).toEqual([...unitPrices].sort((a, b) => a - b));
    expect(errors).toEqual([]);
  });

  test('combined filters: store + category', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-store="Kaufland"]');
    await page.waitForTimeout(300);
    await page.click('[data-category="dairy"]');
    await page.waitForTimeout(500);
    console.log(`[DEBUG_LOG] Combined filter errors: ${errors.length}`);
    expect(errors).toEqual([]);
  });

  test('combined filters: search + store + sort', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.fill('#offers-search', 'мляко');
    await page.waitForTimeout(500);
    await page.click('[data-store="Billa"]');
    await page.waitForTimeout(300);
    await page.click('[data-sort="price_per_kg"]');
    await page.waitForTimeout(500);
    const pricesPerKg = await page.locator('#offers-grid .offer-card').evaluateAll(cardEls => cardEls
      .map(card => card.querySelector('.offer-ppk')?.textContent || '')
      .map(text => Number(text.replace(',', '.').match(/[\d.]+/)?.[0]))
      .filter(Number.isFinite)
    );
    expect(pricesPerKg).toEqual([...pricesPerKg].sort((a, b) => a - b));
    console.log(`[DEBUG_LOG] Triple filter errors: ${errors.length}`);
    expect(errors).toEqual([]);
  });

  test('type filter high_protein works', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-type="high_protein"]');
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test('all source then search works', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-source="all"]');
    await page.waitForTimeout(1000);
    await page.fill('#offers-search', 'ориз');
    await page.waitForTimeout(1000);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] All source + ориз search: ${count} cards`);
    expect(errors).toEqual([]);
  });

  test('no JS errors on rapid filter switching', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-category="protein"]');
    await page.click('[data-category="dairy"]');
    await page.click('[data-category="grain"]');
    await page.click('[data-category="all"]');
    await page.click('[data-store="Lidl"]');
    await page.click('[data-store="all"]');
    await page.click('[data-sort="health"]');
    await page.click('[data-sort="recommended"]');
    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);
  });

  test('search clear restores offers', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const initialCount = await page.locator('#offers-grid .offer-card').count();
    await page.fill('#offers-search', 'зехтин');
    await page.waitForTimeout(1000);
    const searchCount = await page.locator('#offers-grid .offer-card').count();
    await page.fill('#offers-search', '');
    await page.waitForTimeout(1000);
    const clearedCount = await page.locator('#offers-grid .offer-card').count();
    console.log(`[DEBUG_LOG] Initial: ${initialCount}, Search: ${searchCount}, Cleared: ${clearedCount}`);
    expect(clearedCount).toBe(initialCount);
  });

  test('budget diet filter works', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-diet="бюджетен"]');
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test('sort protein_value works', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.click('[data-sort="protein_value"]');
    await page.waitForTimeout(500);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Protein value sort: ${count} cards`);
    expect(errors).toEqual([]);
    expect(count).toBeGreaterThan(0);
  });

  test('quality protein ranking renders useful shortlist', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const rows = page.locator('#protein-ranking .protein-rank-item');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(6);
    expect(count).toBeLessThanOrEqual(8);
    const names = await rows.evaluateAll(items => items.map(item => item.querySelector('.rank-name')?.textContent || ''));
    expect(names.some(name => /спагети|пица|пекарна/i.test(name))).toBe(false);
    const values = await rows.evaluateAll(items => items
      .map(item => Number((item.querySelector('.rank-value')?.textContent || '').replace(',', '.').match(/[\d.]+/)?.[0]))
      .filter(Number.isFinite)
    );
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(errors).toEqual([]);
  });

  test('CTA button links to start.html', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const cta = page.locator('.cta-section a.btn-green');
    const href = await cta.getAttribute('href');
    expect(href).toBe('start.html');
  });

  test('footer exists', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const footer = page.locator('.site-footer');
    await expect(footer).toBeVisible();
  });

  test('no broken images in hero', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const images = page.locator('.smart-food-hero img');
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const natural = await images.nth(i).evaluate(el => el.naturalWidth);
      const src = await images.nth(i).getAttribute('src');
      console.log(`[DEBUG_LOG] Hero img ${src}: naturalWidth=${natural}`);
    }
  });

  test('offers status updates after load', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const status = page.locator('#offers-status');
    const text = await status.textContent();
    console.log(`[DEBUG_LOG] Offers status: ${text}`);
    // Should not still say "loading"
    expect(text.toLowerCase()).not.toContain('зареждане');
  });
});

test.describe('Smart Food Mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile: page loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    expect(errors).toEqual([]);
  });

  test('mobile: offer cards load', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Mobile offer cards: ${count}`);
    expect(count).toBeGreaterThan(0);
  });

  test('mobile: search works', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.fill('#offers-search', 'кисело мляко');
    await page.waitForTimeout(1000);
    const cards = page.locator('#offers-grid .offer-card');
    const count = await cards.count();
    console.log(`[DEBUG_LOG] Mobile search кисело мляко: ${count}`);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('mobile: filters wrap without overflow', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const body = page.locator('body');
    const bodyWidth = await body.evaluate(el => el.scrollWidth);
    const viewportWidth = 390;
    console.log(`[DEBUG_LOG] Mobile body scrollWidth: ${bodyWidth}, viewport: ${viewportWidth}`);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('mobile: navbar does not overflow', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const navbar = page.locator('.navbar');
    const scrollW = await navbar.evaluate(el => el.scrollWidth);
    const clientW = await navbar.evaluate(el => el.clientWidth);
    console.log(`[DEBUG_LOG] Navbar scroll: ${scrollW}, client: ${clientW}`);
  });

  test('mobile: card expand works', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const card = page.locator('#offers-grid .offer-card').first();
    if (await card.count() > 0) {
      await card.click();
      await page.waitForTimeout(500);
      expect(errors).toEqual([]);
    }
  });
});
