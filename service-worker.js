/* RML Pliage V92 : page en ligne prioritaire, repli hors ligne. */
const CACHE_NAME = 'rml-pliage-v92-update-2026-09-06';
const BASE = self.registration.scope;
const INDEX_URL = new URL('index.html', BASE).href;
const FILES_TO_CACHE = ['index.html', 'manifest.json', 'header-logo.png', 'icon-pliage.png'];
const ASSET_URLS = new Set(FILES_TO_CACHE.map(path => new URL(path, BASE).href));

self.addEventListener('install', event => {
  // Pas de skipWaiting automatique : une pièce peut être en cours de dessin.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(new Request(INDEX_URL, {cache:'no-store'}));
    if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) {
      throw new Error('La nouvelle page est indisponible.');
    }
    await cache.put(INDEX_URL, response);
    await Promise.all(FILES_TO_CACHE.slice(1).map(async path => {
      try {
        const url = new URL(path, BASE).href;
        const asset = await fetch(new Request(url, {cache:'reload'}));
        if (asset.ok) await cache.put(url, asset);
      } catch (_) { /* Une image manquante ne bloque pas la mise à jour. */ }
    }));
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'RML_APPLY_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // CacheStorage est partagé par les applications du même domaine.
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('rml-pliage-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== new URL(BASE).origin || !url.href.startsWith(BASE)) return;
  const isPage = request.mode === 'navigate' || url.pathname === new URL(INDEX_URL).pathname || url.href === BASE;
  if (isPage) {
    const work = (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(new Request(request, {cache:'no-store'}));
        if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
          try { await cache.put(INDEX_URL, response.clone()); } catch (_) {}
          return response;
        }
        return (await cache.match(INDEX_URL)) || response;
      } catch (_) {
        return (await cache.match(INDEX_URL)) || new Response('Application indisponible hors ligne. Reconnectez-vous puis rechargez la page.', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }
    })();
    event.respondWith(work);
    event.waitUntil(work.then(() => {}));
    return;
  }
  if (ASSET_URLS.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) { try { await cache.put(request, response.clone()); } catch (_) {} }
      return response;
    })());
  }
  // Les appels Supabase et les autres requêtes restent hors du cache.
});
