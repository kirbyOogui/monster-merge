// Minimal service worker: exists mainly to satisfy PWA installability, plus
// a small, safe speed win — stale-while-revalidate caching for static game
// art (`/assets/*`) only. Anything else (HTML, JS/CSS bundles, the ranking
// API) always goes straight to the network, so gameplay logic, rankings,
// and deploys are never served stale.
const CACHE_NAME = "gattai-monsters-assets-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/assets/")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      // Serve the cached copy instantly when there is one (fast repeat
      // loads), while always refreshing it in the background for next
      // time — so a re-generated asset under the same filename (this
      // project has iterated on monster art in place more than once)
      // still eventually catches up instead of staying stale forever.
      return cached || network;
    }),
  );
});
