import { APP_CONFIG } from "../config/app-config.js";
import { deleteTelegramGalleryMessage, getTelegramMediaUrl, revokeTelegramMediaUrl, sendToTelegram, telegramMediaReferences, telegramUploadMimeType } from "../src/services/telegramService.js";
import { rtdb } from "./firebase.js";
import { $, toast } from "./utils.js";
import { addItem, notifyPartnerSafely, removeItem, watchItems } from "./firestore.js";
import {
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref as dbRef,
  remove,
  runTransaction,
  serverTimestamp,
  set
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

// The Worker streams media back through Telegram's getFile endpoint, which only
// serves files up to 50 MB. Uploads beyond that would store fine but never play,
// so 50 MB is the real ceiling for anything that has to come back as a stream.
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_CHAT_LENGTH = 500;
const SYNC_INTERVAL_MS = 4000;
// While a song is uploading (or audio is being extracted) the uploader refreshes
// session.updatedAt; a session with no heartbeat for this long is considered dead.
const UPLOAD_HEARTBEAT_MS = 10 * 1000;
const UPLOAD_STALE_MS = 60 * 1000;
const STALE_CHECK_MS = 15 * 1000;
const ROOT = `couples/${APP_CONFIG.coupleId}/music`;

// Recently Played is device-local (localStorage) so it renders instantly with
// no network round-trip — keeps the music drawer snappy on iOS/Android.
const RECENT_LIMIT = 12;

const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|wav|wave|ogg|oga|opus|flac|weba|aiff?)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|avi|3gp|3g2|mpeg|mpg)$/i;

/**
 * Extract an audio-only WebM file from a local video using browser-native APIs.
 * No video bytes are uploaded. Browsers without MediaRecorder/captureStream report
 * a clear error instead of silently failing the upload.
 */
async function extractAudioTrack(videoFile) {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(videoFile);
  let recorder;
  let stream;
  try {
    const capture = video.captureStream || video.mozCaptureStream;
    if (!capture || typeof MediaRecorder === "undefined") {
      throw new Error("This browser cannot extract audio from video. Please choose an audio file or try Chrome on desktop.");
    }
    video.preload = "auto";
    video.playsInline = true;
    video.src = objectUrl;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("This video could not be opened for audio extraction."));
      video.load();
    });
    stream = capture.call(video);
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      throw new Error("No audio track was found in this video.");
    }
    const audioOnlyStream = new MediaStream(audioTracks);
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
      .find(type => MediaRecorder.isTypeSupported?.(type)) || "";
    const chunks = [];
    recorder = new MediaRecorder(audioOnlyStream, mimeType ? { mimeType } : undefined);
    const recording = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error("Audio extraction failed. Please try another video or upload an audio file."));
      recorder.onstop = () => {
        const outputType = recorder.mimeType || mimeType || "audio/webm";
        if (!chunks.length) reject(new Error("No audio data could be extracted from this video."));
        else resolve(new File(chunks, `${videoFile.name.replace(/\.[^.]+$/, "") || "music"}.webm`, { type: outputType }));
      };
    });
    recorder.start(250);
    await video.play();
    await new Promise((resolve, reject) => {
      video.onended = resolve;
      video.onerror = () => reject(new Error("Video playback stopped during audio extraction."));
    });
    if (recorder.state !== "inactive") recorder.stop();
    const extracted = await recording;
    if (extracted.size > MAX_FILE_SIZE) {
      throw new Error("Extracted audio is larger than 50 MB. Please choose a shorter video.");
    }
    return extracted;
  } finally {
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* ignore cleanup errors */ }
    }
    stream?.getTracks().forEach(track => track.stop());
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

/** Format a seconds value as m:ss for the player readouts. */
function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

let cleanupCurrent = null;

function setStatus(message) {
  const status = $("#track-status");
  if (status) status.textContent = message;
}

function appendChatMessage(message, profileName, ownMessage) {
  const list = $("#music-chat-messages");
  if (!list) return;
  const item = document.createElement("div");
  item.className = `music-chat-message${ownMessage ? " own" : ""}`;
  const author = document.createElement("strong");
  author.textContent = profileName || "Partner";
  const text = document.createElement("span");
  text.textContent = message;
  item.append(author, text);
  list.append(item);
  while (list.children.length > 50) list.firstElementChild.remove();
  list.scrollTop = list.scrollHeight;
}

export function initMusic(user) {
  cleanupCurrent?.();
  // Music-only visual refresh; index.html is intentionally not modified.
  if (!document.getElementById("music-js-only-style")) {
    const style = document.createElement("style");
    style.id = "music-js-only-style";
    style.textContent = `
      #music-library, #music-queue-list { display:grid; gap:10px; min-width:0; }
      #music-library .music-library-item, #music-queue-list .music-library-item {
        display:flex; align-items:center; gap:10px; min-width:0; box-sizing:border-box;
        padding:12px 13px; border:1px solid #f5d5e2; border-radius:16px;
        background:linear-gradient(135deg,#fff9fc,#fff1f6); overflow:hidden;
      }
      #music-library .music-library-item > span, #music-queue-list .music-library-item > span {
        flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        font-size:14px; color:#442b37;
      }
      .music-library-actions { display:flex; flex-shrink:0; gap:7px; }
      .music-library-actions button { border-radius:12px; min-height:36px; padding:7px 12px; }
      #music-queue-section { margin-top:24px; }
      #music-queue-section h3 { margin-bottom:12px; color:#492d3a; }
      #music-queue-list .muted { margin:8px 0 16px; }
      #music-chat-messages { min-height:150px; max-height:260px; overflow:auto; padding:8px 2px; }
      #music-chat-form { display:flex; gap:8px; align-items:center; }
      #music-chat-input { flex:1; min-width:0; min-height:46px; border-radius:16px; }
      #music-chat-form button { min-height:46px; border-radius:16px; }
      #music-upload { max-width:100%; }
      #stop-music, #replay-music { border-radius:16px; }
      .music-upload-status { min-height:16px; margin:0 2px 7px; font-size:11px; }
      #music-recent-section { margin-top:24px; }
      #music-recent-section h4 { margin:0 0 10px; color:#492d3a; }
      #music-recent-list { display:grid; gap:8px; min-width:0; }
      .music-recent-item {
        display:flex; align-items:center; gap:10px; min-width:0; box-sizing:border-box;
        padding:9px 12px; border:1px solid #f5d5e2; border-radius:14px;
        background:#fff9fc; font-size:13px;
      }
      .music-recent-item > span {
        flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#442b37;
      }
      .music-recent-item .music-recent-when { flex:none; color:#a08090; font-size:11px; }
      .music-recent-delete {
        flex:none; width:32px; height:32px; border:0; border-radius:50%;
        background:#fff0f2; color:#bd3158; font-size:16px; line-height:1; cursor:pointer;
      }
      .music-recent-delete:active { background:#fbe2e8; }
      .music-recent-empty { margin:6px 0 0; font-size:12px; }
      @media (max-width:520px) {
        #music-library .music-library-item, #music-queue-list .music-library-item { padding:10px; }
        #music-library .music-library-item > span, #music-queue-list .music-library-item > span { font-size:12px; }
        .music-library-actions button { padding:6px 9px; }
        #music-chat-messages { min-height:170px; }
        .music-controls { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
      }
    `;
    document.head.append(style);
  }
  const ownKey = Object.keys(APP_CONFIG.profiles).find(key => APP_CONFIG.profiles[key].email?.toLowerCase() === user.email?.toLowerCase());
  const actorName = APP_CONFIG.profiles[ownKey]?.name || user.displayName || "Your partner";

  const player = $("#audio-player");
  const audio = player;
  const uploadInput = $("#music-upload");
  const progressInput = $("#music-progress");
  const elapsedLabel = $("#music-elapsed");
  const durationLabel = $("#music-duration");
  const uid = user.uid;
  const sessionRef = dbRef(rtdb, `${ROOT}/session`);
  const legacyLibraryRef = dbRef(rtdb, `${ROOT}/library`);
  const chatRef = dbRef(rtdb, `${ROOT}/chat`);
  const queueRef = dbRef(rtdb, `${ROOT}/queue`);
  const presenceRef = dbRef(rtdb, `${ROOT}/presence`);
  const uploadsRef = dbRef(rtdb, `${ROOT}/uploads`);
  const uploadRef = dbRef(rtdb, `${ROOT}/uploads/${uid}`);
  const profile = Object.values(APP_CONFIG.profiles).find(item => item.email.toLowerCase() === user.email?.toLowerCase());
  const name = profile?.name || user.displayName || "Partner";
  let session = null;
  let currentLibrary = [];
  let legacyLibrary = {};
  let sharedQueue = {};
  let presence = {};
  let connectionRef = null;
  let siteActive = false;
  let disposed = false;
  let lastTimeWrite = 0;
  let lastRenderedUrl = "";
  let activeTrackFileId = "";
  let trackLoadGeneration = 0;
  let pendingSeek = null;
  let lastLibraryLock = "";
  let emptyPresenceTimer = null;
  let audioErrorShown = false;
  let seeking = false;
  let advancingQueue = false;
  let uploadInFlight = false;
  let saveInFlight = false;
  let promptForStartedAt = null;
  let recentSessionKey = "";
  let sharedUploads = {};
  const uploadToken = globalThis.crypto?.randomUUID?.() || `${uid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let staleCheckTimer = null;
  const unsubscribers = [];

  function reportError(error, message) {
    console.error(message, error);
    toast(message);
  }

  const trackKey = track => track?.telegramFileId || track?.url || "";
  const trackUrl = track => track?.telegramFileId
    ? getTelegramMediaUrl(track.telegramFileId, track.mimeType || "audio/mpeg")
    : Promise.resolve(track?.url || "");
  const combinedLibrary = () => [
    ...currentLibrary,
    ...Object.entries(legacyLibrary).map(([id, song]) => ({ ...song, id, __legacyRealtimeDatabase: true }))
  ];

  /**
   * Plain copy of a track's fields for writing into the session. Realtime Database
   * rejects `undefined` anywhere in a written object, so every optional field is
   * normalised to a value or null (saved Telegram songs have no `url`/`path`).
   */
  const trackFields = song => ({
    url: song.url ?? null,
    path: song.path ?? null,
    telegramFileId: song.telegramFileId || "",
    telegramFileUniqueId: song.telegramFileUniqueId || "",
    mimeType: song.mimeType || "audio/mpeg",
    telegramMessageId: song.telegramMessageId ?? null,
    telegramChatId: song.telegramChatId ?? null,
    name: song.name || "Our song",
    saved: Boolean(song.saved),
    addedBy: song.addedBy ?? null,
    addedByName: song.addedByName ?? null,
    addedAt: song.addedAt ?? null
  });

  /** Queue entries oldest-first (do not rely on object key order). */
  const sortedQueueEntries = () => Object.entries(sharedQueue || {})
    .sort(([idA, a], [idB, b]) => (Number(a?.addedAt) || 0) - (Number(b?.addedAt) || 0) || idA.localeCompare(idB));

  async function deleteTemporaryTrack(track) {
    if (!track?.telegramMessageId || !track.telegramChatId || track.saved) return;
    try {
      await deleteTelegramGalleryMessage(track.telegramChatId, track.telegramMessageId);
    } catch (error) {
      console.error("Temporary Telegram music message could not be removed:", error);
    }
  }

  async function clearSession(expectedOwner) {
    let removedTrack = null;
    try {
      const result = await runTransaction(sessionRef, current => {
        if (!current || (expectedOwner && current.ownerUid !== expectedOwner)) return;
        removedTrack = current;
        return null;
      }, { applyLocally: false });
      if (result.committed) await deleteTemporaryTrack(removedTrack);
    } catch (error) {
      reportError(error, "The music session could not be cleared.");
    }
  }

  async function patchOwnedSession(values, expectedStartedAt) {
    // Both partners have equal control over the shared player.
    const result = await runTransaction(sessionRef, current => {
      if (!current?.ownerUid || (expectedStartedAt !== undefined && current.startedAt !== expectedStartedAt)) return;
      return { ...current, ...values, lastActionUid: uid, lastActionName: name, updatedAt: Date.now() };
    }, { applyLocally: false });
    return result.committed;
  }

  /**
   * Song finished and nothing is queued: keep the session (so Replay and Save still
   * work) but mark it ended. Guarded by startedAt so a late "ended" event from one
   * device can never stop a newer song that has already started.
   */
  async function markSongEnded(expectedStartedAt) {
    const result = await runTransaction(sessionRef, current => {
      if (!current?.ownerUid || current.ended || current.startedAt !== expectedStartedAt) return;
      return { ...current, playing: false, ended: true, time: 0, lastActionUid: uid, lastActionName: name, updatedAt: Date.now() };
    }, { applyLocally: false });
    return result.committed;
  }

  /**
   * Atomically replace the current session with a queued song, and only then remove
   * it from the queue. If the swap is refused the song stays queued (no more lost
   * songs). `expectedStartedAt` makes auto-advance safe when both devices react to
   * the same "ended" event: the first transaction wins, the second is a no-op.
   */
  async function playQueueItem(queueId, song, { expectedStartedAt, silent = false } = {}) {
    let previous = null;
    try {
      const result = await runTransaction(sessionRef, current => {
        if (current?.status === "uploading") return;
        if (expectedStartedAt !== undefined && current?.startedAt !== expectedStartedAt) return;
        previous = current;
        const now = Date.now();
        return {
          ...trackFields(song),
          ownerUid: uid,
          ownerName: name,
          status: "ready",
          playing: true,
          ended: false,
          time: 0,
          startedAt: now,
          updatedAt: now,
          lastActionUid: uid,
          lastActionName: name
        };
      }, { applyLocally: false });
      if (!result.committed) {
        if (!silent) toast("The queued song could not start right now.");
        return false;
      }
    } catch (error) {
      reportError(error, "The queued song could not start.");
      return false;
    }
    stopLocalPlayback();
    try {
      await remove(dbRef(rtdb, `${ROOT}/queue/${queueId}`));
    } catch (error) {
      console.error("Queued song started but could not be removed from the queue:", error);
    }
    if (previous) await deleteTemporaryTrack(previous);
    return true;
  }

  function stopLocalPlayback() {
    trackLoadGeneration++;
    pendingSeek = null;
    audio.pause();
    if (audio.getAttribute("src")) audio.removeAttribute("src");
    audio.load();
    releaseTrackUrl();
    resetProgress();
  }

  async function claimUploadLease(fileName) {
    const now = Date.now();
    const result = await runTransaction(uploadRef, current => {
      const lastBeat = Number(current?.updatedAt || 0);
      if (current?.status === "uploading" && lastBeat && now - lastBeat <= UPLOAD_STALE_MS) return;
      return { uid, token: uploadToken, name: fileName, ownerName: name, status: "uploading", startedAt: now, updatedAt: now };
    }, { applyLocally: false });
    return result.committed;
  }

  async function heartbeatUpload() {
    const result = await runTransaction(uploadRef, current => {
      if (!current) return { uid, token: uploadToken, status: "uploading", updatedAt: Date.now() };
      if (current?.uid !== uid || current?.token !== uploadToken || current.status !== "uploading") return;
      return { ...current, updatedAt: Date.now() };
    }, { applyLocally: false });
    return result.committed;
  }

  async function releaseUploadLease() {
    try {
      await runTransaction(uploadRef, current => current?.uid === uid && current?.token === uploadToken ? null : undefined, { applyLocally: false });
      await onDisconnect(uploadRef).cancel();
    } catch (error) { console.warn("Music upload status could not be cleared:", error); }
  }

  /** Clear an upload session whose uploader stopped sending heartbeats. */
  function checkStaleUpload() {
    const value = session;
    if (!value?.ownerUid || value.status !== "uploading") return;
    const lastBeat = Number(value.updatedAt || value.startedAt || 0);
    if (!lastBeat || Date.now() - lastBeat > UPLOAD_STALE_MS) clearSession(value.ownerUid);
  }

  function checkStaleUploads() {
    const now = Date.now();
    for (const upload of Object.values(sharedUploads)) {
      if (upload?.status === "uploading" && upload.uid && now - Number(upload.updatedAt || 0) > UPLOAD_STALE_MS) {
        remove(dbRef(rtdb, `${ROOT}/uploads/${upload.uid}`)).catch(() => {});
      }
    }
  }

  /** Mirror the <audio> element's clock and seek bar into the drawer. */
  function renderProgress() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    if (elapsedLabel) elapsedLabel.textContent = formatClock(position);
    if (durationLabel) durationLabel.textContent = duration > 0 ? formatClock(duration) : "0:00";
    if (progressInput && !seeking) {
      progressInput.disabled = duration <= 0;
      progressInput.value = String(duration > 0 ? Math.round((position / duration) * 1000) : 0);
    }
  }

  /** Reset the clock readouts whenever a track is torn down. */
  function resetProgress() {
    if (elapsedLabel) elapsedLabel.textContent = "0:00";
    if (durationLabel) durationLabel.textContent = "0:00";
    if (progressInput) {
      progressInput.disabled = true;
      progressInput.value = "0";
    }
  }

  /** Detach the current Telegram blob so its bytes can be garbage collected. */
  function releaseTrackUrl() {
    const previousFileId = activeTrackFileId;
    activeTrackFileId = "";
    lastRenderedUrl = "";
    if (previousFileId) revokeTelegramMediaUrl(previousFileId);
  }

  /** Surface a hard playback failure instead of leaving the UI silently frozen. */
  function reportPlaybackError() {
    const code = audio.error?.code;
    const reason = code === audio.error?.MEDIA_ERR_NETWORK ? "The song could not be streamed from Telegram. Check your connection and try again."
      : code === audio.error?.MEDIA_ERR_DECODE ? "This device cannot decode that audio format."
        : code === audio.error?.MEDIA_ERR_SRC_NOT_SUPPORTED ? "This device cannot play that audio format."
          : "This song could not be played.";
    audioErrorShown = true;
    setStatus(reason);
    toast(reason);
  }

  function renderSession(value) {
    session = value;
    const locked = Boolean(value?.ownerUid);
    const isOwner = value?.ownerUid === uid;
    const trackName = $("#track-name");
    const playButton = $("#play-music");
    const pauseButton = $("#pause-music");
    const saveButton = $("#save-music");
    const uploadButton = $("#music-upload");
    const listenButton = $("#listen-music");
    if (trackName) trackName.textContent = value?.name || "No song selected";
    if (playButton) playButton.disabled = !trackKey(value) || value.status === "uploading";
    if (pauseButton) pauseButton.disabled = !value?.playing;
    if (saveButton) saveButton.disabled = !trackKey(value) || value.saved;
    const ownUpload = sharedUploads[uid];
    if (uploadButton) uploadButton.disabled = uploadInFlight || Boolean(ownUpload?.status === "uploading");
    uploadButton?.closest(".upload-btn")?.classList.toggle("disabled", Boolean(uploadButton?.disabled));
    if (listenButton) listenButton.disabled = !value?.playing;
    const replayButton = $("#replay-music");
    if (replayButton) replayButton.disabled = !trackKey(value);
    const libraryLock = `${value?.ownerUid || ""}:${trackKey(value)}:${value?.ended ? "ended" : "live"}`;
    if (libraryLock !== lastLibraryLock) {
      lastLibraryLock = libraryLock;
      renderLibrary(combinedLibrary());
    }

    const nextTrackKey = trackKey(value);
    if (!nextTrackKey) {
      trackLoadGeneration++;
      pendingSeek = null;
      audioErrorShown = false;
      releaseTrackUrl();
      if (audio.getAttribute("src")) audio.removeAttribute("src");
      audio.load();
      resetProgress();
      setStatus(locked ? `${value.ownerName || "Your partner"} is choosing a song…` : "Upload a song or choose a saved favorite.");
      return;
    }
    if (!siteActive) {
      audio.pause();
      setStatus("Open the music room to hear this song.");
      return;
    }
    if (value.status === "uploading") {
      setStatus(`${value.ownerName || "Your partner"} is uploading a song…`);
      return;
    }
    if (lastRenderedUrl !== nextTrackKey) {
      const generation = ++trackLoadGeneration;
      pendingSeek = null;
      audioErrorShown = false;
      releaseTrackUrl();
      setStatus("Loading the song from Telegram…");
      trackUrl(value)
        .then(url => {
          if (disposed || generation !== trackLoadGeneration || !url) return;
          activeTrackFileId = nextTrackKey;
          lastRenderedUrl = nextTrackKey;
          audio.src = url; // Use the audio element directly
          audio.load();
          renderSession(session);
        })
        .catch(error => reportError(error, "This Telegram track could not be loaded."));
      return;
    }

    if (typeof value.time === "number" && Math.abs(audio.currentTime - value.time) > 2.5) {
      if (audio.readyState >= 1) audio.currentTime = value.time;
      else pendingSeek = value.time;
    }

    if (value.playing && audio.paused) {
      audio.play()
        .then(() => {
          audioErrorShown = false;
        })
        .catch(error => {
          if (!audioErrorShown) {
            audioErrorShown = true;
            setStatus("Audio needs permission on this device. Tap “Listen” to start hearing it.");
            console.info("Playback requires a local user gesture:", error);
          }
        });
    } else if (!value.playing && !audio.paused) {
      audio.pause();
    }
    if (!audioErrorShown) {
      setStatus(value.ended
        ? "Song finished. Replay it, save it, or tap Stop song."
        : value.playing
          ? `Playing · controlled by ${value.ownerName || "your partner"}`
          : `Ready · controlled by ${value.ownerName || "your partner"}`);
    }
  }

  function displayTrackName(rawName) {
    const clean = String(rawName || "Our song").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    const words = clean.split(" ").filter(Boolean);
    return words.slice(0, 2).join(" ") || "Our song";
  }

  /* ─── Recently Played (device-local, instant render) ─── */
  const recentStorageKey = `our-little-world-music-recent-${user.uid}`;
  let recentPlayed = [];
  let recentRenderQueued = false;

  function loadRecentPlayed() {
    try {
      const raw = localStorage.getItem(recentStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      recentPlayed = Array.isArray(parsed) ? parsed.filter(e => e && typeof e.key === "string") : [];
    } catch { recentPlayed = []; }
  }

  function persistRecentPlayed() {
    try { localStorage.setItem(recentStorageKey, JSON.stringify(recentPlayed)); } catch { /* storage full/blocked — keep in-memory */ }
  }

  function recentWhenLabel(ts) {
    const diff = Date.now() - Number(ts || 0);
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  function renderRecentPlayed() {
    const section = document.getElementById("music-recent-section");
    if (!section) return;
    const list = section.querySelector("#music-recent-list");
    if (!list) return;
    list.replaceChildren();
    if (!recentPlayed.length) {
      const empty = document.createElement("p");
      empty.className = "muted music-recent-empty";
      empty.textContent = "Nothing played yet. Songs you play will show up here.";
      list.append(empty);
      return;
    }
    for (const entry of recentPlayed) {
      const row = document.createElement("div");
      row.className = "music-recent-item";
      const title = document.createElement("span");
      title.textContent = entry.name || "Our song";
      const when = document.createElement("span");
      when.className = "music-recent-when";
      when.textContent = recentWhenLabel(entry.at);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "music-recent-delete";
      del.setAttribute("aria-label", `Remove ${entry.name || "recent song"}`);
      del.textContent = "🗑";
      del.addEventListener("click", () => {
        recentPlayed = recentPlayed.filter(e => e.key !== entry.key);
        persistRecentPlayed();
        renderRecentPlayed();
        toast("Removed from recently played.");
      });
      row.append(title, when, del);
      list.append(row);
    }
  }

  function scheduleRecentRender() {
    if (recentRenderQueued) return;
    recentRenderQueued = true;
    requestAnimationFrame(() => { recentRenderQueued = false; renderRecentPlayed(); });
  }

  // Record a play only once per distinct track so rapid re-renders never spam the list.
  function recordRecentPlay() {
    if (!session?.playing) return;
    const key = trackKey(session);
    if (!key) return;
    const sessionKey = `${key}:${session.startedAt || ""}`;
    if (sessionKey === recentSessionKey) return;
    recentSessionKey = sessionKey;
    const name = displayTrackName(session?.name);
    const existingIndex = recentPlayed.findIndex(e => e.key === key);
    if (existingIndex === 0 && recentPlayed[0].name === name) {
      recentPlayed[0].at = Date.now();
    } else {
      if (existingIndex > 0) recentPlayed.splice(existingIndex, 1);
      recentPlayed.unshift({ key, name, at: Date.now() });
      if (recentPlayed.length > RECENT_LIMIT) recentPlayed.length = RECENT_LIMIT;
    }
    persistRecentPlayed();
    scheduleRecentRender();
  }

  // Lazily create the section once (mirrors how the queue section is appended).
  function ensureRecentSection() {
    if (document.getElementById("music-recent-section")) return;
    const library = document.getElementById("music-library");
    if (!library) return;
    const section = document.createElement("section");
    section.id = "music-recent-section";
    section.className = "music-recent-section";
    section.innerHTML = '<h4>Recently played</h4><div id="music-recent-list" class="music-recent-list"></div>';
    const queue = document.getElementById("music-queue-section");
    if (queue) queue.insertAdjacentElement("afterend", section);
    else library.insertAdjacentElement("afterend", section);
  }

  function renderLibrary(library) {
    const list = $("#music-library");
    if (!list) return;
    const songs = Array.isArray(library)
      ? library.map(song => [song.id, song])
      : Object.entries(library || {});
    // Deliberately does not reassign currentLibrary: it receives the already
    // merged list, and writing it back would duplicate legacy rows on every render.
    if (!songs.length) {
      list.innerHTML = '<p class="muted music-library-empty">No saved songs yet.</p>';
      return;
    }
    list.replaceChildren();
    for (const [id, song] of songs) {
      const row = document.createElement("div");
      row.className = "music-library-item";
      const title = document.createElement("span");
      title.textContent = displayTrackName(song.name);
      const actions = document.createElement("div");
      actions.className = "music-library-actions";
      const play = document.createElement("button");
      play.className = "secondary";
      play.type = "button";
      play.textContent = "Play";
      play.disabled = Boolean(session?.ownerUid) && !session?.ended;
      play.addEventListener("click", () => startSavedSong(id, song));
      const removeButton = document.createElement("button");
      removeButton.className = "icon-btn";
      removeButton.type = "button";
      removeButton.textContent = "×";
      removeButton.title = "Remove from saved music";
      removeButton.disabled = trackKey(session) === trackKey(song);
      removeButton.addEventListener("click", () => removeSavedSong(id, song));
      actions.append(play, removeButton);
      row.append(title, actions);
      list.append(row);
    }
  }

  async function claimSession(value) {
    try {
      const result = await runTransaction(sessionRef, current => {
        if (current?.ownerUid) return;
        return { ...value, ownerUid: uid, ownerName: name, status: value.status || "ready", startedAt: Date.now(), updatedAt: Date.now() };
      }, { applyLocally: false });
      if (!result.committed) {
        toast("Your partner is already using the music audio.");
        return false;
      }
      return true;
    } catch (error) {
      reportError(error, "The shared music player could not be reserved.");
      return false;
    }
  }

  function renderQueue() {
    let section = document.getElementById("music-queue-section");
    const library = $("#music-library");
    if (!library) return;
    if (!section) {
      section = document.createElement("section");
      section.id = "music-queue-section";
      section.className = "music-queue-section";
      section.innerHTML = '<h3>Up next</h3><div id="music-queue-list"></div>';
      library.insertAdjacentElement("afterend", section);
    }
    const list = section.querySelector("#music-queue-list");
    list.replaceChildren();
    const entries = sortedQueueEntries();
    if (!entries.length) { const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "Queue is empty."; list.append(empty); return; }
    for (const [id, song] of entries) {
      const row = document.createElement("div"); row.className = "music-library-item";
      const title = document.createElement("span"); title.textContent = displayTrackName(song.name || "Queued song");
      const actions = document.createElement("div"); actions.className = "music-library-actions";
      const play = document.createElement("button"); play.type = "button"; play.className = "secondary"; play.textContent = "Play now";
      play.addEventListener("click", () => { void playQueueItem(id, song); });
      const removeBtn = document.createElement("button"); removeBtn.type = "button"; removeBtn.className = "icon-btn"; removeBtn.textContent = "×"; removeBtn.title = "Remove from queue";
      removeBtn.addEventListener("click", async () => { try { await remove(dbRef(rtdb, `${ROOT}/queue/${id}`)); } catch(e) { reportError(e, "Could not remove queued song."); } });
      actions.append(play, removeBtn); row.append(title, actions); list.append(row);
    }
  }

  async function startSavedSong(id, song) {
    if (!siteActive || !trackKey(song)) return;
    // Only a finished song may be replaced from here; a live session is never cleared.
    if (session?.ended) { await clearSession(); }
    const claimed = await claimSession({ ...trackFields(song), saved: true, playing: false, ended: false, time: 0 });
    if (!claimed) return;
    stopLocalPlayback();
    try {
      if (!await patchOwnedSession({ libraryId: id })) {
        throw new Error("The music session ended before the saved song could start.");
      }
    } catch (error) {
      reportError(error, "The saved song could not be started.");
      if (claimed) await clearSession(uid);
    }
  }

  async function removeSavedSong(id, song) {
    if (!window.confirm(`Remove “${song.name || "this song"}” from saved music?`)) return;
    try {
      if (song.__legacyRealtimeDatabase) await remove(dbRef(rtdb, `${ROOT}/library/${id}`));
      else await removeItem(id);
      if (song.telegramChatId && song.telegramMessageId) {
        try { await deleteTelegramGalleryMessage(song.telegramChatId, song.telegramMessageId); }
        catch (error) { console.warn("Saved music was removed from the library, but Telegram kept its copy:", error); }
      }
      toast("Removed from saved music.");
    } catch (error) {
      reportError(error, "The saved song could not be removed.");
    }
  }

  async function saveCurrentSong(source = session) {
    if (saveInFlight || !source || !trackKey(source) || source.saved) return;
    saveInFlight = true;
    const savingSession = { ...source };
    try {
      const libraryItemRef = await addItem("musicTrack", {
        telegramFileId: savingSession.telegramFileId || "",
        telegramFileUniqueId: savingSession.telegramFileUniqueId || "",
        mimeType: savingSession.mimeType || "audio/mpeg",
        telegramMessageId: savingSession.telegramMessageId || null,
        telegramChatId: savingSession.telegramChatId || null,
        name: savingSession.name,
        savedBy: uid,
        savedAtMs: Date.now(),
        author: uid
      });
      try {
        if (!await patchOwnedSession({ saved: true, libraryId: libraryItemRef.id }, savingSession.startedAt)) {
          throw new Error("The music session ended before the song could be saved.");
        }
      } catch (error) {
        await removeItem(libraryItemRef.id);
        throw error;
      }
      if (ownKey) void notifyPartnerSafely(ownKey, "music", `${actorName} saved a song to your music.`, libraryItemRef.id, "home");
      toast("Saved to our music ♫");
    } catch (error) {
      reportError(error, "This song could not be saved to your music.");
    } finally {
      saveInFlight = false;
    }
  }

  async function uploadSong(pickedFile) {
    if (!pickedFile || uploadInFlight) return;
    const isAudio = pickedFile.type.startsWith("audio/") || (!pickedFile.type && AUDIO_EXTENSIONS.test(pickedFile.name || ""));
    const isVideo = pickedFile.type.startsWith("video/") || (!pickedFile.type && VIDEO_EXTENSIONS.test(pickedFile.name || ""));
    if (!isAudio && !isVideo) {
      toast("Choose an audio or video file to share.");
      uploadInput.value = "";
      return;
    }
    if (pickedFile.size > MAX_FILE_SIZE) {
      const limitMb = Math.round(MAX_FILE_SIZE / (1024 * 1024));
      alert(`This file is ${(pickedFile.size / (1024 * 1024)).toFixed(1)} MB. Please choose a file smaller than ${limitMb} MB.`);
      uploadInput.value = "";
      return;
    }
    if (!siteActive) {
      toast("Open the music room before uploading.");
      uploadInput.value = "";
      return;
    }
    uploadInFlight = true;
    uploadInput.disabled = true;
    let leaseClaimed = false;
    let claimed = false;
    let heartbeat = null;
    let sessionHeartbeat = null;

    try {
      leaseClaimed = await claimUploadLease(pickedFile.name);
      if (!leaseClaimed) {
        toast("A song is already uploading from this account.");
        return;
      }
      await onDisconnect(uploadRef).remove();
      heartbeat = setInterval(() => {
        heartbeatUpload().catch(error => console.warn("Upload heartbeat failed:", error));
      }, UPLOAD_HEARTBEAT_MS);
      // A finished session no longer blocks the player; a live one queues the upload.
      const addToQueue = Boolean(session?.ownerUid) && !session?.ended;
      if (!addToQueue && session?.ended) await clearSession();
      if (!addToQueue) {
        claimed = await claimSession({ name: pickedFile.name, saved: false, status: "uploading", playing: false, ended: false, time: 0 });
        if (!claimed) return;
        stopLocalPlayback();
        sessionHeartbeat = setInterval(() => {
          patchOwnedSession({}).catch(error => console.warn("Upload session heartbeat failed:", error));
        }, UPLOAD_HEARTBEAT_MS);
      }
      setStatus(isVideo ? "Extracting the audio from your video…" : "Uploading your song to Telegram…");
      // Video clips are decoded on-device and re-wrapped as lossless WAV, so only
      // the original audio ever reaches Telegram. Audio files forward untouched.
      const file = isVideo ? await extractAudioTrack(pickedFile) : pickedFile;
      const timestamp = new Date().toLocaleString();
      const result = await sendToTelegram(file, `New Music Track 🎵 · ${actorName} · ${timestamp}`);
      const refs = telegramMediaReferences(result);
      const track = { ...refs, mimeType: telegramUploadMimeType(file), name: pickedFile.name, saved: false, addedBy: uid, addedByName: name, addedAt: Date.now(), time: 0, playing: false, status: "ready" };
      if (addToQueue) {
        const itemRef = push(queueRef);
        await set(itemRef, track);
        toast("Song uploaded and added to the shared queue ♫");
      } else if (!await patchOwnedSession(track)) {
        await deleteTemporaryTrack({ ...refs, saved: false });
        return;
      } else { toast("Song uploaded. Press Play when you're ready ♫"); }
    } catch (error) {
      console.error("Music upload failed:", error);
      toast(error.message || "Telegram music upload failed. Please try again.");
      if (claimed) await clearSession(uid);
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (sessionHeartbeat) clearInterval(sessionHeartbeat);
      if (leaseClaimed) await releaseUploadLease();
      uploadInFlight = false;
      uploadInput.disabled = Boolean(sharedUploads[uid]?.status === "uploading");
      uploadInput.value = "";
    }
  }

  async function playSharedSong() {
    if (!trackKey(session)) return;
    try {
      await audio.play();
      if (!await patchOwnedSession({ playing: true, ended: false, time: audio.currentTime, status: "ready" })) {
        audio.pause();
        toast("The music session has ended.");
      }
    } catch (error) {
      reportError(error, "This device could not play the song. Tap Listen and try again.");
    }
  }

  async function pauseSharedSong() {
    if (!session?.ownerUid) return;
    audio.pause();
    try {
      if (!await patchOwnedSession({ playing: false, time: audio.currentTime })) {
        toast("The music session has ended.");
      }
    } catch (error) {
      reportError(error, "The shared playback could not be paused.");
    }
  }

  async function sendChat(event) {
    event.preventDefault();
    const input = $("#music-chat-input");
    const message = input?.value.trim();
    if (!message) return;
    if (!siteActive) {
      toast("Open the music room before sending a message.");
      return;
    }
    try {
      const messageRef = push(chatRef);
      await set(messageRef, { uid, name, text: message.slice(0, MAX_CHAT_LENGTH), sentAt: serverTimestamp() });
      if (ownKey) void notifyPartnerSafely(ownKey, "music", `${actorName} sent a music chat message.`, messageRef.key, "home");
      input.value = "";
    } catch (error) {
      reportError(error, "Your chat message could not be sent.");
    }
  }

  async function startPresence() {
    if (disposed || siteActive) return;
    siteActive = true;
    const partnerPresent = Object.values(presence || {}).some(entry => entry?.uid && entry.uid !== uid);
    if (!partnerPresent) $("#music-chat-messages")?.replaceChildren();
    connectionRef = push(presenceRef);
    try {
      await onDisconnect(connectionRef).remove();
      await set(connectionRef, { uid, name, since: serverTimestamp() });
      renderSession(session);
    } catch (error) {
      reportError(error, "Your live music-room presence could not be started.");
      siteActive = false;
    }
  }

  async function cleanupWhenUsersLeave() {
    if (emptyPresenceTimer) clearTimeout(emptyPresenceTimer);
    emptyPresenceTimer = setTimeout(async () => {
      const activeUids = new Set(Object.values(presence || {}).map(entry => entry?.uid).filter(Boolean));
      if (activeUids.size === 0) {
        await clearSession();
        try {
          await remove(chatRef);
          $("#music-chat-messages")?.replaceChildren();
        } catch (error) {
          reportError(error, "The temporary music chat could not be cleared.");
        }
      } else if (session?.ownerUid && !activeUids.has(session.ownerUid)) {
        await clearSession(session.ownerUid);
      }
    }, 1200);
  }

  // Recently Played: load from device storage and render immediately (no network).
  loadRecentPlayed();
  ensureRecentSection();
  renderRecentPlayed();

  unsubscribers.push(onValue(sessionRef, snapshot => {
    const value = snapshot.val();
    renderSession(value);
    // An upload interrupted by a closed tab/network drop can leave the shared
    // player locked forever. The uploader sends a heartbeat while working, so only
    // sessions with no recent heartbeat are cleared.
    checkStaleUpload();
  }, error => {
    reportError(error, "Shared music updates could not be received.");
  }));
  unsubscribers.push(onValue(uploadsRef, snapshot => {
    sharedUploads = snapshot.val() || {};
    const now = Date.now();
    const active = Object.entries(sharedUploads).filter(([, upload]) => {
      const fresh = upload?.status === "uploading" && now - Number(upload.updatedAt || 0) <= UPLOAD_STALE_MS;
      if (upload?.status === "uploading" && !fresh && upload.uid) {
        remove(dbRef(rtdb, `${ROOT}/uploads/${upload.uid}`)).catch(() => {});
      }
      return fresh;
    });
    const status = $("#music-upload-status");
    if (status) status.textContent = active.length
      ? `${active[0][1].ownerName || "Your partner"} is uploading ${active[0][1].name || "a song"}…`
      : "";
    renderSession(session);
  }, error => reportError(error, "Music upload status could not be synced.")));
  unsubscribers.push(watchItems("musicTrack", items => {
    currentLibrary = items.map(item => ({ ...item, __legacyRealtimeDatabase: false }));
    renderLibrary(combinedLibrary());
  }, error => {
    reportError(error, "Saved music could not be loaded.");
  }));
  unsubscribers.push(onValue(legacyLibraryRef, snapshot => {
    legacyLibrary = snapshot.val() || {};
    renderLibrary(combinedLibrary());
  }, error => reportError(error, "Older saved music could not be loaded.")));
  unsubscribers.push(onValue(queueRef, snapshot => { sharedQueue = snapshot.val() || {}; renderQueue(); }, error => reportError(error, "Music queue could not be loaded.")));
  unsubscribers.push(onValue(presenceRef, snapshot => {
    presence = snapshot.val() || {};
    cleanupWhenUsersLeave();
  }, error => {
    reportError(error, "Music-room presence could not be received.");
  }));
  unsubscribers.push(onChildAdded(chatRef, snapshot => {
    const message = snapshot.val();
    if (message?.text) appendChatMessage(message.text, message.name, message.uid === uid);
  }, error => {
    reportError(error, "Live music chat could not be received.");
  }));

  // Snapshots only arrive when data changes, so a dead uploader needs a timer to be noticed.
  staleCheckTimer = setInterval(() => { checkStaleUpload(); checkStaleUploads(); }, STALE_CHECK_MS);

  $("#play-music").onclick = playSharedSong;
  $("#pause-music").onclick = pauseSharedSong;
  $("#save-music").onclick = saveCurrentSong;
  $("#listen-music").onclick = async () => {
    // The Listen button exists purely to satisfy browser autoplay rules: it is a
    // real user gesture, so the shared session can start producing sound.
    if (!session?.playing) return;
    audioErrorShown = false;
    try {
      await audio.play();
      renderSession(session);
    } catch (error) {
      reportError(error, "This device could not start audio playback.");
    }
  };
  // Replay the current shared track from the beginning for both partners.
  const replayButton = $("#replay-music");
  if (replayButton) replayButton.onclick = async () => {
    if (!trackKey(session)) { toast("Choose a song to replay first."); return; }
    try {
      audio.currentTime = 0;
      if (audio.readyState < 2) await new Promise((resolve, reject) => {
        audio.addEventListener("canplay", resolve, { once: true });
        audio.addEventListener("error", reject, { once: true });
      });
      await audio.play();
      const replayStartedAt = Date.now();
      if (!await patchOwnedSession({ playing: true, ended: false, time: 0, status: "ready", startedAt: replayStartedAt })) {
        audio.pause();
        toast("The shared music session has ended.");
      } else {
        session = { ...session, playing: true, ended: false, time: 0, startedAt: replayStartedAt };
        recordRecentPlay();
      }
    } catch (error) { reportError(error, "This song could not be replayed. Tap Play and try again."); }
  };

  $("#music-volume").oninput = event => {
    audio.volume = Number(event.target.value);
  };
  uploadInput.onchange = event => uploadSong(event.target.files?.[0]);
  const playerControls = $("#pause-music")?.parentElement;
  if (playerControls && !document.getElementById("stop-music")) {
    const stopButton = document.createElement("button"); stopButton.id = "stop-music"; stopButton.type = "button"; stopButton.className = "secondary"; stopButton.textContent = "Stop song";
    stopButton.addEventListener("click", async () => { audio.pause(); await clearSession(); setStatus("Song stopped. Upload or choose another song."); });
    playerControls.append(stopButton);
  }
  $("#music-chat-form").onsubmit = sendChat;

  // Seeking: the session owner publishes the new position so both devices agree.
  const onSeekStart = () => { seeking = true; };
  const onSeekEnd = () => { seeking = false; };
  const onSeekInput = () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (duration <= 0) return;
    const target = (Number(progressInput.value) / 1000) * duration;
    if (elapsedLabel) elapsedLabel.textContent = formatClock(target);
    if (audio.readyState >= 1) audio.currentTime = target;
    else pendingSeek = target;
    if (session?.ownerUid) {
      patchOwnedSession({ time: target }).catch(error => {
        reportError(error, "Music playback position could not be synced.");
      });
    }
  };
  if (progressInput) {
    progressInput.addEventListener("pointerdown", onSeekStart);
    progressInput.addEventListener("pointerup", onSeekEnd);
    progressInput.addEventListener("pointercancel", onSeekEnd);
    progressInput.addEventListener("input", onSeekInput);
  }

  const onPlayerTimeUpdate = () => {
    renderProgress();
    // One device publishes the playback clock; either partner may still control
    // play, pause, seek, replay, and queue actions through the shared session.
    if (!session?.playing || audio.paused || session.ownerUid !== uid) return;
    const now = Date.now();
    if (now - lastTimeWrite < SYNC_INTERVAL_MS) return;
    lastTimeWrite = now;
    patchOwnedSession({ time: audio.currentTime }).catch(error => {
      reportError(error, "Music playback position could not be synced.");
    });
  };
  const onPlayerEnded = async () => {
    renderProgress();
    const finished = session;
    if (!finished?.ownerUid || finished.ended || advancingQueue) return;
    advancingQueue = true;
    try {
      // Both devices see "ended"; the startedAt guard lets exactly one transaction win.
      const next = sortedQueueEntries()[0];
      if (next) await playQueueItem(next[0], next[1], { expectedStartedAt: finished.startedAt, silent: true });
      else if (await markSongEnded(finished.startedAt) && !finished.saved && promptForStartedAt !== finished.startedAt) {
        promptForStartedAt = finished.startedAt;
        if (window.confirm(`Save “${finished.name || "this song"}” to your shared favorites?`)) await saveCurrentSong(finished);
      }
    } catch (error) {
      reportError(error, "The next song could not start.");
    } finally {
      advancingQueue = false;
    }
  };
  const onPlayerMetadata = () => {
    if (pendingSeek !== null) audio.currentTime = pendingSeek;
    pendingSeek = null;
    renderProgress();
  };
  // Without these the drawer looks frozen whenever a stream is slow or broken.
  const onPlayerDurationChange = () => renderProgress();
  const onPlayerWaiting = () => setStatus("Buffering the song…");
  const onPlayerPlaying = () => {
    audioErrorShown = false;
    if (progressInput) progressInput.disabled = !(Number.isFinite(audio.duration) && audio.duration > 0);
    if (!seeking) renderSession(session);
    recordRecentPlay();
  };
  const onPlayerPause = () => renderProgress();
  const onPlayerEmptied = () => resetProgress();
  const onPlayerError = () => {
    if (!audio.getAttribute("src")) return;
    reportPlaybackError();
  };

  audio.addEventListener("timeupdate", onPlayerTimeUpdate);
  audio.addEventListener("ended", onPlayerEnded);
  audio.addEventListener("loadedmetadata", onPlayerMetadata);
  audio.addEventListener("durationchange", onPlayerDurationChange);
  audio.addEventListener("waiting", onPlayerWaiting);
  audio.addEventListener("playing", onPlayerPlaying);
  audio.addEventListener("pause", onPlayerPause);
  audio.addEventListener("emptied", onPlayerEmptied);
  audio.addEventListener("error", onPlayerError);

  cleanupCurrent = () => {
    disposed = true;
    siteActive = false;
    if (staleCheckTimer) clearInterval(staleCheckTimer);
    if (emptyPresenceTimer) clearTimeout(emptyPresenceTimer);
    if (connectionRef) {
      const departingRef = connectionRef;
      connectionRef = null;
      remove(departingRef).catch(error => console.error("Music-room presence cleanup failed:", error));
      onDisconnect(departingRef).cancel().catch(error => console.error("Music-room disconnect cleanup failed:", error));
    }
    audio.pause();
    if (audio.getAttribute("src")) audio.removeAttribute("src");
    audio.load();
    releaseTrackUrl();
    resetProgress();
    audio.removeEventListener("timeupdate", onPlayerTimeUpdate);
    audio.removeEventListener("ended", onPlayerEnded);
    audio.removeEventListener("loadedmetadata", onPlayerMetadata);
    audio.removeEventListener("durationchange", onPlayerDurationChange);
    audio.removeEventListener("waiting", onPlayerWaiting);
    audio.removeEventListener("playing", onPlayerPlaying);
    audio.removeEventListener("pause", onPlayerPause);
    audio.removeEventListener("emptied", onPlayerEmptied);
    audio.removeEventListener("error", onPlayerError);
    if (progressInput) {
      progressInput.removeEventListener("pointerdown", onSeekStart);
      progressInput.removeEventListener("pointerup", onSeekEnd);
      progressInput.removeEventListener("pointercancel", onSeekEnd);
      progressInput.removeEventListener("input", onSeekInput);
    }
    unsubscribers.forEach(unsubscribe => unsubscribe());
    cleanupCurrent = null;
  };
  startPresence();

  return () => cleanupCurrent?.();
}
