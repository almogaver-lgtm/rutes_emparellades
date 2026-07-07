'use strict';

const CACHE_NAME = 'rutes-app-v2';
const TILES_CACHE_NAME = 'rutes-tiles-v1';

const APP_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './lib/leaflet.js',
  './lib/leaflet.css',
  './lib/leaflet-imageoverlay-rotated.js',
  './js/storage.js',
  './js/map.js',
  './js/importer.js',
  './js/aligner.js',
  './js/control-points.js',
  './js/gps-tracker.js',
  './js/compass.js',
  './js/ui.js',
  './js/app.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

// Instalat: Cache dels assets de la shell de l'app
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Pre-caching app shell assets');
      return cache.addAll(APP_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activat: Netejar caches velles
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== TILES_CACHE_NAME) {
            console.log('Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetching: Interceptador de requests per a mode offline
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // 1. Gestionar els tiles de mapa d'OpenStreetMap de manera especial
  if (requestUrl.host.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILES_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          // Si no està al cache de tiles, el demanem a la xarxa
          return fetch(event.request).then((networkResponse) => {
            // Guardar al cache
            cache.put(event.request, networkResponse.clone());
            
            // Netejar si el cache de tiles és massa gran (FIFO - limit a 1500 tiles)
            limitCacheSize(TILES_CACHE_NAME, 1500);

            return networkResponse;
          }).catch(() => {
            // Si falla la xarxa (estem offline), retornem un tile placeholder
            return getOfflineTileResponse();
          });
        });
      })
    );
    return;
  }

  // 2. Recursos de la shell de l'aplicació (Cache-first amb fallback a xarxa)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Guardar nous recursos de l'app dinàmicament si cal
        if (response.status === 200 && APP_ASSETS.some(asset => event.request.url.includes(asset))) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    }).catch(() => {
      // Fallback si falla tot
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});

// Limitació de mida del cache de tiles (FIFO)
function limitCacheSize(cacheName, maxItems) {
  caches.open(cacheName).then((cache) => {
    cache.keys().then((keys) => {
      if (keys.length > maxItems) {
        // Eliminar el primer (el més antic)
        cache.delete(keys[0]).then(() => {
          limitCacheSize(cacheName, maxItems);
        });
      }
    });
  });
}

// Crear un tile SVG alternatiu per quan estàs offline
function getOfflineTileResponse() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <rect width="256" height="256" fill="#f0f0f0" stroke="#cccccc" stroke-width="1"/>
      <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="bold" fill="#888888">
        Rutes Emparellades
      </text>
      <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#aaaaaa">
        Offline
      </text>
    </svg>
  `;

  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml' }
  });
}
