export const $ = (s, root = document) => root.querySelector(s); export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (v = "") => String(v).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
export const uid = () => crypto.randomUUID();

export function toast(msg) {
  const el = $("#toast");
  if (el) {
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2400);
  }
}

export function todayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find(x => x.type === "year").value}-${parts.find(x => x.type === "month").value}-${parts.find(x => x.type === "day").value}`;
}

export function dailyIndex(length, date = new Date()) {
  if (!length) return 0;
  const day = Date.parse(`${todayKey(date)}T00:00:00Z`) / 86400000;
  return Math.floor(day) % length;
}

export function modal(title, body, actions = "") {
  return `<div class="modal"><div class="modal-card"><div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close>×</button></div>${body}${actions}</div></div>`;
}

/**
 * Image compression function: Accepts a File object and compresses it
 * to max 600px width/height and JPEG 0.6 quality (well below 100KB).
 */
export async function compressImage(file, maxWidth = 600, maxHeight = 600, quality = 0.6) {
  if (!file || !file.type.startsWith("image/")) return "";
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Convert canvas to compressed JPEG base64 string
        const base64Str = canvas.toDataURL("image/jpeg", quality);
        resolve(base64Str);
      };
      img.onerror = () => resolve("");
    };
    reader.onerror = () => resolve("");
  });
}