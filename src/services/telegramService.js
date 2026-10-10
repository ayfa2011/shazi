/** Forward the original file through an authenticated server endpoint. */
import { auth } from "../../js/firebase.js";

export async function sendToTelegram(file, caption) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again before sending your photo.");
  const body = new FormData();
  const fileName = file.name || "love-note.jpg";
  const extension = fileName.split(".").pop().toLowerCase();
  const inferredType = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp", avif: "image/avif", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp" }[extension];
  const uploadFile = file.type?.startsWith("image/") ? file : new File([file], fileName, { type: inferredType || "application/octet-stream" });
  body.append("file", uploadFile, fileName);
  body.append("caption", caption);
  const response = await fetch("/api/telegram-love-photo", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not forward the photo to Telegram.");
  return result;
}
