const CACHE = 'myapp-v10';
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './css/estilo.css',
  './js/app.js', './js/nucleo.js', './js/hoy.js',
  './js/finanzas.js', './js/habitos.js', './js/notas.js', './js/ajustes.js',
  './icons/icon-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Red primero, caché como respaldo sin conexión.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;  // la API va siempre a red
  e.respondWith(
    fetch(e.request)
      .then(r => { const copia = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia)); return r })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
