export async function sendToTelegram() {
  window.__qa.calls.push({ sendToTelegram: true });
  return { result: { message_id: 1, chat: { id: 2 }, photo: [{ file_id: "file" }] } };
}

export async function getTelegramMediaBlob() {
  return new Blob(["x"], { type: "image/jpeg" });
}

export async function deleteTelegramGalleryMessage() {
  window.__qa.calls.push({ deleteTelegramGalleryMessage: true });
}

export const telegramUploadMimeType = file => file.type || "application/octet-stream";
