import { rtdb, firebaseReady } from "./firebase.js";
import { $, esc, toast, todayKey, scheduleDubaiDayRollover } from "./utils.js";
import { APP_CONFIG } from "../config/app-config.js";
import { onValue, push, ref, serverTimestamp, query, orderByChild, startAt, endAt, limitToLast } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const chatPath = `couples/${APP_CONFIG.coupleId}/partnerChat/messages`;

function createChatAlertSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return { unlock() {}, play() {} };
  let context = null;
  let unlocked = false;
  let pending = false;

  function unlock() {
    if (!context) context = new AudioContextClass();
    context.resume().then(() => {
      unlocked = true;
      if (pending) { pending = false; play(); }
    }).catch(() => {});
  }

  function play() {
    if (!unlocked || !context || context.state !== "running") { pending = true; return; }
    const start = context.currentTime;
    [880, 1175].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      const at = start + index * 0.085;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(0.0001, at);
      volume.gain.exponentialRampToValueAtTime(0.045, at + 0.012);
      volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
      oscillator.connect(volume);
      volume.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.13);
    });
  }

  return { unlock, play };
}

export function initPartnerChat(user, profile, partnerProfile) {
  const root = $("#partner-chat-root");
  const presence = $("#partner-presence");
  if (!root || !presence || !firebaseReady || !profile || !partnerProfile) return () => {};

  root.innerHTML = `
    <section class="partner-chat-panel" role="dialog" aria-modal="true" aria-label="Chat with ${esc(partnerProfile.name)}" aria-hidden="true">
      <header class="partner-chat-header">
        <span class="partner-chat-avatar">${partnerProfile.avatar ? `<img src="${esc(partnerProfile.avatar)}" alt="">` : esc((partnerProfile.name || "♡")[0])}</span>
        <div class="partner-chat-heading"><strong>${esc(partnerProfile.name || "Partner")}</strong><small><i></i> Just for us</small></div>
        <button type="button" class="partner-chat-close" aria-label="Close chat">×</button>
      </header>
      <div class="partner-chat-messages" aria-live="polite" aria-label="Messages"></div>
      <div class="partner-chat-emoji-row" aria-label="Quick emojis">${["❤️","🥰","😘","😂","💗","😊","😍","🫶"].map(emoji => `<button type="button" aria-label="Add ${emoji}">${emoji}</button>`).join("")}</div>
      <form class="partner-chat-form"><textarea name="message" rows="1" maxlength="1000" placeholder="Write a message…" aria-label="Write a message" required></textarea><button type="submit" aria-label="Send message">➤</button></form>
    </section>`;

  const panel = root.querySelector(".partner-chat-panel");
  const messages = root.querySelector(".partner-chat-messages");
  const form = root.querySelector(".partner-chat-form");
  const input = form.elements.message;
  let isOpen = false;
  let initialSnapshot = true;
  const seen = new Set();
  const closeButton = root.querySelector(".partner-chat-close");
  const alertSound = createChatAlertSound();
  const unlockSound = () => alertSound.unlock();
  document.addEventListener("pointerdown", unlockSound, { once: true, passive: true });
  document.addEventListener("keydown", unlockSound, { once: true });

  function openChat() {
    isOpen = true;
    panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("partner-chat-open");
    requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; input.focus({ preventScroll: true }); });
  }
  function closeChat() {
    isOpen = false;
    panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("partner-chat-open");
    presence.querySelector("[data-open-partner-chat]")?.focus({ preventScroll: true });
  }
  function renderMessages(items) {
    messages.innerHTML = items.length ? items.map(([id, item]) => {
      const mine = item.uid === user.uid;
      const time = item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
      return `<article class="partner-chat-message ${mine ? "mine" : "theirs"}" data-message-id="${esc(id)}"><p>${esc(item.text || "")}</p><small>${mine ? "You" : esc(item.name || partnerProfile.name)}${time ? ` · ${esc(time)}` : ""}</small></article>`;
    }).join("") : `<p class="partner-chat-empty">Say hello to ${esc(partnerProfile.name)} ♡</p>`;
    requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
  }

  const onPresenceClick = event => { if (event.target.closest("[data-open-partner-chat]")) openChat(); };
  presence.addEventListener("click", onPresenceClick);
  closeButton.addEventListener("click", closeChat);
  panel.addEventListener("click", event => { if (event.target === panel) closeChat(); });
  root.querySelectorAll(".partner-chat-emoji-row button").forEach(button => {
    button.addEventListener("click", () => { input.value += button.textContent; input.focus(); });
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      await push(ref(rtdb, chatPath), { uid: user.uid, profileKey: Object.keys(APP_CONFIG.profiles).find(key => APP_CONFIG.profiles[key].email === user.email) || "", name: profile.name || "", text, createdAt: serverTimestamp() });
      input.value = "";
      input.focus();
    } catch (error) {
      console.error("Could not send chat message:", error);
      toast("Your message could not be sent. Please try again.");
    } finally {
      submit.disabled = false;
    }
  });

  let stopMessages = null;
  let activeDay = "";
  function listenToToday() {
    stopMessages?.();
    activeDay = todayKey();
    initialSnapshot = true;
    const dayStart = Date.parse(`${activeDay}T00:00:00+04:00`);
    const dayEnd = dayStart + 86400000;
    const todayQuery = query(ref(rtdb, chatPath), orderByChild("createdAt"), startAt(dayStart), endAt(dayEnd), limitToLast(100));
    stopMessages = onValue(todayQuery, snapshot => {
      if (activeDay !== todayKey()) { listenToToday(); return; }
      const items = Object.entries(snapshot.val() || {})
        .filter(([, item]) => Number(item?.createdAt) >= dayStart && Number(item?.createdAt) < dayEnd)
        .sort((a, b) => Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0));
      if (initialSnapshot) {
        items.forEach(([id]) => seen.add(id));
        initialSnapshot = false;
      } else {
        const incoming = items.filter(([id, item]) => !seen.has(id) && item.uid !== user.uid);
        items.forEach(([id]) => seen.add(id));
        if (incoming.length) {
          alertSound.play();
          if (!isOpen) openChat();
        }
      }
      renderMessages(items);
    }, error => {
      console.error("Partner chat could not be loaded:", error);
      messages.innerHTML = `<p class="partner-chat-empty">Chat is unavailable right now.</p>`;
    });
  }
  listenToToday();
  let stopDayRollover = () => {};
  function scheduleNextDay() {
    stopDayRollover();
    stopDayRollover = scheduleDubaiDayRollover(() => {
      seen.clear();
      renderMessages([]);
      listenToToday();
      scheduleNextDay();
    });
  }
  scheduleNextDay();

  function onKeydown(event) {
    if (event.key === "Escape" && isOpen) { event.preventDefault(); closeChat(); }
  }
  window.addEventListener("keydown", onKeydown);

  return () => {
    stopMessages?.();
    stopDayRollover();
    document.removeEventListener("pointerdown", unlockSound);
    document.removeEventListener("keydown", unlockSound);
    window.removeEventListener("keydown", onKeydown);
    presence.removeEventListener("click", onPresenceClick);
    document.body.classList.remove("partner-chat-open");
    root.replaceChildren();
  };
}
