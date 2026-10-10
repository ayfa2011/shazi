import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import Busboy from "busboy";

initializeApp();

const telegramBotToken = defineSecret("TELEGRAM_BOT_TOKEN");
const telegramChatId = "-4865219021";
const allowedEmails = new Set(["akabeeram@gmail.com", "hizasgallery@gmail.com"]);

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 12 * 1024 * 1024, fields: 2 } });
    let file = null;
    let caption = "Love You Today";
    busboy.on("field", (name, value) => { if (name === "caption") caption = value.slice(0, 900); });
    busboy.on("file", (_name, stream, info) => {
      const chunks = [];
      stream.on("data", chunk => chunks.push(chunk));
      stream.on("limit", () => reject(new Error("Photo exceeds 12 MB.")));
      stream.on("end", () => { file = { buffer: Buffer.concat(chunks), filename: info.filename || "love-note.jpg", mimeType: info.mimeType }; });
    });
    busboy.on("error", reject);
    busboy.on("finish", () => file ? resolve({ file, caption }) : reject(new Error("Choose a photo to upload.")));
    req.pipe(busboy);
  });
}

export const telegramLovePhoto = onRequest({
  region: "us-central1",
  secrets: [telegramBotToken],
  maxInstances: 2
}, async (req, res) => {
  const origin = String(req.headers.origin || "");
  if (["https://our-little-world.web.app", "https://our-little-world.firebaseapp.com"].includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  try {
    const bearer = String(req.headers.authorization || "").match(/^Bearer (.+)$/i)?.[1];
    if (!bearer) return res.status(401).json({ error: "Please sign in to share a love photo." });
    const decoded = await getAuth().verifyIdToken(bearer);
    if (!allowedEmails.has(String(decoded.email || "").toLowerCase())) return res.status(403).json({ error: "This account cannot share photos to the couple group." });
    const { file, caption } = await parseMultipart(req);
    if (!file.mimeType?.startsWith("image/")) return res.status(400).json({ error: "Choose an image file." });
    const form = new FormData();
    form.append("chat_id", telegramChatId);
    form.append("document", new Blob([file.buffer], { type: file.mimeType }), file.filename);
    form.append("caption", `${caption}\n${new Date().toISOString()}`);
    const telegram = await fetch(`https://api.telegram.org/bot${telegramBotToken.value()}/sendDocument`, { method: "POST", body: form });
    const result = await telegram.json();
    if (!telegram.ok || !result.ok) throw new Error(result.description || "Telegram could not accept the photo.");
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram love photo forwarding failed:", error);
    return res.status(400).json({ error: error.message || "Could not forward this photo." });
  }
});
