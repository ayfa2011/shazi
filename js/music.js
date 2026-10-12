import { APP_CONFIG } from "../config/app-config.js";
import { deleteTelegramGalleryMessage, getTelegramMediaUrl, sendToTelegram, telegramMediaReferences, telegramUploadMimeType } from "../src/services/telegramService.js";
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

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_CHAT_LENGTH = 500;
const ROOT = `couples/${APP_CONFIG.coupleId}/music`;

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
  const ownKey = Object.keys(APP_CONFIG.profiles).find(key => APP_CONFIG.profiles[key].email === user.email);
  const actorName = APP_CONFIG.profiles[ownKey]?.name || "Your partner";

  const player = $("#audio-player");
  const uploadInput = $("#music-upload");
  const sessionRef = dbRef(rtdb, `${ROOT}/session`);
  const legacyLibraryRef = dbRef(rtdb, `${ROOT}/library`);
  const chatRef = dbRef(rtdb, `${ROOT}/chat`);
  const presenceRef = dbRef(rtdb, `${ROOT}/presence`);
  const uid = user.uid;
  const profile = Object.values(APP_CONFIG.profiles).find(item => item.email.toLowerCase() === user.email?.toLowerCase());
  const name = profile?.name || user.displayName || "Partner";
  let session = null;
  let currentLibrary = [];
  let legacyLibrary = {};
  let presence = {};
  let connectionRef = null;
  let siteActive = false;
  let disposed = false;
  let lastTimeWrite = 0;
  let lastRenderedUrl = "";
  let trackLoadGeneration = 0;
  let pendingSeek = null;
  let lastLibraryLock = "";
  let emptyPresenceTimer = null;
  let audioErrorShown = false;
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
    const result = await runTransaction(sessionRef, current => {
      if (current?.ownerUid !== uid) return;
      return { ...current, ...values };
    }, { applyLocally: false });
    return result.committed;
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
    if (playButton) playButton.disabled = !isOwner || !trackKey(value) || value.status === "uploading";
    if (pauseButton) pauseButton.disabled = !isOwner || !value?.playing;
    if (saveButton) saveButton.disabled = !isOwner || !trackKey(value) || value.saved;
    if (uploadButton) uploadButton.disabled = locked;
    uploadButton?.closest(".upload-btn")?.classList.toggle("disabled", locked);
    if (listenButton) listenButton.disabled = !value?.playing;
    const libraryLock = `${value?.ownerUid || ""}:${trackKey(value)}`;
    if (libraryLock !== lastLibraryLock) {
      lastLibraryLock = libraryLock;
      renderLibrary(combinedLibrary());
    }

    if (value?.status === "uploading") {
      setStatus(`${value.ownerName || "Your partner"} is uploading a song…`);
    } else if (trackKey(value)) {
      setStatus(value.playing
        ? `Playing · controlled by ${value.ownerName || "your partner"}`
        : `Ready · controlled by ${value.ownerName || "your partner"}`);
    } else {
      setStatus(locked ? `${value.ownerName || "Your partner"} is choosing a song…` : "Upload a song or choose a saved favorite.");
    }

    const nextTrackKey = trackKey(value);
    if (!nextTrackKey) {
      trackLoadGeneration++;
      pendingSeek = null;
      if (player.src) player.removeAttribute("src");
      player.load();
      lastRenderedUrl = "";
      return;
    }
    if (!siteActive) {
      player.pause();
      return;
    }
    if (lastRenderedUrl !== nextTrackKey) {
      lastRenderedUrl = nextTrackKey;
      const generation = ++trackLoadGeneration;
      pendingSeek = null;
      audioErrorShown = false;
      trackUrl(value).then(url => {
        if (disposed || generation !== trackLoadGeneration || !url) return;
        player.src = url;
        player.load();
        renderSession(value);
      }).catch(error => reportError(error, "This Telegram track could not be loaded."));
      return;
    }
    if (typeof value.time === "number" && Math.abs(player.currentTime - value.time) > 2.5) {
      if (player.readyState >= 1) player.currentTime = value.time;
      else pendingSeek = value.time;
    }
    if (value.playing && player.paused) {
      player.play().then(() => {
        audioErrorShown = false;
      }).catch(error => {
        if (!audioErrorShown) {
          audioErrorShown = true;
          setStatus("Audio needs permission on this device. Tap “Listen” to start hearing it.");
          console.info("Playback requires a local user gesture:", error);
        }
      });
    } else if (!value.playing && !player.paused) {
      player.pause();
    }
  }

  function renderLibrary(library) {
    const list = $("#music-library");
    if (!list) return;
    const songs = Array.isArray(library)
      ? library.map(song => [song.id, song])
      : Object.entries(library || {});
    currentLibrary = Array.isArray(library) ? library : [];
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
        return { ...value, ownerUid: uid, ownerName: name, status: value.status || "ready" };
      }, { applyLocally: false });
      if (!result.committed) {
        toast("Your partner is already using the music player.");
        return false;
      }
      return true;
    } catch (error) {
      reportError(error, "The shared music player could not be reserved.");
      return false;
    }
  }

  async function startSavedSong(id, song) {
    if (!siteActive || session?.ownerUid || !trackKey(song)) return;
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
      await clearSession(uid);
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
    if (!session || session.ownerUid !== uid || !trackKey(session) || session.saved) return;
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

  async function uploadSong(file) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      toast("Choose an audio file to upload.");
      uploadInput.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast("Music files must be 10 MB or smaller.");
      uploadInput.value = "";
      return;
    }
    if (!siteActive || session?.ownerUid) {
      toast("Your partner is already using the music player.");
      uploadInput.value = "";
      return;
    }

    const claimed = await claimSession({
      name: file.name,
      saved: false,
      status: "uploading",
      playing: false,
      time: 0
    });
    if (!claimed) {
      uploadInput.value = "";
      return;
    }

    try {
      const timestamp = new Date().toLocaleString();
      const result = await sendToTelegram(file, `New Music Track 🎵 · ${actorName} · ${timestamp}`, new Date().toISOString().slice(0, 10), ownKey, { storeForReveal: false });
      const refs = telegramMediaReferences(result);
      if (!await patchOwnedSession({ ...refs, mimeType: telegramUploadMimeType(file), status: "ready", name: file.name, time: 0, playing: false })) {
        await deleteTemporaryTrack({ ...refs, saved: false });
        return;
      }
      toast("Song uploaded. Press Play when you're ready ♫");
    } catch (error) {
      console.error("Music upload failed:", error);
      toast(error.message || "Telegram music upload failed. Please try again.");
      await clearSession(uid);
    } finally {
      uploadInput.value = "";
    }
  }

  async function playSharedSong() {
    if (!trackKey(session) || session.ownerUid !== uid) return;
    try {
      await player.play();
      if (!await patchOwnedSession({ playing: true, time: player.currentTime, status: "ready" })) {
        player.pause();
        toast("The music session has ended.");
      }
    } catch (error) {
      reportError(error, "This device could not play the song. Tap Listen and try again.");
    }
  }

  async function pauseSharedSong() {
    if (session?.ownerUid !== uid) return;
    player.pause();
    try {
      if (!await patchOwnedSession({ playing: false, time: player.currentTime })) {
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

  unsubscribers.push(onValue(sessionRef, snapshot => renderSession(snapshot.val()), error => {
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
  $("#listen-music").onclick = () => {
    if (session?.playing) player.play().catch(error => reportError(error, "This device could not start audio playback."));
  };
  $("#music-volume").oninput = event => {
    player.volume = Number(event.target.value);
  };
  uploadInput.onchange = event => uploadSong(event.target.files?.[0]);
  $("#music-chat-form").onsubmit = sendChat;
  const onPlayerTimeUpdate = () => {
    if (!session?.playing || session.ownerUid !== uid || player.paused) return;
    const now = Date.now();
    if (now - lastTimeWrite < 4000) return;
    lastTimeWrite = now;
    patchOwnedSession({ time: player.currentTime }).catch(error => {
      reportError(error, "Music playback position could not be synced.");
    });
  };
  const onPlayerEnded = () => {
    if (session?.ownerUid === uid) clearSession(uid);
  };
  const onPlayerMetadata = () => {
    if (pendingSeek !== null) player.currentTime = pendingSeek;
    pendingSeek = null;
  };
  player.addEventListener("timeupdate", onPlayerTimeUpdate);
  player.addEventListener("ended", onPlayerEnded);
  player.addEventListener("loadedmetadata", onPlayerMetadata);

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
    player.pause();
    player.removeEventListener("timeupdate", onPlayerTimeUpdate);
    player.removeEventListener("ended", onPlayerEnded);
    player.removeEventListener("loadedmetadata", onPlayerMetadata);
    unsubscribers.forEach(unsubscribe => unsubscribe());
    cleanupCurrent = null;
  };
  startPresence();

  return () => cleanupCurrent?.();
}
