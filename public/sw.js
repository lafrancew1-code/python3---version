const CACHE = 'field-estimate-v10';
const SHELL = [
  '/',
  '/index.html',
  '/project.html',
  '/room.html',
  '/estimate.html',
  '/materials.html',
  '/settings.html',
  '/css/app.css',
  '/js/app.js',
  '/js/estimate.js',
  '/js/history.js',
  '/js/settings.js',
  '/js/projects.js',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/.netlify/functions/')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
