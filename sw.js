/* =========================================================
   APavan ATP — Service Worker
   APAVAN ENGENHARIA E CONSULTORIA
   ========================================================= */

const CACHE = 'apavan-atp-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg'
];

/* ---------- INSTALAÇÃO ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS).catch(err => {
        console.warn('Cache parcial:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

/* ---------- ATIVAÇÃO ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- FETCH (cache-first com fallback) ---------- */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Não interceptar chamadas externas
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cachear apenas respostas válidas
        if (response && response.status === 200) {
          const copia = response.clone();
          caches.open(CACHE).then(cache => {
            cache.put(event.request, copia).catch(() => {});
          });
        }
        return response;
      }).catch(() => {
        // Offline: devolve o index.html para navegação
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});