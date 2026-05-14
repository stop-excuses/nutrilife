const CACHE_NAME = 'nutrilife-v1';

const SHELL_ASSETS = [
  '/nutrilife/',
  '/nutrilife/index.html',
  '/nutrilife/move.html',
  '/nutrilife/eat.html',
  '/nutrilife/start.html',
  '/nutrilife/smart-food.html',
  '/nutrilife/smart-supplements.html',
  '/nutrilife/supplements.html',
  '/nutrilife/health-check.html',
  '/nutrilife/mental.html',
  '/nutrilife/cheap.html',
  '/nutrilife/css/style.css',
  '/nutrilife/js/main.js',
  '/nutrilife/js/i18n.js',
  '/nutrilife/js/offers.js',
  '/nutrilife/js/supplements.js',
  '/nutrilife/favicon.svg'
];

// Data files — always fetch fresh when online
const DATA_PATHS = ['/data/offers.js', '/data/supplements.js', '/data/offers.json', '/data/supplements.json'];

function isDataRequest(url) {
  return DATA_PATHS.some(p => url.pathname.includes(p));
}

// Install: pre-cache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // Network-First for data files
  if (isDataRequest(new URL(e.request.url))) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-First for everything else (shell, images, etc.)
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
