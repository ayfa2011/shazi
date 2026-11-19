import { $, esc, toast } from "./utils.js";
import { addItem, removeItem, watchItems } from "./firestore.js";
import { deleteTelegramGalleryMessage, getTelegramMediaBlob, sendToTelegram, telegramUploadMimeType } from "../src/services/telegramService.js";

let stopFolders = null;
let stopMedia = null;
let activeGallery = false;

const dateLabel = value => {
  const date = value?.toDate ? value.toDate() : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

function createVideoThumbnail(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(objectUrl); };
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    let settled = false;
    let haveMeta = false;
    let haveData = false;
    const finish = (blob) => { if (settled) return; settled = true; cleanup(); resolve(blob); };
    const fail = (err) => { if (settled) return; settled = true; cleanup(); reject(err); };
    const tryDraw = () => {
      if (settled || (!haveMeta && !haveData)) return;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      if (!width || !height) return;
      const scale = Math.min(1, 1280 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) { fail(new Error("Could not create a video preview.")); return; }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => { if (blob) finish(blob); else fail(new Error("Could not create a video preview.")); }, "image/jpeg", 0.68);
    };
    video.onloadedmetadata = () => { haveMeta = true; tryDraw(); };
    video.onloadeddata = () => { haveData = true; tryDraw(); };
    video.onerror = () => fail(new Error("Could not read this video."));
    video.src = objectUrl;
    // Android WebView can skip / delay loadedmetadata and loadeddata on blob
    // URLs, which left gallery video thumbnails permanently blank. Retry once
    // so the thumbnail is generated even when those events never fire.
    setTimeout(() => { if (!settled) tryDraw(); }, 800);
  });
}

export function renderSharedGallery(el, user, profile) {
  disposeSharedGallery();
  activeGallery = true;
  let folders = [];
  let media = [];
  let selectedFolderId = "";
  let viewerIndex = -1;
  let zoomScale = 1;
  let touchStart = null;
  let pinchStartDistance = 0;
  let pinchStartScale = 1;
  let lastTapAt = 0;
  let viewerLoadToken = 0;
  let previewObserver = null;
  const mediaBlobs = new Map();
  const mediaUrls = new Map();
  const previewUrls = new Map();

  function telegramMediaUrl(item) {
    if (item.url) return item.url; // Keep older Gallery entries viewable while new uploads use Telegram only.
    if (!item.telegramFileId) return "";
    if (!mediaBlobs.has(item.telegramFileId)) {
      mediaBlobs.set(item.telegramFileId, getTelegramMediaBlob(item.telegramFileId, item.mimeType).catch(error => {
        mediaBlobs.delete(item.telegramFileId);
        throw error;
      }));
    }
    return mediaBlobs.get(item.telegramFileId);
  }

  async function getMediaUrl(item) {
    if (item.url) return item.url;
    if (mediaUrls.has(item.telegramFileId)) return mediaUrls.get(item.telegramFileId);
    const blob = await telegramMediaUrl(item);
    const url = URL.createObjectURL(blob);
    mediaUrls.set(item.telegramFileId, url);
    return url;
  }

  function observePreviews() {
    previewObserver?.disconnect();
    const images = [...el.querySelectorAll("img[data-gallery-preview]")];
    const load = async image => {
      const item = media.find(entry => entry.id === image.dataset.galleryPreview);
      if (!item) return;
      const sourceUrl = item.thumbnailUrl || item.url || previewUrls.get(item.id);
      if (sourceUrl) { image.src = sourceUrl; return; }
      try {
        const blob = await telegramMediaUrl(item);
        let preview = blob;
        if (item.mediaType === "video") {
          if (!previewUrls.has(item.id)) previewUrls.set(item.id, URL.createObjectURL(await createVideoThumbnail(blob)));
          image.src = previewUrls.get(item.id);
        } else {
          image.src = await getMediaUrl(item);
        }
      } catch (error) {
        console.warn("Gallery preview could not load:", error);
        image.closest(".gallery-media-card,.gallery-folder-card")?.classList.add("preview-unavailable");
      }
    };
    if ("IntersectionObserver" in window) {
      previewObserver = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        previewObserver.unobserve(entry.target);
        void load(entry.target);
      }), { rootMargin: "160px" });
      images.forEach(image => previewObserver.observe(image));
    } else images.forEach(image => void load(image));
  }

  el.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&family=Noto+Sans+Kannada:wght@400;600&display=swap');

      /* ───────── Tokens ───────── */
      .shared-gallery, .gallery-viewer { --ui: "Quicksand", "Noto Sans Kannada", system-ui, sans-serif; --ink: #5b3447; --ink2: #8a6577; --muted: #b48fa0; --rasp: #d6457a; --bubble: #ff8fb3; --blush: #ffe3ee; font-family: var(--ui); }

      /* ───────── Page ───────── */
      .shared-gallery { box-sizing: border-box; max-width: 760px; margin: 0 auto; padding: 6px 12px 120px; color: var(--ink); -webkit-tap-highlight-color: transparent; }
      .shared-gallery *, .shared-gallery *::before, .shared-gallery *::after { box-sizing: border-box; }
      .shared-gallery button { font-family: inherit; -webkit-tap-highlight-color: transparent; }

      /* Large-title header, like a phone Photos app */
      .gallery-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin: 0 2px 14px; }
      .gallery-heading-copy { min-width: 0; }
      .gallery-back { display: inline-flex; align-items: center; gap: 2px; margin: 0 0 4px -6px; padding: 6px 10px 6px 6px; border: 0; border-radius: 999px; background: transparent; color: var(--rasp); font-size: 14px; font-weight: 700; cursor: pointer; transition: background .2s ease, transform .2s ease; }
      .gallery-back:active { background: #ffe3ee; transform: scale(.95); }
      .gallery-eyebrow { display: none; }
      .gallery-heading h1 { margin: 0; overflow: hidden; color: var(--ink); font: 700 clamp(30px, 9vw, 40px)/1.1 var(--ui); letter-spacing: -.02em; text-overflow: ellipsis; white-space: nowrap; }
      .gallery-heading h1::after { content: "♡"; margin-left: 8px; color: var(--bubble); font-size: .6em; vertical-align: .15em; display: inline-block; animation: gal-beat 2.6s ease-in-out infinite; }
      .gallery-primary-btn { position: relative; overflow: hidden; flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 42px; padding: 9px 16px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #ff8fb3, #d6457a); color: #fff; font-size: 12.5px; font-weight: 700; box-shadow: 0 10px 20px -8px #d6457a99; cursor: pointer; transition: transform .25s cubic-bezier(.34, 1.56, .64, 1), box-shadow .25s ease, opacity .2s ease; }
      .gallery-primary-btn:active { transform: scale(.94); }
      .gallery-primary-btn:disabled { opacity: .7; cursor: wait; }

      /* Create-folder sheet */
      .gallery-folder-form { display: flex; gap: 8px; margin: 0 0 16px; padding: 12px; border: 1px solid #ffe0ec; border-radius: 22px; background: linear-gradient(160deg, #fff, #fff3f8); box-shadow: 0 14px 30px -18px #d6457a80; animation: gal-drop .35s cubic-bezier(.2, .9, .3, 1.1); }
      .gallery-folder-form[hidden], .gallery-folder-page[hidden], .gallery-folder-list[hidden], #gallery-create-open[hidden] { display: none; }
      .gallery-folder-form input { flex: 1; min-width: 0; min-height: 42px; padding: 9px 15px; border: 1.5px solid #fbd9e5; border-radius: 999px; background: #fff; color: var(--ink); font: 600 14px var(--ui); outline: none; transition: border-color .2s ease, box-shadow .2s ease; }
      .gallery-folder-form input:focus { border-color: var(--bubble); box-shadow: 0 0 0 4px #ffe3ee; }

      /* ───────── Albums (folder list) ───────── */
      .gallery-folder-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px 16px; padding: 14px 2px 0; }
      .gallery-empty { grid-column: 1 / -1; padding: 40px 18px; border: 2px dashed #ffc2d6; border-radius: 26px; background: #ffffffb3; color: var(--ink2); text-align: center; font-size: 14px; font-weight: 600; line-height: 1.7; }
      .gallery-empty span { display: block; margin-bottom: 8px; color: var(--bubble); font-size: 40px; animation: gal-beat 2.4s ease-in-out infinite; }
      .gallery-folder-card { position: relative; isolation: isolate; display: block; width: 100%; padding: 0; overflow: visible; border: 0; background: none; text-align: left; cursor: pointer; transition: transform .3s cubic-bezier(.34, 1.56, .64, 1); }
      .gallery-folder-card::before, .gallery-folder-card::after { content: ""; position: absolute; z-index: -1; aspect-ratio: 1; border-radius: 20px; }
      .gallery-folder-card::before { top: -7px; left: 7%; right: 7%; background: #ffd3e3; }
      .gallery-folder-card::after { top: -13px; left: 14%; right: 14%; background: #ffe8f1; }
      .gallery-folder-card:active { transform: scale(.96); }
      .gallery-folder-thumb { position: relative; display: block; width: 100%; aspect-ratio: 1; overflow: hidden; border-radius: 20px; background: linear-gradient(145deg, #ffe6ef, #ffd0e1); box-shadow: 0 14px 26px -12px #d6457a77, inset 0 0 0 1px #ffffff80; }
      .gallery-folder-card img { display: block; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .45s ease, transform .4s ease; }
      .gallery-folder-card img[src] { opacity: 1; }
      .gallery-folder-card:active img { transform: scale(1.04); }
      .gallery-folder-placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: var(--bubble); font-size: 42px; animation: gal-beat 2.8s ease-in-out infinite; }
      .gallery-folder-card.preview-unavailable .gallery-folder-thumb::after { content: "♡"; position: absolute; inset: 0; display: grid; place-items: center; color: var(--bubble); font-size: 38px; }
      .gallery-folder-copy { display: block; min-height: 34px; padding: 10px 4px 0; }
      .gallery-folder-copy strong { display: block; overflow: hidden; color: var(--ink); font-size: 14.5px; font-weight: 700; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
      .gallery-folder-copy small { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; font-weight: 600; line-height: 1.3; }

      /* ───────── Photo grid (inside a folder) ───────── */
      .gallery-folder-page { min-width: 0; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; animation: gal-fade .3s ease; }
      .gallery-folder-toolbar { display: block; margin: 0; }
      .gallery-folder-toolbar h2 { display: none; }
      #gallery-upload-open { position: fixed; right: 16px; bottom: calc(92px + env(safe-area-inset-bottom, 0px)); z-index: 40; min-height: 50px; padding: 12px 20px; font-size: 13.5px; box-shadow: 0 16px 30px -8px #d6457acc, inset 0 1px 0 #ffffff66; }
      .gallery-media-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px; margin: 4px -12px 0; }
      .gallery-media-card { position: relative; display: block; width: 100%; min-width: 0; aspect-ratio: 1; padding: 0; overflow: hidden; border: 0; border-radius: 0; background: #ffe3ee; cursor: pointer; transition: transform .2s ease, filter .2s ease; }
      .gallery-media-card:has(img:not([src])) { background: linear-gradient(100deg, #ffe3ee 30%, #fff5f9 50%, #ffe3ee 70%) 0 0 / 220% 100%; animation: gal-shimmer 1.4s linear infinite; }
      .gallery-media-card:active { transform: scale(.94); filter: brightness(.96); z-index: 2; }
      .gallery-media-card img { display: block; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .4s ease; }
      .gallery-media-card img[src] { opacity: 1; }
      .gallery-media-card.preview-unavailable::after { content: "♡"; position: absolute; inset: 0; display: grid; place-items: center; color: var(--bubble); font-size: 26px; }
      .gallery-media-video { position: absolute; bottom: 6px; left: 6px; display: grid; width: 24px; height: 24px; place-items: center; border-radius: 50%; background: #d6457aa6; color: #fff; font-size: 9px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
      .gallery-upload-input { display: none; }

      /* ───────── Full-screen viewer ───────── */
      .gallery-viewer { position: fixed; inset: 0; z-index: 1200; display: none; flex-direction: column; padding: 0; background: #150a10; color: #fff; overscroll-behavior: contain; touch-action: pan-x pan-y pinch-zoom; }
      .gallery-viewer.open { display: flex; animation: gal-fade .25s ease; }
      .gallery-viewer-head { position: absolute; top: 0; right: 0; left: 0; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 48px; padding: calc(env(safe-area-inset-top, 0px) + 8px) max(12px, env(safe-area-inset-right, 12px)) 30px max(14px, env(safe-area-inset-left, 14px)); background: linear-gradient(#150a10d9, #150a1000); }
      .gallery-viewer-title { min-width: 0; overflow: hidden; color: #fff; font-size: 14px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .gallery-viewer-actions { display: flex; flex: none; gap: 8px; }
      .gallery-viewer-btn { min-width: 40px; min-height: 40px; padding: 7px 14px; border: 1px solid #ffffff3d; border-radius: 999px; background: #ffffff1f; color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); transition: transform .2s cubic-bezier(.34, 1.56, .64, 1), background .2s ease; }
      .gallery-viewer-btn:active { transform: scale(.92); }
      .gallery-viewer-btn.delete { border-color: #ff8fb399; background: #d6457a8c; }
      .gallery-viewer-btn.delete::before { content: "🗑  "; font-size: 11px; }
      .gallery-viewer-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; touch-action: pan-y; }
      .gallery-viewer-stage img, .gallery-viewer-stage video { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; border-radius: 0; animation: gal-zoom .32s cubic-bezier(.2, .9, .3, 1); }
      .gallery-viewer-stage img { touch-action: none; will-change: transform; user-select: none; -webkit-user-select: none; }
      .gallery-viewer-nav { position: absolute; top: 50%; z-index: 2; width: 42px; height: 52px; border: 1px solid #ffffff4d; border-radius: 999px; background: #d6457a80; color: #fff; font-size: 24px; transform: translateY(-50%); cursor: pointer; transition: background .2s ease; }
      .gallery-viewer-nav:hover { background: #d6457acc; }
      .gallery-viewer-nav.prev { left: 8px; }
      .gallery-viewer-nav.next { right: 8px; }
      .gallery-viewer-foot { position: absolute; right: 0; bottom: 0; left: 0; z-index: 3; display: flex; align-items: center; justify-content: center; min-height: 38px; padding: 34px 12px calc(env(safe-area-inset-bottom, 0px) + 14px); background: linear-gradient(#150a1000, #150a10d9); color: #ffe3ee; font-size: 12px; font-weight: 600; pointer-events: none; }
      @media (hover: none) { .gallery-viewer-nav { display: none; } }

      /* ───────── Motion ───────── */
      @keyframes gal-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes gal-zoom { from { opacity: 0; transform: scale(.97); } to { opacity: 1; transform: scale(1); } }
      @keyframes gal-drop { from { opacity: 0; transform: translateY(-10px) scale(.98); } to { opacity: 1; transform: none; } }
      @keyframes gal-beat { 0%, 100% { transform: scale(1); } 14% { transform: scale(1.18); } 28% { transform: scale(1); } 42% { transform: scale(1.1); } 70% { transform: scale(1); } }
      @keyframes gal-shimmer { to { background-position: -220% 0; } }

      /* ───────── Responsive ───────── */
      @media (min-width: 560px) {
        .shared-gallery { padding-right: 16px; padding-left: 16px; }
        .gallery-folder-list { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 30px 20px; }
        .gallery-media-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 4px 0 0; }
        .gallery-media-card { border-radius: 12px; }
      }
      @media (max-width: 360px) { .gallery-primary-btn { padding: 8px 12px; font-size: 11.5px; } .gallery-folder-copy strong { font-size: 13px; } }
      @media (prefers-reduced-motion: reduce) {
        .shared-gallery *, .gallery-viewer, .gallery-viewer * { animation: none !important; transition: none !important; }
      }
    </style>
    <section class="shared-gallery">
      <header class="gallery-heading">
        <div class="gallery-heading-copy">
          <button class="gallery-back" id="gallery-back" type="button">‹ More</button>
          <p class="gallery-eyebrow">OUR LITTLE WORLD</p>
          <h1 id="gallery-page-title">Gallery</h1>
        </div>
        <button class="gallery-primary-btn" id="gallery-create-open" type="button">＋ Create Folder</button>
      </header>
      <form id="gallery-folder-form" class="gallery-folder-form" hidden>
        <input id="gallery-folder-name" maxlength="60" placeholder="Folder name" aria-label="Folder name" required>
        <button class="gallery-primary-btn" type="submit">Create</button>
        <button class="gallery-viewer-btn" id="gallery-folder-cancel" type="button" style="color:#8f4263;border-color:#efd5e0;background:#fff">Cancel</button>
      </form>
      <section id="gallery-folders-page" class="gallery-folder-list" aria-label="Gallery folders"></section>
      <section id="gallery-folder-page" class="gallery-folder-page" hidden>
        <div class="gallery-folder-toolbar">
          <h2 id="gallery-folder-title"></h2>
          <button id="gallery-upload-open" class="gallery-primary-btn" type="button">＋ Upload Media</button>
          <input id="gallery-upload-input" class="gallery-upload-input" type="file" accept="image/*,video/*" multiple aria-label="Upload photos or videos">
        </div>
        <div id="gallery-media-grid" class="gallery-media-grid"></div>
      </section>
    </section>
    <div id="gallery-viewer" class="gallery-viewer" role="dialog" aria-modal="true" aria-hidden="true" aria-label="Full-screen media viewer">
      <header class="gallery-viewer-head">
        <span id="gallery-viewer-title" class="gallery-viewer-title"></span>
        <div class="gallery-viewer-actions">
          <button id="gallery-delete-media" class="gallery-viewer-btn delete" type="button">Delete</button>
          <button id="gallery-viewer-close" class="gallery-viewer-btn" type="button" aria-label="Close viewer">×</button>
        </div>
      </header>
      <div id="gallery-viewer-stage" class="gallery-viewer-stage"></div>
      <footer id="gallery-viewer-foot" class="gallery-viewer-foot"></footer>
    </div>
  `;

  const folderList = $("#gallery-folders-page", el);
  const folderPage = $("#gallery-folder-page", el);
  const folderForm = $("#gallery-folder-form", el);
  const viewer = $("#gallery-viewer", el);
  const viewerStage = $("#gallery-viewer-stage", el);
  const uploadInput = $("#gallery-upload-input", el);

  // Folder navigation keeps the open folder in the URL hash (#gallery-library/<id>),
  // so a device reload, back gesture, or shared link lands back inside that
  // folder's own grid instead of silently falling back to the folder list.
  function folderFromHash() {
    const match = window.location.hash.match(/^#gallery-library\/(.+)$/);
    if (!match) return "";
    try { return decodeURIComponent(match[1]); } catch { return ""; }
  }

  // Keep a "folder list" history entry behind the open folder, so the Android
  // back button / iOS back gesture (and the ‹ Folders button) walk folder →
  // folder list → More instead of being undone by app.js restoring the hash.
  let folderHistoryPushed = false;

  function syncFolderHash(folderId) {
    const next = folderId ? `#gallery-library/${encodeURIComponent(folderId)}` : "#gallery-library";
    const url = `${window.location.pathname}${window.location.search}${next}`;
    if (folderId && !folderHistoryPushed) {
      folderHistoryPushed = true;
      window.history.pushState({ route: "gallery-library", folderId, galleryFolder: true }, "", url);
    } else if (!folderId && folderHistoryPushed) {
      folderHistoryPushed = false;
      if (window.history.state?.galleryFolder) window.history.back();
      else window.history.replaceState({ route: "gallery-library", folderId: "" }, "", url);
    } else {
      window.history.replaceState({ route: "gallery-library", folderId }, "", url);
    }
  }

  function openFolder(folderId) {
    const folder = folders.find(item => item.id === folderId);
    if (!folder) return false;
    selectedFolderId = folder.id;
    folderForm.hidden = true;
    closeViewer();
    syncFolderHash(folder.id);
    render();
    window.scrollTo(0, 0);
    return true;
  }

  function closeFolder() {
    closeViewer();
    selectedFolderId = "";
    folderForm.hidden = true;
    syncFolderHash("");
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    if (!activeGallery || !el.isConnected) return;
    // A folder that no longer exists (deleted on the other device) drops us
    // back to the folder list instead of leaving an empty page open.
    if (selectedFolderId && folders.length && !folders.some(folder => folder.id === selectedFolderId)) selectedFolderId = "";
    const selectedFolder = folders.find(folder => folder.id === selectedFolderId);
    $("#gallery-page-title", el).textContent = selectedFolder ? selectedFolder.title : "Gallery";
    $("#gallery-back", el).textContent = selectedFolder ? "‹ Folders" : "‹ More";
    $("#gallery-create-open", el).hidden = Boolean(selectedFolder);
    folderForm.hidden = Boolean(selectedFolder) || folderForm.hidden;
    folderList.hidden = Boolean(selectedFolder);
    folderPage.hidden = !selectedFolder;
    if (!selectedFolder) {
      const sortedFolders = [...folders].sort((a, b) => (b.createdAt?.toMillis?.() || b.createdAtMs || 0) - (a.createdAt?.toMillis?.() || a.createdAtMs || 0));
      folderList.innerHTML = sortedFolders.length ? sortedFolders.map(folder => {
        const folderMedia = media.filter(item => item.folderId === folder.id).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        const latest = folderMedia[0];
        const thumb = latest?.thumbnailUrl || latest?.url || (latest?.telegramFileId ? latest : null);
        return `<button type="button" class="gallery-folder-card" data-folder-id="${esc(folder.id)}" aria-label="Open folder ${esc(folder.title || "Gallery folder")}, ${folderMedia.length} ${folderMedia.length === 1 ? "item" : "items"}">
          <span class="gallery-folder-thumb">${thumb ? `<img ${typeof thumb === "object" ? `data-gallery-preview="${esc(thumb.id)}"` : `src="${esc(thumb)}"`} alt="" loading="lazy" decoding="async">` : `<span class="gallery-folder-placeholder" aria-hidden="true">♡</span>`}</span>
          <span class="gallery-folder-copy"><strong>${esc(folder.title || "Untitled folder")}</strong><small>${folderMedia.length} ${folderMedia.length === 1 ? "item" : "items"}</small></span>
        </button>`;
      }).join("") : `<div class="gallery-empty"><span>♡</span>Your gallery starts with a folder.<br>Create one to keep your photos and videos together.</div>`;
      folderList.querySelectorAll("[data-folder-id]").forEach(button => {
        button.onclick = () => openFolder(button.dataset.folderId);
      });
      observePreviews();
      return;
    }
    $("#gallery-folder-title", el).textContent = selectedFolder.title;
    const folderMedia = media.filter(item => item.folderId === selectedFolder.id).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    $("#gallery-media-grid", el).innerHTML = folderMedia.length ? folderMedia.map((item, index) => `
      <button class="gallery-media-card" type="button" data-gallery-media="${index}" aria-label="Open ${item.mediaType === "video" ? "video" : "photo"} ${esc(item.fileName || "")}">
        <img ${item.thumbnailUrl || item.url ? `src="${esc(item.thumbnailUrl || item.url)}"` : `data-gallery-preview="${esc(item.id)}"`} alt="" loading="lazy" decoding="async">${item.mediaType === "video" ? '<span class="gallery-media-video" aria-hidden="true">▶</span>' : ""}
      </button>`).join("") : `<div class="gallery-empty" style="grid-column:1/-1"><span>♡</span>No photos or videos here yet.<br>Upload a little moment to this folder.</div>`;
    $("#gallery-media-grid", el).querySelectorAll("[data-gallery-media]").forEach(button => {
      button.onclick = () => openViewer(Number(button.dataset.galleryMedia));
    });
    observePreviews();
  }

  $("#gallery-back", el).onclick = () => {
    if (selectedFolderId || folderFromHash()) closeFolder();
    else window.App?.navigate("more");
  };
  $("#gallery-create-open", el).onclick = () => {
    folderForm.hidden = false;
    $("#gallery-folder-name", el).focus();
  };
  $("#gallery-folder-cancel", el).onclick = () => { folderForm.reset(); folderForm.hidden = true; };
  folderForm.onsubmit = async event => {
    event.preventDefault();
    const title = $("#gallery-folder-name", el).value.trim();
    if (!title) return;
    const button = folderForm.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const createdAtMs = Date.now();
      await addItem("galleryFolder", { title, author: user.uid, createdAtMs });
      folderForm.reset();
      folderForm.hidden = true;
      toast("Folder created ♡");
    } catch (error) {
      console.error("Could not create gallery folder:", error);
      toast(error.message || "Could not create folder.");
    } finally {
      button.disabled = false;
    }
  };

  $("#gallery-upload-open", el).onclick = () => uploadInput.click();
  uploadInput.onchange = async () => {
    const files = [...(uploadInput.files || [])].filter(file => file.type.startsWith("image/") || file.type.startsWith("video/"));
    const folder = folders.find(item => item.id === selectedFolderId);
    uploadInput.value = "";
    if (!folder || !files.length) return;
    const button = $("#gallery-upload-open", el);
    button.disabled = true;
    button.textContent = "Uploading…";
    try {
      const results = await Promise.all(files.map(async file => {
        const mediaType = file.type.startsWith("video/") ? "video" : "photo";
        const createdAtMs = Date.now();
        const timestamp = new Date(createdAtMs).toLocaleString();
        const result = await sendToTelegram(
          file,
          `New Gallery Upload 🖼️ · ${folder.title} · ${profile?.name || "Partner"} · ${timestamp}`
        );
        const message = result.result || result;
        const telegramFile = message.document || message.video || message.audio || message.photo?.at(-1);
        if (!telegramFile?.file_id || !message.message_id || !message.chat?.id) {
          throw new Error("Telegram accepted this upload but did not return its media reference.");
        }
        const saved = await addItem("galleryMedia", {
          folderId: folder.id,
          author: user.uid,
          fileName: file.name || "Media",
          mediaType,
          mimeType: telegramUploadMimeType(file),
          telegramFileId: telegramFile.file_id,
          telegramFileUniqueId: telegramFile.file_unique_id || "",
          telegramMessageId: message.message_id,
          telegramChatId: message.chat.id,
          createdAtMs
        });
        return { id: saved.id };
      }));
      toast(`${results.length} item${results.length === 1 ? "" : "s"} added to ${folder.title} ♡`);
    } catch (error) {
      console.error("Gallery media upload failed:", error);
      toast(error.message || "Could not upload media to Telegram. Please try again.");
    } finally {
      button.disabled = false;
      button.textContent = "＋ Upload Media";
    }
  };

  function folderMediaItems() {
    return media.filter(item => item.folderId === selectedFolderId).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  }

  function resetZoom() {
    zoomScale = 1;
    const image = viewerStage.querySelector("img");
    if (image) { image.style.transform = "scale(1)"; image.style.transformOrigin = "center"; }
  }

  function openViewer(index) {
    viewerIndex = index;
    viewer.classList.add("open");
    viewer.setAttribute("aria-hidden", "false");
    renderViewer();
  }

  function closeViewer() {
    viewerLoadToken++;
    viewer.classList.remove("open");
    viewer.setAttribute("aria-hidden", "true");
    viewerStage.replaceChildren();
    viewerIndex = -1;
    resetZoom();
  }

  function renderViewer() {
    const items = folderMediaItems();
    if (viewerIndex < 0 || viewerIndex >= items.length) return closeViewer();
    const item = items[viewerIndex];
    const loadToken = ++viewerLoadToken;
    resetZoom();
    $("#gallery-viewer-title", el).textContent = item.fileName || "Our little moment";
    $("#gallery-viewer-foot", el).textContent = `${dateLabel(item.createdAtMs)} · ${viewerIndex + 1} of ${items.length}`;
    viewerStage.replaceChildren();
    if (item.mediaType === "video") {
      const video = document.createElement("video");
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      viewerStage.append(video);
      getMediaUrl(item).then(url => { if (loadToken === viewerLoadToken) video.src = url; }).catch(() => {
        if (loadToken === viewerLoadToken) video.replaceWith(document.createTextNode("This video could not be loaded."));
      });
    } else {
      const image = document.createElement("img");
      image.alt = item.fileName || "Gallery photo";
      image.draggable = false;
      image.onclick = event => {
        const now = Date.now();
        if (now - lastTapAt < 320) {
          zoomScale = zoomScale > 1 ? 1 : 2.5;
          image.style.transformOrigin = `${event.offsetX}px ${event.offsetY}px`;
          image.style.transform = `scale(${zoomScale})`;
        }
        lastTapAt = now;
      };
      viewerStage.append(image);
      getMediaUrl(item).then(url => { if (loadToken === viewerLoadToken) image.src = url; }).catch(() => {
        if (loadToken === viewerLoadToken) image.alt = "This photo could not be loaded.";
      });
    }
    const previous = document.createElement("button");
    previous.className = "gallery-viewer-nav prev";
    previous.type = "button";
    previous.textContent = "‹";
    previous.setAttribute("aria-label", "Previous media");
    previous.onclick = () => moveViewer(-1);
    const next = document.createElement("button");
    next.className = "gallery-viewer-nav next";
    next.type = "button";
    next.textContent = "›";
    next.setAttribute("aria-label", "Next media");
    next.onclick = () => moveViewer(1);
    if (items.length > 1) viewerStage.append(previous, next);
    $("#gallery-delete-media", el).onclick = deleteCurrentMedia;
  }

  function moveViewer(direction) {
    const total = folderMediaItems().length;
    if (!total) return closeViewer();
    viewerIndex = (viewerIndex + direction + total) % total;
    renderViewer();
  }

  async function deleteCurrentMedia() {
    const item = folderMediaItems()[viewerIndex];
    if (!item || !confirm(`Delete “${item.fileName || "this media"}” from this folder?`)) return;
    const button = $("#gallery-delete-media", el);
    button.disabled = true;
    try {
      let telegramDeleteFailed = false;
      if (item.telegramChatId && item.telegramMessageId) {
        try { telegramDeleteFailed = !await deleteTelegramGalleryMessage(item.telegramChatId, item.telegramMessageId); }
        catch (error) {
          telegramDeleteFailed = true;
          console.warn("Telegram could not remove the original message:", error);
        }
      }
      await removeItem(item.id);
      media = media.filter(mediaItem => mediaItem.id !== item.id);
      mediaBlobs.delete(item.telegramFileId);
      const mediaUrl = mediaUrls.get(item.telegramFileId);
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
      mediaUrls.delete(item.telegramFileId);
      const previewUrl = previewUrls.get(item.id);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrls.delete(item.id);
      const updated = folderMediaItems();
      if (!updated.length) closeViewer();
      else { viewerIndex = Math.min(viewerIndex, updated.length - 1); render(); renderViewer(); }
      toast(telegramDeleteFailed ? "Removed from Gallery. Telegram kept its copy." : "Media deleted from Gallery.");
    } catch (error) {
      console.error("Could not delete gallery media:", error);
      toast("Could not delete this media.");
    } finally {
      button.disabled = false;
    }
  }

  viewer.addEventListener("touchstart", event => {
    if (event.touches.length >= 2) {
      const [a, b] = event.touches;
      pinchStartDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchStartScale = zoomScale;
      touchStart = null;
    } else if (event.touches.length === 1) {
      touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
  }, { passive: true });
  viewer.addEventListener("touchmove", event => {
    if (event.touches.length < 2 || !pinchStartDistance) return;
    event.preventDefault();
    const [a, b] = event.touches;
    zoomScale = Math.max(1, Math.min(4, pinchStartScale * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinchStartDistance));
    const image = viewerStage.querySelector("img");
    if (image) image.style.transform = `scale(${zoomScale})`;
  }, { passive: false });
  viewer.addEventListener("touchend", event => {
    if (pinchStartDistance && event.touches.length < 2) pinchStartDistance = 0;
    if (!touchStart || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (zoomScale <= 1.02 && Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy)) moveViewer(dx < 0 ? 1 : -1);
  }, { passive: true });
  $("#gallery-viewer-close", el).onclick = closeViewer;
  viewer.addEventListener("click", event => { if (event.target === viewer) closeViewer(); });
  const onEscape = event => {
    if (event.key === "Escape" && viewer.classList.contains("open")) closeViewer();
    else if (event.key === "ArrowRight" && viewer.classList.contains("open")) moveViewer(1);
    else if (event.key === "ArrowLeft" && viewer.classList.contains("open")) moveViewer(-1);
    else if (event.key === "Escape" && selectedFolderId) closeFolder();
  };
  window.addEventListener("keydown", onEscape);
  // A back gesture/history entry that leaves a folder goes back to the folder
  // list. app.js restores the hash afterwards, so the router stays in sync.
  const onPopState = () => {
    if (!activeGallery) return;
    const hashFolderId = folderFromHash();
    folderHistoryPushed = Boolean(hashFolderId);
    if (hashFolderId) {
      if (hashFolderId !== selectedFolderId && folders.some(folder => folder.id === hashFolderId)) {
        selectedFolderId = hashFolderId;
        render();
      }
      return;
    }
    // Backing out of a folder: show the folder list (the URL already updated).
    if (selectedFolderId) {
      closeViewer();
      selectedFolderId = "";
      folderForm.hidden = true;
      render();
    }
  };
  window.addEventListener("popstate", onPopState);
  el.galleryMediaCleanup = () => {
    previewObserver?.disconnect();
    for (const url of mediaUrls.values()) URL.revokeObjectURL(url);
    for (const url of previewUrls.values()) URL.revokeObjectURL(url);
    mediaBlobs.clear();
    mediaUrls.clear();
    previewUrls.clear();
  };

  const showError = message => {
    if (!activeGallery || !el.isConnected) return;
    folderList.innerHTML = `<div class="gallery-empty"><span>♡</span>${esc(message)}</div>`;
  };
  stopFolders = watchItems("galleryFolder", items => {
    if (!activeGallery) return;
    folders = items;
    // Re-enter the folder named in the URL (first load, reload, or deep link).
    const hashFolderId = folderFromHash();
    if (hashFolderId && items.some(folder => folder.id === hashFolderId)) {
      selectedFolderId = hashFolderId;
    } else if (hashFolderId && !selectedFolderId) {
      syncFolderHash("");
    }
    render();
  }, error => { console.error("Gallery folders could not load:", error); showError("Folders could not be loaded. Check your connection and try again."); });
  stopMedia = watchItems("galleryMedia", items => {
    if (!activeGallery) return;
    media = items;
    render();
    if (viewer.classList.contains("open")) renderViewer();
  }, error => console.error("Gallery media could not load:", error));
  el.galleryEscapeCleanup = () => {
    window.removeEventListener("keydown", onEscape);
    window.removeEventListener("popstate", onPopState);
  };
}

export function disposeSharedGallery() {
  activeGallery = false;
  stopFolders?.();
  stopMedia?.();
  stopFolders = null;
  stopMedia = null;
  const mainContent = document.querySelector("#main-content");
  mainContent?.galleryEscapeCleanup?.();
  mainContent?.galleryMediaCleanup?.();
}
