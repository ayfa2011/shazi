import { $, esc, toast } from "./utils.js";
import { rtdb } from "./firebase.js";
import { addDrawingMessage, watchDrawingMessages } from "./firestore.js";
import { getDisplayName } from "./profile-data.js";
import { ref, push, onChildAdded, onValue, onDisconnect, set, remove } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

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
        <button type="button" class="primary" id="drawing-save">Share</button>
      </div>
    </header>
    <div class="drawing-tools">
      <div class="tool-group colors" aria-label="Brush color">
        <button data-color="#dc4d88" style="--swatch:#dc4d88" aria-label="Pink" class="selected"></button>
        <button data-color="#263b72" style="--swatch:#263b72" aria-label="Navy"></button>
        <button data-color="#f08a36" style="--swatch:#f08a36" aria-label="Orange"></button>
        <button data-color="#222222" style="--swatch:#222222" aria-label="Black"></button>
        <label class="drawing-custom-color" title="Choose a custom color">
          <input type="color" id="drawing-custom-color" value="#dc4d88" aria-label="Choose custom brush color">
          <span aria-hidden="true">+</span>
        </label>
      </div>
      <label class="brush-size">Size <input id="brush-size" type="range" min="2" max="24" value="5"></label>
      <button class="tool-button selected" data-tool="brush">✎ Brush</button>
      <button class="tool-button" data-tool="eraser">⌫ Eraser</button>
      <button class="tool-button" id="drawing-undo">↶ Undo</button>
      <button class="tool-button" id="drawing-clear">Clear</button>
    </div>
    <div class="draw-board"><canvas class="draw-canvas" id="draw-canvas" width="1200" height="720" aria-label="Shared drawing canvas"></canvas><div class="canvas-watermark">K &amp; S ♡</div></div>
    <button type="button" class="tool-button drawing-history-trigger" id="drawing-history-open">History</button>
    <div class="drawing-status"><span class="presence-dot"></span><span id="drawing-presence">Connecting…</span></div>
    <div class="drawing-history-overlay hidden" id="drawing-history-overlay" role="dialog" aria-modal="true" aria-labelledby="drawing-history-title">
      <section class="drawing-history-dialog">
        <header><h2 id="drawing-history-title">Drawing history</h2><button type="button" class="drawing-close" id="drawing-history-close" aria-label="Close history">×</button></header>
        <div id="drawing-history-list" class="drawing-history-list"><p class="muted">Loading saved drawings…</p></div>
      </section>
    </div>
  </section>`;

  const canvas = $("#draw-canvas", el), ctx = canvas.getContext("2d"), strokeRef = ref(rtdb, `${root}/strokes`), presenceRef = ref(rtdb, `${root}/presence/${profile.id}`), connectedRef = ref(rtdb, ".info/connected"), unsubs = [];
  let color = "#dc4d88", size = 5, tool = "brush", drawing = false, active = true, last = null, activeStroke = null, allStrokes = [];
  const historyOverlay = $("#drawing-history-overlay", el);

  $("#drawing-close", el).onclick = () => window.App?.navigate("home");
  $("#drawing-history-open", el).onclick = () => historyOverlay.classList.remove("hidden");
  $("#drawing-history-close", el).onclick = () => historyOverlay.classList.add("hidden");
  historyOverlay.onclick = event => {
    if (event.target === historyOverlay) historyOverlay.classList.add("hidden");
  };

  function point(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * 1200, y: (e.clientY - r.top) / r.height * 720 };
  }

  function drawSegment(a, b, strokeColor, strokeSize, mode = "brush") {
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of allStrokes) {
      if (!stroke.points || stroke.points.length < 2) continue;
      for (let i = 1; i < stroke.points.length; i++) {
        drawSegment(stroke.points[i - 1], stroke.points[i], stroke.color, stroke.size, stroke.tool);
      }
    }
  }

  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    last = point(e);
    activeStroke = { id: crypto.randomUUID(), uid: user.uid, color: tool === "eraser" ? "#fff" : color, size, tool, points: [last] };
  });

  canvas.addEventListener("pointermove", e => {
    if (!drawing || !last) return;
    const p = point(e);
    drawSegment(last, p, color, size, tool);
    activeStroke.points.push(p);
    last = p;
  });

  function endStroke() {
    if (drawing && activeStroke && activeStroke.points.length > 1) {
      push(strokeRef, { type: "stroke", ...activeStroke });
    }
    drawing = false;
    last = null;
    activeStroke = null;
  }
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  unsubs.push(onChildAdded(strokeRef, s => {
    if (!active) return;
    const v = s.val();
    if (!v) return;

    if (v.type === "clear") {
      allStrokes = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    if (v.type === "undo") {
      allStrokes = allStrokes.filter(x => x.id !== v.strokeId);
      redrawCanvas();
      return;
    }

    if (v.type === "stroke") {
      allStrokes.push(v);
      if (v.points && v.points.length > 1) {
        for (let i = 1; i < v.points.length; i++) {
          drawSegment(v.points[i - 1], v.points[i], v.color, v.size, v.tool);
        }
      }
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
    el.querySelectorAll("[data-color]").forEach(x => x.classList.toggle("selected", x === b));
    el.querySelector("[data-tool=brush]").click();
  });
  $("#drawing-custom-color", el).oninput = event => {
    color = event.target.value;
    el.querySelectorAll("[data-color]").forEach(button => button.classList.remove("selected"));
    el.querySelector("[data-tool=brush]").click();
  };
  el.querySelectorAll("[data-tool]").forEach(b => b.onclick = () => {
    tool = b.dataset.tool;
    el.querySelectorAll("[data-tool]").forEach(x => x.classList.toggle("selected", x === b));
  });
  $("#brush-size", el).oninput = e => size = Number(e.target.value);

  $("#drawing-undo", el).onclick = async () => {
    const myLastStroke = [...allStrokes].reverse().find(s => s.uid === user.uid);
    if (!myLastStroke) {
      toast("There is no line to undo.");
      return;
    }
    await push(strokeRef, { type: "undo", strokeId: myLastStroke.id, uid: user.uid });
    toast("Your last line was undone.");
  };

  $("#drawing-clear", el).onclick = async () => {
    await push(strokeRef, { type: "clear", uid: user.uid });
    toast("Canvas cleared for both of you.");
  };

  $("#drawing-save", el).onclick = saveDrawing;

  async function saveDrawing() {
    if (!allStrokes.length) {
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
      await addDrawingMessage({ authorId: user.uid, authorName: profile.name, photoUrl, createdAtMs: Date.now() });

      // Clean up Realtime DB old strokes after saving
      await remove(strokeRef);
      await push(strokeRef, { type: "clear", uid: user.uid });

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

  function loadSaved(photoUrl) {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      historyOverlay.classList.add("hidden");
    };
    img.onerror = () => toast("Could not open this drawing.");
    img.src = photoUrl;
  }

  activeDrawingCleanup = () => {
    active = false;
    unsubs.forEach(stop => stop());
    onDisconnect(presenceRef).cancel();
    set(presenceRef, { name: profile.name, uid: user.uid, state: "offline", lastSeen: Date.now() });
  };
}