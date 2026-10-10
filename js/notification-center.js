import { $, esc, toast } from "./utils.js";
import { markNotificationsRead, notifyPartner, watchItems, watchNotifications } from "./firestore.js";
import { findProfileForAuthor, getProfileKey } from "./profile-data.js";

const notificationIcons = {
  question: "♡",
  challenge: "✨",
  letter: "💌",
  memory: "📸",
  drawing: "🎨",
  post: "📝",
  comment: "💬",
  like: "❤️",
  bucket: "🎯",
  customQuestion: "💌",
  specialDay: "🎉",
  game: "🎮",
  music: "♫"
};
const notificationRoutes = new Set(["home", "questions", "challenges", "letters", "memories", "drawing", "gallery", "bucket", "more", "games"]);

let stopNotifications = null;
let stopLetters = null;
let notificationRoot = null;
let outsideClickHandler = null;
let letterTimer = null;
let currentRouteHandler = null;

function timestampMilliseconds(value) {
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Date.parse(value || "") || 0;
}

function displayTime(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || !Number.isFinite(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function escapeStorageKey(value) {
  return String(value).replace(/[^A-Za-z0-9_-]/g, "_");
}

function scanStorageKey(profileKey) {
  return `our-little-world-letter-notification-scan-${escapeStorageKey(profileKey)}`;
}

function browserNotificationsEnabled(profileKey) {
  try {
    return localStorage.getItem(`our-little-world-browser-notifications-${escapeStorageKey(profileKey)}`) === "enabled";
  } catch (error) {
    console.warn("Browser notification preference could not be read:", error);
    return false;
  }
}

function saveBrowserNotificationsEnabled(profileKey) {
  try {
    localStorage.setItem(`our-little-world-browser-notifications-${escapeStorageKey(profileKey)}`, "enabled");
  } catch (error) {
    console.error("Browser notification preference could not be saved:", error);
    toast("Could not save the browser notification setting.");
  }
}

function showBrowserNotification(notification) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const options = {
    body: notification.message,
    icon: new URL("../icons/app-icon-192.png", import.meta.url).href,
    badge: new URL("../icons/app-icon-192.png", import.meta.url).href,
    tag: notification.id,
    data: { route: notificationRoutes.has(notification.route) ? notification.route : "home" }
  };

  const display = async () => {
    try {
      const registration = await navigator.serviceWorker?.ready;
      if (registration?.showNotification) {
        await registration.showNotification(notification.title || "Our Little World", options);
        return;
      }
      const browserNotification = new Notification(notification.title || "Our Little World", options);
      browserNotification.onclick = () => {
        window.focus();
        if (options.data.route) currentRouteHandler?.(options.data.route);
        browserNotification.close();
      };
    } catch (error) {
      console.error("Browser notification could not be displayed:", error);
    }
  };
  display();
}

function enableButtonText() {
  if (!("Notification" in window)) return "Browser alerts unavailable";
  if (Notification.permission === "denied") return "Browser alerts blocked";
  return Notification.permission === "granted" ? "Turn on browser alerts" : "Enable browser alerts";
}

function renderNotifications(items, profileKey, knownIds, hasLoaded) {
  const list = $("#notification-list", notificationRoot);
  const badge = $("#notification-count", notificationRoot);
  const markAll = $("#notification-mark-all", notificationRoot);
  const enable = $("#notification-enable", notificationRoot);
  if (!list || !badge) return;

  const unread = items.filter(item => !item.readAt);
  badge.textContent = unread.length > 99 ? "99+" : String(unread.length);
  badge.hidden = unread.length === 0;
  if (markAll) markAll.hidden = unread.length === 0;
  if (enable) {
    enable.textContent = enableButtonText();
    enable.disabled = !("Notification" in window) || Notification.permission === "denied";
  }

  if (!items.length) {
    list.innerHTML = `<p class="notification-empty">You're all caught up ♡</p>`;
    return;
  }

  list.innerHTML = items.map(item => {
    const route = notificationRoutes.has(item.route) ? item.route : "home";
    const icon = notificationIcons[item.type] || "🔔";
    return `<button class="notification-item${item.readAt ? "" : " unread"}" type="button" data-open-notification="${esc(item.id)}" data-notification-route="${route}">
      <span class="notification-item-icon" aria-hidden="true">${icon}</span>
      <span class="notification-item-copy"><strong>${esc(item.title || "Our Little World")}</strong><span>${esc(item.message || "")}</span><small>${esc(displayTime(item.createdAt))}</small></span>
      ${item.readAt ? "" : `<span class="notification-unread-dot" aria-label="Unread"></span>`}
    </button>`;
  }).join("");

  if (!hasLoaded || !browserNotificationsEnabled(profileKey)) return;
  items.forEach(item => {
    if (!knownIds.has(item.id) && !item.readAt) showBrowserNotification(item);
  });
}

export function initNotificationCenter(user, profile, navigate) {
  disposeNotificationCenter();
  const root = $("#notification-center");
  const profileKey = getProfileKey(profile);
  if (!root || !profileKey) {
    console.error("Notification center could not identify the signed-in partner.");
    return;
  }

  notificationRoot = root;
  currentRouteHandler = navigate;
  root.innerHTML = `<button id="notification-toggle" class="icon-btn notification-toggle" type="button" aria-label="Notifications" aria-expanded="false" aria-controls="notification-panel" title="Notifications">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
    <span id="notification-count" class="notification-count" hidden>0</span>
  </button>
  <section id="notification-panel" class="notification-panel hidden" aria-label="Notifications">
    <header class="notification-panel-head"><div><h3>Notifications</h3><p>Little updates from your world ♡</p></div><button id="notification-mark-all" class="notification-mark-all" type="button" hidden>Mark all read</button></header>
    <div id="notification-list" class="notification-list" aria-live="polite"><p class="notification-empty">Loading notifications…</p></div>
    <footer class="notification-panel-foot"><button id="notification-enable" type="button">Enable browser alerts</button><small>For alerts while the website is open</small></footer>
  </section>`;

  const toggle = $("#notification-toggle", root);
  const panel = $("#notification-panel", root);
  const knownIds = new Set();
  let hasLoaded = false;
  let letterScanAt;
  try {
    const savedScanAt = Number(localStorage.getItem(scanStorageKey(profileKey)));
    letterScanAt = Number.isFinite(savedScanAt) && savedScanAt > 0 ? savedScanAt : Date.now();
  } catch (error) {
    console.warn("Scheduled letter notification checkpoint could not be loaded:", error);
    letterScanAt = Date.now();
  }

  function rememberLetterScan(time) {
    letterScanAt = time;
    try {
      localStorage.setItem(scanStorageKey(profileKey), String(time));
    } catch (error) {
      console.error("Scheduled letter notification checkpoint could not be saved:", error);
    }
  }

  function scheduleNextDelivery(letters, processDueLetters) {
    clearTimeout(letterTimer);
    const now = Date.now();
    const nextDelivery = letters
      .filter(letter => letter.status === "Scheduled" && letter.author !== user.uid &&
        letter.recipient === profileKey && timestampMilliseconds(letter.deliverDate) > now)
      .map(letter => timestampMilliseconds(letter.deliverDate))
      .sort((a, b) => a - b)[0];
    if (!nextDelivery) return;
    letterTimer = setTimeout(processDueLetters, Math.min(nextDelivery - now + 100, 2147483647));
  }

  stopNotifications = watchNotifications(profileKey, items => {
    renderNotifications(items, profileKey, knownIds, hasLoaded);
    if (!hasLoaded) {
      items.forEach(item => knownIds.add(item.id));
      hasLoaded = true;
      return;
    }
    items.forEach(item => knownIds.add(item.id));
  }, error => {
    console.error("Notifications could not be loaded:", error);
    const list = $("#notification-list", root);
    if (list) list.innerHTML = `<p class="notification-error">Notifications could not be loaded. Please try again.</p>`;
  });

  const processDueLetters = async letters => {
    const now = Date.now();
    const previousScanAt = letterScanAt;
    const incoming = letters.filter(letter => letter.author !== user.uid && letter.recipient === profileKey);
    let notificationsSaved = true;
    for (const letter of incoming) {
      const sentAt = timestampMilliseconds(letter.createdAt);
      const deliveredAt = letter.status === "Scheduled"
        ? timestampMilliseconds(letter.deliverDate)
        : letter.status === "Sent" ? sentAt : 0;
      const isNewlyAvailable = letter.status === "Sent"
        ? sentAt >= previousScanAt
        : deliveredAt >= previousScanAt && deliveredAt <= now;
      if (!isNewlyAvailable || !letter.id) continue;
      try {
        const message = letter.status === "Scheduled"
          ? `A scheduled letter from ${letter.authorName || "your partner"} is ready to read.`
          : "New letter received.";
        const senderKey = getProfileKey(findProfileForAuthor(letter.author, letter.authorName || ""));
        if (!senderKey) {
          console.error("A letter notification could not identify its sender:", letter.id);
          notificationsSaved = false;
          continue;
        }
        await notifyPartner(senderKey, "letter", message, letter.id, "letters");
      } catch (error) {
        console.error("A received letter notification could not be saved:", error);
        notificationsSaved = false;
      }
    }
    if (!notificationsSaved) {
      clearTimeout(letterTimer);
      letterTimer = setTimeout(() => processDueLetters(letters), 30000);
      return;
    }
    rememberLetterScan(now);
    scheduleNextDelivery(letters, () => processDueLetters(letters));
  };

  stopLetters = watchItems("letter", letters => {
    processDueLetters(letters || []);
  }, error => {
    console.error("Received letter notifications could not be synced:", error);
  });

  root.onclick = async event => {
    const button = event.target.closest("button");
    if (!button || !root.contains(button)) return;
    if (button.id === "notification-toggle") {
      const willOpen = panel.classList.contains("hidden");
      panel.classList.toggle("hidden", !willOpen);
      toggle.setAttribute("aria-expanded", String(willOpen));
      return;
    }
    if (button.id === "notification-mark-all") {
      const unreadIds = [...root.querySelectorAll("[data-open-notification]")]
        .filter(item => item.classList.contains("unread"))
        .map(item => item.dataset.openNotification);
      button.disabled = true;
      try {
        await markNotificationsRead(unreadIds);
      } catch (error) {
        console.error("Could not mark notifications as read:", error);
        toast("Could not update notifications. Please try again.");
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (button.id === "notification-enable") {
      if (!("Notification" in window)) {
        toast("Browser notifications are not available here.");
        return;
      }
      try {
        let permission = Notification.permission;
        if (permission === "default") permission = await Notification.requestPermission();
        if (permission === "granted") {
          saveBrowserNotificationsEnabled(profileKey);
          button.textContent = "Browser alerts enabled ♡";
          toast("Browser alerts enabled ♡");
        } else if (permission === "denied") {
          button.textContent = "Browser alerts blocked";
          toast("Allow notifications in your browser settings to enable alerts.");
        }
      } catch (error) {
        console.error("Browser notification permission could not be requested:", error);
        toast("Browser notification permission could not be requested.");
      }
      return;
    }
    if (button.hasAttribute("data-open-notification")) {
      const id = button.dataset.openNotification;
      const route = notificationRoutes.has(button.dataset.notificationRoute) ? button.dataset.notificationRoute : "home";
      if (button.classList.contains("unread")) {
        try {
          await markNotificationsRead([id]);
        } catch (error) {
          console.error("Could not mark notification as read:", error);
          toast("Could not update this notification.");
          return;
        }
      }
      panel.classList.add("hidden");
      toggle.setAttribute("aria-expanded", "false");
      navigate(route);
    }
  };

  outsideClickHandler = event => {
    if (!root.contains(event.target)) {
      panel.classList.add("hidden");
      toggle.setAttribute("aria-expanded", "false");
    }
  };
  document.addEventListener("click", outsideClickHandler);
}

export function disposeNotificationCenter() {
  stopNotifications?.();
  stopNotifications = null;
  stopLetters?.();
  stopLetters = null;
  clearTimeout(letterTimer);
  letterTimer = null;
  if (outsideClickHandler) document.removeEventListener("click", outsideClickHandler);
  outsideClickHandler = null;
  if (notificationRoot) {
    notificationRoot.onclick = null;
    notificationRoot.replaceChildren();
  }
  notificationRoot = null;
  currentRouteHandler = null;
}
