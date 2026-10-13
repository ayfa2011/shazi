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
// serves files up to 20 MB. Uploads beyond that would store fine but never play,
// so 20 MB is the real ceiling for anything that has to come back as a stream.
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_CHAT_LENGTH = 500;
const SYNC_INTERVAL_MS = 4000;
const ROOT = `couples/${APP_CONFIG.coupleId}/music`;

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
      throw new Error("Extracted audio is larger than 20 MB. Please choose a shorter video.");
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
  const ownKey = Object.keys(APP_CONFIG.profiles).find(key => APP_CONFIG.profiles[key].email?.toLowerCase() === user.email?.toLowerCase());
  const telegramProfileKey = ownKey || `music_${String(user.uid || "partner").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30)}`;
  const actorName = APP_CONFIG.profiles[ownKey]?.name || user.displayName || "Your partner";

  const player = $("#audio-player");
  const audio = player;
  const uploadInput = $("#music-upload");
  const progressInput = $("#music-progress");
  const elapsedLabel = $("#music-elapsed");
  const durationLabel = $("#music-duration");
  const sessionRef = dbRef(rtdb, `${ROOT}/session`);
  const legacyLibraryRef = dbRef(rtdb, `${ROOT}/library`);
  const chatRef = dbRef(rtdb, `${ROOT}/chat`);
  const queueRef = dbRef(rtdb, `${ROOT}/queue`);
  const presenceRef = dbRef(rtdb, `${ROOT}/presence`);
  const uid = user.uid;
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

  async function patchOwnedSession(values) {
    // Both partners have equal control over the shared player.
    const result = await runTransaction(sessionRef, current => {
      if (!current?.ownerUid) return;
      return { ...current, ...values, lastActionUid: uid, lastActionName: name, updatedAt: Date.now() };
    }, { applyLocally: false });
    return result.committed;
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
    if (uploadButton) uploadButton.disabled = false;
    uploadButton?.closest(".upload-btn")?.classList.toggle("disabled", locked);
    if (listenButton) listenButton.disabled = !value?.playing;
    const libraryLock = `${value?.ownerUid || ""}:${trackKey(value)}`;
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
      setStatus(value.playing
        ? `Playing · controlled by ${value.ownerName || "your partner"}`
        : `Ready · controlled by ${value.ownerName || "your partner"}`);
    }
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
      title.textContent = song.name || "Our song";
      const actions = document.createElement("div");
      actions.className = "music-library-actions";
      const play = document.createElement("button");
      play.className = "secondary";
      play.type = "button";
      play.textContent = "Play";
      play.disabled = Boolean(session?.ownerUid);
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
    const entries = Object.entries(sharedQueue || {});
    if (!entries.length) { const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "Queue is empty."; list.append(empty); return; }
    for (const [id, song] of entries) {
      const row = document.createElement("div"); row.className = "music-library-item";
      const title = document.createElement("span"); title.textContent = song.name || "Queued song";
      const actions = document.createElement("div"); actions.className = "music-library-actions";
      const play = document.createElement("button"); play.type = "button"; play.className = "secondary"; play.textContent = "Play now";
      play.addEventListener("click", async () => { await remove(dbRef(rtdb, `${ROOT}/queue/${id}`)); if (session?.ownerUid) await clearSession(); await startQueuedSong(song); });
      const removeBtn = document.createElement("button"); removeBtn.type = "button"; removeBtn.className = "icon-btn"; removeBtn.textContent = "×"; removeBtn.title = "Remove from queue";
      removeBtn.addEventListener("click", async () => { try { await remove(dbRef(rtdb, `${ROOT}/queue/${id}`)); } catch(e) { reportError(e, "Could not remove queued song."); } });
      actions.append(play, removeBtn); row.append(title, actions); list.append(row);
    }
  }

  async function startQueuedSong(song) {
    const claimed = await claimSession({ ...song, saved: Boolean(song.saved), status: "ready", playing: false, time: 0 });
    if (!claimed) return;
    await patchOwnedSession({ playing: true, time: 0, status: "ready" });
  }

  async function startSavedSong(id, song) {
    if (!siteActive || !trackKey(song)) return;
    if (session?.ownerUid) { await clearSession(); }
    const claimed = await claimSession({
      url: song.url,
      path: song.path,
      telegramFileId: song.telegramFileId || "",
      telegramFileUniqueId: song.telegramFileUniqueId || "",
      mimeType: song.mimeType || "audio/mpeg",
      telegramMessageId: song.telegramMessageId || null,
      telegramChatId: song.telegramChatId || null,
      name: song.name,
      saved: true,
      playing: false,
      time: 0
    });
    if (!claimed) return;
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

  async function saveCurrentSong() {
    if (!session || !trackKey(session) || session.saved) return;
    try {
      const libraryItemRef = await addItem("musicTrack", {
        telegramFileId: session.telegramFileId || "",
        telegramFileUniqueId: session.telegramFileUniqueId || "",
        mimeType: session.mimeType || "audio/mpeg",
        telegramMessageId: session.telegramMessageId || null,
        telegramChatId: session.telegramChatId || null,
        name: session.name,
        savedBy: uid,
        savedAtMs: Date.now(),
        author: uid
      });
      try {
        if (!await patchOwnedSession({ saved: true, libraryId: libraryItemRef.id })) {
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
    }
  }

  async function uploadSong(pickedFile) {
    if (!pickedFile) return;
    const isAudio = pickedFile.type.startsWith("audio/") || (!pickedFile.type && AUDIO_EXTENSIONS.test(pickedFile.name || ""));
    const isVideo = pickedFile.type.startsWith("video/") || (!pickedFile.type && VIDEO_EXTENSIONS.test(pickedFile.name || ""));
    if (!isAudio && !isVideo) {
      toast("Choose an audio or video file to share.");
      uploadInput.value = "";
      return;
    }
    if (pickedFile.size > MAX_FILE_SIZE) {
      toast("Music files must be 20 MB or smaller.");
      uploadInput.value = "";
      return;
    }
    if (!siteActive) {
      toast("Open the music room before uploading.");
      uploadInput.value = "";
      return;
    }
    const addToQueue = Boolean(session?.ownerUid);
    let claimed = false;
    if (!addToQueue) {
      claimed = await claimSession({ name: pickedFile.name, saved: false, status: "uploading", playing: false, time: 0 });
      if (!claimed) { uploadInput.value = ""; return; }
    }

    try {
      setStatus(isVideo ? "Extracting the audio from your video…" : "Uploading your song to Telegram…");
      // Video clips are decoded on-device and re-wrapped as lossless WAV, so only
      // the original audio ever reaches Telegram. Audio files forward untouched.
      const file = isVideo ? await extractAudioTrack(pickedFile) : pickedFile;
      const timestamp = new Date().toLocaleString();
      const result = await sendToTelegram(file, `New Music Track 🎵 · ${actorName} · ${timestamp}`, new Date().toISOString().slice(0, 10), telegramProfileKey, { storeForReveal: false });
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
      uploadInput.value = "";
    }
  }

  async function playSharedSong() {
    if (!trackKey(session)) return;
    try {
      // Let a completed song be replayed from the beginning.
      if (audio.ended || (Number.isFinite(audio.duration) && audio.duration > 0 && audio.currentTime >= audio.duration - 0.25)) {
        audio.currentTime = 0;
      }
      await audio.play();
      if (!await patchOwnedSession({ playing: true, time: audio.currentTime, status: "ready" })) {
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

  unsubscribers.push(onValue(sessionRef, snapshot => {
    const value = snapshot.val();
    renderSession(value);
    // An upload interrupted by a closed tab/network drop can leave the shared
    // player locked forever. Clear only stale/incomplete upload sessions.
    if (value?.ownerUid && value.status === "uploading") {
      const startedAt = Number(value.startedAt || value.updatedAt || 0);
      const stale = !startedAt || Date.now() - startedAt > 2 * 60 * 1000;
      if (stale) {
        clearSession(value.ownerUid);
      }
    }
  }, error => {
    reportError(error, "Shared music updates could not be received.");
  }));
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
    if (!session?.playing || audio.paused) return;
    const now = Date.now();
    if (now - lastTimeWrite < SYNC_INTERVAL_MS) return;
    lastTimeWrite = now;
    patchOwnedSession({ time: audio.currentTime }).catch(error => {
      reportError(error, "Music playback position could not be synced.");
    });
  };
  const onPlayerEnded = async () => {
    renderProgress();
    if (!session?.ownerUid) return;
    // Ask once, after the song finishes, whether the couple wants to keep it.
    if (!session.saved && trackKey(session) && !session.favouritePromptShown) {
      const shouldSave = window.confirm(`Add “${session.name || "this song"}” to Favourite / Saved music?`);
      if (shouldSave) await saveCurrentSong();
      // Mark the prompt handled for this playback session so it cannot repeat.
      await patchOwnedSession({ favouritePromptShown: true }).catch(() => {});
    }
    const next = Object.entries(sharedQueue || {})[0];
    if (next) {
      const [id, song] = next;
      try {
        await remove(dbRef(rtdb, `${ROOT}/queue/${id}`));
        await startQueuedSong(song);
      } catch (error) {
        reportError(error, "The next queued song could not start.");
      }
    } else {
      // Keep the current song selected at the end so Play can replay it.
      try {
        await patchOwnedSession({ playing: false, time: 0, status: "ready" });
        audio.currentTime = 0;
      } catch (error) {
        reportError(error, "The finished song could not be reset for replay.");
      }
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
