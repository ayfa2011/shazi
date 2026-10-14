import { $, esc, toast, todayKey, scheduleDubaiDayRollover } from "./utils.js";
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
import { getTelegramMediaUrl, sendToTelegram, getTelegramLovePhoto, telegramMediaReferences, telegramUploadMimeType } from "../src/services/telegramService.js";

let stopChallenges = null, stopLoveChallenges = null, stopCustomChallenges = null, stopWaterChallenges = null;
let dayRolloverTimer = null, challengeRenderToken = 0, queuedChallengeRender = 0;
let customAllChallenges = [], waterTrackers = [], waterTrackersReady = false, loveUploads = [];
let removeProfilesListener = null, removeEscapeListener = null, removeActionsListener = null;
let lovePhotoUrls = new Map(), loveRetryCounts = new Map(), lovePhotoMissing = new Set();

export function renderChallenges(el, user, profile) {
  disposeChallenges();
  customAllChallenges = [];
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
  let historyFilter = "all"; // all | snap | water | love

  el.innerHTML = `
    <section class="challenge-page">
      <header class="challenge-page-head">
        <span class="challenge-sparkle" aria-hidden="true">✨</span>
        <h1>Challenges</h1>
      </header>

      <div class="summary-card" id="challenge-scoreboard"></div>

      <nav class="challenge-tabs" role="tablist" aria-label="Sections">
        <button type="button" role="tab" class="challenge-tab selected" data-tab="today">Today</button>
        <button type="button" role="tab" class="challenge-tab" data-tab="history">History</button>
      </nav>

      <button type="button" class="give-challenge-btn" id="give-challenge-btn">
        <span class="give-icon" aria-hidden="true">💌</span>
        <span class="give-copy">
          <strong>Give a Challenge / Punishment</strong>
          <small>Send something sweet (or spicy) to your partner</small>
        </span>
        <span class="give-arrow" aria-hidden="true">›</span>
      </button>

      <div id="challenge-list"></div>
      <div id="custom-assignment-lists"></div>
      <div id="challenge-modal-root"></div>
      <div id="give-challenge-modal-root"></div>
    </section>
  `;

  const list = $("#challenge-list", el);
  const customListsRoot = $("#custom-assignment-lists", el);
  const modalRoot = $("#challenge-modal-root", el);
  const giveModalRoot = $("#give-challenge-modal-root", el);
  const scoreboard = $("#challenge-scoreboard", el);

  function renderScoreboard() {
    const people = Object.keys(partnerProfiles);
    scoreboard.innerHTML = `
      <h3>Our little love scoreboard ♡</h3>
      <div class="score-players">
        ${people.map(key => {
          const person = partnerProfiles[key] || APP_CONFIG.profiles[key];
          const points = assignments.filter(item =>
            item.challengeDate === dayKey &&
            (item.completedBy || []).some(done => done.profileKey === key || done.uid === person?.authUid)
          ).length;
          return `
            <div class="score-person">
              <img class="score-avatar" src="${esc(person?.avatar || "")}" alt="${esc(person?.name || "Partner")}">
              <span>
                <small class="score-name">${esc(person?.name || "Partner")}</small>
                <strong class="score-value">${points} <small>pts</small></strong>
              </span>
            </div>`;
        }).join('<span class="score-heart">♥</span>')}
      </div>
      <p class="score-caption">One point for each daily challenge completed</p>
    `;
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

  /* ─── Give Challenge / Punishment ───────────────── */
  function openGiveModal(editing = null) {
    const editingKind = editing?.kind === "punishment" ? "punishment" : "challenge";
    giveModalRoot.innerHTML = `
      <div class="challenge-modal" role="dialog" aria-modal="true">
        <section class="challenge-modal-card">
          <header class="challenge-modal-head">
            <h2>${editing ? "Edit" : "Send"} ${editingKind === "punishment" ? "Punishment" : "Challenge"}</h2>
            <button type="button" class="challenge-modal-close" data-close-give aria-label="Close">×</button>
          </header>
          <form class="challenge-form" id="give-challenge-form">
            ${editing ? "" : `
              <div class="kind-toggle" role="tablist">
                <button type="button" data-kind="challenge" class="selected">💝 Challenge</button>
                <button type="button" data-kind="punishment" class="punishment">😈 Punishment</button>
              </div>`}
            <label>Title
              <input type="text" name="title" maxlength="80" required value="${esc(editing?.title || "")}" placeholder="e.g. Make me a cup of tea">
            </label>
            <label>Description
              <textarea name="description" maxlength="300" required placeholder="Add a little detail…">${esc(editing?.description || "")}</textarea>
            </label>
            ${editing ? "" : `
              <label>Time to complete
                <select name="duration">
                  <option value="1">Within 1 day</option>
                  <option value="3">Within 3 days</option>
                  <option value="5">Within 5 days</option>
                  <option value="7" selected>Within 7 days</option>
                  <option value="14">Within 2 weeks</option>
                  <option value="30">Within 30 days</option>
                </select>
              </label>`}
            <div class="challenge-modal-actions">
              <button type="button" class="modal-secondary" data-close-give>Cancel</button>
              <button type="submit" class="modal-primary ${editingKind === "punishment" ? "punishment" : ""}">
                ${editing ? "Save" : "Send"} ${editingKind === "punishment" ? "Punishment" : "Challenge"}
              </button>
            </div>
          </form>
        </section>
      </div>
    `;

    const form = $("#give-challenge-form", giveModalRoot);
    let kind = editingKind;

    giveModalRoot.querySelectorAll("[data-close-give]").forEach(b => b.onclick = () => giveModalRoot.innerHTML = "");
    giveModalRoot.querySelector(".challenge-modal").onclick = event => {
      if (event.target === giveModalRoot.querySelector(".challenge-modal")) giveModalRoot.innerHTML = "";
    };
    form.elements.title?.focus();

    form.querySelectorAll("[data-kind]").forEach(button => {
      button.onclick = () => {
        kind = button.dataset.kind;
        form.querySelectorAll("[data-kind]").forEach(b => b.classList.toggle("selected", b === button));
        const submit = form.querySelector('[type="submit"]');
        submit.classList.toggle("punishment", kind === "punishment");
        submit.textContent = `${editing ? "Save" : "Send"} ${kind === "punishment" ? "Punishment" : "Challenge"}`;
        giveModalRoot.querySelector("h2").textContent = `${editing ? "Edit" : "Send"} ${kind === "punishment" ? "Punishment" : "Challenge"}`;
      };
    });

    form.onsubmit = async event => {
      event.preventDefault();
      const title = form.elements.title.value.trim();
      const description = form.elements.description.value.trim();
      if (!title || !description) return;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;

      try {
        if (editing) {
          await transitionCustomChallenge(editing.id, { uid: user.uid, profileKey: ownKey }, "edit", { title, description, kind });
          toast("Updated ♡");
          giveModalRoot.innerHTML = "";
          return;
        }
        const durationDays = Number(form.elements.duration.value || 7);
        const createdAt = Date.now();
        const deadlineAt = createdAt + durationDays * 86400000;
        const recipientKey = Object.keys(APP_CONFIG.profiles).find(key => key !== ownKey) || "";
        const customRef = await addItem("customChallenge", {
          title, description, kind, durationDays,
          createdAtMs: createdAt, deadlineAt,
          extensionRequested: false,
          status: "upcoming",
          author: user.uid,
          authorKey: ownKey,
          authorName: profile.name,
          recipientKey,
          assignedAtMs: createdAt,
          sentAtMs: createdAt,
          sentDate: todayKey(),
          actions: []
        });
        void notifyPartnerSafely(ownKey, "challenge",
          `${profile.name} sent ${kind === "punishment" ? "a punishment" : "a challenge"}: ${title}`.slice(0, 240),
          customRef.id, "challenges");
        toast(kind === "punishment" ? "Punishment sent 😈" : "Challenge sent ♡");
        giveModalRoot.innerHTML = "";
      } catch (error) {
        console.error(error);
        toast(error.message || "Could not send.");
        submit.disabled = false;
      }
    };
  }
  $("#give-challenge-btn", el).onclick = () => openGiveModal();

  /* ─── Assignment / water / love helpers ─────────── */
  function assignmentFor(challenge) {
    const stored = assignments.find(item => item.id === challenge.id);
    const assignment = stored ? {
      ...stored,
      acceptedBy: Array.isArray(stored.acceptedBy) ? stored.acceptedBy : [],
      skippedBy: Array.isArray(stored.skippedBy) ? stored.skippedBy : stored.skippedBy ? [stored.skippedBy] : [],
      completedBy: Array.isArray(stored.completedBy) ? stored.completedBy : []
    } : {
      id: challenge.id,
      ...challenge,
      status: "upcoming",
      acceptedBy: [], skippedBy: [], completedBy: []
    };
    const participantCount = Math.max(1, Object.keys(APP_CONFIG.profiles).length);
    if ((assignment.completedBy || []).length >= participantCount) return { ...assignment, status: "completed" };
    if ((assignment.skippedBy || []).length >= participantCount) return { ...assignment, status: "skipped" };
    if ((assignment.acceptedBy || []).length || (assignment.completedBy || []).length) return { ...assignment, status: "in-progress" };
    return { ...assignment, status: "upcoming" };
  }

  function waterRecordFor(key) {
    const records = waterTrackers.filter(item => item.dayKey === dayKey && item.profileKey === key);
    return records.find(item => item.id === `water-${dayKey}-${key}`) || records.sort((a, b) =>
      Number(b.updatedAtMs || b.createdAtMs || b.createdAt?.toMillis?.() || 0) -
      Number(a.updatedAtMs || a.createdAtMs || a.createdAt?.toMillis?.() || 0)
    )[0];
  }
  function waterCountFor(key) {
    return Math.max(0, Math.min(8, Number(waterRecordFor(key)?.count || 0)));
  }

  function loadLovePhoto(day, key) {
    const cacheKey = `${day}:${key}`;
    if (lovePhotoUrls.has(cacheKey) || lovePhotoMissing.has(cacheKey)) return;
    lovePhotoUrls.set(cacheKey, "loading");
    getTelegramLovePhoto(day, key, ownKey).then(blob => {
      lovePhotoUrls.set(cacheKey, URL.createObjectURL(blob));
      if (isCurrent()) scheduleRender();
    }).catch(error => {
      lovePhotoUrls.delete(cacheKey);
      if (error.status === 404 && key === ownKey) {
        lovePhotoMissing.add(cacheKey);
        if (isCurrent()) scheduleRender();
        return;
      }
      const tries = (loveRetryCounts.get(cacheKey) || 0) + 1;
      loveRetryCounts.set(cacheKey, tries);
      if ((error.status === 423 || error.status === 404) && tries <= 6) {
        setTimeout(() => { if (isCurrent()) scheduleRender(); }, 5000);
      } else {
        console.error("Love photo could not be loaded:", error);
      }
    });
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
      if (!assignments.some(item => item.id === id)) continue;
      if (assignments.find(item => item.id === id)?.completedBy?.some(p => p.uid === user.uid || p.profileKey === ownKey)) continue;
      if (reconcilingDailyPoints.has(id)) continue;
      reconcilingDailyPoints.add(id);
      completeChallengeAssignment(id, actor, note, "")
        .catch(error => console.error("Could not sync a daily challenge:", error))
        .finally(() => reconcilingDailyPoints.delete(id));
    }
  }

  /* ─── The three daily challenge cards ───────────── */
  function dailySnapCard(challenge) {
    const assignment = assignmentFor(challenge);
    const hasCompleted = (assignment.completedBy || []).some(p => p.uid === user.uid || p.profileKey === ownKey);
    const partnerKeys = Object.keys(partnerProfiles).filter(k => k !== ownKey);
    const partnerDone = partnerKeys.some(k => (assignment.completedBy || []).some(p =>
      p.profileKey === k || (partnerProfiles[k]?.authUid && p.uid === partnerProfiles[k].authUid)));
    const badgeClass = hasCompleted && partnerDone ? "done" : hasCompleted ? "progress" : "";
    const badgeText = hasCompleted && partnerDone ? "Together ✓" : hasCompleted ? "Sent ✓" : "Pending";
    return `
      <article class="challenge-card">
        <div class="challenge-card-head">
          <span class="challenge-icon" aria-hidden="true">📸</span>
          <div class="challenge-head-copy">
            <h2>Send Snap</h2>
            <small>Send your daily Snap on Snapchat</small>
          </div>
          <span class="challenge-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="snap-widget">
          <button type="button" class="snap-toggle ${hasCompleted ? "is-done" : ""}"
                  data-action="snap-complete" data-id="${esc(assignment.id)}"
                  ${hasCompleted ? "disabled" : ""}>
            <span class="snap-check" aria-hidden="true">${hasCompleted ? "✓" : "📸"}</span>
            <span>${hasCompleted ? "You sent today's Snap" : "Mark today's Snap as sent"}</span>
          </button>
          <div class="challenge-mini-progress">
            ${Object.entries(partnerProfiles).map(([key, person]) => {
              const done = (assignment.completedBy || []).some(p => p.profileKey === key || (person.authUid && p.uid === person.authUid));
              return `<span class="${done ? "done" : ""}">${esc(person.name)} · ${done ? "✓ Sent" : "⏳ Waiting"}</span>`;
            }).join("")}
          </div>
        </div>
      </article>
    `;
  }

  function dailyWaterCard(challenge) {
    const assignment = assignmentFor(challenge);
    const ownCount = waterCountFor(ownKey);
    const otherKey = Object.keys(APP_CONFIG.profiles).find(k => k !== ownKey);
    const partnerCount = waterCountFor(otherKey);
    const bothDone = ownCount >= 8 && partnerCount >= 8;
    const badgeClass = bothDone ? "done" : ownCount > 0 ? "progress" : "";
    const badgeText = bothDone ? "Together ✓" : `${ownCount}/8 today`;
    return `
      <article class="challenge-card">
        <div class="challenge-card-head">
          <span class="challenge-icon" aria-hidden="true">💧</span>
          <div class="challenge-head-copy">
            <h2>Drink Water</h2>
            <small>8 glasses a day, together</small>
          </div>
          <span class="challenge-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="water-widget">
          <div class="water-bottle-row">
            <div class="water-bottle" aria-label="Water bottle">
              <div class="water-fill" style="height:${ownCount / 8 * 100}%"></div>
            </div>
            <div class="water-info">
              <strong>${ownCount}<small>/8 glasses</small></strong>
              <small>${waterTrackersReady ? "Your daily goal" : "Syncing…"}</small>
            </div>
          </div>
          <div class="water-controls">
            <button type="button" class="water-remove"
                    data-action="water-remove" data-id="${esc(assignment.id)}"
                    aria-label="Remove one glass"
                    ${!waterTrackersReady || !assignmentsReady || ownCount <= 0 ? "disabled" : ""}>−</button>
            <button type="button" class="water-add"
                    data-action="water-add" data-id="${esc(assignment.id)}"
                    aria-label="Add one glass"
                    ${!waterTrackersReady || !assignmentsReady || ownCount >= 8 ? "disabled" : ""}>+ Add a glass</button>
          </div>
          <div class="challenge-mini-progress">
            ${Object.entries(partnerProfiles).map(([key, person]) => {
              const count = key === ownKey ? ownCount : partnerCount;
              return `<span class="${count >= 8 ? "done" : ""}">${esc(person.name)} · ${count}/8${count >= 8 ? " ✓" : ""}</span>`;
            }).join("")}
          </div>
          ${bothDone ? `<div class="water-celebrate">Hydrated together 💧✨</div>` : ""}
        </div>
      </article>
    `;
  }

  function dailyLoveCard(challenge) {
    const assignment = assignmentFor(challenge);
    const loveRecord = loveUploads.find(item => item.dayKey === dayKey);
    const uploads = loveRecord?.uploads || {};
    const partnerKeys = Object.keys(partnerProfiles).filter(k => k !== ownKey);
    const revealed = Boolean(uploads[ownKey]?.dayKey === dayKey && partnerKeys.every(k => uploads[k]?.dayKey === dayKey));
    const ownUploaded = uploads[ownKey]?.dayKey === dayKey;
    const badgeClass = revealed ? "done" : ownUploaded ? "progress" : "";
    const badgeText = revealed ? "Revealed ✓" : ownUploaded ? "Waiting" : "Pending";
    const getUrl = key => lovePhotoUrls.get(`${dayKey}:${key}`) || "";
    [ownKey, ...(revealed ? partnerKeys : [])].filter(Boolean).forEach(key => {
      if (uploads[key]?.dayKey === dayKey) loadLovePhoto(dayKey, key);
    });
    const slots = [ownKey, ...partnerKeys].filter(Boolean).map(key => {
      const person = partnerProfiles[key];
      const uploaded = uploads[key]?.dayKey === dayKey;
      const visible = uploaded && (revealed || key === ownKey);
      const url = getUrl(key);
      const label = key === ownKey ? "You" : (person?.name || "Partner");
      const isYou = key === ownKey;
      if (visible && url && url !== "loading") {
        return `<button type="button" class="love-slot ${isYou ? "is-you" : ""} love-photo-open"
                        data-love-photo-src="${esc(url)}" data-love-photo-name="${esc(label)}"
                        aria-label="View ${esc(label)}'s photo">
          <img src="${esc(url)}" alt="${esc(label)}'s photo">
          <span class="love-slot-label">${esc(label)}</span>
        </button>`;
      }
      return `<div class="love-slot ${isYou ? "is-you" : ""}">
        <span class="love-slot-hint" aria-hidden="true">${uploaded ? (visible ? "…" : "🔒") : "♡"}</span>
        <span class="love-slot-label">${esc(label)}</span>
      </div>`;
    }).join("");

    return `
      <article class="challenge-card">
        <div class="challenge-card-head">
          <span class="challenge-icon" aria-hidden="true">❤️</span>
          <div class="challenge-head-copy">
            <h2>Love You Today</h2>
            <small>Share a photo — sky, food, anything</small>
          </div>
          <span class="challenge-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="love-widget">
          <p class="love-hint">${revealed
            ? "Both photos revealed — a little memory made today 🌸"
            : ownUploaded
              ? "Yours is in. Waiting for your partner to reveal theirs 🌸"
              : "Your photo stays hidden until you both upload 🌸"}</p>
          <div class="love-photos">${slots}</div>
          ${ownUploaded
            ? `<button class="love-upload" type="button" disabled>✓ Your photo is in</button>`
            : `<button class="love-upload" type="button" data-action="love-upload" data-id="${esc(assignment.id)}">Add your photo ♡</button>`}
        </div>
      </article>
    `;
  }

  function renderToday() {
    const [snap, water, love] = todayChallenges.sort((a, b) => {
      const order = { "send-snap": 0, "drink-water": 1, "love-you-today": 2 };
      return (order[a.challengeId] ?? 99) - (order[b.challengeId] ?? 99);
    });
    list.innerHTML = [
      snap && dailySnapCard(snap),
      water && dailyWaterCard(water),
      love && dailyLoveCard(love)
    ].filter(Boolean).join("");
  }

  /* ─── Custom challenges (received + sent) ────────── */
  function renderCustomSection() {
    if (!customAllChallenges.length) {
      customListsRoot.innerHTML = "";
      return;
    }
    const received = customAllChallenges.filter(i => i.recipientKey === ownKey);
    const sent = customAllChallenges.filter(i => i.author === user.uid);
    const pendingReceived = received.filter(i => i.status === "upcoming" || i.status === "in-progress");
    const activeSent = sent.filter(i => i.status === "upcoming" || i.status === "in-progress");
    const all = [
      ...pendingReceived.map(i => ({ item: i, received: true })),
      ...activeSent.map(i => ({ item: i, received: false }))
    ].sort((a, b) => Number(b.item.sentAtMs || b.item.createdAtMs || 0) - Number(a.item.sentAtMs || a.item.createdAtMs || 0));

    if (!all.length) {
      customListsRoot.innerHTML = "";
      return;
    }
    customListsRoot.innerHTML = `
      <h3 class="custom-section-title">From your partner & you</h3>
      <div class="custom-list">${all.map(({ item, received }) => customCard(item, received)).join("")}</div>
    `;
  }

  function customCard(item, received) {
    const kind = item.kind === "punishment" ? "punishment" : "challenge";
    const isPunishment = kind === "punishment";
    const status = item.status === "in-progress" ? "accepted"
      : item.status === "completed" ? "done"
      : item.status === "declined" ? "declined"
      : "pending";
    const tagText = { pending: "Pending", accepted: "Accepted", done: "Completed", declined: "Declined" }[status];
    const date = Number(item.sentAtMs || item.assignedAtMs || item.createdAtMs || 0);
    const deadline = item.deadlineAt ? new Date(item.deadlineAt) : null;
    const days = deadline ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000)) : null;
    const image = item.photoUrl
      ? `<img class="custom-photo" src="${esc(item.photoUrl)}" alt="Completion">`
      : item.telegramFileId
        ? `<img class="custom-photo" data-telegram-file-id="${esc(item.telegramFileId)}" data-telegram-mime="${esc(item.photoMimeType || "image/jpeg")}" alt="Completion">`
        : "";
    const actions = received && item.status === "upcoming"
      ? `<div class="custom-actions">
          <button class="custom-decline" data-custom-action="decline" data-id="${esc(item.id)}">Decline</button>
          <button class="custom-accept" data-custom-action="accept" data-id="${esc(item.id)}">Accept</button>
        </div>`
      : received && item.status === "in-progress"
        ? `<div class="custom-actions">
            <button class="custom-complete" data-custom-action="complete" data-id="${esc(item.id)}">Mark complete ♡</button>
          </div>`
        : !received && (item.status === "upcoming" || item.status === "in-progress")
          ? `<div class="custom-actions">
              <button class="custom-edit" data-custom-action="edit" data-id="${esc(item.id)}">Edit</button>
              <button class="custom-delete" data-custom-action="delete" data-id="${esc(item.id)}">Delete</button>
            </div>`
          : "";

    return `
      <article class="custom-card ${isPunishment ? "kind-punishment" : ""}">
        <div class="custom-head">
          <span class="custom-icon" aria-hidden="true">${isPunishment ? "😈" : "💝"}</span>
          <h3 class="custom-title">${esc(item.title || (isPunishment ? "Punishment" : "Challenge"))}</h3>
          <span class="custom-tag ${status}">${tagText}</span>
        </div>
        ${item.description ? `<p class="custom-desc">${esc(item.description)}</p>` : ""}
        <div class="custom-meta">
          <span>${received ? "From partner" : "You sent"}${date ? ` · ${esc(new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }))}` : ""}</span>
          ${days !== null ? `<span>${days > 0 ? `${days} day${days === 1 ? "" : "s"} left` : "Due today"}</span>` : ""}
        </div>
        ${item.note ? `<p class="custom-note">${esc(item.note)}</p>` : ""}
        ${image}
        ${actions}
      </article>
    `;
  }

  /* ─── History ────────────────────────────────────── */
  function renderHistory() {
    const filters = `
      <div class="history-filter" role="tablist">
        ${[
          ["all", "All"],
          ["snap", "📸 Snap"],
          ["water", "💧 Water"],
          ["love", "❤️ Love"]
        ].map(([key, label]) => `
          <button type="button" data-history-filter="${key}" class="${historyFilter === key ? "selected" : ""}">${label}</button>
        `).join("")}
      </div>`;

    const oneMonthAgo = Date.now() - 30 * 86400000;

    // Group everything by dayKey
    const days = new Map();
    const ensureDay = (key) => {
      if (!days.has(key)) days.set(key, { snap: null, water: null, love: null, custom: [] });
      return days.get(key);
    };

    if (historyFilter === "all" || historyFilter === "snap") {
      assignments
        .filter(item => item.challengeId === "send-snap" || item.id?.endsWith("-send-snap"))
        .filter(item => (item.completedBy || []).length > 0)
        .filter(item => (item.completedAt?.toMillis?.() || Date.parse(`${item.challengeDate}T12:00:00`)) > oneMonthAgo)
        .forEach(item => {
          const bucket = ensureDay(item.challengeDate);
          bucket.snap = item;
        });
    }
    if (historyFilter === "all" || historyFilter === "water") {
      const waterByDay = new Map();
      waterTrackers.forEach(t => {
        if (!t.dayKey || t.dayKey >= dayKey) return;
        const dayTime = Date.parse(`${t.dayKey}T12:00:00`);
        if (dayTime < oneMonthAgo) return;
        if (!waterByDay.has(t.dayKey)) waterByDay.set(t.dayKey, {});
        const prev = waterByDay.get(t.dayKey)[t.profileKey];
        if (!prev || Number(t.updatedAtMs || 0) > Number(prev.updatedAtMs || 0)) {
          waterByDay.get(t.dayKey)[t.profileKey] = t;
        }
      });
      waterByDay.forEach((counts, key) => {
        const bucket = ensureDay(key);
        bucket.water = counts;
      });
    }
    if (historyFilter === "all" || historyFilter === "love") {
      loveUploads
        .filter(r => r.dayKey && r.dayKey < dayKey && Object.values(r.uploads || {}).some(u => u?.dayKey === r.dayKey))
        .filter(r => Date.parse(`${r.dayKey}T12:00:00`) > oneMonthAgo)
        .forEach(r => {
          const bucket = ensureDay(r.dayKey);
          bucket.love = r;
        });
    }

    const sortedDays = [...days.entries()]
      .filter(([, bucket]) => bucket.snap || bucket.water || bucket.love)
      .sort((a, b) => b[0].localeCompare(a[0]));

    const filterSection = `
      ${filters}
      ${sortedDays.length
        ? sortedDays.map(([key, bucket]) => historyDay(key, bucket)).join("")
        : `<div class="challenge-empty"><span class="empty-heart">♡</span>Nothing here yet. Start today's challenges!</div>`}
    `;

    // Custom completed (all time) shown at the bottom of All view
    if (historyFilter === "all") {
      const completedCustom = customAllChallenges.filter(i => i.status === "completed");
      const customHtml = completedCustom.length ? `
        <h3 class="custom-section-title">Completed challenges & punishments</h3>
        <div class="custom-list">${completedCustom.map(item => customCard(item, item.recipientKey === ownKey)).join("")}</div>
      ` : "";
      list.innerHTML = filterSection + customHtml;
    } else {
      list.innerHTML = filterSection;
    }

    list.querySelectorAll("[data-history-filter]").forEach(btn => {
      btn.onclick = () => { historyFilter = btn.dataset.historyFilter; render(); };
    });
    hydrateTelegramImages();
  }

  function historyDay(key, bucket) {
    const dateLabel = new Date(`${key}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const rows = [];

    if (bucket.snap) {
      const who = (bucket.snap.completedBy || []).map(p => esc(p.name || "Us")).join(" & ");
      rows.push(`
        <div class="history-row">
          <span class="history-icon" aria-hidden="true">📸</span>
          <span class="history-text">Snap sent<small>${who || "Both partners"}</small></span>
          <span class="history-mark">✓</span>
        </div>`);
    }
    if (bucket.water) {
      Object.entries(partnerProfiles).forEach(([key2, person]) => {
        const count = Math.max(0, Math.min(8, Number(bucket.water[key2]?.count || 0)));
        const done = count >= 8;
        rows.push(`
          <div class="history-row ${done ? "" : "is-missed"}">
            <span class="history-icon" aria-hidden="true">💧</span>
            <span class="history-text">${esc(person.name)} · ${count}/8 glasses<small>${done ? "Goal reached" : "Goal missed"}</small></span>
            <span class="history-mark">${done ? "✓" : "—"}</span>
          </div>`);
      });
    }
    if (bucket.love) {
      const uploads = bucket.love.uploads || {};
      const keys = Object.keys(partnerProfiles);
      const revealed = keys.length > 1 && keys.every(k => uploads[k]?.dayKey === bucket.love.dayKey);
      const photos = keys.map(k => {
        const person = partnerProfiles[k];
        const uploaded = uploads[k]?.dayKey === bucket.love.dayKey;
        const visible = uploaded && (k === ownKey || revealed);
        const cacheKey = `${bucket.love.dayKey}:${k}`;
        if (visible) loadLovePhoto(bucket.love.dayKey, k);
        const url = lovePhotoUrls.get(cacheKey) || "";
        if (visible && url && url !== "loading") {
          return `<button type="button" class="love-photo-open" data-love-photo-src="${esc(url)}" data-love-photo-name="${esc(person?.name || "Partner")}" aria-label="View photo"><img src="${esc(url)}" alt="${esc(person?.name || "Partner")}'s photo"></button>`;
        }
        return `<div aria-label="No photo"><div style="width:100%;aspect-ratio:1;border-radius:10px;background:#f7eff3;display:grid;place-items:center;color:#c9a8b8;font-size:22px;">${uploaded ? "🔒" : "♡"}</div></div>`;
      }).join("");
      rows.push(`
        <div class="history-row">
          <span class="history-icon" aria-hidden="true">❤️</span>
          <span class="history-text">Love You Today<small>${revealed ? "Both shared ♡" : "Memory saved"}</small></span>
          <span class="history-mark">✓</span>
        </div>
        <div class="history-photos">${photos}</div>
      `);
    }

    return `
      <article class="history-day">
        <div class="history-day-head"><strong>${esc(dateLabel)}</strong></div>
        <div class="history-day-list">${rows.join("")}</div>
      </article>
    `;
  }

  /* ─── Actions (clicks) ───────────────────────────── */
  function bindActions() {
    const handleActionClick = async event => {
      const lovePhoto = event.target.closest?.("[data-love-photo-src]");
      if (lovePhoto && el.contains(lovePhoto)) {
        openLovePhotoViewer(lovePhoto.dataset.lovePhotoSrc, lovePhoto.dataset.lovePhotoName || "Love You Today");
        return;
      }
      const customButton = event.target.closest?.("[data-custom-action]");
      if (customButton && el.contains(customButton)) {
        const item = customAllChallenges.find(c => c.id === customButton.dataset.id);
        if (!item) return;
        const action = customButton.dataset.customAction;
        if (action === "edit") return openGiveModal(item);
        if (action === "complete") return openCompletionModal(item.id, item);
        if (action === "delete" && !confirm("Delete this? This cannot be undone.")) return;
        customButton.disabled = true;
        try {
          await transitionCustomChallenge(item.id, { uid: user.uid, profileKey: ownKey, name: profile.name }, action);
          if (action === "delete") toast("Deleted.");
          if (action === "accept") { void notifyPartnerSafely(ownKey, "challenge", `${profile.name} accepted: ${item.title}`.slice(0, 240), `${item.id}-accepted`, "challenges"); toast("Accepted ♡"); }
          if (action === "decline") { void notifyPartnerSafely(ownKey, "challenge", `${profile.name} declined: ${item.title}`.slice(0, 240), `${item.id}-declined`, "challenges"); toast("Declined."); }
        } catch (error) { toast(error.message || "Could not update."); customButton.disabled = false; }
        return;
      }
      const button = event.target.closest?.("[data-action]");
      if (!button || !el.contains(button)) return;
      const assignmentId = button.dataset.id;
      const assignment = assignments.find(i => i.id === assignmentId);
      const challenge = todayChallenges.find(i => i.id === assignmentId);
      if (!assignment && !challenge) return toast("Could not identify this.");
      const resolved = assignment || assignmentFor(challenge);
      button.disabled = true;
      try {
        const action = button.dataset.action;
        if (action === "water-add" || action === "water-remove") {
          const delta = action === "water-add" ? 1 : -1;
          const next = await changeDailyWaterProgress(dayKey, { uid: user.uid, profileKey: ownKey, name: profile.name }, delta, waterCountFor(ownKey));
          const trackerId = `water-${dayKey}-${ownKey}`;
          const local = waterTrackers.find(i => i.id === trackerId);
          if (local) { local.count = next; local.updatedAtMs = Date.now(); }
          else waterTrackers.push({ id: trackerId, type: "waterChallenge", dayKey, profileKey: ownKey, uid: user.uid, name: profile.name, count: next, updatedAtMs: Date.now() });
          scheduleRender();
          if (delta > 0 && next === 8) void notifyPartnerSafely(ownKey, "challenge", `${profile.name} completed today's water goal.`, `water-${dayKey}-${ownKey}`, "challenges");
          toast(next >= 8 ? "Daily water goal complete! 💧" : `Glass ${next}/8 saved.`);
        } else if (action === "love-upload") {
          button.disabled = false;
          openLovePhotoModal();
        } else if (action === "snap-complete") {
          await completeChallengeAssignment(assignmentId, { uid: user.uid, profileKey: ownKey, name: profile.name }, "Sent today's Snap 📸", "");
          void notifyPartnerSafely(ownKey, "challenge", `${profile.name} sent today's Snap.`, `${assignmentId}-completed`, "challenges");
          triggerCompletionSplash();
          toast("Snap marked ✓");
        }
      } catch (error) {
        console.error(error);
        toast(error.message || "Could not update this.");
        button.disabled = false;
      }
    };
    el.addEventListener("click", handleActionClick);
    removeActionsListener = () => el.removeEventListener("click", handleActionClick);
  }

  function triggerCompletionSplash() {
    const splash = document.createElement("div");
    splash.className = "completion-splash";
    splash.innerHTML = `<div class="splash-heart">❤️</div>`;
    document.body.appendChild(splash);
    setTimeout(() => splash.remove(), 1000);
  }

  function openLovePhotoViewer(src, name) {
    modalRoot.innerHTML = `
      <div class="love-photo-viewer" role="dialog" aria-modal="true" aria-label="${esc(name)} photo">
        <button type="button" class="love-viewer-close" aria-label="Close">×</button>
        <img src="${esc(src)}" alt="${esc(name)}'s photo">
        <span>${esc(name)} · Love You Today</span>
      </div>`;
    const viewer = modalRoot.querySelector(".love-photo-viewer");
    viewer.querySelector(".love-viewer-close").onclick = () => { modalRoot.innerHTML = ""; };
    viewer.onclick = e => { if (e.target === viewer) modalRoot.innerHTML = ""; };
  }

  function openCompletionModal(assignmentId, assignment) {
    modalRoot.innerHTML = `
      <div class="challenge-modal" role="dialog" aria-modal="true">
        <section class="challenge-modal-card">
          <header class="challenge-modal-head">
            <h2>Complete</h2>
            <button type="button" class="challenge-modal-close" data-close-modal aria-label="Close">×</button>
          </header>
          <p style="margin:0 0 12px;font-size:13px;color:#5a3445;font-weight:700;">${esc(assignment.title)}</p>
          <form class="challenge-form" id="challenge-complete-form">
            <label>Note (optional)
              <textarea name="note" maxlength="500" placeholder="Add a little note…"></textarea>
            </label>
            <label>Photo (optional)
              <input type="file" name="photo" accept="image/*">
            </label>
            <img class="challenge-photo-preview hidden" id="challenge-photo-preview" alt="Preview">
            <div class="challenge-modal-actions">
              <button type="button" class="modal-secondary" data-close-modal>Cancel</button>
              <button type="submit" class="modal-primary">Save ♡</button>
            </div>
          </form>
        </section>
      </div>
    `;
    const dialog = modalRoot.querySelector(".challenge-modal");
    const form = $("#challenge-complete-form", modalRoot);
    const image = $("#challenge-photo-preview", modalRoot);
    let selectedPhoto = null;
    dialog.querySelectorAll("[data-close-modal]").forEach(b => b.onclick = () => modalRoot.innerHTML = "");
    dialog.onclick = e => { if (e.target === dialog) modalRoot.innerHTML = ""; };
    form.elements.photo.addEventListener("change", () => {
      selectedPhoto = form.elements.photo.files[0] || null;
      if (!selectedPhoto) { image.classList.add("hidden"); image.removeAttribute("src"); return; }
      const reader = new FileReader();
      reader.onload = () => { image.src = reader.result; image.classList.remove("hidden"); };
      reader.readAsDataURL(selectedPhoto);
    });
    form.onsubmit = async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Saving…";
      try {
        let photoMetadata = {};
        if (selectedPhoto) {
          const timestamp = new Date().toLocaleString();
          const result = await sendToTelegram(selectedPhoto, `Challenge Photo · ${profile.name} · ${timestamp}`, new Date().toISOString().slice(0, 10), ownKey, { storeForReveal: false });
          photoMetadata = { ...telegramMediaReferences(result), photoMimeType: telegramUploadMimeType(selectedPhoto), photoUrl: "" };
        }
        await transitionCustomChallenge(assignmentId, { uid: user.uid, profileKey: ownKey, name: profile.name }, "complete", { note: form.elements.note?.value?.trim() || "", ...photoMetadata });
        void notifyPartnerSafely(ownKey, "challenge", `${profile.name} completed a challenge.`, `${assignmentId}-completed`, "challenges");
        triggerCompletionSplash();
        modalRoot.innerHTML = "";
        toast("Completed ♡");
      } catch (error) {
        console.error(error);
        toast(error.message || "Could not save.");
        submit.disabled = false;
        submit.textContent = "Save ♡";
      }
    };
  }

  function openLovePhotoModal() {
    modalRoot.innerHTML = `
      <div class="challenge-modal" role="dialog" aria-modal="true">
        <section class="challenge-modal-card">
          <header class="challenge-modal-head">
            <h2>Send a little love 🌸</h2>
            <button type="button" class="challenge-modal-close" data-close-love aria-label="Close">×</button>
          </header>
          <p style="margin:0 0 12px;font-size:12px;color:#8c6a7c;">Your photo stays hidden until your partner uploads theirs today too.</p>
          <form class="challenge-form" id="love-photo-form">
            <label>Today's photo
              <input type="file" name="photo" accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.avif,.tif,.tiff,.gif,.bmp" required>
            </label>
            <img class="challenge-photo-preview hidden" alt="Preview">
            <div class="challenge-modal-actions">
              <button type="button" class="modal-secondary" data-close-love>Cancel</button>
              <button type="submit" class="modal-primary">Send ♡</button>
            </div>
          </form>
        </section>
      </div>`;
    const form = $("#love-photo-form", modalRoot);
    const dialog = modalRoot.querySelector(".challenge-modal");
    const image = form.querySelector("img");
    let previewUrl = "";
    const close = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ""; modalRoot.innerHTML = ""; };
    dialog.querySelectorAll("[data-close-love]").forEach(b => b.onclick = close);
    dialog.onclick = e => { if (e.target === dialog) close(); };
    form.elements.photo.onchange = () => {
      const file = form.elements.photo.files[0];
      if (!file) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      image.src = previewUrl;
      image.classList.remove("hidden");
    };
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
        lovePhotoMissing.delete(`${dayKey}:${ownKey}`);
        loveRetryCounts.clear();
        for (const [k, v] of lovePhotoUrls) {
          if (k.startsWith(`${dayKey}:`)) {
            if (v !== "loading") URL.revokeObjectURL(v);
            lovePhotoUrls.delete(k);
          }
        }
        scheduleRender();
        void notifyPartnerSafely(ownKey, "challenge", `${profile.name} sent a secret love photo. Add yours to reveal them both 🌸`, `love-${dayKey}-${ownKey}`, "challenges");
        close();
        toast("Waiting for your partner ♡");
      } catch (error) {
        console.error(error);
        toast(error.message || "Could not send.");
        button.disabled = false;
        button.textContent = "Send ♡";
      }
    };
  }

  /* ─── Firestore loading ──────────────────────────── */
  async function prepareTodayChallenges() {
    try {
      const prepared = await Promise.all(todayChallenges.map(challenge => ensureChallengeAssignment(challenge)));
      const current = new Map(prepared.map(a => [a.id, a]));
      assignments.forEach(a => current.set(a.id, a));
      assignments = [...current.values()];
      assignmentsReady = true;
      reconcileTodayPoints();
      render();
    } catch (error) {
      console.error("Could not prepare today's challenges:", error);
      if (isCurrent()) {
        assignmentsReady = true;
        assignmentsError = true;
        list.innerHTML = `<div class="challenge-empty">Could not load challenges. <button type="button" id="retry-challenges" style="margin-left:6px;padding:4px 10px;border-radius:8px;border:0;background:#8f315d;color:#fff;font-weight:700;">Retry</button></div>`;
        $("#retry-challenges", list).onclick = () => { assignmentsReady = false; assignmentsError = false; render(); prepareTodayChallenges(); };
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
    list.innerHTML = `<div class="challenge-empty">Could not load challenges. <button type="button" id="retry-challenges" style="margin-left:6px;padding:4px 10px;border-radius:8px;border:0;background:#8f315d;color:#fff;font-weight:700;">Retry</button></div>`;
    $("#retry-challenges", list).onclick = () => { assignmentsError = false; assignmentsReady = false; disposeChallenges(); window.App?.navigate("challenges"); };
  }, historyStartDay, 100);

  stopWaterChallenges = watchItems("waterChallenge", items => {
    if (!isCurrent()) return;
    waterTrackers = items;
    waterTrackersReady = true;
    reconcileTodayPoints();
    scheduleRender();
  }, error => console.error("Water sync failed:", error), 120);

  stopCustomChallenges = watchItems("customChallenge", items => {
    if (!isCurrent()) return;
    customAllChallenges = items;
    scheduleRender();
  }, error => console.error("Custom challenges failed:", error));

  stopLoveChallenges = watchItems("loveYouChallenge", items => {
    if (!isCurrent()) return;
    loveUploads = items;
    reconcileTodayPoints();
    scheduleRender();
  }, error => console.error("Love sync failed:", error), 90);

  function onProfilesUpdated() { partnerProfiles = APP_CONFIG.profiles; render(); }
  removeProfilesListener = () => window.removeEventListener("couple-profiles-updated", onProfilesUpdated);
  window.addEventListener("couple-profiles-updated", onProfilesUpdated);

  function onChallengeEscape(event) {
    if (event.key === "Escape") {
      modalRoot.querySelector("[data-close-love], [data-close-modal]")?.click();
      giveModalRoot.querySelector("[data-close-give]")?.click();
    }
  }
  removeEscapeListener = () => window.removeEventListener("keydown", onChallengeEscape);
  window.addEventListener("keydown", onChallengeEscape);

  function hydrateTelegramImages() {
    el.querySelectorAll("img[data-telegram-file-id]").forEach(image => {
      getTelegramMediaUrl(image.dataset.telegramFileId, image.dataset.telegramMime || "image/jpeg")
        .then(url => { if (image.isConnected) image.src = url; })
        .catch(error => console.error("Photo could not load:", error));
    });
  }

  function scheduleRender() {
    if (queuedChallengeRender) return;
    queuedChallengeRender = requestAnimationFrame(() => {
      queuedChallengeRender = 0;
      render();
    });
  }

  function render() {
    if (!isCurrent()) return;
    renderScoreboard();
    if (selectedTab === "today") {
      if (assignmentsError) {
        list.innerHTML = `<div class="challenge-empty">Could not load. Please try again.</div>`;
        customListsRoot.innerHTML = "";
        return;
      }
      if (!assignmentsReady) {
        list.innerHTML = `<div class="challenge-empty">Loading…</div>`;
        customListsRoot.innerHTML = "";
        return;
      }
      renderToday();
      renderCustomSection();
      hydrateTelegramImages();
    } else {
      renderHistory();
    }
  }

  bindActions();
  prepareTodayChallenges();
}

export function disposeChallenges() {
  challengeRenderToken++;
  clearTimeout(dayRolloverTimer);
  dayRolloverTimer = null;
  stopChallenges?.(); stopChallenges = null;
  stopLoveChallenges?.(); stopLoveChallenges = null;
  stopCustomChallenges?.(); stopCustomChallenges = null;
  stopWaterChallenges?.(); stopWaterChallenges = null;
  if (queuedChallengeRender) cancelAnimationFrame(queuedChallengeRender);
  queuedChallengeRender = 0;
  removeProfilesListener?.(); removeProfilesListener = null;
  removeActionsListener?.(); removeActionsListener = null;
  removeEscapeListener?.(); removeEscapeListener = null;
  for (const url of lovePhotoUrls.values()) if (url !== "loading") URL.revokeObjectURL(url);
  lovePhotoUrls.clear();
  loveRetryCounts.clear();
  lovePhotoMissing.clear();
}