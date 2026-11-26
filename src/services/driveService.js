import { auth } from "../../js/firebase.js";
import { TELEGRAM_CONFIG } from "../../config/telegram-config.js";
import { TELEGRAM_APP_DOWNLOAD_LIMIT } from "./telegramService.js";

const DRIVE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
const DRIVE_MAX_VIDEO_BYTES = 2 * 1024 ** 3;
export const DRIVE_VIDEO_THRESHOLD = TELEGRAM_APP_DOWNLOAD_LIMIT;
const driveMediaUrls = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function driveId(reference) {
  const match = /^drive:([\w-]{10,100})$/.exec(String(reference || ""));
  return match?.[1] || "";
}

export function isDriveRef(reference) {
  return Boolean(driveId(reference));
}

async function driveRequest(url, options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again before using Google Drive videos.");
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    const error = new Error(result.error || result.message || `Google Drive request failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result;
}

function workerUrl(params = {}) {
  const url = new URL(TELEGRAM_CONFIG.WORKER_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url;
}

export async function uploadVideoToDrive(file, { onProgress } = {}) {
  if (!file || !String(file.type || "").startsWith("video/")) {
    throw new Error("Choose a video file to upload to Google Drive.");
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > DRIVE_MAX_VIDEO_BYTES) {
    throw new Error("This video is too large for the Memories upload limit (2 GB).");
  }

  const mimeType = file.type || "video/mp4";
  const { session: uploadSession } = await driveRequest(workerUrl({ drive: "init" }), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name || "memory-video", mimeType, size: file.size }),
  });
  if (!uploadSession) throw new Error("Google Drive did not start the video upload.");

  const nextOffset = (range, fallback) => {
    const match = /bytes=0-(\d+)/.exec(range || "");
    return match ? Number(match[1]) + 1 : fallback;
  };
  let offset = 0, failures = 0, uploaded = null;
  while (!uploaded) {
    const end = Math.min(offset + DRIVE_UPLOAD_CHUNK_BYTES, file.size) - 1;
    try {
      const result = await driveRequest(workerUrl({ drive: "chunk" }), {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Range": `bytes ${offset}-${end}/${file.size}`,
          "X-Drive-Upload-Session": uploadSession,
        },
        body: file.slice(offset, end + 1),
      });
      if (result.done) { uploaded = result; break; }
      offset = nextOffset(result.range, end + 1);
      failures = 0;
      onProgress?.(Math.min(1, offset / file.size));
    } catch (error) {
      if (error.status && error.status < 500 && error.status !== 408 && error.status !== 429) throw error;
      if (++failures > 4) throw error;
      await sleep(800 * failures);
      try {
        const status = await driveRequest(workerUrl({ drive: "status" }), {
          method: "PUT",
          headers: {
            "Content-Range": `bytes */${file.size}`,
            "X-Drive-Upload-Session": uploadSession,
          },
        });
        if (status.done) { uploaded = status; break; }
        offset = nextOffset(status.range, 0);
      } catch (statusError) {
        if (statusError.status && statusError.status < 500 && statusError.status !== 408 && statusError.status !== 429) throw statusError;
      }
    }
  }

  if (!uploaded?.id) throw new Error("Google Drive did not finish the video upload.");
  onProgress?.(1);
  return { id: uploaded.id, name: file.name || "memory-video", mimeType, size: file.size };
}

export function driveMediaReferences(file) {
  if (!file?.id || !/^[\w-]{10,100}$/.test(file.id)) {
    throw new Error("Google Drive did not return a valid video reference.");
  }
  return {
    telegramFileId: `drive:${file.id}`,
    telegramFileUniqueId: "",
    telegramMimeType: file.mimeType || "video/mp4",
    telegramMessageId: null,
    telegramChatId: null,
    telegramFileSize: Number(file.size) || 0,
  };
}

export async function deleteDriveVideo(reference) {
  const id = driveId(reference);
  if (!id) throw new Error("Invalid Google Drive video reference.");
  const url = workerUrl({ drive: "delete", id });
  return driveRequest(url, { method: "DELETE" });
}

export async function getDriveMediaBlob(reference, mimeType = "video/mp4") {
  if (!isDriveRef(reference)) throw new Error("Invalid Google Drive video reference.");
  const url = workerUrl({ fileId: reference, mimeType });
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again before opening this video.");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error || `Could not load this Google Drive video (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  return mimeType && blob.type.toLowerCase() !== mimeType.toLowerCase()
    ? blob.slice(0, blob.size, mimeType)
    : blob;
}

export function getDriveMediaUrl(reference, mimeType = "video/mp4") {
  if (!isDriveRef(reference)) return Promise.reject(new Error("Invalid Google Drive video reference."));
  const key = `${reference}::${String(mimeType || "video/mp4").toLowerCase()}`;
  if (!driveMediaUrls.has(key)) {
    let request;
    request = getDriveMediaBlob(reference, mimeType)
      .then(blob => URL.createObjectURL(blob))
      .catch(error => {
        if (driveMediaUrls.get(key) === request) driveMediaUrls.delete(key);
        throw error;
      });
    driveMediaUrls.set(key, request);
    while (driveMediaUrls.size > 4) {
      const [oldestKey, oldestRequest] = driveMediaUrls.entries().next().value;
      driveMediaUrls.delete(oldestKey);
      oldestRequest.then(url => URL.revokeObjectURL(url)).catch(() => {});
    }
  }
  return driveMediaUrls.get(key);
}
