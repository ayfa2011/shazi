import { $, esc, toast, generateThumbnail, lazyHydrateImages } from "./utils.js";
import { watchItems, addItem, removeItem, setItem, addMemoryMedia, removeMemoryMedia, notifyPartnerSafely } from "./firestore.js";
import { getProfileKey } from "./profile-data.js";
import { getTelegramMediaUrl, getTelegramMediaBlob, getCachedThumb, setCachedThumb, sendToTelegram, telegramMediaReferences, telegramUploadMimeType, deleteTelegramGalleryMessage } from "../src/services/telegramService.js";

let stopMemories = null;
let active = false;
let removeMemoryEscapeListener = null;
let memoryLoadTimer = null;
let memoryWatchGeneration = 0;
let lightboxLoadGeneration = 0;
const MEMORY_PHOTO_MAX_BYTES = 1.5 * 1024 * 1024;
const memoryThumbHydrators = new WeakMap();
const activeMemoryThumbHydrators = new Set();

function memoryMediaMime(item, isVideo = false) {
  const declared = item?.mimeType || item?.photoMimeType || item?.telegramMimeType || "";
  if (declared && declared !== "application/octet-stream") return declared;
  const extension = String(item?.name || "").split(".").pop().toLowerCase();
  const byExtension = {
    mov: "video/quicktime", mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", "3gp": "video/3gpp",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", gif: "image/gif", avif: "image/avif"
  }[extension];
  return byExtension || (isVideo ? "video/mp4" : "image/jpeg");
}

function isUsableMediaUrl(url) {
  return typeof url === "string" && /^(https?:|data:image\/)/i.test(url);
}

async function prepareMemoryPhoto(file) {
  const extension = String(file.name || "").split(".").pop().toLowerCase();
  const extensionFormat = ["heic", "heif", "tif", "tiff", "bmp"].includes(extension);
  if (!file.type.startsWith("image/") && !extensionFormat) return file;
  const needsJpeg = /image\/(heic|heif|tiff|bmp)/i.test(file.type) || extensionFormat;
  if (file.size <= MEMORY_PHOTO_MAX_BYTES && !needsJpeg) return file;
  if (/image\/(gif|svg\+xml)/i.test(file.type)) {
    throw new Error("This animated or vector image is over 1.5 MB. Please choose a smaller file to keep it unchanged.");
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (!needsJpeg) {
      console.warn("Memory photo compression unavailable; uploading original file.");
      return file;
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const probe = new Image();
        probe.onload = () => resolve(probe);
        probe.onerror = () => reject(new Error("This iPhone photo format could not be read. Please export it as JPEG and try again."));
        probe.src = objectUrl;
      });
      bitmap = { width: image.naturalWidth, height: image.naturalHeight, close() {}, draw: (context, width, height) => context.drawImage(image, 0, 0, width, height) };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  try {
    const canvas = document.createElement("canvas");
    const maxDimensionScale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const scales = [1, 0.86, 0.72, 0.58];
    const qualities = [0.88, 0.78, 0.68];
    for (const reduction of scales) {
      const scale = maxDimensionScale * reduction;
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("Could not prepare this photo. Please try another image.");
      if (bitmap.draw) bitmap.draw(context, canvas.width, canvas.height);
      else context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of qualities) {
        const outputType = needsJpeg ? "image/jpeg" : "image/webp";
        const blob = await new Promise(resolve => canvas.toBlob(resolve, outputType, quality));
        if (blob?.type === outputType && blob.size <= MEMORY_PHOTO_MAX_BYTES) {
          const baseName = (file.name || "memory-photo").replace(/\.[^.]+$/, "");
          const suffix = needsJpeg ? "jpg" : "webp";
          return new File([blob], `${baseName}.${suffix}`, { type: blob.type, lastModified: file.lastModified || Date.now() });
        }
      }
    }
  } finally {
    bitmap.close?.();
  }
  // If compression cannot produce a valid target, retain the original file.
  if (needsJpeg) throw new Error("This iPhone photo could not be converted to a compatible format. Please export it as JPEG and try again.");
  return file;
}

function parseLocalMemoryDate(dateStr) {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(dateStr);
}

export function renderMemories(el, user, profile) {
  stopMemories?.();
  clearTimeout(memoryLoadTimer);
  removeMemoryEscapeListener?.();
  removeMemoryEscapeListener = null;
  active = true;

  el.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Quicksand:wght@500;600;700&family=Noto+Sans+Kannada:wght@400;600&display=swap');

      /* ───────── Tokens (shared by page, modals, lightbox) ───────── */
      .memories-page, .mem-modal-overlay, .memory-image-lightbox { --hand: "Caveat", "Noto Sans Kannada", "Bradley Hand", cursive; --ui: "Quicksand", "Noto Sans Kannada", system-ui, sans-serif; --ink: #5b3447; --ink2: #7a5a69; --muted: #ad8a9a; --rasp: #d6457a; --bubble: #ff8fb3; --blush: #ffd6e4; --milk: #fff3f7; --ln: #f8dbe6; font-family: var(--ui); }

      /* ───────── Page ───────── */
      .memories-page { position: relative; isolation: isolate; max-width: 980px; margin: 0 auto; padding: 0 2px 34px; color: var(--ink); overflow-x: clip; }
      .memories-page, .memories-page * { box-sizing: border-box; }
      .memories-page button { -webkit-tap-highlight-color: transparent; font-family: inherit; }
      .memories-page::before { content: ""; position: absolute; inset: -10px -14px 0; z-index: -1; pointer-events: none; background: radial-gradient(circle at 90% 4%, #ffc9dc99, #ffc9dc00 38%), radial-gradient(circle at 4% 52%, #ffe6d29e, #ffe6d200 34%), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='52' height='52'%3E%3Cpath d='M26 37s-10-6.2-10-12.4a5.4 5.4 0 0 1 10-2.8 5.4 5.4 0 0 1 10 2.8C36 30.8 26 37 26 37z' fill='%23ff8fb3' fill-opacity='.14'/%3E%3C/svg%3E"); -webkit-mask-image: linear-gradient(#000 60%, transparent); mask-image: linear-gradient(#000 60%, transparent); }

      /* ───────── Banner header ───────── */
      .memories-heading { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 2px 0 8px; padding: 20px 16px 18px 20px; border-radius: 28px; background: linear-gradient(135deg, #ffa6c4 0%, #ff7fa8 55%, #f0629a 100%); color: #fff; box-shadow: 0 18px 34px -14px #d6457a88, inset 0 1px 0 #ffffff66; animation: mem-drop .6s cubic-bezier(.2, .9, .3, 1) both; }
      .memories-heading::before, .memories-heading::after { content: ""; position: absolute; border-radius: 50%; background: #ffffff1f; pointer-events: none; }
      .memories-heading::before { top: -60px; right: -40px; width: 150px; height: 150px; }
      .memories-heading::after { right: 70px; bottom: -50px; width: 90px; height: 90px; }
      .memories-heading-copy { min-width: 0; position: static; }
      .memories-eyebrow { margin: 0 0 2px; color: #fff; font-family: var(--hand); font-size: 20px; font-weight: 500; letter-spacing: .01em; opacity: .92; }
      .memories-heading h1 { margin: 0; color: #fff; font-family: var(--hand); font-size: clamp(38px, 11vw, 54px); font-weight: 700; line-height: .95; letter-spacing: 0; text-shadow: 0 3px 0 #d6457a55, 0 8px 22px #b3265a40; }
      .memories-heading h1 span { display: inline-block; color: #fff; font-family: sans-serif; font-size: .5em; vertical-align: .35em; animation: mem-beat 2.4s ease-in-out infinite; }
      .memories-meta-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin-top: 12px; }
      .memories-count { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border: 1px solid #ffffff66; border-radius: 999px; background: #ffffff2e; color: #fff; font-size: 11.5px; font-weight: 700; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
      .memories-count::before { content: "♡"; font-size: 12px; }
      .memories-since { color: #fff; font-family: var(--hand); font-size: 19px; line-height: 1; opacity: .92; }
      .memories-float { position: absolute; bottom: 6px; color: #fff; font-size: 12px; opacity: 0; pointer-events: none; animation: mem-float 6s ease-in infinite; }
      .memories-float:nth-child(1) { left: 42%; animation-delay: 0s; }
      .memories-float:nth-child(2) { left: 50%; font-size: 16px; animation-delay: 1.1s; }
      .memories-float:nth-child(3) { left: 58%; font-size: 9px; animation-delay: 2.3s; }
      .memories-float:nth-child(4) { left: 34%; font-size: 10px; animation-delay: 3.2s; }
      .memories-float:nth-child(5) { left: 66%; font-size: 14px; animation-delay: 4.1s; }
      .memories-float:nth-child(6) { left: 26%; font-size: 13px; animation-delay: 4.9s; }
      .add-memory-btn { position: relative; z-index: 1; overflow: hidden; flex: none; display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px 10px 10px; border: 0; border-radius: 999px; background: #fff; color: var(--rasp); box-shadow: 0 10px 22px -8px #8f1f4f66; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: transform .25s cubic-bezier(.34, 1.56, .64, 1), box-shadow .25s ease; }
      .add-memory-btn::after { content: ""; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 30%, #ffd6e6aa 50%, transparent 70%); transform: translateX(-120%); transition: transform .6s ease; }
      .add-memory-btn:hover { transform: translateY(-2px) scale(1.04); }
      .add-memory-btn:hover::after { transform: translateX(120%); }
      .add-memory-btn:active { transform: scale(.95); }
      .add-memory-icon { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 50%; background: linear-gradient(135deg, #ff8fb3, #d6457a); color: #fff; font-size: 16px; line-height: 1; transition: transform .35s cubic-bezier(.34, 1.56, .64, 1); }
      .add-memory-btn:hover .add-memory-icon { transform: rotate(90deg); }

      /* ───────── Polaroid wall ───────── */
      .memories-shelf { position: relative; padding: 0; }
      .memories-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 22px 14px; padding: 20px 4px 8px; }
      .memories-grid > * { min-width: 0; }
      .memory-item { position: relative; display: flex; flex-direction: column; width: 100%; min-width: 0; aspect-ratio: auto; padding: 8px 8px 11px; overflow: visible; border: 0; border-radius: 16px; background: #fff; box-shadow: 0 12px 24px -10px #d6457a4d, 0 2px 5px #d6457a14; color: inherit; font-family: inherit; text-align: left; cursor: pointer; appearance: none; rotate: var(--tilt, 0deg); transition: transform .3s cubic-bezier(.34, 1.56, .64, 1), rotate .3s ease, box-shadow .25s ease; animation: mem-rise .55s cubic-bezier(.2, .9, .3, 1.15) backwards; animation-delay: calc(var(--i, 0) * 60ms); }
      .memory-item:nth-child(4n+1) { --tilt: -1.4deg; }
      .memory-item:nth-child(4n+2) { --tilt: 1.1deg; }
      .memory-item:nth-child(4n+3) { --tilt: -.7deg; }
      .memory-item:nth-child(4n) { --tilt: 1.6deg; }
      .memory-item:hover, .memory-item:focus-visible { transform: translateY(-6px) scale(1.03); rotate: 0deg; z-index: 2; box-shadow: 0 22px 34px -12px #d6457a66, 0 0 0 3px #ffe3ee; }
      .memory-item:active { transform: scale(.97); }
      .memory-item:focus-visible { outline: 2px solid var(--rasp); outline-offset: 4px; }
      .memory-tape { display: block; position: absolute; top: -9px; left: 50%; z-index: 3; width: 58px; height: 18px; translate: -50% 0; rotate: -3deg; border-radius: 3px; background: repeating-linear-gradient(45deg, #ffc7da99 0 6px, #ffe3ecb3 6px 12px); box-shadow: 0 1px 2px #d6457a22; }
      .memory-item:nth-child(even) .memory-tape { rotate: 3deg; background: repeating-linear-gradient(45deg, #ffe0c799 0 6px, #fff1e4b3 6px 12px); }
      .memory-item:nth-child(3n) .memory-tape { background: repeating-linear-gradient(45deg, #e3d3f799 0 6px, #f3ebfdb3 6px 12px); }
      .memory-thumb-box { position: relative; inset: auto; display: grid; width: 100%; height: auto; aspect-ratio: 1 / 1; place-items: center; overflow: hidden; border-radius: 11px; background: linear-gradient(135deg, #fff1f6 0%, #ffd6e4 55%, #ffe6d2 100%); color: #e0799c; font-size: 32px; }
      .memory-item.is-hero { grid-column: 1 / -1; }
      .memory-item.is-hero .memory-thumb-box { aspect-ratio: 16 / 10; }
      .memory-thumb-box img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; opacity: 0; transition: opacity .5s ease, transform .5s ease; }
      .memory-thumb-box img[src] { opacity: 1; }
      .memory-thumb-box.has-broken-media::before { content: "♡"; position: absolute; z-index: 1; color: #e0799c; font-size: 30px; }
      .memory-item:hover .memory-thumb-box img { transform: scale(1.06); }
      .memory-thumb-box::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(to top, #d6457a1f, #d6457a00 45%); box-shadow: inset 0 0 0 1px #ffffff80; pointer-events: none; }
      .memory-badge { position: absolute; top: 8px; left: 8px; z-index: 2; padding: 4px 11px; border-radius: 999px; background: linear-gradient(135deg, #ff8fb3, #d6457a); color: #fff; font-size: 10.5px; font-weight: 700; letter-spacing: .02em; box-shadow: 0 6px 14px -4px #d6457a88; animation: mem-pulse 2.8s ease-in-out infinite; }
      .memory-meta { position: static; display: block; overflow: hidden; margin: 9px 4px 0; color: var(--ink); font-family: var(--hand); font-size: 22px; font-weight: 700; line-height: 1.1; text-overflow: ellipsis; text-shadow: none; white-space: nowrap; }
      .memory-item.is-hero .memory-meta { font-size: 28px; }
      .memory-item small { position: static; display: block; overflow: hidden; margin: 3px 4px 0; color: var(--muted); font-size: 10.5px; font-weight: 600; line-height: 1.2; text-overflow: ellipsis; text-shadow: none; white-space: nowrap; }
      .memory-item small i { display: inline; margin-right: 4px; color: var(--rasp); font-style: normal; }
      .memory-video-indicator { position: absolute; top: 9px; right: 9px; z-index: 2; display: grid; width: 30px; height: 30px; place-items: center; border: 1px solid #ffffffa0; border-radius: 50%; background: #d6457a99; color: #fff; font-size: 12px; backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); }
      #load-more-memories { grid-column: 1 / -1; justify-self: center; margin-top: 4px; }
      .memory-soft-btn { padding: 10px 20px; border: 1.5px solid #ffc9dc; border-radius: 999px; background: #fff; color: var(--rasp); font-size: 12.5px; font-weight: 700; cursor: pointer; transition: transform .25s cubic-bezier(.34, 1.56, .64, 1), background .2s ease; }
      .memory-soft-btn:hover { transform: translateY(-2px) scale(1.04); background: #fff0f5; }
      .memories-empty { grid-column: 1 / -1; margin: 0; padding: 40px 18px; border: 2px dashed #ffc2d6; border-radius: 26px; background: #ffffffb3; color: var(--ink2); font-size: 14px; line-height: 1.8; text-align: center; }
      .memories-empty span { display: block; margin-bottom: 8px; color: var(--bubble); font-size: 40px; animation: mem-beat 2.4s ease-in-out infinite; }
      .memories-empty .memory-soft-btn { margin-top: 12px; }
      .memory-skeleton { pointer-events: none; rotate: 0deg; animation: none; }
      .memory-skeleton .skeleton-shape { background: linear-gradient(100deg, #ffe6ef 30%, #fff6f9 50%, #ffe6ef 70%) 0 0 / 220% 100%; animation: mem-shimmer 1.4s linear infinite; }
      .memory-skeleton .memory-skeleton-photo { position: relative; inset: auto; width: 100%; aspect-ratio: 1; border-radius: 11px; }
      .memory-skeleton .memory-skeleton-title { position: static; height: 16px; margin: 12px 4px 0; border-radius: 8px; }
      .memory-skeleton .memory-skeleton-date { position: static; width: 42%; height: 9px; margin: 8px 4px 0; border-radius: 6px; }

      /* ───────── Modals ───────── */
      .mem-modal-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(91, 52, 71, .46); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px); }
      .mem-modal-box { position: relative; width: min(420px, 100%); max-height: min(92dvh, 780px); overflow-y: auto; padding: 22px 20px 20px; border: 1px solid #ffe0ec; border-radius: 28px; background: linear-gradient(175deg, #fff 0%, #fff6f9 100%); box-shadow: 0 28px 80px #5b344760; animation: memory-view-arrive .45s cubic-bezier(.2, .9, .3, 1.1); }
      .mem-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
      .mem-modal-head h3 { margin: 0; color: var(--rasp); font-family: var(--hand); font-size: 34px; font-weight: 700; line-height: 1; }
      .mem-modal-close { display: grid; width: 34px; height: 34px; place-items: center; border: 0; border-radius: 50%; background: #ffe6ef; color: var(--rasp); font-size: 20px; line-height: 1; cursor: pointer; transition: transform .25s cubic-bezier(.34, 1.56, .64, 1); }
      .mem-modal-close:hover { transform: rotate(90deg) scale(1.1); }
      .mem-label { display: block; margin-top: 4px; color: var(--ink2); font-size: 12px; font-weight: 700; }
      .mem-modal-box input, .mem-modal-box textarea { width: 100%; padding: 11px 14px; margin: 6px 0 12px; border: 1.5px solid #fbd9e5; border-radius: 15px; background: #fff; color: var(--ink); font-family: inherit; font-size: 14px; outline: none; transition: border-color .2s ease, box-shadow .2s ease; }
      .mem-modal-box input:focus, .mem-modal-box textarea:focus { border-color: var(--bubble); box-shadow: 0 0 0 4px #ffe3ee; }
      .mem-modal-box input[type="file"] { padding: 8px; border-style: dashed; background: #fff8fb; font-size: 12px; }
      .mem-modal-box input[type="file"]::file-selector-button { margin-right: 10px; padding: 7px 14px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #ff8fb3, #d6457a); color: #fff; font-weight: 700; cursor: pointer; }
      .mem-modal-box textarea { resize: vertical; min-height: 84px; line-height: 1.6; }
      .mem-modal-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
      .mem-btn { padding: 11px 18px; border: 0; border-radius: 999px; font-size: 13px; font-weight: 700; cursor: pointer; transition: transform .25s cubic-bezier(.34, 1.56, .64, 1), opacity .18s ease; }
      .mem-btn:hover { transform: translateY(-2px) scale(1.04); }
      .mem-btn:active { transform: scale(.96); }
      .mem-btn:disabled { opacity: .6; cursor: wait; }
      .mem-btn-ghost { border: 1.5px solid #fbd9e5; background: #fff; color: var(--ink2); }
      .mem-btn-danger { background: #ffe3e6; color: #d93a50; }
      .mem-btn-primary { background: linear-gradient(135deg, #ff8fb3 0%, #d6457a 100%); color: #fff; box-shadow: 0 10px 20px -6px #d6457a80; }

      /* ───────── Memory viewer ───────── */
      .mem-view-overlay { padding: 16px; }
      .memory-view-card { position: relative; width: min(560px, 100%); max-height: min(94dvh, 860px); overflow-y: auto; padding: 12px 12px 10px; border: 1px solid #ffe0ec; border-radius: 30px; background: linear-gradient(170deg, #fff 0%, #fff6f9 70%, #fff0f4 100%); box-shadow: 0 30px 90px #5b34476b; animation: memory-view-arrive .45s cubic-bezier(.2, .9, .3, 1.1); }
      .memory-view-card::before { content: ""; position: absolute; top: 4px; left: 50%; z-index: 6; width: 76px; height: 22px; translate: -50% 0; rotate: -2deg; border-radius: 3px; background: repeating-linear-gradient(45deg, #ffc7dacc 0 7px, #ffe3ecd9 7px 14px); pointer-events: none; }
      @keyframes memory-view-arrive { from { opacity: 0; transform: translateY(20px) scale(.93); } 60% { opacity: 1; transform: translateY(-3px) scale(1.01); } to { opacity: 1; transform: translateY(0) scale(1); } }
      .memory-view-close { position: absolute; top: 22px; right: 22px; z-index: 7; display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid #ffffffa0; border-radius: 50%; background: #d6457a99; color: #fff; font-size: 22px; line-height: 1; cursor: pointer; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: transform .25s cubic-bezier(.34, 1.56, .64, 1); }
      .memory-view-close:hover { transform: rotate(90deg) scale(1.1); }
      .memory-view-photo { position: relative; display: grid; width: 100%; aspect-ratio: 16 / 10; min-height: 170px; max-height: 40dvh; overflow: hidden; place-items: center; border-radius: 20px; background: linear-gradient(145deg, #ffe8f0, #ffd6e4); box-shadow: 0 12px 26px -12px #d6457a66; }
      .memory-view-main { display: block; width: 100%; height: 100%; object-fit: cover; }
      img.memory-view-main { cursor: zoom-in; }
      video.memory-view-main { background: #2a1620; }
      .memory-view-date { position: absolute; bottom: 12px; left: 12px; z-index: 3; display: inline-flex; align-items: center; gap: 6px; margin: 0; padding: 7px 13px; border: 1px solid #ffffffb3; border-radius: 999px; background: #fffffff0; color: var(--rasp); font-size: 11.5px; font-weight: 700; box-shadow: 0 6px 16px -6px #d6457a66; }
      .memory-view-placeholder { color: var(--bubble); font-size: 56px; animation: mem-beat 2.4s ease-in-out infinite; }
      .memory-view-copy { position: relative; padding: 16px 12px 10px; text-align: left; }
      .memory-view-title { margin: 0; color: var(--ink); font-family: var(--hand); font-size: clamp(32px, 9vw, 42px); font-weight: 700; line-height: 1.05; overflow-wrap: anywhere; text-decoration: underline wavy #ffb3cc 2px; text-underline-offset: 7px; }
      .memory-view-title::after { content: ""; }
      .memory-quote { max-width: 500px; margin: 14px 0 0; padding: 11px 14px; border-left: 3px solid var(--bubble); border-radius: 0 16px 16px 0; background: #fff0f5; color: var(--ink2); font-family: inherit; font-size: 14.5px; font-style: normal; font-weight: 500; line-height: 1.7; overflow-wrap: anywhere; white-space: pre-wrap; }
      .memory-quote-mark { display: none; }
      .memory-quote-empty { color: var(--muted); }
      .memory-gallery { padding: 12px; border: 1px solid #ffe0ec; border-radius: 22px; background: #fff3f8; }
      .memory-gallery-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 11px; }
      .memory-gallery-title { min-width: 0; margin: 0; color: var(--ink); font-size: 15px; font-weight: 700; }
      .memory-gallery-count { display: block; margin-top: 3px; color: var(--muted); font-size: 10.5px; font-weight: 600; }
      .memory-add-photos { flex: none; padding: 8px 14px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #ff8fb3, #d6457a); color: #fff; font-size: 11.5px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 16px -6px #d6457a80; transition: transform .25s cubic-bezier(.34, 1.56, .64, 1); }
      .memory-add-photos:hover { transform: translateY(-2px) scale(1.05); }
      .memory-add-photos:disabled { opacity: .6; }
      .memory-media-input { display: none; }
      .memory-gallery-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      .memory-gallery-item { position: relative; display: block; width: 100%; aspect-ratio: 1; padding: 0; overflow: hidden; border: 2px solid #fff; border-radius: 14px; background: #ffe3ee; box-shadow: 0 6px 14px -8px #d6457a80; cursor: pointer; transition: transform .25s cubic-bezier(.34, 1.56, .64, 1); }
      .memory-gallery-item:hover { transform: scale(1.06) rotate(-1.5deg); z-index: 2; }
      .memory-gallery-item img { display: block; width: 100%; height: 100%; object-fit: cover; }
      .memory-gallery-item.has-broken-media::before { content: "♡"; position: absolute; inset: 0; z-index: 1; display: grid; place-items: center; color: #e0799c; font-size: 25px; }
      .memory-gallery-video-poster, .memory-card-video-poster { position: absolute; inset: 0; display: grid; place-items: center; background: linear-gradient(145deg, #ffe3ee, #ece0fb); color: var(--rasp); font-size: 26px; }
      .memory-gallery-video-poster.has-cached-poster, .memory-card-video-poster.has-cached-poster { background-position: center; background-size: cover; color: transparent; }
      .memory-gallery-item .memory-video-indicator { top: auto; right: auto; bottom: 50%; left: 50%; transform: translate(-50%, 50%); }
      .memory-view-edit { display: inline-flex; margin: 16px auto 2px; padding: 7px 16px; border: 1.5px solid #ffc9dc; border-radius: 999px; background: #fff; color: var(--rasp); font-size: 11.5px; font-weight: 700; cursor: pointer; transition: transform .25s cubic-bezier(.34, 1.56, .64, 1), background .2s ease; }
      .memory-view-edit:hover, .memory-view-edit:focus-visible { transform: translateY(-2px); background: #fff0f5; }
      .memory-view-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 8px 6px; padding-top: 12px; border-top: 2px dotted #ffc9dc; }
      .memory-nav-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 105px; padding: 9px 14px; border: 1.5px solid #ffc9dc; border-radius: 999px; background: #fff; color: var(--rasp); font: 700 11.5px/1.2 inherit; cursor: pointer; transition: transform .25s cubic-bezier(.34, 1.56, .64, 1), background .2s ease; }
      .memory-nav-btn:hover:not(:disabled) { transform: translateY(-2px) scale(1.04); background: #fff0f5; }
      .memory-nav-btn:disabled { opacity: .35; cursor: not-allowed; }
      .memory-nav-position { color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .08em; white-space: nowrap; }
      .memory-image-lightbox { position: fixed; inset: 0; z-index: 1100; display: none; align-items: center; justify-content: center; padding: env(safe-area-inset-top, 12px) env(safe-area-inset-right, 12px) env(safe-area-inset-bottom, 12px) env(safe-area-inset-left, 12px); background: #2a1220f0; touch-action: pan-x pan-y pinch-zoom; }
      .memory-image-lightbox[aria-hidden="false"] { display: flex; }
      .memory-image-lightbox img, .memory-image-lightbox video { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; border-radius: 12px; box-shadow: 0 14px 50px #0007; touch-action: pan-x pan-y pinch-zoom; }
      .memory-image-lightbox img { transition: transform .18s ease; transform-origin: center; }
      .memory-image-lightbox video { width: 100%; max-height: calc(100dvh - 36px); background: #080608; }
      .memory-image-lightbox-close { position: absolute; top: max(14px, env(safe-area-inset-top, 14px)); right: max(14px, env(safe-area-inset-right, 14px)); width: 42px; height: 42px; border: 1px solid #ffffff66; border-radius: 50%; background: #ff8fb34d; color: #fff; font-size: 25px; cursor: pointer; }
      .memory-lightbox-actions { position: absolute; right: 12px; bottom: max(12px, env(safe-area-inset-bottom, 12px)); left: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; }
      .memory-lightbox-delete { height: 34px; min-width: 0; padding: 0 14px; border: 1px solid #ffffff66; border-radius: 999px; background: #d6457acc; color: #fff; font: 700 12px/1 inherit; cursor: pointer; backdrop-filter: blur(8px); }

      /* ───────── Animations ───────── */
      @keyframes mem-drop { from { opacity: 0; transform: translateY(-14px) scale(.97); } to { opacity: 1; transform: none; } }
      @keyframes mem-rise { from { opacity: 0; translate: 0 26px; scale: .93; } to { opacity: 1; translate: 0 0; scale: 1; } }
      @keyframes mem-beat { 0%, 100% { transform: scale(1); } 14% { transform: scale(1.2); } 28% { transform: scale(1); } 42% { transform: scale(1.13); } 70% { transform: scale(1); } }
      @keyframes mem-float { 0% { opacity: 0; transform: translateY(6px) scale(.8); } 20% { opacity: .85; } 100% { opacity: 0; transform: translateY(-58px) scale(1.15); } }
      @keyframes mem-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
      @keyframes mem-shimmer { to { background-position: -220% 0; } }
      @keyframes mem-sheet { from { transform: translateY(100%); } to { transform: translateY(0); } }

      /* ───────── Responsive ───────── */
      @media (min-width: 720px) {
        .memories-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 26px 20px; }
        .memory-item.is-hero { grid-column: span 2; }
        .memory-item.is-hero .memory-thumb-box { aspect-ratio: 4 / 3; }
        .memories-heading { padding: 26px 26px 24px 28px; }
      }
      @media (max-width: 600px) {
        .memories-heading { gap: 8px; padding: 18px 12px 16px 16px; }
        .add-memory-btn { gap: 6px; padding: 9px 13px 9px 9px; font-size: 11.5px; }
        .add-memory-icon { width: 22px; height: 22px; font-size: 15px; }
        .mem-add-overlay { align-items: flex-end; padding: 0; }
        .mem-add-overlay .mem-modal-box { width: 100%; max-height: 94dvh; border-radius: 28px 28px 0 0; animation: mem-sheet .4s cubic-bezier(.2, .9, .3, 1); }
        .memory-view-card { padding: 10px 10px 8px; border-radius: 26px; }
        .memory-view-close { top: 18px; right: 18px; width: 32px; height: 32px; }
        .memory-view-photo { max-height: 36dvh; }
        .memory-view-nav { margin: 5px 3px 4px; gap: 7px; }
        .memory-nav-btn { min-width: 0; padding: 9px 11px; font-size: 10.5px; }
      }
      @media (max-width: 360px) {
        .memories-heading h1 { font-size: 34px; }
        .memory-meta { font-size: 19px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .memories-page *, .memories-heading, .memory-view-card, .mem-modal-box { animation: none !important; transition: none !important; }
      }
    </style>

    <div class="memories-page">
      <header class="memories-heading">
        <div class="memories-heading-copy">
          <span class="memories-float" aria-hidden="true">♡</span>
          <span class="memories-float" aria-hidden="true">✿</span>
          <span class="memories-float" aria-hidden="true">♡</span>
          <span class="memories-float" aria-hidden="true">✧</span>
          <span class="memories-float" aria-hidden="true">♡</span>
          <span class="memories-float" aria-hidden="true">✿</span>
          <p class="memories-eyebrow">our story, in little moments ✿</p>
          <h1>Our Memories <span>♡</span></h1>
          <div class="memories-meta-row">
            <span id="memories-count" class="memories-count" aria-live="polite">Loading…</span>
            <span id="memories-since" class="memories-since"></span>
          </div>
        </div>
        <button id="add-mem-btn" class="add-memory-btn"><span class="add-memory-icon">＋</span><span>Add memory</span></button>
      </header>
      <section class="memories-shelf" aria-label="Our saved memories">
        <div id="memories-grid-container" class="memories-grid" aria-busy="true" aria-label="Loading memories">
          ${Array.from({ length: 4 }, () => `<div class="memory-item memory-skeleton" aria-hidden="true"><div class="skeleton-shape memory-skeleton-photo"></div><div class="skeleton-shape memory-skeleton-title"></div><div class="skeleton-shape memory-skeleton-date"></div></div>`).join("")}
        </div>
      </section>
    </div>

    <!-- Add/Edit Memory Modal -->
    <div id="add-mem-modal" class="mem-modal-overlay mem-add-overlay" style="display: none;">
      <div class="mem-modal-box">
        <div class="mem-modal-head">
          <h3 id="mem-modal-title">Add Memory ♡</h3>
          <button id="close-mem-modal" class="mem-modal-close" type="button" aria-label="Close">×</button>
        </div>
        <form id="add-mem-form">
          <input type="hidden" id="mem-edit-id">
          <label class="mem-label">Title / Place</label>
          <input type="text" id="mem-title" placeholder="e.g. Sunset at Beach" required>

          <label class="mem-label">Date of Memory</label>
          <input type="date" id="mem-date" required>

          <label class="mem-label">Photo (Optional)</label>
          <input type="file" id="mem-photo" accept="image/*,video/*">

          <label class="mem-label">Note</label>
          <textarea id="mem-note" rows="3" placeholder="Write a short memory note..."></textarea>

          <div class="mem-modal-actions">
            <button type="button" id="delete-mem-btn" class="mem-btn mem-btn-danger" style="display:none;">Delete</button>
            <div style="display:flex; gap:8px; margin-left:auto;">
              <button type="button" id="cancel-mem-btn" class="mem-btn mem-btn-ghost">Cancel</button>
              <button type="submit" id="save-mem-submit" class="mem-btn mem-btn-primary">Save ♡</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Lightbox Modal -->
    <div id="view-mem-modal" class="mem-modal-overlay mem-view-overlay" style="display: none;">
      <article class="memory-view-card" role="dialog" aria-modal="true" aria-labelledby="view-mem-title">
        <button id="close-view-modal" class="memory-view-close" type="button" aria-label="Close memory">×</button>
        <div id="view-mem-img-wrap" class="memory-view-photo">
          <div class="memory-view-placeholder" aria-hidden="true">♡</div>
          <p id="view-mem-date" class="memory-view-date"></p>
        </div>
        <div class="memory-view-copy">
          <h2 id="view-mem-title" class="memory-view-title">Memory</h2>
          <span class="memory-quote-mark" aria-hidden="true">“</span>
          <p id="view-mem-note" class="memory-quote"></p>
          <button id="view-mem-edit-btn" class="memory-view-edit" type="button">Edit memory</button>
        </div>
        <section class="memory-gallery" aria-labelledby="memory-gallery-heading">
          <header class="memory-gallery-head">
            <h3 class="memory-gallery-title" id="memory-gallery-heading">Photos and videos<span class="memory-gallery-count" id="memory-gallery-count">0 photos and 0 videos</span></h3>
            <button class="memory-add-photos" id="memory-add-photos" type="button">＋ Add Photos</button>
            <input class="memory-media-input" id="memory-media-input" type="file" accept="image/*,video/*" multiple aria-label="Add photos or videos to this memory">
          </header>
          <div class="memory-gallery-grid" id="memory-gallery-grid"></div>
        </section>
        <nav class="memory-view-nav" aria-label="Memory navigation">
          <button id="memory-prev-btn" class="memory-nav-btn" type="button" aria-label="Previous memory">← Previous</button>
          <span id="memory-nav-position" class="memory-nav-position" aria-live="polite"></span>
          <button id="memory-next-btn" class="memory-nav-btn" type="button" aria-label="Next memory">Next →</button>
        </nav>
      </article>
    </div>
    <div id="memory-image-lightbox" class="memory-image-lightbox" role="dialog" aria-modal="true" aria-label="Full size memory photo" aria-hidden="true">
      <button id="memory-image-lightbox-close" class="memory-image-lightbox-close" type="button" aria-label="Close full size photo">×</button>
      <div class="memory-lightbox-actions">
        <button id="memory-lightbox-delete" class="memory-lightbox-delete" type="button">Delete Photo</button>
      </div>
      <img id="memory-image-lightbox-img" alt="Full size memory photo">
      <video id="memory-image-lightbox-video" controls playsinline webkit-playsinline preload="metadata" style="display:none" aria-label="Full size memory video"></video>
    </div>
  `;

  const addModal = $("#add-mem-modal", el);
  const viewModal = $("#view-mem-modal", el);
  const form = $("#add-mem-form", el);
  const mediaInput = $("#memory-media-input", el);
  const mediaGrid = $("#memory-gallery-grid", el);
  const imageLightbox = $("#memory-image-lightbox", el);
  const lightboxImage = $("#memory-image-lightbox-img", el);
  const lightboxVideo = $("#memory-image-lightbox-video", el);
  let activeMemoryForView = null;
  let selectedGalleryMedia = null;
  let lightboxMediaKey = "";
  let lightboxTouchStart = null;
  let lightboxGalleryIndex = -1;

  function openAddModal(item = null) {
    form.reset();
    if (item) {
      $("#mem-modal-title", el).textContent = "Edit Memory ♡";
      $("#mem-edit-id", el).value = item.id;
      $("#mem-title", el).value = item.title || "";
      $("#mem-date", el).value = item.rawDate || "";
      $("#mem-note", el).value = item.note || "";
      $("#delete-mem-btn", el).style.display = "block";
    } else {
      $("#mem-modal-title", el).textContent = "Add New Memory ♡";
      $("#mem-edit-id", el).value = "";
      $("#delete-mem-btn", el).style.display = "none";
    }
    addModal.style.display = "flex";
  }

  $("#add-mem-btn", el).onclick = () => openAddModal();
  $("#close-mem-modal", el).onclick = () => (addModal.style.display = "none");
  $("#cancel-mem-btn", el).onclick = () => (addModal.style.display = "none");
  $("#close-view-modal", el).onclick = () => (viewModal.style.display = "none");
  $("#memory-image-lightbox-close", el).onclick = closeImageLightbox;
  imageLightbox.onclick = event => {
    if (event.target === imageLightbox) closeImageLightbox();
  };
  imageLightbox.addEventListener("touchstart", event => {
    if (event.touches.length !== 1) { lightboxTouchStart = null; return; }
    const touch = event.touches[0];
    lightboxTouchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  imageLightbox.addEventListener("touchend", event => {
    if (!lightboxTouchStart || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - lightboxTouchStart.x;
    const dy = touch.clientY - lightboxTouchStart.y;
    lightboxTouchStart = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy)) return;
    void moveLightboxGallery(dx < 0 ? 1 : -1);
  }, { passive: true });

  function closeImageLightbox() {
    lightboxLoadGeneration++;
    imageLightbox.setAttribute("aria-hidden", "true");
    lightboxImage.removeAttribute("src");
    lightboxImage.style.display = "none";
    lightboxVideo.pause();
    lightboxVideo.removeAttribute("src");
    lightboxVideo.load();
    lightboxVideo.style.display = "none";
    lightboxMediaKey = "";
    lightboxGalleryIndex = -1;
    lightboxImage.style.transform = "scale(1)";
  }

  function openImageLightbox(image) {
    lightboxLoadGeneration++;
    lightboxVideo.pause();
    lightboxVideo.removeAttribute("src");
    lightboxVideo.style.display = "none";
    lightboxImage.style.display = "block";
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt || "Full size memory photo";
      const source = selectedGalleryMedia || activeMemoryForView || {};
    lightboxMediaKey = source.telegramFileId || source.url || "";
    const memory = activeMemoryForView || {};
    const additional = Array.isArray(memory.mediaItems) ? memory.mediaItems : [];
    const allMedia = [
      ...(memory.photoUrl || memory.telegramFileId ? [{ type: memory.mediaType || "photo", url: memory.photoUrl, telegramFileId: memory.telegramFileId, mimeType: memory.photoMimeType, name: memory.title }] : []),
      ...additional
    ];
    lightboxGalleryIndex = allMedia.findIndex(item => (item.telegramFileId || item.url) === (selectedGalleryMedia?.telegramFileId || selectedGalleryMedia?.url || lightboxMediaKey));
    if (lightboxGalleryIndex < 0 && allMedia.length) lightboxGalleryIndex = 0;
    updateLightboxActions();
    imageLightbox.setAttribute("aria-hidden", "false");
    $("#memory-image-lightbox-close", el).focus();
  }

  async function openGalleryMediaLightbox(item) {
    if (!item) return;
    const loadGeneration = ++lightboxLoadGeneration;
    const memory = activeMemoryForView || {};
    const allMedia = [
      ...(memory.photoUrl || memory.telegramFileId ? [{ type: memory.mediaType || "photo", url: memory.photoUrl, telegramFileId: memory.telegramFileId, mimeType: memory.photoMimeType, name: memory.title }] : []),
      ...(Array.isArray(memory.mediaItems) ? memory.mediaItems : [])
    ];
    lightboxGalleryIndex = allMedia.findIndex(media => (media.telegramFileId || media.url) === (item.telegramFileId || item.url));
    lightboxMediaKey = item.telegramFileId || item.url || "";
    updateLightboxActions(item.type === "video");
    imageLightbox.setAttribute("aria-hidden", "false");
    lightboxImage.removeAttribute("src");
    lightboxImage.style.display = "none";
    lightboxVideo.pause();
    lightboxVideo.removeAttribute("src");
    if (item.type === "video") {
      lightboxVideo.style.display = "block";
      lightboxVideo.setAttribute("aria-label", item.name || "Memory video");
      const url = isUsableMediaUrl(item.url) && !item.telegramFileId ? item.url : item.telegramFileId ? await getTelegramMediaUrl(item.telegramFileId, memoryMediaMime(item, true)) : "";
      if (loadGeneration !== lightboxLoadGeneration || imageLightbox.getAttribute("aria-hidden") === "true") return;
      if (!url) { closeImageLightbox(); toast("This video is missing its media link."); return; }
      lightboxVideo.src = url;
      lightboxVideo.load();
      // Starting playback after the authenticated media URL resolves avoids
      // the empty-frame race on mobile browsers. Inline playback attributes
      // keep the same player usable on both iOS Safari and Android WebView.
      lightboxVideo.playsInline = true;
      lightboxVideo.setAttribute("playsinline", "");
      lightboxVideo.setAttribute("webkit-playsinline", "");
      void lightboxVideo.play().catch(() => {});
    } else {
      lightboxVideo.style.display = "none";
      const url = isUsableMediaUrl(item.url) && !item.telegramFileId ? item.url : item.telegramFileId ? await getTelegramMediaUrl(item.telegramFileId, memoryMediaMime(item)) : "";
      if (loadGeneration !== lightboxLoadGeneration || imageLightbox.getAttribute("aria-hidden") === "true") return;
      if (!url) { closeImageLightbox(); toast("This photo is missing its media link."); return; }
      lightboxImage.style.display = "block";
      lightboxImage.src = url;
      lightboxImage.alt = item.name || "Full size memory photo";
    }
    $("#memory-image-lightbox-close", el).focus();
  }

  function updateLightboxActions(video = selectedGalleryMedia?.type === "video") {
    $("#memory-lightbox-delete", el).style.display = lightboxMediaKey ? "inline-flex" : "none";
    $("#memory-lightbox-delete", el).textContent = video ? "Delete Video" : "Delete Photo";
  }

  async function moveLightboxGallery(direction) {
    const memory = activeMemoryForView || {};
    const allMedia = [
      ...(memory.photoUrl || memory.telegramFileId ? [{ type: memory.mediaType || "photo", url: memory.photoUrl, telegramFileId: memory.telegramFileId, mimeType: memory.photoMimeType, name: memory.title }] : []),
      ...(Array.isArray(memory.mediaItems) ? memory.mediaItems : [])
    ];
    const photos = allMedia.filter(item => item.type !== "video");
    if (photos.length < 2) return;
    const current = allMedia[lightboxGalleryIndex];
    let index = photos.findIndex(item => (item.telegramFileId || item.url) === (current?.telegramFileId || current?.url));
    if (index < 0) index = 0;
    const item = photos[(index + direction + photos.length) % photos.length];
    selectedGalleryMedia = item;
    renderMemoryHero(memory, item);
    await openGalleryMediaLightbox(item);
  }

  function onMemoryLightboxKeydown(event) {
    if (imageLightbox.getAttribute("aria-hidden") !== "false") return;
    if (event.key === "ArrowRight") { event.preventDefault(); void moveLightboxGallery(1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); void moveLightboxGallery(-1); }
    else if (event.key === "Escape") closeImageLightbox();
  }
  imageLightbox.addEventListener("keydown", onMemoryLightboxKeydown);
  $("#memory-lightbox-delete", el).onclick = async () => {
    const memory = activeMemoryForView;
    const key = lightboxMediaKey;
    if (!memory?.id || !key) return;
    const mediaLabel = selectedGalleryMedia?.type === "video" ? "video" : "photo";
    if (!confirm(`Delete this ${mediaLabel} from the memory?`)) return;
    const deleteButton = $("#memory-lightbox-delete", el);
    deleteButton.disabled = true;
    try {
      const result = await removeMemoryMedia(memory.id, key);

      // Attempt to remove from Telegram
      const mediaToRemove = (memory.mediaItems || []).find(item => (item.telegramFileId || item.url) === key) ||
                            ((memory.telegramFileId === key || memory.photoUrl === key) ? memory : null);
      if (mediaToRemove?.telegramChatId && mediaToRemove?.telegramMessageId) {
          try {
              const deleted = await deleteTelegramGalleryMessage(mediaToRemove.telegramChatId, mediaToRemove.telegramMessageId);
              if (!deleted) console.info("The media was removed from the memory, but Telegram kept its copy.");
          } catch (tgErr) {
              console.warn("Telegram file deletion failed, but removed from database:", tgErr);
          }
      }

      const mediaItems = result.mediaItems;
      const nextMemory = { ...memory, mediaItems };
      if (memory.telegramFileId === key || memory.photoUrl === key) {
        delete nextMemory.telegramFileId;
        delete nextMemory.photoUrl;
        delete nextMemory.mediaType;
        delete nextMemory.photoMimeType;
      }
      const update = item => item.id === memory.id ? nextMemory : item;
      allMemories = allMemories.map(update);
      sortedMemories = sortedMemories.map(update);
      activeMemoryForView = nextMemory;
      const removedIndex = (memory.mediaItems || []).findIndex(item => (item.telegramFileId || item.url) === key);
      if (removedIndex >= 0) {
        const remaining = mediaItems[Math.min(removedIndex, mediaItems.length - 1)] || null;
        selectedGalleryMedia = remaining;
      } else selectedGalleryMedia = null;
      closeImageLightbox();
      renderMemoryHero(nextMemory, selectedGalleryMedia);
      renderMemoryGallery(nextMemory);
      toast(result.removed ? `${mediaLabel === "video" ? "Video" : "Photo"} deleted from this memory.` : "This media was already removed.");
    } catch (error) {
      console.error("Could not delete memory media:", error);
      toast("Could not delete this media. Please try again.");
    } finally {
      deleteButton.disabled = false;
    }
  };

  $("#delete-mem-btn", el).onclick = async () => {
    const editId = $("#mem-edit-id", el).value;
    if (editId && confirm("Are you sure you want to delete this memory?")) {
      try {
        await removeItem(editId);
        toast("Memory deleted");
        addModal.style.display = "none";
        viewModal.style.display = "none";
      } catch (err) {
        console.error(err);
        toast("Could not delete memory");
      }
    }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = $("#save-mem-submit", el);
    submitBtn.disabled = true;
    const editId = $("#mem-edit-id", el).value;

    const title = $("#mem-title", el).value.trim();
    const dateVal = $("#mem-date", el).value;
    const note = $("#mem-note", el).value.trim();
    const fileInput = $("#mem-photo", el);
    const file = fileInput.files?.[0];

    let isVideo = false;
    try {
      let mediaMetadata = {};
      if (file) {
        isVideo = file.type.startsWith("video/");
        const timestamp = new Date().toLocaleString();
        const uploadFile = isVideo ? file : await prepareMemoryPhoto(file);
        const videoPoster = isVideo ? await createVideoThumbnail(file).catch(() => "") : "";
        const result = await sendToTelegram(uploadFile, `New Memory Uploaded 💖 · ${profile?.name || "Partner"} · ${timestamp}`);
        const references = telegramMediaReferences(result);
        if (videoPoster) void setCachedThumb(references.telegramFileId, videoPoster);
        mediaMetadata = { ...references, photoMimeType: references.telegramMimeType || telegramUploadMimeType(uploadFile) };
      }

      let formattedDate = "";
      if (dateVal) {
        const d = parseLocalMemoryDate(dateVal);
        formattedDate = d.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric"
        });
      }

      const payload = {
        title,
        date: formattedDate,
        rawDate: dateVal,
        note
      };

      if (file) payload.mediaType = isVideo ? "video" : "image";
      if (file) payload.photoUrl = "";
      Object.assign(payload, mediaMetadata);

      if (editId) {
        await setItem(editId, payload);
        toast("Memory updated ♡");
      } else {
        const payloadData = { ...payload, author: user.uid };
        const memoryRef = await addItem("memory", payloadData);
        // Optimistically add to allMemories
        const newMemory = { id: memoryRef.id, ...payloadData, author: user.uid, createdAt: { toMillis: () => Date.now() }, isOptimistic: true };
        allMemories = [newMemory, ...allMemories];
        renderGrid();

        const profileKey = getProfileKey(profile);
        if (profileKey) void notifyPartnerSafely(profileKey, "memory", `${profile?.name || "Your partner"} added a new memory.`, memoryRef.id, "memories");
        toast("Memory saved ♡");
      }

      addModal.style.display = "none";
      form.reset();
    } catch (err) {
      console.error(err);
      toast(err.message || "Could not save memory.");
    } finally {
      submitBtn.disabled = false;
    }
  };

  let allMemories = [];
  let sortedMemories = [];
  let activeMemoryIndex = -1;

  function showMemoryAt(index) {
    if (!sortedMemories.length) return;
    activeMemoryIndex = (index + sortedMemories.length) % sortedMemories.length;
    const mem = sortedMemories[activeMemoryIndex];
    activeMemoryForView = mem;
    $("#view-mem-title", el).textContent = mem.title || "Our Memory";

    selectedGalleryMedia = null;
    renderMemoryHero(mem);
    renderMemoryGallery(mem);
    const note = $("#view-mem-note", el);
    note.textContent = mem.note || "A little moment, kept close.";
    note.classList.toggle("memory-quote-empty", !mem.note);
    $("#memory-nav-position", el).textContent = `${activeMemoryIndex + 1} / ${sortedMemories.length}`;
    $("#memory-prev-btn", el).disabled = sortedMemories.length < 2;
    $("#memory-next-btn", el).disabled = sortedMemories.length < 2;
    viewModal.style.display = "flex";
  }

  function renderMemoryHero(memory, selected = null) {
    const imgWrap = $("#view-mem-img-wrap", el);
    imgWrap.onclick = event => {
      const image = event.target.closest("img.memory-view-main");
      if (image) { openImageLightbox(image); return; }
      const video = event.target.closest("video.memory-view-main");
      if (video && selected) void openGalleryMediaLightbox(selected);
    };
    imgWrap.onkeydown = event => {
      const image = event.target.closest("img.memory-view-main");
      if (!image || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      openImageLightbox(image);
    };
    const isVideo = selected?.type === "video" || (!selected && memory.mediaType === "video");
    const mediaUrl = selected?.telegramFileId ? "" : isUsableMediaUrl(selected?.url) ? selected.url : !selected && !memory.telegramFileId && isUsableMediaUrl(memory.photoUrl) ? memory.photoUrl : "";
    const fileId = selected?.telegramFileId || (!selected ? memory.telegramFileId : "");
    const mimeType = memoryMediaMime(selected || memory, isVideo);
    imgWrap.querySelectorAll(".memory-view-main,.memory-view-placeholder").forEach(node => node.remove());
    if (isVideo && (mediaUrl || fileId)) {
      const video = document.createElement("video");
      video.className = "memory-view-main";
      video.controls = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.preload = "metadata";
      video.setAttribute("aria-label", selected?.name || "Memory video");
      video.setAttribute("controlslist", "nodownload");
      video.setAttribute("webkit-playsinline", "");
      if (mediaUrl) video.src = mediaUrl;
      else getTelegramMediaUrl(fileId, mimeType).then(url => {
        if (video.isConnected) {
          video.src = url;
          video.load();
        }
      }).catch(error => console.error("Memory video could not load:", error));
      video.addEventListener("error", () => {
        console.error("Memory video playback failed", video.error, { mimeType, mediaUrl });
        if (video.error?.code === 4) toast("This video codec is not supported on this iPhone. Try an MP4 (H.264) copy.");
      }, { once: true });
      imgWrap.prepend(video);
    } else if (mediaUrl || fileId) {
      const image = document.createElement("img");
      image.className = "memory-view-main";
      if (mediaUrl) image.src = mediaUrl;
      else getTelegramMediaUrl(fileId, mimeType).then(url => { if (image.isConnected) image.src = url; }).catch(error => console.error("Memory photo could not load:", error));
      image.alt = memory.title || "A shared memory";
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.setAttribute("aria-label", `View full-size photo: ${memory.title || "A shared memory"}`);
      image.decoding = "async";
      imgWrap.prepend(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "memory-view-placeholder";
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.textContent = "♡";
      imgWrap.prepend(placeholder);
    }
    const dateBadge = $("#view-mem-date", el);
    dateBadge.textContent = memory.date ? `♡  ${memory.date}` : "A moment to remember";
  }

  function renderMemoryGallery(memory) {
    const media = Array.isArray(memory.mediaItems) ? memory.mediaItems : [];
    const primaryIsVideo = memory.mediaType === "video";
    const hasPrimaryMedia = Boolean(memory.photoUrl || memory.telegramFileId);
    const photos = media.filter(item => item.type !== "video").length + (hasPrimaryMedia && !primaryIsVideo ? 1 : 0);
    const videos = media.filter(item => item.type === "video").length + (hasPrimaryMedia && primaryIsVideo ? 1 : 0);
    $("#memory-gallery-count", el).textContent = `${photos} ${photos === 1 ? "photo" : "photos"} and ${videos} ${videos === 1 ? "video" : "videos"}`;
    mediaGrid.innerHTML = media.map((item, index) => {
      const isVideo = item.type === "video";
      const thumbnail = isUsableMediaUrl(item.thumbnailUrl) ? item.thumbnailUrl : (!isVideo && isUsableMediaUrl(item.url) ? item.url : "");
      if (!thumbnail && !item.telegramFileId && !item.url) return "";
      const thumbnailMarkup = thumbnail
        ? `<img src="${esc(thumbnail)}" alt="" loading="lazy" decoding="async">`
        : isVideo
          ? `<span class="memory-gallery-video-poster"${item.telegramFileId ? ` data-memory-thumb-id="${esc(item.telegramFileId)}"` : ""} aria-hidden="true">▶</span>`
          : item.telegramFileId
            ? `<img data-memory-file-id="${esc(item.telegramFileId)}" data-memory-mime="${esc(memoryMediaMime(item))}" data-memory-kind="photo" alt="" loading="lazy" decoding="async">`
            : `<span class="memory-gallery-video-poster" aria-hidden="true">♡</span>`;
      return `<button class="memory-gallery-item" type="button" data-media-index="${index}" aria-label="Open full-size ${isVideo ? "video" : "photo"}${item.name ? `: ${esc(item.name)}` : ""}">${thumbnailMarkup}${isVideo ? `<span class="memory-video-indicator" aria-hidden="true">▶</span>` : ""}</button>`;
    }).join("");
    mediaGrid.querySelectorAll("[data-media-index]").forEach(button => {
      button.onclick = () => {
        selectedGalleryMedia = media[Number(button.dataset.mediaIndex)] || null;
        if (selectedGalleryMedia) {
          renderMemoryHero(memory, selectedGalleryMedia);
          void openGalleryMediaLightbox(selectedGalleryMedia).catch(error => { console.error("Could not open memory media:", error); toast("Could not open this media. Please try again."); });
        }
      };
    });
    hydrateMemoryThumbnails(mediaGrid);
  }

  function hydrateMemoryThumbnails(container) {
    // Cached compact thumbnails paint immediately; full media stays deferred
    // until a memory is opened or a thumbnail enters the viewport.
    const previousStop = memoryThumbHydrators.get(container);
    previousStop?.();
    if (previousStop) activeMemoryThumbHydrators.delete(previousStop);
    container.querySelectorAll("img").forEach(image => {
      if (image.dataset.memoryFallbackBound) return;
      image.dataset.memoryFallbackBound = "1";
      image.addEventListener("error", () => {
        image.style.display = "none";
        image.parentElement?.classList.add("has-broken-media");
      }, { once: true });
    });
    void paintCachedThumbs(container);
    const stop = lazyHydrateImages(container, async ({ fileId, mime }) => {
      const cached = await getCachedThumb(fileId);
      if (cached?.kind === "thumbnail" && cached.dataUrl) return cached.dataUrl;
      const blob = await getTelegramMediaBlob(fileId, mime);
      const thumbnail = await generateThumbnail(blob, 480);
      if (thumbnail) {
        void setCachedThumb(fileId, thumbnail, "thumbnail");
        return thumbnail;
      }
      return getTelegramMediaUrl(fileId, mime);
    }, { concurrency: 3 });
    const stopAndForget = () => { stop(); activeMemoryThumbHydrators.delete(stopAndForget); };
    memoryThumbHydrators.set(container, stopAndForget);
    activeMemoryThumbHydrators.add(stopAndForget);
  }

  async function paintCachedThumbs(container) {
    const pending = Array.from(container.querySelectorAll("img[data-memory-file-id]:not([src]), [data-memory-thumb-id]"));
    await Promise.all(pending.map(async (image) => {
      try {
        const record = await getCachedThumb(image.dataset.memoryFileId || image.dataset.memoryThumbId);
        const dataUrl = record?.dataUrl;
        if (dataUrl && image.isConnected && (!image.matches("img") || !image.src)) {
          if (image.matches("img") && record.kind === "thumbnail") {
            image.src = dataUrl;
          } else {
            image.style.background = `url('${dataUrl}') center/cover`;
          }
          if (image.matches("img") && record.kind !== "thumbnail") {
            image.style.filter = "blur(8px)";
            image.style.transition = "filter .35s ease";
          }
          image.classList.add("has-cached-poster");
        }
      } catch { /* thumbnails are best-effort */ }
    }));
  }

  $("#memory-add-photos", el).onclick = () => {
    if (!activeMemoryForView) return;
    mediaInput.click();
  };

  mediaInput.onchange = async () => {
    const files = [...(mediaInput.files || [])];
    const memory = activeMemoryForView;
    mediaInput.value = "";
    if (!memory || !files.length) return;
    const addButton = $("#memory-add-photos", el);
    addButton.disabled = true;
    addButton.textContent = "Uploading…";
    try {
      const uploadedMedia = [];
      const failedFiles = [];
      // Chunk uploads to avoid browser/network limits
      for (let i = 0; i < files.length; i += 3) {
        const chunk = files.slice(i, i + 3);
        const settled = await Promise.allSettled(chunk.map(async file => {
          const type = file.type.startsWith("video/") ? "video" : "photo";
          const createdAtMs = Date.now();
          const timestamp = new Date(createdAtMs).toLocaleString();
          // Compress before upload: prevents memory lag on sync + saves bandwidth.
          // Compress only photos over the 1.5 MB upload target. If browser
          // decoding/canvas compression fails, prepareMemoryPhoto returns original.
          const uploadFile = type === "photo" ? await prepareMemoryPhoto(file) : file;

          // Keep compact image thumbnails in IndexedDB only. Data URLs must
          // never be saved inside the Firestore memory document.
          const blurThumb = type === "photo"
            ? await generateThumbnail(uploadFile, 480).catch(() => "")
            : await createVideoThumbnail(file).catch(() => "");

          const result = await sendToTelegram(uploadFile, `New Memory Uploaded 💖 · ${profile?.name || "Partner"} · ${timestamp}`);
          const refs = telegramMediaReferences(result);
          if (blurThumb) void setCachedThumb(refs.telegramFileId, blurThumb, type === "photo" ? "thumbnail" : "preview");

          return {
            ...refs,
            // Full-size media is loaded from Telegram using telegramFileId.
            // Do not store Base64 thumbnails in Firestore (1 MiB document limit).
            type,
            mimeType: refs.telegramMimeType || telegramUploadMimeType(uploadFile),
            name: file.name || (type === "video" ? "Video" : "Photo"),
            createdAtMs
          };
        }));

        settled.forEach((r, idx) => {
          if (r.status === "fulfilled") {
            uploadedMedia.push(r.value);
          } else {
            console.error("Upload failed for", chunk[idx].name, r.reason);
            failedFiles.push(chunk[idx].name);
          }
        });
        addButton.textContent = `Uploading (${uploadedMedia.length + failedFiles.length}/${files.length})…`;
      }

      if (uploadedMedia.length > 0) {
        const current = allMemories.find(item => item.id === memory.id) || memory;
        const mediaItems = await addMemoryMedia(memory.id, uploadedMedia);
        const updateMemory = item => item.id === memory.id ? { ...item, mediaItems } : item;
        allMemories = allMemories.map(updateMemory);
        sortedMemories = sortedMemories.map(updateMemory);
        activeMemoryForView = { ...current, mediaItems };
        renderMemoryGallery(activeMemoryForView);
      }

      const message = `${uploadedMedia.length} item${uploadedMedia.length === 1 ? "" : "s"} added successfully.${failedFiles.length > 0 ? ` Failed: ${failedFiles.join(", ")}` : ""}`;
      toast(message);
    } catch (error) {
      console.error("Could not add memory media:", error);
      toast(error.message || "Could not upload media to Telegram. Please try again.");
    } finally {
      addButton.disabled = false;
      addButton.textContent = "＋ Add Photos";
    }
  };

  $("#memory-prev-btn", el).onclick = () => showMemoryAt(activeMemoryIndex - 1);
  $("#memory-next-btn", el).onclick = () => showMemoryAt(activeMemoryIndex + 1);

  function createVideoThumbnail(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const objectUrl = URL.createObjectURL(file);
      let thumbnailTimer;
      let settled = false;
      const cleanup = () => {
        if (settled) return false;
        settled = true;
        clearTimeout(thumbnailTimer);
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(objectUrl);
        return true;
      };
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      const captureFrame = () => {
        try {
          if (!video.videoWidth || !video.videoHeight) throw new Error("Video frame is not ready.");
          const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
          const width = Math.max(1, Math.round(video.videoWidth * scale));
          const height = Math.max(1, Math.round(video.videoHeight * scale));
          const thumbnail = document.createElement("canvas");
          thumbnail.width = width;
          thumbnail.height = height;
          const context = thumbnail.getContext("2d");
          if (!context) throw new Error("Could not create a video thumbnail.");
          context.drawImage(video, 0, 0, width, height);
          const dataUrl = thumbnail.toDataURL("image/jpeg", 0.68);
          if (cleanup()) resolve(dataUrl);
        } catch (error) { if (cleanup()) reject(error); }
      };
      video.onloadeddata = () => {
        if (Number.isFinite(video.duration) && video.duration > 0.4) {
          try { video.currentTime = Math.min(0.5, video.duration / 3); } catch { captureFrame(); }
        } else captureFrame();
      };
      video.onseeked = captureFrame;
      video.onerror = () => { if (cleanup()) reject(new Error("Could not read this video. Choose another file.")); };
      thumbnailTimer = setTimeout(() => { cleanup(); reject(new Error("Video preview timed out.")); }, 6000);
      video.src = objectUrl;
    });
  }

  function memoryCardHtml(item, index) {
    const isVideo = item.mediaType === "video";
    const thumbnail = item.thumbnail || "";
    const blurAttr = item.blurThumb ? ` data-thumb="${esc(item.blurThumb)}"` : "";
    const photo = isVideo
      ? `<span class="memory-card-video-poster"${item.telegramFileId ? ` data-memory-thumb-id="${esc(item.telegramFileId)}"` : ""} aria-hidden="true">▶</span>`
      : !item.telegramFileId && isUsableMediaUrl(item.photoUrl)
      ? `<img src="${esc(item.photoUrl)}" alt="" loading="lazy" decoding="async"${blurAttr} style="background:${thumbnail ? `url('${esc(thumbnail)}') center/cover` : '#f9dde8'}">`
      : item.telegramFileId
        ? `<img data-memory-file-id="${esc(item.telegramFileId)}" data-memory-mime="${esc(memoryMediaMime(item))}" data-memory-kind="photo" alt="" loading="lazy" decoding="async"${blurAttr} style="background:${thumbnail ? `url('${esc(thumbnail)}') center/cover` : '#f9dde8'}">`
      : `💖`;
    return `
      <button class="memory-item${index === 0 ? " is-hero" : ""}" type="button" data-id="${esc(item.id)}" style="--i:${index}" aria-label="Open memory: ${esc(item.title || "Our Memory")}${isVideo ? ", video" : ""}">
        <span class="memory-tape" aria-hidden="true"></span>
        <div class="memory-thumb-box">${index === 0 ? `<span class="memory-badge">✧ Latest</span>` : ""}${photo}${isVideo ? `<span class="memory-video-indicator" aria-label="Video">▶</span>` : ""}</div>
        <div class="memory-meta"><span>${esc(item.title || "Memory")}</span></div>
        ${item.date ? `<small><i>♡</i>${esc(item.date)}</small>` : ""}
      </button>`;
  }

  function renderGrid() {
    const container = $("#memories-grid-container", el);
    const count = $("#memories-count", el);
    const since = $("#memories-since", el);

    container.setAttribute("aria-busy", "false");
    if (allMemories.length === 0) {
      sortedMemories = [];
      activeMemoryIndex = -1;
      count.textContent = "Your story starts here";
      if (since) since.textContent = "";
      container.innerHTML = `<p class="memories-empty"><span>♡</span>No memories saved just yet.<br>Add one little moment to begin your collection.</p>`;
      return;
    }
    count.textContent = `${allMemories.length} ${allMemories.length === 1 ? "memory" : "memories"}`;

    sortedMemories = [...allMemories].sort((a, b) => {
      const dateA = parseLocalMemoryDate(a.rawDate || a.date);
      const dateB = parseLocalMemoryDate(b.rawDate || b.date);
      return dateB - dateA;
    });

    if (since) {
      const oldest = sortedMemories[sortedMemories.length - 1];
      since.textContent = oldest?.date && allMemories.length !== currentLimit ? `✿ since ${oldest.date}` : "";
    }

    const loadedServerCount = allMemories.filter(item => !item.isOptimistic).length;
    const visibleMemories = sortedMemories.slice(0, currentLimit);
    const canRequestMore = loadedServerCount > currentLimit;
    // Initial placeholders must be removed once the first snapshot arrives.
    // They are not pagination slots and otherwise remain below real memories.
    container.querySelectorAll(".memory-skeleton").forEach(skeleton => skeleton.remove());
    const existingCards = new Map([...container.querySelectorAll(".memory-item")].map(card => [card.dataset.id, card]));
    container.querySelectorAll(".memories-empty").forEach(node => node.remove());
    const desiredCards = visibleMemories.map((item, index) => {
      const signature = JSON.stringify([item.title, item.date, item.mediaType, item.telegramFileId, item.photoUrl, item.thumbnail, item.blurThumb]);
      let card = existingCards.get(item.id);
      if (!card || card.dataset.renderKey !== signature) {
        const template = document.createElement("template");
        template.innerHTML = memoryCardHtml(item, index).trim();
        const replacement = template.content.firstElementChild;
        replacement.dataset.renderKey = signature;
        if (card) card.replaceWith(replacement);
        card = replacement;
      }
      existingCards.delete(item.id);
      card.classList.toggle("is-hero", index === 0);
      card.style.setProperty("--i", String(index));
      card.onclick = () => {
        const currentIndex = sortedMemories.findIndex(memory => memory.id === card.dataset.id);
        if (currentIndex >= 0) {
          showMemoryAt(currentIndex);
          $("#close-view-modal", el).focus();
        }
      };
      return card;
    });
    existingCards.forEach(card => card.remove());
    desiredCards.forEach((card, index) => {
      const currentCards = container.querySelectorAll(".memory-item");
      if (currentCards[index] !== card) container.insertBefore(card, currentCards[index] || null);
    });

    let loadMore = $("#load-more-memories", el);
    if (canRequestMore) {
      if (!loadMore) {
        loadMore = document.createElement("button");
        loadMore.type = "button";
        loadMore.id = "load-more-memories";
        loadMore.className = "memory-soft-btn";
        loadMore.textContent = "Load More";
      }
      container.append(loadMore);
    } else {
      loadMore?.remove();
      loadMore = null;
    }
    if (loadMore) {
      loadMore.disabled = false;
      loadMore.textContent = "Load More";
      loadMore.onclick = () => {
        currentLimit += 20;
        renderGrid();
      };
    }
    hydrateMemoryThumbnails(container);
  }

  $("#view-mem-edit-btn", el).onclick = () => {
    if (activeMemoryForView) {
      viewModal.style.display = "none";
      openAddModal(activeMemoryForView);
    }
  };

  viewModal.onclick = (event) => {
    if (event.target === viewModal) viewModal.style.display = "none";
  };

  const closeViewOnEscape = (event) => {
    if (event.key === "Escape" && imageLightbox.getAttribute("aria-hidden") === "false") {
      closeImageLightbox();
      $("#view-mem-img-wrap img.memory-view-main", el)?.focus();
      return;
    }
    if (event.key === "Escape" && viewModal.style.display !== "none") {
      viewModal.style.display = "none";
    }
  };
  window.addEventListener("keydown", closeViewOnEscape);
  removeMemoryEscapeListener = () => window.removeEventListener("keydown", closeViewOnEscape);

  let currentLimit = 20;

  function updateWatch() {
    stopMemories?.();
    clearTimeout(memoryLoadTimer);
    const generation = ++memoryWatchGeneration;
    const showLoadError = message => {
      if (!active || !el.isConnected || generation !== memoryWatchGeneration) return;
      const container = $("#memories-grid-container", el);
      const count = $("#memories-count", el);
      if (allMemories.length) {
        // Keep loaded memories visible when pagination or background sync is offline.
        let status = $("#memory-load-status", container);
        if (!status) {
          status = document.createElement("p");
          status.id = "memory-load-status";
          status.className = "memories-empty";
          container.append(status);
        }
        status.textContent = `${message} Your saved memories are still available.`;
        return;
      }
      if (count) count.textContent = "Unable to load";
      if (container) container.innerHTML = `<p class="memories-empty"><span>♡</span>${esc(message)}<br><button type="button" id="retry-memories" class="memory-soft-btn">Try again</button></p>`;
      $("#retry-memories", el)?.addEventListener("click", () => {
        if (count) count.textContent = "Loading…";
        if (container) {
          container.innerHTML = `${Array.from({ length: 4 }, () => `<div class="memory-item memory-skeleton" aria-hidden="true"><div class="skeleton-shape memory-skeleton-photo"></div><div class="skeleton-shape memory-skeleton-title"></div><div class="skeleton-shape memory-skeleton-date"></div></div>`).join("")}`;
          container.setAttribute("aria-busy", "true");
        }
        updateWatch();
      }, { once: true });
    };
    try {
      stopMemories = watchItems("memory", (items, metadata) => {
        if (!active || !el.isConnected || generation !== memoryWatchGeneration) return;
        const incomingItems = items || [];
        const fromCache = metadata?.fromCache === true;
        if (!fromCache) {
          clearTimeout(memoryLoadTimer);
        }
        if (fromCache && incomingItems.length === 0 && allMemories.length === 0) {
          const count = $("#memories-count", el);
          const container = $("#memories-grid-container", el);
          if (count) count.textContent = "Checking for saved memories…";
          if (container) container.innerHTML = `${Array.from({ length: 4 }, () => `<div class="memory-item memory-skeleton" aria-hidden="true"><div class="skeleton-shape memory-skeleton-photo"></div><div class="skeleton-shape memory-skeleton-title"></div><div class="skeleton-shape memory-skeleton-date"></div></div>`).join("")}`;
          container?.setAttribute("aria-busy", "true");
          return;
        }
        const incomingIds = new Set(incomingItems.map(i => i.id));
        const optimisticItems = allMemories.filter(i => i.isOptimistic && !incomingIds.has(i.id));
        const serverItems = incomingItems.map(item => ({ ...item, isOptimistic: false }));
        if (fromCache) {
          const merged = new Map([...allMemories.filter(item => !item.isOptimistic), ...serverItems].map(item => [item.id, item]));
          allMemories = [...merged.values(), ...optimisticItems];
        } else {
          allMemories = [...serverItems, ...optimisticItems];
        }
        $("#memory-load-status", el)?.remove();

        if (activeMemoryForView) {
          const refreshed = allMemories.find(item => item.id === activeMemoryForView.id);
          if (refreshed) activeMemoryForView = refreshed;
        }
        renderGrid();
        if (viewModal.style.display !== "none" && activeMemoryForView) {
          renderMemoryGallery(activeMemoryForView);
        }
      }, error => {
        console.error("Memories could not be loaded:", error);
        clearTimeout(memoryLoadTimer);
        showLoadError("Memories could not be loaded. Check your connection and try again.");
      }, null, { includeMetadataChanges: true });
      memoryLoadTimer = setTimeout(() => {
        const message = allMemories.length
          ? "More memories are taking longer than expected to sync."
          : "Could not confirm saved memories. Check your connection and try again.";
        showLoadError(message);
        if (allMemories.length) renderGrid();
      }, 12000);
    } catch (error) {
      console.error("Could not start the memories listener:", error);
      showLoadError("Memories could not be loaded. Check your connection and try again.");
    }
  }
  updateWatch();
}

export function disposeMemories() {
  active = false;
  activeMemoryThumbHydrators.forEach(stop => stop());
  activeMemoryThumbHydrators.clear();
  clearTimeout(memoryLoadTimer);
  memoryWatchGeneration++;
  stopMemories?.();
  stopMemories = null;
  removeMemoryEscapeListener?.();
  removeMemoryEscapeListener = null;
}
