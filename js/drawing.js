import { $, esc, toast } from "./utils.js";
import { rtdb } from "./firebase.js";
import { addDrawingMessage, watchDrawingMessages, deleteDrawingMessage, notifyPartnerSafely } from "./firestore.js";
import { getTelegramMediaUrl, sendToTelegram, telegramMediaReferences } from "../src/services/telegramService.js";
import { getDisplayName, getProfileKey } from "./profile-data.js";
import { createDrawingHistory, createOfflineQueue } from "./drawing-fixes.js";
import { warmDrawing, drawingWarm } from "./drawing-preload.js";
import { ref, push, get, onChildAdded, onValue, onDisconnect, set } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const root = "couples/our-little-world/drawing";
let activeDrawingCleanup = null;

export function disposeDrawing() { activeDrawingCleanup?.(); activeDrawingCleanup = null; }

function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try { return crypto.randomUUID(); } catch { /* fall through */ }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function renderDrawing(el, user, profile) {
  disposeDrawing();

  el.innerHTML = `<section class="live-drawing">
    <header class="drawing-heading">
      <div class="drawing-header-actions">
        <button type="button" class="tool-button drawing-header-history" id="drawing-history-open" aria-label="Open drawing history">History</button>
        <button type="button" class="primary drawing-header-save" id="drawing-save" aria-label="Save and send drawing">Save &amp; Send ♡</button>
      </div>
      <div class="drawing-title-row">
        <button type="button" class="drawing-close" id="drawing-close" aria-label="Close canvas">×</button>
        <div class="drawing-title-group">
          <h1>Our Canvas</h1>
          <div class="drawing-presence-pill"><span class="presence-dot"></span><span id="drawing-presence">Preparing canvas…</span></div>
        </div>
      </div>
    </header>

    <div class="draw-board" id="draw-board">
      <div id="canvas-zoom-spacer" class="canvas-zoom-spacer">
        <div id="canvas-zoom-layer" class="canvas-zoom-layer">
          <canvas class="draw-canvas" id="draw-canvas" width="1200" height="900" aria-label="Shared drawing canvas" role="img" tabindex="0"></canvas>
          <div class="canvas-watermark">K &amp; S ♡</div>
        </div>
      </div>
    </div>

    <div class="markup-dock-container">
      <div class="markup-popovers-host">
        <div class="markup-popover hidden" id="markup-options-popover" role="dialog" aria-modal="false" aria-label="Tool options">
          <div class="popover-header"><strong id="popover-tool-title">Pen</strong><span class="popover-badge" id="popover-tool-badge">Solid Ink</span></div>
          <div class="popover-section">
            <div class="popover-label-row"><span>Stroke Width</span><strong id="popover-size-text">5 px</strong></div>
            <div class="preset-pills-row" id="size-preset-pills">
              <button type="button" data-size="2" class="preset-pill">Thin</button>
              <button type="button" data-size="5" class="preset-pill active">Regular</button>
              <button type="button" data-size="12" class="preset-pill">Thick</button>
              <button type="button" data-size="24" class="preset-pill">Bold</button>
            </div>
            <input type="range" id="popover-size-slider" min="2" max="60" value="5" class="apple-slider" aria-label="Stroke width" aria-valuetext="5 px">
          </div>
          <div class="popover-section" id="popover-opacity-section">
            <div class="popover-label-row"><span>Opacity</span><strong id="popover-opacity-text">80%</strong></div>
            <div class="preset-pills-row" id="opacity-preset-pills">
              <button type="button" data-opacity="30" class="preset-pill">30%</button>
              <button type="button" data-opacity="50" class="preset-pill">50%</button>
              <button type="button" data-opacity="80" class="preset-pill active">80%</button>
              <button type="button" data-opacity="100" class="preset-pill">100%</button>
            </div>
            <input type="range" id="popover-opacity-slider" min="10" max="100" step="5" value="80" class="apple-slider" aria-label="Tool opacity" aria-valuetext="80%">
          </div>
          <div class="popover-preview-box"><div class="popover-stroke-preview" id="popover-stroke-preview"></div></div>
        </div>

        <div class="markup-popover hidden" id="markup-color-popover" role="dialog" aria-modal="false" aria-label="Color Palette">
          <div class="popover-header"><strong>Color Palette</strong></div>
          <div class="color-palette-grid" role="group" aria-label="Color Swatches">
            <button type="button" class="palette-swatch" data-color="#1c1c1e" style="--swatch-color:#1c1c1e" aria-label="Black"></button>
            <button type="button" class="palette-swatch" data-color="#8e8e93" style="--swatch-color:#8e8e93" aria-label="Gray"></button>
            <button type="button" class="palette-swatch selected" data-color="#dc4d88" style="--swatch-color:#dc4d88" aria-label="Rose Pink"></button>
            <button type="button" class="palette-swatch" data-color="#ff2d55" style="--swatch-color:#ff2d55" aria-label="Berry Pink"></button>
            <button type="button" class="palette-swatch" data-color="#ff3b30" style="--swatch-color:#ff3b30" aria-label="Red"></button>
            <button type="button" class="palette-swatch" data-color="#ff9500" style="--swatch-color:#ff9500" aria-label="Orange"></button>
            <button type="button" class="palette-swatch" data-color="#ffcc00" style="--swatch-color:#ffcc00" aria-label="Yellow"></button>
            <button type="button" class="palette-swatch" data-color="#34c759" style="--swatch-color:#34c759" aria-label="Green"></button>
            <button type="button" class="palette-swatch" data-color="#30b0c7" style="--swatch-color:#30b0c7" aria-label="Teal"></button>
            <button type="button" class="palette-swatch" data-color="#007aff" style="--swatch-color:#007aff" aria-label="Apple Blue"></button>
            <button type="button" class="palette-swatch" data-color="#263b72" style="--swatch-color:#263b72" aria-label="Navy"></button>
            <button type="button" class="palette-swatch" data-color="#af52de" style="--swatch-color:#af52de" aria-label="Purple"></button>
            <button type="button" class="palette-swatch" data-color="#a2845e" style="--swatch-color:#a2845e" aria-label="Brown"></button>
            <button type="button" class="palette-swatch" data-color="#ffffff" style="--swatch-color:#ffffff" aria-label="White"></button>
          </div>
          <div class="custom-color-row">
            <label class="custom-color-picker-label" title="Choose custom color">
              <input type="color" id="markup-custom-color-input" value="#dc4d88" aria-label="Custom Color">
              <span class="custom-color-ring"></span>
              <span>Custom Color…</span>
            </label>
            <span class="custom-color-hex" id="markup-color-hex">#DC4D88</span>
          </div>
        </div>
      </div>

      <div class="apple-markup-dock" role="toolbar" aria-label="Drawing tools">
        <div class="markup-tools-row">
          <button type="button" class="dock-icon-btn" id="drawing-undo" aria-label="Undo" title="Undo" disabled>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 1 2.6 5.9"/><path d="M4 5v6h6"/></svg>
          </button>

          <div class="markup-tool-group" role="group" aria-label="Drawing tools">
            <button type="button" class="markup-tool selected" data-tool="pen" aria-label="Pen tool" title="Pen">
              <svg viewBox="0 0 36 84" class="tool-svg" aria-hidden="true">
                <defs>
                  <linearGradient id="apple-pen-barrel" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#d8d8de"/><stop offset="26%" stop-color="#ffffff"/><stop offset="70%" stop-color="#f0f0f4"/><stop offset="100%" stop-color="#c6c6ce"/></linearGradient>
                  <linearGradient id="apple-pen-cone" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#dedee4"/><stop offset="35%" stop-color="#ffffff"/><stop offset="100%" stop-color="#b8b8c2"/></linearGradient>
                  <linearGradient id="apple-pen-metal" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#9999a2"/><stop offset="35%" stop-color="#ffffff"/><stop offset="70%" stop-color="#b5b5be"/><stop offset="100%" stop-color="#707078"/></linearGradient>
                </defs>
                <rect x="10" y="32" width="16" height="52" rx="1" fill="url(#apple-pen-barrel)"/>
                <rect x="10" y="38" width="16" height="6" class="tool-color-fill" fill="#dc4d88"/>
                <line x1="10" y1="44" x2="26" y2="44" stroke="#a0a0aa" stroke-width="0.5"/>
                <path d="M 10 32 L 15 12 L 21 12 L 26 32 Z" fill="url(#apple-pen-cone)"/>
                <rect x="16" y="8" width="4" height="4" fill="url(#apple-pen-metal)"/>
                <path d="M 16.5 8 L 18 2 L 19.5 8 Z" class="tool-color-fill" fill="#dc4d88"/>
              </svg>
            </button>

            <button type="button" class="markup-tool" data-tool="pencil" aria-label="Pencil tool" title="Pencil">
              <svg viewBox="0 0 36 84" class="tool-svg" aria-hidden="true">
                <defs>
                  <linearGradient id="apple-pencil-barrel" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#e0e0e5"/><stop offset="25%" stop-color="#ffffff"/><stop offset="60%" stop-color="#f2f2f6"/><stop offset="100%" stop-color="#ceced6"/></linearGradient>
                  <linearGradient id="apple-pencil-wood" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#dfcaa9"/><stop offset="40%" stop-color="#faebd7"/><stop offset="85%" stop-color="#e2cdb0"/><stop offset="100%" stop-color="#c9b291"/></linearGradient>
                </defs>
                <rect x="10" y="34" width="16" height="50" rx="1" fill="url(#apple-pencil-barrel)"/>
                <line x1="15" y1="34" x2="15" y2="84" stroke="#d5d5dc" stroke-width="0.75"/>
                <line x1="21" y1="34" x2="21" y2="84" stroke="#b0b0ba" stroke-width="0.75"/>
                <path d="M 10 34 L 15.5 12 L 20.5 12 L 26 34 Z" fill="url(#apple-pencil-wood)"/>
                <path d="M 10 34 Q 14 31 18 34 Q 22 31 26 34 Z" fill="url(#apple-pencil-wood)"/>
                <path d="M 15.5 12 L 18 3 L 20.5 12 Z" class="tool-color-fill" fill="#dc4d88"/>
                <path d="M 17.5 4 L 18 3 L 18.5 4 L 18.5 12 L 17.5 12 Z" fill="#ffffff" opacity="0.35"/>
              </svg>
            </button>

            <button type="button" class="markup-tool" data-tool="marker" aria-label="Marker tool" title="Marker">
              <svg viewBox="0 0 36 84" class="tool-svg" aria-hidden="true">
                <defs>
                  <linearGradient id="apple-marker-barrel" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#dcdce2"/><stop offset="30%" stop-color="#ffffff"/><stop offset="70%" stop-color="#f4f4f8"/><stop offset="100%" stop-color="#c8c8d0"/></linearGradient>
                  <linearGradient id="apple-marker-shoulder" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#e0e0e6"/><stop offset="45%" stop-color="#ffffff"/><stop offset="100%" stop-color="#c4c4ce"/></linearGradient>
                </defs>
                <rect x="9" y="30" width="18" height="54" rx="2" fill="url(#apple-marker-barrel)"/>
                <rect x="9" y="37" width="18" height="7" class="tool-color-fill" fill="#dc4d88"/>
                <path d="M 9 30 C 9 24, 12 20, 13 18 L 23 18 C 24 20, 27 24, 27 30 Z" fill="url(#apple-marker-shoulder)"/>
                <path d="M 13 18 L 13 6 L 23 12 L 23 18 Z" class="tool-color-fill" fill="#dc4d88"/>
                <line x1="13" y1="6" x2="23" y2="12" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
                <text x="18" y="66" text-anchor="middle" font-family="-apple-system, 'DM Sans', sans-serif" font-size="9" font-weight="700" fill="#6e6e73" class="marker-opacity-label">80</text>
              </svg>
            </button>

            <button type="button" class="markup-tool" data-tool="eraser" aria-label="Eraser tool" title="Eraser">
              <svg viewBox="0 0 36 84" class="tool-svg" aria-hidden="true">
                <defs>
                  <linearGradient id="apple-eraser-body" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#dedee4"/><stop offset="28%" stop-color="#ffffff"/><stop offset="70%" stop-color="#f2f2f6"/><stop offset="100%" stop-color="#c6c6ce"/></linearGradient>
                  <linearGradient id="apple-eraser-rubber" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#ea8798"/><stop offset="35%" stop-color="#faaab6"/><stop offset="70%" stop-color="#f49ba9"/><stop offset="100%" stop-color="#d76f82"/></linearGradient>
                </defs>
                <rect x="9" y="32" width="18" height="52" rx="2" fill="url(#apple-eraser-body)"/>
                <rect x="9" y="30" width="18" height="3" fill="#8e8e93"/>
                <rect x="9" y="33" width="18" height="1" fill="#48484a"/>
                <path d="M 9.5 30 L 9.5 16 C 9.5 7.5, 26.5 7.5, 26.5 16 L 26.5 30 Z" fill="url(#apple-eraser-rubber)"/>
                <ellipse cx="18" cy="14" rx="4" ry="2" fill="#ffffff" opacity="0.45"/>
              </svg>
            </button>
          </div>

          <div class="markup-divider" aria-hidden="true"></div>

          <button type="button" class="markup-color-button" id="markup-color-btn" aria-label="Color palette" title="Color">
            <span class="color-wheel-ring"><span class="color-wheel-disc" id="markup-color-disc" style="background-color: #dc4d88;"></span></span>
          </button>

          <button type="button" class="markup-tune-button" id="markup-tune-btn" aria-label="Brush size and opacity" title="Size &amp; Opacity">
            <span class="tune-dot-preview" id="markup-size-dot"></span>
            <span id="markup-size-badge">5px</span>
          </button>

          <button type="button" class="dock-icon-btn small" id="drawing-clear" aria-label="Clear canvas" title="Clear">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>

          <button type="button" class="dock-icon-btn" id="drawing-redo" aria-label="Redo" title="Redo" disabled>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 0-2.6 5.9"/><path d="M20 5v6h-6"/></svg>
          </button>
        </div>
      </div>

      <div class="drawing-footer-bar">
        <button type="button" class="tool-button drawing-restore-trigger" id="drawing-history-restore" aria-label="Undo stroke or restore last clear" disabled>Restore last</button>
        <span class="drawing-sync-label" id="drawing-sync-label" role="status" aria-live="polite">All changes saved</span>
      </div>
    </div>

    <div class="drawing-history-overlay hidden" id="drawing-history-overlay" role="dialog" aria-modal="true" aria-labelledby="drawing-history-title">
      <section class="drawing-history-dialog">
        <header class="history-dialog-header">
          <div class="history-header-titles"><h2 id="drawing-history-title">Drawing gallery</h2><span class="muted" id="drawing-history-count">Saved drawings</span></div>
          <div class="history-header-actions">
            <button type="button" class="tool-button hidden" id="history-restore-selected" title="Restore selected drawing">Load selected ♡</button>
            <button type="button" class="drawing-close" id="drawing-history-close" aria-label="Close history">×</button>
          </div>
        </header>
        <div id="drawing-history-list" class="drawing-history-grid" role="region" aria-label="Drawing cards"><p class="muted">Loading saved drawings…</p></div>
      </section>
    </div>

    <div class="drawing-preview-overlay hidden" id="drawing-preview-overlay" role="dialog" aria-modal="true" aria-label="Drawing preview">
      <div class="preview-backdrop" id="preview-backdrop"></div>
      <div class="preview-card-dialog">
        <header class="preview-dialog-header">
          <div class="preview-meta"><strong id="preview-meta-author">Keby &amp; Shazy</strong><small id="preview-meta-date">Date</small></div>
          <div class="preview-dialog-actions">
            <button type="button" class="primary" id="preview-restore-btn" title="Load on canvas">Load on canvas ♡</button>
            <button type="button" class="preview-trash-btn" id="preview-delete-btn" title="Delete">🗑 Delete</button>
            <button type="button" class="drawing-close" id="preview-close-btn" aria-label="Close preview">×</button>
          </div>
        </header>
        <div class="preview-image-container"><img id="preview-modal-img" src="" alt="Drawing preview"></div>
      </div>
    </div>
  </section>`;

  const canvas = $("#draw-canvas", el);
  const drawBoard = $("#draw-board", el);
  const zoomLayer = $("#canvas-zoom-layer", el);
  const zoomSpacer = $("#canvas-zoom-spacer", el);

  // ---- Zoom state (no UI, finger/wheel only) ----
  const ZOOM_MIN = 0.5, ZOOM_MAX = 4, ZOOM_STEP = 0.25;
  let zoom = 1;

  function applyZoom(next, focalX = drawBoard.clientWidth / 2, focalY = drawBoard.clientHeight / 2) {
    const previousZoom = zoom;
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    const baseW = drawBoard.clientWidth || 1;
    const baseH = drawBoard.clientHeight || 1;
    const oldScrollLeft = drawBoard.scrollLeft;
    const oldScrollTop = drawBoard.scrollTop;
    zoomLayer.style.width = `${baseW}px`;
    zoomLayer.style.height = `${baseH}px`;
    zoomLayer.style.transform = `scale(${zoom})`;
    zoomSpacer.style.width = `${baseW * zoom}px`;
    zoomSpacer.style.height = `${baseH * zoom}px`;
    if (previousZoom !== zoom) {
      const ratio = zoom / previousZoom;
      drawBoard.scrollLeft = Math.max(0, (oldScrollLeft + focalX) * ratio - focalX);
      drawBoard.scrollTop = Math.max(0, (oldScrollTop + focalY) * ratio - focalY);
    }
  }

  const ctx = canvas.getContext("2d");
  const strokeRef = ref(rtdb, `${root}/strokes`);
  const presenceKey = profile?.id || getProfileKey(profile) || user.uid;
  const presenceRef = ref(rtdb, `${root}/presence/${presenceKey}`);
  const connectedRef = ref(rtdb, ".info/connected");
  const unsubs = [];

  const history = createDrawingHistory();
  const outgoingQueue = createOfflineQueue(user.uid);
  const knownOperationKeys = new Set();
  let latestRemoteClearKey = null;

  const toolConfigs = {
    pen: { size: 5, opacity: 1.0, title: "Pen", badge: "Solid Ink", presets: [2, 5, 12, 24] },
    pencil: { size: 4, opacity: 0.75, title: "Pencil", badge: "Graphite", presets: [2, 4, 8, 16] },
    marker: { size: 24, opacity: 0.8, title: "Marker", badge: "Highlighter", presets: [12, 20, 32, 48] },
    eraser: { size: 20, opacity: 1.0, title: "Eraser", badge: "Clean Erase", presets: [8, 16, 28, 50] }
  };

  let color = "#dc4d88";
  let tool = "pen";
  let lastNonEraserTool = "pen";
  let drawing = false;
  let active = true;
  let last = null;
  let activeStroke = null;
  let strokeIds = new Map();
  let pendingWrites = 0;
  const syncLabel = $("#drawing-sync-label", el);
  const historyOverlay = $("#drawing-history-overlay", el);
  const previewOverlay = $("#drawing-preview-overlay", el);
  const optionsPopover = $("#markup-options-popover", el);
  const colorPopover = $("#markup-color-popover", el);

  let selectedDrawingId = null;
  let currentPreviewMessage = null;
  let cachedMessages = [];

  const liveBuffer = drawingWarm.ctx ? drawingWarm.ctx.canvas : document.createElement("canvas");
  if (!drawingWarm.ctx) {
    liveBuffer.width = canvas.width;
    liveBuffer.height = canvas.height;
  }
  const liveBufferCtx = drawingWarm.ctx || liveBuffer.getContext("2d");

  const boardResizeObserver = new ResizeObserver(() => { if (active) { refreshCanvasRect(); applyZoom(zoom); } });
  boardResizeObserver.observe(drawBoard);
  requestAnimationFrame(() => applyZoom(1));

  // Wheel zoom (Ctrl/Cmd + wheel)
  canvas.addEventListener("wheel", e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    applyZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  }, { passive: false });

  // Pinch zoom (no UI, just fingers)
  let pinchInfo = null;
  let previousPinchCenter = null;
  canvas.addEventListener("touchstart", e => {
    if (e.touches.length === 2) {
      if (drawing && activeStroke) { drawing = false; activeStroke = null; last = null; redrawCanvas(); }
      const [t1, t2] = e.touches;
      const rect = drawBoard.getBoundingClientRect();
      const center = { x: (t1.clientX + t2.clientX) / 2 - rect.left, y: (t1.clientY + t2.clientY) / 2 - rect.top };
      pinchInfo = { startDistance: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY), startZoom: zoom };
      previousPinchCenter = center;
      e.preventDefault();
    }
  }, { passive: false });
  canvas.addEventListener("touchmove", e => {
    if (pinchInfo && e.touches.length === 2) {
      e.preventDefault();
      const [t1, t2] = e.touches;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const rect = drawBoard.getBoundingClientRect();
      const center = { x: (t1.clientX + t2.clientX) / 2 - rect.left, y: (t1.clientY + t2.clientY) / 2 - rect.top };
      if (pinchInfo.startDistance > 0) applyZoom(pinchInfo.startZoom * (dist / pinchInfo.startDistance), center.x, center.y);
      if (previousPinchCenter) {
        drawBoard.scrollLeft -= center.x - previousPinchCenter.x;
        drawBoard.scrollTop -= center.y - previousPinchCenter.y;
      }
      previousPinchCenter = center;
    }
  }, { passive: false });
  canvas.addEventListener("touchend", e => { if (e.touches.length < 2) { pinchInfo = null; previousPinchCenter = null; } });

  $("#drawing-close", el).onclick = () => window.App?.navigate("home");
  $("#drawing-history-open", el).onclick = () => { closePopovers(); loadDrawingMessages(); historyOverlay.classList.remove("hidden"); $("#drawing-history-close", el).focus(); };
  $("#drawing-history-close", el).onclick = closeHistory;
  historyOverlay.onclick = event => { if (event.target === historyOverlay) closeHistory(); };
  function closeHistory() { stopDrawingMessageWatcher(); historyOverlay.classList.add("hidden"); $("#drawing-history-open", el).focus(); }

  function openPreviewModal(message) {
    if (!message) return;
    currentPreviewMessage = message;
    const authorName = getDisplayName(message.authorId, message.authorName || "Us");
    const dateStr = new Date(drawingTimestamp(message)).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    const photoUrl = message.photoUrl || (message.driveFileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(message.driveFileId)}&sz=w1200` : message.thumbnailUrl || "");
    $("#preview-meta-author", el).textContent = `By ${authorName}`;
    $("#preview-meta-date", el).textContent = dateStr;
    const imgEl = $("#preview-modal-img", el);
    if (imgEl) {
      if (photoUrl) imgEl.src = photoUrl; else imgEl.removeAttribute("src");
      if (!photoUrl && message.telegramFileId) getTelegramMediaUrl(message.telegramFileId, message.mimeType || "image/jpeg")
        .then(url => { if (imgEl.isConnected && currentPreviewMessage === message) imgEl.src = url; })
        .catch(error => console.error("Saved drawing could not load from Telegram:", error));
    }
    previewOverlay?.classList.remove("hidden");
  }

  function closePreviewModal() { previewOverlay?.classList.add("hidden"); currentPreviewMessage = null; }
  $("#preview-close-btn", el).onclick = closePreviewModal;
  $("#preview-backdrop", el).onclick = closePreviewModal;

  $("#preview-restore-btn", el).onclick = async () => {
    if (!currentPreviewMessage) return;
    let photoUrl = currentPreviewMessage.photoUrl || (currentPreviewMessage.driveFileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(currentPreviewMessage.driveFileId)}&sz=w1200` : currentPreviewMessage.thumbnailUrl || "");
    if (!photoUrl && currentPreviewMessage.telegramFileId) photoUrl = await getTelegramMediaUrl(currentPreviewMessage.telegramFileId, currentPreviewMessage.mimeType || "image/jpeg");
    if (!photoUrl) { toast("Could not open this drawing."); return; }
    loadSaved(photoUrl); closePreviewModal(); closeHistory(); toast("Drawing loaded on canvas ♡");
  };

  $("#preview-delete-btn", el).onclick = async () => {
    if (!currentPreviewMessage?.id) return;
    if (!window.confirm("Delete this drawing from your shared history?")) return;
    try { await deleteDrawingMessage(currentPreviewMessage.id); toast("Drawing deleted."); closePreviewModal(); }
    catch (err) { toast("Could not delete drawing: " + (err.message || "Failed.")); }
  };

  $("#history-restore-selected", el).onclick = async () => {
    if (!selectedDrawingId) return;
    const message = cachedMessages.find(m => m.id === selectedDrawingId);
    if (!message) return;
    let photoUrl = message.photoUrl || (message.driveFileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(message.driveFileId)}&sz=w1200` : message.thumbnailUrl || "");
    if (!photoUrl && message.telegramFileId) photoUrl = await getTelegramMediaUrl(message.telegramFileId, message.mimeType || "image/jpeg");
    if (!photoUrl) return;
    loadSaved(photoUrl); closeHistory(); toast("Drawing loaded on canvas ♡");
  };

  function restoreHistory() {
    if (history.canRestoreClear) {
      const restoredStrokes = history.restoreClearSnapshot();
      if (!restoredStrokes) return;
      latestRemoteClearKey = null;
      enqueueWrite({ type: "restore", strokes: restoredStrokes });
      redrawCanvas();
      toast("Canvas restored.");
      return;
    }
    if (!history.canUndo) { toast("Nothing to restore."); return; }
    $("#drawing-undo", el).click();
  }
  $("#drawing-history-restore", el).onclick = restoreHistory;

  let canvasRect = null;
  function refreshCanvasRect() { canvasRect = canvas.getBoundingClientRect(); }
  function point(e) {
    const r = canvasRect || refreshCanvasRect();
    const x = ((e.clientX - r.left) / r.width) * 1200;
    const y = ((e.clientY - r.top) / r.height) * 900;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }

  function drawSmoothCurve(targetCtx, points) {
    if (!points || points.length < 2) return;
    if (points.length === 2) { targetCtx.moveTo(points[0].x, points[0].y); targetCtx.lineTo(points[1].x, points[1].y); return; }
    targetCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      targetCtx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    targetCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }

  function renderSingleStroke(targetCtx, stroke) {
    if (!targetCtx || !stroke || !stroke.points || stroke.points.length === 0) return;
    const pts = stroke.points;
    const strokeTool = stroke.tool || "pen";
    const strokeColor = stroke.color || "#dc4d88";
    const strokeSize = stroke.size || 5;
    const strokeOpacity = typeof stroke.opacity === "number" ? stroke.opacity : (strokeTool === "marker" ? 0.8 : (strokeTool === "pencil" ? 0.75 : 1.0));
    targetCtx.save();

    if (strokeTool === "eraser") {
      targetCtx.globalCompositeOperation = "destination-out";
      targetCtx.globalAlpha = 1.0;
      targetCtx.lineWidth = strokeSize;
      targetCtx.lineCap = "round";
      targetCtx.lineJoin = "round";
      if (pts.length === 1) { targetCtx.beginPath(); targetCtx.arc(pts[0].x, pts[0].y, Math.max(1, strokeSize / 2), 0, Math.PI * 2); targetCtx.fill(); }
      else { targetCtx.beginPath(); drawSmoothCurve(targetCtx, pts); targetCtx.stroke(); }
      targetCtx.restore(); return;
    }
    if (strokeTool === "marker") {
      targetCtx.globalCompositeOperation = "source-over";
      targetCtx.globalAlpha = strokeOpacity;
      targetCtx.strokeStyle = strokeColor;
      targetCtx.fillStyle = strokeColor;
      targetCtx.lineWidth = strokeSize;
      targetCtx.lineCap = "round";
      targetCtx.lineJoin = "round";
      if (pts.length === 1) { targetCtx.beginPath(); targetCtx.arc(pts[0].x, pts[0].y, Math.max(1, strokeSize / 2), 0, Math.PI * 2); targetCtx.fill(); }
      else { targetCtx.beginPath(); drawSmoothCurve(targetCtx, pts); targetCtx.stroke(); }
      targetCtx.restore(); return;
    }
    if (strokeTool === "pencil") {
      targetCtx.globalCompositeOperation = "source-over";
      targetCtx.strokeStyle = strokeColor;
      targetCtx.fillStyle = strokeColor;
      targetCtx.lineCap = "round";
      targetCtx.lineJoin = "round";
      if (pts.length === 1) {
        targetCtx.globalAlpha = strokeOpacity * 0.75;
        targetCtx.beginPath(); targetCtx.arc(pts[0].x, pts[0].y, Math.max(1, strokeSize / 2), 0, Math.PI * 2); targetCtx.fill();
      } else {
        targetCtx.globalAlpha = strokeOpacity * 0.55;
        targetCtx.lineWidth = strokeSize;
        targetCtx.beginPath(); drawSmoothCurve(targetCtx, pts); targetCtx.stroke();
        targetCtx.globalAlpha = strokeOpacity * 0.40;
        targetCtx.lineWidth = Math.max(1, strokeSize * 0.55);
        targetCtx.beginPath(); drawSmoothCurve(targetCtx, pts); targetCtx.stroke();
      }
      targetCtx.restore(); return;
    }
    targetCtx.globalCompositeOperation = "source-over";
    targetCtx.globalAlpha = strokeOpacity;
    targetCtx.strokeStyle = strokeColor;
    targetCtx.fillStyle = strokeColor;
    targetCtx.lineWidth = strokeSize;
    targetCtx.lineCap = "round";
    targetCtx.lineJoin = "round";
    if (pts.length === 1) { targetCtx.beginPath(); targetCtx.arc(pts[0].x, pts[0].y, Math.max(1, strokeSize / 2), 0, Math.PI * 2); targetCtx.fill(); }
    else { targetCtx.beginPath(); drawSmoothCurve(targetCtx, pts); targetCtx.stroke(); }
    targetCtx.restore();
  }

  function redrawCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of history.strokes) renderSingleStroke(ctx, stroke);
    if (activeStroke) renderSingleStroke(ctx, activeStroke);
    refreshHistoryControls();
  }

  function refreshHistoryControls() {
    const undoBtn = $("#drawing-undo", el);
    const redoBtn = $("#drawing-redo", el);
    const restoreBtn = $("#drawing-history-restore", el);
    if (undoBtn) undoBtn.disabled = !history.canUndo;
    if (redoBtn) redoBtn.disabled = !history.canRedo;
    if (restoreBtn) {
      restoreBtn.disabled = !history.canUndo;
      restoreBtn.textContent = history.canRestoreClear ? "Restore last clear" : "Restore last";
    }
  }

  function updateSyncStatus(message = "") {
    if (!syncLabel) return;
    const queued = outgoingQueue.length;
    if (!navigator.onLine) {
      syncLabel.textContent = queued ? `${queued} stroke${queued === 1 ? "" : "s"} saved on this device · Offline` : "Offline · New strokes save on this device";
      syncLabel.classList.add("offline");
    } else if (pendingWrites || queued) {
      syncLabel.textContent = message || `Syncing ${pendingWrites + queued} stroke${pendingWrites + queued === 1 ? "" : "s"}…`;
      syncLabel.classList.remove("offline");
    } else {
      syncLabel.textContent = message || "All changes saved";
      syncLabel.classList.remove("offline");
    }
  }

  function enqueueWrite(operation) {
    const id = operation.id || `${operation.type}-${uuid()}`;
    const queuedOperation = { ...operation, id, uid: user.uid };
    if (["stroke", "redo"].includes(queuedOperation.type)) queuedOperation.opId ||= uuid();
    if (["undo", "clear"].includes(queuedOperation.type)) queuedOperation.idempotent = true;
    pendingWrites++;
    updateSyncStatus();
    if (!navigator.onLine) {
      outgoingQueue.add(queuedOperation);
      pendingWrites = Math.max(0, pendingWrites - 1);
      updateSyncStatus();
      return Promise.resolve(null);
    }
    return push(strokeRef, queuedOperation)
      .then(value => value)
      .catch(error => {
        outgoingQueue.add(queuedOperation);
        toast("Changes saved on this device. They'll sync when you reconnect.");
        console.error("Drawing sync failed; queued locally:", error);
        return null;
      })
      .finally(() => { pendingWrites = Math.max(0, pendingWrites - 1); updateSyncStatus(); });
  }

  async function flushOfflineQueue() {
    if (!navigator.onLine || !active || !outgoingQueue.length) { updateSyncStatus(); return; }
    const queuedOperations = outgoingQueue.getAll();
    if (!queuedOperations.length) return;
    syncLabel?.classList.add("syncing");
    updateSyncStatus("Syncing saved strokes…");
    let knownOperations = [];
    try {
      const currentSnapshot = await get(strokeRef);
      knownOperations = Object.values(currentSnapshot.val() || {});
    } catch (error) {
      console.error("Offline drawing sync could not read prior strokes:", error);
    }
    for (const operation of queuedOperations) {
      if (!navigator.onLine || !active) break;
      pendingWrites++;
      try {
        const currentSnapshot = await get(strokeRef);
        const knownOperations = Object.values(currentSnapshot.val() || {});
        if (operation.type === "stroke" || operation.type === "redo") {
          const prior = knownOperations.find(item => item.opId && item.opId === operation.opId);
          if (!prior) await push(strokeRef, operation);
        } else if (operation.idempotent) {
          const prior = knownOperations.find(item => item.id === operation.id);
          if (!prior) await push(strokeRef, operation);
        } else await push(strokeRef, operation);
        outgoingQueue.remove(operation.id);
      } catch (error) { console.error("Offline drawing sync will retry:", error); break; }
      finally { pendingWrites = Math.max(0, pendingWrites - 1); }
    }
    syncLabel?.classList.remove("syncing");
    updateSyncStatus(outgoingQueue.length ? "Some strokes are waiting to sync" : "All changes saved");
    if (outgoingQueue.length) toast("Some strokes are still waiting to sync.");
  }

  // ═════════════════════════════════════════════════════
  //  Pointer handlers — drawing works immediately; sync happens in background.
  // ═════════════════════════════════════════════════════
  canvas.addEventListener("pointerdown", e => {
    if (e.pointerType === "touch" && e.isPrimary === false) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (drawing) return;
    e.preventDefault();
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    canvas.setPointerCapture(e.pointerId);
    closePopovers();
    refreshCanvasRect();

    drawing = true;
    last = point(e);
    activeStroke = {
      id: uuid(),
      uid: user.uid,
      tool,
      color: tool === "eraser" ? "#ffffff" : color,
      size: toolConfigs[tool].size,
      opacity: toolConfigs[tool].opacity,
      points: [last]
    };
    liveBufferCtx.clearRect(0, 0, canvas.width, canvas.height);
    liveBufferCtx.drawImage(canvas, 0, 0);
    renderSingleStroke(ctx, activeStroke);
  });

  let moveFrame = null, movePoint = null;
  canvas.addEventListener("pointermove", e => {
    if (!drawing || !activeStroke || !last) return;
    if (e.cancelable) e.preventDefault();
    movePoint = point(e);
    if (moveFrame) return;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = null;
      const p = movePoint;
      movePoint = null;
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (dx * dx + dy * dy < 1.5) return;
      activeStroke.points.push(p);
      last = p;
      ctx.drawImage(liveBuffer, 0, 0);
      renderSingleStroke(ctx, activeStroke);
    });
  });

  function endStroke() {
    cancelAnimationFrame(moveFrame);
    moveFrame = null; movePoint = null;
    if (drawing && activeStroke && activeStroke.points && activeStroke.points.length > 0) {
      history.add(activeStroke);
      const committedStroke = activeStroke;
      strokeIds.set(committedStroke.id, null);
      enqueueWrite({ type: "stroke", ...committedStroke }).then(value => { if (value?.key) strokeIds.set(committedStroke.id, value.key); });
      refreshHistoryControls();
    }
    drawing = false;
    last = null;
    activeStroke = null;
  }
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
  canvas.addEventListener("lostpointercapture", endStroke);

  drawBoard.addEventListener("scroll", refreshCanvasRect, { passive: true });

  function applyRemoteOperation(s, allowPartnerClearPrompt) {
    if (knownOperationKeys.has(s.key)) return;
    knownOperationKeys.add(s.key);
    const v = s.val();
    if (!v) return;

    const redrawWhenIdle = () => { if (!initialLoading) redrawCanvas(); };

    if (v.type === "clear") {
      if (v.uid === user.uid) { latestRemoteClearKey = null; history.reset(); outgoingQueue.clear(); }
      else {
        history.clear();
        latestRemoteClearKey = s.key;
        for (const operation of outgoingQueue.getAll()) { if (["stroke", "redo", "undo"].includes(operation.type)) outgoingQueue.remove(operation.id); }
        if (allowPartnerClearPrompt && history.canRestoreClear && window.confirm("Your partner cleared the shared canvas. Restore your last version?")) {
          const restoredStrokes = history.restoreClearSnapshot();
          if (restoredStrokes) enqueueWrite({ type: "restore", strokes: restoredStrokes });
          latestRemoteClearKey = null;
        }
      }
      strokeIds.clear(); redrawWhenIdle(); return;
    }
    if (v.type === "restore") {
      history.replace(v.strokes || []);
      strokeIds = new Map(history.strokes.map(stroke => [stroke.id, null]));
      latestRemoteClearKey = null;
      outgoingQueue.clear();
      redrawWhenIdle(); return;
    }
    if (v.type === "undo") {
      history.applyUndo(v.strokeId);
      if (v.uid !== user.uid) { for (const operation of outgoingQueue.getAll()) { if (operation.type === "redo" && operation.stroke?.id === v.strokeId) outgoingQueue.remove(operation.id); } }
      else if (outgoingQueue.length && navigator.onLine) flushOfflineQueue();
      strokeIds.delete(v.strokeId); redrawWhenIdle(); return;
    }
    if (v.type === "redo") {
      history.applyRedo(v.stroke);
      strokeIds.set(v.stroke.id, s.key);
      redrawWhenIdle(); return;
    }
    if (v.type === "stroke") {
      if (history.strokes.some(stroke => stroke.id === v.id)) return;
      history.add(v);
      strokeIds.set(v.id, s.key);
      // A partner stroke arriving while the local user is drawing is painted
      // directly onto both the visible canvas and the live buffer so it stays
      // visible when pointermove redraws the buffer. No full redraw mid-stroke.
      if (drawing) {
        renderSingleStroke(ctx, v);
        renderSingleStroke(liveBufferCtx, v);
        refreshHistoryControls();
      } else {
        renderSingleStroke(ctx, v);
        refreshHistoryControls();
      }
    }
  }

  let initialLoading = true;
  const initialEvents = [];
  updateSyncStatus("Loading shared canvas…");
  unsubs.push(onChildAdded(strokeRef, snapshot => {
    if (!active) return;
    if (initialLoading) { initialEvents.push(snapshot); return; }
    applyRemoteOperation(snapshot, true);
  }));

  // Download the strokes log exactly once per drawing-page open: one get()
  // for the initial state (merged with any events that arrived while it was
  // in flight), then onChildAdded handles live updates. Operations are
  // applied to in-memory state (history, strokeIds, knownOperationKeys)
  // sorted by key WITHOUT drawing; the canvas is redrawn exactly once at
  // the end, so initial load is O(n) instead of O(n^2).
  get(strokeRef).then(snapshot => {
    if (!active) return;
    const all = new Map();
    snapshot.forEach(operation => all.set(operation.key, operation));
    initialEvents.forEach(operation => { if (!all.has(operation.key)) all.set(operation.key, operation); });
    const ops = [...all.values()].sort((a, b) => a.key.localeCompare(b.key));
    for (const operation of ops) applyRemoteOperation(operation, false);
    initialLoading = false;
    initialEvents.length = 0;
    redrawCanvas();
    if (drawing) liveBufferCtx.drawImage(canvas, 0, 0);
    updateSyncStatus();
  }).catch(error => {
    if (!active) return;
    console.warn("Could not load the initial shared canvas snapshot; applying available updates.", error);
    initialEvents.sort((a, b) => a.key.localeCompare(b.key));
    for (const operation of initialEvents) applyRemoteOperation(operation, false);
    initialLoading = false;
    initialEvents.length = 0;
    redrawCanvas();
    if (drawing) liveBufferCtx.drawImage(canvas, 0, 0);
    updateSyncStatus();
  });

  let isConnected = false;
  let presenceState = {};

  function updatePresenceUI() {
    const presence = $("#drawing-presence", el);
    const dot = $(".presence-dot", el);
    if (!presence || !dot) return;
    if (!isConnected) { presence.textContent = "Offline · Draw and send when you reconnect"; dot.classList.remove("online"); return; }
    const partnerOnline = Object.values(presenceState || {}).some(p => p.uid && p.uid !== user.uid && p.state === "online");
    if (partnerOnline) { presence.textContent = "Both online · Drawing together!"; dot.classList.add("online"); }
    else { presence.textContent = "You're online · Waiting for your person…"; dot.classList.add("online"); }
  }

  unsubs.push(onValue(connectedRef, s => {
    if (!active) return;
    isConnected = s.val() === true;
    updatePresenceUI();
    if (isConnected) {
      set(presenceRef, { name: profile.name, uid: user.uid, state: "online", lastSeen: Date.now() });
      onDisconnect(presenceRef).set({ name: profile.name, uid: user.uid, state: "offline", lastSeen: Date.now() });
    }
  }));

  const presenceListRef = ref(rtdb, `${root}/presence`);
  unsubs.push(onValue(presenceListRef, s => {
    if (!active || !el.isConnected) return;
    presenceState = s.val() || {};
    updatePresenceUI();
  }));

  function closePopovers() { optionsPopover?.classList.add("hidden"); colorPopover?.classList.add("hidden"); }

  function updateColor(newColor) {
    color = newColor;
    el.querySelectorAll(".tool-color-fill").forEach(node => node.setAttribute("fill", newColor));
    const colorDisc = $("#markup-color-disc", el);
    if (colorDisc) colorDisc.style.backgroundColor = newColor;
    const customInput = $("#markup-custom-color-input", el);
    if (customInput) customInput.value = newColor;
    const customHex = $("#markup-color-hex", el);
    if (customHex) customHex.textContent = newColor.toUpperCase();
    el.querySelectorAll(".palette-swatch").forEach(swatch => {
      const match = swatch.dataset.color.toLowerCase() === newColor.toLowerCase();
      swatch.classList.toggle("selected", match);
      swatch.setAttribute("aria-pressed", String(match));
    });
    updateTuneButtonPreview();
    updatePopoverPreview();
  }

  function selectTool(newTool, toggleOptionsOnSame = false) {
    if (tool === newTool && toggleOptionsOnSame) { colorPopover?.classList.add("hidden"); optionsPopover?.classList.toggle("hidden"); return; }
    if (newTool !== "eraser") lastNonEraserTool = newTool;
    tool = newTool;
    colorPopover?.classList.add("hidden");
    el.querySelectorAll(".markup-tool").forEach(b => {
      const isSelected = b.dataset.tool === tool;
      b.classList.toggle("selected", isSelected);
      b.setAttribute("aria-pressed", String(isSelected));
    });
    const config = toolConfigs[tool];
    const popoverTitle = $("#popover-tool-title", el);
    const popoverBadge = $("#popover-tool-badge", el);
    if (popoverTitle) popoverTitle.textContent = config.title;
    if (popoverBadge) popoverBadge.textContent = config.badge;
    const opacitySection = $("#popover-opacity-section", el);
    if (opacitySection) opacitySection.classList.toggle("hidden", tool === "eraser");
    renderSizePresets();
    updateSizeControls();
    updateOpacityControls();
    updateTuneButtonPreview();
    updatePopoverPreview();
  }

  function renderSizePresets() {
    const pillsRow = $("#size-preset-pills", el);
    if (!pillsRow) return;
    const presets = toolConfigs[tool].presets;
    const labels = ["Thin", "Medium", "Thick", "Heavy"];
    pillsRow.innerHTML = presets.map((sizeVal, idx) => `<button type="button" data-size="${sizeVal}" class="preset-pill ${toolConfigs[tool].size === sizeVal ? "active" : ""}">${labels[idx]}</button>`).join("");
    pillsRow.querySelectorAll("[data-size]").forEach(b => { b.onclick = () => setToolSize(Number(b.dataset.size)); });
  }

  function setToolSize(newSize) { toolConfigs[tool].size = newSize; updateSizeControls(); updateTuneButtonPreview(); updatePopoverPreview(); }

  function updateSizeControls() {
    const curSize = toolConfigs[tool].size;
    const slider = $("#popover-size-slider", el);
    const sizeText = $("#popover-size-text", el);
    if (slider) { slider.value = String(curSize); slider.setAttribute("aria-valuetext", `${curSize} px`); }
    if (sizeText) sizeText.textContent = `${curSize} px`;
    $("#size-preset-pills", el)?.querySelectorAll("[data-size]").forEach(b => { b.classList.toggle("active", Number(b.dataset.size) === curSize); });
  }

  function setToolOpacity(newOpacity) {
    toolConfigs[tool].opacity = Math.max(0.1, Math.min(1.0, newOpacity));
    updateOpacityControls();
    updateMarkerBarrelOpacity();
    updatePopoverPreview();
  }

  function updateOpacityControls() {
    const curOpacity = Math.round(toolConfigs[tool].opacity * 100);
    const slider = $("#popover-opacity-slider", el);
    const opacityText = $("#popover-opacity-text", el);
    if (slider) { slider.value = String(curOpacity); slider.setAttribute("aria-valuetext", `${curOpacity}%`); }
    if (opacityText) opacityText.textContent = `${curOpacity}%`;
    $("#opacity-preset-pills", el)?.querySelectorAll("[data-opacity]").forEach(b => { b.classList.toggle("active", Number(b.dataset.opacity) === curOpacity); });
  }

  function updateMarkerBarrelOpacity() {
    const markerOpacityPercent = Math.round(toolConfigs.marker.opacity * 100);
    el.querySelectorAll(".marker-opacity-label").forEach(label => { label.textContent = String(markerOpacityPercent); });
  }

  function updateTuneButtonPreview() {
    const dot = $("#markup-size-dot", el);
    const badge = $("#markup-size-badge", el);
    const currentSize = toolConfigs[tool].size;
    if (dot) {
      const visualSize = Math.max(4, Math.min(16, Math.round(currentSize * 0.4) + 4));
      dot.style.width = `${visualSize}px`;
      dot.style.height = `${visualSize}px`;
      dot.style.backgroundColor = tool === "eraser" ? "#ffffff" : color;
      dot.style.border = tool === "eraser" ? "1.5px solid #a43262" : "1px solid rgba(0,0,0,0.12)";
    }
    if (badge) badge.textContent = `${currentSize}px`;
  }

  function updatePopoverPreview() {
    const preview = $("#popover-stroke-preview", el);
    if (!preview) return;
    const currentSize = toolConfigs[tool].size;
    const currentOpacity = toolConfigs[tool].opacity;
    const visualSize = Math.max(4, Math.min(44, currentSize));
    preview.style.width = `${visualSize}px`;
    preview.style.height = `${visualSize}px`;
    preview.style.backgroundColor = tool === "eraser" ? "#ffffff" : color;
    preview.style.opacity = tool === "eraser" ? "1.0" : String(currentOpacity);
    preview.style.border = tool === "eraser" ? "1.5px solid #a43262" : "0";
  }

  el.querySelectorAll(".markup-tool").forEach(btn => { btn.onclick = () => { selectTool(btn.dataset.tool, true); }; });
  $("#markup-color-btn", el).onclick = () => { optionsPopover?.classList.add("hidden"); if (tool === "eraser") selectTool(lastNonEraserTool); colorPopover?.classList.toggle("hidden"); };
  $("#markup-tune-btn", el).onclick = () => { colorPopover?.classList.add("hidden"); optionsPopover?.classList.toggle("hidden"); };

  const sizeSlider = $("#popover-size-slider", el);
  if (sizeSlider) sizeSlider.oninput = event => setToolSize(Number(event.target.value));
  const opacitySlider = $("#popover-opacity-slider", el);
  if (opacitySlider) opacitySlider.oninput = event => setToolOpacity(Number(event.target.value) / 100);

  $("#opacity-preset-pills", el)?.querySelectorAll("[data-opacity]").forEach(b => { b.onclick = () => setToolOpacity(Number(b.dataset.opacity) / 100); });
  el.querySelectorAll(".palette-swatch").forEach(swatch => { swatch.onclick = () => { updateColor(swatch.dataset.color); if (tool === "eraser") selectTool(lastNonEraserTool); }; });

  const customColorInput = $("#markup-custom-color-input", el);
  if (customColorInput) customColorInput.oninput = event => { updateColor(event.target.value); if (tool === "eraser") selectTool(lastNonEraserTool); };

  const handleOutsidePointer = event => {
    const target = event.target;
    if (!target.closest(".markup-dock-container") && !target.closest("#markup-color-btn") && !target.closest("#markup-tune-btn")) closePopovers();
  };
  document.addEventListener("pointerdown", handleOutsidePointer);

  $("#drawing-undo", el).onclick = () => {
    closePopovers();
    const action = history.undo();
    if (!action) { toast("Nothing to undo."); return; }
    redrawCanvas();
    if (action.type === "undo") enqueueWrite({ type: "undo", strokeId: action.stroke.id });
    else { latestRemoteClearKey = null; enqueueWrite({ type: "restore", strokes: action.strokes }); }
  };

  $("#drawing-redo", el).onclick = () => {
    closePopovers();
    const stroke = history.redo();
    if (!stroke) return;
    redrawCanvas();
    enqueueWrite({ type: "redo", stroke });
  };

  $("#drawing-clear", el).onclick = async () => {
    closePopovers();
    if (!history.strokes.length) { toast("The canvas is already empty."); return; }
    if (!window.confirm("Clear the shared canvas for both of you? You can undo this clear.")) return;
    history.clear();
    latestRemoteClearKey = null;
    strokeIds.clear();
    for (const operation of outgoingQueue.getAll()) { if (["stroke", "redo", "undo"].includes(operation.type)) outgoingQueue.remove(operation.id); }
    redrawCanvas();
    await enqueueWrite({ type: "clear" });
    toast("Canvas cleared. Undo can restore it.");
  };

  const handleHistoryKeydown = event => {
    if (event.key === "Escape") {
      if (previewOverlay && !previewOverlay.classList.contains("hidden")) { closePreviewModal(); return; }
      if (optionsPopover && !optionsPopover.classList.contains("hidden")) { closePopovers(); return; }
      if (colorPopover && !colorPopover.classList.contains("hidden")) { closePopovers(); return; }
      if (!historyOverlay.classList.contains("hidden")) { closeHistory(); return; }
    }
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z") { event.preventDefault(); $("#drawing-undo", el)?.click(); }
    else if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "z") { event.preventDefault(); $("#drawing-redo", el)?.click(); }
    else if (event.key === "1") selectTool("pen");
    else if (event.key === "2") selectTool("pencil");
    else if (event.key === "3") selectTool("marker");
    else if (event.key === "4") selectTool("eraser");
    else if ((event.metaKey || event.ctrlKey) && event.key === "0") { event.preventDefault(); applyZoom(1); }
    else if (event.key === "+" || event.key === "=") applyZoom(zoom + ZOOM_STEP);
    else if (event.key === "-") applyZoom(zoom - ZOOM_STEP);
  };
  document.addEventListener("keydown", handleHistoryKeydown);

  const handleOnline = () => { updateSyncStatus("Back online · syncing strokes…"); flushOfflineQueue(); };
  const handleOffline = () => updateSyncStatus();
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  window.addEventListener("beforeunload", outgoingQueue.persist);

  selectTool("pen");
  updateColor(color);
  updateSyncStatus();
  flushOfflineQueue();
  refreshHistoryControls();

  $("#drawing-save", el).onclick = saveDrawing;

  async function saveDrawing() {
    closePopovers();
    if (!history.strokes.length) { toast("Add a drawing before sending."); return; }
    const btn = $("#drawing-save", el);
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const createdAtMs = Date.now();
      const timestamp = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(createdAtMs));
      const artistName = profile.name || user.displayName || "Partner";
      const exportCanvas = document.createElement("canvas");
      const canvasRect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
      const exportWidth = canvas.width || Math.round(canvasRect.width * pixelRatio);
      const exportHeight = canvas.height || Math.round(canvasRect.height * pixelRatio);
      const footerScale = exportWidth / Math.max(1, canvasRect.width);
      const footerHeight = Math.round(42 * footerScale);
      exportCanvas.width = exportWidth;
      exportCanvas.height = exportHeight + footerHeight;
      const exportContext = exportCanvas.getContext("2d");
      if (!exportContext) throw new Error("Drawing preparation failed.");
      exportContext.fillStyle = "#fff";
      exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      exportContext.drawImage(canvas, 0, 0, exportWidth, exportHeight);
      const footerTop = exportHeight;
      exportContext.fillStyle = "#fff9fc";
      exportContext.fillRect(0, footerTop, exportCanvas.width, footerHeight);
      exportContext.strokeStyle = "#f0dfe7";
      exportContext.lineWidth = Math.max(1, footerScale);
      exportContext.beginPath();
      exportContext.moveTo(0, footerTop + 0.5 * footerScale);
      exportContext.lineTo(exportCanvas.width, footerTop + 0.5 * footerScale);
      exportContext.stroke();
      exportContext.fillStyle = "#806b75";
      exportContext.font = `500 ${Math.max(12, Math.round(11 * footerScale))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      exportContext.textBaseline = "middle";
      exportContext.textAlign = "left";
      const footerPadding = Math.round(12 * footerScale);
      exportContext.fillText(`Drawn by ${artistName} • ${timestamp}`, footerPadding, footerTop + footerHeight / 2, exportCanvas.width - footerPadding * 2);

      const imageBlob = await new Promise((resolve, reject) => exportCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not prepare drawing image.")), "image/jpeg", 0.96));
      const telegramFile = new File([imageBlob], `canvas-drawing-${createdAtMs}.jpg`, { type: "image/jpeg" });
      const telegramResult = await sendToTelegram(telegramFile, `New Canvas Drawing 🎨 · ${artistName} · ${timestamp}`);
      const drawingRef = await addDrawingMessage({
        authorId: user.uid,
        authorName: artistName,
        ...telegramMediaReferences(telegramResult),
        mimeType: "image/jpeg",
        createdAtMs
      });
      await notifyPartnerSafely(getProfileKey(profile), "drawing", `${profile.name} added a new drawing! 🎨`, drawingRef.id, "drawing");

      history.reset();
      latestRemoteClearKey = null;
      strokeIds.clear();
      redrawCanvas();
      outgoingQueue.clear();
      await enqueueWrite({ type: "clear" });
      toast("Drawing saved to your shared gallery ♡");
    } catch (e) {
      toast(e.message || "Save failed.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save & Send ♡";
    }
  }

  const pastelPalette = ["#d8effa","#cfd8dc","#e2f2df","#fae3eb","#f6e5dc","#e7dcf7","#fef1d8","#fde7f3"];

  function formatShortDate(timestamp) {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function renderHistoryCards(messages, limit) {
    const historyList = $("#drawing-history-list", el);
    const countBadge = $("#drawing-history-count", el);
    const restoreSelectedBtn = $("#history-restore-selected", el);
    if (!historyList) return;
    if (countBadge) countBadge.textContent = messages.length ? `${messages.length} saved drawing${messages.length === 1 ? "" : "s"}` : "No drawings saved";
    if (restoreSelectedBtn) restoreSelectedBtn.classList.toggle("hidden", !selectedDrawingId);
    if (!messages.length) {
      historyList.innerHTML = `<div class="empty-diary" style="grid-column: 1 / -1; text-align: center; padding: 36px 0;"><span>♡</span><p>No drawings saved yet.</p></div>`;
      return;
    }
    historyList.innerHTML = messages.map((m, index) => {
      const cardBg = pastelPalette[index % pastelPalette.length];
      const isSelected = selectedDrawingId === m.id;
      const authorName = getDisplayName(m.authorId, m.authorName || "Us");
      const shortDate = formatShortDate(drawingTimestamp(m));
      const photoUrl = m.photoUrl || (m.driveFileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(m.driveFileId)}&sz=w512` : m.thumbnailUrl || "");
      const telegramImage = !photoUrl && m.telegramFileId;
      return `
        <article class="drawing-grid-card ${isSelected ? "selected" : ""}" style="--card-bg: ${cardBg};" data-card-id="${esc(m.id)}">
          <button type="button" class="drawing-card-thumb-btn" data-open-preview="${esc(m.id)}" aria-label="View drawing by ${esc(authorName)}">
            ${photoUrl ? `<img src="${esc(photoUrl)}" alt="Drawing by ${esc(authorName)}" loading="lazy">` : telegramImage ? `<img data-drawing-file-id="${esc(m.telegramFileId)}" data-drawing-mime="${esc(m.mimeType || "image/jpeg")}" alt="Drawing by ${esc(authorName)}" loading="lazy">` : `<span style="font-size:32px;">🎨</span>`}
          </button>
          <button type="button" class="drawing-select-circle-btn" data-select-id="${esc(m.id)}" aria-label="Select drawing"><span class="selection-circle ${isSelected ? "checked" : ""}"></span></button>
          <button type="button" class="drawing-card-delete-btn" data-delete-id="${esc(m.id)}" aria-label="Delete drawing"><svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          <div class="drawing-card-footer"><span class="drawing-card-author">${esc(authorName)}</span><span class="drawing-card-date">${shortDate}</span></div>
        </article>`;
    }).join("");

    if (messages.length && limit && messages.length >= limit) {
      const loadMoreBtn = document.createElement("button");
      loadMoreBtn.type = "button";
      loadMoreBtn.className = "tool-button";
      loadMoreBtn.textContent = "Load more";
      loadMoreBtn.onclick = () => loadDrawingMessages(true);
      historyList.appendChild(loadMoreBtn);
    }

    observeLazyImages(historyList);

    el.querySelectorAll("[data-open-preview]").forEach(btn => { btn.onclick = () => { const id = btn.dataset.openPreview; const msg = messages.find(m => m.id === id); if (msg) openPreviewModal(msg); }; });
    el.querySelectorAll("[data-select-id]").forEach(btn => { btn.onclick = e => { e.stopPropagation(); const id = btn.dataset.selectId; selectedDrawingId = (selectedDrawingId === id) ? null : id; renderHistoryCards(messages, limit); }; });
    el.querySelectorAll("[data-delete-id]").forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        const id = btn.dataset.deleteId;
        if (!window.confirm("Delete this drawing from your shared history?")) return;
        try { if (selectedDrawingId === id) selectedDrawingId = null; await deleteDrawingMessage(id); toast("Drawing deleted."); }
        catch (err) { toast("Could not delete drawing: " + (err.message || "Failed.")); }
      };
    });
  }

  let stopDrawingMessages = null;
  let imageObserver = null;

  function stopDrawingMessageWatcher() {
    if (stopDrawingMessages) { stopDrawingMessages(); stopDrawingMessages = null; }
    if (imageObserver) { imageObserver.disconnect(); imageObserver = null; }
  }

  function observeLazyImages(container) {
    if (!container || !("IntersectionObserver" in window)) return;
    imageObserver?.disconnect();
    imageObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        imageObserver.unobserve(img);
        const fileId = img.dataset.drawingFileId;
        if (!fileId || img.src) return;
        getTelegramMediaUrl(fileId, img.dataset.drawingMime || "image/jpeg")
          .then(url => { if (img.isConnected) img.src = url; })
          .catch(error => console.error("Drawing preview could not load from Telegram:", error));
      });
    }, { rootMargin: "200px 0px" });
    container.querySelectorAll("img[data-drawing-file-id]").forEach(img => imageObserver.observe(img));
  }

  async function loadDrawingMessages(loadMore = false) {
    if (!active || !el.isConnected) return;
    const historyList = $("#drawing-history-list", el);
    if (!historyList) return;
    if (!loadMore) {
      cachedMessages = [];
      historyList.innerHTML = `<p class="muted">Loading saved drawings…</p>`;
    }
    stopDrawingMessageWatcher();
    const limit = 20 + (loadMore ? cachedMessages.length : 0);
    stopDrawingMessages = watchDrawingMessages(messages => {
      if (!active || !el.isConnected) return;
      const sortedMessages = [...messages].sort((a, b) => drawingTimestamp(b) - drawingTimestamp(a));
      cachedMessages = sortedMessages;
      renderHistoryCards(cachedMessages, limit);
    }, limit);
  }

  function drawingTimestamp(message) {
    if (message.createdAt?.toDate) return message.createdAt.toDate().getTime();
    if (message.createdAtMs) return message.createdAtMs;
    return 0;
  }

  function loadSaved(photoUrl) {
    const img = new Image();
    img.onload = () => {
      history.reset();
      latestRemoteClearKey = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      refreshHistoryControls();
      historyOverlay.classList.add("hidden");
    };
    img.onerror = () => toast("Could not open this drawing.");
    img.src = photoUrl;
  }

  activeDrawingCleanup = () => {
    active = false;
    stopDrawingMessageWatcher();
    outgoingQueue.persist();
    boardResizeObserver.disconnect();
    unsubs.forEach(stop => stop());
    document.removeEventListener("keydown", handleHistoryKeydown);
    document.removeEventListener("pointerdown", handleOutsidePointer);
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    window.removeEventListener("beforeunload", outgoingQueue.persist);
    onDisconnect(presenceRef).cancel();
    set(presenceRef, { name: profile.name, uid: user.uid, state: "offline", lastSeen: Date.now() });
  };
}
