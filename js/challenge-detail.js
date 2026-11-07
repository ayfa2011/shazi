import { $, esc, toast, todayKey } from "./utils.js";
import { APP_CONFIG } from "../config/app-config.js";
import { getProfileKey } from "./profile-data.js";
import { watchItems, transitionCustomChallenge, notifyPartnerSafely } from "./firestore.js";
import { getTelegramMediaUrl, sendToTelegram, telegramMediaReferences, telegramUploadMimeType } from "../src/services/telegramService.js";

let stopCustomChallenges = null, customChallenges = [], customChallengesReady = false;

export function renderChallengeDetail(el, user, profile) {
  disposeChallengeDetail();
  const isCurrent = () => el.isConnected;
  const questionProfileKey = getProfileKey(profile);
  const challengeId = sessionStorage.getItem("challenge-detail-id") || "";
  let currentChallenge = null;

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
  });
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

  const mediaHtml = (currentChallenge.photoUrl || currentChallenge.telegramFileId) ? `
    <div class="challenge-detail-media">
      ${(currentChallenge.videoMimeType?.startsWith("video/") || currentChallenge.mimeType?.startsWith("video/"))
        ? `<video class="challenge-detail-video" controls></video>`
        : `<img alt="Reference" class="challenge-detail-img">`}
    </div>
  ` : "";

  const acceptHtml = !isMine && (currentChallenge.status === "upcoming" || currentChallenge.status === "in-progress") ? `
    <button type="button" class="challenge-detail-btn primary" data-action="accept">Accept Challenge</button>
    <button type="button" class="challenge-detail-btn secondary" data-action="extend">Need More Days</button>
  ` : "";

  content.innerHTML = `
    <span class="challenge-detail-type ${isPunishment ? "punishment" : "challenge"}">${isPunishment ? "Punishment" : "Challenge"}</span>
    <p class="challenge-detail-desc">${esc(currentChallenge.description || "")}</p>
    <div class="challenge-detail-meta">
      <span>By ${esc(currentChallenge.authorName || "Partner")}</span>
      ${deadline ? `<span>${daysLeft} day${daysLeft !== 1 ? "s" : ""} left</span>` : ""}
    </div>
    ${mediaHtml}
    <div class="challenge-detail-actions">
      ${acceptHtml}
      <button type="button" class="challenge-detail-btn" data-action="close">Close</button>
    </div>
  `;

  const videoEl = content.querySelector("video");
  const imgEl = content.querySelector("img");
  if (videoEl) {
    const fileId = currentChallenge.telegramVideoFileId || currentChallenge.telegramFileId || "";
    const mime = currentChallenge.videoMimeType || currentChallenge.mimeType || "video/mp4";
    if (fileId) {
      getTelegramMediaUrl(fileId, mime).then(url => {
        if (videoEl.isConnected) videoEl.src = url;
      }).catch(() => {});
    }
  }
  if (imgEl) {
    const fileId = currentChallenge.telegramFileId || "";
    const mime = currentChallenge.photoMimeType || currentChallenge.mimeType || "image/jpeg";
    if (fileId) {
      getTelegramMediaUrl(fileId, mime).then(url => {
        if (imgEl.isConnected) imgEl.src = url;
      }).catch(() => {});
    } else if (currentChallenge.photoUrl) {
      imgEl.src = currentChallenge.photoUrl;
    }
  }

  content.querySelector('[data-action=close]').onclick = () => window.App.navigate("home");

  const acceptBtn = content.querySelector('[data-action=accept]');
  if (acceptBtn) {
    acceptBtn.onclick = async () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*,video/*,audio/*";
      fileInput.onchange = async () => {
        const file = fileInput.files[0];
        if (!file) return;
        try {
          const timestamp = new Date().toLocaleString();
          const label = file.type.startsWith("video/") ? "Challenge Completion Video" : (file.type.startsWith("audio/") ? "Challenge Completion Voice" : "Challenge Completion Photo");
          const result = await sendToTelegram(file, `${label} · ${profile.name} · ${timestamp}`);
          const photoMetadata = { ...telegramMediaReferences(result), mimeType: telegramUploadMimeType(file) };
          if (file.type.startsWith("video/")) photoMetadata.videoMimeType = telegramUploadMimeType(file);
          if (file.type.startsWith("image/")) photoMetadata.photoMimeType = telegramUploadMimeType(file);
          await transitionCustomChallenge(currentChallenge.id, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, "complete", { note: "Completed via challenge detail page", ...photoMetadata });
          void notifyPartnerSafely(questionProfileKey, "challenge", `${profile.name} completed the challenge.`, `${currentChallenge.id}-completed`, "challenges");
          toast("Challenge completed ♡");
          window.App.navigate("home");
        } catch (error) {
          console.error(error);
          toast(error.message || "Could not complete.");
        }
      };
      fileInput.click();
    };
  }

  const extendBtn = content.querySelector('[data-action=extend]');
  if (extendBtn) {
    extendBtn.onclick = async () => {
      const days = prompt("How many more days?", "7");
      if (!days || isNaN(Number(days))) return;
      const extraDays = Number(days);
      const newDeadline = Date.now() + extraDays * 86400000;
      try {
        await transitionCustomChallenge(currentChallenge.id, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, "edit", { deadlineAt: newDeadline, updatedAtMs: Date.now() });
        toast("Deadline extended 📅");
        window.App.navigate("home");
      } catch (error) {
        console.error(error);
        toast(error.message || "Could not extend.");
      }
    };
  }
}

export function disposeChallengeDetail() {
  stopCustomChallenges?.();
  stopCustomChallenges = null;
}
