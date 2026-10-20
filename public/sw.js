// BlueRoot service worker: keeps the field evidence page usable on weak or absent networks (spec 11).
// - Next.js static assets: cache first (their URLs are content-hashed).
// - Pages: network first, falling back to the last cached copy.
// - API calls and anything cross-origin are never cached (private evidence, live chain data).
const VERSION = "blueroot-v1";
const SHELL = ["/fr/field", "/en/field", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(request, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && url.pathname.endsWith("/field")) caches.open(VERSION).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/fr/field"))),
    );
  }
});
