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
import { updateWaterProgressUI } from "./water-progress.js";
import { getTelegramMediaUrl, sendToTelegram, telegramMediaReferences, telegramUploadMimeType } from "../src/services/telegramService.js";

let stopChallenges = null, stopCustomChallenges = null, stopWaterChallenges = null;
let dayRolloverTimer = null, challengeRenderToken = 0, queuedChallengeRender = 0, countdownTimer = null;
let customAllChallenges = [], waterTrackers = [], waterTrackersReady = false;
const pendingWaterWrites = new Map();
let removeProfilesListener = null, removeEscapeListener = null, removeActionsListener = null;
let openVideoOverlay = null;

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

  let partnerProfiles = APP_CONFIG.profiles;
  let assignments = [], assignmentsReady = false, assignmentsError = false;
  const reconcilingDailyPoints = new Set();
  let customFilter = "due"; // received | sent | due | completed

  el.innerHTML = `
    <section class="challenge-page">
      <header class="challenge-page-head">
        <span class="challenge-sparkle" aria-hidden="true">✨</span>
        <h1>Challenges</h1>
      </header>

      <div id="challenge-list"></div>
      <div id="challenge-modal-root"></div>
      <div id="give-challenge-modal-root"></div>
    </section>
  `;

  const list = $("#challenge-list", el);
  const modalRoot = $("#challenge-modal-root", el);
  const giveModalRoot = $("#give-challenge-modal-root", el);

  /* ─── Give Challenge / Punishment ───────────────── */
  function openGiveModal(editing = null, preferredKind = "") {
    document.body.classList.remove("challenge-hub-open");
    el.innerHTML = `<section class="challenge-page challenge-compose-page-shell">
      <button type="button" class="challenge-compose-back" data-close-give>‹ Back to Challenges</button>
      <div id="challenge-compose-page-root"></div>
    </section>`;
    const composeRoot = document.createElement("div");
    const draftKey = `challenge-draft-${ownKey}`;
    const savedDraft = !editing ? (() => { try { return JSON.parse(localStorage.getItem(draftKey) || "null"); } catch { return null; } })() : null;
    const savedCustomDate = typeof savedDraft?.customDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(savedDraft.customDate) && savedDraft.customDate >= todayKey()
      ? savedDraft.customDate : "";
    const savedDuration = [1, 3, 7].includes(Number(savedDraft?.durationDays)) ? Number(savedDraft.durationDays) : null;
    const editingKind = editing?.kind === "punishment" ? "punishment" : editing ? "challenge" : preferredKind || savedDraft?.kind || "challenge";
    composeRoot.className = "challenge-compose-layer challenge-compose-page";
    composeRoot.innerHTML = `
      <div class="challenge-compose-card">
          <header class="challenge-modal-head">
            <h2>${editing ? "Edit" : "Send"} ${editingKind === "punishment" ? "Punishment" : "Challenge"}</h2>
            <span class="challenge-compose-mark" aria-hidden="true">♡</span>
          </header>
          <form class="challenge-form" id="give-challenge-form">
            ${editing || preferredKind ? "" : `
              <div class="kind-toggle" role="tablist">
              <button type="button" data-kind="challenge" class="${editingKind !== "punishment" ? "selected" : ""}">💝 Challenge</button>
              <button type="button" data-kind="punishment" class="punishment ${editingKind === "punishment" ? "selected" : ""}">😈 Punishment</button>
              </div>`}
            <label>Title
            <input type="text" name="title" maxlength="80" required value="${esc(editing?.title || savedDraft?.title || "")}" placeholder="e.g. Make me a cup of tea">
            </label>
            <label>Description
              <textarea name="description" maxlength="300" required placeholder="Add a little detail…">${esc(editing?.description || savedDraft?.description || "")}</textarea>
            </label>
            ${editing ? "" : `
              <label>Deadline
                <select name="duration">
                  <option value="1" ${savedDuration === 1 ? "selected" : ""}>1 day</option>
                  <option value="3" ${savedDuration === 3 ? "selected" : ""}>3 days</option>
                  <option value="7" ${(!savedDuration && !savedCustomDate) || savedDuration === 7 ? "selected" : ""}>1 week</option>
                  <option value="custom" ${savedCustomDate ? "selected" : ""}>Choose a date…</option>
                </select>
                <input type="date" name="customDate" min="${todayKey()}" value="${esc(savedCustomDate)}" aria-label="Choose deadline date" ${savedCustomDate ? "" : "hidden"}>
              </label>
              <label>Proof required
                <select name="proofType">
                  <option value="any" ${savedDraft?.proofType === "any" || !savedDraft?.proofType ? "selected" : ""}>Any (photo, video or voice)</option>
                  <option value="photo" ${savedDraft?.proofType === "photo" ? "selected" : ""}>Photo</option><option value="video" ${savedDraft?.proofType === "video" ? "selected" : ""}>Video</option><option value="voice" ${savedDraft?.proofType === "voice" ? "selected" : ""}>Voice note</option><option value="none" ${savedDraft?.proofType === "none" ? "selected" : ""}>No proof required</option>
                </select>
              </label>
              <label>Optional points / reward
                <input type="number" name="rewardPoints" min="0" max="1000" value="${Number(savedDraft?.rewardPoints || 0)}" placeholder="0">
              </label>
              <label>Reference media (optional)
                <input type="file" name="reference" accept="image/*,video/*,audio/*">
                <button type="button" class="modal-secondary" data-record-voice>🎙 Record voice note</button>
                <small data-record-state aria-live="polite">${savedDraft?.voiceData ? "Voice note saved in this draft" : ""}</small>
              </label>
              <div class="challenge-compose-preview" hidden></div>
            `}
            <div class="challenge-modal-actions">
              <button type="button" class="modal-secondary" data-close-give>Cancel</button>
              ${editing ? "" : `<button type="button" class="modal-secondary" data-save-draft>Save draft</button><button type="button" class="modal-secondary" data-preview>Preview</button>`}
              <button type="submit" class="modal-primary ${editingKind === "punishment" ? "punishment" : ""}">
                ${editing ? "Save" : "Send"} ${editingKind === "punishment" ? "Punishment" : "Challenge"}
              </button>
            </div>
          </form>
      </div>
    `;
    $("#challenge-compose-page-root", el).append(composeRoot);

    const form = $("#give-challenge-form", composeRoot);
    let kind = editingKind === "punishment" ? "punishment" : "challenge";
    let recordedVoice = savedDraft?.voiceData || "";
    let selectedReference = null;
    let mediaRecorder = null;
    const durationInput = form.elements.duration;
    if (durationInput) durationInput.onchange = () => {
      const dateInput = form.elements.customDate;
      dateInput.hidden = durationInput.value !== "custom";
      if (durationInput.value === "custom") dateInput.min = todayKey();
    };
    if (form.elements.reference) form.elements.reference.onchange = () => { selectedReference = form.elements.reference.files?.[0] || null; };
    const recordButton = composeRoot.querySelector("[data-record-voice]");
    if (recordButton) recordButton.onclick = async () => {
      if (mediaRecorder?.state === "recording") { mediaRecorder.stop(); recordButton.textContent = "🎙 Record voice note"; return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
          const reader = new FileReader();
          reader.onload = () => { recordedVoice = String(reader.result || ""); };
          reader.readAsDataURL(blob);
          composeRoot.querySelector("[data-record-state]").textContent = "Voice note recorded and ready to send.";
          stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorder.start(); recordButton.textContent = "■ Stop recording";
        composeRoot.querySelector("[data-record-state]").textContent = "Recording…";
      } catch { toast("Microphone access is needed to record a voice note."); }
    };
    composeRoot.querySelector("[data-save-draft]")?.addEventListener("click", () => {
      const draft = { title: form.elements.title.value, description: form.elements.description.value, kind, durationDays: durationInput.value === "custom" ? null : Number(durationInput.value), customDate: form.elements.customDate.value, proofType: form.elements.proofType.value, rewardPoints: Number(form.elements.rewardPoints.value || 0), voiceData: recordedVoice };
      try {
        localStorage.setItem(draftKey, JSON.stringify(draft));
        toast("Draft saved on this device.");
      } catch (error) {
        if (draft.voiceData) {
          try {
            localStorage.setItem(draftKey, JSON.stringify({ ...draft, voiceData: "" }));
            toast("Draft saved. The voice note was too large to store and needs to be recorded again.");
            return;
          } catch { /* show the storage error below */ }
        }
        console.error("Could not save challenge draft:", error);
        toast("Could not save the draft on this device. Check available browser storage and try again.");
      }
    });
    composeRoot.querySelector("[data-preview]")?.addEventListener("click", () => {
      const preview = composeRoot.querySelector(".challenge-compose-preview");
      preview.hidden = false;
      const deadlineText = durationInput.value === "custom" ? form.elements.customDate.value : `${durationInput.value} day${durationInput.value === "1" ? "" : "s"}`;
      const points = Number(form.elements.rewardPoints.value || 0);
      preview.innerHTML = `<strong>${esc(form.elements.title.value || "Your title")}</strong><p>${esc(form.elements.description.value || "Your description")}</p><small>${kind === "punishment" ? "Punishment" : "Challenge"} · ${esc(deadlineText)} · ${esc(form.elements.proofType.value)} proof${points ? ` · ${points} points` : ""}</small>`;
    });

    composeRoot.querySelectorAll("[data-close-give]").forEach(b => b.onclick = () => window.App?.navigate("home"));
    $("[data-close-give]", el).onclick = () => window.App?.navigate("home");
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
    if (kind === "punishment") {
      const submit = form.querySelector('[type="submit"]');
      submit.classList.add("punishment");
      submit.textContent = `${editing ? "Save" : "Send"} Punishment`;
      composeRoot.querySelector("h2").textContent = `${editing ? "Edit" : "Send"} Punishment`;
    }

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
          window.App?.navigate("home");
          return;
        }
        const createdAt = Date.now();
        let deadlineAt;
        if (form.elements.duration.value === "custom") {
          const [year, month, day] = (form.elements.customDate.value || "").split("-").map(Number);
          const chosen = year && month && day ? new Date(year, month - 1, day, 23, 59, 59, 999) : new Date(NaN);
          if (!Number.isFinite(chosen.getTime()) || chosen.getFullYear() !== year || chosen.getMonth() !== month - 1 || chosen.getDate() !== day || chosen.getTime() <= createdAt) {
            throw new Error("Choose today or a future deadline date.");
          }
          deadlineAt = chosen.getTime();
        } else deadlineAt = createdAt + Number(form.elements.duration.value || 7) * 86400000;
        const durationDays = Math.max(1, Math.ceil((deadlineAt - createdAt) / 86400000));
        let mediaMetadata = {};
        let mediaFile = selectedReference;
        if (!mediaFile && recordedVoice) {
          const response = await fetch(recordedVoice);
          mediaFile = new File([await response.blob()], "voice-note.webm", { type: response.headers.get("content-type") || "audio/webm" });
        }
        if (mediaFile) {
          const result = await sendToTelegram(mediaFile, `Challenge reference · ${profile.name} · ${new Date().toLocaleString()}`);
          mediaMetadata = { ...telegramMediaReferences(result), mimeType: telegramUploadMimeType(mediaFile) };
          if (mediaFile.type.startsWith("video/")) mediaMetadata.videoMimeType = telegramUploadMimeType(mediaFile);
          if (mediaFile.type.startsWith("audio/")) mediaMetadata.audioMimeType = telegramUploadMimeType(mediaFile);
          if (mediaFile.type.startsWith("image/")) mediaMetadata.photoMimeType = telegramUploadMimeType(mediaFile);
        }
        const recipientKey = Object.keys(APP_CONFIG.profiles).find(key => key !== ownKey) || "";
        const customRef = await addItem("customChallenge", {
          title, description, kind, durationDays, proofType: form.elements.proofType.value,
          rewardPoints: Number(form.elements.rewardPoints.value || 0),
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
          actions: [], ...(Object.keys(mediaMetadata).length ? { referenceMedia: mediaMetadata, ...mediaMetadata } : {})
        });
        localStorage.removeItem(draftKey);
        void notifyPartnerSafely(ownKey, "challenge",
          `${profile.name} sent ${kind === "punishment" ? "a punishment" : "a challenge"}: ${title}`.slice(0, 240),
          customRef.id, "challenges");
        toast(kind === "punishment" ? "Punishment sent 😈" : "Challenge sent ♡");
        window.App?.navigate("home");
      } catch (error) {
        console.error(error);
        toast(error.message || "Could not send.");
        submit.disabled = false;
      }
    };
  }

  function openChallengeHub() {
    document.body.classList.add("challenge-hub-open");
    giveModalRoot.innerHTML = `
      <section class="challenge-hub-page" aria-labelledby="challenge-hub-title">
        <section class="challenge-modal-card challenge-hub-card">
          <header class="challenge-modal-head">
            <h2 id="challenge-hub-title">Our challenges ♡</h2>
            <button type="button" class="challenge-modal-close" data-close-hub aria-label="Close">×</button>
          </header>
          <div id="custom-assignment-lists"></div>
          <button type="button" class="custom-empty-cta challenge-hub-create" data-open-give>＋ Give a challenge or punishment</button>
        </section>
      </section>`;
    giveModalRoot.querySelector("[data-close-hub]").onclick = closeChallengeHub;
    giveModalRoot.querySelector("[data-open-give]").onclick = () => openGiveModal();
    renderChallengeHub();
  }
  function closeChallengeHub() {
    giveModalRoot.innerHTML = "";
    document.body.classList.remove("challenge-hub-open");
  }

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
    const count = Math.max(0, Math.min(8, Number(waterRecordFor(key)?.count || 0)));
    const optimistic = key === ownKey ? pendingWaterWrites.get(`${dayKey}-${key}`) : null;
    return optimistic ? optimistic.optimisticCount : count;
  }

  function queueWaterProgress(delta) {
    const waterKey = `${dayKey}-${ownKey}`;
    const currentCount = waterCountFor(ownKey);
    const targetCount = Math.max(0, Math.min(8, currentCount + delta));
    if (targetCount === currentCount) return;

    let state = pendingWaterWrites.get(waterKey);
    if (!state) {
      state = { confirmedCount: currentCount, optimisticCount: currentCount, pendingDeltas: [], queue: Promise.resolve() };
      pendingWaterWrites.set(waterKey, state);
    }
    state.pendingDeltas.push(delta);
    state.optimisticCount = targetCount;
    if (isCurrent()) updateWaterProgressUI(list, Object.entries(partnerProfiles), ownKey, waterCountFor, waterTrackersReady && assignmentsReady);

    state.queue = state.queue.catch(() => {}).then(async () => {
      const queuedDelta = state.pendingDeltas[0];
      try {
        const savedCount = await changeDailyWaterProgress(dayKey, { uid: user.uid, profileKey: ownKey, name: profile.name }, queuedDelta, state.confirmedCount);
        state.confirmedCount = savedCount;
        const trackerId = `water-${dayKey}-${ownKey}`;
        const local = waterTrackers.find(item => item.id === trackerId);
        if (local) { local.count = savedCount; local.updatedAtMs = Date.now(); }
        else waterTrackers.push({ id: trackerId, type: "waterChallenge", dayKey, profileKey: ownKey, uid: user.uid, name: profile.name, count: savedCount, updatedAtMs: Date.now() });
        if (queuedDelta > 0 && savedCount === 8) void notifyPartnerSafely(ownKey, "challenge", `${profile.name} completed today's water goal.`, trackerId, "challenges");
      } catch (error) {
        console.error("Could not update today's water progress:", error);
        toast(error.message || "Could not update water progress.");
      } finally {
        state.pendingDeltas.shift();
        state.optimisticCount = Math.max(0, Math.min(8, state.confirmedCount + state.pendingDeltas.reduce((sum, value) => sum + value, 0)));
        if (!state.pendingDeltas.length) pendingWaterWrites.delete(waterKey);
        if (isCurrent()) updateWaterProgressUI(list, Object.entries(partnerProfiles), ownKey, waterCountFor, waterTrackersReady && assignmentsReady);
      }
    });
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
                <header class="snap-person-head"><strong>${esc(person.name || "Partner")}</strong><span class="snap-status-pill ${sent ? "sent" : "pending"}">${sent ? "✓ Sent" : "◷ Not Sent"}</span></header>
                <div class="snap-person-state">${sent ? `<span class="snap-sent-check" role="img" aria-label="Snap sent">✓</span>` : `<span class="snap-avatar">${avatar}</span>`}<div class="snap-state-copy"><strong>${sent ? "Snap sent today" : "Snap not sent yet"}</strong><small>${sent ? (isMine ? "You're all caught up" : "Your partner is all caught up") : (isMine ? "Send your daily moment" : "Waiting for your partner")}</small></div>
                  ${isMine && !sent ? `<button type="button" class="snap-send-button" data-action="snap-complete" data-id="${esc(assignment.id)}">Send Snap</button>` : ""}
                </div>
              </section>`;
            }).join("")}
          </div>
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
    const bothDone = ownCount >= 8 && partnerCount >= 8;
    return `
      <article class="challenge-card water-challenge-card">
        <div class="challenge-card-head">
          <span class="water-heading-icon" aria-hidden="true">💧</span>
          <div class="challenge-head-copy">
            <h2>Drink Water</h2>
            <small>8 glasses a day, together 💗</small>
          </div>
        </div>
        <div class="water-widget">
          <div class="water-bottles">
            ${Object.entries(partnerProfiles).map(([key, person]) => {
              const count = key === ownKey ? ownCount : partnerCount;
              const isMine = key === ownKey;
              const isShazy = key.toLowerCase().includes("shaz") || person.name?.toLowerCase() === "shazy";
              const glassAsset = isShazy ? "Girl.png" : "Boy.png";
              return `<section class="water-person-progress ${isMine ? "is-mine" : ""} ${isShazy ? "water-profile-shazy" : "water-profile-keby"}" data-water-profile="${esc(key)}" aria-label="${esc(person.name)}: ${count} of 8 glasses">
                <div class="water-person-title"><strong>${esc(person.name)}${isMine ? " · You" : ""}</strong><span aria-hidden="true">${isShazy ? "💗" : "💙"}</span></div>
                <div class="water-person-main">
                  <div class="water-glass-wrap" aria-hidden="true"><div class="water-glass-fill" style="--water-level:${count / 8 * 82}%"></div><img src="./Asset/${glassAsset}" alt="" loading="lazy" decoding="async"></div>
                  <div class="water-person-details"><div class="water-count"><strong data-water-count>${count}</strong><span>/ 8<br>glasses</span>${isMine ? `<div class="water-count-controls"><button type="button" class="water-count-minus" data-action="water-remove" data-id="${esc(assignment.id)}" aria-label="Remove one glass" ${!waterTrackersReady || !assignmentsReady || ownCount <= 0 ? "disabled" : ""}>−</button><button type="button" class="water-count-plus" data-action="water-add" data-id="${esc(assignment.id)}" aria-label="Add one glass" ${!waterTrackersReady || !assignmentsReady || ownCount >= 8 ? "disabled" : ""}>＋</button></div>` : ""}</div>
                    <div class="water-progress-track" role="progressbar" aria-label="${esc(person.name)} daily water progress" aria-valuemin="0" aria-valuemax="8" aria-valuenow="${count}"><span style="width:${count / 8 * 100}%"></span></div>
                    <small class="water-progress-caption">${count >= 8 ? "Daily goal complete ✓" : `${8 - count} glasses to go`}</small>
                  </div>
                </div>
              </section>`;
            }).join("")}
          </div>
          <div class="water-celebrate" data-water-celebrate ${bothDone ? "" : "hidden"}>Hydrated together 💧✨</div>
        </div>
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

  function renderChallengeHub() {
    if (!giveModalRoot.querySelector(".challenge-hub-page")) return;
    renderCustomSection();
  }

  /* ─── Custom challenges (received + sent) ────────── */
  function renderCustomSection() {
    const customListsRoot = $("#custom-assignment-lists", giveModalRoot);
    if (!customListsRoot) return;
    const previousScrollTop = customListsRoot.scrollTop;
    const received = customAllChallenges.filter(i => i.recipientKey === ownKey);
    const sent = customAllChallenges.filter(i => i.author === user.uid);
    const all = [
      ...received.map(item => ({ item, received: true })),
      ...sent.filter(item => !received.some(r => r.id === item.id)).map(item => ({ item, received: false }))
    ].sort((a, b) =>
      Number(b.item.sentAtMs || b.item.createdAtMs || b.item.assignedAtMs || 0) -
      Number(a.item.sentAtMs || a.item.createdAtMs || a.item.assignedAtMs || 0)
    );

    const receivedCount = received.length;
    const sentCount = sent.filter(item => !received.some(receivedItem => receivedItem.id === item.id)).length;
    const dueCount = all.filter(({ item }) => item.status !== "completed").length;
    const pendingCount = received.filter(item => item.status === "upcoming").length;
    const completedCount = all.filter(({ item }) => item.status === "completed").length;

    const filters = [
      ["received", `Received (${receivedCount})`],
      ["sent", `Sent (${sentCount})`],
      ["due", `Due (${dueCount})`],
      ["completed", `Completed (${completedCount})`]
    ];

    const visible = all.filter(({ item, received: isReceived }) => {
      if (customFilter === "received") return isReceived;
      if (customFilter === "sent") return !isReceived;
      if (customFilter === "due") return item.status !== "completed";
      if (customFilter === "completed") return item.status === "completed";
      return true;
    });
    const queryText = customListsRoot.querySelector("[data-custom-search]")?.value?.trim().toLocaleLowerCase() || "";
    const searched = queryText ? visible.filter(({ item }) => `${item.title || ""} ${item.description || ""}`.toLocaleLowerCase().includes(queryText)) : visible;

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
        <div class="custom-hub-filters" role="group" aria-label="Filter received, sent, due and completed challenges">
          ${filters.map(([key, label]) => `
            <button type="button" data-custom-filter="${key}" class="${customFilter === key ? "selected" : ""}" aria-pressed="${customFilter === key}">
              ${label}
            </button>
          `).join("")}
        </div>
        <input class="custom-search" type="search" data-custom-search placeholder="Search challenges…" aria-label="Search challenges">
        ${searched.length
          ? `<div class="custom-list">${searched.map(({ item, received }) => customCard(item, received)).join("")}</div>`
          : `<div class="challenge-empty custom-hub-empty">
              <span class="empty-heart" aria-hidden="true">${all.length ? "♡" : "💌"}</span>
              <strong>${all.length ? "Nothing in this filter yet" : "Your little challenge story starts here"}</strong>
              <p>${all.length ? "Try another filter to see more." : "Send your partner a sweet challenge or a playful punishment to get started."}</p>
              ${all.length ? "" : `<button type="button" class="custom-empty-cta" data-open-give>＋ Create your first challenge</button>`}
            </div>`
        }
      </section>
    `;
    customListsRoot.scrollTop = previousScrollTop;

    customListsRoot.querySelectorAll("[data-custom-filter]").forEach(button => {
      button.onclick = () => {
        customFilter = button.dataset.customFilter;
        renderCustomSection();
        hydrateTelegramImages();
      };
    });
    const search = customListsRoot.querySelector("[data-custom-search]");
    if (search) search.oninput = () => {
      const caret = search.selectionStart;
      const value = search.value;
      renderCustomSection();
      const nextSearch = customListsRoot.querySelector("[data-custom-search]");
      nextSearch.value = value; nextSearch.focus(); nextSearch.setSelectionRange(caret, caret);
    };
  }

  function customCard(item, received) {
    const kind = item.kind === "punishment" ? "punishment" : "challenge";
    const isPunishment = kind === "punishment";
    const status = item.status === "in-progress" ? "accepted" : item.status === "completed" ? "done" : item.status === "submitted" ? "submitted" : item.status === "extension-requested" ? "extension" : "pending";
    const tagText = { pending: "Pending", accepted: "Accepted", done: "Completed", submitted: "Proof submitted", extension: "Extension requested" }[status];
    const date = Number(item.sentAtMs || item.assignedAtMs || item.createdAtMs || 0);
    const deadline = item.deadlineAt ? new Date(item.deadlineAt) : null;
    const proof = item.proof || null;
    const canEdit = !received && item.status !== "completed";
    const mediaData = proof?.telegramFileId ? proof : item.referenceMedia?.telegramFileId ? item.referenceMedia : item;
    const mediaId = mediaData.telegramFileId || "";
    const mediaMime = mediaData.videoMimeType || mediaData.audioMimeType || mediaData.photoMimeType || mediaData.mimeType || "image/jpeg";
    const photoUrl = typeof mediaData.photoUrl === "string" && !["null", "undefined"].includes(mediaData.photoUrl.trim().toLowerCase()) ? mediaData.photoUrl : "";
    const image = mediaId ? mediaMime.startsWith("video/")
      ? `<div class="custom-media-square">
          <button type="button" class="custom-video-open" data-open-video disabled aria-label="Play video full size">
            <video class="custom-video-thumb" muted playsinline preload="metadata" data-telegram-file-id="${esc(mediaId)}" data-telegram-mime="${esc(mediaMime)}"></video>
            <span class="custom-video-play" aria-hidden="true">▶</span>
          </button>
          <a class="custom-video-download" data-video-download aria-disabled="true" tabindex="-1" download="challenge-video.mp4" aria-label="Download video" title="Download video">↓</a>
        </div>`
      : mediaMime.startsWith("audio/")
        ? `<audio controls data-telegram-file-id="${esc(mediaId)}" data-telegram-mime="${esc(mediaMime)}"></audio>`
        : `<img class="custom-photo" data-telegram-file-id="${esc(mediaId)}" data-telegram-mime="${esc(mediaMime)}" alt="Challenge media">`
      : photoUrl ? `<img class="custom-photo" src="${esc(photoUrl)}" alt="Challenge media">` : "";
    const hasVideo = Boolean(mediaId && mediaMime.startsWith("video/"));
    const actions = received && item.status === "upcoming"
      ? `<div class="custom-actions"><button class="custom-accept" data-custom-action="accept" data-id="${esc(item.id)}">Accept</button></div>`
      : received && item.status === "in-progress"
        ? `<div class="custom-actions">
            <button class="custom-complete" data-custom-action="complete" data-id="${esc(item.id)}">Submit proof ♡</button>
            <button class="custom-edit" data-custom-action="request-extension" data-id="${esc(item.id)}">Request more time</button>
          </div>`
        : received && item.status === "extension-requested"
          ? `<p class="custom-note">Extension requested: ${esc(item.extensionRequest?.reason || "No reason given")}</p>`
        : !received && item.status === "extension-requested"
          ? `<div class="custom-actions"><button class="custom-accept" data-custom-action="approve-extension" data-id="${esc(item.id)}">Approve new date</button><button class="custom-delete" data-custom-action="decline-extension" data-id="${esc(item.id)}">Decline</button></div>`
        : !received && item.status === "submitted"
          ? `<p class="custom-note">Proof submitted. Please review it in details.</p><div class="custom-actions"><button class="custom-accept" data-custom-action="approve-proof" data-id="${esc(item.id)}">Approve proof</button><button class="custom-edit" data-custom-action="request-revision" data-id="${esc(item.id)}">Ask for another proof</button></div>`
          : "";

    const details = `
      <div class="custom-detail-list">
        <div class="custom-meta">
          <span>${received ? "↓ From your partner" : "↑ Sent by you"}${date ? ` · ${esc(new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}` : ""}</span>
        </div>
        <div class="custom-meta">
          ${deadline && item.status !== "completed" ? `<span class="custom-countdown" data-countdown-deadline="${deadline.getTime()}">${formatCountdown(deadline.getTime())}</span>` : ""}
          ${item.status === "completed" ? `<span>✓ Finished</span>` : ""}
        </div>
        ${item.rewardPoints ? `<div class="custom-meta"><span>✨ ${Number(item.rewardPoints)} points on completion</span></div>` : ""}
        ${item.proofType ? `<div class="custom-meta"><span>Proof: ${esc(item.proofType === "any" ? "Any media" : item.proofType)}</span></div>` : ""}
        ${item.description ? `<p class="custom-desc">${esc(item.description)}</p>` : ""}
      </div>`;

    return `
      <article class="custom-card ${isPunishment ? "kind-punishment" : ""} ${item.status === "completed" ? "is-completed" : ""} ${hasVideo ? "has-video" : ""}">
        <div class="custom-head">
          <span class="custom-icon" aria-hidden="true">${isPunishment ? "😈" : "💝"}</span>
          <h3 class="custom-title">${esc(item.title || (isPunishment ? "Punishment" : "Challenge"))}</h3>
          <span class="custom-tag ${status}">${tagText}</span>
          ${!received ? `<details class="custom-more-menu">
            <summary aria-label="More options" title="More options">•••</summary>
            <div class="custom-more-popover">
              ${canEdit ? `<button type="button" class="custom-edit" data-custom-action="edit" data-id="${esc(item.id)}">✎ Edit</button>` : ""}
              <button type="button" class="custom-delete" data-custom-action="delete" data-id="${esc(item.id)}">⌫ Delete</button>
            </div>
          </details>` : ""}
        </div>
        ${hasVideo ? `<div class="custom-media-details">${image}${details}</div>` : `${details}${image}`}
        ${item.note ? `<p class="custom-note">${esc(item.note)}</p>` : ""}
        ${actions}
      </article>
    `;
  }

  /* ─── Actions (clicks) ───────────────────────────── */
  function bindActions() {
    const handleActionClick = async event => {
      const videoButton = event.target.closest?.("[data-open-video]");
      if (videoButton && el.contains(videoButton)) {
        const source = videoButton.dataset.mediaUrl;
        if (source) openChallengeVideo(source);
        return;
      }
      const customButton = event.target.closest?.("[data-custom-action]");
      if (customButton && el.contains(customButton)) {
        customButton.closest("details")?.removeAttribute("open");
        const item = customAllChallenges.find(c => c.id === customButton.dataset.id);
        if (!item) return;
        const action = customButton.dataset.customAction;
        if (action === "edit") return openGiveModal(item);
        if (action === "complete") {
          if (item.proofType === "none") {
            try {
              await transitionCustomChallenge(item.id, { uid: user.uid, profileKey: ownKey, name: profile.name }, "submit-proof", { note: "No proof required." });
              void notifyPartnerSafely(ownKey, "challenge", `${profile.name} submitted “${item.title}” for review.`, `${item.id}-submitted`, "challenges");
              toast("Sent for review ♡"); renderChallengeHub();
            } catch (error) { toast(error.message || "Could not submit."); }
            return;
          }
          return openCompletionModal(item.id, item);
        }
        if (action === "delete" && !confirm("Delete this? This cannot be undone.")) return;
        customButton.disabled = true;
        try {
          let extra = {};
          if (action === "request-extension") {
            const reason = prompt("Why do you need more time?");
            if (reason === null) { customButton.disabled = false; return; }
            if (!reason.trim()) throw new Error("Add a short reason for the extension request.");
            const currentDeadline = Number(item.deadlineAt || Date.now());
            const dateValue = prompt("Suggest a new deadline (YYYY-MM-DD)", new Date(Math.max(Date.now() + 86400000, currentDeadline + 86400000)).toISOString().slice(0, 10));
            if (!dateValue) { customButton.disabled = false; return; }
            const requestedDeadlineAt = new Date(`${dateValue}T23:59:00`).getTime();
            if (!Number.isFinite(requestedDeadlineAt) || requestedDeadlineAt <= currentDeadline) throw new Error("Choose a date after the current deadline.");
            extra = { reason, requestedDeadlineAt };
          }
          if (action === "approve-extension") extra.deadlineAt = Number(item.extensionRequest?.requestedDeadlineAt || 0);
          if (action === "request-revision") extra.note = prompt("What should be added or changed?", "Please add another proof.") || "Please add another proof.";
          await transitionCustomChallenge(item.id, { uid: user.uid, profileKey: ownKey, name: profile.name }, action, extra);
          if (action === "delete") toast("Deleted.");
          if (action === "accept") { void notifyPartnerSafely(ownKey, "challenge", `${profile.name} accepted: ${item.title}`.slice(0, 240), `${item.id}-accepted`, "challenges"); toast("Accepted ♡"); }
          if (action === "complete") { void notifyPartnerSafely(ownKey, "challenge", `${profile.name} submitted proof for “${item.title}”.`, `${item.id}-submitted`, "challenges"); toast("Proof sent for review ♡"); }
          if (action === "request-extension") { void notifyPartnerSafely(ownKey, "challenge", `${profile.name} requested more time for “${item.title}”.`, `${item.id}-extension`, "challenges"); toast("Extension request sent."); }
          if (action === "approve-proof") { void notifyPartnerSafely(ownKey, "challenge", `Your proof for “${item.title}” was approved ♡`, `${item.id}-completed`, "challenges"); toast("Proof approved ♡"); }
          if (action === "approve-extension") toast("New deadline approved 📅");
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
      let previousSnapCompletedBy = null;
      button.disabled = true;
      try {
        const action = button.dataset.action;
        if (action === "water-add" || action === "water-remove") {
          const delta = action === "water-add" ? 1 : -1;
          queueWaterProgress(delta);
          return;
        } else if (action === "snap-complete") {
          const liveAssignment = assignments.find(item => item.id === assignmentId);
          if (liveAssignment) {
            previousSnapCompletedBy = [...(liveAssignment.completedBy || [])];
            liveAssignment.completedBy = [...(liveAssignment.completedBy || []), { uid: user.uid, profileKey: ownKey, name: profile.name }];
            scheduleRender();
          }
          await completeChallengeAssignment(assignmentId, { uid: user.uid, profileKey: ownKey, name: profile.name }, "Sent today's Snap 📸", "");
          void notifyPartnerSafely(ownKey, "challenge", `${profile.name} sent today's Snap.`, `${assignmentId}-completed`, "challenges");
          triggerCompletionSplash();
          toast("Snap marked ✓");
        }
      } catch (error) {
        console.error(error);
        if (button.dataset.action === "snap-complete") {
          const liveAssignment = assignments.find(item => item.id === assignmentId);
          if (liveAssignment) {
            liveAssignment.completedBy = previousSnapCompletedBy || (liveAssignment.completedBy || []).filter(p => !(p.uid === user.uid && p.profileKey === ownKey));
            scheduleRender();
          }
        }
        toast(error.message || "Could not update this.");
        button.disabled = false;
      }
    };
    el.addEventListener("click", handleActionClick);
    removeActionsListener = () => el.removeEventListener("click", handleActionClick);
  }

  function openChallengeVideo(source) {
    openVideoOverlay?.remove();
    const overlay = document.createElement("div");
    overlay.className = "custom-video-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Challenge video");
    const video = document.createElement("video");
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.src = source;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "custom-video-close";
    close.setAttribute("aria-label", "Close video");
    close.textContent = "×";
    const download = document.createElement("a");
    download.className = "custom-video-download-full";
    download.href = source;
    download.download = "challenge-video.mp4";
    download.textContent = "↓ Download video";
    const player = document.createElement("div");
    player.className = "custom-video-player";
    player.append(video, download);
    overlay.append(close, player);
    const dismiss = () => {
      video.pause();
      overlay.remove();
      if (openVideoOverlay === overlay) openVideoOverlay = null;
    };
    close.onclick = dismiss;
    overlay.onclick = event => { if (event.target === overlay) dismiss(); };
    document.body.append(overlay);
    openVideoOverlay = overlay;
    close.focus();
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
            <label>${assignment.proofType && assignment.proofType !== "none" ? `Proof (${esc(assignment.proofType)})` : "Proof (optional)"}
              <input type="file" name="photo" accept="${assignment.proofType === "photo" ? "image/*" : assignment.proofType === "video" ? "video/*" : assignment.proofType === "voice" ? "audio/*" : "image/*,video/*,audio/*"}" ${assignment.proofType && assignment.proofType !== "none" ? "required" : ""}>
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
      if (!selectedPhoto.type.startsWith("image/")) { image.classList.add("hidden"); return; }
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
          if (assignment.proofType === "photo" && !selectedPhoto.type.startsWith("image/") || assignment.proofType === "video" && !selectedPhoto.type.startsWith("video/") || assignment.proofType === "voice" && !selectedPhoto.type.startsWith("audio/")) throw new Error(`Please submit a ${assignment.proofType} proof.`);
          const timestamp = new Date().toLocaleString();
          const label = selectedPhoto.type.startsWith("video/") ? "Challenge Proof Video" : selectedPhoto.type.startsWith("audio/") ? "Challenge Proof Voice" : "Challenge Proof Photo";
          const result = await sendToTelegram(selectedPhoto, `${label} · ${profile.name} · ${timestamp}`);
          photoMetadata = { ...telegramMediaReferences(result), mimeType: telegramUploadMimeType(selectedPhoto), photoUrl: "" };
          if (selectedPhoto.type.startsWith("video/")) photoMetadata.videoMimeType = telegramUploadMimeType(selectedPhoto);
          if (selectedPhoto.type.startsWith("audio/")) photoMetadata.audioMimeType = telegramUploadMimeType(selectedPhoto);
          if (selectedPhoto.type.startsWith("image/")) photoMetadata.photoMimeType = telegramUploadMimeType(selectedPhoto);
        }
        await transitionCustomChallenge(assignmentId, { uid: user.uid, profileKey: ownKey, name: profile.name }, "submit-proof", { note: form.elements.note?.value?.trim() || "", ...photoMetadata });
        void notifyPartnerSafely(ownKey, "challenge", `${profile.name} submitted proof for a challenge.`, `${assignmentId}-submitted`, "challenges");
        triggerCompletionSplash();
        modalRoot.innerHTML = "";
        toast("Proof sent for review ♡");
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
  }, dayKey, 100);

  stopWaterChallenges = watchItems("waterChallenge", items => {
    if (!isCurrent()) return;
    waterTrackers = items;
    waterTrackersReady = true;
    reconcileTodayPoints();
    if (assignmentsReady && list.querySelector("[data-water-profile]")) {
      updateWaterProgressUI(list, Object.entries(partnerProfiles), ownKey, waterCountFor, true);
    } else {
      scheduleRender();
    }
  }, error => console.error("Water sync failed:", error), 120);

  stopCustomChallenges = watchItems("customChallenge", items => {
    if (!isCurrent()) return;
    customAllChallenges = items;
    scheduleRender();
  }, error => console.error("Custom challenges failed:", error), {});

  function onProfilesUpdated() { partnerProfiles = APP_CONFIG.profiles; render(); }
  removeProfilesListener = () => window.removeEventListener("couple-profiles-updated", onProfilesUpdated);
  window.addEventListener("couple-profiles-updated", onProfilesUpdated);

  function onChallengeEscape(event) {
    if (event.key === "Escape") {
      if (openVideoOverlay) { openVideoOverlay.querySelector(".custom-video-close")?.click(); return; }
      const compose = el.querySelector(".challenge-compose-page");
      if (compose) { window.App?.navigate("home"); return; }
      if (giveModalRoot.querySelector(".challenge-hub-page")) { closeChallengeHub(); return; }
      modalRoot.querySelector("[data-close-modal]")?.click();
    }
  }
  removeEscapeListener = () => window.removeEventListener("keydown", onChallengeEscape);
  window.addEventListener("keydown", onChallengeEscape);

  function hydrateTelegramImages() {
    el.querySelectorAll("[data-telegram-file-id]").forEach(media => {
      getTelegramMediaUrl(media.dataset.telegramFileId, media.dataset.telegramMime || "image/jpeg")
        .then(url => {
          if (!media.isConnected) return;
          media.src = url;
          if (media.matches(".custom-video-thumb")) {
            const button = media.closest(".custom-video-open");
            const download = media.closest(".custom-media-square")?.querySelector("[data-video-download]");
            if (button) {
              button.dataset.mediaUrl = url;
              button.disabled = false;
            }
            if (download) {
              download.href = url;
              download.removeAttribute("aria-disabled");
              download.removeAttribute("tabindex");
            }
          }
        })
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
        list.setAttribute("aria-busy", "true");
        list.innerHTML = `<div class="challenge-loading-skeleton" aria-label="Loading today's challenges">${Array.from({ length: 2 }, () => `<article class="challenge-skeleton-card" aria-hidden="true"><div class="challenge-skeleton-head"><i class="skeleton-shape challenge-skeleton-icon"></i><span><i class="skeleton-shape challenge-skeleton-title"></i><i class="skeleton-shape challenge-skeleton-subtitle"></i></span></div><i class="skeleton-shape challenge-skeleton-line"></i><i class="skeleton-shape challenge-skeleton-line short"></i><i class="skeleton-shape challenge-skeleton-action"></i></article>`).join("")}</div>`;
        return;
      }
      list.setAttribute("aria-busy", "false");
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
  const requestedEditItem = sessionStorage.getItem("challenge-compose-edit-item");
  sessionStorage.removeItem("challenge-compose-edit-item");
  const requestedComposeKind = sessionStorage.getItem("challenge-compose-kind");
  sessionStorage.removeItem("challenge-compose-kind");
  const openFullChallengeHub = sessionStorage.getItem("challenge-open-hub") === "true";
  sessionStorage.removeItem("challenge-open-hub");
  if (openFullChallengeHub) {
    openChallengeHub();
  } else if (requestedEditItem) {
    try { openGiveModal(JSON.parse(requestedEditItem)); }
    catch (error) { console.error("Could not open challenge editor:", error); toast("Could not open that challenge for editing."); }
  } else if (requestedComposeKind === "challenge" || requestedComposeKind === "punishment") openGiveModal(null, requestedComposeKind);
  prepareTodayChallenges();
  countdownTimer = window.setInterval(() => {
    el.querySelectorAll("[data-countdown-deadline]").forEach(node => {
      node.textContent = formatCountdown(Number(node.dataset.countdownDeadline));
    });
  }, 1000);
}

export function disposeChallenges() {
  document.body.classList.remove("challenge-hub-open");
  openVideoOverlay?.querySelector(".custom-video-close")?.click();
  openVideoOverlay = null;
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
