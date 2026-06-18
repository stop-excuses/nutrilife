const CACHE_NAME = 'nutrilife-v34';
const DATA_CACHE = 'nutrilife-data-v1';
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
  'css/style.css?v=45',
  'js/main.js?v=19',
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
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || refresh;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    if (request.mode === 'navigate') {
      return (await cache.match(request)) || caches.match(OFFLINE_URL);
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
      cache.put(request, response.clone());
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
      .then(keys => Promise.all(keys.map(key => CACHE_NAMES.has(key) ? null : caches.delete(key))))
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
    event.respondWith(staleWhileRevalidate(event.request, DATA_CACHE));
    return;
  }

  if (isVersionedAsset(url)) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  event.respondWith(networkFirst(event.request));
});
