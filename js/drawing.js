import { $, esc, toast } from "./utils.js";
import { rtdb } from "./firebase.js";
import { addDrawingMessage, watchDrawingMessages, notifyPartnerSafely } from "./firestore.js";
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
      <button type="button" class="drawing-close" id="drawing-close" aria-label="Close canvas">×</button>
      <h1>Our Canvas</h1>
      <div class="drawing-heading-actions">
        <button type="button" class="primary" id="drawing-save">Save &amp; send</button>
      </div>
    </header>
    <div class="drawing-tools" role="toolbar" aria-label="Drawing tools">
      <div class="tool-group colors" role="group" aria-label="Brush color">
        <button data-color="#dc4d88" style="--swatch:#dc4d88" aria-label="Pink" class="selected"></button>
        <button data-color="#263b72" style="--swatch:#263b72" aria-label="Navy"></button>
        <button data-color="#f08a36" style="--swatch:#f08a36" aria-label="Orange"></button>
        <button data-color="#222222" style="--swatch:#222222" aria-label="Black"></button>
        <label class="drawing-custom-color" title="Choose a custom color">
          <input type="color" id="drawing-custom-color" value="#dc4d88" aria-label="Choose custom brush color">
          <span aria-hidden="true">+</span>
        </label>
      </div>
      <label class="brush-size"><span>Size</span><input id="brush-size" type="range" min="2" max="24" value="5" aria-label="Brush size"></label>
      <button type="button" class="tool-button selected" data-tool="brush" aria-pressed="true">✎ Brush</button>
      <button type="button" class="tool-button" data-tool="eraser" aria-pressed="false">⌫ Eraser</button>
      <button type="button" class="tool-button" id="drawing-undo" aria-label="Undo last stroke" title="Undo (⌘/Ctrl+Z)" disabled>↶ Undo</button>
      <button type="button" class="tool-button" id="drawing-redo" aria-label="Redo last stroke" title="Redo (⌘/Ctrl+Shift+Z)" disabled>↷ Redo</button>
      <button type="button" class="tool-button" id="drawing-clear">Clear</button>
    </div>
    <div class="brush-preview-row"><span id="brush-mode-label">Brush preview</span><span id="brush-size-value" aria-live="polite">5 px</span><span id="brush-size-preview" aria-hidden="true"></span></div>
    <div class="draw-board"><canvas class="draw-canvas" id="draw-canvas" width="1200" height="720" aria-label="Shared drawing canvas" role="img" tabindex="0"></canvas><div class="canvas-watermark">K &amp; S ♡</div></div>
    <div class="drawing-footer-controls"><button type="button" class="tool-button drawing-history-trigger" id="drawing-history-open">History</button><div class="drawing-footer-actions"><button type="button" class="tool-button drawing-restore-trigger" id="drawing-history-restore" aria-label="Undo stroke or restore last clear" disabled>Restore last</button><span class="drawing-sync-label" id="drawing-sync-label" role="status" aria-live="polite">All changes saved</span></div></div>
    <div class="drawing-status"><span class="presence-dot"></span><span id="drawing-presence">Connecting…</span></div>
    <div class="drawing-history-overlay hidden" id="drawing-history-overlay" role="dialog" aria-modal="true" aria-labelledby="drawing-history-title" aria-describedby="drawing-history-limit">
      <section class="drawing-history-dialog">
        <header><h2 id="drawing-history-title">Drawing history</h2><button type="button" class="drawing-close" id="drawing-history-close" aria-label="Close history">×</button></header>
        <div class="history-dialog-actions"><span class="muted" id="drawing-history-limit">Use Undo/Redo to step through your latest 30 strokes.</span></div>
        <div id="drawing-history-list" class="drawing-history-list"><p class="muted">Loading saved drawings…</p></div>
      </section>
    </div>
  </section>`;

  const canvas = $("#draw-canvas", el), ctx = canvas.getContext("2d"), strokeRef = ref(rtdb, `${root}/strokes`), presenceRef = ref(rtdb, `${root}/presence/${profile.id}`), connectedRef = ref(rtdb, ".info/connected"), unsubs = [];
  const history = createDrawingHistory();
  const outgoingQueue = createOfflineQueue(user.uid);
  const knownOperationKeys = new Set();
  let latestRemoteClearKey = null;
  let color = "#dc4d88", size = 5, tool = "brush", drawing = false, active = true, last = null, activeStroke = null;
  let strokeIds = new Map(), pendingWrites = 0, syncLabel = $("#drawing-sync-label", el);
  const historyOverlay = $("#drawing-history-overlay", el);
  const resizeCanvasObserver = new ResizeObserver(() => {
    if (active && canvas.clientWidth && canvas.clientHeight) redrawCanvas();
  });
  resizeCanvasObserver.observe(canvas);

  $("#drawing-close", el).onclick = () => window.App?.navigate("home");
  $("#drawing-history-open", el).onclick = () => {
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
    return { x: (e.clientX - r.left) / r.width * canvas.width, y: (e.clientY - r.top) / r.height * canvas.height };
  }

  function drawSegment(a, b, strokeColor, strokeSize, mode = "brush") {
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = mode === "eraser" ? "destination-out" : "source-over";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }

  function redrawCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of history.strokes) {
      if (!stroke.points || stroke.points.length < 2) continue;
      for (let i = 1; i < stroke.points.length; i++) {
        drawSegment(stroke.points[i - 1], stroke.points[i], stroke.color, stroke.size, stroke.tool);
      }
    }
    if (activeStroke?.points.length > 1) {
      for (let i = 1; i < activeStroke.points.length; i++) {
        drawSegment(activeStroke.points[i - 1], activeStroke.points[i], activeStroke.color, activeStroke.size, activeStroke.tool);
      }
    }
    refreshHistoryControls();
  }

  function refreshHistoryControls() {
    $("#drawing-undo", el).disabled = !history.canUndo;
    $("#drawing-redo", el).disabled = !history.canRedo;
    $("#drawing-history-restore", el).disabled = !history.canUndo;
    $("#drawing-history-restore", el).textContent = history.canRestoreClear ? "Restore last clear" : "Restore last";
    $("#brush-mode-label", el).textContent = tool === "eraser" ? "Eraser preview" : "Brush preview";
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

  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    last = point(e);
    activeStroke = { id: crypto.randomUUID(), uid: user.uid, color: tool === "eraser" ? "#fff" : color, size, tool, points: [last] };
  });

  canvas.addEventListener("pointermove", e => {
    if (!drawing || !last) return;
    if (e.cancelable) e.preventDefault();
    const p = point(e);
    drawSegment(last, p, color, size, tool);
    activeStroke.points.push(p);
    last = p;
  });

  function endStroke() {
    if (drawing && activeStroke && activeStroke.points.length > 1) {
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

  unsubs.push(onChildAdded(strokeRef, s => {
    if (!active) return;
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
        if (history.canRestoreClear && window.confirm("Your partner cleared the shared canvas. Restore your last version?")) {
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
        for (const operation of outgoingQueue.getAll()) if (operation.type === "redo" && operation.stroke?.id === v.strokeId) outgoingQueue.remove(operation.id);
      } else if (outgoingQueue.length && navigator.onLine) flushOfflineQueue();
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
      if (v.points && v.points.length > 1) {
        for (let i = 1; i < v.points.length; i++) {
          drawSegment(v.points[i - 1], v.points[i], v.color, v.size, v.tool);
        }
      }
      refreshHistoryControls();
    }
  }));

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
    const people = Object.values(s.val() || {}), online = people.filter(p => p.state === "online");
    const presence = $("#drawing-presence", el), dot = $(".presence-dot", el);
    if (!presence || !dot) return;
    presence.textContent = online.length >= 2 ? "Both online · Drawing together!" : online.length ? `${online[0].name} online · Waiting for your person…` : "You are offline · Draw and send when you reconnect";
    dot.classList.toggle("online", online.length > 0);
  }));

  el.querySelectorAll("[data-color]").forEach(b => b.onclick = () => {
    color = b.dataset.color;
    el.querySelectorAll("[data-color]").forEach(x => {
      x.classList.toggle("selected", x === b);
      x.setAttribute("aria-pressed", String(x === b));
    });
    el.querySelector("[data-tool=brush]").click();
    updateBrushPreview();
  });
  $("#drawing-custom-color", el).oninput = event => {
    color = event.target.value;
    el.querySelectorAll("[data-color]").forEach(button => {
      button.classList.remove("selected");
      button.setAttribute("aria-pressed", "false");
    });
    el.querySelector("[data-tool=brush]").click();
    updateBrushPreview();
  };
  el.querySelectorAll("[data-tool]").forEach(b => b.onclick = () => {
    tool = b.dataset.tool;
    el.querySelectorAll("[data-tool]").forEach(x => {
      x.classList.toggle("selected", x === b);
      x.setAttribute("aria-pressed", String(x === b));
    });
    updateBrushPreview();
    refreshHistoryControls();
  });

  const brushSlider = $("#brush-size", el);
  const brushValue = $("#brush-size-value", el);
  const brushPreview = $("#brush-size-preview", el);
  function updateBrushPreview() {
    const visualSize = Math.max(3, Math.min(22, size));
    brushValue.textContent = `${size} px`;
    brushSlider.setAttribute("aria-valuetext", `${size} pixels`);
    brushPreview.style.width = `${visualSize}px`;
    brushPreview.style.height = `${visualSize}px`;
    brushPreview.style.backgroundColor = tool === "eraser" ? "#ffffff" : color;
    brushPreview.style.border = tool === "eraser" ? "1px solid #7c5b68" : "0";
  }
  brushSlider.oninput = event => {
    size = Number(event.target.value);
    updateBrushPreview();
  };
  updateBrushPreview();

  $("#drawing-undo", el).onclick = () => {
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
    const stroke = history.redo();
    if (!stroke) return;
    redrawCanvas();
    enqueueWrite({ type: "redo", stroke });
  };

  $("#drawing-clear", el).onclick = async () => {
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

  const handleHistoryKeydown = event => {
    if (event.key === "Escape" && !historyOverlay.classList.contains("hidden")) closeHistory();
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      $("#drawing-undo", el).click();
    } else if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      $("#drawing-redo", el).click();
    }
  };
  document.addEventListener("keydown", handleHistoryKeydown);
  const handleOnline = () => { updateSyncStatus("Back online · syncing strokes…"); flushOfflineQueue(); };
  const handleOffline = () => updateSyncStatus();
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  window.addEventListener("beforeunload", outgoingQueue.persist);
  updateSyncStatus();
  flushOfflineQueue();
  refreshHistoryControls();

  $("#drawing-save", el).onclick = saveDrawing;

  async function saveDrawing() {
    if (!history.strokes.length) {
      toast("Add a drawing before sending.");
      return;
    }
    const btn = $("#drawing-save", el);
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const exportContext = exportCanvas.getContext("2d");
      if (!exportContext) throw new Error("Drawing preparation failed.");
      exportContext.fillStyle = "#fff";
      exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      exportContext.drawImage(canvas, 0, 0);
      const photoUrl = exportCanvas.toDataURL("image/jpeg", 0.75);
      const drawingRef = await addDrawingMessage({ authorId: user.uid, authorName: profile.name, photoUrl, createdAtMs: Date.now() });
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
      btn.textContent = "Save & send";
    }
  }

  unsubs.push(watchDrawingMessages(messages => {
    if (!active || !el.isConnected) return;
    const sortedMessages = [...messages].sort((a, b) => drawingTimestamp(b) - drawingTimestamp(a));
    const historyList = $("#drawing-history-list", el);
    if (!historyList) return;
    historyList.innerHTML = sortedMessages.map(m => `
      <article class="history-card">
        <button class="history-image" data-open-drawing="${esc(m.photoUrl || "")}">${m.photoUrl
          ? `<img src="${esc(m.photoUrl)}" alt="Drawing">`
          : m.driveFileId
            ? `<img src="https://drive.google.com/thumbnail?id=${encodeURIComponent(m.driveFileId)}&amp;sz=w256" alt="Drawing">`
            : m.thumbnailUrl ? `<img src="${esc(m.thumbnailUrl)}" alt="Drawing">` : ""}</button>
        <div>
          <strong>${esc(getDisplayName(m.authorId, m.authorName || "Us"))}</strong>
          <small>${new Date(drawingTimestamp(m)).toLocaleString()}</small>
          ${m.driveFileId ? `<a href="${esc(m.driveUrl || `https://drive.google.com/file/d/${m.driveFileId}/view`)}" target="_blank" rel="noopener">Open Drive ↗</a>` : ""}
        </div>
      </article>
    `).join("") || `<div class="empty-diary"><span>♡</span><p>No drawings saved yet.</p></div>`;

    el.querySelectorAll("[data-open-drawing]").forEach((b, index) => {
      const message = sortedMessages[index];
      b.onclick = () => {
        if (b.dataset.openDrawing) loadSaved(b.dataset.openDrawing);
        else if (message?.driveUrl || message?.driveFileId) {
          window.open(message.driveUrl || `https://drive.google.com/file/d/${message.driveFileId}/view`, "_blank", "noopener");
        }
      };
    });
  }));

  function drawingTimestamp(message) {
    if (message.createdAt?.toDate) return message.createdAt.toDate().getTime();
    if (message.createdAtMs) return message.createdAtMs;
    return 0;
  }

  function restoreHistory() {
    if (!history.canUndo) {
      toast("There is no stroke or clear to undo.");
      return;
    }
    $("#drawing-undo", el).click();
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
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    window.removeEventListener("beforeunload", outgoingQueue.persist);
    onDisconnect(presenceRef).cancel();
    set(presenceRef, { name: profile.name, uid: user.uid, state: "offline", lastSeen: Date.now() });
  };
}