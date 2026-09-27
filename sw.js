// Retired: PDF Studio moved to https://co-pdf.com.
// This replaces the old app's service worker so returning visitors are not served a stale
// cached copy: it deletes every cache, unregisters itself and reloads open tabs.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
