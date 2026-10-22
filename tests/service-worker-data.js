const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function worker() {
  const listeners = {}, stores = new Map();
  let now = Date.now(), version = 1, fail = false, calls = 0;
  const key = request => typeof request === 'string' ? request : request.url;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return {
        async match(request) { return data.get(key(request))?.clone(); },
        async put(request, response) { data.set(key(request), response.clone()); }
      };
    },
    async match(request) {
      for (const data of stores.values()) {
        if (data.has(key(request))) return data.get(key(request)).clone();
      }
    }
  };
  const context = vm.createContext({
    URL, Response, caches,
    Date: class extends Date { static now() { return now; } },
    self: { location: { origin: 'https://example.test' }, addEventListener: (name, cb) => { listeners[name] = cb; } },
    fetch: async (request, options) => {
      calls++;
      if (fail) throw new Error('offline');
      assert.equal(options?.cache, 'no-cache');
      return new Response(`version-${version}`);
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../sw.js'), 'utf8'), context);
  return {
    caches,
    get calls() { return calls; },
    advance() { now += 31 * 60 * 1000; },
    update() { version++; },
    offline() { fail = true; },
    async load(path = '/data/offers.js?v=8') {
      let response;
      listeners.fetch({ request: { method: 'GET', url: 'https://example.test' + path }, respondWith: value => { response = value; } });
      return (await response).text();
    }
  };
}

test('versioned data refreshes without changing the query and caches repeat visits', async () => {
  const w = worker();
  assert.equal(await w.load(), 'version-1');
  w.update();
  assert.equal(await w.load(), 'version-1');
  assert.equal(w.calls, 1);
  w.advance();
  assert.equal(await w.load(), 'version-2');
  assert.equal(w.calls, 2);
});

test('unversioned supplements and catalog both refresh after the interval', async () => {
  const w = worker();
  for (const path of ['/data/supplements.js', '/data/market_memory.js?v=6']) {
    assert.equal(await w.load(path), 'version-1');
  }
  w.update();
  w.advance();
  for (const path of ['/data/supplements.js', '/data/market_memory.js?v=6']) {
    assert.equal(await w.load(path), 'version-2');
  }
});

test('offline visits retain the last usable data after expiry', async () => {
  const w = worker();
  await w.load();
  w.advance();
  w.offline();
  assert.equal(await w.load(), 'version-1');
});

test('simultaneous requests share a download, including different version queries', async () => {
  const w = worker();
  const values = await Promise.all([w.load(), w.load('/data/offers.js?v=9')]);
  assert.deepEqual(values, ['version-1', 'version-1']);
  assert.equal(w.calls, 1);
});

test('old app-shell cached product data cannot pin the current price', async () => {
  const w = worker();
  const old = await w.caches.open('nutrilife-v35');
  await old.put('https://example.test/data/offers.js?v=8', new Response('obsolete'));
  assert.equal(await w.load(), 'version-1');
  assert.equal(w.calls, 1);
});

test('cache quota errors do not discard a successful network response', async () => {
  const w = worker();
  const open = w.caches.open;
  w.caches.open = async name => ({ ...await open(name), put: async () => { throw new Error('QuotaExceededError'); } });
  assert.equal(await w.load(), 'version-1');
});
