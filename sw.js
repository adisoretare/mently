// Service Worker — app shell offline (PWA).
//
// Strategie: PRECACHE la install (lista explicită de mai jos) + cache-first la
// fetch pentru GET-uri same-origin. Aplicația e 100% statică și datele stau în
// localStorage/IndexedDB → după prima încărcare funcționează integral offline.
//
// ÎNTREȚINERE: la ORICE deploy care modifică un asset, incrementează CACHE —
// activate șterge cache-urile vechi și clients.claim() preia imediat controlul.

const CACHE = 'mently-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './style.css',
  './tailwind.css',
  './fonts/fonts.css',

  './main.js',
  './store.js',
  './security.js',
  './graph.js',
  './physics.js',
  './canvas.js',
  './search.js',
  './attachments.js',
  './i18n.js',
  './dom.js',
  './focus.js',
  './url-hash.js',
  './ui.js',
  './ui-form.js',
  './ui-list.js',
  './ui-tasks.js',
  './ui-drawer.js',
  './ui-node-panel.js',
  './ui-shortcuts.js',
  './ui-fullscreen.js',
  './ui-voice.js',

  './fonts/geist-normal-300-latin.woff2',
  './fonts/geist-normal-300-latin-ext.woff2',
  './fonts/geist-normal-400-latin.woff2',
  './fonts/geist-normal-400-latin-ext.woff2',
  './fonts/geist-normal-500-latin.woff2',
  './fonts/geist-normal-500-latin-ext.woff2',
  './fonts/geist-normal-600-latin.woff2',
  './fonts/geist-normal-600-latin-ext.woff2',
  './fonts/geist-mono-normal-400-latin.woff2',
  './fonts/geist-mono-normal-400-latin-ext.woff2',
  './fonts/geist-mono-normal-500-latin.woff2',
  './fonts/geist-mono-normal-500-latin-ext.woff2',
  './fonts/instrument-serif-normal-400-latin.woff2',
  './fonts/instrument-serif-normal-400-latin-ext.woff2',
  './fonts/instrument-serif-italic-400-latin.woff2',
  './fonts/instrument-serif-italic-400-latin-ext.woff2',

  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Doar GET same-origin — orice altceva trece direct la rețea
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        // Cache-uim doar răspunsurile complete OK (nu erori, nu partial 206)
        if (response.ok && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline + necache-uit: navigările primesc app shell-ul
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
