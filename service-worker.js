/* Offline-First PWA service worker for Our Little World.
 *
 * Strategies:
 *  - Navigations (HTML): Network-First, fall back to cached shell → offline.
 *  - Static assets (CSS/JS/icons/fonts/local images): Stale-While-Revalidate
 *    (serve cache instantly, refresh in background).
 *  - Firebase APIs (firestore.googleapis.com, *.googleapis.com, gstatic,
 *    Cloudflare worker, Telegram): never intercepted — SDKs + app caches
 *    (Firestore IndexedDB, olw-media-cache) own offline behavior.
 */
const CACHE_PREFIX = "our-little-world-";
const CACHE_VERSION = "v16";
const SHELL_CACHE = `${CACHE_PREFIX}shell-${new URL(self.registration.scope).pathname}-${CACHE_VERSION}`;
const STATIC_CACHE = `${CACHE_PREFIX}static-${new URL(self.registration.scope).pathname}-${CACHE_VERSION}`;
let forceNetworkUntil = 0;

const SHELL_FILES = [
  "",
  "index.html",
  "manifest.webmanifest",
  "manifest.json",
  "css/styles.css",
  "css/challenges.css",
  "icons/app-icon.svg",
  "icons/app-icon-192.png",
  "icons/app-icon-512.png",
  "Asset/Header.png",
  "Asset/Question.png",
  "Asset/Challenge.png",
  "Asset/Background.png",
  "Asset/Boy.png",
  "Asset/Girl.png"
].map(path => new URL(path, self.registration.scope).href);

// Local static assets eligible for Stale-While-Revalidate.
const STATIC_EXTENSIONS = new Set(["css", "js", "mjs", "png", "jpg", "jpeg", "webp", "avif", "gif", "svg", "woff", "woff2", "ttf", "otf", "ico", "json"]);
const STATIC_DIRS = ["css/", "js/", "icons/", "Asset/", "config/", "src/"];

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (!url.href.startsWith(self.registration.scope)) return false;
  const path = url.pathname.toLowerCase();
  if (url.pathname.endsWith(".webmanifest")) return true;
  const ext = path.split(".").pop().split("?")[0];
  if (STATIC_EXTENSIONS.has(ext)) return true;
  const scopePath = new URL(self.registration.scope).pathname;
  const relative = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : url.pathname;
  return STATIC_DIRS.some(dir => relative.startsWith(dir));
}

async function cacheFirstThenNetwork(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // Static assets are versioned by deployment; avoid re-fetching every JS,
    // CSS and icon on every navigation. The next install precaches the shell.
    return cached;
  }
  const network = await fetch(request);
  if (network?.ok) cache.put(request, network.clone()).catch(() => {});
  if (network) return network;
  throw new Error(`No cached response is available for ${request.url}`);
}

function isCodeAsset(url) {
  return /\.(?:css|mjs|js)$/.test(url.pathname.toLowerCase());
}

async function responsesDiffer(cached, fresh) {
  const oldTag = cached.headers.get("ETag");
  const newTag = fresh.headers.get("ETag");
  if (oldTag && newTag) return oldTag !== newTag;
  const [oldBytes, newBytes] = await Promise.all([cached.arrayBuffer(), fresh.clone().arrayBuffer()]);
  if (oldBytes.byteLength !== newBytes.byteLength) return true;
  const oldView = new Uint8Array(oldBytes);
  const newView = new Uint8Array(newBytes);
  return oldView.some((byte, index) => byte !== newView[index]);
}

async function staleWhileRevalidate(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request, { cache: "no-cache" }).then(async fresh => {
    if (!fresh.ok) return fresh;
    const changed = cached && await responsesDiffer(cached.clone(), fresh.clone());
    await cache.put(request, fresh.clone());
    if (changed) {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      clients.forEach(client => client.postMessage({ type: "APP_ASSET_UPDATED", url: request.url }));
    }
    return fresh;
  });
  event.waitUntil(refresh.catch(() => {}));
  if (cached) {
    // Serve code immediately, then refresh the cache in the background.
    // A client is notified when the bytes change so it can refresh safely.
    return cached;
  }
  return refresh;
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => caches.open(STATIC_CACHE))
      .then(cache => cache.addAll([
        "js/app.js", "js/firebase.js", "js/auth.js", "js/utils.js",
        "js/firestore.js", "js/components.js", "js/dashboard.js",
        "js/memories.js", "js/gallery.js", "js/letters.js", "js/questions.js",
        "js/question-service.js", "js/profile-data.js", "src/services/telegramService.js",
        "config/app-config.js", "config/telegram-config.js"
      ].map(path => new URL(path, self.registration.scope).href)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== STATIC_CACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "REFRESH_ASSETS") {
    forceNetworkUntil = Date.now() + 15000;
    event.ports[0]?.postMessage({ type: "READY" });
  }
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
  // Only handle same-origin GET requests inside our scope.
  // Cross-origin (Firebase APIs, gstatic, CDNs, Telegram worker) is left
  // alone so Auth/Firestore/RTDB SDKs behave normally.
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      !url.href.startsWith(self.registration.scope)) return;

  if (request.mode === "navigate") {
    // Navigations: Network-First so users get fresh HTML, with cached
    // shell fallback when fully offline.
    event.respondWith(
      fetch(request).then(async response => {
        if (response.ok) {
          const copy = response.clone();
          await (await caches.open(SHELL_CACHE)).put(request, copy);
        }
        return response;
      })
        .catch(async () => (await caches.match(request)) || caches.match(SHELL_FILES[0]))
    );
    return;
  }

  // Code is served instantly from cache and revalidated in the background.
  // Other static assets remain cache-first.
  if (isStaticAsset(url)) {
    if (Date.now() < forceNetworkUntil) {
      event.respondWith(fetch(request, { cache: "reload" }).then(async response => {
        if (response.ok) await (await caches.open(STATIC_CACHE)).put(request, response.clone());
        return response;
      }).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error(`No cached response is available for ${request.url}`);
      }));
      return;
    }
    if (isCodeAsset(url)) {
      event.respondWith(staleWhileRevalidate(request, STATIC_CACHE, event));
      return;
    }
    event.respondWith(cacheFirstThenNetwork(request, STATIC_CACHE));
    return;
  }

  // Any other same-scope request: network with cache fallback.
  event.respondWith(
    fetch(request).then(async response => {
      if (response.ok) {
        const copy = response.clone();
        await (await caches.open(STATIC_CACHE)).put(request, copy);
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw new Error(`No cached response is available for ${request.url}`);
    })
  );
});
