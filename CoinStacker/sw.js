// Cache-first service worker: after the first visit the whole game lives on
// the device and runs offline. Bump CACHE_VERSION together with the version
// badge whenever any cached file changes, or clients keep the old build.
const CACHE_VERSION = 'coinstacker-v1.3.0';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './manifest.json',
  './icon-180.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) {
        // Refresh the cache in the background so updates land on next launch
        e.waitUntil(
          fetch(e.request)
            .then((res) => {
              if (res.ok) {
                return caches.open(CACHE_VERSION).then((c) => c.put(e.request, res));
              }
            })
            .catch(() => {})
        );
        return hit;
      }
      return fetch(e.request).then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.put(e.request, copy)));
        }
        return res;
      });
    })
  );
});
