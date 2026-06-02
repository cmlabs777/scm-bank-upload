const CACHE = "scm-v1";

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  return self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // API routes — always network, never cache financial data
  if (url.pathname.startsWith("/api/")) return;

  // Hashed static assets — cache-first (safe because filename changes on content change)
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            caches.open(CACHE).then((c) => c.put(request, res.clone()));
            return res;
          })
      )
    );
    return;
  }

  // Page navigations — network with offline fallback
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
  }
});
