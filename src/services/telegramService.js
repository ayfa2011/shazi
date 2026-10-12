/** Forward the original file through the Cloudflare Worker. */
import { auth } from "../../js/firebase.js";
import { TELEGRAM_CONFIG } from "../../config/telegram-config.js";

const mimeTypesByExtension = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp", avif: "image/avif", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska", avi: "video/x-msvideo", "3gp": "video/3gpp",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac"
};
const mediaUrlCache = new Map();

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

export async function sendToTelegram(file, caption, dayKey, profileKey, { storeForReveal = true } = {}) {
  const body = new FormData();
  const fileName = file.name || "love-note.jpg";
  const extension = fileName.split(".").pop().toLowerCase();
  const inferredType = mimeTypesByExtension[extension];
  const uploadFile = file.type ? file : new File([file], fileName, { type: inferredType || "application/octet-stream" });
  body.append("file", uploadFile, fileName);
  body.append("caption", caption);
  const url = new URL(TELEGRAM_CONFIG.WORKER_URL);
  url.searchParams.set("dayKey", dayKey);
  // Keep generic forwards out of the daily reveal slot even before the Worker is redeployed.
  url.searchParams.set("profileKey", storeForReveal ? profileKey : `upload_${Date.now().toString(36)}`);
  if (!storeForReveal) url.searchParams.set("storeForReveal", "false");
  const response = await authorizedRequest(url.toString(), { method: "POST", body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || result.message || "Could not forward the photo to Telegram.");
  return result;
}

/** profileKey = whose photo to load, viewerKey = the signed-in person's own profile key. */
export async function getTelegramLovePhoto(dayKey, profileKey, viewerKey) {
  const url = new URL(TELEGRAM_CONFIG.WORKER_URL);
  url.searchParams.set("dayKey", dayKey);
  url.searchParams.set("profileKey", profileKey);
  url.searchParams.set("viewerKey", viewerKey || profileKey);
  const response = await authorizedRequest(url.toString(), { method: "GET" });
  if (!response.ok) {
    const error = new Error(response.status === 423 ? "Both partners need to upload before reveal." : "Could not load the revealed photo.");
    error.status = response.status;
    throw error;
  }
  return response.blob();
}

/** Load Gallery media through the authenticated Worker; the Telegram bot token stays server-side. */
export async function getTelegramMediaBlob(fileId, mimeType = "application/octet-stream") {
  const url = new URL(TELEGRAM_CONFIG.WORKER_URL);
  url.searchParams.set("fileId", fileId);
  url.searchParams.set("mimeType", mimeType);
  const response = await authorizedRequest(url.toString());
  if (!response.ok) throw new Error("Could not load this Telegram media.");
  return response.blob();
}

export const getTelegramGalleryMedia = getTelegramMediaBlob;

export function telegramMediaReferences(result) {
  const message = result?.result || result || {};
  const media = message.document || message.video || message.audio || message.animation || message.photo?.at(-1);
  if (!media?.file_id) throw new Error("Telegram did not return a media reference.");
  return {
    telegramFileId: media.file_id,
    telegramFileUniqueId: media.file_unique_id || "",
    telegramMessageId: message.message_id || null,
    telegramChatId: message.chat?.id || null,
  };
}

/** Return a local URL backed by an authenticated Telegram Worker response. */
export function getTelegramMediaUrl(fileId, mimeType = "application/octet-stream") {
  if (!fileId) return Promise.reject(new Error("Telegram media reference is missing."));
  if (!mediaUrlCache.has(fileId)) {
    const request = getTelegramMediaBlob(fileId, mimeType).then(blob => URL.createObjectURL(blob)).catch(error => {
      mediaUrlCache.delete(fileId);
      throw error;
    });
    mediaUrlCache.set(fileId, request);
  }
  return mediaUrlCache.get(fileId);
}

/**
 * Drop a cached blob URL so the browser can release the media bytes.
 * Safe to call for unknown ids; a rejected or in-flight request is discarded.
 */
export function revokeTelegramMediaUrl(fileId) {
  const pending = mediaUrlCache.get(fileId);
  if (!pending) return;
  mediaUrlCache.delete(fileId);
  pending.then(url => URL.revokeObjectURL(url)).catch(() => {});
}

/** Ask Telegram to remove a Gallery message when its server-side retention rules allow it. */
export async function deleteTelegramGalleryMessage(chatId, messageId) {
  const url = new URL(TELEGRAM_CONFIG.WORKER_URL);
  url.searchParams.set("galleryChatId", chatId);
  url.searchParams.set("galleryMessageId", messageId);
  const response = await authorizedRequest(url.toString(), { method: "DELETE" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || "Telegram could not delete this media.");
  return result;
}
