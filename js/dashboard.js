import { $, esc, toast, todayKey, scheduleDubaiDayRollover } from "./utils.js";
import { isVideoPost } from "./components.js";
import { watchDiaryPosts, watchRelationshipStartDate, saveRelationshipStartDate, watchDrawingMessages, toggleDiaryLike, toggleDiaryCommentLike, watchDiaryComments, addDiaryComment, updateDiaryComment, deleteDiaryComment, watchItems, notifyPartnerSafely, ensureChallengeAssignment, completeChallengeAssignment, changeDailyWaterProgress, addItem, transitionCustomChallenge } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { findProfileForAuthor, getDisplayName, getProfileKey } from "./profile-data.js";
import { formatSpecialDayDate, specialDayCountdown } from "./special-day-utils.js";
import { ensureDailyQuestion, watchQuestionParticipants, watchQuestionAnswer } from "./question-service.js";
import { challengeDays } from "./challenge-bank.js";
import { getCachedTelegramMediaUrl, getTelegramMediaUrl, sendToTelegram, telegramMediaReferences, telegramUploadMimeType } from "../src/services/telegramService.js";

let stopPosts = null, stopRelationship = null, stopDrawings = null, stopQuestionParticipants = null, stopSpecialDays = null, stopOwnAnswer = null, stopPartnerAnswer = null, stopChallenges = null, stopWaterChallenges = null, stopCustomChallenges = null, counterTimer = null, dayRolloverTimer = null, homeRenderToken = 0, postCommentStops = new Map();
let assignments = [], assignmentsReady = false, waterTrackers = [], waterTrackersReady = false, customAllChallenges = [], challengeRenderScheduled = null;

function feedSkeletonMarkup(count = 2) {
  const card = `<div class="home-skeleton-card" aria-hidden="true">
    <span class="home-post-author"><span class="skeleton-shape skeleton-circle"></span>
      <span style="display:grid;gap:7px;flex:1"><i class="skeleton-shape skeleton-line short"></i><i class="skeleton-shape skeleton-line" style="width:38%;height:9px"></i></span>
    </span>
    <i class="skeleton-shape skeleton-line"></i>
    <i class="skeleton-shape skeleton-line short"></i>
  </div>`;
  return `<div class="home-feed-skeleton" role="status">${Array.from({ length: count }, () => card).join("")}</div>`;
}

export function renderHome(el, user, profile) {
  const renderToken = ++homeRenderToken;
  const isCurrent = () => renderToken === homeRenderToken && el.isConnected;
  stopPosts?.();
  stopRelationship?.();
  stopDrawings?.();
  stopQuestionParticipants?.();
  stopSpecialDays?.();
  stopSpecialDays = null;
  postCommentStops.forEach(stop => stop());
  postCommentStops.clear();
  clearInterval(counterTimer);
  clearTimeout(dayRolloverTimer);
  dayRolloverTimer = scheduleDubaiDayRollover(() => {
    if (isCurrent()) window.App?.navigate("home");
  });
  let dailyQuestion = null, questionParticipants = {}, ownAnswer = null, partnerAnswer = null;
  const commentsByPost = new Map();

  el.innerHTML = `
    <style>
      .home-container {
        max-width: 1050px;
        margin: 0 auto;
        font-family: system-ui, -apple-system, sans-serif;
        padding: 20px 0 40px;
        box-sizing: border-box;
        overflow: visible;
      }
      .home-post-panel {
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 22px;
        background: #fff;
        box-shadow: 0 8px 30px #8f315d0a;
      }
      .home-date-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
      .home-drawing-panel { margin-top: 0; border: 1px solid var(--line); }
      .home-post-panel { padding: 14px; }
      .home-post-panel .home-avatar { width: 32px; height: 32px; }
      .home-post-panel .home-feed { gap: 9px; }
      .home-view-more { width: 100%; margin-top: 9px; padding: 8px 10px; border: 1px solid #f4d6e2; border-radius: 999px; background: #fff4f8; color: var(--deep); font-size: 11px; font-weight: 600; cursor: pointer; }
      .home-view-more span { margin-left: 5px; color: var(--pink); }
      .home-post-panel .home-post-card { padding: 11px; border: 1px solid var(--line); border-radius: 16px; box-shadow: none; min-height: 180px; display: flex; flex-direction: column; justify-content: space-between; }
      .home-post-panel .home-post-header { margin-bottom: 6px; }
      .home-post-panel .home-post-author { gap: 7px; }
      .home-post-panel .home-post-author strong { font-size: 13px; }
      .home-post-panel .home-post-author small { font-size: 10px; }
      .home-post-panel .home-post-text { margin: 6px 0; font-size: 13px; flex-grow: 1; }
      .home-post-panel .home-post-photo { width: 100%; height: clamp(150px, 28vw, 300px); max-height: none; margin-top: 6px; border-radius: 11px; object-fit: cover; display: block; }
      .home-post-panel .home-post-photo.home-post-photo--pending { background: #f2e3ea; }
      .home-post-panel .home-post-video-frame { width: 100%; height: clamp(150px, 28vw, 300px); max-height: none; margin-top: 6px; border-radius: 11px; background: #f2e3ea; position: relative; overflow: hidden; display: grid; place-items: center; color: #b24166; font-weight: 800; }
      .home-post-panel .home-post-video-frame .home-video-play-overlay { font-size: 42px; line-height: 1; filter: drop-shadow(0 2px 4px #0003); }
      .home-post-panel .home-post-video-frame--ready { background-size: cover; background-position: 50% 50%; color: transparent; }
      .home-post-panel .home-post-actions { margin-top: 7px; padding-top: 6px; border-top: 1px solid #f3f4f6; }
      .home-post-panel .home-comment-form { margin-top: 6px; }
      .home-post-panel .home-comment-form input { min-width: 0; padding: 8px 10px; font-size: 12px; }
      .home-post-panel .home-comment-form .home-post-btn { flex: none; padding: 7px 10px !important; }
      .home-comment-thread { display: grid; gap: 5px; }
      .home-comment-item { padding: 7px 9px; border-radius: 10px; background: #fff7fa; }
      .home-comment-item p { margin: 3px 0 0; overflow-wrap: anywhere; }
      .home-comment-replies { display: grid; gap: 5px; margin: 5px 0 0 12px; padding-left: 8px; border-left: 2px solid #f3cad9; }
      .home-comment-reply-btn { margin-top: 3px; padding: 0; border: 0; background: none; color: var(--deep); font-size: 11px; cursor: pointer; }
      .home-replying-to { display: flex; justify-content: space-between; align-items: center; color: var(--deep); font-size: 11px; }
      .home-replying-to[hidden] { display: none; }
      .home-replying-to button { padding: 1px 6px; border-radius: 50%; background: #ffe8f1; color: var(--deep); }
      .today-card-copy { min-width: 0; }
      .today-card-copy strong { display: block; }
      .today-card-copy p { color: var(--muted); }
      .today-link { border: 0; background: none; cursor: pointer; }
      .today-cards--image { align-items: stretch; }
      .today-image-card { padding: 0 !important; border: 0 !important; background: transparent !important; box-shadow: none !important; overflow: hidden; }
      .today-image-btn { display: block; width: 100%; height: 100%; padding: 0; border: 0; border-radius: 25px; background: transparent; cursor: pointer; overflow: hidden; }
      .today-image-btn img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 25px; }
      .home-avatar {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: #e11d48;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
      }
      .home-avatar img { width:100%; height:100%; border-radius:50%; object-fit:cover; }
      .home-post-btn {
        background: #e11d48;
        color: white;
        border: none;
        padding: 8px 18px;
        border-radius: 20px;
        font-weight: 600;
        cursor: pointer;
      }
      .home-feed {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .home-post-card {
        background: #ffffff;
        border-radius: 20px;
        padding: 18px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
      }
      .home-post-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }
      .home-post-author {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .home-post-author strong {
        font-size: 15px;
        color: #1f2937;
      }
      .home-post-author small {
        color: #9ca3af;
        font-size: 12px;
      }
      .home-post-text {
        font-size: 14.5px;
        color: #374151;
        line-height: 1.5;
        margin: 8px 0;
      }
      .home-post-photo {
        width: 100%;
        max-height: 380px;
        object-fit: cover;
        border-radius: 14px;
        margin-top: 8px;
      }
      .home-post-actions {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid #f3f4f6;
      }
      .home-action-btn {
        background: none;
        border: none;
        color: #6b7280;
        cursor: pointer;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .home-action-btn.liked {
        color: #e11d48;
        font-weight: 600;
      }
      .home-comments-list {
        margin-top: 10px;
        padding-left: 8px;
        border-left: 2px solid #ffe4e6;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .home-comment-item {
        font-size: 13px;
        color: #4b5563;
      }
      .home-comment-form {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }
      .home-comment-form input {
        flex: 1;
        border: 1px solid #fecdd3;
        border-radius: 16px;
        padding: 6px 12px;
        font-size: 13px;
        outline: none;
      }
      .home-feed-skeleton{display:grid;gap:9px}
      .home-skeleton-card{display:grid;gap:10px;padding:11px;border:1px solid var(--line);border-radius:16px;background:#fff}
      .home-question-body { padding:18px 20px; display:flex; flex-direction:column; gap:14px; }
      .home-question-text { margin:0; font-family:"Playfair Display",Georgia,serif; font-size:20px; font-weight:600; color:#6a2c42; line-height:1.5; padding:16px 18px; border-radius:16px; background:linear-gradient(135deg,#fff,#fdfafb); border:1px solid #f4d6e2; box-shadow:0 4px 14px rgba(142,59,90,0.06); }
      .home-question-answers { display:flex; flex-direction:column; gap:10px; }
      .home-question-answer { display:flex; align-items:center; gap:10px; padding:12px 16px; border:1px solid #f3d9e5; border-radius:14px; background:#fff; color:#5a3a4a; font-size:14px; box-shadow:0 2px 8px rgba(0,0,0,0.03); width:100%; }
      .home-question-answer-name { font-family:"Playfair Display",Georgia,serif; font-weight:600; color:#8e3b5a; flex-shrink:0; font-size:13px; letter-spacing:.02em; }
      .home-question-answer-text { flex:1; }
      .home-see-history-btn { padding:8px 16px; border:1px solid #f4d6e2; border-radius:10px; background:#fff; color:#8e3b5a; font-size:12px; font-weight:600; cursor:pointer; align-self:flex-start; transition:all .2s ease; white-space:nowrap; max-width:fit-content; }
      .home-see-history-btn:hover { background:#fce4ec; border-color:#eec3d7; color:#6a2c42; transform:translateY(-1px); }

      .section-head { display:flex; align-items:center; justify-content:space-between; margin:0 0 18px; }
      .section-head .eyebrow { font-family:"Playfair Display",Georgia,serif; font-size:13px; font-weight:600; color:#b84c6e; letter-spacing:.16em; text-transform:uppercase; margin:0; }
      .section-head h2 { font-family:"Playfair Display",Georgia,serif; font-size:22px; font-weight:600; color:#6a2c42; margin:0; letter-spacing:.01em; }

      .today-section { margin:24px 0 20px; box-sizing:border-box; overflow:visible; }
      .today-cards { display:flex; flex-direction:column; gap:0; margin:0; padding:0; }
      .today-question { position:relative; padding:18px; border:1px solid #f4d6e2; border-radius:20px; background:#fff; box-shadow:0 6px 20px rgba(142,59,90,0.08); min-height:auto; overflow:visible; transition:all .3s ease; }
      .today-question:hover { transform:translateY(-2px); box-shadow:0 10px 32px rgba(142,59,90,0.12); border-color:#eec3d7; }
      .today-question::before { content:"♡"; position:absolute; top:-10px; left:20px; width:20px; height:20px; background:#fff; border:1px solid #f4d6e2; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; color:#e89cb5; z-index:2; box-shadow:0 2px 8px rgba(0,0,0,0.06); }

      .habit-section { margin:32px 0 24px; box-sizing:border-box; overflow:visible; }
      .habit-cards { display:flex; flex-direction:column; gap:14px; }
      .habit-card { padding:20px; border:1px solid #f3d9e5; border-radius:20px; background:linear-gradient(135deg,#fff,#fdfafb); box-shadow:0 4px 16px rgba(142,59,90,0.06); display:flex; flex-direction:column; gap:14px; transition:all .25s ease; }
      .habit-card:hover { transform:translateY(-1px); box-shadow:0 8px 24px rgba(142,59,90,0.1); border-color:#eec3d7; }
      .habit-card-head { display:flex; align-items:center; gap:12px; }
      .habit-card-head .habit-icon { font-size:22px; flex:none; filter:drop-shadow(0 2px 4px rgba(232,156,181,0.25)); }
      .habit-card-head .habit-copy { min-width:0; }
      .habit-card-head .habit-copy h2 { font-family:"Playfair Display",Georgia,serif; margin:0; font-size:17px; color:#6a2c42; font-weight:600; }
      .habit-card-head .habit-copy small { margin:0; color:#a58392; font-size:11px; letter-spacing:.05em; text-transform:uppercase; font-weight:600; }
      .habit-snap-grid { display:grid; gap:10px; }
      .habit-snap-person { padding:12px 14px; border:1px solid #f3d9e5; border-radius:14px; background:#fff; color:#5a3a4a; display:flex; align-items:center; gap:10px; transition:all .2s ease; }
      .habit-snap-person.is-sent { border-color:#eec3d7; background:#fff0f6; }
      .habit-snap-person-header { display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%; }
      .habit-snap-person-header strong { font-family:"Playfair Display",Georgia,serif; font-weight:600; color:#8e3b5a; font-size:13px; }
      .habit-snap-pill { font-size:9px; padding:3px 9px; border-radius:8px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; }
      .habit-snap-pill.sent { background:#eec3d7; color:#6a2c42; }
      .habit-snap-pill.pending { background:#f1e3ea; color:#a58392; }
      .habit-snap-state { display:flex; align-items:center; gap:8px; }
      .habit-snap-avatar { width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg,#fce4ec,#f8e1ec); color:#8e3b5a; font-size:13px; font-weight:800; display:grid; place-items:center; flex:none; box-shadow:0 2px 6px rgba(232,156,181,0.3); }
      .habit-snap-state-copy { min-width:0; }
      .habit-snap-state-copy strong { display:block; font-size:12px; color:#6a2c42; font-weight:600; }
      .habit-snap-state-copy small { display:block; font-size:11px; color:#a58392; }
      .habit-snap-btn { margin-top:8px; padding:8px 14px; border:1px solid #f4d6e2; border-radius:10px; background:#fff; color:#8e3b5a; font-size:11px; font-weight:700; cursor:pointer; align-self:flex-start; transition:all .2s ease; }
      .habit-snap-btn:hover { background:#fce4ec; border-color:#eec3d7; color:#6a2c42; transform:translateY(-1px); }
      .habit-water-grid { display:flex; gap:12px; }
      .habit-water-person { flex:1; padding:12px 14px; border:1px solid #f3d9e5; border-radius:14px; background:#fff; color:#5a3a4a; display:flex; flex-direction:column; gap:8px; transition:all .2s ease; }
      .habit-water-person:hover { border-color:#eec3d7; background:#fdfafb; }
      .habit-water-person-title { display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; }
      .habit-water-person-title strong { font-family:"Playfair Display",Georgia,serif; font-weight:600; color:#8e3b5a; font-size:13px; }
      .habit-water-person-main { display:flex; gap:12px; align-items:flex-start; }
      .habit-water-glass-wrap { position:relative; width:52px; height:52px; border-radius:16px; background:#fff0f6; display:grid; place-items:center; flex:none; overflow:hidden; border:2px solid #f3d9e5; box-shadow:inset 0 1px 3px rgba(0,0,0,0.04); }
      .habit-water-glass-fill { position:absolute; inset:0; border-radius:12px; background:linear-gradient(180deg,#e89cb5,#d76f8c); transform:scaleY(0.5); transform-origin:center bottom; transition:transform .5s cubic-bezier(.4,0,.2,1); }
      .habit-water-glass-img { width:100%; height:100%; object-fit:cover; opacity:0; position:absolute; inset:0; border-radius:12px; }
      .habit-water-details { min-width:0; }
      .habit-water-count { font-size:12px; }
      .habit-water-count strong { font-family:"Playfair Display",Georgia,serif; font-size:17px; color:#6a2c42; font-weight:600; }
      .habit-water-track { margin-top:6px; height:5px; background:#f1e3ea; border-radius:3px; overflow:hidden; }
      .habit-water-track-bar { height:100%; background:linear-gradient(90deg,#e89cb5,#c73d76); width:0%; transition:width .5s cubic-bezier(.4,0,.2,1); }
      .habit-water-caption { margin-top:4px; font-size:10px; color:#a58392; }
      .habit-water-controls { margin-top:6px; display:flex; gap:8px; }
      .habit-water-btn { width:28px; height:28px; border:1px solid #f4d6e2; border-radius:10px; background:#fff; color:#8e3b5a; font-size:13px; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .2s ease; }
      .habit-water-btn:hover { background:#fce4ec; border-color:#eec3d7; color:#6a2c42; transform:translateY(-1px); }
      .habit-water-btn:disabled { opacity:0.45; cursor:not-allowed; }
      .habit-celebrate { margin-top:8px; padding:10px 14px; border-radius:10px; background:#fff0f6; color:#b84c6e; font-size:11px; font-weight:700; text-align:center; letter-spacing:.05em; }

      .challenge-pun-section { margin:32px 0 28px; box-sizing:border-box; overflow:visible; }
      .challenge-pun-section .section-head { display:flex; align-items:center; justify-content:space-between; margin:0 0 18px; }
      .challenge-pun-list { display:flex; flex-direction:column; gap:12px; }
      .challenge-card { padding:18px 20px; border:1px solid #f3d9e5; border-radius:20px; background:#fff; box-shadow:0 4px 16px rgba(142,59,90,0.06); cursor:pointer; transition:all .25s ease; display:flex; flex-direction:column; gap:12px; }
      .challenge-card:hover { transform:translateY(-2px); box-shadow:0 10px 28px rgba(142,59,90,0.1); border-color:#eec3d7; }
      .challenge-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:4px; }
      .challenge-card-type { font-size:10px; padding:4px 10px; border-radius:8px; font-weight:700; flex:none; letter-spacing:.08em; text-transform:uppercase; }
      .challenge-card-type.challenge { background:#eec3d7; color:#6a2c42; border:1px solid #f1b8d0; }
      .challenge-card-type.punishment { background:#f1c4d6; color:#8e3b5a; border:1px solid #e8a9c3; }
      .challenge-card-title { font-family:"Playfair Display",Georgia,serif; font-size:15px; font-weight:600; color:#6a2c42; margin:0 0 6px; flex:1; line-height:1.4; }
      .challenge-card-desc { font-size:13px; color:#8c737d; margin:0 0 10px; line-height:1.5; flex:1; }
      .challenge-card-meta { display:flex; gap:12px; font-size:11px; color:#a58392; margin-bottom:8px; }
      .challenge-card-meta span { white-space:nowrap; }
      .challenge-card-actions { display:flex; gap:8px; }
      .challenge-card-btn { flex:1; padding:9px 12px; border:1px solid #f4d6e2; border-radius:10px; background:#fff; color:#8e3b5a; font-size:11px; font-weight:700; cursor:pointer; transition:all .2s ease; }
      .challenge-card-btn:hover { background:#fce4ec; border-color:#eec3d7; color:#6a2c42; transform:translateY(-1px); }
      .challenge-empty { padding:24px; text-align:center; color:#a58392; font-size:13px; }
      .home-view-more-challenges { padding:10px 18px; border:1px solid #f4d6e2; border-radius:12px; background:#fff; color:#8e3b5a; font-size:12px; font-weight:600; cursor:pointer; flex:none; transition:all .2s ease; }
      .home-view-more-challenges:hover { background:#fce4ec; border-color:#eec3d7; color:#6a2c42; transform:translateY(-1px); }

      /* New status badges and featured challenge styles */
      .challenge-status { font-size:9px; padding:3px 9px; border-radius:8px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; flex:none; }
      .challenge-status.status-upcoming { background:#f1e3ea; color:#a58392; border:1px solid #ead3dd; }
      .challenge-status.status-in-progress { background:#eec3d7; color:#6a2c42; border:1px solid #f1b8d0; }
      .challenge-status.status-accepted { background:#dcebf7; color:#4a7c9c; border:1px solid #b8d4e8; }
      .challenge-status.status-completed { background:#e8f0e8; color:#4a7c5a; border:1px solid #bcd4bc; }

      .challenge-card.featured { border:2px solid #eec3d7; box-shadow:0 8px 32px rgba(142,59,90,0.1); position:relative; overflow:hidden; }
      .challenge-card.featured::before { content:""; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,#e89cb5,#c73d76,#b84c6e); }
      .challenge-card.featured .challenge-card-actions { gap:10px; }

      .challenge-card-btn.primary { background:linear-gradient(135deg,#e89cb5,#c73d76); color:#fff; border:none; font-weight:700; }
      .challenge-card-btn.primary:hover { filter:brightness(0.95); transform:translateY(-1px); box-shadow:0 4px 12px rgba(199,61,118,0.3); }
      .challenge-card-btn.outline { background:transparent; border:1px solid #f4d6e2; color:#8e3b5a; font-weight:600; }
      .challenge-card-btn.outline:hover { background:#fce4ec; border-color:#eec3d7; color:#6a2c42; transform:translateY(-1px); }

      .challenge-rest { display:flex; flex-direction:column; gap:10px; margin-top:4px; }

      /* Subtle entrance animation */
      @keyframes fadeInUp {
        from { opacity:0; transform:translateY(8px); }
        to { opacity:1; transform:translateY(0); }
      }
      .today-question, .habit-card, .challenge-card { animation:fadeInUp 0.5s ease both; }
      .challenge-card.featured { animation:fadeInUp 0.6s ease both; }

      /* Decorative heart pulse */
      .today-question::before { animation:pulse 3s ease-in-out infinite; }
      @keyframes pulse {
        0%,100% { transform:scale(1); opacity:0.8; }
        50% { transform:scale(1.15); opacity:1; }
      }
      /* Send Challenge Modal */
      .home-send-modal { position:fixed; inset:0; z-index:1500; display:flex; align-items:center; justify-content:center; padding:16px; background:#25151dcc; }
      .home-send-modal-backdrop { position:absolute; inset:0; background:rgba(37,21,29,0.6); }
      .home-send-modal-card { width:min(100%,520px); padding:24px; border:1px solid #f0d7e2; border-radius:24px; background:linear-gradient(145deg,#fff,#fff6fa); box-shadow:0 24px 64px #25151d55; position:relative; max-height:90vh; overflow-y:auto; }
      .home-send-modal-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
      .home-send-modal-head h2 { margin:0; color:#873456; font-size:22px; }
      .home-send-modal-close { width:36px; height:36px; border-radius:50%; border:0; background:#ffe8f1; color:#873456; font-size:22px; cursor:pointer; }
      .home-send-form label { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; font-size:13px; color:#8c737d; font-weight:600; }
      .home-send-form select, .home-send-form input[type="number"], .home-send-form textarea, .home-send-form input[type="text"] { padding:12px; border:1px solid #efd0de; border-radius:14px; background:#fffafd; color:#60283f; font:14px/1.5 system-ui,sans-serif; }
      .home-send-form textarea { min-height:100px; resize:vertical; }
      .home-send-file-row { display:flex; gap:10px; align-items:center; margin-top:8px; }
      .home-send-file-preview { width:80px; height:80px; border-radius:12px; background:#fff0f6; border:2px dashed #efd0de; display:grid; place-items:center; overflow:hidden; }
      .home-send-file-preview img, .home-send-file-preview video { width:100%; height:100%; object-fit:cover; }
      .home-send-file-actions { display:flex; gap:8px; }
      .home-send-file-btn { padding:10px 16px; border:1px solid #f4d6e2; border-radius:999px; background:#fff4f8; color:var(--deep); font-size:12px; font-weight:600; cursor:pointer; }
      .home-send-file-btn:hover { background:#ffe8f1; }
      .home-send-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:24px; }
      .home-send-modal-cancel { min-height:44px; padding:10px 18px; border-radius:999px; border:0; background:#f6edf1; color:#765a68; font-weight:700; cursor:pointer; }
      .home-send-modal-send { min-height:44px; padding:10px 22px; border-radius:999px; border:0; background:linear-gradient(135deg,#e85c91,#c73d76); color:#fff; font-weight:700; cursor:pointer; }
      /* Challenge Detail Modal */
      .home-detail-modal { position:fixed; inset:0; z-index:1500; display:flex; align-items:center; justify-content:center; padding:16px; background:#25151dcc; }
      .home-detail-modal-backdrop { position:absolute; inset:0; background:rgba(37,21,29,0.6); }
      .home-detail-modal-card { width:min(100%,520px); padding:24px; border:1px solid #f0d7e2; border-radius:24px; background:linear-gradient(145deg,#fff,#fff6fa); box-shadow:0 24px 64px #25151d55; position:relative; max-height:90vh; overflow-y:auto; }
      .home-detail-modal-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
      .home-detail-modal-head h2 { margin:0; color:#873456; font-size:22px; }
      .home-detail-modal-close { width:36px; height:36px; border-radius:50%; border:0; background:#ffe8f1; color:#873456; font-size:22px; cursor:pointer; }
      .home-detail-type { display:inline-flex; padding:4px 10px; border-radius:999px; font-size:11px; font-weight:700; margin-bottom:16px; }
      .home-detail-type.challenge { background:#e85c91; color:#fff; }
      .home-detail-type.punishment { background:#c73d76; color:#fff; }
      .home-detail-desc { font-size:15px; color:#60283f; line-height:1.6; margin-bottom:16px; }
      .home-detail-media { margin-bottom:16px; }
      .home-detail-media video, .home-detail-media img { width:100%; max-height:200px; border-radius:14px; object-fit:cover; background:#f2e3ea; }
      .home-detail-actions { display:flex; flex-direction:column; gap:10px; margin-top:20px; }
      .home-detail-btn { width:100%; padding:12px; border:1px solid #f4d6e2; border-radius:14px; background:#fff4f8; color:var(--deep); font-size:14px; font-weight:600; cursor:pointer; }
      .home-detail-btn:hover { background:#ffe8f1; }
      .home-detail-btn.primary { background:linear-gradient(135deg,#e85c91,#c73d76); color:#fff; }
      .home-detail-btn.primary:hover { filter:brightness(0.95); }
      .home-detail-media-upload { display:flex; flex-direction:column; gap:10px; margin-top:12px; }
      .home-detail-media-file { width:100%; height:120px; border:2px dashed #efd0de; border-radius:14px; background:#fffafd; display:grid; place-items:center; cursor:pointer; }
    </style>

    <div class="home-container">
      <aside class="home-special-day-reminders" id="home-special-day-reminders" aria-live="polite" hidden></aside>

      <section class="home-header-composition" aria-label="Keby and Shazy, two hearts one journey">
        <img class="home-header-image" src="./Asset/Header.png" alt="Keby and Shazy together in a romantic portrait" fetchpriority="high">
        <div class="home-header-countdown" aria-label="Time together" aria-live="off">
          <span><b id="counter-days">0</b></span>
          <span><b id="counter-hours">00</b></span>
          <span><b id="counter-minutes">00</b></span>
          <span><b id="counter-seconds">00</b></span>
        </div>
        <button type="button" class="home-header-date" id="relationship-date" aria-label="Edit relationship start date">
          <span class="home-header-date-heart" aria-hidden="true">♡</span>
          <span id="relationship-date-label">Choose our date</span>
        </button>
        <input class="home-date-input" id="relationship-date-input" type="date" aria-label="Choose relationship start date">
      </section>

      <section class="home-feature-grid">
        <div class="home-post-panel">
          <div id="home-posts-feed" class="home-feed" aria-busy="true" aria-label="Loading latest moments">
            ${feedSkeletonMarkup()}
          </div>
          <button type="button" class="home-view-more" id="view-more-posts">Open all posts <span aria-hidden="true">→</span></button>
        </div>

        <aside class="home-drawing-panel">
          <button type="button" class="home-canvas-launch" id="open-drawing">
            <span class="home-drawing-preview" id="home-drawing-preview"><span class="home-canvas-heart" aria-hidden="true">♡</span></span>
            <span class="home-canvas-action">Open canvas ♡</span>
          </button>
        </aside>
      </section>

      <section class="today-section">
        <div class="section-head">
          <div><p class="eyebrow">Today Question</p></div>
        </div>
        <div class="today-cards">
          <article class="card today-question" id="home-question-card">
            <div class="home-question-body">
              <p class="home-question-text" id="home-question-text">Loading today's question…</p>
              <div class="home-question-answers" id="home-question-answers"></div>
            </div>
            <button type="button" class="home-see-history-btn" id="home-see-history">See History</button>
          </article>
        </div>
      </section>

      <section class="habit-section">
        <div class="section-head">
          <div><p class="eyebrow">Daily Habit</p></div>
          <h2>Build habits together</h2>
        </div>
        <div id="home-daily-habit" class="habit-cards"></div>
      </section>

      <section class="challenge-pun-section">
        <div class="section-head">
          <div><p class="eyebrow">Challenge / Punishment</p></div>
          <h2>Send a playful challenge</h2>
          <button type="button" class="home-view-more-challenges" id="home-view-more-challenges">View All →</button>
        </div>
        <div id="home-challenge-punishment" class="challenge-pun-list"></div>
      </section>
    </div>
  `;

  const feed = $("#home-posts-feed", el);
  const dateButton = $("#relationship-date", el);
  const dateInput = $("#relationship-date-input", el);
  const questionProfileKey = getProfileKey(profile);
  let startDate = "";

  stopSpecialDays = watchItems("specialDay", items => {
    if (!isCurrent()) return;
    const reminders = $("#home-special-day-reminders", el);
    if (!reminders) return;
    const upcoming = (items || [])
      .map(item => ({ item, countdown: specialDayCountdown(item, todayKey()) }))
      .filter(entry => entry.countdown && entry.countdown.days >= 0 && entry.countdown.days <= 3)
      .sort((a, b) => a.countdown.days - b.countdown.days);
    if (upcoming.length === 0) {
      reminders.hidden = true;
      reminders.replaceChildren();
      return;
    }
    reminders.hidden = false;
    reminders.innerHTML = upcoming.slice(0, 3).map(({ item, countdown }) => {
      const text = countdown.days === 0
        ? `Today: ${esc(item.title)}`
        : `${countdown.days} ${countdown.days === 1 ? "day" : "days"} left to ${esc(item.title)}`;
      const date = formatSpecialDayDate(countdown.date);
      return `<p class="home-special-day-reminder"><span aria-hidden="true">🎉</span><span>${esc(text)}<small>${esc(date)}</small></span></p>`;
    }).join("") + (upcoming.length > 3 ? `<p class="home-special-day-more">And ${upcoming.length - 3} more special ${upcoming.length - 3 === 1 ? "day" : "days"} coming up</p>` : "");
  }, error => {
    console.error("Dashboard special day reminders could not be loaded:", error);
    const reminders = $("#home-special-day-reminders", el);
    if (reminders) {
      reminders.hidden = false;
      reminders.innerHTML = `<p class="home-special-day-reminder home-special-day-error">Special day reminders could not be loaded.</p>`;
    }
  });

  const now = new Date();
  dateInput.max = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  function updateCounter() {
    if (!isCurrent()) return;
    $("#relationship-date-label", el).textContent = startDate
      ? new Date(`${startDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "Choose date";
    const timestamp = startDate ? new Date(`${startDate}T00:00:00`).getTime() : NaN;
    const elapsed = Number.isFinite(timestamp) ? Math.max(0, Date.now() - timestamp) : 0;
    $("#counter-days", el).textContent = String(Math.floor(elapsed / 86400000));
    $("#counter-hours", el).textContent = String(Math.floor(elapsed / 3600000) % 24).padStart(2, "0");
    $("#counter-minutes", el).textContent = String(Math.floor(elapsed / 60000) % 60).padStart(2, "0");
    $("#counter-seconds", el).textContent = String(Math.floor(elapsed / 1000) % 60).padStart(2, "0");
  }

  dateButton.onclick = () => {
    if (typeof dateInput.showPicker === "function") dateInput.showPicker();
    else dateInput.click();
  };
  dateInput.onchange = async () => {
    if (!dateInput.value) return;
    try {
      await saveRelationshipStartDate(dateInput.value);
      if (!isCurrent()) return;
      startDate = dateInput.value;
      updateCounter();
      toast("Your date together has been saved ♡");
    } catch (err) {
      console.error("Could not save relationship start date:", err);
      toast("Could not save your date. Please try again.");
    }
  };
  updateCounter();
  counterTimer = setInterval(updateCounter, 1000);
  stopRelationship = watchRelationshipStartDate(date => {
    if (!isCurrent()) return;
    startDate = date || "";
    dateInput.value = startDate;
    updateCounter();
  });

  stopDrawings = watchDrawingMessages(messages => {
    if (!isCurrent()) return;
    const preview = $("#home-drawing-preview", el);
    if (!preview) return;
    const latest = messages?.[0];
    if (!latest) {
      preview.innerHTML = `<span class="home-canvas-heart" aria-hidden="true">♡</span><small>No drawings yet</small>`;
      return;
    }
    const imageUrl = latest.photoUrl || (latest.driveFileId
      ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(latest.driveFileId)}&sz=w800`
      : latest.thumbnailUrl || "");
    if (imageUrl) {
      delete preview.dataset.drawingFileId;
      preview.innerHTML = `<img src="${esc(imageUrl)}" alt="Latest shared drawing" loading="eager" decoding="async">`;
      return;
    }
    if (!latest.telegramFileId) {
      delete preview.dataset.drawingFileId;
      preview.innerHTML = `<small>Drawing preview unavailable</small>`;
      return;
    }
    const fileId = latest.telegramFileId;
    preview.dataset.drawingFileId = fileId;
    preview.innerHTML = `<span class="skeleton-shape" style="position:absolute;inset:0;border-radius:inherit" aria-hidden="true"></span><small>Loading latest drawing…</small>`;
    const mimeType = latest.mimeType || "image/jpeg";
    void (async () => {
      try {
        const cachedUrl = await getCachedTelegramMediaUrl(fileId, mimeType);
        const isLatestDrawing = () => isCurrent() && $("#home-drawing-preview", el) === preview && preview.dataset.drawingFileId === fileId;
        if (!isLatestDrawing()) return;
        const img = document.createElement("img");
        img.alt = "Latest shared drawing";
        img.loading = "eager";
        img.decoding = "async";
        let fallbackAttempted = false;
        img.onerror = () => {
          if (!cachedUrl || fallbackAttempted || !isLatestDrawing()) {
            if (isLatestDrawing()) preview.innerHTML = `<small>Drawing preview unavailable</small>`;
            return;
          }
          fallbackAttempted = true;
          void getTelegramMediaUrl(fileId, mimeType).then(url => {
            if (isLatestDrawing()) img.src = url;
          }).catch(error => {
            console.error("Latest shared drawing could not be loaded:", error);
            if (isLatestDrawing()) preview.innerHTML = `<small>Drawing preview unavailable</small>`;
          });
        };
        if (!isLatestDrawing()) return;
        preview.replaceChildren(img);
        img.src = cachedUrl || await getTelegramMediaUrl(fileId, mimeType);
      } catch (error) {
        console.error("Latest shared drawing could not be loaded:", error);
        if (isCurrent() && $("#home-drawing-preview", el) === preview && preview.dataset.drawingFileId === fileId) preview.innerHTML = `<small>Drawing preview unavailable</small>`;
      }
    })();
  }, 1);

  function renderQuestionWidget() {
    const questionText = $("#home-question-text", el);
    const answers = $("#home-question-answers", el);
    if (!questionText || !dailyQuestion) return;
    questionText.textContent = dailyQuestion.question;
    if (answers) {
      const people = Object.entries(APP_CONFIG.profiles);
      answers.innerHTML = people.map(([key, person]) => {
        const isMine = key === questionProfileKey;
        const answer = isMine ? ownAnswer : partnerAnswer;
        const answered = Boolean(questionParticipants[key]);
        const display = answer?.answer || "";
        const showText = display ? esc(display) + " ♡" : (isMine && answered ? "Your answer will appear here." : "Waiting for your partner.");
        return `<div class="home-question-answer answer-card" data-profile-key="${esc(key)}"><span class="home-question-answer-name">${esc(person.name)}:</span><span class="home-question-answer-text">${showText}</span></div>`;
      }).join("");
      answers.querySelectorAll(".answer-card").forEach(card => {
        card.onclick = () => window.App.navigate("questions");
      });
    }
  }

  ensureDailyQuestion(todayKey()).then(questionRecord => {
    if (!isCurrent()) return;
    dailyQuestion = questionRecord;
    renderQuestionWidget();
    stopQuestionParticipants?.();
    stopQuestionParticipants = watchQuestionParticipants(todayKey(), status => {
      if (!isCurrent()) return;
      questionParticipants = status;
      renderQuestionWidget();
    }, error => {
      if (!isCurrent()) return;
      console.error("Today's Question status could not be synced:", error);
      toast("Today's Question status could not be synced.");
    });
    const partnerKey = Object.keys(APP_CONFIG.profiles).find(key => key !== questionProfileKey) || "";
    stopOwnAnswer?.(); stopPartnerAnswer?.();
    stopOwnAnswer = watchQuestionAnswer(todayKey(), questionProfileKey, answer => {
      if (!isCurrent()) return;
      ownAnswer = answer;
      renderQuestionWidget();
    });
    if (partnerKey && questionParticipants[partnerKey]) {
      stopPartnerAnswer = watchQuestionAnswer(todayKey(), partnerKey, answer => {
        if (!isCurrent()) return;
        partnerAnswer = answer;
        renderQuestionWidget();
      });
    } else {
      partnerAnswer = null;
      renderQuestionWidget();
    }
  }).catch(error => {
    if (!isCurrent()) return;
    console.error("Today's Question could not be prepared:", error);
    const questionText = $("#home-question-text", el);
    if (questionText) questionText.textContent = "Today's Question is unavailable right now.";
  });

  $("#open-drawing", el).onclick = () => window.App.navigate("drawing");
  $("#view-more-posts", el).onclick = () => window.App.navigate("gallery");
  $("#home-see-history", el).onclick = event => {
    event.stopPropagation();
    window.App.navigate("questions");
  };

  /* ── Daily Habit: Send Snap + Drink Water ────────────────────── */
  function assignmentFor(challenge) {
    const stored = assignments.find(item => item.id === challenge.id);
    const participantCount = Math.max(1, Object.keys(APP_CONFIG.profiles).length);
    const base = stored ? {
      ...stored,
      acceptedBy: Array.isArray(stored.acceptedBy) ? stored.acceptedBy : [],
      skippedBy: Array.isArray(stored.skippedBy) ? stored.skippedBy : stored.skippedBy ? [stored.skippedBy] : [],
      completedBy: Array.isArray(stored.completedBy) ? stored.completedBy : []
    } : { ...challenge, status: "upcoming", acceptedBy: [], skippedBy: [], completedBy: [] };
    if ((base.completedBy || []).length >= participantCount) return { ...base, status: "completed" };
    if ((base.skippedBy || []).length >= participantCount) return { ...base, status: "skipped" };
    if ((base.acceptedBy || []).length || (base.completedBy || []).length) return { ...base, status: "in-progress" };
    return { ...base, status: "upcoming" };
  }

  function waterCountFor(key) {
    const records = waterTrackers.filter(item => item.dayKey === todayKey() && item.profileKey === key);
    return Math.max(0, Math.min(8, Number(records.find(item => item.id === `water-${todayKey()}-${key}`)?.count || 0)));
  }

  function renderHabit() {
    const host = $("#home-daily-habit", el);
    if (!host) return;
    const dayChallenges = challengeDays(todayKey(), 1);
    const snap = dayChallenges.find(c => c.challengeId === "send-snap");
    const water = dayChallenges.find(c => c.challengeId === "drink-water");

    const people = Object.entries(APP_CONFIG.profiles);
    const snapHtml = snap ? `
      <article class="habit-card snap-challenge-card">
        <div class="habit-card-head">
          <span class="habit-icon" aria-label="Snapchat">📸</span>
          <div class="habit-copy">
            <h2>Daily Snap</h2>
            <small>Share your daily moments with each other 💗</small>
          </div>
        </div>
        <div class="habit-snap-grid">
          ${people.map(([key, person]) => {
            const assignment = snap ? assignmentFor(snap) : null;
            const completedBy = assignment?.completedBy || [];
            const sent = completedBy.some(p => p.profileKey === key || (person.authUid && p.uid === person.authUid));
            const isMine = key === questionProfileKey;
            const avatar = person.avatar ? `<img src="${esc(person.avatar)}" alt="" loading="lazy" decoding="async">` : esc((person.name || "♡")[0]);
            return `<section class="habit-snap-person ${sent ? "is-sent" : "is-pending"}">
              <header class="habit-snap-person-header"><strong>${esc(person.name || "Partner")}</strong><span class="habit-snap-pill ${sent ? "sent" : "pending"}">${sent ? "✓ Sent" : "◷ Not Sent"}</span></header>
              <div class="habit-snap-state">
                ${sent ? `<span class="habit-snap-avatar">✓</span>` : `<span class="habit-snap-avatar">${avatar}</span>`}
                <div class="habit-snap-state-copy">
                  <strong>${sent ? "Snap sent today" : "Snap not sent yet"}</strong>
                  <small>${sent ? (isMine ? "You're all caught up" : "Your partner is all caught up") : (isMine ? "Send your daily moment" : "Waiting for your partner")}</small>
                </div>
              </div>
              ${isMine && !sent ? `<button type="button" class="habit-snap-btn" data-action="snap-complete" data-id="${esc(assignment?.id || "")}">Send Snap</button>` : ""}
            </section>`;
          }).join("")}
        </div>
      </article>
    ` : "";

    const waterHtml = water ? `
      <article class="habit-card water-challenge-card">
        <div class="habit-card-head">
          <span class="habit-icon">💧</span>
          <div class="habit-copy">
            <h2>Drink Water</h2>
            <small>8 glasses a day, together 💗</small>
          </div>
        </div>
        <div class="habit-water-grid">
          ${people.map(([key, person]) => {
            const count = key === questionProfileKey ? waterCountFor(key) : waterCountFor(key);
            const isMine = key === questionProfileKey;
            const assignment = water ? assignmentFor(water) : null;
            const glassAsset = person.name?.toLowerCase() === "shazy" ? "Girl.png" : "Boy.png";
            return `<section class="habit-water-person ${isMine ? "is-mine" : ""}">
              <div class="habit-water-person-title"><strong>${esc(person.name)}${isMine ? " · You" : ""}</strong></div>
              <div class="habit-water-person-main">
                <div class="habit-water-glass-wrap" aria-hidden="true">
                  <div class="habit-water-glass-fill" style="--water-level:${count / 8 * 82}%"></div>
                  <img src="./Asset/${glassAsset}" alt="" class="habit-water-glass-img" loading="lazy" decoding="async">
                </div>
                <div class="habit-water-details">
                  <div class="habit-water-count"><strong>${count}</strong><span>/ 8<br>glasses</span></div>
                  <div class="habit-water-track" role="progressbar" aria-valuemin="0" aria-valuemax="8" aria-valuenow="${count}"><div class="habit-water-track-bar" style="width:${count / 8 * 100}%"></div></div>
                  <small class="habit-water-caption">${count >= 8 ? "Daily goal complete ✓" : `${8 - count} glasses to go`}</small>
                </div>
              </div>
              ${isMine ? `<div class="habit-water-controls">
                <button type="button" class="habit-water-btn" data-action="water-remove" data-id="${esc(assignment?.id || "")}" aria-label="Remove one glass" ${!waterTrackersReady || !assignmentsReady || count <= 0 ? "disabled" : ""}>−</button>
                <button type="button" class="habit-water-btn" data-action="water-add" data-id="${esc(assignment?.id || "")}" aria-label="Add one glass" ${!waterTrackersReady || !assignmentsReady || count >= 8 ? "disabled" : ""}>＋</button>
              </div>` : ""}
            </section>`;
          }).join("")}
        </div>
        ${people.every(([k]) => waterCountFor(k) >= 8) ? `<div class="habit-celebrate">Hydrated together 💧✨</div>` : ""}
      </article>
    ` : "";

    host.innerHTML = snapHtml + waterHtml;

    host.querySelectorAll("[data-action]").forEach(btn => {
      btn.onclick = async event => {
        event.stopPropagation();
        const action = btn.dataset.action;
        const assignmentId = btn.dataset.id;
        btn.disabled = true;
        try {
          if (action === "snap-complete") {
            const liveAssignment = assignments.find(item => item.id === assignmentId);
            if (liveAssignment) {
              liveAssignment.completedBy = [...(liveAssignment.completedBy || []), { uid: user.uid, profileKey: questionProfileKey, name: profile.name }];
            }
            await completeChallengeAssignment(assignmentId, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, "Sent today's Snap 📸", "");
            void notifyPartnerSafely(questionProfileKey, "challenge", `${profile.name} sent today's Snap.`, `${assignmentId}-completed`, "challenges");
            toast("Snap marked ✓");
            renderHabit();
          } else if (action === "water-add" || action === "water-remove") {
            const delta = action === "water-add" ? 1 : -1;
            const next = await changeDailyWaterProgress(todayKey(), { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, delta, waterCountFor(questionProfileKey));
            toast(next >= 8 ? "Daily water goal complete! 💧" : `Glass ${next}/8 saved.`);
            if (delta > 0 && next === 8) void notifyPartnerSafely(questionProfileKey, "challenge", `${profile.name} completed today's water goal.`, `water-${todayKey()}-${questionProfileKey}`, "challenges");
            renderHabit();
          }
        } catch (error) {
          console.error(error);
          toast(error.message || "Could not update this.");
          btn.disabled = false;
        }
      };
    });
  }

  function scheduleHabitRender() {
    if (challengeRenderScheduled) return;
    challengeRenderScheduled = requestAnimationFrame(() => {
      challengeRenderScheduled = null;
      renderHabit();
    });
  }

  /* ── Challenge / Punishment ─────────────────────────────────── */
  let customChallenges = [], customChallengesReady = false;

  function pendingCustomChallenges() {
    return customChallenges.filter(item => item.status === "upcoming" || item.status === "in-progress");
  }

  function renderChallengeCards() {
    const host = $("#home-challenge-punishment", el);
    if (!host) return;
    const pending = pendingCustomChallenges();
    if (!pending.length) {
      host.innerHTML = `<div class="challenge-empty">No challenges yet. Send your partner a playful challenge to get started.</div>`;
      return;
    }
    const featured = pending[0];
    const rest = pending.slice(1);
    const featuredIsPunishment = featured.kind === "punishment";
    const featuredDeadline = featured.deadlineAt ? new Date(featured.deadlineAt) : null;
    const featuredDaysLeft = featuredDeadline ? Math.max(0, Math.ceil((featuredDeadline.getTime() - Date.now()) / 86400000)) : 0;
    const featuredMine = featured.authorKey === questionProfileKey;
    const featuredStatus = featured.status;

    const featuredHtml = `
      <article class="challenge-card featured" data-challenge-id="${esc(featured.id)}">
        <div class="challenge-card-head">
          <span class="challenge-card-type ${featuredIsPunishment ? "punishment" : "challenge"}">${featuredIsPunishment ? "Punishment" : "Challenge"}</span>
          <span class="challenge-status status-${featuredStatus}">${featuredStatus.charAt(0).toUpperCase() + featuredStatus.slice(1)}</span>
        </div>
        <h3 class="challenge-card-title">${esc(featured.title || featured.description?.slice(0, 50) || "Challenge")}</h3>
        <p class="challenge-card-desc">${esc(featured.description || "")}</p>
        <div class="challenge-card-meta">
          <span>By ${esc(featured.authorName || "Partner")}</span>
          ${featuredDeadline ? `<span>⏳ ${featuredDaysLeft} day${featuredDaysLeft !== 1 ? "s" : ""} left</span>` : ""}
        </div>
        <div class="challenge-card-actions">
          ${!featuredMine && (featuredStatus === "upcoming" || featuredStatus === "in-progress")
            ? `<button type="button" class="challenge-card-btn primary" data-action="accept">Accept Challenge</button>`
            : ""}
          ${featuredMine && (featuredStatus === "accepted" || featuredStatus === "in-progress")
            ? `<button type="button" class="challenge-card-btn primary" data-action="complete">Complete Challenge</button>`
            : ""}
          <button type="button" class="challenge-card-btn outline" data-action="view">View Details →</button>
        </div>
      </article>
    `;

    const restHtml = rest.length ? `<div class="challenge-rest">${rest.map(item => {
      const isPunishment = item.kind === "punishment";
      const deadline = item.deadlineAt ? new Date(item.deadlineAt) : null;
      const daysLeft = deadline ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000)) : 0;
      const typeLabel = isPunishment ? "Punishment" : "Challenge";
      const mine = item.authorKey === questionProfileKey;
      return `
        <article class="challenge-card" data-challenge-id="${esc(item.id)}">
          <div class="challenge-card-head">
            <span class="challenge-card-type ${isPunishment ? "punishment" : "challenge"}">${typeLabel}</span>
            <span class="challenge-status status-${item.status}">${item.status.charAt(0).toUpperCase() + item.status.slice(1)}</span>
          </div>
          <h3 class="challenge-card-title">${esc(item.title || item.description?.slice(0, 40) || typeLabel)}</h3>
          <p class="challenge-card-desc">${esc(item.description || "")}</p>
          <div class="challenge-card-meta">
            <span>By ${esc(item.authorName || "Partner")}</span>
            ${deadline ? `<span>${daysLeft} day${daysLeft !== 1 ? "s" : ""} left</span>` : ""}
          </div>
          <div class="challenge-card-actions">
            ${!mine && (item.status === "upcoming" || item.status === "in-progress")
              ? `<button type="button" class="challenge-card-btn primary" data-action="accept">Accept Challenge</button>`
              : ""}
            ${mine && (item.status === "accepted" || item.status === "in-progress")
              ? `<button type="button" class="challenge-card-btn primary" data-action="complete">Complete Challenge</button>`
              : ""}
            <button type="button" class="challenge-card-btn outline" data-action="view">View Details →</button>
          </div>
        </article>
      `;
    }).join("")}</div>` : "";

    host.innerHTML = featuredHtml + restHtml;

    host.querySelectorAll("[data-action]").forEach(btn => {
      btn.onclick = async event => {
        event.stopPropagation();
        const action = btn.dataset.action;
        const card = btn.closest(".challenge-card");
        const id = card.dataset.challengeId;
        const item = customChallenges.find(c => c.id === id);
        if (!item) return;

        btn.disabled = true;
        btn.textContent = "Working…";

        try {
          if (action === "accept") {
            await transitionCustomChallenge(id, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, "accept");
            toast("Challenge accepted ♡");
          } else if (action === "complete") {
            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.accept = "image/*,video/*,audio/*";
            fileInput.onchange = async () => {
              const file = fileInput.files[0];
              if (!file) { btn.disabled = false; btn.textContent = "Complete Challenge"; return; }
              try {
                const timestamp = new Date().toLocaleString();
                const label = file.type.startsWith("video/") ? "Challenge Completion Video" : (file.type.startsWith("audio/") ? "Challenge Completion Voice" : "Challenge Completion Photo");
                const result = await sendToTelegram(file, `${label} · ${profile.name} · ${timestamp}`);
                const photoMetadata = { ...telegramMediaReferences(result), mimeType: telegramUploadMimeType(file) };
                if (file.type.startsWith("video/")) photoMetadata.videoMimeType = telegramUploadMimeType(file);
                if (file.type.startsWith("image/")) photoMetadata.photoMimeType = telegramUploadMimeType(file);
                await transitionCustomChallenge(id, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, "complete", { note: "Completed via dashboard", ...photoMetadata });
                void notifyPartnerSafely(questionProfileKey, "challenge", `${profile.name} completed the challenge.`, `${id}-completed`, "challenges");
                toast("Challenge completed ♡");
              } catch (error) {
                console.error(error);
                toast(error.message || "Could not complete.");
                btn.disabled = false;
                btn.textContent = "Complete Challenge";
              }
            };
            fileInput.click();
            return;
          } else if (action === "view") {
            sessionStorage.setItem("challenge-detail-id", id);
            window.App.navigate("challenge-detail");
            btn.disabled = false;
            return;
          }
          renderChallengeCards();
        } catch (error) {
          console.error(error);
          toast(error.message || "Could not update challenge.");
          btn.disabled = false;
          btn.textContent = action === "accept" ? "Accept Challenge" : "Complete Challenge";
        }
      };
    });
  }

  /* ── Send Challenge / Punishment Modal ── */
  function openSendChallengeModal() {
    const modal = document.createElement("div");
    modal.className = "home-send-modal";
    modal.innerHTML = `
      <div class="home-send-modal-backdrop"></div>
      <div class="home-send-modal-card">
        <header class="home-send-modal-head">
          <h2>Send Challenge / Punishment</h2>
          <button type="button" class="home-send-modal-close" aria-label="Close">×</button>
        </header>
        <form class="home-send-form" id="home-send-form">
          <label>
            Type
            <select name="type" required>
              <option value="challenge">Challenge</option>
              <option value="punishment">Punishment</option>
            </select>
          </label>
          <label>
            Description
            <textarea name="description" maxlength="500" required placeholder="What is the challenge or punishment?"></textarea>
          </label>
          <label>
            Reference Upload (Photo / Video / Voice Note)
            <input type="file" name="reference" accept="image/*,video/*,audio/*" style="display:none;">
            <div class="home-send-file-row">
              <input type="text" name="reference-name" readonly placeholder="No file selected" style="flex:1;padding:10px;border:1px solid #efd0de;border-radius:14px;background:#fffafd;color:#60283f;">
              <button type="button" class="home-send-file-btn" data-action="pick-file">Choose File</button>
            </div>
          </label>
          <label>
            Deadline (Days)
            <input type="number" name="deadlineDays" min="1" max="365" value="7" required>
          </label>
          <div class="home-send-modal-actions">
            <button type="button" class="home-send-modal-cancel">Cancel</button>
            <button type="submit" class="home-send-modal-send">Send Challenge</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    const backdrop = modal.querySelector(".home-send-modal-backdrop");
    const close = () => modal.remove();
    backdrop.onclick = close;
    modal.querySelector(".home-send-modal-close").onclick = close;

    const fileInput = modal.querySelector('input[name="reference"]');
    const fileNameInput = modal.querySelector('input[name="reference-name"]');
    const pickBtn = modal.querySelector('[data-action=pick-file]');
    let selectedFile = null;

    pickBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      selectedFile = fileInput.files[0] || null;
      fileNameInput.value = selectedFile ? selectedFile.name : "No file selected";
    };

    modal.querySelector(".home-send-modal-cancel").onclick = close;
    const form = $("#home-send-form", modal);
    form.onsubmit = async event => {
      event.preventDefault();
      const type = form.elements.type.value;
      const description = form.elements.description.value.trim();
      const deadlineDays = Number(form.elements.deadlineDays.value || 7);
      if (!description) return toast("Enter a description first.");
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Sending…";
      try {
        const createdAt = Date.now();
        const deadlineAt = createdAt + deadlineDays * 86400000;
        const recipientKey = Object.keys(APP_CONFIG.profiles).find(key => key !== questionProfileKey) || "";
        let photoMetadata = {};
        if (selectedFile) {
          const timestamp = new Date().toLocaleString();
          const label = selectedFile.type.startsWith("video/") ? "Challenge Video" : (selectedFile.type.startsWith("audio/") ? "Challenge Voice" : "Challenge Photo");
          const result = await sendToTelegram(selectedFile, `${label} · ${profile.name} · ${timestamp}`);
          photoMetadata = { ...telegramMediaReferences(result), mimeType: telegramUploadMimeType(selectedFile) };
          if (selectedFile.type.startsWith("video/")) photoMetadata.videoMimeType = telegramUploadMimeType(selectedFile);
          if (selectedFile.type.startsWith("image/")) photoMetadata.photoMimeType = telegramUploadMimeType(selectedFile);
        }
        await addItem("customChallenge", {
          title: description.slice(0, 80),
          description,
          kind: type,
          durationDays: deadlineDays,
          createdAtMs: createdAt,
          deadlineAt,
          extensionRequested: false,
          status: "upcoming",
          author: user.uid,
          authorKey: questionProfileKey,
          authorName: profile.name,
          recipientKey,
          assignedAtMs: createdAt,
          sentAtMs: createdAt,
          sentDate: todayKey(),
          actions: [],
          ...photoMetadata
        });
        void notifyPartnerSafely(questionProfileKey, "challenge", `${profile.name} sent ${type === "punishment" ? "a punishment" : "a challenge"}: ${description.slice(0, 240)}`, "", "challenges");
        toast(type === "punishment" ? "Punishment sent 😈" : "Challenge sent ♡");
        modal.remove();
      } catch (error) {
        console.error(error);
        toast(error.message || "Could not send.");
        submit.disabled = false;
        submit.textContent = "Send Challenge";
      }
    };
  }

  /* ── Challenge watchers ── */
  stopCustomChallenges = watchItems("customChallenge", items => {
    if (!isCurrent()) return;
    customChallenges = items || [];
    customChallengesReady = true;
    renderChallengeCards();
  }, error => console.error("Custom challenges sync failed:", error));

  const dayKey = todayKey();
  const monthStart = new Date(`${dayKey}T00:00:00Z`);
  monthStart.setUTCDate(monthStart.getUTCDate() - 30);
  const historyStartDay = monthStart.toISOString().slice(0, 10);

  stopChallenges = watchChallengeAssignments(items => {
    if (!isCurrent()) return;
    assignments = items;
    assignmentsReady = true;
    scheduleHabitRender();
  }, error => {
    console.error("Challenge updates could not be synced:", error);
    if (!isCurrent()) return;
    assignmentsReady = true;
  }, historyStartDay, 100);

  stopWaterChallenges = watchItems("waterChallenge", items => {
    if (!isCurrent()) return;
    waterTrackers = items;
    waterTrackersReady = true;
    scheduleHabitRender();
  }, error => console.error("Water sync failed:", error), 120);

  $("#home-view-more-challenges", el).onclick = () => window.App.navigate("challenges");

  renderChallengeCards();
  renderHabit();

  el.querySelectorAll("[data-route]").forEach(button => {
    button.onclick = () => window.App.navigate(button.dataset.route);
  });

  const partnerProfile = Object.values(APP_CONFIG.profiles).find(candidate =>
    candidate.id !== profile.id && candidate.email !== profile.email
  );
  const partnerAuthorIds = [...new Set([partnerProfile?.id, partnerProfile?.authUid].filter(Boolean))];

    stopPosts = watchDiaryPosts((items) => {
    if (!isCurrent()) return;
    renderFeed(items);
  }, 1, partnerAuthorIds);

  /* Build the media preview HTML for a feed post: text, photo, or video.
     Posts store media as a Telegram file id (photoUrl is rarely set), so
     render telegram file ids as lazy placeholders and resolve them below. */
  function postMediaHtml(post) {
    if (!post) return "";
    if (post.photoUrl) {
      return `<img src="${esc(post.photoUrl)}" class="home-post-photo" alt="Shared photo" loading="eager" onerror="this.style.display='none'">`;
    }
    if (isVideoPost(post)) {
      const fileId = post.telegramVideoFileId || post.telegramFileId || "";
      if (!fileId) return "";
      return `<div class="home-post-video-frame" data-post-video="${esc(post.id)}" data-telegram-file-id="${esc(fileId)}" data-telegram-mime="${esc(post.videoMimeType || post.photoMimeType || "video/mp4")}">
        <span class="home-video-play-overlay" aria-hidden="true">▶</span>
      </div>`;
    }
    if (post.telegramFileId) {
      return `<img data-telegram-file-id="${esc(post.telegramFileId)}" data-telegram-mime="${esc(post.photoMimeType || "image/jpeg")}" class="home-post-photo home-post-photo--pending" alt="Shared photo" loading="lazy" onerror="this.style.display='none'">`;
    }
    return "";
  }

  /* Resolve lazy telegram media URLs for images and video thumbnails already in the feed. */
  async function resolveFeedMedia() {
    const images = [...feed.querySelectorAll("img.home-post-photo--pending")];
    for (const img of images) {
      const fileId = img.dataset.telegramFileId;
      const mime = img.dataset.telegramMime || "image/jpeg";
      if (!fileId) continue;
      img.classList.remove("home-post-photo--pending");
      try {
        const url = await getCachedTelegramMediaUrl(fileId, mime);
        if (url && img.isConnected) img.src = url;
      } catch { /* leave placeholder; no fatal failure */ }
    }
    const videos = [...feed.querySelectorAll(".home-post-video-frame")];
    for (const frame of videos) {
      const fileId = frame.dataset.telegramFileId;
      const mime = frame.dataset.telegramMime || "video/mp4";
      if (!fileId) continue;
      try {
        const url = await getCachedTelegramMediaUrl(fileId, mime);
        if (url && frame.isConnected) {
          frame.style.backgroundImage = `url("${esc(url)}")`;
          frame.classList.add("home-post-video-frame--ready");
        }
      } catch { /* keep placeholder overlay */ }
    }
  }

  function renderFeed(posts) {
    // Data arrived (or genuinely empty): the skeleton nodes are wiped by this
    // render, so remove the busy flag to end the "loading" announcement.
    feed.removeAttribute("aria-busy");
    feed.removeAttribute("aria-label");
    const visiblePostIds = new Set(posts.map(post => post.id));
    for (const [postId, stop] of postCommentStops) {
      if (!visiblePostIds.has(postId)) {
        stop();
        postCommentStops.delete(postId);
        commentsByPost.delete(postId);
      }
    }

    if (posts.length === 0) {
      feed.innerHTML = `<div class="home-empty-posts">
        <span class="home-empty-posts-heart" aria-hidden="true">♡</span>
        <strong>Your moments</strong>
        <p>Share a little moment together.</p>
      </div>`;
      return;
    }

    const post = posts[0];
    const author = findProfileForAuthor(post.authorId, post.authorName || "");
    const authorName = getDisplayName(post.authorId, post.authorName || "Us");
    const isLiked = (post.likedBy || []).includes(user.uid);
    const likeCount = (post.likedBy || []).length;
    const createdAt = post.createdAt?.toDate ? post.createdAt.toDate() : post.createdAt ? new Date(post.createdAt) : null;
    const timeStr = createdAt && !Number.isNaN(createdAt.getTime())
      ? createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : "Just now";

    const photoHtml = postMediaHtml(post);

    feed.innerHTML = `
      <div class="home-post-card" id="home-post-${post.id}">
        <div class="home-post-header">
          <div class="home-post-author">
            <div class="home-avatar">${author?.avatar ? `<img src="${esc(author.avatar)}" alt="">` : esc(authorName[0])}</div>
            <div>
              <strong>${esc(authorName)}</strong><br>
              <small>${timeStr}</small>
            </div>
          </div>
        </div>

        ${post.text ? `<p class="home-post-text">${esc(post.text).replace(/\n/g, '<br>')}</p>` : ''}
        ${photoHtml}

        <div class="home-post-actions">
          <button class="home-action-btn ${isLiked ? 'liked' : ''} home-like-btn" data-id="${post.id}">
            ${isLiked ? '❤️' : '♡'} ${likeCount}
          </button>
        </div>
      </div>
    `;

    void resolveFeedMedia();

    const likeBtn = feed.querySelector(`.home-like-btn[data-id="${post.id}"]`);
    if (likeBtn) {
      likeBtn.onclick = async () => {
        const liked = (post.likedBy || []).includes(user.uid);
        try {
          await toggleDiaryLike(post.id, user.uid);
          if (!liked) void notifyPartnerSafely(getProfileKey(profile), "like", `${profile.name} liked a post.`, `${post.id}-${user.uid}-${Date.now()}`, "gallery");
        } catch (err) {
          console.error("Could not update post like:", err);
          toast("Could not update the like.");
        }
      };
    }
  }

  function renderComments(postId, comments) {
    const target = feed.querySelector(`#home-comments-${postId}`);
    if (!target) return;
    const roots = comments.filter(comment => !comment.parentId);
    target.innerHTML = roots.map(comment => {
      const replies = comments.filter(reply => reply.parentId === comment.id);
      const isAuthor = comment.authorId === user.uid;
      const isLiked = (comment.likedBy || []).includes(user.uid);
      const likeCount = (comment.likedBy || []).length;
      const commentActions = `
        <button class="home-comment-like-btn" type="button" data-comment-id="${comment.id}" data-liked="${isLiked}">
          ${isLiked ? '❤️' : '♡'} ${likeCount}
        </button>
        ${isAuthor ? `
          <button class="home-comment-edit-btn" type="button" data-comment-id="${comment.id}">Edit</button>
          <button class="home-comment-del-btn" type="button" data-comment-id="${comment.id}" style="color:red;">Delete</button>
        ` : ""}
      `;
      return `
        <div class="home-comment-thread">
          <div class="home-comment-item">
            <strong>${esc(getDisplayName(comment.authorId, comment.authorName || "Us"))}</strong>
            <p id="comment-text-${comment.id}">${esc(comment.text || "")}</p>
            <button class="home-comment-reply-btn" type="button" data-comment-id="${comment.id}" data-author="${esc(getDisplayName(comment.authorId, comment.authorName || "Us"))}">Reply</button>
            ${commentActions}
          </div>
          ${replies.length ? `<div class="home-comment-replies">${replies.map(reply => {
            const isReplyAuthor = reply.authorId === user.uid;
            const isReplyLiked = (reply.likedBy || []).includes(user.uid);
            const replyLikeCount = (reply.likedBy || []).length;
            return `
              <div class="home-comment-item">
                <strong>${esc(getDisplayName(reply.authorId, reply.authorName || "Us"))}</strong>
                <p id="comment-text-${reply.id}">${esc(reply.text || "")}</p>
                <button class="home-comment-like-btn" type="button" data-comment-id="${reply.id}" data-liked="${isReplyLiked}">
                  ${isReplyLiked ? '❤️' : '♡'} ${replyLikeCount}
                </button>
                ${isReplyAuthor ? `
                  <button class="home-comment-edit-btn" type="button" data-comment-id="${reply.id}">Edit</button>
                  <button class="home-comment-del-btn" type="button" data-comment-id="${reply.id}" style="color:red;">Delete</button>
                ` : ""}
              </div>
            `;
          }).join("")}</div>` : ""}
        </div>
      `;
    }).join("");

    target.querySelectorAll(".home-comment-reply-btn").forEach(button => {
      button.onclick = () => {
        const form = feed.querySelector(`.home-comment-form[data-post-id="${postId}"]`);
        const replyIndicator = form.querySelector(".home-replying-to");
        form.elements.parentId.value = button.dataset.commentId;
        replyIndicator.querySelector("span").textContent = `Replying to ${button.dataset.author}`;
        replyIndicator.hidden = false;
        form.elements.comment.placeholder = `Reply to ${button.dataset.author}...`;
        form.elements.comment.focus();
      };
    });

    target.querySelectorAll(".home-comment-like-btn").forEach(button => {
      button.onclick = async () => {
        const commentId = button.dataset.commentId;
        const liked = button.dataset.liked === "true";
        try {
          await toggleDiaryCommentLike(postId, commentId, user.uid, liked);
          if (!liked) void notifyPartnerSafely(getProfileKey(profile), "like", `${profile.name} liked a comment.`, `${commentId}-${user.uid}-${Date.now()}`, "gallery");
        } catch (err) {
          console.error("Could not update comment like:", err);
          toast("Could not update the like.");
        }
      };
    });

    target.querySelectorAll(".home-comment-del-btn").forEach(button => {
      button.onclick = async () => {
        if (confirm("Delete this comment?")) {
          try {
            await deleteDiaryComment(postId, button.dataset.commentId);
            toast("Comment deleted!");
          } catch (err) {
            console.error("Could not delete comment:", err);
            toast("Could not delete comment.");
          }
        }
      };
    });

    target.querySelectorAll(".home-comment-edit-btn").forEach(button => {
      button.onclick = () => {
        const commentId = button.dataset.commentId;
        const textEl = target.querySelector(`#comment-text-${commentId}`);
        const newText = prompt("Edit comment:", textEl.textContent);
        if (newText !== null && newText.trim() !== "") {
          updateDiaryComment(postId, commentId, { text: newText.trim() })
            .then(() => toast("Comment updated!"))
            .catch(err => { console.error(err); toast("Could not update comment."); });
        }
      };
    });
  }
}

export function disposeHome() {
  homeRenderToken++;
  stopPosts?.();
  stopPosts = null;
  stopRelationship?.();
  stopRelationship = null;
  stopDrawings?.();
  stopDrawings = null;
  stopQuestionParticipants?.();
  stopQuestionParticipants = null;
  stopOwnAnswer?.();
  stopOwnAnswer = null;
  stopPartnerAnswer?.();
  stopPartnerAnswer = null;
  stopChallenges?.();
  stopChallenges = null;
  stopCustomChallenges?.();
  stopCustomChallenges = null;
  stopWaterChallenges?.();
  stopWaterChallenges = null;
  if (challengeRenderScheduled) cancelAnimationFrame(challengeRenderScheduled);
  challengeRenderScheduled = null;
  stopSpecialDays?.();
  stopSpecialDays = null;
  clearInterval(counterTimer);
  counterTimer = null;
  clearTimeout(dayRolloverTimer);
  dayRolloverTimer = null;
  postCommentStops.forEach((stop) => stop());
  postCommentStops.clear();
}
