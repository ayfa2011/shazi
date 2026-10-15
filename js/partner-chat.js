import { rtdb, firebaseReady } from "./firebase.js";
import { $, esc, toast } from "./utils.js";
import { APP_CONFIG } from "../config/app-config.js";
import { onValue, push, ref, serverTimestamp, query, orderByChild, limitToLast } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const chatPath = `couples/${APP_CONFIG.coupleId}/partnerChat/messages`;

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

  const stopMessages = onValue(query(ref(rtdb, chatPath), orderByChild("createdAt"), limitToLast(100)), snapshot => {
    const items = Object.entries(snapshot.val() || {}).sort((a, b) => Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0));
    if (initialSnapshot) {
      items.forEach(([id]) => seen.add(id));
      initialSnapshot = false;
    } else {
      const incoming = items.find(([id, item]) => !seen.has(id) && item.uid !== user.uid);
      items.forEach(([id]) => seen.add(id));
      if (incoming && !isOpen) openChat();
    }
    renderMessages(items);
  }, error => {
    console.error("Partner chat could not be loaded:", error);
    messages.innerHTML = `<p class="partner-chat-empty">Chat is unavailable right now.</p>`;
  });

  function onKeydown(event) {
    if (event.key === "Escape" && isOpen) { event.preventDefault(); closeChat(); }
  }
  window.addEventListener("keydown", onKeydown);

  return () => {
    stopMessages();
    window.removeEventListener("keydown", onKeydown);
    presence.removeEventListener("click", onPresenceClick);
    document.body.classList.remove("partner-chat-open");
    root.replaceChildren();
  };
}
