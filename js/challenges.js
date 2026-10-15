import { $, esc, toast, todayKey, scheduleDubaiDayRollover } from "./utils.js";
import {
  ensureChallengeAssignment,
  watchChallengeAssignments,
  watchItems,
  completeChallengeAssignment,
  notifyPartnerSafely,
  addItem,
  transitionCustomChallenge,
  changeDailyWaterProgress
} from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { findProfileForAuthor, getProfileKey } from "./profile-data.js";
import { challengeDays } from "./challenge-bank.js";
import { getTelegramMediaUrl, sendToTelegram, telegramMediaReferences, telegramUploadMimeType } from "../src/services/telegramService.js";

let stopChallenges = null, stopCustomChallenges = null, stopWaterChallenges = null;
let dayRolloverTimer = null, challengeRenderToken = 0, queuedChallengeRender = 0, countdownTimer = null;
let customAllChallenges = [], waterTrackers = [], waterTrackersReady = false;
let removeProfilesListener = null, removeEscapeListener = null, removeActionsListener = null;

function formatCountdown(deadlineAt) {
  if (!Number.isFinite(deadlineAt) || deadlineAt <= 0) return "Deadline not set";
  const remaining = Math.max(0, deadlineAt - Date.now());
  if (!remaining) return "Due now";
  const seconds = Math.floor(remaining / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `Due in ${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(rest).padStart(2, "0")}s`;
}

export function renderChallenges(el, user, profile) {
  disposeChallenges();
  customAllChallenges = [];
  waterTrackers = [];
  waterTrackersReady = false;

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
  let historyFilter = "all"; // all | snap | water
  let customFilter = "all"; // all | received | sent | active | completed
  let hubView = "challenges";

  el.innerHTML = `
    <section class="challenge-page">
      <header class="challenge-page-head">
        <span class="challenge-sparkle" aria-hidden="true">✨</span>
        <h1>Challenges</h1>
      </header>

      <button type="button" class="give-challenge-btn" id="give-challenge-btn" aria-haspopup="dialog" aria-controls="give-challenge-modal-root">
        <span class="give-icon" aria-hidden="true">💌</span>
        <span class="give-copy">
          <strong>Give a Challenge / Punishment</strong>
          <small>Send something sweet (or spicy) to your partner</small>
        </span>
        <span class="give-arrow" aria-hidden="true">›</span>
      </button>

      <div id="challenge-list"></div>
      <div id="challenge-modal-root"></div>
      <div id="give-challenge-modal-root"></div>
    </section>
  `;

  const list = $("#challenge-list", el);
  const modalRoot = $("#challenge-modal-root", el);
  const giveModalRoot = $("#give-challenge-modal-root", el);

  /* ─── Give Challenge / Punishment ───────────────── */
  function openGiveModal(editing = null) {
    giveModalRoot.querySelector(".challenge-compose-layer")?.remove();
    const editingKind = editing?.kind === "punishment" ? "punishment" : "challenge";
    const composeRoot = document.createElement("div");
    composeRoot.className = "challenge-compose-layer";
    composeRoot.innerHTML = `
      <div class="challenge-modal challenge-compose-modal" role="dialog" aria-modal="true">
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
    giveModalRoot.append(composeRoot);

    const form = $("#give-challenge-form", composeRoot);
    let kind = editingKind;

    composeRoot.querySelectorAll("[data-close-give]").forEach(b => b.onclick = () => composeRoot.remove());
    composeRoot.querySelector(".challenge-modal").onclick = event => {
      if (event.target === composeRoot.querySelector(".challenge-modal")) composeRoot.remove();
    };
    form.elements.title?.focus();

    form.querySelectorAll("[data-kind]").forEach(button => {
      button.onclick = () => {
        kind = button.dataset.kind;
        form.querySelectorAll("[data-kind]").forEach(b => b.classList.toggle("selected", b === button));
        const submit = form.querySelector('[type="submit"]');
        submit.classList.toggle("punishment", kind === "punishment");
        submit.textContent = `${editing ? "Save" : "Send"} ${kind === "punishment" ? "Punishment" : "Challenge"}`;
        composeRoot.querySelector("h2").textContent = `${editing ? "Edit" : "Send"} ${kind === "punishment" ? "Punishment" : "Challenge"}`;
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
          composeRoot.remove();
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
        composeRoot.remove();
      } catch (error) {
        console.error(error);
        toast(error.message || "Could not send.");
        submit.disabled = false;
      }
    };
  }

  function openChallengeHub() {
    hubView = "challenges";
    giveModalRoot.innerHTML = `
      <section class="challenge-hub-page" aria-labelledby="challenge-hub-title">
        <section class="challenge-modal-card challenge-hub-card">
          <header class="challenge-modal-head">
            <h2 id="challenge-hub-title">Our challenges ♡</h2>
            <button type="button" class="challenge-modal-close" data-close-hub aria-label="Close">×</button>
          </header>
          <div id="challenge-hub-summary"></div>
          <div class="challenge-hub-views" role="tablist" aria-label="Challenge views">
            <button type="button" data-hub-view="challenges" aria-selected="true">Challenges</button>
            <button type="button" data-hub-view="history" aria-selected="false">History</button>
          </div>
          <div id="custom-assignment-lists"></div>
          <div id="challenge-hub-history" hidden></div>
          <button type="button" class="custom-empty-cta challenge-hub-create" data-open-give>＋ Give a challenge or punishment</button>
        </section>
      </section>`;
    giveModalRoot.querySelector("[data-close-hub]").onclick = () => { giveModalRoot.innerHTML = ""; };
    giveModalRoot.querySelectorAll("[data-hub-view]").forEach(button => {
      button.onclick = () => {
        hubView = button.dataset.hubView;
        giveModalRoot.querySelectorAll("[data-hub-view]").forEach(tab => tab.setAttribute("aria-selected", String(tab === button)));
        renderChallengeHub();
      };
    });
    giveModalRoot.querySelector("[data-open-give]").onclick = () => openGiveModal();
    renderChallengeHub();
  }
  $("#give-challenge-btn", el).onclick = openChallengeHub;

  /* ─── Assignment / water helpers ────────────────── */
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

  function reconcileTodayPoints() {
    if (!assignmentsReady) return;
    const actor = { uid: user.uid, profileKey: ownKey, name: profile.name };
    const completedRoutines = [
      ...(waterCountFor(ownKey) >= 8 ? [[`${dayKey}-drink-water`, "Reached today's 8-glass water goal."]] : [])
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

  /* ─── The daily challenge cards ─────────────────── */
  function dailySnapCard(challenge) {
    const assignment = assignmentFor(challenge);
    const completedBy = assignment.completedBy || [];
    const people = Object.entries(partnerProfiles);
    const allDone = people.length > 0 && people.every(([key, person]) => completedBy.some(p =>
      p.profileKey === key || (person.authUid && p.uid === person.authUid)));
    return `
      <article class="challenge-card snap-challenge-card">
        <div class="challenge-card-head">
          <span class="snap-brand-mark" aria-label="Snapchat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.1c-2.1 0-3.7 1.7-3.7 4.2 0 .9.1 1.6.2 2.2-.5.4-1.2.1-1.9-.3-.6-.3-1.1-.6-1.4-.2-.4.5.1 1 .7 1.3.7.4 1.6.7 2.2.6-.1.8-.5 1.5-1.3 2.2-.6.5-1.3.8-2.1 1-.6.2-.7.7-.1 1 .6.3 1.6.3 2.1.8.4.4.4 1.1 1.1 1.2.6.1 1-.3 1.6-.2.7.1 1.4.8 2.6.8s1.9-.7 2.6-.8c.6-.1 1 .3 1.6.2.7-.1.7-.8 1.1-1.2.5-.5 1.5-.5 2.1-.8.6-.3.5-.8-.1-1-.8-.2-1.5-.5-2.1-1-.8-.7-1.2-1.4-1.3-2.2.6.1 1.5-.2 2.2-.6.6-.3 1.1-.8.7-1.3-.3-.4-.8-.1-1.4.2-.7.4-1.4.7-1.9.3.1-.6.2-1.3.2-2.2 0-2.5-1.6-4.2-3.7-4.2Z"/></svg></span>
          <div class="challenge-head-copy">
            <h2>Daily Snap</h2>
            <small>Share your daily moments with each other 💗</small>
          </div>
        </div>
        <div class="snap-widget">
          <div class="snap-people-grid">
            ${people.map(([key, person]) => {
              const sent = completedBy.some(p => p.profileKey === key || (person.authUid && p.uid === person.authUid));
              const isMine = key === ownKey;
              const avatar = person.avatar ? `<img src="${esc(person.avatar)}" alt="">` : esc((person.name || "♡")[0]);
              return `<section class="snap-person-card ${sent ? "is-sent" : "is-pending"}">
                <header class="snap-person-head"><span class="snap-brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.1c-2.1 0-3.7 1.7-3.7 4.2 0 .9.1 1.6.2 2.2-.5.4-1.2.1-1.9-.3-.6-.3-1.1-.6-1.4-.2-.4.5.1 1 .7 1.3.7.4 1.6.7 2.2.6-.1.8-.5 1.5-1.3 2.2-.6.5-1.3.8-2.1 1-.6.2-.7.7-.1 1 .6.3 1.6.3 2.1.8.4.4.4 1.1 1.1 1.2.6.1 1-.3 1.6-.2.7.1 1.4.8 2.6.8s1.9-.7 2.6-.8c.6-.1 1 .3 1.6.2.7-.1.7-.8 1.1-1.2.5-.5 1.5-.5 2.1-.8.6-.3.5-.8-.1-1-.8-.2-1.5-.5-2.1-1-.8-.7-1.2-1.4-1.3-2.2.6.1 1.5-.2 2.2-.6.6-.3 1.1-.8.7-1.3-.3-.4-.8-.1-1.4.2-.7.4-1.4.7-1.9.3.1-.6.2-1.3.2-2.2 0-2.5-1.6-4.2-3.7-4.2Z"/></svg></span><strong>${esc(person.name || "Partner")}</strong><span class="snap-status-pill ${sent ? "sent" : "pending"}">${sent ? "✓ Sent" : "◷ Not Sent"}</span></header>
                <div class="snap-person-state"><span class="snap-avatar">${avatar}</span><div class="snap-state-copy"><strong>${sent ? "Snap sent today" : "Snap not sent yet"}</strong><small>${sent ? (isMine ? "You're all caught up" : "Your partner is all caught up") : (isMine ? "Send your daily moment" : "Waiting for your partner")}</small></div>
                  ${isMine && !sent ? `<button type="button" class="snap-send-button" data-action="snap-complete" data-id="${esc(assignment.id)}">Send Snap</button>` : ""}
                </div>
              </section>`;
            }).join("")}
          </div>
          <p class="snap-track-note"><span></span>💗 Track each person separately<span></span></p>
          ${allDone ? `<div class="water-celebrate">You both sent today's Snap 💛</div>` : ""}
        </div>
      </article>
    `;
  }

  function dailyWaterCard(challenge) {
    const assignment = assignmentFor(challenge);
    const ownCount = waterCountFor(ownKey);
    const otherKey = Object.keys(APP_CONFIG.profiles).find(k => k !== ownKey);
    const partnerCount = waterCountFor(otherKey);
    const totalCount = ownCount + partnerCount;
    const bothDone = ownCount >= 8 && partnerCount >= 8;
    return `
      <article class="challenge-card water-challenge-card">
        <div class="challenge-card-head">
          <span class="water-heading-icon" aria-hidden="true">💧</span>
          <div class="challenge-head-copy">
            <h2>Drink Water</h2>
            <small>8 glasses a day, together 💗</small>
          </div>
          <span class="water-daily-total"><span>💧</span> ${totalCount} / 16 glasses</span>
        </div>
        <div class="water-widget">
          <div class="water-bottles">
            ${Object.entries(partnerProfiles).map(([key, person]) => {
              const count = key === ownKey ? ownCount : partnerCount;
              const isMine = key === ownKey;
              const glassAsset = key.toLowerCase().includes("shaz") ? "Girl.png" : "Boy.png";
              return `<section class="water-person-progress ${isMine ? "is-mine" : "is-partner"}" aria-label="${esc(person.name)}: ${count} of 8 glasses">
                <div class="water-person-title"><strong>${esc(person.name)}${isMine ? " · You" : ""}</strong><span aria-hidden="true">${key.toLowerCase().includes("shaz") ? "💗" : "💙"}</span></div>
                <div class="water-person-main">
                  <div class="water-glass-wrap" aria-hidden="true"><div class="water-glass-fill" style="--water-level:${count / 8 * 100}%"></div><img src="./Asset/${glassAsset}" alt=""></div>
                  <div class="water-person-details"><div class="water-count"><strong>${count}</strong><span>/ 8<br>glasses</span></div>
                    <div class="water-progress-track" role="progressbar" aria-label="${esc(person.name)} daily water progress" aria-valuemin="0" aria-valuemax="8" aria-valuenow="${count}"><span style="width:${count / 8 * 100}%"></span></div>
                    <small class="water-progress-caption">${count >= 8 ? "Daily goal complete ✓" : `${8 - count} glasses to go`}</small>
                  </div>
                </div>
                ${isMine ? `<div class="water-controls"><button type="button" class="water-remove" data-action="water-remove" data-id="${esc(assignment.id)}" aria-label="Remove one glass" ${!waterTrackersReady || !assignmentsReady || ownCount <= 0 ? "disabled" : ""}>−</button><button type="button" class="water-add" data-action="water-add" data-id="${esc(assignment.id)}" ${!waterTrackersReady || !assignmentsReady || ownCount >= 8 ? "disabled" : ""}>＋ Add a glass</button></div>` : ""}
              </section>`;
            }).join("")}
          </div>
          ${bothDone ? `<div class="water-celebrate">Hydrated together 💧✨</div>` : ""}
        </div>
        <p class="water-together-note"><span></span>One glass at a time 💧<span></span></p>
      </article>
    `;
  }

  function renderToday() {
    const [snap, water] = todayChallenges;
    list.innerHTML = [
      snap && dailySnapCard(snap),
      water && dailyWaterCard(water)
    ].filter(Boolean).join("");
  }

  function renderChallengeSummary() {
    const keys = Object.keys(partnerProfiles);
    const otherKey = keys.find(key => key !== ownKey) || "";
    const rows = keys.map(key => {
      const person = partnerProfiles[key] || APP_CONFIG.profiles[key] || {};
      const uid = person.authUid || "";
      const received = customAllChallenges.filter(item => item.recipientKey === key || (!item.recipientKey && item.authorKey === otherKey && key === ownKey));
      const accepted = received.filter(item => item.status === "in-progress" || item.status === "completed" ||
        item.acceptedBy === uid || (item.actions || []).some(action => action.profileKey === key && action.status === "accepted"));
      const challenges = received.filter(item => item.kind !== "punishment");
      const punishments = received.filter(item => item.kind === "punishment");
      const acceptedChallenges = accepted.filter(item => item.kind !== "punishment");
      const acceptedPunishments = accepted.filter(item => item.kind === "punishment").length;
      const avatar = person.avatar
        ? `<img src="${esc(person.avatar)}" alt="">`
        : `<span aria-hidden="true">${esc((person.name || "♡").slice(0, 1))}</span>`;
      return `<article class="challenge-summary-person"><div class="challenge-summary-person-head"><span class="challenge-summary-avatar">${avatar}</span><strong>${esc(person.name || "Partner")}</strong></div><div class="challenge-summary-stats"><span><b>${challenges.length}</b> challenges received</span><span><b>${punishments.length}</b> punishments received</span><span><b>${acceptedChallenges.length}</b> challenges accepted</span><span><b>${acceptedPunishments}</b> punishments accepted</span></div></article>`;
    }).join("");
    const summary = $("#challenge-hub-summary", giveModalRoot);
    if (summary) summary.innerHTML = `<section class="challenge-summary-card" aria-label="Challenge summary"><p class="custom-eyebrow">A LITTLE CHECK-IN</p><h3>Our challenge story</h3><div class="challenge-summary-people">${rows}</div></section>`;
  }

  function renderChallengeHub() {
    const hub = giveModalRoot.querySelector(".challenge-hub-page");
    if (!hub) return;
    renderChallengeSummary();
    const customRoot = $("#custom-assignment-lists", giveModalRoot);
    const historyRoot = $("#challenge-hub-history", giveModalRoot);
    const isHistory = hubView === "history";
    customRoot.hidden = isHistory;
    historyRoot.hidden = !isHistory;
    if (isHistory) renderHistory();
    else renderCustomSection();
  }

  /* ─── Custom challenges (received + sent) ────────── */
  function renderCustomSection() {
    const customListsRoot = $("#custom-assignment-lists", giveModalRoot);
    if (!customListsRoot) return;
    const received = customAllChallenges.filter(i => i.recipientKey === ownKey);
    const sent = customAllChallenges.filter(i => i.author === user.uid);
    const all = [
      ...received.map(item => ({ item, received: true })),
      ...sent.filter(item => !received.some(r => r.id === item.id)).map(item => ({ item, received: false }))
    ].sort((a, b) =>
      Number(b.item.sentAtMs || b.item.createdAtMs || b.item.assignedAtMs || 0) -
      Number(a.item.sentAtMs || a.item.createdAtMs || a.item.assignedAtMs || 0)
    );

    const activeCount = all.filter(({ item }) => item.status === "upcoming" || item.status === "in-progress").length;
    const pendingCount = all.filter(({ item, received }) => received && item.status === "upcoming").length;
    const completedCount = all.filter(({ item }) => item.status === "completed").length;

    const filters = [
      ["all", `All (${all.length})`],
      ["received", `Received (${received.length})`],
      ["sent", `Sent (${sent.length})`],
      ["active", `Active (${activeCount})`],
      ["completed", `Completed (${completedCount})`]
    ];

    const visible = all.filter(({ item, received: isReceived }) => {
      if (customFilter === "received") return isReceived;
      if (customFilter === "sent") return !isReceived;
      if (customFilter === "active") return item.status === "upcoming" || item.status === "in-progress";
      if (customFilter === "completed") return item.status === "completed";
      return true;
    });

    customListsRoot.innerHTML = `
      <section class="custom-hub" aria-labelledby="custom-hub-title">
        <div class="custom-hub-head">
          <div>
            <p class="custom-eyebrow">JUST FOR THE TWO OF YOU</p>
            <h2 id="custom-hub-title">Our Challenges & Punishments <span aria-hidden="true">♡</span></h2>
            <p class="custom-hub-subtitle">Everything you send each other, with its latest status.</p>
          </div>
          <span class="custom-total-pill">${all.length} total</span>
        </div>
        ${pendingCount ? `<div class="custom-pending-note">💌 ${pendingCount} waiting for your response</div>` : ""}
        <div class="custom-hub-filters" role="group" aria-label="Filter challenges">
          ${filters.map(([key, label]) => `
            <button type="button" data-custom-filter="${key}" class="${customFilter === key ? "selected" : ""}" aria-pressed="${customFilter === key}">
              ${label}
            </button>
          `).join("")}
        </div>
        ${visible.length
          ? `<div class="custom-list">${visible.map(({ item, received }) => customCard(item, received)).join("")}</div>`
          : `<div class="challenge-empty custom-hub-empty">
              <span class="empty-heart" aria-hidden="true">${all.length ? "♡" : "💌"}</span>
              <strong>${all.length ? "Nothing in this filter yet" : "Your little challenge story starts here"}</strong>
              <p>${all.length ? "Try another filter to see more." : "Send your partner a sweet challenge or a playful punishment to get started."}</p>
              ${all.length ? "" : `<button type="button" class="custom-empty-cta" data-open-give>＋ Create your first challenge</button>`}
            </div>`
        }
      </section>
    `;

    customListsRoot.querySelectorAll("[data-custom-filter]").forEach(button => {
      button.onclick = () => {
        customFilter = button.dataset.customFilter;
        renderCustomSection();
        hydrateTelegramImages();
      };
    });
  }

  function customCard(item, received) {
    const kind = item.kind === "punishment" ? "punishment" : "challenge";
    const isPunishment = kind === "punishment";
    const status = item.status === "in-progress" ? "accepted" : item.status === "completed" ? "done" : "pending";
    const tagText = { pending: "Pending", accepted: "Accepted", done: "Completed" }[status];
    const date = Number(item.sentAtMs || item.assignedAtMs || item.createdAtMs || 0);
    const deadline = item.deadlineAt ? new Date(item.deadlineAt) : null;
    const image = item.photoUrl
      ? `<img class="custom-photo" src="${esc(item.photoUrl)}" alt="Completion">`
      : item.telegramFileId
        ? `<img class="custom-photo" data-telegram-file-id="${esc(item.telegramFileId)}" data-telegram-mime="${esc(item.photoMimeType || "image/jpeg")}" alt="Completion">`
        : "";
    const actions = received && item.status === "upcoming"
      ? `<div class="custom-actions"><button class="custom-accept" data-custom-action="accept" data-id="${esc(item.id)}">Accept</button></div>`
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
      <article class="custom-card ${isPunishment ? "kind-punishment" : ""} ${item.status === "completed" ? "is-completed" : ""}">
        <div class="custom-head">
          <span class="custom-icon" aria-hidden="true">${isPunishment ? "😈" : "💝"}</span>
          <h3 class="custom-title">${esc(item.title || (isPunishment ? "Punishment" : "Challenge"))}</h3>
          <span class="custom-tag ${status}">${tagText}</span>
        </div>
        ${item.description ? `<p class="custom-desc">${esc(item.description)}</p>` : ""}
        <div class="custom-meta">
          <span>${received ? "↓ From your partner" : "↑ Sent by you"}${date ? ` · ${esc(new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}` : ""}</span>
          ${deadline && item.status !== "completed" ? `<span class="custom-countdown" data-countdown-deadline="${deadline.getTime()}">${formatCountdown(deadline.getTime())}</span>` : ""}
          ${item.status === "completed" ? `<span>✓ Finished</span>` : ""}
        </div>
        ${item.note ? `<p class="custom-note">${esc(item.note)}</p>` : ""}
        ${image}
        ${actions}
      </article>
    `;
  }

  /* ─── History ────────────────────────────────────── */
  function renderHistory() {
    const historyRoot = $("#challenge-hub-history", giveModalRoot);
    if (!historyRoot) return;
    const filters = `
      <div class="history-filter" role="tablist">
        ${[
          ["all", "All"],
          ["snap", "📸 Snap"],
          ["water", "💧 Water"]
        ].map(([key, label]) => `
          <button type="button" data-history-filter="${key}" class="${historyFilter === key ? "selected" : ""}">${label}</button>
        `).join("")}
      </div>`;

    const oneMonthAgo = Date.now() - 30 * 86400000;

    // Group everything by dayKey
    const days = new Map();
    const ensureDay = (key) => {
      if (!days.has(key)) days.set(key, { snap: null, water: null });
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
    const sortedDays = [...days.entries()]
      .filter(([, bucket]) => bucket.snap || bucket.water)
      .sort((a, b) => b[0].localeCompare(a[0]));

    const filterSection = `
      ${filters}
      ${sortedDays.length
        ? sortedDays.map(([key, bucket]) => historyDay(key, bucket)).join("")
      : `<div class="challenge-empty"><span class="empty-heart">♡</span>No recent daily challenge activity yet.</div>`}
    `;

    // Custom completed (all time) shown at the bottom of All view
    if (historyFilter === "all") {
      const completedCustom = customAllChallenges.filter(i => i.status === "completed");
      const customHtml = completedCustom.length ? `
        <h3 class="custom-section-title">Completed challenges & punishments</h3>
        <div class="custom-list">${completedCustom.map(item => customCard(item, item.recipientKey === ownKey)).join("")}</div>
      ` : "";
      historyRoot.innerHTML = filterSection + customHtml;
    } else {
      historyRoot.innerHTML = filterSection;
    }

    historyRoot.querySelectorAll("[data-history-filter]").forEach(btn => {
      btn.onclick = () => { historyFilter = btn.dataset.historyFilter; renderHistory(); };
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
          renderChallengeHub();
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
    for (let i = 0; i < 20; i++) {
      const heart = document.createElement("div");
      heart.className = "splash-heart";
      heart.textContent = "❤️";
      heart.style.left = Math.random() * 100 + "%";
      heart.style.animationDelay = Math.random() * 0.5 + "s";
      splash.appendChild(heart);
    }
    document.body.appendChild(splash);
    setTimeout(() => splash.remove(), 2000);
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
          const result = await sendToTelegram(selectedPhoto, `Challenge Photo · ${profile.name} · ${timestamp}`);
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

  function onProfilesUpdated() { partnerProfiles = APP_CONFIG.profiles; render(); }
  removeProfilesListener = () => window.removeEventListener("couple-profiles-updated", onProfilesUpdated);
  window.addEventListener("couple-profiles-updated", onProfilesUpdated);

  function onChallengeEscape(event) {
    if (event.key === "Escape") {
      const compose = giveModalRoot.querySelector(".challenge-compose-layer");
      if (compose) { compose.remove(); return; }
      if (giveModalRoot.querySelector(".challenge-hub-page")) { giveModalRoot.innerHTML = ""; return; }
      modalRoot.querySelector("[data-close-modal]")?.click();
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
    try {
      if (assignmentsError) {
        list.innerHTML = `<div class="challenge-empty">Could not load today's challenges. Please try again.</div>`;
        return;
      }
      if (!assignmentsReady) {
        list.innerHTML = `<div class="challenge-empty">Loading today's challenges…</div>`;
        return;
      }
      renderToday();
      renderChallengeHub();
      hydrateTelegramImages();
    } catch (e) {
      console.error("Rendering error:", e);
      list.innerHTML = `<div class="challenge-empty">Error loading content. <button type="button" id="retry-render" style="margin-left:6px;padding:4px 10px;border-radius:8px;border:0;background:#8f315d;color:#fff;font-weight:700;">Retry</button></div>`;
      $("#retry-render", list).onclick = () => render();
    }
  }

  bindActions();
  prepareTodayChallenges();
  countdownTimer = window.setInterval(() => {
    el.querySelectorAll("[data-countdown-deadline]").forEach(node => {
      node.textContent = formatCountdown(Number(node.dataset.countdownDeadline));
    });
  }, 1000);
}

export function disposeChallenges() {
  challengeRenderToken++;
  clearTimeout(dayRolloverTimer);
  dayRolloverTimer = null;
  clearInterval(countdownTimer);
  countdownTimer = null;
  stopChallenges?.(); stopChallenges = null;
  stopCustomChallenges?.(); stopCustomChallenges = null;
  stopWaterChallenges?.(); stopWaterChallenges = null;
  if (queuedChallengeRender) cancelAnimationFrame(queuedChallengeRender);
  queuedChallengeRender = 0;
  removeProfilesListener?.(); removeProfilesListener = null;
  removeActionsListener?.(); removeActionsListener = null;
  removeEscapeListener?.(); removeEscapeListener = null;
}
