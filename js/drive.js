import { sendToTelegram, telegramMediaReferences, telegramUploadMimeType } from "../src/services/telegramService.js";

export async function uploadProfilePhoto(file, profileName = "Partner") {
  const timestamp = new Date().toLocaleString();
  const result = await sendToTelegram(file, `New Profile Photo 💗 · ${profileName} · ${timestamp}`, new Date().toISOString().slice(0, 10), "profile", { storeForReveal: false });
  return { ...telegramMediaReferences(result), avatarMimeType: telegramUploadMimeType(file) };
}
