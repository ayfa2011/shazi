const svg = color => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${color}"/><text x="100" y="115" font-size="34" text-anchor="middle" fill="#fff">${color.replace("#", "")}</text></svg>`)}`;

window.__qa = {
  folders: [
    { id: "f-test", title: "Test", createdAtMs: 9, createdAt: { toMillis: () => 9 } },
    { id: "f-trips", title: "Trips", createdAtMs: 8, createdAt: { toMillis: () => 8 } }
  ],
  media: [
    { id: "m1", folderId: "f-test", mediaType: "photo", fileName: "one.jpg", url: svg("#c96b8a"), createdAtMs: 5 },
    { id: "m2", folderId: "f-test", mediaType: "photo", fileName: "two.jpg", url: svg("#8e7ab5"), createdAtMs: 4 },
    { id: "m3", folderId: "f-trips", mediaType: "photo", fileName: "trip.jpg", url: svg("#5f9e8f"), createdAtMs: 3 }
  ],
  watchers: [],
  calls: []
};

export function addItem(type, data) {
  window.__qa.calls.push({ addItem: type, data });
  return Promise.resolve({ id: "new" });
}

export function removeItem(id) {
  window.__qa.calls.push({ removeItem: id });
  window.__qa.media = window.__qa.media.filter(item => item.id !== id);
  window.__qa.watchers.forEach(w => w.type === "galleryMedia" && w.cb(window.__qa.media));
  return Promise.resolve();
}

export function watchItems(type, cb, onError) {
  window.__qa.watchers.push({ type, cb, onError });
  queueMicrotask(() => cb(type === "galleryFolder" ? window.__qa.folders : window.__qa.media));
  return () => { window.__qa.watchers = window.__qa.watchers.filter(w => w.cb !== cb); };
}
