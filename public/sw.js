const CACHE = 'voice-orb-v2';
self.addEventListener('install', event => { self.skipWaiting(); event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/','/manifest.json','/icons/icon-192.svg','/icons/icon-512.svg']))); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy)); return response; }).catch(()=>caches.match(event.request).then(r=>r || caches.match('/'))));
});
