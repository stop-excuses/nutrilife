const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function app(seed = {}, denied = false) {
  const records = new Map(Object.entries(seed));
  const storage = {
    getItem(key) { if (denied) throw new Error('SecurityError'); return records.get(key) ?? null; },
    setItem(key, value) { if (denied) throw new Error('QuotaExceededError'); records.set(key, value); },
    key(i) { return [...records.keys()][i]; },
    get length() { return records.size; }
  };
  const context = vm.createContext({
    window: {}, localStorage: storage, Date,
    document: { addEventListener() {} },
    setTimeout, clearTimeout, URL, Blob, console
  });
  vm.runInContext(fs.readFileSync(require.resolve('../js/main.js'), 'utf8'), context);
  return { records, run: expression => vm.runInContext(expression, context) };
}

test('local day stays correct after midnight in Sofia and across daylight saving', () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'Europe/Sofia';
  try {
    const a = app();
    assert.equal(a.run("localDayKey(new Date('2026-10-28T22:30:00Z'))"), '2026-10-29');
    assert.equal(a.run("localDayKey(new Date('2026-03-28T22:30:00Z'))"), '2026-03-29');
    assert.equal(a.run("localDayKey(new Date('2026-10-24T21:30:00Z'))"), '2026-10-25');
  } finally {
    if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ;
  }
});

test('a malformed or unexpected tracker record cannot stop the app or invent progress', () => {
  for (const value of ['{broken', 'null', '[]', '"hello"', '{"sleep":"false","unrelated":true}']) {
    const a = app({ 'nutrilife-tracker-2026-10-29': value });
    assert.equal(a.run("Object.values(readTrackerDay('2026-10-29')).filter(Boolean).length"), 0);
    assert.equal(a.run("calculateStreak(new Date('2026-10-29T12:00:00'))"), 0);
  }
});

test('denied storage retains session data and its keys for an export', () => {
  const a = app({}, true);
  assert.equal(a.run("NutriLifeStorage.set('nutrilife-tracker-2026-10-28', JSON.stringify({sleep:true}))"), false);
  assert.equal(a.run("readTrackerDay('2026-10-28').sleep"), true);
  assert.equal(a.run("NutriLifeStorage.keys().includes('nutrilife-tracker-2026-10-28')"), true);
});

test('streak tolerates an unfinished today, ignores unknown habits and spans a DST change', () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'Europe/Sofia';
  try {
    const a = app({
      'nutrilife-tracker-2026-10-25': '{"sleep":true}',
      'nutrilife-tracker-2026-10-24': '{"movement":true}',
      'nutrilife-tracker-2026-10-23': '{"not-a-habit":true}',
      'nutrilife-tracker-2026-10-22': '{"sleep":true}'
    });
    assert.equal(a.run("calculateStreak(new Date('2026-10-26T00:30:00'))"), 2);
  } finally {
    if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ;
  }
});

test('backup validation rejects future dates, impossible days, unknown keys and non-boolean values', () => {
  const a = app();
  for (const days of [
    { '2026-02-30': { sleep: true } }, { '2026-10-30': { sleep: true } },
    { '2026-10-29': { sleep: 'yes' } }, { '2026-10-29': { theme: true } },
    { '2026-10-29': [] }, { invalid: {} }
  ]) {
    assert.throws(() => a.run('parseTrackerBackup(' + JSON.stringify({ version: 1, days }) + ', "2026-10-29")'));
  }
  assert.throws(() => a.run('parseTrackerBackup({version:2,days:{}}, "2026-10-29")'));
  assert.equal(a.records.size, 0);
});

test('export-shaped data round trips without converting false flags or losing old days', () => {
  const a = app();
  const backup = { version: 1, days: { '2026-10-28': { sleep: true, water: false }, '2026-10-29': { movement: true } } };
  const result = a.run('JSON.stringify(parseTrackerBackup(' + JSON.stringify(backup) + ', "2026-10-29"))');
  assert.deepEqual(JSON.parse(result), backup.days);
});

test('a corrupt shopping list does not prevent offers initialization', () => {
  const a = app({ 'nutrilife-favorites': '{invalid' });
  const documentStub = { addEventListener() {} };
  const context = vm.createContext({ window: { NutriLifeStorage: a.run('window.NutriLifeStorage') }, document: documentStub, Map, Set, console });
  vm.runInContext(fs.readFileSync(require.resolve('../js/offers.js'), 'utf8'), context);
  assert.equal(vm.runInContext('favoriteItems.length', context), 0);
});

function offersContext() {
  const context = vm.createContext({
    window: { NutriLifeStorage: { json: () => [] } },
    document: { addEventListener() {} }, console
  });
  vm.runInContext(fs.readFileSync(require.resolve('../js/offers.js'), 'utf8'), context);
  return context;
}

test('chicken broth, egg pasta and dry legumes cannot inherit meat or cooked-food nutrition', () => {
  const context = offersContext();
  for (const name of ['MAGGI Пилешки бульон', 'Пресни талиатели с яйца', 'Леща 500 г']) {
    assert.equal(vm.runInContext('getMacros(' + JSON.stringify({ name, macros: { p: 31, f: 3.6, c: 0, kcal: 165 } }) + ')', context), null);
  }
  assert.ok(vm.runInContext("getMacros({name:'Скир натурален 500 г'}).p > 0", context));
});

test('beer and wine do not become wellness picks even when source classification says healthy', () => {
  const context = offersContext();
  for (const name of ['CORONA Бира различни видове', 'Червено вино 750 мл']) {
    const offer = { name, category: 'drinks', is_food: true, health_score: 9 };
    assert.equal(vm.runInContext('isWellnessDeal(' + JSON.stringify(offer) + ')', context), false);
  }
});

test('store comparisons rank equivalent quantities instead of the cheapest small pack', () => {
  const context = offersContext();
  vm.runInContext("allOffers = [" +
    "{name:'Скир 200 г',store:'A',new_price:2,weight_grams:200,_comparisonKey:'Скир',is_food:true,category:'dairy'}," +
    "{name:'Скир 1000 г',store:'B',new_price:5,weight_grams:1000,_comparisonKey:'Скир',is_food:true,category:'dairy'}]", context);
  assert.equal(vm.runInContext('getComparableOffers(allOffers[0])[0].store', context), 'B');
  assert.equal(vm.runInContext('getComparableOffers(allOffers[0])[0].isBest', context), true);
});

test('liquid packages use price per litre, while mass packages use price per kilogram', () => {
  const context = offersContext();
  assert.equal(vm.runInContext("getUnitPriceLabel({name:'Зехтин 500 мл'})", context), 'лв/л');
  assert.equal(vm.runInContext("getUnitPriceLabel({name:'Мляко 1 l'})", context), 'лв/л');
  assert.equal(vm.runInContext("getUnitPriceLabel({name:'Кисело мляко 400 г'})", context), 'лв/кг');
});

test('viewing old price observations does not fabricate a new observation dated today', () => {
  const context = offersContext();
  const output = vm.runInContext("renderPriceHistory({name:'Скир',new_price:4,price_history:[{date:'2020-01-01',price:4}],last_seen:'2020-01-01'})", context);
  assert.ok(output.includes('2020-01-01'));
  assert.ok(!output.includes(new Date().toISOString().slice(0, 10)));
  assert.ok(output.includes('01.01'));
});
