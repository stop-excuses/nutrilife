const CACHE_NAME = 'nutrilife-v37';
const DATA_CACHE = 'nutrilife-data-v1';
const DATA_MAX_AGE_MS = 30 * 60 * 1000;
const dataRequests = new Map();
const RUNTIME_CACHE = 'nutrilife-runtime-v1';
const IMAGE_CACHE = 'nutrilife-images-v1';
const OFFLINE_URL = 'offline.html';
const IMAGE_FALLBACK_URL = 'images/foods/apple.svg';
const APP_SHELL = [
  './',
  'index.html',
  'move.html',
  'eat.html',
  'start.html',
  'smart-food.html',
  'smart-supplements.html',
  'kak-smyatame-cenite.html',
  'ne-e-meditsinski-savet.html',
  'za-proekta.html',
  OFFLINE_URL,
  'manifest.json',
  'favicon.svg',
  IMAGE_FALLBACK_URL,
  'health-check.html',
  'mental.html',
  'privacy.html',
  'css/style.css?v=56',
  'js/main.js?v=20',
  'js/i18n.js?v=4',
  'js/i18n.index.js?v=3',
  'js/i18n.move.js?v=2',
  'js/i18n.eat.js?v=2',
  'js/i18n.start.js?v=4',
  'js/i18n.mental.js?v=2',
  'js/i18n.health-check.js?v=3',
  'images/pwa/icon-192.png',
  'images/pwa/icon-512.png',
  'images/pwa/icon-maskable-192.png',
  'images/pwa/icon-maskable-512.png',
  'images/pwa/apple-touch-icon.png',
  'images/smart-supplements-hero.webp'
];

const CACHE_NAMES = new Set([CACHE_NAME, DATA_CACHE, RUNTIME_CACHE, IMAGE_CACHE]);

function isVersionedAsset(url) {
  return url.searchParams.has('v')
    && /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|json)$/i.test(url.pathname);
}

function isProductData(url) {
  return /\/data\/(?:market_memory|offers|supplements)\.js$/i.test(url.pathname);
}

function isTrustedCdnAsset(url) {
  return url.hostname === 'cdn.jsdelivr.net' && url.pathname.endsWith('/fuse.min.js');
}

function isBrokenProductImage(url) {
  const value = url.href;
  return value.includes('imgproxy-retcat.assets.schwarz')
    || value.includes('/etc.clientlibs/kaufland/')
    || value.includes('stayfit.bg/cdn/img/products/');
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') await cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function productData(request) {
  const url = new URL(request.url);
  // Scrapers update these files without changing the HTML's version query.
  url.search = '';
  const key = url.href;
  if (dataRequests.has(key)) return (await dataRequests.get(key)).clone();
  const pending = (async () => {
    const cache = await caches.open(DATA_CACHE);
    const cached = await cache.match(key);
    const checked = await cache.match(`${key}?checked`);
    const checkedAt = checked ? Number(await checked.text()) : 0;
    const age = Date.now() - checkedAt;
    if (cached && checkedAt > 0 && age >= 0 && age < DATA_MAX_AGE_MS) return cached;
    try {
      // Conditional HTTP revalidation keeps unchanged multi-MB files cheap.
      const response = await fetch(request, { cache: 'no-cache' });
      if (!response.ok) return cached || response;
      await cache.put(key, response.clone())
        .then(() => cache.put(`${key}?checked`, new Response(String(Date.now()))))
        .catch(() => {}); // A full device cache must not hide a successful response.
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })();
  dataRequests.set(key, pending);
  try {
    return (await pending).clone();
  } finally {
    dataRequests.delete(key);
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.status >= 500) {
      const cached = await caches.match(request);
      if (cached) return cached;
    }
    if (response.ok) await cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    if (request.mode === 'navigate') {
      return (await caches.match(request)) || caches.match(OFFLINE_URL);
    }
    return cache.match(request);
  }
}

async function imageFallback(request) {
  const url = new URL(request.url);
  // Return 404 (not a placeholder image) so the <img>'s onerror fires and the
  // frontend swaps to the per-keyword local SVG (yogurt.svg, cheese.svg, etc.).
  if (url.origin !== self.location.origin && isBrokenProductImage(url)) {
    return new Response(null, { status: 404 });
  }
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return new Response(null, { status: 504 });
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => key.startsWith('nutrilife-') && !CACHE_NAMES.has(key) ? caches.delete(key) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (event.request.destination === 'image') {
    event.respondWith(imageFallback(event.request));
    return;
  }

  if (url.origin !== self.location.origin) {
    if (isTrustedCdnAsset(url)) {
      event.respondWith(cacheFirst(event.request, CACHE_NAME));
    }
    return;
  }

  if (isProductData(url)) {
    event.respondWith(productData(event.request));
    return;
  }

  if (isVersionedAsset(url)) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  event.respondWith(networkFirst(event.request));
});
