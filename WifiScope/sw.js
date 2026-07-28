/* 와이파이 스코프 서비스 워커 — 앱 셸 캐시 (측정 트래픽은 캐시하지 않음) */
const CACHE = 'wifiscope-v1';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/quality.js',
  './js/speedtest.js',
  './js/heatmap.js',
  './js/ar.js',
  './js/app.js',
  './icon-180.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // 속도 측정 요청은 통과
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
