/*
 * PDF Studio service worker.
 *
 * Scope-relative on purpose. The previous version pre-cached the absolute paths "/",
 * "/index.html" and "/manifest.json", which 404 when the app is served from a sub-path such as
 * GitHub Pages' /pdf-studio/. cache.addAll() rejects if ANY entry fails, so install failed and
 * the service worker never activated — offline mode never worked at all. Everything below is
 * resolved against the registration scope instead, so it works at a domain root and under a
 * sub-path without changes.
 *
 * Caching strategy:
 *  - navigations  -> network first, fall back to the cached shell (so a new deploy is picked up
 *                    immediately instead of being pinned to a stale index.html)
 *  - other GETs   -> cache first (Vite asset filenames are content-hashed, so a cached hit is
 *                    always the right bytes; a changed file gets a new name)
 */

const CACHE_NAME = 'pdf-studio-v2';

// Resolved against the scope, e.g. https://host/pdf-studio/
const SHELL_URL = new URL('./index.html', self.registration.scope).href;
const PRECACHE = [SHELL_URL, new URL('./manifest.json', self.registration.scope).href];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Individually, so one missing file cannot fail the whole install.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {
            /* non-fatal */
          })
        )
      );
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Never cache cross-origin requests (OCR language data, pdf.js cmaps).
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(SHELL_URL, fresh.clone());
          return fresh;
        } catch {
          return (await caches.match(SHELL_URL)) || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, copy);
        }
        return response;
      } catch (err) {
        return Response.error();
      }
    })()
  );
});
