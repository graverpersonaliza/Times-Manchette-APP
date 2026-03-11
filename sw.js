/* PWA Service Worker (GitHub Pages) */
const CACHE_NAME = "volei-no-sidney-v3";
const BASE = "/Times-Manchette-APP/";
const ASSETS = [
  BASE,
  BASE + "index.html",
  BASE + "manifest.json",
  BASE + "icon-192.png",
  BASE + "icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          try {
            const url = new URL(req.url);
            // Cache apenas respostas same-origin bem-sucedidas
            if (
              url.origin === self.location.origin &&
              res &&
              res.status === 200 &&
              res.type === "basic"
            ) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
          } catch (e) {}
          return res;
        })
        .catch(() => caches.match(BASE));
    })
  );
});
