const APP_CACHE_NAME = "minimaster-admin-panel-v4";
const RUNTIME_CACHE_NAME = "minimaster-admin-panel-runtime-v4";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./appcheck-init.js",
  "./pwa-register.js",
  "./logs.html",
  "./logs.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./modules/index.js",
  "./modules/core/registry.js",
  "./modules/core/sanitize.js",
  "./modules/core/command.js",
  "./modules/core/format.js",
  "./modules/core/automation-meta.js",
  "./modules/core/encoding.js",
  "./modules/core/error-codes.js",
  "./modules/core/security.js",
  "./modules/core/firebase-config.js",
  "./modules/core/dates.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_CACHE_NAME && key !== RUNTIME_CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isApiRequest = isSameOrigin && requestUrl.pathname.startsWith("/api/");

  if (isApiRequest) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    return;
  }

  // Same-origin assets should prefer the network so UI updates are visible immediately.
  if (isSameOrigin) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse.ok) {
            return networkResponse;
          }
          const clone = networkResponse.clone();
          caches.open(RUNTIME_CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
