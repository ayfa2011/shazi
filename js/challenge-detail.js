import { $, esc, toast, todayKey } from "./utils.js";
import { APP_CONFIG } from "../config/app-config.js";
import { getProfileKey } from "./profile-data.js";
import { watchItems, transitionCustomChallenge, notifyPartnerSafely } from "./firestore.js";
import { getTelegramMediaUrl, sendToTelegram, telegramMediaReferences, telegramUploadMimeType } from "../src/services/telegramService.js";

let stopCustomChallenges = null, customChallenges = [], customChallengesReady = false;
let currentChallenge = null, questionProfileKey = "";

export function renderChallengeDetail(el, user, profile) {
  disposeChallengeDetail();
  const isCurrent = () => el.isConnected;
  questionProfileKey = getProfileKey(profile);
  const challengeId = sessionStorage.getItem("challenge-detail-id") || "";
  currentChallenge = null;

  el.innerHTML = `
    <style>
      .challenge-detail-page { width:min(700px,100%); margin:0 auto; padding:16px 0 40px; }
      .challenge-detail-page-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
      .challenge-detail-page-header h1 { margin:0; color:var(--deep); font-size:25px; }
      .challenge-detail-back { padding:8px 14px; border:1px solid #f4d6e2; border-radius:999px; background:#fff4f8; color:var(--deep); font-size:13px; font-weight:600; cursor:pointer; }
      .challenge-detail-back:hover { background:#ffe8f1; }
      .challenge-detail-card { padding:20px; border:1px solid #f4dbe5; border-radius:20px; background:#fff9fb; box-shadow:0 8px 24px #8f315d0b; }
      .challenge-detail-type { display:inline-flex; padding:6px 14px; border-radius:999px; font-size:12px; font-weight:700; margin-bottom:16px; }
      .challenge-detail-type.challenge { background:#e85c91; color:#fff; }
      .challenge-detail-type.punishment { background:#c73d76; color:#fff; }
      .challenge-detail-desc { font-size:16px; color:#60283f; line-height:1.6; margin-bottom:20px; white-space:pre-wrap; }
      .challenge-detail-meta { display:flex; gap:14px; font-size:12px; color:var(--muted); margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid #f4dbe5; }
      .challenge-detail-media { margin-bottom:20px; }
      .challenge-detail-media video, .challenge-detail-media img { width:100%; max-height:240px; border-radius:14px; object-fit:cover; background:#f2e3ea; }
      .challenge-detail-media audio { width:100%; }
      .challenge-detail-timeline { margin:0; padding:0 0 0 18px; color:#8f315d; }
      .challenge-detail-timeline li { padding:5px 0; }
      .challenge-detail-timeline small { display:block; color:var(--muted); font-size:11px; }
      .challenge-detail-actions { display:flex; flex-direction:column; gap:10px; margin-top:20px; }
      .challenge-detail-btn { width:100%; padding:12px; border:1px solid #f4d6e2; border-radius:14px; background:#fff4f8; color:var(--deep); font-size:15px; font-weight:600; cursor:pointer; text-align:left; }
      .challenge-detail-btn:hover { background:#ffe8f1; }
      .challenge-detail-btn.primary { background:linear-gradient(135deg,#e85c91,#c73d76); color:#fff; }
      .challenge-detail-btn.primary:hover { filter:brightness(0.95); }
      .challenge-detail-btn.secondary { background:#f6edf1; color:#765a68; }
      .challenge-detail-empty { padding:20px; text-align:center; color:var(--muted); font-size:14px; }
      .challenge-detail-loading { padding:40px; text-align:center; color:var(--muted); font-size:14px; }
    </style>
    <div class="challenge-detail-page">
      <header class="challenge-detail-page-header">
        <button type="button" class="challenge-detail-back" id="challenge-detail-back">← Back</button>
        <h1>Challenge Details</h1>
      </header>
      <div id="challenge-detail-loading" class="challenge-detail-loading">Loading challenge details…</div>
      <div id="challenge-detail-content" class="challenge-detail-card" hidden></div>
    </div>
  `;

  const backBtn = $("#challenge-detail-back", el);
  backBtn.onclick = () => window.App.navigate("home");

  stopCustomChallenges = watchItems("customChallenge", items => {
    if (!isCurrent()) return;
    customChallenges = items || [];
    customChallengesReady = true;
    currentChallenge = customChallenges.find(c => c.id === challengeId) || null;
    renderDetailContent(el, user, profile);
  }, error => {
    console.error("Challenge detail sync failed:", error);
    const loading = $("#challenge-detail-loading", el);
    if (loading) loading.textContent = "Could not load challenge details.";
  }, undefined, null);
}

function renderDetailContent(el, user, profile) {
  const loading = $("#challenge-detail-loading");
  const content = $("#challenge-detail-content");
  if (!loading || !content) return;

  if (!currentChallenge) {
    loading.textContent = "Challenge not found.";
    content.hidden = true;
    return;
  }

  loading.hidden = true;
  content.hidden = false;

  const isPunishment = currentChallenge.kind === "punishment";
  const isMine = currentChallenge.authorKey === questionProfileKey;
  const deadline = currentChallenge.deadlineAt ? new Date(currentChallenge.deadlineAt) : null;
  const daysLeft = deadline ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000)) : 0;

  const reference = currentChallenge.referenceMedia || currentChallenge;
  const referenceId = reference.telegramFileId || "";
  const referenceMime = reference.videoMimeType || reference.audioMimeType || reference.photoMimeType || reference.mimeType || "";
  const mediaHtml = (reference.photoUrl || referenceId) ? `
    <div class="challenge-detail-media">
      ${referenceMime.startsWith("video/") ? `<video class="challenge-detail-video" controls></video>` : referenceMime.startsWith("audio/") ? `<audio class="challenge-detail-reference" controls></audio>` : `<img alt="Reference" class="challenge-detail-img">`}
    </div>
  ` : "";

  const pendingDeadline = currentChallenge.extensionRequest?.requestedDeadlineAt;
  const proof = currentChallenge.proof || currentChallenge;
  const proofMediaMime = proof.videoMimeType || proof.photoMimeType || proof.audioMimeType || proof.mimeType || "";
  const proofMediaId = proof.telegramFileId || "";
  const mediaMarkup = proofMediaId ? (proofMediaMime.startsWith("video/") ? `<video class="challenge-detail-proof" controls></video>` : proofMediaMime.startsWith("audio/") ? `<audio class="challenge-detail-proof" controls></audio>` : `<img class="challenge-detail-proof" alt="Submitted proof">`) : proof.photoUrl ? `<img class="challenge-detail-proof" alt="Submitted proof" src="${esc(proof.photoUrl)}">` : "";
  const actionMarkup = !isMine && currentChallenge.status === "upcoming" ? `<button type="button" class="challenge-detail-btn primary" data-action="accept">Accept ${isPunishment ? "Punishment" : "Challenge"}</button>`
    : !isMine && currentChallenge.status === "in-progress" ? `<button type="button" class="challenge-detail-btn primary" data-action="submit">Submit proof</button><button type="button" class="challenge-detail-btn secondary" data-action="extend">Request more time</button>`
    : isMine && currentChallenge.status === "extension-requested" ? `<p class="challenge-detail-note">${esc(currentChallenge.extensionRequest?.reason || "Your partner requested more time.")}</p><button type="button" class="challenge-detail-btn primary" data-action="approve-extension">Approve new date (${new Date(pendingDeadline).toLocaleDateString()})</button><button type="button" class="challenge-detail-btn secondary" data-action="decline-extension">Decline request</button>`
    : isMine && currentChallenge.status === "submitted" ? `<button type="button" class="challenge-detail-btn primary" data-action="approve-proof">Approve proof and complete</button><button type="button" class="challenge-detail-btn secondary" data-action="revision">Request another proof</button>` : "";
  const timeline = [
    ["Sent", currentChallenge.sentAtMs || currentChallenge.createdAtMs],
    ["Accepted", currentChallenge.acceptedAtMs],
    ["Extension requested", currentChallenge.extensionRequest?.requestedAtMs],
    ["Proof submitted", currentChallenge.submittedAtMs || proof.submittedAtMs],
    ["Completed", currentChallenge.completedAtMs]
  ].filter(([, time]) => time).map(([label, time]) => `<li><span>${esc(label)}</span><small>${new Date(time).toLocaleString()}</small></li>`).join("");

  content.innerHTML = `
    <span class="challenge-detail-type ${isPunishment ? "punishment" : "challenge"}">${isPunishment ? "Punishment" : "Challenge"}</span>
    <h2 class="challenge-detail-title">${esc(currentChallenge.title || "")}</h2>
    <p class="challenge-detail-desc">${esc(currentChallenge.description || "")}</p>
    <div class="challenge-detail-meta">
      <span>By ${esc(currentChallenge.authorName || "Partner")}</span>
      ${deadline ? `<span>${daysLeft} day${daysLeft !== 1 ? "s" : ""} left</span>` : ""}
    </div>
    ${mediaHtml}
    ${mediaMarkup ? `<h3>Submitted proof</h3><div class="challenge-detail-media">${mediaMarkup}</div>` : ""}
    ${currentChallenge.rewardPoints ? `<p>✨ ${Number(currentChallenge.rewardPoints)} points</p>` : ""}
    <h3>Timeline</h3><ol class="challenge-detail-timeline">${timeline || "<li><span>Sent</span></li>"}</ol>
    <div class="challenge-detail-actions">
      ${actionMarkup}
      <button type="button" class="challenge-detail-btn" data-action="close">Close</button>
    </div>
  `;

  const videoEl = content.querySelector(".challenge-detail-video");
  if (videoEl && referenceId) getTelegramMediaUrl(referenceId, referenceMime || "video/mp4").then(url => { if (videoEl.isConnected) videoEl.src = url; }).catch(() => {});
  const referenceAudio = content.querySelector(".challenge-detail-reference");
  if (referenceAudio && referenceId) getTelegramMediaUrl(referenceId, referenceMime || "audio/webm").then(url => { if (referenceAudio.isConnected) referenceAudio.src = url; }).catch(() => {});
  const imgEl = content.querySelector(".challenge-detail-img");
  const proofMedia = content.querySelector(".challenge-detail-proof");
  if (proofMedia && proofMediaId) {
    getTelegramMediaUrl(proofMediaId, proofMediaMime || "image/jpeg").then(url => { if (proofMedia.isConnected) proofMedia.src = url; }).catch(() => {});
  }
  if (imgEl) {
    if (referenceId) {
      getTelegramMediaUrl(referenceId, referenceMime || "image/jpeg").then(url => {
        if (imgEl.isConnected) imgEl.src = url;
      }).catch(() => {});
    } else if (reference.photoUrl) {
      imgEl.src = reference.photoUrl;
    }
  }

  content.querySelector('[data-action=close]').onclick = () => window.App.navigate("home");

  const acceptBtn = content.querySelector('[data-action=accept]');
  if (acceptBtn) acceptBtn.onclick = async () => {
      acceptBtn.disabled = true;
      try {
        await transitionCustomChallenge(currentChallenge.id, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, "accept");
        toast("Challenge accepted ♡");
      } catch (error) { toast(error.message || "Could not accept."); acceptBtn.disabled = false; }
  };
  const submitBtn = content.querySelector('[data-action=submit]');
  if (submitBtn) submitBtn.onclick = async () => {
      if (currentChallenge.proofType === "none") {
        try {
          await transitionCustomChallenge(currentChallenge.id, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, "submit-proof", { note: "No proof required." });
          void notifyPartnerSafely(questionProfileKey, "challenge", `${profile.name} submitted a challenge for review.`, `${currentChallenge.id}-submitted`, "challenges");
          toast("Sent for review ♡");
        } catch (error) { toast(error.message || "Could not submit."); }
        return;
      }
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = currentChallenge.proofType === "photo" ? "image/*" : currentChallenge.proofType === "video" ? "video/*" : currentChallenge.proofType === "voice" ? "audio/*" : "image/*,video/*,audio/*";
      fileInput.required = currentChallenge.proofType && currentChallenge.proofType !== "none";
      fileInput.onchange = async () => {
        const file = fileInput.files[0];
        if (!file) return;
        try {
          if (currentChallenge.proofType === "photo" && !file.type.startsWith("image/") || currentChallenge.proofType === "video" && !file.type.startsWith("video/") || currentChallenge.proofType === "voice" && !file.type.startsWith("audio/")) throw new Error(`Please submit a ${currentChallenge.proofType} proof.`);
          const timestamp = new Date().toLocaleString();
          const label = file.type.startsWith("video/") ? "Challenge Proof Video" : (file.type.startsWith("audio/") ? "Challenge Proof Voice" : "Challenge Proof Photo");
          const result = await sendToTelegram(file, `${label} · ${profile.name} · ${timestamp}`);
          const proofMetadata = { ...telegramMediaReferences(result), mimeType: telegramUploadMimeType(file) };
          if (file.type.startsWith("video/")) proofMetadata.videoMimeType = telegramUploadMimeType(file);
          if (file.type.startsWith("audio/")) proofMetadata.audioMimeType = telegramUploadMimeType(file);
          if (file.type.startsWith("image/")) proofMetadata.photoMimeType = telegramUploadMimeType(file);
          await transitionCustomChallenge(currentChallenge.id, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, "submit-proof", proofMetadata);
          void notifyPartnerSafely(questionProfileKey, "challenge", `${profile.name} submitted proof for a challenge.`, `${currentChallenge.id}-submitted`, "challenges");
          toast("Proof sent for review ♡");
        } catch (error) {
          console.error(error);
          toast(error.message || "Could not complete.");
        }
      };
      fileInput.click();
    };

  const extendBtn = content.querySelector('[data-action=extend]');
  if (extendBtn) {
    extendBtn.onclick = async () => {
      const reason = prompt("Why do you need more time?");
      if (reason === null) return;
      if (!reason.trim()) return toast("Add a short reason for the extension request.");
      const newDate = prompt("Suggest a new deadline (YYYY-MM-DD)", new Date(Number(currentChallenge.deadlineAt || Date.now()) + 86400000).toISOString().slice(0, 10));
      if (!newDate) return;
      const newDeadline = new Date(`${newDate}T23:59:00`).getTime();
      try {
        await transitionCustomChallenge(currentChallenge.id, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, "request-extension", { reason, requestedDeadlineAt: newDeadline });
        void notifyPartnerSafely(questionProfileKey, "challenge", `${profile.name} requested an extension.`, `${currentChallenge.id}-extension`, "challenges");
        toast("Extension request sent.");
      } catch (error) {
        console.error(error);
        toast(error.message || "Could not extend.");
      }
    };
  }
  content.querySelectorAll('[data-action="approve-extension"], [data-action="decline-extension"], [data-action="approve-proof"], [data-action="revision"]').forEach(button => {
    button.onclick = async () => {
      const action = button.dataset.action;
      const transition = { "approve-extension": "approve-extension", "decline-extension": "decline-extension", "approve-proof": "approve-proof", revision: "request-revision" }[action];
      try {
        await transitionCustomChallenge(currentChallenge.id, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, transition, action === "approve-extension" ? { deadlineAt: Number(pendingDeadline) } : action === "revision" ? { note: prompt("What should be changed?", "Please add another proof.") || "Please add another proof." } : {});
        toast(action === "approve-proof" ? "Challenge completed ♡" : action === "approve-extension" ? "Deadline updated 📅" : "Updated.");
        if (action === "approve-proof") void notifyPartnerSafely(questionProfileKey, "challenge", `Your proof for “${currentChallenge.title}” was approved ♡`, `${currentChallenge.id}-completed`, "challenges");
      } catch (error) { toast(error.message || "Could not update."); }
    };
  });
}

export function disposeChallengeDetail() {
  stopCustomChallenges?.();
  stopCustomChallenges = null;
}
