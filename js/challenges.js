import { $, esc, toast, todayKey, compressImage, scheduleDubaiDayRollover } from "./utils.js";
import {
  ensureChallengeAssignment,
  watchChallengeAssignments,
  watchItems,
  acceptChallengeAssignment,
  completeChallengeAssignment,
  skipChallengeAssignment,
  notifyPartnerSafely,
  addItem,
  transitionCustomChallenge,
  saveLovePhoto,
  changeDailyWaterProgress
} from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { findProfileForAuthor, getProfileKey } from "./profile-data.js";
import { challengeDays } from "./challenge-bank.js";
import { sendToTelegram, getTelegramLovePhoto } from "../src/services/telegramService.js";

let stopChallenges = null, stopLoveChallenges = null, stopCustomChallenges = null, stopWaterChallenges = null, dayRolloverTimer = null, challengeRenderToken = 0;
let customCompletedChallenges = [], customAllChallenges = [], waterTrackers = [], waterTrackersReady = false, loveUploads = [];
let removeProfilesListener = null, removeEscapeListener = null, removeActionsListener = null, lovePhotoUrls = new Map(), loveRetryCounts = new Map();
let queuedChallengeRender = 0;

function friendlyDate(dayKey) {
  return new Date(`${dayKey}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function statusLabel(status) {
  return ({
    upcoming: "⏳ Upcoming",
    "in-progress": "🏃 In Progress",
    completed: "✅ Completed",
    skipped: "⏭️ Skipped"
  })[status] || "⏳ Upcoming";
}

export function renderChallenges(el, user, profile) {
  disposeChallenges();
  customAllChallenges = [];
  customCompletedChallenges = [];
  waterTrackers = [];
  waterTrackersReady = false;
  loveUploads = [];
  const renderToken = challengeRenderToken;
  const isCurrent = () => renderToken === challengeRenderToken && el.isConnected;
  clearTimeout(dayRolloverTimer);
  dayRolloverTimer = scheduleDubaiDayRollover(() => {
    if (isCurrent()) window.App?.navigate("challenges");
  });
  const ownKey = getProfileKey(profile);
  const dayKey = todayKey();
  const todayChallenges = challengeDays(dayKey, 1);
  const monthStart = new Date(`${dayKey}T00:00:00Z`);
  monthStart.setUTCDate(monthStart.getUTCDate() - 30);
  const historyStartDay = monthStart.toISOString().slice(0, 10);
  let partnerProfiles = APP_CONFIG.profiles;
  let assignments = [], assignmentsReady = false, assignmentsError = false;
  const reconcilingDailyPoints = new Set();
  let selectedTab = "today";


  el.innerHTML = `
    <section class="challenge-page">
      <div class="summary-card" id="challenge-scoreboard"></div>
      <header class="challenge-page-head">
        <span class="challenge-sparkle" aria-hidden="true">✨</span>
        <h1>Challenges</h1>
      </header>
      <div id="give-challenge-modal-root"></div>
      <nav class="challenge-tabs" role="tablist" aria-label="Challenge sections">
        <button type="button" role="tab" aria-selected="true" class="challenge-tab selected" data-tab="today">Today</button>
        <button type="button" role="tab" aria-selected="false" class="challenge-tab" data-tab="partner">Partner <span id="partner-pending-dot" class="challenge-tab-dot hidden"></span></button>
        <button type="button" role="tab" aria-selected="false" class="challenge-tab" data-tab="history">History</button>
      </nav>
      <div class="challenge-list" id="challenge-list"><p class="challenge-empty">Loading your challenges…</p></div>
      <section id="partner-panel" hidden>
        <button type="button" class="give-challenge-hero" id="give-challenge-btn"><span class="gift">💌</span><span class="give-challenge-copy"><strong>Send a little challenge</strong><small>Make their day with something sweet</small></span><span>Give Challenge →</span></button>
        <nav class="challenge-sections" role="tablist" aria-label="Partner challenges"><button type="button" role="tab" aria-selected="true" data-custom-view="received" class="selected">Received (0)</button><button type="button" role="tab" aria-selected="false" data-custom-view="sent">Sent (0)</button></nav>
        <div id="custom-assignment-lists"></div>
      </section>
      <div id="challenge-modal-root"></div>
    </section>
  `;

  const list = $("#challenge-list", el);
  const modalRoot = $("#challenge-modal-root", el);
  const giveModalRoot = $("#give-challenge-modal-root", el);
  const scoreboard = $("#challenge-scoreboard", el);
  const customListsRoot = $("#custom-assignment-lists", el);
  const partnerPanel = $("#partner-panel", el);
  let customView = "received";

  function renderScoreboard() {
    const people = Object.keys(partnerProfiles);
    scoreboard.innerHTML = `<h3>Our little love scoreboard ♡</h3><div class="score-players">${people.map(key => {
      const person = partnerProfiles[key] || APP_CONFIG.profiles[key];
      const points = assignments.filter(item => item.challengeDate === dayKey && (item.completedBy || []).some(done => done.profileKey === key || done.uid === person?.authUid)).length;
      return `<div class="score-person"><img class="score-avatar" src="${esc(person?.avatar || "")}" alt="${esc(person?.name || "Partner")}"><span><small class="score-name">${esc(person?.name || "Partner")}</small><strong class="score-value">${points} <small>pts</small></strong></span></div>`;
    }).join(`<span class="score-heart">♥</span>`)}</div><p class="score-caption">One point for each daily challenge completed</p><div class="daily-progress"><strong>${assignments.filter(item => (item.completedBy || []).some(done => done.profileKey === ownKey || done.uid === user.uid)).length} / ${todayChallenges.length} done by you</strong><span class="daily-progress-track"><span class="daily-progress-fill" style="display:block;width:${Math.min(100, assignments.filter(item => (item.completedBy || []).some(done => done.profileKey === ownKey || done.uid === user.uid)) / todayChallenges.length * 100)}%"></span></span></div>`;
  }

  function triggerCompletionSplash() {
    const splash = document.createElement("div");
    splash.className = "completion-splash";
    splash.innerHTML = `<div class="splash-heart">❤️</div>`;
    document.body.appendChild(splash);
    setTimeout(() => splash.remove(), 1000);
  }

  el.querySelectorAll("[data-tab]").forEach(button => {
    button.onclick = () => {
      selectedTab = button.dataset.tab;
      el.querySelectorAll("[data-tab]").forEach(tab => {
        tab.classList.toggle("selected", tab === button);
        tab.setAttribute("aria-selected", String(tab === button));
      });
      render();
    };
  });

  function openGiveModal(editing = null) {
    giveModalRoot.innerHTML = `
      <div class="challenge-modal" id="give-challenge-modal" role="dialog" aria-modal="true" aria-labelledby="give-challenge-title">
        <section class="challenge-modal-card">
          <header class="challenge-modal-head"><h2 id="give-challenge-title">${editing ? "Edit your challenge" : "Give a Challenge"}</h2><button type="button" class="challenge-modal-close" data-close-give-modal aria-label="Close">×</button></header>
          <form class="challenge-complete-form" id="give-challenge-form">
            <label>Title<input type="text" name="title" maxlength="100" required value="${esc(editing?.title || "")}"></label>
            <label>Description / Note<textarea name="description" maxlength="500" required>${esc(editing?.description || "")}</textarea></label>
            ${editing ? "" : `<label>Deadline (days)<select name="duration"><option value="1">1 day</option><option value="3">3 days</option><option value="5">5 days</option><option value="7" selected>7 days</option><option value="10">10 days</option><option value="14">14 days</option><option value="30">30 days</option></select></label>`}
            <div class="challenge-modal-actions"><button type="button" class="challenge-secondary" data-close-give-modal>Cancel</button><button type="submit" class="challenge-main">${editing ? "Save changes" : "Send Challenge"}</button></div>
          </form>
        </section>
      </div>
    `;
    giveModalRoot.querySelectorAll("[data-close-give-modal]").forEach(b => b.onclick = () => giveModalRoot.innerHTML = "");
    giveModalRoot.querySelector('input[name="title"]')?.focus();
    $("#give-challenge-form", giveModalRoot).onsubmit = async (e) => {
        e.preventDefault();
        const title = e.target.elements.title.value.trim();
        const description = e.target.elements.description.value.trim();
        if (!title || !description) return;
        if (editing) {
          try {
            await transitionCustomChallenge(editing.id, { uid: user.uid, profileKey: ownKey }, "edit", { title, description });
            toast("Challenge updated.");
            giveModalRoot.innerHTML = "";
          } catch (err) { toast(err.message || "Could not update this challenge."); }
          return;
        }
        const durationDays = Number(e.target.elements.duration.value || 7);
        const createdAt = Date.now();
        const deadlineAt = createdAt + durationDays * 86400000;
        try {
            const recipientKey = Object.keys(APP_CONFIG.profiles).find(key => key !== ownKey) || "";
            const customRef = await addItem("customChallenge", { title, description, durationDays, createdAtMs: createdAt, deadlineAt, extensionRequested: false, status: "upcoming", author: user.uid, authorKey: ownKey, authorName: profile.name, recipientKey, assignedAtMs: createdAt, sentAtMs: createdAt, sentDate: todayKey(), actions: [] });
            void notifyPartnerSafely(ownKey, "challenge", `${profile.name} sent you a challenge: ${title}`.slice(0, 240), customRef.id, "challenges");
            toast("Challenge sent!");
            giveModalRoot.innerHTML = "";
        } catch (err) { console.error(err); toast("Could not send challenge."); }
    }
  }
  $("#give-challenge-btn", el).onclick = () => openGiveModal();

  function assignmentFor(challenge) {
    const storedAssignment = assignments.find(item => item.id === challenge.id);
    const assignment = storedAssignment ? {
      ...storedAssignment,
      acceptedBy: Array.isArray(storedAssignment.acceptedBy) ? storedAssignment.acceptedBy : [],
      skippedBy: Array.isArray(storedAssignment.skippedBy)
        ? storedAssignment.skippedBy
        : storedAssignment.skippedBy ? [storedAssignment.skippedBy] : [],
      completedBy: Array.isArray(storedAssignment.completedBy) ? storedAssignment.completedBy : []
    } : {
      id: challenge.id,
      ...challenge,
      status: "upcoming",
      acceptedBy: [],
      skippedBy: [],
      completedBy: []
    };
    const participantCount = Math.max(1, Object.keys(APP_CONFIG.profiles).length);
    if ((assignment.completedBy || []).length >= participantCount ||
      (assignment.status === "completed" && !assignment.completedBy?.length)) {
      return { ...assignment, status: "completed" };
    }
    if ((assignment.skippedBy || []).length >= participantCount ||
      (assignment.status === "skipped" && !assignment.skippedBy?.length)) {
      return { ...assignment, status: "skipped" };
    }
    if ((assignment.acceptedBy || []).length || (assignment.completedBy || []).length) {
      return { ...assignment, status: "in-progress" };
    }
    return { ...assignment, status: "upcoming" };
  }

  function waterRecordFor(key) {
    const records = waterTrackers.filter(item => item.dayKey === dayKey && item.profileKey === key);
    return records.find(item => item.id === `water-${dayKey}-${key}`) || records.sort((a, b) =>
      Number(b.updatedAtMs || b.createdAtMs || b.createdAt?.toMillis?.() || 0) - Number(a.updatedAtMs || a.createdAtMs || a.createdAt?.toMillis?.() || 0)
    )[0];
  }

  function waterCountFor(key) {
    return Math.max(0, Math.min(8, Number(waterRecordFor(key)?.count || 0)));
  }

  function reconcileTodayPoints() {
    if (!assignmentsReady) return;
    const actor = { uid: user.uid, profileKey: ownKey, name: profile.name };
    const loveRecord = loveUploads.find(item => item.dayKey === dayKey);
    const completedRoutines = [
      ...(waterCountFor(ownKey) >= 8 ? [[`${dayKey}-drink-water`, "Reached today's 8-glass water goal."]] : []),
      ...(loveRecord?.uploads?.[ownKey]?.dayKey === dayKey ? [[`${dayKey}-love-you-today`, "Shared today's love photo."]] : [])
    ];
    for (const [id, note] of completedRoutines) {
      if (!assignments.some(item => item.id === id) || assignments.find(item => item.id === id)?.completedBy?.some(person => person.uid === user.uid || person.profileKey === ownKey) || reconcilingDailyPoints.has(id)) continue;
      reconcilingDailyPoints.add(id);
      completeChallengeAssignment(id, actor, note, "").catch(error => console.error("Could not sync a completed daily challenge:", error)).finally(() => reconcilingDailyPoints.delete(id));
    }
  }

  function challengeCard(challenge, showDate = false) {
    const assignment = assignmentFor(challenge);
    const status = assignment.status || "upcoming";
    const hasSkipped = (assignment.skippedBy || []).some(person => person.uid === user.uid || person.profileKey === ownKey);
    const hasCompleted = (assignment.completedBy || []).some(person => person.uid === user.uid || person.profileKey === ownKey);
    const badgeClass = status === "completed" || status === "skipped" ? ` ${status}` : "";
    const dateText = showDate ? `<span class="challenge-date">${esc(friendlyDate(challenge.dayKey))}</span>` : "";
    const isSnapChallenge = challenge.challengeId === "send-snap" || challenge.id?.endsWith("-send-snap");
    const isWaterChallenge = challenge.challengeId === "drink-water" || challenge.id?.endsWith("-drink-water");
    const isLoveChallenge = challenge.challengeId === "love-you-today" || challenge.id?.endsWith("-love-you-today");
    const ownWater = waterRecordFor(ownKey);
    const otherKey = Object.keys(APP_CONFIG.profiles).find(key => key !== ownKey);
    const partnerWater = waterRecordFor(otherKey);
    const ownCount = Math.max(0, Math.min(8, Number(ownWater?.count || 0)));
    const partnerCount = Math.max(0, Math.min(8, Number(partnerWater?.count || 0)));
    const loveRecord = loveUploads.find(item => item.dayKey === dayKey);
    const uploads = loveRecord?.uploads || {};
    const partnerKeys = Object.keys(partnerProfiles).filter(key => key !== ownKey);
    const revealed = Boolean(uploads[ownKey]?.dayKey === dayKey && partnerKeys.every(key => uploads[key]?.dayKey === dayKey));
    const getPhotoUrl = key => lovePhotoUrls.get(`${dayKey}:${key}`) || "";
    [ownKey, ...(revealed ? partnerKeys : [])].filter(Boolean).forEach(key => {
      const cacheKey = `${dayKey}:${key}`;
      if (uploads[key]?.dayKey !== dayKey || lovePhotoUrls.has(cacheKey)) return;
      lovePhotoUrls.set(cacheKey, "loading");
      getTelegramLovePhoto(dayKey, key, ownKey).then(blob => {
        lovePhotoUrls.set(cacheKey, URL.createObjectURL(blob));
        if (isCurrent()) scheduleRender();
      }).catch(error => {
        lovePhotoUrls.delete(cacheKey);
        console.error("Love photo could not be revealed:", error);
        // Retry only while the partner has not finished (423), at most 6 times
        const tries = (loveRetryCounts.get(cacheKey) || 0) + 1;
        loveRetryCounts.set(cacheKey, tries);
        if (error.status === 423 && tries <= 6) setTimeout(() => { if (isCurrent()) scheduleRender(); }, 5000);
      });
    });
    const loveWidget = isLoveChallenge ? `<div class="love-widget">
      ${revealed ? `<p>Our little love notes are here 🌸</p>` : `<p class="love-waiting">${uploads[ownKey]?.dayKey === dayKey ? "A secret photo is waiting! Upload yours to reveal each other's love note today 🌸" : "Share a little something today; it stays hidden until you both upload 🌸"}</p>`}
      <div class="love-photos">${[ownKey, ...partnerKeys].map(key => { const image = uploads[key]; const person = partnerProfiles[key]; const visiblePhoto = image?.dayKey === dayKey && (revealed || key === ownKey); const photoUrl = getPhotoUrl(key); return visiblePhoto && photoUrl && photoUrl !== "loading" ? `<div class="love-photo-card"><img src="${esc(photoUrl)}" alt="${esc(person?.name || "Partner")}'s love photo"><span class="love-photo-label">${esc(person?.name || "Partner")}</span></div>` : `<div class="love-photo-card" style="display:grid;place-items:center;color:#a76180">${visiblePhoto ? "…" : image?.dayKey === dayKey ? "🔒" : "♡"}<span class="love-photo-label">${esc(person?.name || "Partner")} · ${visiblePhoto ? "revealing" : image?.dayKey === dayKey ? "secret" : "waiting"}</span></div>`; }).join("")}</div>
      ${uploads[ownKey]?.dayKey === dayKey ? `<button class="love-upload" type="button" disabled>✓ Your photo is in</button>` : `<button class="love-upload" type="button" data-action="love-upload" data-id="${esc(assignment.id)}">Add your photo ♡</button>`}
      </div>` : "";
    const specialWidget = isSnapChallenge
      ? `<button type="button" class="snap-mark" data-action="snap-complete" data-id="${esc(assignment.id)}" ${hasCompleted ? "disabled" : ""}>${hasCompleted ? "✓ Snap sent today" : "I sent today's Snap 📸"}</button>`
      : isWaterChallenge ? `<div class="water-widget">
          <div class="water-bottle-row"><div class="water-bottle" aria-label="Water bottle"><div class="water-fill" style="height:${ownCount / 8 * 100}%"></div></div>
          <div class="water-counts"><strong>💧 ${ownCount}/8 glasses</strong><small>${waterTrackersReady ? "Your daily hydration goal" : "Syncing water progress…"}</small><div class="water-controls"><button type="button" class="water-remove" data-action="water-remove" data-id="${esc(assignment.id)}" aria-label="Remove one glass" ${!waterTrackersReady || ownCount <= 0 ? "disabled" : ""}>−</button><button type="button" class="water-add" data-action="water-add" data-id="${esc(assignment.id)}" aria-label="Add one glass" ${!waterTrackersReady || ownCount >= 8 ? "disabled" : ""}>+ Add a glass</button></div></div></div>
          <div class="daily-partner-status">${Object.entries(partnerProfiles).map(([key, person]) => { const count = key === ownKey ? ownCount : partnerCount; return `<span>${esc(person.name)} · ${count}/8${count >= 8 ? "✓" : ""}</span>`; }).join("")}</div>
          ${(ownCount >= 8 && partnerCount >= 8) ? `<div class="water-celebrate">✅ Hydrated Together! 💧✨</div>` : ""}
        </div>` : loveWidget;
    const actions = isSnapChallenge || isWaterChallenge || isLoveChallenge ? "" : status === "upcoming"
      ? `<div class="challenge-actions">${hasSkipped ? `<button class="challenge-main" data-action="accept" data-id="${esc(assignment.id)}">Accept instead</button>` : `<button class="challenge-secondary" data-action="skip" data-id="${esc(assignment.id)}">Skip</button><button class="challenge-main" data-action="accept" data-id="${esc(assignment.id)}">Accept</button>`}</div>`
      : status === "in-progress"
        ? hasCompleted
          ? `<p class="challenge-completed-by">Your completion is saved; waiting for your partner ♡</p>`
          : `<div class="challenge-actions">${hasSkipped ? `<button class="challenge-secondary" data-action="accept" data-id="${esc(assignment.id)}">Join in</button>` : `<button class="challenge-secondary" data-action="skip" data-id="${esc(assignment.id)}">Skip</button>`}<button class="challenge-main" data-action="complete" data-id="${esc(assignment.id)}">Mark Complete</button></div>`
        : "";
    const completion = status === "completed"
      ? (assignment.completedBy || []).map(person => `
        <div class="challenge-completion-entry">
          <p class="challenge-completed-by">Completed by ${esc(person.name || "Us")}${person.completedAt ? ` · ${esc(new Date(person.completedAt).toLocaleString())}` : ""}</p>
          ${person.photoUrl ? `<img class="challenge-completion-photo" src="${esc(person.photoUrl)}" alt="${esc(person.name || "Partner")} completion photo">` : ""}
          ${person.note ? `<p class="challenge-completed-note">${esc(person.note)}</p>` : ""}
        </div>
      `).join("") || `
        ${assignment.photoUrl ? `<img class="challenge-completion-photo" src="${esc(assignment.photoUrl)}" alt="Challenge completion">` : ""}
        ${assignment.note ? `<p class="challenge-completed-note">${esc(assignment.note)}</p>` : ""}
        <p class="challenge-completed-by">Completed by ${(assignment.completedBy || []).map(person => esc(person.name)).join(" &amp; ")}</p>
      `
      : "";
    return `
      <article class="challenge-card">
        <div class="challenge-card-head"><div>${dateText}<h2>${esc(assignment.title || challenge.title)}</h2></div><span class="challenge-status${badgeClass}">${isSnapChallenge || isWaterChallenge || isLoveChallenge ? (Object.keys(partnerProfiles).every(key => (assignment.completedBy || []).some(done => done.profileKey === key || done.uid === partnerProfiles[key]?.authUid)) ? "Together ✓" : "In today’s routine") : esc(statusLabel(status))}</span></div>
        <p>${esc(assignment.description || challenge.description)}</p>
        ${(isSnapChallenge || isWaterChallenge || isLoveChallenge) ? `<div class="daily-partner-status">${Object.entries(partnerProfiles).map(([key, person]) => { const complete = (assignment.completedBy || []).some(done => done.profileKey === key || (person.authUid && done.uid === person.authUid)); return `<span>${esc(person.name)} · ${complete ? "✓ Done" : "⏳ Waiting"}</span>`; }).join("")}</div>` : ""}
        ${completion}
        ${specialWidget}
        ${actions}
      </article>
    `;
  }

  function renderToday() {
    list.innerHTML = todayChallenges.map(challenge => challengeCard(challenge)).join("");
  }

  function render() {
    if (!isCurrent()) return;
    renderScoreboard();
    partnerPanel.hidden = selectedTab !== "partner";
    list.hidden = selectedTab === "partner";
    el.querySelector("#partner-pending-dot").classList.toggle("hidden", !customAllChallenges.some(item => item.recipientKey === ownKey && item.status === "upcoming"));
    if (assignmentsError && selectedTab !== "partner") {
      list.innerHTML = `<p class="challenge-empty">Challenges could not be loaded. Please check your connection and try again.</p>`;
      return;
    }
    if (!assignmentsReady && selectedTab !== "partner") {
      list.innerHTML = `<p class="challenge-empty">Loading your challenges…</p>`;
      return;
    }
    if (selectedTab === "today") {
      renderToday();
      customListsRoot.innerHTML = "";
    } else if (selectedTab === "partner") {
      const received = customAllChallenges.filter(item => item.recipientKey === ownKey);
      const sent = customAllChallenges.filter(item => item.author === user.uid);
      customListsRoot.innerHTML = customChallengeCards(customView === "received" ? received : sent, customView === "received");
      partnerPanel.querySelectorAll("[data-custom-view]").forEach(button => {
        const items = button.dataset.customView === "received" ? received : sent;
        const pending = items.filter(item => item.status === "upcoming").length;
        button.textContent = `${button.dataset.customView === "received" ? "Received" : "Sent"} (${items.length}${pending ? ` · ${pending} pending` : ""})`;
        button.classList.toggle("selected", customView === button.dataset.customView);
        button.setAttribute("aria-selected", String(customView === button.dataset.customView));
        button.onclick = () => { customView = button.dataset.customView; render(); };
      });
    } else if (selectedTab === "history") {
      customListsRoot.innerHTML = "";
      const oneMonthAgo = Date.now() - 30 * 86400000;
      const completed = assignments
        .filter(item => (item.completedBy || []).length > 0 && (item.completedAt?.toMillis?.() || new Date(item.completedAt || 0).getTime() || Date.parse(`${item.challengeDate}T12:00:00`)) > oneMonthAgo)
        .sort((a, b) => (b.completedAt?.toMillis?.() || new Date(b.completedAt || 0).getTime() || Date.parse(`${b.challengeDate}T12:00:00`)) - (a.completedAt?.toMillis?.() || new Date(a.completedAt || 0).getTime() || Date.parse(`${a.challengeDate}T12:00:00`)));

      const standardCards = completed.map(item => challengeCard({ ...item, id: item.id, dayKey: item.challengeDate }, true)).join("");
      const customCompletedCards = customCompletedChallenges.map(item => `
        <article class="challenge-card">
          <div class="challenge-card-head"><div><h2>${esc(item.title || "Custom Challenge")}</h2></div><span class="challenge-status completed">✅ Completed</span></div>
          ${item.description ? `<p>${esc(item.description)}</p>` : ""}
          ${item.photoUrl ? `<img class="challenge-completion-photo" src="${esc(item.photoUrl)}" alt="Custom challenge completion">` : ""}
          ${item.note ? `<p class="challenge-completed-note">${esc(item.note)}</p>` : ""}
          <p class="challenge-completed-by">${esc(findProfileForAuthor(item.completedBy || item.author, item.completedByName || item.authorName || "")?.name || item.completedByName || item.authorName || "Us")} · ${esc(friendlyDate(item.completedAtMs ? new Date(item.completedAtMs).toISOString().slice(0,10) : item.sentDate || dayKey))}</p>
        </article>
      `);

      list.innerHTML = completed.length || customCompletedCards.length
      ? `${standardCards ? `<p class="challenge-section-label">Daily challenges · last 30 days</p>${standardCards}` : ""}${customCompletedCards.length ? `<p class="challenge-section-label">Partner challenges · all time</p>${customCompletedCards.join("")}` : ""}`
      : `<p class="challenge-empty">Completed challenges will be saved here ♡</p>`;
    }

  }

  function scheduleRender() {
    if (queuedChallengeRender) return;
    queuedChallengeRender = requestAnimationFrame(() => {
      queuedChallengeRender = 0;
      render();
    });
  }

  function customChallengeCards(items, received) {
    if (!items.length) return `<p class="challenge-empty">${received ? "No partner challenges are waiting right now ♡" : "Challenges you send will appear here ♡"}</p>`;
    return `<div class="challenge-list">${items.sort((a,b) => Number(b.sentAtMs || b.createdAtMs || 0) - Number(a.sentAtMs || a.createdAtMs || 0)).map(item => {
      const date = Number(item.sentAtMs || item.assignedAtMs || item.createdAtMs || 0);
      const status = item.status === "in-progress" ? "Accepted" : item.status === "completed" ? "Completed" : item.status === "declined" ? "Declined" : "Pending";
      return `<article class="challenge-card"><div class="challenge-card-head"><div><span class="challenge-date">${received ? "Assigned" : "Sent"} ${date ? esc(new Date(date).toLocaleDateString("en-GB", {day:"numeric",month:"short",year:"numeric"})) : ""}</span><h2>${esc(item.title || "Custom Challenge")}</h2></div><span class="challenge-status${status === "Completed" ? " completed" : ""}">${status}</span></div>${item.description ? `<p>${esc(item.description)}</p>` : ""}${item.note ? `<p class="challenge-completed-note">${esc(item.note)}</p>` : ""}${item.photoUrl ? `<img class="challenge-completion-photo" src="${esc(item.photoUrl)}" alt="Challenge completion">` : ""}${received && item.status === "upcoming" ? `<div class="challenge-actions"><button class="challenge-secondary" data-custom-action="decline" data-id="${esc(item.id)}">Decline</button><button class="challenge-main" data-custom-action="accept" data-id="${esc(item.id)}">Accept</button></div>` : ""}${received && item.status === "in-progress" ? `<div class="challenge-actions"><button class="challenge-main" data-custom-action="complete" data-id="${esc(item.id)}">Mark Complete</button></div>` : ""}${!received && item.status !== "completed" ? `<div class="challenge-actions">${["upcoming", "in-progress"].includes(item.status) ? `<button class="challenge-secondary" data-custom-action="edit" data-id="${esc(item.id)}">Edit</button>` : ""}<button class="challenge-secondary" data-custom-action="delete" data-id="${esc(item.id)}">Delete</button></div>` : ""}</article>`;
    }).join("")}</div>`;
  }

  function bindActions() {
    const handleActionClick = async event => {
      const customButton = event.target.closest?.("[data-custom-action]");
      if (customButton && el.contains(customButton)) {
        const item = customAllChallenges.find(challenge => challenge.id === customButton.dataset.id);
        if (!item) return;
        const action = customButton.dataset.customAction;
        if (action === "edit") return openGiveModal(item);
        if (action === "complete") return openCompletionModal(item.id, item);
        if (action === "delete" && !confirm("Delete this challenge? This cannot be undone.")) return;
        customButton.disabled = true;
        try {
          await transitionCustomChallenge(item.id, { uid: user.uid, profileKey: ownKey, name: profile.name }, action);
          if (action === "delete") toast("Challenge deleted.");
          if (action === "accept") { void notifyPartnerSafely(ownKey, "challenge", `${profile.name} accepted your challenge: ${item.title}`.slice(0, 240), `${item.id}-accepted`, "challenges"); toast("Challenge accepted ♡"); }
          if (action === "decline") { void notifyPartnerSafely(ownKey, "challenge", `${profile.name} declined your challenge: ${item.title}`.slice(0, 240), `${item.id}-declined`, "challenges"); toast("Challenge declined."); }
        } catch (error) { toast(error.message || "Could not update this challenge."); customButton.disabled = false; }
        return;
      }
      const button = event.target.closest?.("[data-action]");
      if (!button || !el.contains(button)) return;
      const assignmentId = button.dataset.id;
      const assignment = assignments.find(item => item.id === assignmentId);
      const challenge = todayChallenges.find(item => item.id === assignmentId);
      if (!assignment && !challenge) return toast("Could not identify this challenge.");
      const resolvedAssignment = assignment || assignmentFor(challenge);
      if (!resolvedAssignment || !ownKey) return toast("Could not identify this challenge.");
      button.disabled = true;
      try {
        if (button.dataset.action === "water-add") {
          const nextCount = await changeDailyWaterProgress(dayKey, { uid: user.uid, profileKey: ownKey, name: profile.name }, 1, waterCountFor(ownKey));
          if (nextCount === 8) void notifyPartnerSafely(ownKey, "challenge", `${profile.name} completed today's water goal.`, `water-${dayKey}-${ownKey}`, "challenges");
          toast(nextCount >= 8 ? "Daily water goal complete! 💧" : `Glass ${nextCount}/8 saved.`);
        } else if (button.dataset.action === "water-remove") {
          const nextCount = await changeDailyWaterProgress(dayKey, { uid: user.uid, profileKey: ownKey, name: profile.name }, -1, waterCountFor(ownKey));
          toast(`Water progress updated: ${nextCount}/8. Undo complete.`);
        } else if (button.dataset.action === "love-upload") {
          button.disabled = false;
          openLovePhotoModal();
        } else if (button.dataset.action === "snap-complete") {
          await completeChallengeAssignment(assignmentId, { uid: user.uid, profileKey: ownKey, name: profile.name }, "Sent today's Snap on Snapchat 📸", "");
          void notifyPartnerSafely(ownKey, "challenge", `${profile.name} completed a challenge.`, `${assignmentId}-completed`, "challenges");
          triggerCompletionSplash();
          toast("Snap marked as sent ♡");
        } else if (button.dataset.action === "accept") {
          await acceptChallengeAssignment(assignmentId, user.uid, ownKey, profile.name);
          void notifyPartnerSafely(ownKey, "challenge", `${profile.name} accepted your challenge: ${assignment?.title || challenge?.title || "Challenge"}`.slice(0, 240), `${assignmentId}-accepted`, "challenges");
          toast("Challenge accepted. Have fun together ♡");
        } else if (button.dataset.action === "skip") {
          await skipChallengeAssignment(assignmentId, user.uid, ownKey, profile.name);
          void notifyPartnerSafely(ownKey, "challenge", `${profile.name} skipped a challenge.`, `${assignmentId}-skipped`, "challenges");
          toast("Challenge moved to Skipped.");
        } else {
          openCompletionModal(assignmentId, resolvedAssignment);
        }
      } catch (error) {
        console.error("Could not update challenge:", error);
        toast(error.message || "Could not update this challenge.");
        button.disabled = false;
      }
    };
    el.addEventListener("click", handleActionClick);
    removeActionsListener = () => el.removeEventListener("click", handleActionClick);
  }

  function openCompletionModal(assignmentId, assignment) {
    modalRoot.innerHTML = `
      <div class="challenge-modal" id="challenge-completion-modal" role="dialog" aria-modal="true" aria-labelledby="challenge-completion-title">
        <section class="challenge-modal-card">
          <header class="challenge-modal-head"><h2 id="challenge-completion-title">Complete challenge</h2><button type="button" class="challenge-modal-close" data-close-modal aria-label="Close">×</button></header>
          <p class="muted">${esc(assignment.title)}</p>
          <form class="challenge-complete-form" id="challenge-complete-form">
          <label>Note (optional)<textarea name="note" maxlength="500" placeholder="Add a little note about it…"></textarea></label>
          <label>Photo (optional)<input type="file" name="photo" accept="image/*"></label>
            <img class="challenge-photo-preview hidden" id="challenge-photo-preview" alt="Selected completion photo" style="filter:none;">
            <div class="challenge-modal-actions"><button type="button" class="challenge-secondary" data-close-modal>Cancel</button><button type="submit" class="challenge-main">Save completion ♡</button></div>
          </form>
        </section>
      </div>
    `;
    const dialog = $("#challenge-completion-modal", modalRoot);
    const form = $("#challenge-complete-form", modalRoot);
    const image = $("#challenge-photo-preview", modalRoot);
    let selectedPhoto = null;
    dialog.querySelectorAll("[data-close-modal]").forEach(button => button.onclick = () => { modalRoot.innerHTML = ""; });
    dialog.onclick = event => {
      if (event.target === dialog) modalRoot.innerHTML = "";
    };
    (form.elements.note || dialog.querySelector("button[data-close-modal]"))?.focus();
    form.elements.photo?.addEventListener('change', () => {
      selectedPhoto = form.elements.photo.files[0] || null;
      if (!selectedPhoto) {
        image.classList.add("hidden");
        image.removeAttribute("src");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        image.src = reader.result;
        image.classList.remove("hidden");
      };
      reader.readAsDataURL(selectedPhoto);
    });

    form.onsubmit = async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Saving…";
      try {
        const photoUrl = selectedPhoto ? await compressImage(selectedPhoto) : "";
        if (selectedPhoto && !photoUrl) throw new Error("Could not read that photo. Choose another image.");

        await transitionCustomChallenge(assignmentId, { uid: user.uid, profileKey: ownKey, name: profile.name }, "complete", { note: form.elements.note?.value?.trim() || "", photoUrl });
        void notifyPartnerSafely(ownKey, "challenge", `${profile.name} completed your challenge.`, `${assignmentId}-completed`, "challenges");

        triggerCompletionSplash();
        modalRoot.innerHTML = "";
        toast("Challenge completed ♡");
      } catch (error) {
        console.error("Could not save challenge completion:", error);
        toast(error.message || "Could not save this completion.");
        submit.disabled = false;
        submit.textContent = "Save completion ♡";
      }
    };
  }

  function openLovePhotoModal() {
    modalRoot.innerHTML = `<div class="challenge-modal" role="dialog" aria-modal="true"><section class="challenge-modal-card"><header class="challenge-modal-head"><h2>Send a little love 🌸</h2><button type="button" class="challenge-modal-close" data-close-love aria-label="Close">×</button></header><p class="muted">Your photo stays hidden from your partner until they upload theirs today too.</p><form class="challenge-complete-form" id="love-photo-form"><label>Choose today's photo<input type="file" name="photo" accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.avif,.tif,.tiff,.gif,.bmp" required></label><small>JPEG, PNG, HEIC/HEIF, WebP, AVIF, TIFF, GIF, and BMP · up to 12 MB</small><img class="challenge-photo-preview hidden" alt="Photo preview"><div class="challenge-modal-actions"><button type="button" class="challenge-secondary" data-close-love>Cancel</button><button type="submit" class="challenge-main">Send with love ♡</button></div></form></section></div>`;
    const form = $("#love-photo-form", modalRoot);
    const dialog = form.closest(".challenge-modal");
    dialog.setAttribute("aria-labelledby", "love-photo-title");
    dialog.querySelector("h2").id = "love-photo-title";
    const image = form.querySelector("img");
    let previewUrl = "";
    const closeLoveModal = () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = "";
      modalRoot.innerHTML = "";
    };
    dialog.querySelectorAll("[data-close-love]").forEach(button => button.onclick = closeLoveModal);
    dialog.onclick = event => { if (event.target === dialog) closeLoveModal(); };
    form.elements.photo.onchange = () => {
      const file = form.elements.photo.files[0];
      if (!file) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      image.src = previewUrl;
      image.classList.remove("hidden");
    };
    form.elements.photo.focus();
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      const file = form.elements.photo.files[0];
      button.disabled = true;
      button.textContent = "Sending…";
      try {
        const telegramResult = await sendToTelegram(file, `Love You Today · ${profile.name} · ${dayKey}`, dayKey, ownKey);
        const fileId = telegramResult?.result?.document?.file_id || 
                       (telegramResult?.result?.photo ? telegramResult.result.photo[telegramResult.result.photo.length - 1].file_id : null);

        await saveLovePhoto(dayKey, { uid: user.uid, profileKey: ownKey, name: profile.name, fileId });
        void notifyPartnerSafely(ownKey, "challenge", `${profile.name} sent a secret love photo. Add yours to reveal them both 🌸`, `love-${dayKey}-${ownKey}`, "challenges");
        closeLoveModal();
        toast("Your love photo is waiting for your partner ♡");
      } catch (error) {
        console.error("Could not save love photo:", error);
        toast(error.message || "Could not send your photo.");
        button.disabled = false;
        button.textContent = "Send with love ♡";
      }
    };
  }

  async function prepareTodayChallenges() {
    try {
      const prepared = await Promise.all(todayChallenges.map(challenge => ensureChallengeAssignment(challenge)));
      const current = new Map(prepared.map(assignment => [assignment.id, assignment]));
      assignments.forEach(assignment => current.set(assignment.id, assignment));
      assignments = [...current.values()];
      assignmentsReady = true;
      reconcileTodayPoints();
      render();
    } catch (error) {
      console.error("Could not prepare today's challenges:", error);
      if (isCurrent()) {
        assignmentsReady = true;
        assignmentsError = true;
        list.innerHTML = `<p class="challenge-empty">Challenges could not be loaded. Please check your connection and try again. <button type="button" id="retry-challenges">Retry</button></p>`;
        $("#retry-challenges", list).onclick = () => { assignmentsReady = false; assignmentsError = false; render(); prepareTodayChallenges(); };
        toast(error.message || "Could not load challenges.");
      }
    }
  }

  stopChallenges = watchChallengeAssignments(items => {
    if (!isCurrent()) return;
    assignmentsError = false;
    assignments = items;
    reconcileTodayPoints();
    scheduleRender();
  }, error => {
    console.error("Challenge updates could not be synced:", error);
    if (!isCurrent()) return;
    assignmentsError = true;
    assignmentsReady = true;
    list.innerHTML = `<p class="challenge-empty">Challenges could not be loaded. Please check your connection and try again. <button type="button" id="retry-challenges">Retry</button></p>`;
    $("#retry-challenges", list).onclick = () => { assignmentsError = false; assignmentsReady = false; disposeChallenges(); window.App?.navigate("challenges"); };
    toast("Challenge updates could not be synced.");
  }, historyStartDay, 100);

  stopWaterChallenges = watchItems("waterChallenge", items => {
    if (!isCurrent()) return;
    waterTrackers = items;
    waterTrackersReady = true;
    reconcileTodayPoints();
    scheduleRender();
  }, error => {
    console.error("Water challenge updates could not be synced:", error);
    if (isCurrent()) toast("Water tracker could not be synced.");
  }, 120);
  stopCustomChallenges = watchItems("customChallenge", items => {
    if (!isCurrent()) return;
    customAllChallenges = items;
    customCompletedChallenges = items.filter(item => item.status === "completed");
    scheduleRender();
  }, error => {
    console.error("Custom challenges could not be loaded:", error);
    if (!isCurrent()) return;
    toast("Custom challenges could not be loaded.");
  });
  stopLoveChallenges = watchItems("loveYouChallenge", items => {
    if (!isCurrent()) return;
    loveUploads = items;
    reconcileTodayPoints();
    scheduleRender();
  }, error => {
    console.error("Love challenge uploads could not be synced:", error);
    if (isCurrent()) toast("Love challenge photos could not be synced.");
  }, 90);
  function onProfilesUpdated() { partnerProfiles = APP_CONFIG.profiles; render(); }
  removeProfilesListener = () => window.removeEventListener("couple-profiles-updated", onProfilesUpdated);
  window.addEventListener("couple-profiles-updated", onProfilesUpdated);
  function onChallengeEscape(event) {
    if (event.key === "Escape") {
      modalRoot.querySelector("[data-close-love], [data-close-modal]")?.click();
      giveModalRoot.querySelector("[data-close-give-modal]")?.click();
      return;
    }
    if (event.key === "Tab") {
      const dialog = modalRoot.querySelector('[role="dialog"]') || giveModalRoot.querySelector('[role="dialog"]');
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  removeEscapeListener = () => window.removeEventListener("keydown", onChallengeEscape);
  window.addEventListener("keydown", onChallengeEscape);
  bindActions();
  prepareTodayChallenges();
}

export function disposeChallenges() {
  challengeRenderToken++;
  clearTimeout(dayRolloverTimer);
  dayRolloverTimer = null;
  stopChallenges?.();
  stopChallenges = null;
  stopLoveChallenges?.();
  stopLoveChallenges = null;
  stopCustomChallenges?.();
  stopCustomChallenges = null;
  stopWaterChallenges?.();
  stopWaterChallenges = null;
  if (queuedChallengeRender) cancelAnimationFrame(queuedChallengeRender);
  queuedChallengeRender = 0;
  removeProfilesListener?.();
  removeProfilesListener = null;
  removeActionsListener?.();
  removeActionsListener = null;
  removeEscapeListener?.();
  removeEscapeListener = null;
  for (const url of lovePhotoUrls.values()) if (url !== "loading") URL.revokeObjectURL(url);
  lovePhotoUrls.clear();
  loveRetryCounts.clear();
}