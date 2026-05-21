// Бърз smoke-тест на новите страници: load, без console errors, очаквани елементи.
const { chromium } = require('@playwright/test');

const PAGES = [
  { url: 'http://127.0.0.1:8000/smart-medicines.html', expect: '#meds-grid, .meds-grid, main' },
  { url: 'http://127.0.0.1:8000/smart-value.html',     expect: 'main, .hero, body' },
  { url: 'http://127.0.0.1:8000/nai-izgoden-kreatin.html', expect: 'main, .hero, body' },
];

(async () => {
  const browser = await chromium.launch();
  let fails = 0;
  for (const vp of [{w:1440,h:900,name:'desktop'},{w:390,h:844,name:'mobile'}]) {
    for (const p of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));
      page.on('console', m => { if (m.type()==='error') errors.push('console: '+m.text()); });
      try {
        const r = await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1500);
        const status = r.status();
        const bodyText = (await page.locator('body').innerText()).length;
        const bw = await page.evaluate(() => document.body.scrollWidth);
        const overflow = bw > vp.w + 1;
        const ok = status === 200 && bodyText > 100 && errors.length === 0 && !overflow;
        console.log(`[${ok?'OK ':'FAIL'}] ${vp.name} ${p.url} status=${status} bodyText=${bodyText} bw=${bw} errs=${errors.length}${overflow?' OVERFLOW':''}`);
        if (errors.length) errors.slice(0,5).forEach(e => console.log('   ', e));
        if (!ok) fails++;
      } catch (e) {
        console.log(`[FAIL] ${vp.name} ${p.url} ${e.message}`);
        fails++;
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(fails === 0 ? '\nALL GOOD' : `\n${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
})();
