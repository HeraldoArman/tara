// Bump this version when changing offline.html so installed apps refresh it.
const CACHE_NAME = "tara-shell-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter(
            (key) =>
              (key.startsWith("bts-pwa-offline-") ||
                key.startsWith("tara-shell-")) &&
              key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })
  );
});

// Never cache authenticated HTML or API responses. Server-rendered pages need
// a connection; a precached page keeps offline navigation understandable.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const staticAsset =
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/favicon/"));
  if (event.request.method === "GET" && staticAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          return cached;
        }
        const response = await fetch(event.request);
        if (response.ok) {
          await cache.put(event.request, response.clone());
        }
        return response;
      })
    );
    return;
  }
  if (event.request.mode !== "navigate" || event.request.method !== "GET") {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(
      async () => (await caches.match(OFFLINE_URL)) ?? Response.error()
    )
  );
});
