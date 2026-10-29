const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../sw.js'), 'utf8');

function worker({ quota = false, fail = false, status = 200 } = {}) {
  const listeners = {}, stores = new Map(), deleted = [];
  const normalize = request => typeof request === 'string' ? request : request.url;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(request) { return store.get(normalize(request))?.clone(); },
        async put(request, response) {
          if (quota) throw new Error('QuotaExceededError');
          store.set(normalize(request), response.clone());
        }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { deleted.push(name); return stores.delete(name); },
    async match(request) {
      for (const store of stores.values()) if (store.has(normalize(request))) return store.get(normalize(request)).clone();
    }
  };
  const context = vm.createContext({
    URL, Response, Date, caches,
    self: { location: { origin: 'https://example.test' }, addEventListener(name, fn) { listeners[name] = fn; }, clients: { async claim() {} } },
    fetch: async () => { if (fail) throw new Error('offline'); return new Response('live', { status }); }
  });
  vm.runInContext(source, context);
  return { caches, listeners, deleted, run: expression => vm.runInContext(expression, context) };
}

test('activation removes only obsolete NutriLife caches on a shared GitHub Pages origin', async () => {
  const w = worker();
  await w.caches.open('another-project-v1');
  await w.caches.open('nutrilife-v35');
  await w.caches.open('nutrilife-data-v1');
  let done;
  w.listeners.activate({ waitUntil(value) { done = value; } });
  await done;
  assert.deepEqual(w.deleted, ['nutrilife-v35']);
});

test('a full cache does not break scripts, pages or images served successfully', async () => {
  const w = worker({ quota: true });
  for (const expression of [
    "cacheFirst({url:'https://example.test/js/main.js?v=20'}, CACHE_NAME)",
    "networkFirst({url:'https://example.test/start.html',mode:'navigate'})",
    "imageFallback({url:'https://example.test/images/start-hero.jpg'})"
  ]) assert.equal(await (await w.run(expression)).text(), 'live');
});

test('cached navigation survives both a server failure and an offline visit', async () => {
  for (const options of [{ status: 503 }, { fail: true }]) {
    const w = worker(options);
    await (await w.caches.open('nutrilife-runtime-v1')).put('https://example.test/start.html', new Response('saved'));
    const response = await w.run("networkFirst({url:'https://example.test/start.html',mode:'navigate'})");
    assert.equal(await response.text(), 'saved');
  }
});

test('the offline shell references real files and exact versions used by core pages', () => {
  const w = worker();
  const shell = Array.from(w.run('APP_SHELL'));
  for (const entry of shell) {
    assert.equal(fs.existsSync(path.join(__dirname, '..', entry.split('?')[0])), true, entry);
  }
  for (const page of ['index', 'move', 'eat', 'start', 'mental', 'health-check']) {
    assert.equal(shell.includes(page + '.html'), true);
    const html = fs.readFileSync(path.join(__dirname, '..', page + '.html'), 'utf8');
    for (const [, asset] of html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) {
      assert.equal(shell.includes(asset), true, page + ': ' + asset);
    }
  }
});
