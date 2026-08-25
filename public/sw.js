const CACHE = "neto-v5";
const OFFLINE_HTML = "/";

// This list is augmented automatically after Vite builds by
// scripts/inject-sw-precache.mjs. Keeping the static PWA assets here means
// the app can start from cache without waiting for the Render server to wake.
const PRECACHE = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  "/icons/favicon-64.png",
  "/splash/neto-splash.png"
];

const STATIC_CACHE = CACHE;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

async function cacheResponse(request, response) {
  if (!response || !response.ok) return response;
  const cache = await caches.open(STATIC_CACHE);
  await cache.put(request, response.clone());
  return response;
}

function withTimeout(fetchPromise, milliseconds) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("network-timeout")), milliseconds);
    fetchPromise.then(
      (response) => { clearTimeout(timer); resolve(response); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never make application startup depend on Render. The cached HTML shell
  // is returned immediately; the browser can then load cached JS/CSS while
  // Render wakes silently in the background.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cached = await caches.match(OFFLINE_HTML, { ignoreSearch: true });
      if (cached) {
        // Refresh the shell in the background. A sleeping Render instance
        // cannot delay the response shown to the user.
        event.waitUntil(
          withTimeout(fetch(request), 5000)
            .then((response) => cacheResponse(new Request(OFFLINE_HTML), response))
            .catch(() => undefined)
        );
        return cached;
      }

      // First-ever load before the service worker has a shell: use the network.
      return fetch(request);
    })());
    return;
  }

  // API GETs are network-first with a short timeout and cached fallback.
  // POST requests (including AI chat) are deliberately left untouched.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      try {
        const response = await withTimeout(fetch(request), 5000);
        return await cacheResponse(request, response);
      } catch {
        return cached || new Response(
          JSON.stringify({ offline: true, error: "Neto is offline. The app interface is still available." }),
          { status: 503, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }
        );
      }
    })());
    return;
  }

  // Static files: cache-first for instant startup, with background refresh.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) {
      event.waitUntil(
        fetch(request)
          .then((response) => cacheResponse(request, response))
          .catch(() => undefined)
      );
      return cached;
    }

    try {
      return await cacheResponse(request, await fetch(request));
    } catch {
      return new Response("Neto is offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  })());
});
