import { $, esc, toast } from "./utils.js";
import { rtdb } from "./firebase.js";
import { addDrawingMessage, watchDrawingMessages, deleteDrawingMessage, notifyPartnerSafely } from "./firestore.js";
import { getTelegramMediaUrl, sendToTelegram, telegramMediaReferences } from "../src/services/telegramService.js";
import { getDisplayName, getProfileKey } from "./profile-data.js";
import { createDrawingHistory, createOfflineQueue } from "./drawing-fixes.js";
import { ref, push, get, onChildAdded, onValue, onDisconnect, set } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const root = "couples/our-little-world/drawing";
let activeDrawingCleanup = null;

export function disposeDrawing() { activeDrawingCleanup?.(); activeDrawingCleanup = null; }

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
          <div class="drawing-presence-pill"><span class="presence-dot"></span><span id="drawing-presence">Connecting…</span></div>
        </div>
      </div>
    </header>

    <div class="draw-board">
      <canvas class="draw-canvas" id="draw-canvas" width="720" height="1200" aria-label="Shared drawing canvas" role="img" tabindex="0"></canvas>
      <div class="canvas-watermark">K &amp; S ♡</div>
    </div>

    <div class="markup-dock-container">
      <div class="markup-popovers-host">
        <!-- Tool Options Popover (Size & Opacity) -->
        <div class="markup-popover hidden" id="markup-options-popover" role="dialog" aria-modal="false" aria-label="Tool options">
          <div class="popover-header">
            <strong id="popover-tool-title">Pen</strong>
            <span class="popover-badge" id="popover-tool-badge">Solid Ink</span>
          </div>
          <div class="popover-section">
            <div class="popover-label-row">
              <span>Stroke Width</span>
              <strong id="popover-size-text">5 px</strong>
            </div>
            <div class="preset-pills-row" id="size-preset-pills">
              <button type="button" data-size="2" class="preset-pill">Thin</button>
              <button type="button" data-size="5" class="preset-pill active">Regular</button>
              <button type="button" data-size="12" class="preset-pill">Thick</button>
              <button type="button" data-size="24" class="preset-pill">Bold</button>
            </div>
            <input type="range" id="popover-size-slider" min="2" max="60" value="5" class="apple-slider" aria-label="Stroke width">
          </div>
          <div class="popover-section" id="popover-opacity-section">
            <div class="popover-label-row">
              <span>Opacity</span>
              <strong id="popover-opacity-text">80%</strong>
            </div>
            <div class="preset-pills-row" id="opacity-preset-pills">
              <button type="button" data-opacity="30" class="preset-pill">30%</button>
              <button type="button" data-opacity="50" class="preset-pill">50%</button>
              <button type="button" data-opacity="80" class="preset-pill active">80%</button>
              <button type="button" data-opacity="100" class="preset-pill">100%</button>
            </div>
            <input type="range" id="popover-opacity-slider" min="10" max="100" step="5" value="80" class="apple-slider" aria-label="Tool opacity">
          </div>
          <div class="popover-preview-box">
            <div class="popover-stroke-preview" id="popover-stroke-preview"></div>
          </div>
        </div>

        <!-- Color Palette Popover -->
        <div class="markup-popover hidden" id="markup-color-popover" role="dialog" aria-modal="false" aria-label="Color Palette">
          <div class="popover-header">
            <strong>Color Palette</strong>
          </div>
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

      <!-- Apple Markup Dock Toolbar -->
      <div class="apple-markup-dock" role="toolbar" aria-label="Apple Markup Drawing Tools">
        <div class="markup-tools-row">
        <div class="markup-tool-group" role="group" aria-label="Drawing tools">
        <!-- Pen Tool -->
        <button type="button" class="markup-tool selected" data-tool="pen" aria-label="Pen tool (Solid ink)" title="Pen (1)">
          <svg viewBox="0 0 36 84" class="tool-svg" aria-hidden="true">
            <defs>
              <linearGradient id="apple-pen-barrel" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#d8d8de"/>
                <stop offset="26%" stop-color="#ffffff"/>
                <stop offset="70%" stop-color="#f0f0f4"/>
                <stop offset="100%" stop-color="#c6c6ce"/>
              </linearGradient>
              <linearGradient id="apple-pen-cone" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#dedee4"/>
                <stop offset="35%" stop-color="#ffffff"/>
                <stop offset="100%" stop-color="#b8b8c2"/>
              </linearGradient>
              <linearGradient id="apple-pen-metal" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#9999a2"/>
                <stop offset="35%" stop-color="#ffffff"/>
                <stop offset="70%" stop-color="#b5b5be"/>
                <stop offset="100%" stop-color="#707078"/>
              </linearGradient>
            </defs>
            <rect x="10" y="32" width="16" height="52" rx="1" fill="url(#apple-pen-barrel)"/>
            <rect x="10" y="38" width="16" height="6" class="tool-color-fill" fill="#dc4d88"/>
            <line x1="10" y1="44" x2="26" y2="44" stroke="#a0a0aa" stroke-width="0.5"/>
            <path d="M 10 32 L 15 12 L 21 12 L 26 32 Z" fill="url(#apple-pen-cone)"/>
            <rect x="16" y="8" width="4" height="4" fill="url(#apple-pen-metal)"/>
            <path d="M 16.5 8 L 18 2 L 19.5 8 Z" class="tool-color-fill" fill="#dc4d88"/>
          </svg>
        </button>

        <!-- Pencil Tool -->
        <button type="button" class="markup-tool" data-tool="pencil" aria-label="Pencil tool (Graphite sketch)" title="Pencil (2)">
          <svg viewBox="0 0 36 84" class="tool-svg" aria-hidden="true">
            <defs>
              <linearGradient id="apple-pencil-barrel" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#e0e0e5"/>
                <stop offset="25%" stop-color="#ffffff"/>
                <stop offset="60%" stop-color="#f2f2f6"/>
                <stop offset="100%" stop-color="#ceced6"/>
              </linearGradient>
              <linearGradient id="apple-pencil-wood" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#dfcaa9"/>
                <stop offset="40%" stop-color="#faebd7"/>
                <stop offset="85%" stop-color="#e2cdb0"/>
                <stop offset="100%" stop-color="#c9b291"/>
              </linearGradient>
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

        <!-- Marker Tool -->
        <button type="button" class="markup-tool" data-tool="marker" aria-label="Marker tool (Highlighter with opacity)" title="Marker (3)">
          <svg viewBox="0 0 36 84" class="tool-svg" aria-hidden="true">
            <defs>
              <linearGradient id="apple-marker-barrel" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#dcdce2"/>
                <stop offset="30%" stop-color="#ffffff"/>
                <stop offset="70%" stop-color="#f4f4f8"/>
                <stop offset="100%" stop-color="#c8c8d0"/>
              </linearGradient>
              <linearGradient id="apple-marker-shoulder" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#e0e0e6"/>
                <stop offset="45%" stop-color="#ffffff"/>
                <stop offset="100%" stop-color="#c4c4ce"/>
              </linearGradient>
            </defs>
            <rect x="9" y="30" width="18" height="54" rx="2" fill="url(#apple-marker-barrel)"/>
            <rect x="9" y="37" width="18" height="7" class="tool-color-fill" fill="#dc4d88"/>
            <path d="M 9 30 C 9 24, 12 20, 13 18 L 23 18 C 24 20, 27 24, 27 30 Z" fill="url(#apple-marker-shoulder)"/>
            <path d="M 13 18 L 13 6 L 23 12 L 23 18 Z" class="tool-color-fill" fill="#dc4d88"/>
            <line x1="13" y1="6" x2="23" y2="12" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
            <text x="18" y="66" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'DM Sans', sans-serif" font-size="9" font-weight="700" fill="#6e6e73" class="marker-opacity-label">80</text>
          </svg>
        </button>

        <!-- Eraser Tool -->
        <button type="button" class="markup-tool" data-tool="eraser" aria-label="Eraser tool" title="Eraser (4)">
          <svg viewBox="0 0 36 84" class="tool-svg" aria-hidden="true">
            <defs>
              <linearGradient id="apple-eraser-body" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#dedee4"/>
                <stop offset="28%" stop-color="#ffffff"/>
                <stop offset="70%" stop-color="#f2f2f6"/>
                <stop offset="100%" stop-color="#c6c6ce"/>
              </linearGradient>
              <linearGradient id="apple-eraser-rubber" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#ea8798"/>
                <stop offset="35%" stop-color="#faaab6"/>
                <stop offset="70%" stop-color="#f49ba9"/>
                <stop offset="100%" stop-color="#d76f82"/>
              </linearGradient>
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
        <!-- Color Wheel Button -->
        <button type="button" class="markup-color-button" id="markup-color-btn" aria-label="Color Palette" title="Choose color">
          <span class="color-wheel-ring">
            <span class="color-wheel-disc" id="markup-color-disc" style="background-color: #dc4d88;"></span>
          </span>
        </button>

        <!-- Tool Size / Tuning Button -->
        <button type="button" class="markup-tune-button" id="markup-tune-btn" aria-label="Brush size and opacity options" title="Size &amp; Opacity">
          <span class="tune-dot-preview" id="markup-size-dot"></span>
          <span id="markup-size-badge">5px</span>
        </button>
        </div>

        <div class="toolbar-actions" role="group" aria-label="Canvas actions">
          <button type="button" class="tool-button" id="drawing-undo" aria-label="Undo">Undo</button>
          <button type="button" class="tool-button" id="drawing-redo" aria-label="Redo">Redo</button>
          <button type="button" class="tool-button" id="drawing-clear" aria-label="Clear">Clear</button>
        </div>
      </div>

      <div class="drawing-footer-bar">
        <button type="button" class="tool-button drawing-restore-trigger" id="drawing-history-restore" aria-label="Undo stroke or restore last clear" disabled>Restore last</button>
        <span class="drawing-sync-label" id="drawing-sync-label" role="status" aria-live="polite">All changes saved</span>
      </div>
    </div>

    <!-- Saved History Overlay Dialog (Photo Gallery Grid) -->
    <div class="drawing-history-overlay hidden" id="drawing-history-overlay" role="dialog" aria-modal="true" aria-labelledby="drawing-history-title">
      <section class="drawing-history-dialog">
        <header class="history-dialog-header">
          <div class="history-header-titles">
            <h2 id="drawing-history-title">Drawing gallery</h2>
            <span class="muted" id="drawing-history-count">Saved drawings</span>
          </div>
          <div class="history-header-actions">
            <button type="button" class="tool-button hidden" id="history-restore-selected" title="Restore selected drawing onto canvas">Load selected ♡</button>
            <button type="button" class="drawing-close" id="drawing-history-close" aria-label="Close history">×</button>
          </div>
        </header>
        <div id="drawing-history-list" class="drawing-history-grid" role="region" aria-label="Drawing cards">
          <p class="muted">Loading saved drawings…</p>
        </div>
      </section>
    </div>

    <!-- Full-Size Actual Size Preview Modal -->
    <div class="drawing-preview-overlay hidden" id="drawing-preview-overlay" role="dialog" aria-modal="true" aria-label="Full-size drawing preview">
      <div class="preview-backdrop" id="preview-backdrop"></div>
      <div class="preview-card-dialog">
        <header class="preview-dialog-header">
          <div class="preview-meta">
            <strong id="preview-meta-author">Keby &amp; Shazy</strong>
            <small id="preview-meta-date">Date</small>
          </div>
          <div class="preview-dialog-actions">
            <button type="button" class="primary" id="preview-restore-btn" title="Open this drawing on canvas to continue drawing">Load on canvas ♡</button>
            <button type="button" class="preview-trash-btn" id="preview-delete-btn" title="Delete this drawing from history">🗑 Delete</button>
            <button type="button" class="drawing-close" id="preview-close-btn" aria-label="Close preview">×</button>
          </div>
        </header>
        <div class="preview-image-container">
          <img id="preview-modal-img" src="" alt="Drawing full size actual preview">
        </div>
      </div>
    </div>
  </section>`;

  const canvas = $("#draw-canvas", el);
  const ctx = canvas.getContext("2d");
  const strokeRef = ref(rtdb, `${root}/strokes`);
  const presenceRef = ref(rtdb, `${root}/presence/${profile.id}`);
  const connectedRef = ref(rtdb, ".info/connected");
  const unsubs = [];

  const history = createDrawingHistory();
  const outgoingQueue = createOfflineQueue(user.uid);
  const knownOperationKeys = new Set();
  let latestRemoteClearKey = null;

  // Tool configurations for distinct Apple Markup styles
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
  let remoteSyncReady = false;
  let last = null;
  let activeStroke = null;
  let strokeIds = new Map();
  let pendingWrites = 0;
  const syncLabel = $("#drawing-sync-label", el);
  const historyOverlay = $("#drawing-history-overlay", el);
  const previewOverlay = $("#drawing-preview-overlay", el);
  const optionsPopover = $("#markup-options-popover", el);
  const colorPopover = $("#markup-color-popover", el);

  // Drawing gallery selection & preview state
  let selectedDrawingId = null;
  let currentPreviewMessage = null;
  let cachedMessages = [];

  // Match the drawing buffer to the visible board, with enough pixels for the active device.
  const liveBuffer = document.createElement("canvas");
  const liveBufferCtx = liveBuffer.getContext("2d");

  const resizeCanvasObserver = new ResizeObserver(entries => {
    const rect = entries[0]?.contentRect;
    if (!active || !rect?.width || !rect?.height) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
    const width = Math.round(rect.width * pixelRatio);
    const height = Math.round(rect.height * pixelRatio);
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    liveBuffer.width = width;
    liveBuffer.height = height;
    redrawCanvas();
  });
  resizeCanvasObserver.observe(canvas);

  $("#drawing-close", el).onclick = () => window.App?.navigate("home");
  $("#drawing-history-open", el).onclick = () => {
    closePopovers();
    historyOverlay.classList.remove("hidden");
    $("#drawing-history-close", el).focus();
  };
  $("#drawing-history-close", el).onclick = closeHistory;
  historyOverlay.onclick = event => {
    if (event.target === historyOverlay) closeHistory();
  };
  function closeHistory() {
    historyOverlay.classList.add("hidden");
    $("#drawing-history-open", el).focus();
  }

  // Preview Modal handlers
  function openPreviewModal(message) {
    if (!message) return;
    currentPreviewMessage = message;
    const authorName = getDisplayName(message.authorId, message.authorName || "Us");
    const dateStr = new Date(drawingTimestamp(message)).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
    const photoUrl = message.photoUrl || (message.driveFileId
      ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(message.driveFileId)}&sz=w1200`
      : message.thumbnailUrl || "");

    $("#preview-meta-author", el).textContent = `By ${authorName}`;
    $("#preview-meta-date", el).textContent = dateStr;
    const imgEl = $("#preview-modal-img", el);
    if (imgEl) {
      if (photoUrl) imgEl.src = photoUrl;
      else imgEl.removeAttribute("src");
      if (!photoUrl && message.telegramFileId) getTelegramMediaUrl(message.telegramFileId, message.mimeType || "image/jpeg")
        .then(url => { if (imgEl.isConnected && currentPreviewMessage === message) imgEl.src = url; })
        .catch(error => console.error("Saved drawing could not load from Telegram:", error));
    }

    previewOverlay?.classList.remove("hidden");
  }

  function closePreviewModal() {
    previewOverlay?.classList.add("hidden");
    currentPreviewMessage = null;
  }

  $("#preview-close-btn", el).onclick = closePreviewModal;
  $("#preview-backdrop", el).onclick = closePreviewModal;

  $("#preview-restore-btn", el).onclick = async () => {
    if (!currentPreviewMessage) return;
    let photoUrl = currentPreviewMessage.photoUrl || (currentPreviewMessage.driveFileId
      ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(currentPreviewMessage.driveFileId)}&sz=w1200`
      : currentPreviewMessage.thumbnailUrl || "");
    if (!photoUrl && currentPreviewMessage.telegramFileId) photoUrl = await getTelegramMediaUrl(currentPreviewMessage.telegramFileId, currentPreviewMessage.mimeType || "image/jpeg");
    if (!photoUrl) {
      toast("Could not open this drawing.");
      return;
    }
    loadSaved(photoUrl);
    closePreviewModal();
    closeHistory();
    toast("Drawing loaded on canvas ♡");
  };

  $("#preview-delete-btn", el).onclick = async () => {
    if (!currentPreviewMessage?.id) return;
    if (!window.confirm("Delete this drawing from your shared history?")) return;
    try {
      await deleteDrawingMessage(currentPreviewMessage.id);
      toast("Drawing deleted.");
      closePreviewModal();
    } catch (err) {
      toast("Could not delete drawing: " + (err.message || "Failed."));
    }
  };

  $("#history-restore-selected", el).onclick = async () => {
    if (!selectedDrawingId) return;
    const message = cachedMessages.find(m => m.id === selectedDrawingId);
    if (!message) return;
    let photoUrl = message.photoUrl || (message.driveFileId
      ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(message.driveFileId)}&sz=w1200`
      : message.thumbnailUrl || "");
    if (!photoUrl && message.telegramFileId) photoUrl = await getTelegramMediaUrl(message.telegramFileId, message.mimeType || "image/jpeg");
    if (!photoUrl) return;
    loadSaved(photoUrl);
    closeHistory();
    toast("Drawing loaded on canvas ♡");
  };

  $("#drawing-history-restore", el).onclick = () => {
    if (history.canRestoreClear) {
      const restoredStrokes = history.restoreClearSnapshot();
      if (!restoredStrokes) return;
      latestRemoteClearKey = null;
      enqueueWrite({ type: "restore", strokes: restoredStrokes });
      redrawCanvas();
      toast("Canvas restored.");
      return;
    }
    if (!history.canUndo) {
      toast("Nothing to restore.");
      return;
    }
    $("#drawing-undo", el).click();
  };

  function point(e) {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * canvas.width;
    const y = ((e.clientY - r.top) / r.height) * canvas.height;
    return {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10
    };
  }

  // Smooth quadratic bezier midpoint curve connecting points
  function drawSmoothCurve(targetCtx, points) {
    if (!points || points.length < 2) return;
    if (points.length === 2) {
      targetCtx.moveTo(points[0].x, points[0].y);
      targetCtx.lineTo(points[1].x, points[1].y);
      return;
    }
    targetCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      targetCtx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    targetCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }

  // Render a complete single stroke with authentic Apple Markup brush styles
  function renderSingleStroke(targetCtx, stroke) {
    if (!targetCtx || !stroke || !stroke.points || stroke.points.length === 0) return;
    const pts = stroke.points;
    const strokeTool = stroke.tool || "pen";
    const strokeColor = stroke.color || "#dc4d88";
    const strokeSize = stroke.size || 5;
    const strokeOpacity = typeof stroke.opacity === "number"
      ? stroke.opacity
      : (strokeTool === "marker" ? 0.8 : (strokeTool === "pencil" ? 0.75 : 1.0));

    targetCtx.save();

    // 1. Eraser Tool: clean transparent erase
    if (strokeTool === "eraser") {
      targetCtx.globalCompositeOperation = "destination-out";
      targetCtx.globalAlpha = 1.0;
      targetCtx.lineWidth = strokeSize;
      targetCtx.lineCap = "round";
      targetCtx.lineJoin = "round";

      if (pts.length === 1) {
        targetCtx.beginPath();
        targetCtx.arc(pts[0].x, pts[0].y, Math.max(1, strokeSize / 2), 0, Math.PI * 2);
        targetCtx.fill();
      } else {
        targetCtx.beginPath();
        drawSmoothCurve(targetCtx, pts);
        targetCtx.stroke();
      }
      targetCtx.restore();
      return;
    }

    // 2. Marker Tool: translucent highlighter with uniform path (no joint overlaps)
    if (strokeTool === "marker") {
      targetCtx.globalCompositeOperation = "source-over";
      targetCtx.globalAlpha = strokeOpacity;
      targetCtx.strokeStyle = strokeColor;
      targetCtx.fillStyle = strokeColor;
      targetCtx.lineWidth = strokeSize;
      targetCtx.lineCap = "round";
      targetCtx.lineJoin = "round";

      if (pts.length === 1) {
        targetCtx.beginPath();
        targetCtx.arc(pts[0].x, pts[0].y, Math.max(1, strokeSize / 2), 0, Math.PI * 2);
        targetCtx.fill();
      } else {
        targetCtx.beginPath();
        drawSmoothCurve(targetCtx, pts);
        targetCtx.stroke();
      }
      targetCtx.restore();
      return;
    }

    // 3. Pencil Tool: soft textured graphite with dual-pass core and feather
    if (strokeTool === "pencil") {
      targetCtx.globalCompositeOperation = "source-over";
      targetCtx.strokeStyle = strokeColor;
      targetCtx.fillStyle = strokeColor;
      targetCtx.lineCap = "round";
      targetCtx.lineJoin = "round";

      if (pts.length === 1) {
        targetCtx.globalAlpha = strokeOpacity * 0.75;
        targetCtx.beginPath();
        targetCtx.arc(pts[0].x, pts[0].y, Math.max(1, strokeSize / 2), 0, Math.PI * 2);
        targetCtx.fill();
      } else {
        // Outer soft graphite shade
        targetCtx.globalAlpha = strokeOpacity * 0.55;
        targetCtx.lineWidth = strokeSize;
        targetCtx.beginPath();
        drawSmoothCurve(targetCtx, pts);
        targetCtx.stroke();

        // Dense inner core
        targetCtx.globalAlpha = strokeOpacity * 0.40;
        targetCtx.lineWidth = Math.max(1, strokeSize * 0.55);
        targetCtx.beginPath();
        drawSmoothCurve(targetCtx, pts);
        targetCtx.stroke();
      }
      targetCtx.restore();
      return;
    }

    // 4. Pen Tool: crisp, solid Apple monoline vector stroke
    targetCtx.globalCompositeOperation = "source-over";
    targetCtx.globalAlpha = strokeOpacity;
    targetCtx.strokeStyle = strokeColor;
    targetCtx.fillStyle = strokeColor;
    targetCtx.lineWidth = strokeSize;
    targetCtx.lineCap = "round";
    targetCtx.lineJoin = "round";

    if (pts.length === 1) {
      targetCtx.beginPath();
      targetCtx.arc(pts[0].x, pts[0].y, Math.max(1, strokeSize / 2), 0, Math.PI * 2);
      targetCtx.fill();
    } else {
      targetCtx.beginPath();
      drawSmoothCurve(targetCtx, pts);
      targetCtx.stroke();
    }
    targetCtx.restore();
  }

  function redrawCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of history.strokes) {
      renderSingleStroke(ctx, stroke);
    }
    if (activeStroke) {
      renderSingleStroke(ctx, activeStroke);
    }
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
    const id = operation.id || `${operation.type}-${crypto.randomUUID()}`;
    const queuedOperation = { ...operation, id, uid: user.uid };
    if (["stroke", "redo"].includes(queuedOperation.type)) queuedOperation.opId ||= crypto.randomUUID();
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
        toast("Changes saved on this device. They’ll sync when you reconnect.");
        console.error("Drawing sync failed; queued locally:", error);
        return null;
      })
      .finally(() => {
        pendingWrites = Math.max(0, pendingWrites - 1);
        updateSyncStatus();
      });
  }

  async function flushOfflineQueue() {
    if (!navigator.onLine || !active || !outgoingQueue.length) {
      updateSyncStatus();
      return;
    }
    const queuedOperations = outgoingQueue.getAll();
    if (!queuedOperations.length) return;
    syncLabel?.classList.add("syncing");
    updateSyncStatus("Syncing saved strokes…");
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
        } else {
          await push(strokeRef, operation);
        }
        outgoingQueue.remove(operation.id);
      } catch (error) {
        console.error("Offline drawing sync will retry:", error);
        break;
      } finally {
        pendingWrites = Math.max(0, pendingWrites - 1);
      }
    }
    syncLabel?.classList.remove("syncing");
    updateSyncStatus(outgoingQueue.length ? "Some strokes are waiting to sync" : "All changes saved");
    if (outgoingQueue.length) toast("Some strokes are still waiting to sync.");
  }

  // Pointer drawing events on canvas
  canvas.addEventListener("pointerdown", e => {
    if (!remoteSyncReady) return;
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    canvas.setPointerCapture(e.pointerId);

    closePopovers();

    drawing = true;
    last = point(e);
    activeStroke = {
      id: crypto.randomUUID(),
      uid: user.uid,
      tool,
      color: tool === "eraser" ? "#ffffff" : color,
      size: toolConfigs[tool].size,
      opacity: toolConfigs[tool].opacity,
      points: [last]
    };

    // Buffer the current canvas state before starting active stroke
    liveBufferCtx.clearRect(0, 0, canvas.width, canvas.height);
    liveBufferCtx.drawImage(canvas, 0, 0);

    renderSingleStroke(ctx, activeStroke);
  });

  canvas.addEventListener("pointermove", e => {
    if (!drawing || !activeStroke || !last) return;
    if (e.cancelable) e.preventDefault();
    const p = point(e);
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx * dx + dy * dy < 1.5) return; // avoid duplicate micro points

    activeStroke.points.push(p);
    last = p;

    // Restore buffered snapshot and redraw active stroke smoothly in one pass
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(liveBuffer, 0, 0);
    renderSingleStroke(ctx, activeStroke);
  });

  function endStroke() {
    if (drawing && activeStroke && activeStroke.points && activeStroke.points.length > 0) {
      history.add(activeStroke);
      const committedStroke = activeStroke;
      strokeIds.set(committedStroke.id, null);
      enqueueWrite({ type: "stroke", ...committedStroke }).then(value => {
        if (value?.key) strokeIds.set(committedStroke.id, value.key);
      });
      redrawCanvas();
    }
    drawing = false;
    last = null;
    activeStroke = null;
  }

  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
  canvas.addEventListener("lostpointercapture", endStroke);

  // Apply operations from Firebase. Existing operations during startup are replayed silently.
  function applyRemoteOperation(s, allowPartnerClearPrompt) {
    if (knownOperationKeys.has(s.key)) return;
    knownOperationKeys.add(s.key);
    const v = s.val();
    if (!v) return;

    if (v.type === "clear") {
      if (v.uid === user.uid) {
        latestRemoteClearKey = null;
        history.reset();
        outgoingQueue.clear();
      } else {
        history.clear();
        latestRemoteClearKey = s.key;
        for (const operation of outgoingQueue.getAll()) {
          if (["stroke", "redo", "undo"].includes(operation.type)) outgoingQueue.remove(operation.id);
        }
        if (allowPartnerClearPrompt && history.canRestoreClear && window.confirm("Your partner cleared the shared canvas. Restore your last version?")) {
          const restoredStrokes = history.restoreClearSnapshot();
          if (restoredStrokes) enqueueWrite({ type: "restore", strokes: restoredStrokes });
          latestRemoteClearKey = null;
        }
      }
      strokeIds.clear();
      redrawCanvas();
      return;
    }

    if (v.type === "restore") {
      history.replace(v.strokes || []);
      strokeIds = new Map(history.strokes.map(stroke => [stroke.id, null]));
      latestRemoteClearKey = null;
      outgoingQueue.clear();
      redrawCanvas();
      return;
    }

    if (v.type === "undo") {
      history.applyUndo(v.strokeId);
      if (v.uid !== user.uid) {
        for (const operation of outgoingQueue.getAll()) {
          if (operation.type === "redo" && operation.stroke?.id === v.strokeId) outgoingQueue.remove(operation.id);
        }
      } else if (outgoingQueue.length && navigator.onLine) {
        flushOfflineQueue();
      }
      strokeIds.delete(v.strokeId);
      redrawCanvas();
      return;
    }

    if (v.type === "redo") {
      history.applyRedo(v.stroke);
      strokeIds.set(v.stroke.id, s.key);
      redrawCanvas();
      return;
    }

    if (v.type === "stroke") {
      if (history.strokes.some(stroke => stroke.id === v.id)) return;
      history.add(v);
      strokeIds.set(v.id, s.key);
      renderSingleStroke(ctx, v);
      refreshHistoryControls();
    }
  }

  // Subscribe first so changes cannot slip between the startup snapshot and live updates.
  let initialSyncComplete = false;
  const initialEvents = [];
  unsubs.push(onChildAdded(strokeRef, snapshot => {
    if (!active) return;
    if (!initialSyncComplete) {
      initialEvents.push(snapshot);
      return;
    }
    applyRemoteOperation(snapshot, true);
  }));

  get(strokeRef).then(snapshot => {
    if (!active) return;
    snapshot.forEach(operation => applyRemoteOperation(operation, false));
    initialEvents.sort((a, b) => a.key.localeCompare(b.key));
    initialEvents.forEach(operation => applyRemoteOperation(operation, false));
    initialEvents.length = 0;
    initialSyncComplete = true;
    remoteSyncReady = true;
    redrawCanvas();
    updateSyncStatus();
  }).catch(error => {
    if (!active) return;
    console.warn("Could not load the initial shared canvas snapshot; applying available updates.", error);
    initialEvents.sort((a, b) => a.key.localeCompare(b.key));
    initialEvents.forEach(operation => applyRemoteOperation(operation, false));
    initialEvents.length = 0;
    initialSyncComplete = true;
    remoteSyncReady = true;
    redrawCanvas();
    updateSyncStatus();
  });

  // Presence tracking
  unsubs.push(onValue(connectedRef, s => {
    if (!active) return;
    if (s.val()) {
      set(presenceRef, { name: profile.name, uid: user.uid, state: "online", lastSeen: Date.now() });
      onDisconnect(presenceRef).set({ name: profile.name, uid: user.uid, state: "offline", lastSeen: Date.now() });
    }
  }));

  const presenceListRef = ref(rtdb, `${root}/presence`);
  unsubs.push(onValue(presenceListRef, s => {
    if (!active || !el.isConnected) return;
    const people = Object.values(s.val() || {});
    const online = people.filter(p => p.state === "online");
    const presence = $("#drawing-presence", el);
    const dot = $(".presence-dot", el);
    if (!presence || !dot) return;
    presence.textContent = online.length >= 2
      ? "Both online · Drawing together!"
      : online.length
        ? `${online[0].name} online · Waiting for your person…`
        : "Offline · Draw and send when you reconnect";
    dot.classList.toggle("online", online.length > 0);
  }));

  // Close floating popovers
  function closePopovers() {
    optionsPopover?.classList.add("hidden");
    colorPopover?.classList.add("hidden");
  }

  // Update dynamic colors across tool SVGs, buttons, and popover previews
  function updateColor(newColor) {
    color = newColor;
    el.querySelectorAll(".tool-color-fill").forEach(node => {
      node.setAttribute("fill", newColor);
    });
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

  // Select active tool and update options UI
  function selectTool(newTool, toggleOptionsOnSame = false) {
    if (tool === newTool && toggleOptionsOnSame) {
      // Tapping already active tool toggles the options popover
      colorPopover?.classList.add("hidden");
      optionsPopover?.classList.toggle("hidden");
      return;
    }

    if (newTool !== "eraser") {
      lastNonEraserTool = newTool;
    }

    tool = newTool;
    colorPopover?.classList.add("hidden");

    el.querySelectorAll(".markup-tool").forEach(b => {
      const isSelected = b.dataset.tool === tool;
      b.classList.toggle("selected", isSelected);
      b.setAttribute("aria-pressed", String(isSelected));
    });

    // Update Popover Header
    const config = toolConfigs[tool];
    const popoverTitle = $("#popover-tool-title", el);
    const popoverBadge = $("#popover-tool-badge", el);
    if (popoverTitle) popoverTitle.textContent = config.title;
    if (popoverBadge) popoverBadge.textContent = config.badge;

    // Show/hide opacity section
    const opacitySection = $("#popover-opacity-section", el);
    if (opacitySection) {
      opacitySection.classList.toggle("hidden", tool === "eraser");
    }

    // Update preset pills for current tool
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
    pillsRow.innerHTML = presets.map((sizeVal, idx) => `
      <button type="button" data-size="${sizeVal}" class="preset-pill ${toolConfigs[tool].size === sizeVal ? "active" : ""}">${labels[idx]}</button>
    `).join("");
    pillsRow.querySelectorAll("[data-size]").forEach(b => {
      b.onclick = () => {
        setToolSize(Number(b.dataset.size));
      };
    });
  }

  function setToolSize(newSize) {
    toolConfigs[tool].size = newSize;
    updateSizeControls();
    updateTuneButtonPreview();
    updatePopoverPreview();
  }

  function updateSizeControls() {
    const curSize = toolConfigs[tool].size;
    const slider = $("#popover-size-slider", el);
    const sizeText = $("#popover-size-text", el);
    if (slider) slider.value = String(curSize);
    if (sizeText) sizeText.textContent = `${curSize} px`;

    $("#size-preset-pills", el)?.querySelectorAll("[data-size]").forEach(b => {
      b.classList.toggle("active", Number(b.dataset.size) === curSize);
    });
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
    if (slider) slider.value = String(curOpacity);
    if (opacityText) opacityText.textContent = `${curOpacity}%`;

    $("#opacity-preset-pills", el)?.querySelectorAll("[data-opacity]").forEach(b => {
      b.classList.toggle("active", Number(b.dataset.opacity) === curOpacity);
    });
  }

  function updateMarkerBarrelOpacity() {
    const markerOpacityPercent = Math.round(toolConfigs.marker.opacity * 100);
    el.querySelectorAll(".marker-opacity-label").forEach(label => {
      label.textContent = String(markerOpacityPercent);
    });
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
    if (badge) {
      badge.textContent = `${currentSize}px`;
    }
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

  // Bind Tool Buttons in Dock
  el.querySelectorAll(".markup-tool").forEach(btn => {
    btn.onclick = () => {
      selectTool(btn.dataset.tool, true);
    };
  });

  // Bind Color Wheel Button
  $("#markup-color-btn", el).onclick = () => {
    optionsPopover?.classList.add("hidden");
    if (tool === "eraser") {
      selectTool(lastNonEraserTool);
    }
    colorPopover?.classList.toggle("hidden");
  };

  // Bind Tune Button
  $("#markup-tune-btn", el).onclick = () => {
    colorPopover?.classList.add("hidden");
    optionsPopover?.classList.toggle("hidden");
  };

  // Bind Size Slider
  const sizeSlider = $("#popover-size-slider", el);
  if (sizeSlider) {
    sizeSlider.oninput = event => {
      setToolSize(Number(event.target.value));
    };
  }

  // Bind Opacity Slider
  const opacitySlider = $("#popover-opacity-slider", el);
  if (opacitySlider) {
    opacitySlider.oninput = event => {
      setToolOpacity(Number(event.target.value) / 100);
    };
  }

  // Bind Opacity Presets
  $("#opacity-preset-pills", el)?.querySelectorAll("[data-opacity]").forEach(b => {
    b.onclick = () => {
      setToolOpacity(Number(b.dataset.opacity) / 100);
    };
  });

  // Bind Color Palette Swatches
  el.querySelectorAll(".palette-swatch").forEach(swatch => {
    swatch.onclick = () => {
      updateColor(swatch.dataset.color);
      if (tool === "eraser") {
        selectTool(lastNonEraserTool);
      }
    };
  });

  // Bind Custom Color Input
  const customColorInput = $("#markup-custom-color-input", el);
  if (customColorInput) {
    customColorInput.oninput = event => {
      updateColor(event.target.value);
      if (tool === "eraser") {
        selectTool(lastNonEraserTool);
      }
    };
  }

  // Close popovers on click outside
  const handleOutsidePointer = event => {
    const target = event.target;
    if (
      !target.closest(".markup-dock-container") &&
      !target.closest("#markup-color-btn") &&
      !target.closest("#markup-tune-btn")
    ) {
      closePopovers();
    }
  };
  document.addEventListener("pointerdown", handleOutsidePointer);

  // Undo / Redo / Clear Handlers
  $("#drawing-undo", el).onclick = () => {
    closePopovers();
    const action = history.undo();
    if (!action) {
      toast("Nothing to undo.");
      return;
    }
    redrawCanvas();
    if (action.type === "undo") {
      enqueueWrite({ type: "undo", strokeId: action.stroke.id });
    } else {
      latestRemoteClearKey = null;
      enqueueWrite({ type: "restore", strokes: action.strokes });
    }
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
    if (!history.strokes.length) {
      toast("The canvas is already empty.");
      return;
    }
    if (!window.confirm("Clear the shared canvas for both of you? You can undo this clear.")) return;
    history.clear();
    latestRemoteClearKey = null;
    strokeIds.clear();
    for (const operation of outgoingQueue.getAll()) {
      if (["stroke", "redo", "undo"].includes(operation.type)) outgoingQueue.remove(operation.id);
    }
    redrawCanvas();
    await enqueueWrite({ type: "clear" });
    toast("Canvas cleared. Undo can restore it.");
  };

  // Keyboard navigation & shortcuts
  const handleHistoryKeydown = event => {
    if (event.key === "Escape") {
      if (previewOverlay && !previewOverlay.classList.contains("hidden")) {
        closePreviewModal();
        return;
      }
      if (optionsPopover && !optionsPopover.classList.contains("hidden")) {
        closePopovers();
        return;
      }
      if (colorPopover && !colorPopover.classList.contains("hidden")) {
        closePopovers();
        return;
      }
      if (!historyOverlay.classList.contains("hidden")) {
        closeHistory();
        return;
      }
    }
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      $("#drawing-undo", el)?.click();
    } else if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      $("#drawing-redo", el)?.click();
    } else if (event.key === "1") {
      selectTool("pen");
    } else if (event.key === "2") {
      selectTool("pencil");
    } else if (event.key === "3") {
      selectTool("marker");
    } else if (event.key === "4") {
      selectTool("eraser");
    }
  };
  document.addEventListener("keydown", handleHistoryKeydown);

  const handleOnline = () => { updateSyncStatus("Back online · syncing strokes…"); flushOfflineQueue(); };
  const handleOffline = () => updateSyncStatus();
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  window.addEventListener("beforeunload", outgoingQueue.persist);

  // Initialize initial tool state and previews
  selectTool("pen");
  updateColor(color);
  updateSyncStatus();
  flushOfflineQueue();
  refreshHistoryControls();

  $("#drawing-save", el).onclick = saveDrawing;

  async function saveDrawing() {
    closePopovers();
    if (!history.strokes.length) {
      toast("Add a drawing before sending.");
      return;
    }
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
      // Preserve the backing bitmap's exact aspect ratio and append the footer below it.
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

      // Canvas artwork benefits from near-lossless output, especially fine pen strokes.
      const imageBlob = await new Promise((resolve, reject) => exportCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not prepare drawing image.")), "image/jpeg", 0.96));
      const profileKey = getProfileKey(profile);
      if (!profileKey) throw new Error("Could not identify your profile for Telegram upload.");
      const telegramFile = new File([imageBlob], `canvas-drawing-${createdAtMs}.jpg`, { type: "image/jpeg" });
      const telegramResult = await sendToTelegram(telegramFile, `New Canvas Drawing 🎨 · ${artistName} · ${timestamp}`, new Date(createdAtMs).toISOString().slice(0, 10), profileKey, { storeForReveal: false });
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
      btn.textContent = "Save & send ♡";
    }
  }

  // Curated pastel background palette for history cards (matching Apple Markup style grid)
  const pastelPalette = [
    "#d8effa", // Sky / Cyan pastel
    "#cfd8dc", // Soft Slate blue pastel
    "#e2f2df", // Mint / Sage pastel
    "#fae3eb", // Blush Rose pastel
    "#f6e5dc", // Peach pastel
    "#e7dcf7", // Lilac / Lavender pastel
    "#fef1d8", // Warm Butter pastel
    "#fde7f3"  // Sweet Pink pastel
  ];

  function formatShortDate(timestamp) {
    if (!timestamp) return "";
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function renderHistoryCards(messages) {
    const historyList = $("#drawing-history-list", el);
    const countBadge = $("#drawing-history-count", el);
    const restoreSelectedBtn = $("#history-restore-selected", el);
    if (!historyList) return;

    if (countBadge) {
      countBadge.textContent = messages.length ? `${messages.length} saved drawing${messages.length === 1 ? "" : "s"}` : "No drawings saved";
    }

    if (restoreSelectedBtn) {
      restoreSelectedBtn.classList.toggle("hidden", !selectedDrawingId);
    }

    if (!messages.length) {
      historyList.innerHTML = `<div class="empty-diary" style="grid-column: 1 / -1; text-align: center; padding: 36px 0;"><span>♡</span><p>No drawings saved yet.</p></div>`;
      return;
    }

    historyList.innerHTML = messages.map((m, index) => {
      const cardBg = pastelPalette[index % pastelPalette.length];
      const isSelected = selectedDrawingId === m.id;
      const authorName = getDisplayName(m.authorId, m.authorName || "Us");
      const shortDate = formatShortDate(drawingTimestamp(m));
      const photoUrl = m.photoUrl || (m.driveFileId
        ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(m.driveFileId)}&sz=w512`
        : m.thumbnailUrl || "");
      const telegramImage = !photoUrl && m.telegramFileId;

      return `
        <article class="drawing-grid-card ${isSelected ? "selected" : ""}" style="--card-bg: ${cardBg};" data-card-id="${esc(m.id)}">
          <button type="button" class="drawing-card-thumb-btn" data-open-preview="${esc(m.id)}" aria-label="View actual size preview of drawing by ${esc(authorName)}">
            ${photoUrl ? `<img src="${esc(photoUrl)}" alt="Drawing by ${esc(authorName)}" loading="lazy">` : telegramImage ? `<img data-drawing-file-id="${esc(m.telegramFileId)}" data-drawing-mime="${esc(m.mimeType || "image/jpeg")}" alt="Drawing by ${esc(authorName)}" loading="lazy">` : `<span style="font-size:32px;">🎨</span>`}
          </button>
          <button type="button" class="drawing-select-circle-btn" data-select-id="${esc(m.id)}" aria-label="Select drawing by ${esc(authorName)}" title="Select drawing">
            <span class="selection-circle ${isSelected ? "checked" : ""}"></span>
          </button>
          <button type="button" class="drawing-card-delete-btn" data-delete-id="${esc(m.id)}" aria-label="Delete drawing" title="Delete drawing">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          <div class="drawing-card-footer">
            <span class="drawing-card-author">${esc(authorName)}</span>
            <span class="drawing-card-date">${shortDate}</span>
          </div>
        </article>
      `;
    }).join("");

    historyList.querySelectorAll("img[data-drawing-file-id]").forEach(image => {
      getTelegramMediaUrl(image.dataset.drawingFileId, image.dataset.drawingMime)
        .then(url => { if (image.isConnected) image.src = url; })
        .catch(error => console.error("Drawing preview could not load from Telegram:", error));
    });

    // Bind full-size preview clicks
    el.querySelectorAll("[data-open-preview]").forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.openPreview;
        const msg = messages.find(m => m.id === id);
        if (msg) openPreviewModal(msg);
      };
    });

    // Bind selection circle toggles
    el.querySelectorAll("[data-select-id]").forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const id = btn.dataset.selectId;
        selectedDrawingId = (selectedDrawingId === id) ? null : id;
        renderHistoryCards(messages);
      };
    });

    // Bind direct card delete buttons
    el.querySelectorAll("[data-delete-id]").forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        const id = btn.dataset.deleteId;
        if (!window.confirm("Delete this drawing from your shared history?")) return;
        try {
          if (selectedDrawingId === id) selectedDrawingId = null;
          await deleteDrawingMessage(id);
          toast("Drawing deleted.");
        } catch (err) {
          toast("Could not delete drawing: " + (err.message || "Failed."));
        }
      };
    });
  }

  unsubs.push(watchDrawingMessages(messages => {
    if (!active || !el.isConnected) return;
    const sortedMessages = [...messages].sort((a, b) => drawingTimestamp(b) - drawingTimestamp(a));
    cachedMessages = sortedMessages;
    renderHistoryCards(sortedMessages);
  }));

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
    outgoingQueue.persist();
    resizeCanvasObserver.disconnect();
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
