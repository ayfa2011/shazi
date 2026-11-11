import { $, toast } from "./utils.js";
import { createTheaterRoom, getTheaterRoom, joinTheaterRoom, endTheaterRoom, watchTheaterRoom } from "./firestore.js";
import { getProfileKey } from "./profile-data.js";
import { APP_CONFIG } from "../config/app-config.js";

const BACKEND_URL = APP_CONFIG.theater?.backendUrl || "";
const WS_URL = BACKEND_URL ? BACKEND_URL.replace(/^http/, "ws") : "";

let currentScreen = "main";
let currentRoom = null;
let roomUnsubscribe = null;
let ws = null;
let wsReconnectTimer = null;
let isSyncing = false;

export function renderTheater(el, user, profile) {
  currentScreen = "main";
  stopRoomWatch();
  el.innerHTML = `
    <section class="theater-page" data-theater-screen="main">
      <header class="theater-page-heading">
        <div>
          <p class="eyebrow">OUR LITTLE WORLD</p>
          <h1>Theater</h1>
        </div>
        <button type="button" class="theater-back" aria-label="Back to More">←</button>
      </header>
      <div class="theater-actions">
        <button type="button" class="theater-action card" id="theater-create-room">
          <span class="theater-action-icon" aria-hidden="true">🎬</span>
          <span><strong>Create Room</strong><small>Start a private movie room</small></span>
          <span class="theater-action-arrow" aria-hidden="true">↗</span>
        </button>
        <button type="button" class="theater-action card" id="theater-join-room">
          <span class="theater-action-icon" aria-hidden="true">🚪</span>
          <span><strong>Join Room</strong><small>Enter a private movie room</small></span>
          <span class="theater-action-arrow" aria-hidden="true">↗</span>
        </button>
      </div>
      <div id="theater-detail"></div>
    </section>
  `;

  $("#theater-create-room", el).onclick = () => renderCreateRoom(el, user, profile);
  $("#theater-join-room", el).onclick = () => renderJoinRoom(el, user, profile);
  $(".theater-back", el).onclick = () => window.App?.navigate("more");
}

function creatorFrom(user, profile) {
  return {
    uid: user.uid,
    profileKey: profile ? getProfileKey(profile) : "",
    name: profile ? profile.name : ""
  };
}

function renderCreateRoom(el, user, profile) {
  currentScreen = "create";
  const detail = $("#theater-detail", el);
  detail.innerHTML = `
    <div class="theater-screen theater-screen-create">
      <button type="button" class="theater-screen-back" aria-label="Back">← Back</button>
      <div class="theater-card">
        <h2>Create Room</h2>
        <p class="muted">Pick a movie to watch together.</p>
        <div class="theater-field">
          <label>Movie name</label>
          <input type="text" id="theater-movie-name" placeholder="e.g. Our Favorite Movie">
        </div>
        <div class="theater-field">
          <label>Telegram Movie Link</label>
          <input type="text" id="theater-telegram-link" placeholder="https://t.me/yourMovieGroup/123">
          <small class="muted">Upload the movie to your separate Telegram Movie Group first, then paste its link here.</small>
        </div>
        <button type="button" class="primary full" id="theater-btn-create">Create Room</button>
      </div>
      <div id="theater-create-msg" class="muted"></div>
    </div>
  `;

  $(".theater-screen-back", detail).onclick = () => renderTheater(el, user, profile);
  $("#theater-btn-create", detail).onclick = async () => {
    const name = $("#theater-movie-name", detail).value.trim();
    const link = $("#theater-telegram-link", detail).value.trim();
    const msg = $("#theater-create-msg", detail);
    if (!name || !link) {
      msg.textContent = "Please fill both fields.";
      return;
    }
    msg.textContent = "Creating room…";
    $("#theater-btn-create", detail).disabled = true;
    try {
      const telegramFileId = extractTelegramFileId(link);
      if (!telegramFileId) {
        msg.textContent = "Could not read the Telegram link. Use a link like https://t.me/groupName/123";
        $("#theater-btn-create", detail).disabled = false;
        return;
      }
      const room = await createTheaterRoom({
        movieName: name,
        telegramFileId,
        creator: creatorFrom(user, profile)
      });
      msg.textContent = `Room created: ${room.roomCode}`;
      toast("Room created! Share the code with your partner.");
      currentRoom = { ...room, movieName: name, telegramFileId };
      renderPlayerScreen(el, user, currentRoom, true, profile);
    } catch (error) {
      console.error(error);
      toast(error.message || "Could not create room.");
      msg.textContent = "";
      $("#theater-btn-create", detail).disabled = false;
    }
  };
}

function renderJoinRoom(el, user, profile) {
  currentScreen = "join";
  const detail = $("#theater-detail", el);
  detail.innerHTML = `
    <div class="theater-screen theater-screen-join">
      <button type="button" class="theater-screen-back" aria-label="Back">← Back</button>
      <div class="theater-card">
        <h2>Join Room</h2>
        <p class="muted">Enter the room code your partner shared.</p>
        <div class="theater-field">
          <label>Room Code</label>
          <input type="text" id="theater-room-code" placeholder="ABCD1234" maxlength="8">
        </div>
        <button type="button" class="primary full" id="theater-btn-join">Join Room</button>
      </div>
      <div id="theater-join-msg" class="muted"></div>
    </div>
  `;

  $(".theater-screen-back", detail).onclick = () => renderTheater(el, user, profile);
  $("#theater-btn-join", detail).onclick = async () => {
    const code = $("#theater-room-code", detail).value.trim().toUpperCase();
    const msg = $("#theater-join-msg", detail);
    if (!code) {
      msg.textContent = "Please enter a room code.";
      return;
    }
    msg.textContent = "Joining room…";
    $("#theater-btn-join", detail).disabled = true;
    try {
      const room = await joinTheaterRoom(code, creatorFrom(user, profile));
      msg.textContent = `Joined: ${room.movieName}`;
      toast("Joined the room.");
      currentRoom = room;
      renderPlayerScreen(el, user, currentRoom, false, profile);
    } catch (error) {
      console.error(error);
      toast(error.message || "Could not join room.");
      msg.textContent = "";
      $("#theater-btn-join", detail).disabled = false;
    }
  };
}

function extractTelegramFileId(link) {
  try {
    const url = new URL(link);
    const path = url.pathname.replace(/\/$/, "");
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0].startsWith("@") === false && url.hostname.includes("t.me")) {
      return parts[parts.length - 1];
    }
    return null;
  } catch { return null; }
}

function renderPlayerScreen(el, user, room, isCreator, profile) {
  currentScreen = "player";
  const detail = $("#theater-detail", el);
  detail.innerHTML = `
    <div class="theater-screen theater-screen-player">
      <button type="button" class="theater-screen-back" aria-label="Leave room">Leave Room</button>
      <div class="theater-card theater-player-card">
        <div class="theater-player-header">
          <strong class="theater-player-title">${esc(room.movieName)}</strong>
          <span class="theater-player-code">${esc(room.roomCode)}</span>
        </div>
        <div class="theater-player-video">
          <video id="theater-video" playsinline preload="metadata" poster="#"></video>
        </div>
        <div class="theater-player-controls">
          <button type="button" class="theater-btn" id="theater-btn-play-pause" aria-label="Play/Pause">▶</button>
          <button type="button" class="theater-btn" id="theater-btn-sync">⟲ Sync</button>
          <input type="range" id="theater-seek" min="0" max="100" value="0" step="1">
        </div>
        <div class="theater-player-partners">
          <span class="muted">Creator: ${esc(room.creator?.name || "You")}</span>
          <span class="muted">${isCreator ? "Waiting for partner…" : `Partner: ${esc(room.partner?.name || "—")}`}</span>
        </div>
        <button type="button" class="theater-btn theater-btn-end" id="theater-btn-end-room" aria-label="End room">End Room</button>
      </div>
      <div id="theater-player-msg" class="muted"></div>
    </div>
  `;

  $(".theater-screen-back", detail).onclick = () => {
    stopRoomWatch();
    renderTheater(el, user, profile);
  };
  $("#theater-btn-end-room", detail).onclick = async () => {
    if (!confirm("End this room? Temporary movie cache and room data will be deleted.")) return;
    try {
      await endTheaterRoom(room.roomCode);
      toast("Room ended.");
      stopRoomWatch();
      renderTheater(el, user, profile);
    } catch (error) {
      console.error(error);
      toast(error.message || "Could not end room.");
    }
  };

  const video = $("#theater-video", detail);
  const playBtn = $("#theater-btn-play-pause", detail);
  const syncBtn = $("#theater-btn-sync", detail);
  const seek = $("#theater-seek", detail);
  const msg = $("#theater-player-msg", detail);

  if (!BACKEND_URL) {
    msg.textContent = "Configure APP_CONFIG.theater.backendUrl in config/app-config.js to enable streaming.";
    video.style.display = "none";
    return;
  }

  video.src = `${BACKEND_URL}/stream/${room.roomCode}`;
  video.style.display = "block";
  msg.textContent = "Loading movie…";

  video.addEventListener("error", () => {
    msg.textContent = "Could not load video. Make sure the backend is running and the movie is uploaded to Telegram.";
  });

  playBtn.onclick = () => {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    updatePlayBtn();
    broadcast({ type: video.paused ? "pause" : "play", currentTime: video.currentTime });
  };
  video.addEventListener("play", () => { updatePlayBtn(); broadcast({ type: "play", currentTime: video.currentTime }); });
  video.addEventListener("pause", () => { updatePlayBtn(); broadcast({ type: "pause", currentTime: video.currentTime }); });
  video.addEventListener("loadedmetadata", () => {
    seek.max = Math.floor(video.duration || 0);
    msg.textContent = "";
  });
  video.addEventListener("timeupdate", () => {
    if (!seek.matches(":focus-within") && !isSyncing) seek.value = Math.floor(video.currentTime || 0);
  });
  seek.oninput = () => {
    video.currentTime = Number(seek.value);
  };
  seek.onchange = () => {
    broadcast({ type: "seek", currentTime: Number(seek.value) });
  };
  syncBtn.onclick = () => {
    broadcast({ type: "sync", currentTime: video.currentTime });
    toast("Sync requested.");
  };

  connectWebSocket(room.roomCode, user, profile, video, playBtn, seek, msg);
  startRoomWatch(el, user, profile, room.roomCode, video, playBtn, seek, msg);
}

function updatePlayBtn() {
  const btn = $("#theater-btn-play-pause");
  if (!btn) return;
  const video = $("#theater-video");
  btn.textContent = video && video.paused ? "▶" : "⏸";
}

function broadcast(msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ ...msg, roomCode: currentRoom?.roomCode, from: currentRoom?.creator?.uid === (window.currentUser?.uid) ? "creator" : "partner" }));
}

function connectWebSocket(roomCode, user, profile, video, playBtn, seek, msg) {
  if (!WS_URL) return;
  if (ws) { ws.close(); ws = null; }
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }

  ws = new WebSocket(`${WS_URL}/ws`);
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "join", roomCode, from: profile?.name || "user" }));
    msg.textContent = "Connected — waiting for partner…";
  };
  ws.onmessage = event => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "joined") {
        msg.textContent = "Partner connected. Play the movie!";
        return;
      }
      if (!data.roomCode || data.roomCode !== roomCode) return;
      isSyncing = true;
      if (data.type === "play") { video.currentTime = data.currentTime ?? 0; video.play().catch(() => {}); }
      else if (data.type === "pause") { video.pause(); }
      else if (data.type === "seek") { video.currentTime = data.currentTime ?? 0; }
      else if (data.type === "sync") { video.currentTime = data.currentTime ?? 0; }
      seek.value = Math.floor(video.currentTime || 0);
      updatePlayBtn();
      isSyncing = false;
    } catch { /* ignore malformed */ }
  };
  ws.onclose = () => {
    ws = null;
    msg.textContent = "Connection lost. Reconnecting…";
    wsReconnectTimer = setTimeout(() => connectWebSocket(roomCode, user, profile, video, playBtn, seek, msg), 3000);
  };
  ws.onerror = () => {
    ws.close();
  };
}

function startRoomWatch(el, user, profile, roomCode, video, playBtn, seek, msg) {
  stopRoomWatch();
  roomUnsubscribe = watchTheaterRoom(roomCode, room => {
    if (!room) {
      msg.textContent = "Room no longer available.";
      return;
    }
    currentRoom = room;
    if (room.status === "ended") {
      msg.textContent = "Room has ended.";
      stopRoomWatch();
      return;
    }
  }, error => {
    console.error("Theater room watch failed:", error);
  });
}

function stopRoomWatch() {
  if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
}

export function disposeTheater() {
  currentScreen = "main";
  stopRoomWatch();
  if (ws) { ws.close(); ws = null; }
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  currentRoom = null;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
