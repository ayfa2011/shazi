import { $, esc, toast, todayKey, compressImage, scheduleDubaiDayRollover } from "./utils.js";
import {
  ensureChallengeAssignment,
  watchChallengeAssignments,
  watchItems,
  acceptChallengeAssignment,
  completeChallengeAssignment,
  skipChallengeAssignment,
  notifyPartnerSafely
} from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { getDisplayName, getProfileKey } from "./profile-data.js";
import { challengeDays } from "./challenge-bank.js";

let stopChallenges = null, stopLegacyChallenges = null, dayRolloverTimer = null, challengeRenderToken = 0;

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
  const renderToken = challengeRenderToken;
  const isCurrent = () => renderToken === challengeRenderToken && el.isConnected;
  clearTimeout(dayRolloverTimer);
  dayRolloverTimer = scheduleDubaiDayRollover(() => {
    if (isCurrent()) window.App?.navigate("challenges");
  });
  const ownKey = getProfileKey(profile);
  const dayKey = todayKey();
  const week = challengeDays(dayKey, 7);
  let assignments = [], legacyCompletions = [], assignmentsReady = false, assignmentsError = false;
  let selectedTab = "today";
  let showSkipped = false;

  el.innerHTML = `
    <style>
      .challenge-page { width:min(760px,100%); margin:0 auto; }
      .challenge-page-head { display:flex; align-items:center; gap:10px; margin:2px 0 15px; }
      .challenge-page-head .challenge-sparkle { width:40px; height:40px; display:grid; place-items:center; border-radius:50%; background:#ffe6f0; font-size:21px; }
      .challenge-page-head h1 { margin:0; color:var(--deep); font-size:26px; }
      .challenge-tabs { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin-bottom:13px; padding:4px; border-radius:15px; background:#ffeaf2; }
      .challenge-tab { padding:9px 5px; border-radius:11px; background:transparent; color:#916b7d; font-size:13px; font-weight:600; }
      .challenge-tab.selected { background:#fff; color:#c83272; box-shadow:0 2px 8px #8f315d12; }
      .challenge-list { display:grid; gap:10px; }
      .challenge-card { padding:15px; border:1px solid #f2dce5; border-radius:17px; background:#fff; box-shadow:0 4px 16px #8f315d08; }
      .challenge-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
      .challenge-card h2 { margin:8px 0 4px; color:#60283f; font:700 17px/1.3 system-ui,sans-serif; }
      .challenge-card p { margin:4px 0 10px; color:#795364; font-size:13px; line-height:1.45; }
      .challenge-date { color:var(--muted); font-size:11px; }
      .challenge-status { flex:none; padding:5px 8px; border-radius:999px; background:#fff0f6; color:var(--deep); font-size:10px; font-weight:700; }
      .challenge-status.completed { background:#eaf8f0; color:#24794a; }
      .challenge-status.skipped { background:#f5f1f3; color:#806d76; }
      .challenge-actions { display:flex; justify-content:flex-end; gap:7px; margin-top:11px; }
      .challenge-actions button { padding:8px 13px; border-radius:999px; font-size:12px; font-weight:700; }
      .challenge-secondary { background:#fff0f6; color:var(--deep); }
      .challenge-main { background:#e65391; color:#fff; }
      .challenge-completion-photo { display:block; width:100%; max-height:280px; margin-top:9px; border-radius:13px; object-fit:cover; }
      .challenge-completed-note { margin:9px 0 0!important; padding:9px 11px; border-radius:11px; background:#fff7fa; color:#60283f!important; }
      .challenge-completed-by { margin-top:8px!important; color:var(--muted)!important; font-size:11px!important; }
      .challenge-section-label { margin:17px 0 8px; color:#8c737d; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
      .challenge-empty { padding:24px 12px; border:1px dashed #efc8d8; border-radius:16px; color:var(--muted); text-align:center; font-size:13px; }
      .challenge-skipped-toggle { width:100%; margin-top:16px; padding:10px; border:1px solid #f0dfe6; border-radius:12px; background:#fff; color:#806d76; text-align:left; font-size:12px; font-weight:700; }
      .challenge-modal { position:fixed; inset:0; z-index:70; display:grid; place-items:center; padding:16px; background:#32162580; }
      .challenge-modal-card { width:min(460px,100%); padding:18px; border:1px solid #f1dbe5; border-radius:20px; background:#fffafd; box-shadow:0 20px 60px #54213b30; }
      .challenge-modal-head { display:flex; justify-content:space-between; align-items:center; gap:10px; }
      .challenge-modal-head h2 { margin:0; color:var(--deep); font-size:20px; }
      .challenge-modal-close { width:34px; height:34px; border-radius:50%; background:#ffe7f0; color:var(--deep); font-size:20px; }
      .challenge-complete-form { display:grid; gap:12px; margin:13px 0 0; }
      .challenge-complete-form textarea { min-height:82px; resize:vertical; }
      .challenge-complete-form input[type=file] { width:100%; padding:8px; font-size:12px; }
      .challenge-photo-preview { max-width:100%; max-height:180px; border-radius:12px; object-fit:cover; }
      .challenge-modal-actions { display:flex; justify-content:flex-end; gap:8px; }
      .challenge-modal-actions button { padding:9px 14px; border-radius:999px; }
      @media(max-width:420px) { .challenge-page-head h1 { font-size:23px; } .challenge-card { padding:13px; } .challenge-tabs button { font-size:12px; } }
    </style>
    <section class="challenge-page">
      <header class="challenge-page-head"><span class="challenge-sparkle" aria-hidden="true">✨</span><h1>Challenges</h1></header>
      <nav class="challenge-tabs" aria-label="Challenge sections">
        <button type="button" class="challenge-tab selected" data-tab="today">Today</button>
        <button type="button" class="challenge-tab" data-tab="week">This Week</button>
        <button type="button" class="challenge-tab" data-tab="completed">Completed</button>
      </nav>
      <div class="challenge-list" id="challenge-list"><p class="challenge-empty">Loading your challenges…</p></div>
      <div id="challenge-modal-root"></div>
    </section>
  `;

  const list = $("#challenge-list", el);
  const modalRoot = $("#challenge-modal-root", el);

  el.querySelectorAll("[data-tab]").forEach(button => {
    button.onclick = () => {
      selectedTab = button.dataset.tab;
      el.querySelectorAll("[data-tab]").forEach(tab => tab.classList.toggle("selected", tab === button));
      render();
    };
  });

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

  function challengeCard(challenge, showDate = false) {
    const assignment = assignmentFor(challenge);
    const status = assignment.status || "upcoming";
    const hasSkipped = (assignment.skippedBy || []).some(person => person.uid === user.uid || person.profileKey === ownKey);
    const hasCompleted = (assignment.completedBy || []).some(person => person.uid === user.uid || person.profileKey === ownKey);
    const badgeClass = status === "completed" || status === "skipped" ? ` ${status}` : "";
    const dateText = showDate ? `<span class="challenge-date">${esc(friendlyDate(challenge.dayKey))}</span>` : "";
    const actions = status === "upcoming"
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
        <div class="challenge-card-head"><div>${dateText}<h2>${esc(assignment.title || challenge.title)}</h2></div><span class="challenge-status${badgeClass}">${esc(statusLabel(status))}</span></div>
        <p>${esc(assignment.description || challenge.description)}</p>
        ${completion}
        ${actions}
      </article>
    `;
  }

  function renderToday() {
    const todayChallenge = week[0];
    const current = assignmentFor(todayChallenge);
    const skipped = assignments.filter(item => item.status === "skipped");
    let html = current.status === "skipped"
      ? `<p class="challenge-empty">Today's challenge was skipped. You can find it below.</p>`
      : challengeCard(todayChallenge);
    if (skipped.length) {
      html += `<button type="button" class="challenge-skipped-toggle" id="toggle-skipped">${showSkipped ? "Hide" : "Show"} skipped challenges (${skipped.length})</button>`;
      if (showSkipped) {
        html += `<p class="challenge-section-label">Skipped</p>${skipped.map(item => challengeCard({ ...item, id: item.id, dayKey: item.challengeDate }, true)).join("")}`;
      }
    }
    list.innerHTML = html;
    $("#toggle-skipped", list)?.addEventListener("click", () => {
      showSkipped = !showSkipped;
      renderToday();
      bindActions();
    });
  }

  function render() {
    if (!isCurrent()) return;
    if (assignmentsError) {
      list.innerHTML = `<p class="challenge-empty">Challenges could not be loaded. Please check your connection and try again.</p>`;
      return;
    }
    if (!assignmentsReady) {
      list.innerHTML = `<p class="challenge-empty">Loading your challenges…</p>`;
      return;
    }
    if (selectedTab === "today") {
      renderToday();
    } else if (selectedTab === "week") {
      const upcoming = week.filter(challenge => {
        const status = assignmentFor(challenge).status || "upcoming";
        return challenge.dayKey !== dayKey && (status === "upcoming" || status === "in-progress");
      });
      list.innerHTML = upcoming.length
        ? `<p class="challenge-section-label">Planned for this week</p>${upcoming.map(challenge => challengeCard(challenge, true)).join("")}`
        : `<p class="challenge-empty">No upcoming challenges this week.</p>`;
    } else {
      const completed = assignments
        .filter(item => item.status === "completed")
        .sort((a, b) => (b.completedAt?.toMillis?.() || new Date(b.completedAt || 0).getTime()) - (a.completedAt?.toMillis?.() || new Date(a.completedAt || 0).getTime()));
      const legacyCards = legacyCompletions.map(item => `
      <article class="challenge-card">
        <div class="challenge-card-head"><div><span class="challenge-date">${esc(item.challengeDate ? friendlyDate(item.challengeDate) : "")}</span><h2>${esc(item.title || "Daily Challenge")}</h2></div><span class="challenge-status completed">✅ Completed</span></div>
        ${item.note ? `<p class="challenge-completed-note">${esc(item.note)}</p>` : ""}
        <p class="challenge-completed-by">Completed by ${esc(getDisplayName(item.author, item.authorName || "Us"))}</p>
      </article>
      `);
      list.innerHTML = completed.length || legacyCards.length
      ? `${completed.map(item => challengeCard({ ...item, id: item.id, dayKey: item.challengeDate }, true)).join("")}${legacyCards.join("")}`
      : `<p class="challenge-empty">Completed challenges will be saved here ♡</p>`;
    }

    bindActions();
  }

  function bindActions() {
    list.querySelectorAll("[data-action]").forEach(button => {
      button.onclick = async () => {
        const assignmentId = button.dataset.id;
        const assignment = assignments.find(item => item.id === assignmentId) || assignmentFor(week.find(challenge => challenge.id === assignmentId));
        if (!assignment || !ownKey) return toast("Could not identify this challenge.");
        button.disabled = true;
        try {
          if (button.dataset.action === "accept") {
            await acceptChallengeAssignment(assignmentId, user.uid, ownKey, profile.name);
            toast("Challenge accepted. Have fun together ♡");
          } else if (button.dataset.action === "skip") {
            await skipChallengeAssignment(assignmentId, user.uid, ownKey, profile.name);
            toast("Challenge moved to Skipped.");
          } else {
            const challengeId = assignment.id.includes('-') ? assignment.id.split('-').slice(1).join('-') : assignment.id;
            openCompletionModal(assignmentId, assignment, challengeId);
          }
        } catch (error) {
          console.error("Could not update challenge:", error);
          toast(error.message || "Could not update this challenge.");
          button.disabled = false;
        }
      };
    });
  }

  function openCompletionModal(assignmentId, assignment, challengeId) {
    const isSnap = challengeId === "send-snap";
    const isDrinkWater = challengeId === "drink-water";

    modalRoot.innerHTML = `
      <div class="challenge-modal" id="challenge-completion-modal" role="dialog" aria-modal="true" aria-labelledby="challenge-completion-title">
        <section class="challenge-modal-card">
          <header class="challenge-modal-head"><h2 id="challenge-completion-title">${isSnap ? "Snap a photo!" : isDrinkWater ? "Hydrate together!" : "Complete challenge"}</h2><button type="button" class="challenge-modal-close" data-close-modal aria-label="Close">×</button></header>
          <p class="muted">${esc(assignment.title)}</p>
          <form class="challenge-complete-form" id="challenge-complete-form">
            ${isSnap ? `<label>Snap a photo<input type="file" name="photo" accept="image/*" capture="environment" required></label>` :
              isDrinkWater ? `<p>Did you both drink a glass of water?</p>` :
              `<label>Note (optional)<textarea name="note" maxlength="500" placeholder="Add a little note about it…"></textarea></label>
            <label>Photo (optional)<input type="file" name="photo" accept="image/*"></label>`}
            <img class="challenge-photo-preview hidden" id="challenge-photo-preview" alt="Selected completion photo">
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
    form.elements.photo.onchange = () => {
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
    };
    form.onsubmit = async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Saving…";
      try {
        const photoUrl = selectedPhoto ? await compressImage(selectedPhoto) : "";
        if (selectedPhoto && !photoUrl) throw new Error("Could not read that photo. Choose another image.");
        await completeChallengeAssignment(assignmentId, {
          uid: user.uid,
          profileKey: ownKey,
          name: profile.name
        }, form.elements.note.value.trim(), photoUrl);
        void notifyPartnerSafely(ownKey, "challenge", `${profile.name} completed a challenge.`, assignmentId, "challenges");
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

  async function prepareWeek() {
    try {
      const prepared = await Promise.all(week.map(challenge => ensureChallengeAssignment(challenge)));
      const current = new Map(prepared.map(assignment => [assignment.id, assignment]));
      assignments.forEach(assignment => current.set(assignment.id, assignment));
      assignments = [...current.values()];
      assignmentsReady = true;
      render();
    } catch (error) {
      console.error("Could not prepare this week's challenges:", error);
      if (isCurrent()) {
        list.innerHTML = `<p class="challenge-empty">Challenges could not be loaded. Please check your connection and try again.</p>`;
        toast(error.message || "Could not load challenges.");
      }
    }
  }

  stopChallenges = watchChallengeAssignments(items => {
    if (!isCurrent()) return;
    assignmentsError = false;
    assignments = items;
    render();
  }, error => {
    console.error("Challenge updates could not be synced:", error);
    if (!isCurrent()) return;
    assignmentsError = true;
    assignmentsReady = true;
    list.innerHTML = `<p class="challenge-empty">Challenges could not be loaded. Please check your connection and try again.</p>`;
    toast("Challenge updates could not be synced.");
  });
  stopLegacyChallenges = watchItems("challenge", items => {
    if (!isCurrent()) return;
    legacyCompletions = items.filter(item => item.done);
    if (selectedTab === "completed") render();
  }, error => {
    console.error("Older challenges could not be loaded:", error);
    if (!isCurrent()) return;
    toast("Older challenges could not be loaded.");
  });
  prepareWeek();
}

export function disposeChallenges() {
  challengeRenderToken++;
  clearTimeout(dayRolloverTimer);
  dayRolloverTimer = null;
  stopChallenges?.();
  stopChallenges = null;
  stopLegacyChallenges?.();
  stopLegacyChallenges = null;
}
