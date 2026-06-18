/**
 * Image-match quality test.
 *
 * For every catalog product whose `image` URL was filled in from pazarko's
 * data, check whether the match is plausibly correct. We define a match as
 * "plausibly correct" when:
 *
 *   1. The pazarko product the image came from is from the SAME store.
 *   2. The two product names share at least 60% of their content tokens.
 *   3. If a brand token can be extracted from both, they agree.
 *
 * The test fails if more than 5% of enriched images look like wrong matches.
 *
 * Run: node tests/image-match-quality.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ALL_PRODUCTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/all_products.json'), 'utf8'));
const PAZARKO = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pazarko.json'), 'utf8'));

// Strip our own "Супер цена -" / "Промо -" prefixes so they don't fool the
// brand extractor into thinking the product brand is "Супер".
const PROMO_PREFIX_RE = /^\s*(супер\s+цена|промо(ция)?|акция|нова\s+цена|нова\s+ниска\s+цена|оферта|спестявате?|сега\s+в\s+billa|ново\s+в\s+billa|ново\s+от\s+billa|само\s+в\s+billa)\s*[-–—:]+\s*/i;
function stripPromoPrefix(s) {
  let prev;
  let cur = (s || '');
  do { prev = cur; cur = cur.replace(PROMO_PREFIX_RE, ''); } while (cur !== prev);
  return cur;
}
function normalizeName(s) {
  return stripPromoPrefix(s).toLowerCase().replace(/[-_/]+/g, ' ').replace(/[^а-яa-z0-9 ]/g, '').trim();
}
function tokens(name) {
  return new Set(normalizeName(name).split(/\s+/).filter(t => t.length >= 3));
}
function jaccard(a, b) {
  const inter = [...a].filter(x => b.has(x)).length;
  const uni = new Set([...a, ...b]).size;
  return uni === 0 ? 0 : inter / uni;
}

// Brand = first all-caps token, or the first capitalized 3+ char word that
// looks brand-y (not a generic noun).
const GENERIC_FIRST_WORDS = new Set([
  'био', 'еко', 'пресен', 'пресни', 'свежо', 'българско', 'българска', 'български',
  'класически', 'класическа', 'премиум', 'екстра', 'натурален', 'натурална',
  'риба', 'тон', 'пилешко', 'пиле', 'телешко', 'свинско', 'мляко', 'сирене',
  'хляб', 'ориз', 'кафе', 'чай', 'шоколад', 'сос', 'олио', 'масло', 'зехтин',
  'паста', 'спагети', 'макарони', 'консерва', 'нектар', 'сок', 'вода', 'бира',
  'торта', 'десерт', 'крем', 'кисело', 'прясно', 'кашкавал', 'извара',
  'лаврак', 'ципура', 'пъстърва', 'сьомга', 'скумрия', 'треска', 'херинга',
  'леща', 'нахут', 'боб', 'фасул', 'грах', 'овес', 'мюсли',
  // Pure quality words that are NEVER product brands
  'premium', 'standard', 'best', 'quality', 'бдс', 'gost', 'iso',
]);
function extractBrand(name) {
  const words = stripPromoPrefix(name || '').split(/[\s.,/-]+/).filter(Boolean);
  for (const w of words) {
    const lower = w.toLowerCase();
    if (lower.length < 3) continue;
    if (GENERIC_FIRST_WORDS.has(lower)) continue;
    // Brand candidate: all-caps Latin OR Capitalized Cyrillic word
    if (/^[A-Z][A-Z0-9]{2,}$/.test(w)) return lower;
    if (/^[А-Я][А-Яа-я0-9]{2,}$/.test(w) && !GENERIC_FIRST_WORDS.has(lower)) return lower;
  }
  return null;
}

// Build pazarko index keyed by image URL. Multiple pazarko entries can share
// the same image_url (e.g. different sizes of the same product), so we keep
// ALL of them per URL and later credit the closest-name candidate.
const pazarkoByImage = new Map();
for (const p of PAZARKO.products || []) {
  if (!p.image_url) continue;
  if (!pazarkoByImage.has(p.image_url)) pazarkoByImage.set(p.image_url, []);
  pazarkoByImage.get(p.image_url).push(p);
}

// Find every catalog product whose image points to a pazarko URL. Credit the
// pazarko entry whose name is the closest token-overlap to ours (best-case
// interpretation — gives the matcher the benefit of the doubt).
const enriched = [];
for (const p of ALL_PRODUCTS.products || []) {
  if (!p.image || !p.image.startsWith('http')) continue;
  const candidates = pazarkoByImage.get(p.image);
  if (!candidates || candidates.length === 0) continue;
  const ourTokens = tokens(p.name);
  let best = candidates[0];
  let bestScore = -1;
  for (const c of candidates) {
    if (c.store !== p.store && !(c.store === 'TMarket' && p.store === 'T-Market')) continue;
    const score = jaccard(ourTokens, tokens(c.product_name));
    if (score > bestScore) { bestScore = score; best = c; }
  }
  enriched.push({ product: p, source: best });
}

console.log(`[info] Total catalog products: ${ALL_PRODUCTS.products.length}`);
console.log(`[info] Enriched from pazarko:   ${enriched.length}`);

const issues = [];
let okCount = 0;

const STORE_ALIAS = {
  'T-Market': 'TMarket',
  'TMarket': 'T-Market',
};
function storesMatch(a, b) {
  if (a === b) return true;
  return STORE_ALIAS[a] === b || STORE_ALIAS[b] === a;
}

for (const { product, source } of enriched) {
  const reasons = [];

  // 1) Same store
  if (!storesMatch(product.store, source.store)) {
    reasons.push(`store mismatch (${product.store} <- ${source.store})`);
  }

  // 2) Name overlap
  const j = jaccard(tokens(product.name), tokens(source.product_name));
  if (j < 0.6) {
    reasons.push(`low jaccard ${j.toFixed(2)}`);
  }

  // 3) Brand match
  const b1 = extractBrand(product.name);
  const b2 = extractBrand(source.product_name);
  if (b1 && b2 && b1 !== b2) {
    reasons.push(`brand mismatch (${b1} vs ${b2})`);
  }

  if (reasons.length === 0) {
    okCount++;
  } else {
    issues.push({
      ours: product.name,
      paz: source.product_name,
      ourStore: product.store,
      pazStore: source.store,
      reasons,
      jaccard: j.toFixed(2),
    });
  }
}

console.log(`[ok] Plausible matches:  ${okCount}/${enriched.length} (${(okCount/enriched.length*100).toFixed(1)}%)`);
console.log(`[fail] Suspicious matches: ${issues.length}/${enriched.length} (${(issues.length/enriched.length*100).toFixed(1)}%)`);

// Group issues by reason
const byReason = {};
for (const i of issues) {
  for (const r of i.reasons) {
    const k = r.split(' ')[0] + ' ' + r.split(' ')[1];
    byReason[k] = (byReason[k] || 0) + 1;
  }
}
console.log('\nBreakdown by reason:');
for (const [r, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${r.padEnd(30)} ${n}`);
}

console.log('\nFirst 12 suspicious matches:');
for (const i of issues.slice(0, 12)) {
  console.log(`  ours: ${i.ours.slice(0, 60)} (${i.ourStore})`);
  console.log(`  paz:  ${i.paz.slice(0, 60)} (${i.pazStore})`);
  console.log(`  why:  jacc=${i.jaccard} reasons=${i.reasons.join(', ')}`);
  console.log();
}

const failRatio = issues.length / Math.max(enriched.length, 1);
if (failRatio > 0.05) {
  console.error(`FAIL: ${(failRatio*100).toFixed(1)}% of image matches look wrong (threshold 5%)`);
  process.exit(1);
}
console.log(`PASS: ${(failRatio*100).toFixed(1)}% wrong (threshold 5%)`);
