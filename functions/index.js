import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
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

async function verifiedPartner(req) {
  const bearer = String(req.headers.authorization || "").match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) throw Object.assign(new Error("Please sign in to share a love photo."), { statusCode: 401 });
  let decoded;
  try { decoded = await getAuth().verifyIdToken(bearer); }
  catch { throw Object.assign(new Error("Your session expired. Sign in again and retry."), { statusCode: 401 }); }
  if (!allowedEmails.has(String(decoded.email || "").toLowerCase())) throw Object.assign(new Error("This account cannot share photos to the couple group."), { statusCode: 403 });
  return decoded;
}

const validDayKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const profileKeyFor = email => String(email).toLowerCase() === "akabeeram@gmail.com" ? "kebyy" : "shazy";

export const telegramLovePhoto = onRequest({
  region: "us-central1",
  secrets: [telegramBotToken],
  maxInstances: 2
}, async (req, res) => {
  const origin = String(req.headers.origin || "");
  if (["https://our-little-world-e9cbb.web.app", "https://our-little-world-e9cbb.firebaseapp.com"].includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.status(204).send("");
  try {
    const decoded = await verifiedPartner(req);
    if (req.method === "GET") {
      const dayKey = String(req.query.dayKey || "");
      const profileKey = String(req.query.profileKey || "");
      if (!validDayKey(dayKey) || !["kebyy", "shazy"].includes(profileKey)) return res.status(400).json({ error: "Photo details are invalid." });
      const privateRef = getFirestore().doc(`couples/our-little-world/privateLoveChallengePhotos/${dayKey}`);
      const privateData = (await privateRef.get()).data();
      const uploads = privateData?.uploads || {};
      const bothUploaded = Boolean(uploads.kebyy?.fileId && uploads.shazy?.fileId);
      if (!bothUploaded && profileKey !== profileKeyFor(decoded.email)) return res.status(423).json({ error: "Both partners need to upload before reveal." });
      const fileId = uploads[profileKey]?.fileId;
      if (!fileId) return res.status(404).json({ error: "No photo is waiting for that partner today." });
      const telegramInfo = await fetch(`https://api.telegram.org/bot${telegramBotToken.value()}/getFile?file_id=${encodeURIComponent(fileId)}`);
      const telegramFile = await telegramInfo.json();
      if (!telegramInfo.ok || !telegramFile.ok || !telegramFile.result?.file_path) throw new Error(telegramFile.description || "Could not retrieve the Telegram photo.");
      const photoResponse = await fetch(`https://api.telegram.org/file/bot${telegramBotToken.value()}/${telegramFile.result.file_path}`);
      if (!photoResponse.ok) throw new Error("Telegram could not return the photo.");
      res.set("Content-Type", photoResponse.headers.get("content-type") || "application/octet-stream");
      res.set("Cache-Control", "private, no-store");
      return res.status(200).send(Buffer.from(await photoResponse.arrayBuffer()));
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    const { file, caption } = await parseMultipart(req);
    const extension = (file.filename.split(".").pop() || "").toLowerCase();
    const inferredType = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp", avif: "image/avif", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp" }[extension];
    const mimeType = file.mimeType?.startsWith("image/") ? file.mimeType : inferredType;
    if (!mimeType) return res.status(400).json({ error: "Choose a supported photo file." });
    const dayKey = String(req.query.dayKey || "");
    if (!validDayKey(dayKey)) return res.status(400).json({ error: "Photo date is invalid." });
    const profileKey = profileKeyFor(decoded.email);
    const privateRef = getFirestore().doc(`couples/our-little-world/privateLoveChallengePhotos/${dayKey}`);
    const previous = (await privateRef.get()).data()?.uploads?.[profileKey];
    if (previous?.fileId) return res.status(200).json({ ok: true, alreadyUploaded: true });
    const form = new FormData();
    form.append("chat_id", telegramChatId);
    form.append("document", new Blob([file.buffer], { type: mimeType }), file.filename);
    form.append("caption", `${caption}\n${new Date().toISOString()}`);
    const telegram = await fetch(`https://api.telegram.org/bot${telegramBotToken.value()}/sendDocument`, { method: "POST", body: form });
    const result = await telegram.json();
    if (!telegram.ok || !result.ok) throw new Error(result.description || "Telegram could not accept the photo.");
    const message = result.result;
    const telegramFileId = message?.document?.file_id || message?.photo?.at(-1)?.file_id;
    if (!telegramFileId) throw new Error("Telegram accepted the photo but did not return its file reference.");
    await privateRef.set({ dayKey, uploads: { [profileKey]: { fileId: telegramFileId, uploadedAtMs: Date.now() } } }, { merge: true });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram love photo forwarding failed:", error);
    return res.status(error.statusCode || 502).json({ error: error.message || "Could not forward this photo." });
  }
});
