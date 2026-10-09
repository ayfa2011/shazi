const CACHE_PREFIX = "our-little-world-";
const CACHE_VERSION = "v1";
const CACHE_NAME = `${CACHE_PREFIX}shell-${new URL(self.registration.scope).pathname}-${CACHE_VERSION}`;
const SHELL_FILES = [
  "",
  "index.html",
  "manifest.webmanifest",
  "css/styles.css",
  "icons/app-icon.svg",
  "icons/app-icon-192.png",
  "icons/app-icon-512.png"
].map(path => new URL(path, self.registration.scope).href);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const route = ["home", "questions", "challenges", "letters", "memories"].includes(event.notification.data?.route)
    ? event.notification.data.route
    : "home";
  const destination = new URL(`?open=${encodeURIComponent(route)}`, self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => "focus" in client);
    if (existing) {
      await existing.navigate(destination);
      return existing.focus();
    }
    return self.clients.openWindow(destination);
  }));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      !url.href.startsWith(self.registration.scope)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(async response => {
        if (response.ok) {
          const copy = response.clone();
          await (await caches.open(CACHE_NAME)).put(request, copy);
        }
        return response;
      })
        .catch(async () => (await caches.match(request)) || caches.match(SHELL_FILES[0]))
    );
    return;
  }

  event.respondWith(
    fetch(request).then(async response => {
      if (response.ok) {
        const copy = response.clone();
        await (await caches.open(CACHE_NAME)).put(request, copy);
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw new Error(`No cached response is available for ${request.url}`);
    })
  );
});
