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
    video.onloadeddata = () => {
      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) { cleanup(); reject(new Error("Could not create a video preview.")); return; }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        cleanup();
        if (blob) resolve(blob);
        else reject(new Error("Could not create a video preview."));
      }, "image/jpeg", 0.68);
    };
    video.onerror = () => { cleanup(); reject(new Error("Could not read this video.")); };
    video.src = objectUrl;
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
      .shared-gallery { max-width:760px; margin:0 auto; color:#513544; }
      .gallery-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
      .gallery-heading-copy { min-width:0; }
      .gallery-back { margin:0 0 8px; padding:0; background:none; color:#a85475; font-size:12px; font-weight:700; cursor:pointer; }
      .gallery-eyebrow { margin:0 0 3px; color:#ad758d; font-size:9px; font-weight:800; letter-spacing:.18em; }
      .gallery-heading h1 { margin:0; color:var(--deep); font:700 clamp(25px,6vw,34px)/1.1 "Playfair Display",Georgia,serif; }
      .gallery-primary-btn { flex:none; display:inline-flex; align-items:center; gap:6px; min-height:42px; padding:9px 15px; border:0; border-radius:999px; background:linear-gradient(135deg,#ed6b99,#c8477a); color:#fff; font-size:12px; font-weight:800; box-shadow:0 7px 18px #c94f7c30; cursor:pointer; }
      .gallery-folder-form { display:flex; gap:8px; margin:0 0 14px; padding:12px; border:1px solid #f2d6e1; border-radius:16px; background:#fff9fc; }
      .gallery-folder-form[hidden],.gallery-folder-page[hidden] { display:none; }
      .gallery-folder-form input { flex:1; min-width:0; min-height:40px; padding:9px 12px; border:1px solid #efd3df; border-radius:12px; background:#fff; color:#513544; }
      .gallery-folder-list { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px 16px; }
      .gallery-empty { padding:34px 16px; border:1px dashed #ecc3d4; border-radius:20px; background:#fffafd; color:#a27d8e; text-align:center; font-size:13px; line-height:1.6; }
      .gallery-empty span { display:block; margin-bottom:7px; font-size:30px; }
      .gallery-folder-card { position:relative; display:block; width:100%; padding:0; border:0; background:none; text-align:left; cursor:pointer; -webkit-tap-highlight-color:transparent; }
      .gallery-folder-thumb { position:relative; display:block; width:100%; aspect-ratio:1; overflow:hidden; border-radius:16px; background:linear-gradient(145deg,#ffe6ef,#f7d5e3); }
      .gallery-folder-card img { display:block; width:100%; height:100%; object-fit:cover; transition:transform .35s ease; }
      .gallery-folder-card:hover img { transform:scale(1.045); }
      .gallery-folder-card:active img { transform:scale(1.02); }
      .gallery-folder-placeholder { position:absolute; inset:0; display:grid; place-items:center; color:#c9749a; font-size:34px; }
      .gallery-folder-copy { display:block; padding:9px 2px 0; }
      .gallery-folder-copy strong { display:block; overflow:hidden; color:#2b2430; font-size:13px; font-weight:700; line-height:1.3; text-overflow:ellipsis; white-space:nowrap; }
      .gallery-folder-copy small { display:block; margin-top:3px; color:#8e8593; font-size:11px; font-weight:500; }
      .gallery-folder-page { padding:14px; border:1px solid #f1dce5; border-radius:22px; background:linear-gradient(160deg,#fff,#fff8fb); box-shadow:0 8px 24px #78395010; }
      .gallery-folder-toolbar { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:13px; }
      .gallery-folder-toolbar h2 { min-width:0; margin:0; color:#75445b; font-size:19px; overflow-wrap:anywhere; }
      .gallery-media-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
      .gallery-media-card { position:relative; display:block; width:100%; aspect-ratio:1; padding:0; overflow:hidden; border:1px solid #f0d7e1; border-radius:16px; background:#f9e7ef; cursor:pointer; }
      .gallery-media-card img { display:block; width:100%; height:100%; object-fit:cover; transition:transform .3s ease; }
      .gallery-media-card:hover img { transform:scale(1.04); }
      .gallery-media-video { position:absolute; top:10px; right:10px; display:grid; width:32px; height:32px; place-items:center; border:1px solid #ffffff90; border-radius:50%; background:#26141dbd; color:#fff; font-size:12px; }
      .gallery-upload-input { display:none; }
      .gallery-viewer { position:fixed; inset:0; z-index:1200; display:none; flex-direction:column; padding:env(safe-area-inset-top,10px) max(10px,env(safe-area-inset-right,10px)) env(safe-area-inset-bottom,10px) max(10px,env(safe-area-inset-left,10px)); background:#1c1119f5; color:#fff; touch-action:pan-x pan-y pinch-zoom; }
      .gallery-viewer.open { display:flex; }
      .gallery-viewer-head { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:48px; }
      .gallery-viewer-title { min-width:0; overflow:hidden; color:#fff; font-size:13px; font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
      .gallery-viewer-actions { display:flex; flex:none; gap:7px; }
      .gallery-viewer-btn { min-width:40px; min-height:40px; padding:7px 11px; border:1px solid #ffffff38; border-radius:999px; background:#ffffff18; color:#fff; font-size:12px; font-weight:700; cursor:pointer; }
      .gallery-viewer-btn.delete { border-color:#f291ad77; background:#d541706e; }
      .gallery-viewer-stage { position:relative; display:flex; flex:1; min-height:0; align-items:center; justify-content:center; overflow:hidden; touch-action:pan-y; }
      .gallery-viewer-stage img,.gallery-viewer-stage video { display:block; max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; border-radius:7px; }
      .gallery-viewer-stage img { touch-action:none; will-change:transform; }
      .gallery-viewer-nav { position:absolute; top:50%; z-index:1; width:42px; height:52px; border:1px solid #ffffff4d; border-radius:999px; background:#21141e94; color:#fff; font-size:24px; transform:translateY(-50%); cursor:pointer; }
      .gallery-viewer-nav.prev { left:6px; }
      .gallery-viewer-nav.next { right:6px; }
      .gallery-viewer-foot { min-height:38px; display:flex; align-items:center; justify-content:center; color:#ffffffb8; font-size:11px; }
      @media(max-width:420px) { .gallery-heading { align-items:flex-end; } .gallery-primary-btn { min-height:39px; padding:8px 11px; font-size:11px; } .gallery-folder-list { gap:16px 10px; } .gallery-folder-thumb { border-radius:13px; } .gallery-folder-copy { padding-top:7px; } .gallery-folder-copy strong { font-size:12px; } .gallery-folder-copy small { font-size:10px; } .gallery-folder-page { padding:10px; } .gallery-media-grid { gap:7px; } .gallery-media-card { border-radius:12px; } }
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

  function render() {
    if (!activeGallery || !el.isConnected) return;
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
        button.onclick = () => { selectedFolderId = button.dataset.folderId; render(); };
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
    if (selectedFolderId) { selectedFolderId = ""; render(); }
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
        try { await deleteTelegramGalleryMessage(item.telegramChatId, item.telegramMessageId); }
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
  };
  window.addEventListener("keydown", onEscape);
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
    render();
  }, error => { console.error("Gallery folders could not load:", error); showError("Folders could not be loaded. Check your connection and try again."); });
  stopMedia = watchItems("galleryMedia", items => {
    if (!activeGallery) return;
    media = items;
    render();
    if (viewer.classList.contains("open")) renderViewer();
  }, error => console.error("Gallery media could not load:", error));
  el.galleryEscapeCleanup = () => window.removeEventListener("keydown", onEscape);
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
