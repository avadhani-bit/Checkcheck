/* CheckCheck — Service Worker */
const CACHE = 'checkcheck-v2';
const PRECACHE = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Let Firebase, Google Fonts, and googleapis handle themselves
  if (url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => cached);
      // Cache-first for app shell, network-first for everything else
      return cached || network;
    })
  );
});
