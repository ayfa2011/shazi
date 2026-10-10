/** Forward the original file through the Cloudflare Worker. */
import { auth } from "../../js/firebase.js";
import { TELEGRAM_CONFIG } from "../../config/telegram-config.js";

const photoMimeTypes = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp", avif: "image/avif", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp" };

async function authorizedRequest(url, options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again before sending your photo.");
  return fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
}

export async function sendToTelegram(file, caption, dayKey) {
  const body = new FormData();
  const fileName = file.name || "love-note.jpg";
  const extension = fileName.split(".").pop().toLowerCase();
  const inferredType = photoMimeTypes[extension];
  const uploadFile = file.type?.startsWith("image/") ? file : new File([file], fileName, { type: inferredType || "application/octet-stream" });
  body.append("file", uploadFile, fileName);
  body.append("caption", caption);
  body.append("dayKey", dayKey);
  const url = new URL(TELEGRAM_CONFIG.WORKER_URL);
  url.searchParams.set("dayKey", dayKey);
  const response = await authorizedRequest(url.toString(), { method: "POST", body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || result.message || "Could not forward the photo to Telegram.");
  return result;
}

export async function getTelegramLovePhoto(dayKey, profileKey) {
  const url = new URL(TELEGRAM_CONFIG.WORKER_URL);
  url.searchParams.set("dayKey", dayKey);
  url.searchParams.set("profileKey", profileKey);
  const response = await authorizedRequest(url.toString(), { method: "GET" });
  if (!response.ok) throw new Error(response.status === 423 ? "Both partners need to upload before reveal." : "Could not load the revealed photo.");
  return response.blob();
}
