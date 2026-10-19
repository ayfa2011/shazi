export const $ = (s, root = document) => root.querySelector(s); export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (v = "") => String(v).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));

export function toast(msg) {
  const el = $("#toast");
  if (el) {
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2400);
  }
}

export function toastError(msg) {
  console.error(msg);
  toast("⚠️ " + msg);
}

export function todayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find(x => x.type === "year").value}-${parts.find(x => x.type === "month").value}-${parts.find(x => x.type === "day").value}`;
}

export function scheduleDubaiDayRollover(callback) {
  const [year, month, day] = todayKey().split("-").map(Number);
  const nextMidnight = Date.UTC(year, month - 1, day + 1) - 4 * 60 * 60 * 1000;
  return setTimeout(callback, Math.max(0, nextMidnight - Date.now() + 50));
}

export function dailyIndex(length, date = new Date()) {
  if (!length) return 0;
  const day = Date.parse(`${todayKey(date)}T00:00:00Z`) / 86400000;
  return Math.floor(day) % length;
}

/** Downscale + compress an image file before upload. Returns a File (or the original). */
export function compressImageFile(file, options = {}) {
  const maxDimension = options.maxDimension || 1600;
  const quality = options.quality || 0.72;
  const mimeType = options.mimeType || "image/jpeg";
  if (!file || typeof file.type !== "string" || !file.type.startsWith("image/")) {
    return Promise.resolve(file);
  }
  if (file.type === "image/svg+xml" || file.size < 150 * 1024) return Promise.resolve(file);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (result) => { URL.revokeObjectURL(url); resolve(result); };
    img.onload = () => {
      try {
        const w = img.width || 1, h = img.height || 1;
        const scale = Math.min(1, maxDimension / Math.max(w, h));
        if (scale >= 1 && file.type === "image/jpeg" && file.size < 900 * 1024) return done(file);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return done(file);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) return done(file);
          const name = String(file.name || "photo.jpg").replace(/\.[a-z0-9]+$/i, "") + ".jpg";
          done(new File([blob], name, { type: mimeType }));
        }, mimeType, quality);
      } catch { done(file); }
    };
    img.onerror = () => done(file);
    img.src = url;
    setTimeout(() => done(file), 8000);
  });
}

/** Tiny (~12KB) blurred placeholder for blur-up instant rendering. */
export function tinyBlurPlaceholder(file, size = 24) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith("image/")) return resolve("");
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (result) => { URL.revokeObjectURL(url); resolve(result); };
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = Math.max(1, Math.round(size * ((img.height || 1) / (img.width || 1))));
        const ctx = canvas.getContext("2d");
        if (!ctx) return done("");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        done(canvas.toDataURL("image/jpeg", 0.5));
      } catch { done(""); }
    };
    img.onerror = () => done("");
    img.src = url;
    setTimeout(() => done(""), 8000);
  });
}

export function generateThumbnail(file, maxDimension = 720) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve("");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => resolve("");
      img.src = e.target.result;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

/* Lazily hydrate image placeholders via IntersectionObserver. */
export function lazyHydrateImages(root, resolve, options = {}) {
  const scope = root || document;
  const rootMargin = options.rootMargin || "200px";
  scope.querySelectorAll("img[data-thumb]:not([data-thumb-painted])").forEach(img => {
    const thumb = img.getAttribute("data-thumb");
    if (!thumb) return;
    img.dataset.thumbPainted = "1";
    img.style.background = "url('" + thumb + "') center/cover";
    img.style.filter = "blur(8px)";
    img.style.transition = "filter .35s ease";
  });
  const clearBlur = (img) => {
    img.style.filter = "";
    img.addEventListener("load", () => { img.style.background = ""; }, { once: true });
  };
  const pending = Array.from(scope.querySelectorAll(
    "img[data-lazy-file-id]:not([src]), img[data-memory-file-id]:not([src]), img[data-telegram-file-id]:not([src]), img[data-drawing-file-id]:not([src])"
  ));
  if (!pending.length) return () => {};
  const maxConcurrent = Math.max(1, Number(options.concurrency) || 4);
  const queue = [];
  let active = 0;
  let stopped = false;
  const pump = () => {
    while (!stopped && active < maxConcurrent && queue.length) {
      const img = queue.shift();
      active += 1;
      void load(img).finally(() => { active -= 1; pump(); });
    }
  };
  const load = async (img) => {
    if (stopped || !img.isConnected || img.dataset.hydrating || img.src) return;
    img.dataset.hydrating = "1";
    try {
      const url = await resolve({
        fileId: img.dataset.lazyFileId || img.dataset.memoryFileId || img.dataset.telegramFileId || img.dataset.drawingFileId || "",
        mime: img.dataset.lazyMime || img.dataset.memoryMime || img.dataset.telegramMime || img.dataset.drawingMime || "image/jpeg",
        kind: img.dataset.memoryKind || "photo",
        el: img
      });
      if (!img.isConnected) return;
      if (url) { img.src = url; clearBlur(img); }
    } catch (error) {
      console.warn("Lazy image could not load:", error);
    } finally {
      delete img.dataset.hydrating;
    }
  };
  if (!("IntersectionObserver" in window)) {
    queue.push(...pending);
    pump();
    return () => { stopped = true; queue.length = 0; };
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      queue.push(entry.target);
    });
    pump();
  }, { rootMargin });
  pending.forEach(img => observer.observe(img));
  return () => { stopped = true; queue.length = 0; observer.disconnect(); };
}
