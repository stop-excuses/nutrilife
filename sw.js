const CACHE_NAME = 'nutrilife-v24';
const OFFLINE_URL = 'offline.html';
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
  'css/style.css?v=33',
  'js/main.js?v=16',
  'images/pwa/icon-192.png',
  'images/pwa/icon-512.png',
  'images/pwa/icon-maskable-192.png',
  'images/pwa/icon-maskable-512.png',
  'images/pwa/apple-touch-icon.png',
  'images/smart-supplements-hero.webp'
];

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
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match(event.request).then(cached => cached || caches.match(OFFLINE_URL));
        }
        return caches.match(event.request);
      })
  );
});
