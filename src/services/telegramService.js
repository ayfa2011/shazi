/** Forward the original file through the Cloudflare Worker. */
import { auth } from "../../js/firebase.js";
import { TELEGRAM_CONFIG } from "../../config/telegram-config.js";

const mimeTypesByExtension = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp", avif: "image/avif", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska", avi: "video/x-msvideo", "3gp": "video/3gpp",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac"
};
const mediaUrlCache = new Map();

// ── Offline-First media cache (IndexedDB) ─────────────────────────────
// Photo/video/audio bytes proxied from Telegram are stored here so
// previously viewed memories, posts, drawings, and songs stay viewable
// offline. Firestore/RTDB only hold lightweight references (file ids);
// this store holds the actual bytes. Blob-URL cache above is memory-only
// and is rehydrated from IndexedDB on repeat views.
const MEDIA_DB_NAME = "olw-media-cache";
const MEDIA_STORE = "media";
const THUMB_STORE = "thumbs";
const MEDIA_MAX_ENTRIES = 250;
const THUMB_MAX_ENTRIES = 400;
const TELEGRAM_MEDIA_TIMEOUT_MS = 30000;

function openMediaDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(MEDIA_DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE);
      }
      if (!db.objectStoreNames.contains(THUMB_STORE)) {
        db.createObjectStore(THUMB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open media cache."));
  });
}

function idbGetFrom(storeName, key) {
  return openMediaDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error("Media cache read failed."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error || new Error("Media cache read failed."));
  }));
}

function idbGet(key) {
  return idbGetFrom(MEDIA_STORE, key);
}

/** Read a tiny blurred thumbnail (~instant first paint). */
export function getCachedThumb(fileId) {
  if (!fileId) return Promise.resolve(null);
  return idbGetFrom(THUMB_STORE, "thumb::" + fileId).catch(() => null);
}

/** Persist a tiny blurred thumbnail for instant blur-up rendering. */
export function setCachedThumb(fileId, dataUrl, kind = "preview") {
  if (!fileId || !dataUrl) return Promise.resolve();
  return openMediaDb().then(db => new Promise((resolve) => {
    try {
      const tx = db.transaction(THUMB_STORE, "readwrite");
      const store = tx.objectStore(THUMB_STORE);
      store.put({ dataUrl, kind, savedAt: Date.now() }, "thumb::" + fileId);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { try { db.close(); } catch {} resolve(); };
    } catch { try { db.close(); } catch {} resolve(); }
  })).catch(() => {});
}

function idbSet(key, value) {
  return openMediaDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    const store = tx.objectStore(MEDIA_STORE);
    store.put({ blob: value.blob, mimeType: value.mimeType, savedAt: Date.now() }, key);
    // Best-effort LRU trim: keep the cache bounded on small phones.
    try {
      const countReq = store.count();
      countReq.onsuccess = () => {
        if (Number(countReq.result || 0) <= MEDIA_MAX_ENTRIES) return;
        const cursorReq = store.openCursor();
        let excess = Number(countReq.result) - MEDIA_MAX_ENTRIES;
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || excess <= 0) return;
          cursor.delete();
          excess -= 1;
          cursor.continue();
        };
      };
    } catch { /* trim is best-effort only */ }
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error || new Error("Media cache write failed."));
  })).catch(error => {
    // Private mode / blocked storage must never break media loading.
    console.warn("Media cache write skipped:", error);
  });
}

function mediaCacheKey(fileId, mimeType) {
  return `${fileId}::${String(mimeType || "application/octet-stream").toLowerCase()}`;
}

export function telegramUploadMimeType(file) {
  if (file?.type) return file.type;
  const extension = String(file?.name || "").split(".").pop().toLowerCase();
  return mimeTypesByExtension[extension] || "application/octet-stream";
}

async function authorizedRequest(url, options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again before sending your photo.");
  return fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
}

export async function sendToTelegram(file, caption) {
  const body = new FormData();
  const fileName = file.name || "love-note.jpg";
  const extension = fileName.split(".").pop().toLowerCase();
  const inferredType = mimeTypesByExtension[extension];
  const uploadFile = file.type ? file : new File([file], fileName, { type: inferredType || "application/octet-stream" });
  body.append("file", uploadFile, fileName);
  body.append("caption", caption);
  const response = await authorizedRequest(TELEGRAM_CONFIG.WORKER_URL, { method: "POST", body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || result.message || "Could not forward the photo to Telegram.");
  return result;
}

/** Load Gallery media through the authenticated Worker; the Telegram bot token stays server-side. */
export async function getTelegramMediaBlob(fileId, mimeType = "application/octet-stream") {
  const normalizedType = String(mimeType || "application/octet-stream").toLowerCase();
  const cacheKey = mediaCacheKey(fileId, normalizedType);
  const fixType = (blob) => {
    if (!blob) return blob;
    if (blob.type.toLowerCase() === normalizedType || normalizedType === "application/octet-stream") return blob;
    return blob.slice(0, blob.size, normalizedType);
  };

  // 1) CACHE-FIRST: IndexedDB hit renders instantly with zero network wait.
  const cached = await idbGet(cacheKey).catch(() => null);
  if (cached?.blob) {
    // Telegram file IDs are immutable. Keep the IndexedDB copy as the source
    // of truth so opening a cached memory never downloads it again.
    return fixType(cached.blob);
  }

  // 2) Offline with no cache: fail fast (callers show placeholder).
  if (!navigator.onLine) {
    throw new Error("This photo is not cached yet. Connect once to save it for offline.");
  }

  const blob = await fetchMediaFromNetwork(fileId, mimeType);
  void idbSet(cacheKey, { blob, mimeType: blob.type || normalizedType });
  return blob;
}

/** Network fetch with cached fallback on any failure. */
async function fetchMediaFromNetwork(fileId, mimeType) {
  const normalizedType = String(mimeType || "application/octet-stream").toLowerCase();
  const cacheKey = mediaCacheKey(fileId, normalizedType);
  const url = new URL(TELEGRAM_CONFIG.WORKER_URL);
  url.searchParams.set("fileId", fileId);
  url.searchParams.set("mimeType", mimeType);
  let response;
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TELEGRAM_MEDIA_TIMEOUT_MS);
  try {
    response = await authorizedRequest(url.toString(), { signal: controller.signal });
    if (!response.ok) {
      const cached = await idbGet(cacheKey).catch(() => null);
      if (cached?.blob) return cached.blob;
      throw new Error(`Could not load this Telegram media (HTTP ${response.status}).`);
    }
    const blob = await response.blob();
    const requestedType = String(mimeType || "").trim().toLowerCase();
    if (requestedType && requestedType !== "application/octet-stream" && blob.type.toLowerCase() !== requestedType) {
      return blob.slice(0, blob.size, requestedType);
    }
    return blob;
  } catch (networkError) {
    const cached = await idbGet(cacheKey).catch(() => null);
    if (cached?.blob) return cached.blob;
    if (timedOut) throw new Error("Telegram media request timed out. Please try again.");
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function telegramMediaReferences(result) {
  const message = result?.result || result || {};
  const media = message.document || message.video || message.audio || message.animation || message.photo?.at(-1);
  if (!media?.file_id) throw new Error("Telegram did not return a media reference.");
  return {
    telegramFileId: media.file_id,
    telegramFileUniqueId: media.file_unique_id || "",
    telegramMimeType: media.mime_type || "",
    telegramMessageId: message.message_id || null,
    telegramChatId: message.chat?.id || null,
  };
}

/** Return a local URL backed by an authenticated Telegram Worker response. */
export function getTelegramMediaUrl(fileId, mimeType = "application/octet-stream") {
  if (!fileId) return Promise.reject(new Error("Telegram media reference is missing."));

  // The same file id may be requested once with a generic MIME type and later with
  // its actual type. Cache each MIME variant separately to avoid reusing a bad Blob URL.
  const cacheKey = `${fileId}::${String(mimeType || "application/octet-stream").toLowerCase()}`;
  if (!mediaUrlCache.has(cacheKey)) {
    let request;
    request = getTelegramMediaBlob(fileId, mimeType)
      .then(blob => URL.createObjectURL(blob))
      .catch(error => {
        // A timed-out request must be retryable, without deleting a newer
        // request that may have replaced it while this one was settling.
        if (mediaUrlCache.get(cacheKey) === request) mediaUrlCache.delete(cacheKey);
        throw error;
      });
    mediaUrlCache.set(cacheKey, request);
  }
  return mediaUrlCache.get(cacheKey);
}

/** Return a cached media URL immediately without starting a network request. */
export async function getCachedTelegramMediaUrl(fileId, mimeType = "application/octet-stream") {
  if (!fileId) return null;
  const key = mediaCacheKey(fileId, mimeType);
  const cached = await idbGet(key).catch(() => null);
  if (!cached?.blob) return null;
  if (!mediaUrlCache.has(key)) mediaUrlCache.set(key, Promise.resolve(URL.createObjectURL(cached.blob)));
  return mediaUrlCache.get(key);
}

/** Return a compact JPEG data URL for the signed-in profile-photo cache. */
export async function getCachedTelegramMediaPreview(fileId, mimeType = "image/jpeg") {
  if (!fileId) return null;
  const cached = await idbGet(mediaCacheKey(fileId, mimeType)).catch(() => null);
  if (!cached?.blob) return null;
  try {
    const bitmap = await createImageBitmap(cached.blob);
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) { bitmap.close?.(); return null; }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.78);
  } catch {
    return null;
  }
}

/**
 * Drop a cached blob URL so the browser can release the media bytes.
 * Safe to call for unknown ids; a rejected or in-flight request is discarded.
 */
export function revokeTelegramMediaUrl(fileId) {
  if (!fileId) return;
  // Remove every MIME-specific cache entry for this Telegram file id.
  for (const [cacheKey, pending] of mediaUrlCache.entries()) {
    if (!cacheKey.startsWith(`${fileId}::`)) continue;
    mediaUrlCache.delete(cacheKey);
    pending.then(url => URL.revokeObjectURL(url)).catch(() => {});
  }
}

/** Ask Telegram to remove a Gallery message when its server-side retention rules allow it. */
export async function deleteTelegramGalleryMessage(chatId, messageId) {
  const url = new URL(TELEGRAM_CONFIG.WORKER_URL);
  url.searchParams.set("galleryChatId", chatId);
  url.searchParams.set("galleryMessageId", messageId);
  const response = await authorizedRequest(url.toString(), { method: "DELETE" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 502) console.warn("Telegram worker proxy returned 502 Bad Gateway");
    throw new Error(result.error || `Telegram could not delete this media (HTTP ${response.status}).`);
  }
  if (result.ok === false) throw new Error(result.error || "Telegram could not delete this media.");
  return result;
}
