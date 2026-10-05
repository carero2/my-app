const CACHE = 'myapp-v30';
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './css/estilo.css',
  './js/app.js', './js/nucleo.js', './js/hoy.js',
  './js/finanzas.js', './js/habitos.js', './js/habitos-ui.js',
  './js/ajustes.js', './js/inversiones.js', './js/inversiones-ui.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  /* Sin skipWaiting: la versión nueva espera a que la app avise de que el
     usuario ha aceptado recargar. Así no se cambia el código bajo sus pies. */
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* La app pide el relevo cuando el usuario pulsa "Recargar". */
self.addEventListener('message', e => {
  if (e.data === 'relevo') self.skipWaiting();
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
