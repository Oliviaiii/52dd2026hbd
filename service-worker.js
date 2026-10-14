const CACHE_NAME = "birthday-scratch-checker-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./assets/css/styles.css",
  "./assets/favicon.svg",
  "./assets/js/app.js",
  "./assets/js/core.js",
  "./data/config.json",
  "./data/prizes.json",
  "./data/gallery.json",
  "./data/prize-catalog.json",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  try {
    return await cacheResponse(await fetch(request));
  } catch {
    return (await caches.match(request)) || Response.error();
  }
}

async function cacheResponse(response) {
  if (!response || !response.ok) return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(response.url, response.clone());
  return response;
}
