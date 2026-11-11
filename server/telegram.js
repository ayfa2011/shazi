import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TEMP_STORAGE_DIR = process.env.TEMP_STORAGE_DIR || "./temp";

export function getTelegramFileUrl(filePath) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN env var is required.");
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
}

export async function getTelegramFilePath(fileId) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN env var is required.");
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram getFile failed: ${data.description}`);
  return data.result.file_path;
}

export async function ensureTempDir() {
  await fs.mkdir(TEMP_STORAGE_DIR, { recursive: true });
}

export async function downloadTelegramFile(fileId, destFileName) {
  await ensureTempDir();
  const filePath = await getTelegramFilePath(fileId);
  const fileUrl = getTelegramFileUrl(filePath);
  const destPath = path.join(TEMP_STORAGE_DIR, destFileName);

  const res = await fetch(fileUrl);
  if (!res.ok || !res.body) throw new Error(`Telegram file download failed: ${res.status}`);
  const fileStream = createWriteStream(destPath);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
  });
  return destPath;
}

export async function deleteTempFile(fileName) {
  try {
    await fs.unlink(path.join(TEMP_STORAGE_DIR, fileName));
  } catch { /* ignore missing */ }
}

export function tempFilePath(fileName) {
  return path.join(TEMP_STORAGE_DIR, fileName);
}

export function tempFileExists(fileName) {
  return fs.access(tempFilePath(fileName)).then(() => true).catch(() => false);
}
