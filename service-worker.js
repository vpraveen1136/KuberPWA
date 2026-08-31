const CACHE_NAME = "kuber-pwa-shell-v29";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./src/app.js",
  "./src/backup.js",
  "./src/csv.js",
  "./src/db.js",
  "./src/finance.js",
  "./src/styles.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => cached || caches.match("./index.html"));
      })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "KUBER_CLEAR_SHELL_CACHE") return;
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter((key) => key.startsWith("kuber-pwa-shell-")).map((key) => caches.delete(key)));
    })
  );
});
