/** Forward the original file through an authenticated server endpoint. */
import { auth } from "../../js/firebase.js";

export async function sendToTelegram(file, caption) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again before sending your photo.");
  const body = new FormData();
  body.append("file", file, file.name || "love-note.jpg");
  body.append("caption", caption);
  const response = await fetch("/api/telegram-love-photo", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not forward the photo to Telegram.");
  return result;
}
