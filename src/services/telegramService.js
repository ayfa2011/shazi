import { TELEGRAM_CONFIG } from "../config/telegram-config.js";

const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_CONFIG.TOKEN}`;

/**
 * Sends a file (photo, document, audio) to Telegram.
 *
 * @param {Blob|File} file - The file/blob to upload.
 * @param {string} caption - The message caption.
 * @param {string} type - The type of media ('photo', 'document', 'audio').
 */
export async function sendToTelegram(file, caption, type = "document") {
  const url = `${BASE_URL}/send${capitalize(type)}`;

  const formData = new FormData();
  formData.append("chat_id", TELEGRAM_CONFIG.CHAT_ID);
  formData.append(type, file);
  formData.append("caption", `${caption}\n${new Date().toLocaleString()}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(`Telegram API error: ${data.description}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error sending to Telegram:", error);
    throw error;
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
