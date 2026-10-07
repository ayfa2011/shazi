import { $, esc, toast } from "./utils.js";
import { rtdb } from "./firebase.js";
import { addDrawingMessage, watchDrawingMessages, getDrawingsFolder, saveDrawingsFolder } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { ref, push, onChildAdded, onValue, onDisconnect, set, remove } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const root = "couples/our-little-world/drawing";
let activeDrawingCleanup = null;

export function disposeDrawing() { activeDrawingCleanup?.(); activeDrawingCleanup = null; }

export function renderDrawing(el, user, profile) {
  disposeDrawing();
  el.innerHTML = `<section class="live-drawing"><header class="drawing-heading"><div><p class="eyebrow">DRAW • SHARE • KEEP FOREVER</p><h1>Our Drawing Canvas</h1><p class="muted">Make something together, one little stroke at a time ♡</p></div><button class="secondary" id="drawing-save">Save &amp; send</button></header>
 <div class="drawing-tools"><div class="tool-group colors" aria-label="Brush color"><button data-color="#dc4d88" style="--swatch:#dc4d88" aria-label="Pink" class="selected"></button><button data-color="#263b72" style="--swatch:#263b72" aria-label="Navy"></button><button data-color="#f08a36" style="--swatch:#f08a36" aria-label="Orange"></button><button data-color="#222222" style="--swatch:#222222" aria-label="Black"></button></div><label class="brush-size">Size <input id="brush-size" type="range" min="2" max="24" value="5"></label><button class="tool-button selected" data-tool="brush">✎ Brush</button><button class="tool-button" data-tool="eraser">⌫ Eraser</button><button class="tool-button" id="drawing-undo">↶ Undo</button><button class="tool-button" id="drawing-clear">Clear</button></div>
 <div class="draw-board"><canvas class="draw-canvas" id="draw-canvas" width="1200" height="720" aria-label="Shared drawing canvas"></canvas><div class="canvas-watermark">K &amp; S ♡</div></div>
 <div class="drawing-status"><span class="presence-dot"></span><span id="drawing-presence">Connecting…</span><span class="muted">Your strokes sync live when you are online.</span></div>
 <section class="drawing-history"><div class="section-head"><div><p class="eyebrow">OUR LITTLE GALLERY</p><h2>Drawing history</h2></div></div><div id="drawing-history-list" class="drawing-history-list"><p class="muted">Loading saved drawings…</p></div></section></section>`;

  const canvas = $("#draw-canvas", el), ctx = canvas.getContext("2d"), strokeRef = ref(rtdb, `${root}/strokes`), presenceRef = ref(rtdb, `${root}/presence/${profile.id}`), connectedRef = ref(rtdb, ".info/connected"), unsubs = [];
  let color = "#dc4d88", size = 5, tool = "brush", drawing = false, last = null, activeStroke = null, allStrokes = [];

  function point(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * 1200, y: (e.clientY - r.top) / r.height * 720 };
  }

  function drawSegment(a, b, strokeColor, strokeSize, mode = "brush") {
    ctx.save();
    ctx.globalCompositeOperation = mode === "eraser" ? "destination-out" : "source-over";
    ctx.beginPath();
    ctx.moveTo(a.x / 1200 * canvas.clientWidth, a.y / 720 * canvas.clientHeight);
    ctx.lineTo(b.x / 1200 * canvas.clientWidth, b.y / 720 * canvas.clientHeight);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeSize * canvas.clientWidth / 1200;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }

  function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
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
    const v = s.val();
    if (!v) return;

    if (v.type === "clear") {
      allStrokes = [];
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
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
    if (s.val()) {
      set(presenceRef, { name: profile.name, uid: user.uid, state: "online", lastSeen: Date.now() });
      onDisconnect(presenceRef).set({ name: profile.name, uid: user.uid, state: "offline", lastSeen: Date.now() });
    }
  }));

  const presenceListRef = ref(rtdb, `${root}/presence`);
  unsubs.push(onValue(presenceListRef, s => {
    const people = Object.values(s.val() || {}), online = people.filter(p => p.state === "online");
    $("#drawing-presence", el).textContent = online.length >= 2 ? "Both online · Drawing together!" : online.length ? `${online[0].name} online · Waiting for your person…` : "You are offline · Draw and send when you reconnect";
    $(".presence-dot", el).classList.toggle("online", online.length > 0);
  }));

  el.querySelectorAll("[data-color]").forEach(b => b.onclick = () => {
    color = b.dataset.color;
    el.querySelectorAll("[data-color]").forEach(x => x.classList.toggle("selected", x === b));
    el.querySelector("[data-tool=brush]").click();
  });
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

  async function getToken() {
    if (!APP_CONFIG.googleDriveClientId) throw new Error("Add Google OAuth client ID.");
    if (!window.google?.accounts?.oauth2) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.onload = resolve;
        s.onerror = () => reject(new Error("Google sign-in error."));
        document.head.appendChild(s);
      });
    }
    return new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: APP_CONFIG.googleDriveClientId,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: r => r.access_token ? resolve(r.access_token) : reject(new Error("Drive permission error.")),
        error_callback: () => reject(new Error("Sign-in cancelled."))
      });
      client.requestAccessToken();
    });
  }

  async function driveFolder(token) {
    if (APP_CONFIG.googleDriveDrawingsFolderId) return APP_CONFIG.googleDriveDrawingsFolderId;
    let folderId = await getDrawingsFolder();
    if (!folderId) {
      const created = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Our Little World Drawings", mimeType: "application/vnd.google-apps.folder", ...(APP_CONFIG.googleDriveFolderId ? { parents: [APP_CONFIG.googleDriveFolderId] } : {}) })
      });
      if (!created.ok) throw new Error("Could not create drawings folder.");
      folderId = (await created.json()).id;
      await saveDrawingsFolder(folderId);
    }
    return folderId;
  }

  async function saveDrawing() {
    if (!allStrokes.length) {
      toast("Add a drawing before sending.");
      return;
    }
    const btn = $("#drawing-save", el);
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const token = await getToken(), folderId = await driveFolder(token), blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Drawing preparation failed.");
      const metadata = { name: `Drawing - ${profile.name} - ${new Date().toLocaleString()}.png`, mimeType: "image/png", parents: [folderId] }, body = new FormData();
      body.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      body.append("file", blob, "drawing.png");

      const uploaded = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink", {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body
      });
      if (!uploaded.ok) throw new Error("Drive upload failed.");
      const file = await uploaded.json();

      await addDrawingMessage({ authorId: profile.id, authorName: profile.name, driveFileId: file.id, driveUrl: file.webViewLink, thumbnailUrl: file.thumbnailLink || "", folderId, createdAtMs: Date.now() });

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
    $("#drawing-history-list", el).innerHTML = messages.map(m => `
      <article class="history-card">
        <button class="history-image" data-open-drawing="${esc(m.driveFileId)}">${m.thumbnailUrl ? `<img src="${esc(m.thumbnailUrl)}" alt="Drawing">` : `<span>♡</span><small>Open</small>`}</button>
        <div>
          <strong>${esc(m.authorName || "Us")}</strong>
          <small>${m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : new Date(m.createdAtMs || Date.now()).toLocaleString()}</small>
          <a href="${esc(m.driveUrl || `https://drive.google.com/file/d/${m.driveFileId}/view`)}" target="_blank" rel="noopener">Open Drive ↗</a>
        </div>
      </article>
    `).join("") || `<div class="empty-diary"><span>♡</span><p>No drawings saved yet.</p></div>`;

    el.querySelectorAll("[data-open-drawing]").forEach(b => b.onclick = () => loadSaved(b.dataset.openDrawing));
  }));

  async function loadSaved(fileId) {
    try {
      const token = await getToken(), r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Download failed.");
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight);
      };
      img.src = URL.createObjectURL(await r.blob());
    } catch (e) {
      toast(e.message);
    }
  }

  activeDrawingCleanup = () => {
    unsubs.forEach(stop => stop());
    onDisconnect(presenceRef).cancel();
    set(presenceRef, { name: profile.name, uid: user.uid, state: "offline", lastSeen: Date.now() });
  };
}