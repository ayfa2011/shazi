import { $, esc, toast, todayKey, compressImageWithFilter, scheduleDubaiDayRollover } from "./utils.js";
import {
  ensureChallengeAssignment,
  watchChallengeAssignments,
  watchItems,
  acceptChallengeAssignment,
  completeChallengeAssignment,
  skipChallengeAssignment,
  notifyPartnerSafely,
  addItem,
  setItem,
  transitionCustomChallenge,
  saveLovePhoto
} from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { findProfileForAuthor, getProfileKey } from "./profile-data.js";
import { challengeDays } from "./challenge-bank.js";
import { uploadLoveChallengePhoto } from "./drive.js";
import { sendToTelegram } from "../src/services/telegramService.js";

let stopChallenges = null, stopLegacyChallenges = null, stopCustomChallenges = null, stopWaterChallenges = null, dayRolloverTimer = null, challengeRenderToken = 0;
  let customChallenges = [], customCompletedChallenges = [], waterTrackers = [], loveUploads = [];

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
  const todayChallenges = week.filter(challenge => challenge.dayKey === dayKey);
  let partnerProfiles = APP_CONFIG.profiles;
  let assignments = [], assignmentsReady = false, assignmentsError = false;
  let selectedTab = "today";
  let showSkipped = false;


  el.innerHTML = `
    <style>
      .challenge-page { width:min(760px,100%); margin:0 auto; }
      .summary-card { background: radial-gradient(circle at top, #fff 0, #fff7fa 45%, #ffe8f1 100%); padding: 19px; border-radius: 24px; text-align: center; margin-bottom: 17px; border: 1px solid #f2dce5; box-shadow: 0 8px 25px #8f315d10; }
      .summary-card h3 { margin: 0 0 14px; color: #60283f; font:700 20px Georgia,serif; }
      .score-players { display:grid; grid-template-columns:1fr auto 1fr; gap:12px; align-items:center; }
      .score-person { display:flex; align-items:center; gap:10px; min-width:0; text-align:left; }
      .score-person:last-child { flex-direction:row-reverse; text-align:right; }
      .score-avatar { width:56px; height:56px; flex:none; border-radius:50%; object-fit:cover; border:3px solid #fff; box-shadow:0 2px 9px #8f315d20; }
      .score-name { display:block; color:#795364; font-size:12px; }
      .score-value { display:block; color:#c83272; font:700 24px Georgia,serif; }
      .score-heart { color:#e65391; font-size:20px; }
      .score-caption { margin:9px 0 0; font-size:11px; }
      .challenge-page-head { display:flex; align-items:center; gap:10px; margin:2px 0 15px; }
      .challenge-page-head .challenge-sparkle { width:40px; height:40px; display:grid; place-items:center; border-radius:50%; background:#ffe6f0; font-size:21px; }
      .challenge-page-head h1 { margin:0; color:var(--deep); font-size:26px; }
      .challenge-tabs { display:grid; grid-template-columns:repeat(2,1fr); gap:5px; margin-bottom:13px; padding:4px; border-radius:15px; background:#ffeaf2; }
      .challenge-tab { padding:9px 5px; border-radius:11px; background:transparent; color:#916b7d; font-size:13px; font-weight:600; }
      .challenge-tab.selected { background:#fff; color:#c83272; box-shadow:0 2px 8px #8f315d12; }
      .challenge-list { display:grid; gap:10px; }
      .challenge-card { padding:15px; border:1px solid #f2dce5; border-radius:17px; background:#fff; box-shadow:0 4px 16px #8f315d08; position: relative; overflow: hidden; }
      .challenge-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
      .challenge-card h2 { margin:8px 0 4px; color:#60283f; font:700 17px/1.3 system-ui,sans-serif; }
      .challenge-card p { margin:4px 0 10px; color:#795364; font-size:13px; line-height:1.45; }
      .challenge-date { color:var(--muted); font-size:11px; }
      .challenge-status { flex:none; padding:5px 8px; border-radius:999px; background:#fff0f6; color:var(--deep); font-size:10px; font-weight:700; }
      .challenge-status.completed { background:#eaf8f0; color:#24794a; }
      .challenge-status.skipped { background:#f5f1f3; color:#806d76; }
      .challenge-actions { display:flex; justify-content:flex-end; gap:7px; margin-top:11px; }
      .challenge-actions button { padding:8px 13px; border-radius:999px; font-size:12px; font-weight:700; border: none; cursor: pointer; }
      .challenge-secondary { background:#fff0f6; color:var(--deep); }
      .challenge-main { background:#e65391; color:#fff; }
      .challenge-completion-photo { display:block; width:100%; max-height:280px; margin-top:9px; border-radius:13px; object-fit:cover; }
      .challenge-completed-note { margin:9px 0 0!important; padding:9px 11px; border-radius:11px; background:#fff7fa; color:#60283f!important; }
      .challenge-completed-by { margin-top:8px!important; color:var(--muted)!important; font-size:11px!important; }
      .challenge-section-label { margin:17px 0 8px; color:#8c737d; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
      .challenge-empty { padding:24px 12px; border:1px dashed #efc8d8; border-radius:16px; color:var(--muted); text-align:center; font-size:13px; }
      .challenge-sections { display:flex; gap:8px; margin:0 0 12px; }
      .challenge-sections button { flex:1; padding:9px; border-radius:12px; background:#fff; border:1px solid #f2dce5; color:#795364; font-weight:700; }
      .challenge-sections button.selected { background:#e65391; color:#fff; }
      .give-challenge-hero { display:flex; align-items:center; gap:11px; margin:0 0 14px; padding:12px 14px; border-radius:18px; background:linear-gradient(110deg,#fff2f7,#ffe1ee); border:1px solid #f4ccdc; box-shadow:0 6px 18px #8f315d0c; }
      .give-challenge-hero .gift { font-size:25px; }
      .give-challenge-copy { flex:1; text-align:left; }
      .give-challenge-copy strong { display:block; color:#60283f; font:700 15px Georgia,serif; }
      .give-challenge-copy small { color:#896b78; }
      .give-challenge-hero button { border:0; border-radius:999px; padding:10px 14px; background:#d84483; color:white; font-weight:700; white-space:nowrap; }
      .love-widget { margin-top:12px; padding:13px; border-radius:16px; background:linear-gradient(135deg,#fff4f8,#fef0eb); text-align:center; }
      .love-photos { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin:10px 0; }
      .love-photo-card { position:relative; min-height:100px; overflow:hidden; border-radius:13px; background:#f9dce8; }
      .love-photo-card img { width:100%; height:180px; object-fit:cover; display:block; transition:filter .3s; }
      .love-photo-card img.locked { filter:blur(18px); transform:scale(1.08); }
      .love-photo-label { position:absolute; bottom:0; left:0; right:0; padding:6px; background:#32162590; color:white; font-size:11px; }
      .love-waiting { color:#9b5271; font:italic 13px Georgia,serif; }
      .love-upload { border:0; border-radius:999px; padding:10px 15px; background:#d84483; color:white; font-weight:700; }
      .challenge-skipped-toggle { width:100%; margin-top:16px; padding:10px; border: none; border-radius:12px; background:#fff; color:#806d76; text-align:left; font-size:12px; font-weight:700; cursor: pointer; }
      .challenge-modal { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; padding:16px; background:#32162580; }
      .challenge-modal-card { width:min(460px,100%); padding:18px; border:1px solid #f1dbe5; border-radius:20px; background:#fffafd; box-shadow:0 20px 60px #54213b30; }
      .challenge-modal-head { display:flex; justify-content:space-between; align-items:center; gap:10px; }
      .challenge-modal-head h2 { margin:0; color:var(--deep); font-size:20px; }
      .challenge-modal-close { width:34px; height:34px; border-radius:50%; background:#ffe7f0; color:var(--deep); font-size:20px; border: none; cursor: pointer; }
      .challenge-complete-form { display:grid; gap:12px; margin:13px 0 0; }
      .challenge-complete-form label { display: grid; gap: 4px; font-size: 13px; color: #60283f; font-weight: 600; }
      .challenge-complete-form textarea { min-height:82px; resize:vertical; padding: 8px; border-radius: 10px; border: 1px solid #f1dbe5; }
      .challenge-complete-form input[type=file], .challenge-complete-form input[type=text] { width:100%; padding:8px; font-size:12px; border-radius: 10px; border: 1px solid #f1dbe5; }
      .challenge-photo-preview { max-width:100%; max-height:180px; border-radius:12px; object-fit:cover; }
      .challenge-modal-actions { display:flex; justify-content:flex-end; gap:8px; }
      .challenge-modal-actions button { padding:9px 14px; border-radius:999px; border: none; cursor: pointer; }
      .snap-preview-container { position: relative; margin-top: 10px; border-radius: 13px; overflow: hidden; }
      .snap-blur { filter: blur(25px); transition: filter 0.3s ease; cursor: pointer; }
      .snap-blur.revealed { filter: blur(0); }
      .snap-reveal-hint { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,0.1); color: white; font-weight: 700; pointer-events: none; }
      .water-tracker { display: flex; gap: 8px; margin: 10px 0; justify-content: center; }
      .water-glass { font-size: 32px; filter: grayscale(1); cursor: pointer; transition: transform 0.2s; }
      .water-glass.filled { filter: grayscale(0); }
      .water-glass:active { transform: scale(1.2); }
      .water-widget { margin-top:12px; padding:13px; border-radius:15px; background:linear-gradient(135deg,#effaff,#f3f0ff); }
      .water-bottle-row { display:flex; align-items:center; gap:13px; }
      .water-bottle { width:54px; height:90px; border:3px solid #73bde9; border-radius:14px 14px 11px 11px; position:relative; overflow:hidden; background:#fff; flex:none; }
      .water-bottle:before { content:""; position:absolute; top:-9px; left:14px; width:20px; height:11px; border:3px solid #73bde9; border-radius:5px 5px 0 0; background:#dff5ff; }
      .water-fill { position:absolute; bottom:0; left:0; right:0; background:linear-gradient(#83dcff,#329de5); transition:height .35s ease; opacity:.9; }
      .water-counts { flex:1; min-width:0; }
      .water-counts strong { display:block; color:#205c83; font-size:14px; }
      .water-counts small { color:#58798b; font-size:12px; }
      .water-add { margin-top:9px; padding:8px 14px; border:0; border-radius:999px; background:#269bd9; color:#fff; font-weight:700; cursor:pointer; }
      .water-celebrate { margin-top:10px; padding:10px; border-radius:12px; background:#e7f8eb; color:#207a42; text-align:center; font-weight:800; }
      .snap-mark { margin-top:10px; padding:10px 14px; border:0; border-radius:999px; background:#e65391; color:#fff; font-weight:700; cursor:pointer; }
      .snap-mark:disabled,.water-add:disabled { opacity:.55; cursor:default; }
      .custom-challenge-banner { background: linear-gradient(135deg, #fff0f6, #ffe4ef); border: 1px solid #f2dce5; border-radius: 17px; padding: 15px; margin-bottom: 15px; display: flex; align-items: center; gap: 12px; animation: slideIn 0.5s ease-out; }
      @keyframes slideIn { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .custom-challenge-icon { font-size: 24px; }
      .custom-challenge-info { flex: 1; }
      .custom-challenge-info strong { display: block; font-size: 14px; color: var(--deep); }
      .custom-challenge-info p { margin: 2px 0 0; font-size: 12px; color: #795364; }
      .completion-splash { position: fixed; inset: 0; z-index: 2000; pointer-events: none; display: grid; place-items: center; }
      .splash-heart { font-size: 60px; animation: popUp 1s forwards; }
      @keyframes popUp { 0% { transform: scale(0); opacity: 0; } 50% { transform: scale(1.5); opacity: 1; } 100% { transform: scale(1); opacity: 0; } }
      @media(max-width:420px) { .challenge-page-head h1 { font-size:23px; } .challenge-card { padding:13px; } .challenge-tabs button { font-size:12px; } }
    </style>
    <section class="challenge-page">
      <div class="summary-card" id="challenge-scoreboard"></div>
      <header class="challenge-page-head">
        <span class="challenge-sparkle" aria-hidden="true">✨</span>
        <h1>Challenges</h1>
      </header>
      <button type="button" class="give-challenge-hero" id="give-challenge-btn"><span class="gift">💌</span><span class="give-challenge-copy"><strong>Send a little challenge</strong><small>Make their day with something sweet</small></span><span>Give Challenge →</span></button>
      <div id="give-challenge-modal-root"></div>
      <div id="custom-challenge-banner-root"></div>
      <nav class="challenge-tabs" aria-label="Challenge sections">
        <button type="button" class="challenge-tab selected" data-tab="today">Today</button>
        <button type="button" class="challenge-tab" data-tab="completed">Completed</button>
      </nav>
      <div id="custom-assignment-lists"></div>
      <div class="challenge-list" id="challenge-list"><p class="challenge-empty">Loading your challenges…</p></div>
      <div id="challenge-modal-root"></div>
    </section>
  `;

  const list = $("#challenge-list", el);
  const modalRoot = $("#challenge-modal-root", el);
  const giveModalRoot = $("#give-challenge-modal-root", el);
  const customBannerRoot = $("#custom-challenge-banner-root", el);
  const scoreboard = $("#challenge-scoreboard", el);
  const customListsRoot = $("#custom-assignment-lists", el);
  let customView = "received";

  function renderScoreboard() {
    const otherKey = Object.keys(partnerProfiles).find(key => key !== ownKey) || "shazy";
    const people = [ownKey || "kebyy", otherKey];
    scoreboard.innerHTML = `<h3>Our little love scoreboard ♡</h3><div class="score-players">${people.map(key => {
      const person = partnerProfiles[key] || APP_CONFIG.profiles[key];
      const points = assignments.filter(item => item.challengeDate === dayKey && (item.completedBy || []).some(done => done.profileKey === key || done.uid === person?.authUid)).length;
      return `<div class="score-person"><img class="score-avatar" src="${esc(person?.avatar || "")}" alt="${esc(person?.name || "Partner")}"><span><small class="score-name">${esc(person?.name || "Partner")}</small><strong class="score-value">${points} <small>pts</small></strong></span></div>`;
    }).join(`<span class="score-heart">♥</span>`)}</div><p class="score-caption">One point for every challenge completed today</p>`;
  }

  function triggerCompletionSplash() {
    const splash = document.createElement("div");
    splash.className = "completion-splash";
    splash.innerHTML = `<div class="splash-heart">❤️</div>`;
    document.body.appendChild(splash);
    setTimeout(() => splash.remove(), 1000);
  }

  function renderCustomBanner() { customBannerRoot.innerHTML = ""; }

  el.querySelectorAll("[data-tab]").forEach(button => {
    button.onclick = () => {
      selectedTab = button.dataset.tab;
      el.querySelectorAll("[data-tab]").forEach(tab => tab.classList.toggle("selected", tab === button));
      render();
    };
  });

  function openGiveModal(editing = null) {
    giveModalRoot.innerHTML = `
      <div class="challenge-modal" id="give-challenge-modal" role="dialog" aria-modal="true">
        <section class="challenge-modal-card">
          <header class="challenge-modal-head"><h2>${editing ? "Edit your challenge" : "Give a Challenge"}</h2><button type="button" class="challenge-modal-close" data-close-give-modal>×</button></header>
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
    const ownWater = waterTrackers.find(item => item.dayKey === dayKey && item.profileKey === ownKey);
    const otherKey = Object.keys(APP_CONFIG.profiles).find(key => key !== ownKey);
    const partnerWater = waterTrackers.find(item => item.dayKey === dayKey && item.profileKey === otherKey);
    const ownCount = Math.max(0, Math.min(8, Number(ownWater?.count || 0)));
    const partnerCount = Math.max(0, Math.min(8, Number(partnerWater?.count || 0)));
    const loveRecord = loveUploads.find(item => item.dayKey === dayKey);
    const uploads = loveRecord?.uploads || {};
    const otherKeyForLove = Object.keys(partnerProfiles).find(key => key !== ownKey) || "shazy";
    const revealed = Boolean(uploads[ownKey]?.photoUrl && uploads[otherKeyForLove]?.photoUrl && uploads[ownKey]?.dayKey === dayKey && uploads[otherKeyForLove]?.dayKey === dayKey);
    const loveWidget = isLoveChallenge ? `<div class="love-widget">
      ${revealed ? `<p>Our little love notes are here 🌸</p>` : `<p class="love-waiting">${uploads[ownKey]?.dayKey === dayKey ? "A secret photo is waiting! Upload yours to reveal each other's love note today 🌸" : "Share a little something today; it stays hidden until you both upload 🌸"}</p>`}
      <div class="love-photos">${[ownKey, otherKeyForLove].map(key => { const image = uploads[key]; const person = partnerProfiles[key] || APP_CONFIG.profiles[key]; const visiblePhoto = image?.photoUrl && (revealed || key === ownKey); return visiblePhoto ? `<div class="love-photo-card"><img src="${esc(image.photoUrl)}" alt="${esc(person?.name || "Partner")}'s love photo"><span class="love-photo-label">${esc(person?.name || "Partner")}</span></div>` : `<div class="love-photo-card" style="display:grid;place-items:center;color:#a76180">${image?.photoUrl ? "🔒" : "♡"}<span class="love-photo-label">${esc(person?.name || "Partner")} · ${image?.photoUrl ? "secret" : "waiting"}</span></div>`; }).join("")}</div>
      ${uploads[ownKey]?.dayKey === dayKey ? `<button class="love-upload" type="button" disabled>✓ Your photo is in</button>` : `<button class="love-upload" type="button" data-action="love-upload" data-id="${esc(assignment.id)}">Add your photo ♡</button>`}
      </div>` : "";
    const specialWidget = isSnapChallenge
      ? `<button type="button" class="snap-mark" data-action="snap-complete" data-id="${esc(assignment.id)}" ${hasCompleted ? "disabled" : ""}>${hasCompleted ? "✓ Snap sent today" : "I sent today's Snap 📸"}</button>`
      : isWaterChallenge ? `<div class="water-widget">
          <div class="water-bottle-row"><div class="water-bottle" aria-label="Water bottle"><div class="water-fill" style="height:${ownCount / 8 * 100}%"></div></div>
          <div class="water-counts"><strong>💧 ${ownCount}/8 glasses</strong><small>Your daily hydration goal</small><div class="water-tracker" aria-label="Water progress">${Array.from({length:8},(_,i)=>`<span class="water-glass ${i < ownCount ? "filled" : ""}">${i < ownCount ? "💧" : "🥛"}</span>`).join("")}</div>
          <button type="button" class="water-add" data-action="water-add" data-id="${esc(assignment.id)}" ${ownCount >= 8 ? "disabled" : ""}>+ Glass</button></div></div>
          <p><b>Keby:</b> ${ownKey === "kebyy" ? ownCount : partnerCount}/8 &nbsp; · &nbsp; <b>Shazy:</b> ${ownKey === "shazy" || ownKey === "shazila" ? ownCount : partnerCount}/8</p>
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
        <div class="challenge-card-head"><div>${dateText}<h2>${esc(assignment.title || challenge.title)}</h2></div><span class="challenge-status${badgeClass}">${esc(statusLabel(status))}</span></div>
        <p>${esc(assignment.description || challenge.description)}</p>
        ${completion}
        ${specialWidget}
        ${actions}
      </article>
    `;
  }

  function renderToday() {
    const skipped = assignments.filter(item => assignmentFor(item).status === "skipped");
    let html = todayChallenges.map(challenge => assignmentFor(challenge).status === "skipped"
      ? `<p class="challenge-empty">Today's ${esc(challenge.title)} was skipped. You can find it below.</p>`
      : challengeCard(challenge)).join("");
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
    renderCustomBanner();
    renderScoreboard();
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
      const received = customChallenges.filter(item => item.recipientKey === ownKey);
      const sent = customChallenges.filter(item => item.author === user.uid);
      customListsRoot.innerHTML = `<p class="challenge-section-label">Give Challenge · partner assignments</p><nav class="challenge-sections"><button type="button" data-custom-view="received" class="${customView === "received" ? "selected" : ""}">Received (${received.length})</button><button type="button" data-custom-view="sent" class="${customView === "sent" ? "selected" : ""}">Sent (${sent.length})</button></nav>${customView === "received" ? customChallengeCards(received, true) : customChallengeCards(sent, false)}`;
      customListsRoot.querySelectorAll("[data-custom-view]").forEach(button => button.onclick = () => { customView = button.dataset.customView; render(); });
    } else {
      customListsRoot.innerHTML = "";
      const oneMonthAgo = Date.now() - 30 * 86400000;
      const completed = assignments
        .filter(item => assignmentFor(item).status === "completed" && (item.completedAt?.toMillis?.() || new Date(item.completedAt || 0).getTime() || Date.parse(`${item.challengeDate}T12:00:00`)) > oneMonthAgo)
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

    bindActions();
    renderScoreboard();
  }

  function customChallengeCards(items, received) {
    if (!items.length) return `<p class="challenge-empty">${received ? "No partner challenges are waiting right now ♡" : "Challenges you send will appear here ♡"}</p>`;
    return `<div class="challenge-list">${items.sort((a,b) => Number(b.sentAtMs || b.createdAtMs || 0) - Number(a.sentAtMs || a.createdAtMs || 0)).map(item => {
      const date = Number(item.sentAtMs || item.assignedAtMs || item.createdAtMs || 0);
      const status = item.status === "in-progress" ? "Accepted" : item.status === "completed" ? "Completed" : item.status === "declined" ? "Declined" : "Pending";
      return `<article class="challenge-card"><div class="challenge-card-head"><div><span class="challenge-date">${received ? "Assigned" : "Sent"} ${date ? esc(new Date(date).toLocaleDateString("en-GB", {day:"numeric",month:"short",year:"numeric"})) : ""}</span><h2>${esc(item.title || "Custom Challenge")}</h2></div><span class="challenge-status${status === "Completed" ? " completed" : ""}">${status}</span></div>${item.description ? `<p>${esc(item.description)}</p>` : ""}${item.note ? `<p class="challenge-completed-note">${esc(item.note)}</p>` : ""}${item.photoUrl ? `<img class="challenge-completion-photo" src="${esc(item.photoUrl)}" alt="Challenge completion">` : ""}${received && item.status === "upcoming" ? `<div class="challenge-actions"><button class="challenge-secondary" data-custom-action="decline" data-id="${esc(item.id)}">Decline</button><button class="challenge-main" data-custom-action="accept" data-id="${esc(item.id)}">Accept</button></div>` : ""}${received && item.status === "in-progress" ? `<div class="challenge-actions"><button class="challenge-main" data-custom-action="complete" data-id="${esc(item.id)}">Mark Complete</button></div>` : ""}${!received && item.status === "upcoming" ? `<div class="challenge-actions"><button class="challenge-secondary" data-custom-action="edit" data-id="${esc(item.id)}">Edit</button><button class="challenge-secondary" data-custom-action="delete" data-id="${esc(item.id)}">Delete</button></div>` : ""}</article>`;
    }).join("")}</div>`;
  }

  function bindActions() {
    customListsRoot.querySelectorAll("[data-custom-action]").forEach(button => button.onclick = async () => {
      const item = customChallenges.find(challenge => challenge.id === button.dataset.id);
      if (!item) return;
      const action = button.dataset.customAction;
      if (action === "edit") return openGiveModal(item);
      if (action === "complete") return openCompletionModal(item.id, item, "custom");
      button.disabled = true;
      try {
        await transitionCustomChallenge(item.id, { uid: user.uid, profileKey: ownKey, name: profile.name }, action);
        if (action === "delete") toast("Challenge deleted.");
        if (action === "accept") { void notifyPartnerSafely(ownKey, "challenge", `${profile.name} accepted your challenge: ${item.title}`.slice(0, 240), `${item.id}-accepted`, "challenges"); toast("Challenge accepted ♡"); }
        if (action === "decline") { void notifyPartnerSafely(ownKey, "challenge", `${profile.name} declined your challenge: ${item.title}`.slice(0, 240), `${item.id}-declined`, "challenges"); toast("Challenge declined."); }
      } catch (error) { toast(error.message || "Could not update this challenge."); button.disabled = false; }
    });
    list.querySelectorAll("[data-action]").forEach(button => {
      button.onclick = async () => {
        const assignmentId = button.dataset.id;
        const assignment = assignments.find(item => item.id === assignmentId);
        const challenge = week.find(item => item.id === assignmentId);
        if (!assignment && !challenge) return toast("Could not identify this challenge.");
        const resolvedAssignment = assignment || assignmentFor(challenge);
        if (!resolvedAssignment || !ownKey) return toast("Could not identify this challenge.");
        button.disabled = true;
        try {
          if (button.dataset.action === "water-add") {
            const tracker = waterTrackers.find(item => item.dayKey === dayKey && item.profileKey === ownKey);
            const nextCount = Math.min(8, Number(tracker?.count || 0) + 1);
            if (tracker) await setItem(tracker.id, { ...tracker, count: nextCount, updatedAtMs: Date.now() });
            else await addItem("waterChallenge", { dayKey, profileKey: ownKey, uid: user.uid, name: profile.name, count: nextCount, updatedAtMs: Date.now() });
            if (nextCount >= 8 && Number(tracker?.count || 0) < 8) void notifyPartnerSafely(ownKey, "challenge", `${profile.name} completed today's water goal.`, `water-${dayKey}-${ownKey}`, "challenges");
            toast(nextCount >= 8 ? "Daily water goal complete! 💧" : `Glass ${nextCount}/8 saved.`);
          } else if (button.dataset.action === "love-upload") {
            openLovePhotoModal(assignmentId);
          } else if (button.dataset.action === "snap-complete") {
            await acceptChallengeAssignment(assignmentId, user.uid, ownKey, profile.name);
            await completeChallengeAssignment(assignmentId, { uid: user.uid, profileKey: ownKey, name: profile.name }, "Sent today's Snap on Snapchat 📸", "");
            void notifyPartnerSafely(ownKey, "challenge", `${profile.name} completed a challenge.`, `${assignmentId}-completed`, "challenges");
            triggerCompletionSplash();
            toast("Snap marked as sent ♡");
          } else if (button.dataset.action === "accept") {
            await acceptChallengeAssignment(assignmentId, user.uid, ownKey, profile.name);
            await notifyPartnerSafely(ownKey, "challenge", `${profile.name} accepted your challenge: ${assignment?.title || challenge?.title || "Challenge"}`.slice(0, 240), `${assignmentId}-accepted`, "challenges");
            toast("Challenge accepted. Have fun together ♡");
          } else if (button.dataset.action === "skip") {
            await skipChallengeAssignment(assignmentId, user.uid, ownKey, profile.name);
            void notifyPartnerSafely(ownKey, "challenge", `${profile.name} skipped a challenge.`, `${assignmentId}-skipped`, "challenges");
            toast("Challenge moved to Skipped.");
          } else {
            const challengeId = resolvedAssignment.challengeId || resolvedAssignment.id.slice(11);
            openCompletionModal(assignmentId, resolvedAssignment, challengeId);
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
            ${isSnap ? `<label>Snap a photo<input type="file" name="photo" accept="image/*" capture="user" required></label>
            <label>Filter<select name="filter">
                <option value="none">None</option>
                <option value="grayscale(100%)">B&W</option>
                <option value="sepia(100%)">Sepia</option>
                <option value="brightness(150%)">Bright</option>
                <option value="contrast(150%)">Contrast</option>
            </select></label>` :
              isDrinkWater ? `<p>Did you both drink a glass of water?</p>` :
              `<label>Note (optional)<textarea name="note" maxlength="500" placeholder="Add a little note about it…"></textarea></label>
            <label>Photo (optional)<input type="file" name="photo" accept="image/*"></label>`}
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

    if (form.elements.filter) {
        form.elements.filter.onchange = () => {
            image.style.filter = form.elements.filter.value;
        };
    }

    form.onsubmit = async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Saving…";
      try {
        const filter = isSnap ? form.elements.filter?.value : "none";
        const photoUrl = selectedPhoto ? await compressImageWithFilter(selectedPhoto, filter) : "";
        if (selectedPhoto && !photoUrl) throw new Error("Could not read that photo. Choose another image.");

        if (challengeId === "custom") {
            await transitionCustomChallenge(assignmentId, { uid: user.uid, profileKey: ownKey, name: profile.name }, "complete", { note: form.elements.note?.value?.trim() || "", photoUrl });
            void notifyPartnerSafely(ownKey, "challenge", `${profile.name} completed your challenge.`, `${assignmentId}-completed`, "challenges");
        } else {
            await completeChallengeAssignment(assignmentId, {
              uid: user.uid,
              profileKey: ownKey,
              name: profile.name
            }, form.elements.note?.value?.trim() || "", photoUrl);
            void notifyPartnerSafely(ownKey, "challenge", `${profile.name} completed a challenge.`, `${assignmentId}-completed`, "challenges");
        }

        if (isDrinkWater || challengeId === "custom") triggerCompletionSplash();
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

  function openLovePhotoModal(assignmentId) {
    modalRoot.innerHTML = `<div class="challenge-modal" role="dialog" aria-modal="true"><section class="challenge-modal-card"><header class="challenge-modal-head"><h2>Send a little love 🌸</h2><button type="button" class="challenge-modal-close" data-close-love>×</button></header><p class="muted">Your photo stays hidden until your partner uploads theirs today too.</p><form class="challenge-complete-form" id="love-photo-form"><label>Choose today's photo<input type="file" name="photo" accept="image/*" capture="user" required></label><img class="challenge-photo-preview hidden" alt="Photo preview"><div class="challenge-modal-actions"><button type="button" class="challenge-secondary" data-close-love>Cancel</button><button type="submit" class="challenge-main">Send with love ♡</button></div></form></section></div>`;
    const form = $("#love-photo-form", modalRoot);
    const dialog = form.closest(".challenge-modal");
    const image = form.querySelector("img");
    dialog.querySelectorAll("[data-close-love]").forEach(button => button.onclick = () => { modalRoot.innerHTML = ""; });
    dialog.onclick = event => { if (event.target === dialog) modalRoot.innerHTML = ""; };
    form.elements.photo.onchange = () => {
      const file = form.elements.photo.files[0];
      if (!file) return;
      image.src = URL.createObjectURL(file);
      image.classList.remove("hidden");
    };
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      const file = form.elements.photo.files[0];
      button.disabled = true;
      button.textContent = "Sending…";
      try {
        const { photoUrl } = await uploadLoveChallengePhoto(file, dayKey, ownKey, user.uid);
        await saveLovePhoto(dayKey, { uid: user.uid, profileKey: ownKey, name: profile.name }, photoUrl);
        try { await sendToTelegram(file, `Love You Today · ${profile.name} · ${dayKey}`); }
        catch (telegramError) { console.error("Telegram forwarding failed:", telegramError); toast("Your photo is saved here. Telegram forwarding could not finish."); }
        void notifyPartnerSafely(ownKey, "challenge", `${profile.name} sent a secret love photo. Add yours to reveal them both 🌸`, `love-${dayKey}-${ownKey}`, "challenges");
        modalRoot.innerHTML = "";
        toast("Your love photo is waiting for your partner ♡");
      } catch (error) {
        console.error("Could not save love photo:", error);
        toast(error.message || "Could not send your photo.");
        button.disabled = false;
        button.textContent = "Send with love ♡";
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

  stopWaterChallenges = watchItems("waterChallenge", items => {
    if (!isCurrent()) return;
    waterTrackers = items;
    render();
  }, error => {
    console.error("Water challenge updates could not be synced:", error);
    if (isCurrent()) toast("Water tracker could not be synced.");
  });
  stopCustomChallenges = watchItems("customChallenge", items => {
    if (!isCurrent()) return;
    customChallenges = items.filter(item => item.status !== "completed");
    customCompletedChallenges = items.filter(item => item.status === "completed");
    render();
  }, error => {
    console.error("Custom challenges could not be loaded:", error);
    if (!isCurrent()) return;
    toast("Custom challenges could not be loaded.");
  });
  stopLegacyChallenges = watchItems("loveYouChallenge", items => {
    if (!isCurrent()) return;
    loveUploads = items;
    render();
  }, error => {
    console.error("Love challenge uploads could not be synced:", error);
    if (isCurrent()) toast("Love challenge photos could not be synced.");
  });
  window.addEventListener("couple-profiles-updated", () => { partnerProfiles = APP_CONFIG.profiles; render(); }, { once: true });
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
  stopCustomChallenges?.();
  stopCustomChallenges = null;
  stopWaterChallenges?.();
  stopWaterChallenges = null;
}
