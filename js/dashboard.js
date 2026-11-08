import { $, esc, toast, todayKey, scheduleDubaiDayRollover } from "./utils.js";
import { isVideoPost } from "./components.js";
import { watchDiaryPosts, watchRelationshipStartDate, saveRelationshipStartDate, watchDrawingMessages, toggleDiaryLike, toggleDiaryCommentLike, watchDiaryComments, addDiaryComment, updateDiaryComment, deleteDiaryComment, watchItems, notifyPartnerSafely, ensureChallengeAssignment, completeChallengeAssignment, changeDailyWaterProgress, addItem, transitionCustomChallenge, watchChallengeAssignments } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { findProfileForAuthor, getDisplayName, getProfileKey } from "./profile-data.js";
import { formatSpecialDayDate, specialDayCountdown } from "./special-day-utils.js";
import { ensureDailyQuestion, getQuestionParticipants, getQuestionAnswer, watchQuestionParticipants, watchQuestionAnswer, submitQuestionAnswer } from "./question-service.js";
import { challengeDays } from "./challenge-bank.js";
import { getCachedTelegramMediaUrl, getTelegramMediaUrl, sendToTelegram, telegramMediaReferences, telegramUploadMimeType } from "../src/services/telegramService.js";

let stopPosts = null, stopRelationship = null, stopDrawings = null, stopQuestionParticipants = null, stopSpecialDays = null, stopOwnAnswer = null, stopPartnerAnswer = null, stopChallenges = null, stopWaterChallenges = null, stopCustomChallenges = null, counterTimer = null, dayRolloverTimer = null, homeRenderToken = 0, postCommentStops = new Map();
let profileUpdateListener = null;
let assignments = [], assignmentsReady = false, waterTrackers = [], waterTrackersReady = false, customAllChallenges = [], challengeRenderScheduled = null;
const pendingWaterWrites = new Map();

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
  if (profileUpdateListener) {
    window.removeEventListener("couple-profiles-updated", profileUpdateListener);
    profileUpdateListener = null;
  }
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
  let dailyQuestion = null, questionParticipants = {}, ownAnswer = null, partnerAnswer = null, questionStatusReady = false;
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
      .home-question-body { box-sizing:border-box; width:min(100%,760px); margin:0 auto; padding:12px 14px; display:flex; flex-direction:column; gap:8px; }
      .home-question-text { margin:0; font-family:"Playfair Display",Georgia,serif; font-size:20px; font-weight:600; color:#6a2c42; line-height:1.5; padding:12px 14px; border-radius:16px; background:linear-gradient(135deg,#fff,#fdfafb); border:1px solid #f4d6e2; box-shadow:0 4px 14px rgba(142,59,90,0.06); }
      .home-question-answers { display:flex; flex-direction:column; gap:7px; }
      .home-question-answer { display:flex; align-items:center; gap:9px; padding:9px 12px; border:1px solid #f3d9e5; border-radius:14px; background:#fff; color:#5a3a4a; font-size:14px; box-shadow:0 2px 8px rgba(0,0,0,0.03); width:100%; }
      .home-question-avatar { display:grid; flex:none; width:34px; height:34px; place-items:center; overflow:hidden; border:1px solid #f3d9e5; border-radius:50%; background:#fff1f6; color:#8e3b5a; font-size:13px; font-weight:700; }
      .home-question-avatar img { display:block; width:100%; height:100%; object-fit:cover; }
      .home-question-answer-name { font-family:"Playfair Display",Georgia,serif; font-weight:600; color:#8e3b5a; flex-shrink:0; font-size:13px; letter-spacing:.02em; }
      .home-question-answer-text { flex:1; }
      .home-question-answer-form { display:grid; gap:7px; }
      .home-question-answer-form textarea { box-sizing:border-box; width:100%; min-height:72px; padding:11px; border:1px solid #f0ccda; border-radius:13px; background:#fffafd; color:#60283f; font:600 14px/1.45 system-ui,sans-serif; resize:vertical; }
      .home-question-answer-form textarea:focus { outline:none; border-color:#e89cb5; box-shadow:0 0 0 3px #e89cb526; }
      .home-question-form-row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
      .home-question-status { color:#a58392; font-size:11px; }
      .home-question-form-row button { padding:9px 16px; border:none; border-radius:999px; background:linear-gradient(135deg,#e85c91,#c73d76); color:#fff; font-size:13px; font-weight:700; cursor:pointer; transition:all .2s ease; }
      .home-question-form-row button:hover { transform:translateY(-1px); box-shadow:0 6px 16px rgba(199,61,118,0.3); }
      .home-question-form-row button:disabled { opacity:.6; cursor:default; transform:none; }
      .home-question-answer.locked .home-question-answer-text { filter:blur(5px); user-select:none; }
      .home-see-history-btn { padding:7px 14px; border:1px solid #f4d6e2; border-radius:10px; background:#fff; color:#8e3b5a; font-size:12px; font-weight:600; cursor:pointer; align-self:flex-start; transition:all .2s ease; white-space:nowrap; max-width:fit-content; }
      .home-see-history-btn:hover { background:#fce4ec; border-color:#eec3d7; color:#6a2c42; transform:translateY(-1px); }
      .home-see-history-btn:focus-visible { outline:3px solid #d96a9666; outline-offset:2px; }

      .section-head { display:flex; align-items:center; justify-content:space-between; margin:0 0 18px; }
      .section-head .eyebrow { font-family:"Playfair Display",Georgia,serif; font-size:13px; font-weight:600; color:#b84c6e; letter-spacing:.16em; text-transform:uppercase; margin:0; }
      .section-head h2 { font-family:"Playfair Display",Georgia,serif; font-size:22px; font-weight:600; color:#6a2c42; margin:0; letter-spacing:.01em; }
      .home-section-head { align-items:flex-start; flex-direction:column; gap:3px; margin-bottom:12px; }
      .section-head.home-section-head h2.home-section-title { display:flex; align-items:center; gap:9px; margin:0; color:#6a2c42; font:800 clamp(23px,4vw,27px)/1.15 "DM Sans",system-ui,sans-serif; letter-spacing:-.025em; }
      .home-section-title .heading-mark { width:30px; height:30px; display:grid; place-items:center; flex:none; border-radius:10px; font-size:16px; letter-spacing:0; }
      .home-section-title.is-question .heading-mark { background:#ffe8f1; }
      .home-section-title.is-habit .heading-mark { background:#fff0f6; }
      .home-section-title.is-challenge .heading-mark { background:#f9e9f1; }
      .home-section-subtitle { margin:0 0 0 39px; color:#967d8b; font-size:12px; font-weight:500; line-height:1.4; }

      .today-section { margin:24px 0 20px; box-sizing:border-box; overflow:visible; }
      .today-cards { display:flex; flex-direction:column; gap:0; margin:0; padding:0; }
      .today-question { position:relative; padding:12px; border:1px solid #f1d8e2; border-radius:22px; background:linear-gradient(145deg,#fff,#fffafd); box-shadow:0 8px 24px rgba(142,59,90,0.07); min-height:auto; overflow:visible; transition:all .3s ease; }
      .today-question:hover { transform:translateY(-2px); box-shadow:0 10px 32px rgba(142,59,90,0.12); border-color:#eec3d7; }
      .today-question::before { content:"♡"; position:absolute; top:-10px; left:20px; width:20px; height:20px; background:#fff; border:1px solid #f4d6e2; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; color:#e89cb5; z-index:2; box-shadow:0 2px 8px rgba(0,0,0,0.06); }

      .habit-section { margin:32px 0 24px; box-sizing:border-box; overflow:visible; -webkit-touch-callout:none; -webkit-tap-highlight-color:transparent; }
      .habit-section, .habit-section * { -webkit-user-select:none; user-select:none; }
      .habit-cards { display:flex; flex-direction:column; gap:14px; }
      .habit-card { padding:18px; border:1px solid #f1d8e2; border-radius:22px; background:linear-gradient(145deg,#fff,#fffafd); box-shadow:0 7px 22px rgba(142,59,90,0.06); display:flex; flex-direction:column; gap:14px; transition:all .25s ease; }
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

      .challenge-pun-section { margin:30px 0 28px; box-sizing:border-box; overflow:visible; }
      .challenge-pun-section .section-head.home-section-head { display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; gap:4px; margin:0 0 14px; }
      .challenge-pun-list { display:flex; flex-direction:column; gap:12px; }
      .home-challenge-filters { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; margin:0 0 12px; }
      .home-challenge-filter { min-width:0; min-height:34px; padding:6px 4px; border:1px solid #f0d8e2; border-radius:10px; background:#fff; color:#806774; font-size:10px; font-weight:700; line-height:1; white-space:nowrap; cursor:pointer; }
      .home-challenge-filter b { margin-left:2px; color:#a05070; font-size:9px; }
      .home-challenge-filter[aria-pressed="true"] { border-color:#df91b0; background:#ffe8f1; color:#8e3b5a; box-shadow:inset 0 0 0 1px #f3c7d8; }
      .home-challenge-filter[aria-pressed="true"] b { color:#8e3b5a; }
      .home-challenge-board { display:grid; gap:12px; padding:14px; border:1px solid #f2d5e1; border-radius:22px; background:linear-gradient(155deg,#fffafd 0%,#fff5f9 100%); box-shadow:0 8px 24px rgba(142,59,90,.07); }
      .home-challenge-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin:0; padding:0; }
      .home-challenge-summary-stat { min-width:0; padding:10px 6px; border:1px solid #f3e3ea; border-radius:14px; background:rgba(255,255,255,.88); text-align:center; box-shadow:0 2px 8px rgba(142,59,90,.04); }
      .home-challenge-summary-stat strong { display:block; color:#6a2c42; font-size:20px; line-height:1.1; font-variant-numeric:tabular-nums; }
      .home-challenge-summary-stat span { display:block; margin-top:5px; color:#967d8b; font-size:10px; font-weight:700; }
      .challenge-card { padding:18px 20px; border:1px solid #f3d9e5; border-radius:20px; background:#fff; box-shadow:0 4px 16px rgba(142,59,90,0.06); cursor:pointer; transition:all .25s ease; display:flex; flex-direction:column; gap:12px; }
      .challenge-card:hover { transform:translateY(-2px); box-shadow:0 10px 28px rgba(142,59,90,0.1); border-color:#eec3d7; }
      .water-challenge-card { animation:none; cursor:default; }
      .water-challenge-card:hover { transform:none; }
      .challenge-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:4px; }
      .challenge-card-type { font-size:10px; padding:4px 10px; border-radius:8px; font-weight:700; flex:none; letter-spacing:.08em; text-transform:uppercase; }
      .challenge-card-type.challenge { background:#eec3d7; color:#6a2c42; border:1px solid #f1b8d0; }
      .challenge-card-type.punishment { background:#f1c4d6; color:#8e3b5a; border:1px solid #e8a9c3; }
      .challenge-card-title { font-family:"Playfair Display",Georgia,serif; font-size:15px; font-weight:600; color:#6a2c42; margin:0 0 6px; flex:1; line-height:1.4; }
      .challenge-card-title-edit { display:block; width:100%; padding:0; border:0; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }
      .challenge-card-title-edit:hover { color:#8e3b5a; text-decoration:underline; text-underline-offset:3px; }
      .challenge-card-title-edit:focus-visible { outline:2px solid #d876a0; outline-offset:3px; border-radius:3px; }
      .challenge-card-desc { font-size:13px; color:#8c737d; margin:0 0 10px; line-height:1.5; flex:1; }
      .challenge-card-meta { display:flex; gap:12px; font-size:11px; color:#a58392; margin-bottom:8px; }
      .challenge-card-meta span { white-space:nowrap; }
      .challenge-card-actions { display:flex; gap:8px; }
      .challenge-card-btn { flex:1; padding:9px 12px; border:1px solid #f4d6e2; border-radius:10px; background:#fff; color:#8e3b5a; font-size:11px; font-weight:700; cursor:pointer; transition:all .2s ease; }
      .challenge-card-btn:hover { background:#fce4ec; border-color:#eec3d7; color:#6a2c42; transform:translateY(-1px); }
      .challenge-empty { padding:22px 16px; border:1px dashed #eccbd9; border-radius:16px; background:rgba(255,255,255,.72); text-align:center; color:#a58392; font-size:13px; line-height:1.5; }
      .home-view-more-challenges { width:100%; min-height:44px; padding:10px 18px; border:1px solid #f0cbd9; border-radius:14px; background:linear-gradient(135deg,#fff,#fff6fa); color:#8e3b5a; font-size:12px; font-weight:800; cursor:pointer; transition:all .2s ease; box-shadow:0 3px 10px rgba(142,59,90,.05); }
      .home-view-more-challenges:hover { background:#fce4ec; border-color:#eec3d7; color:#6a2c42; transform:translateY(-1px); }
      .home-challenge-create-panel { margin:0; padding:13px; border:1px solid #f2d5e1; border-radius:17px; background:rgba(255,255,255,.82); box-shadow:0 3px 12px rgba(142,59,90,.04); }
      .home-challenge-create-head { display:flex; align-items:center; gap:10px; margin:0 0 11px; }
      .home-challenge-create-icon { display:grid; place-items:center; width:36px; height:36px; flex:none; border-radius:12px; background:#fff0f6; font-size:18px; }
      .home-challenge-create-copy { min-width:0; }
      .home-challenge-create-copy strong { display:block; color:#6a2c42; font-size:13px; font-weight:800; }
      .home-challenge-create-copy small { display:block; margin-top:2px; color:#967d8b; font-size:11px; line-height:1.35; }
      .home-challenge-kind-options { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
      .home-challenge-kind-btn { display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; min-height:48px; padding:9px 13px; border:1px solid #efbfd1; border-radius:14px; background:linear-gradient(145deg,#fff,#fff6fa); color:#8e3b5a; font-size:12px; font-weight:800; text-align:left; cursor:pointer; box-shadow:0 3px 9px rgba(142,59,90,.05); transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
      .home-challenge-kind-btn:hover { transform:translateY(-1px); border-color:#d96a96; box-shadow:0 6px 14px rgba(142,59,90,.1); }
      .home-challenge-kind-btn:active { transform:scale(.98); }
      .home-challenge-kind-btn:focus-visible, .home-view-more-challenges:focus-visible { outline:3px solid #d96a9666; outline-offset:2px; }
      .home-challenge-kind-btn.punishment { border-color:#e8c2ce; background:linear-gradient(145deg,#fffafd,#fff0f4); color:#a23865; }

      /* New status badges and featured challenge styles */
      .challenge-status { font-size:9px; padding:3px 9px; border-radius:8px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; flex:none; }
      .challenge-status.status-upcoming { background:#f1e3ea; color:#a58392; border:1px solid #ead3dd; }
      .challenge-status.status-in-progress { background:#eec3d7; color:#6a2c42; border:1px solid #f1b8d0; }
      .challenge-status.status-accepted { background:#dcebf7; color:#4a7c9c; border:1px solid #b8d4e8; }
      .challenge-status.status-submitted { background:#fff0d7; color:#99621b; border:1px solid #f0d6a9; }
      .challenge-status.status-extension-requested { background:#f5e7fb; color:#794394; border:1px solid #e2c8ef; }
      .challenge-status.status-completed { background:#e8f0e8; color:#4a7c5a; border:1px solid #bcd4bc; }

      .challenge-card.featured { border:2px solid #eec3d7; box-shadow:0 8px 32px rgba(142,59,90,0.1); position:relative; overflow:hidden; }
      .challenge-card.featured::before { content:""; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,#e89cb5,#c73d76,#b84c6e); }
      .challenge-card.featured .challenge-card-actions { gap:10px; }

      .challenge-card-btn.primary { background:linear-gradient(135deg,#e89cb5,#c73d76); color:#fff; border:none; font-weight:700; }
      .challenge-card-btn.primary:hover { filter:brightness(0.95); transform:translateY(-1px); box-shadow:0 4px 12px rgba(199,61,118,0.3); }
      .challenge-card-btn.outline { background:transparent; border:1px solid #f4d6e2; color:#8e3b5a; font-weight:600; }
      .challenge-card-btn.outline:hover { background:#fce4ec; border-color:#eec3d7; color:#6a2c42; transform:translateY(-1px); }
      .challenge-card-btn.danger { border-color:#edc3cd; background:#fff7f8; color:#a33352; }
      .challenge-card-btn.danger:hover { border-color:#d88499; background:#fdebf0; color:#8c2442; }

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
        <div class="section-head home-section-head">
          <h2 class="home-section-title is-question"><span class="heading-mark" aria-hidden="true">💌</span>Today Question</h2>
          <p class="home-section-subtitle">A little question for two hearts ♡</p>
        </div>
        <div class="today-cards">
          <article class="card today-question" id="home-question-card">
            <div class="home-question-body">
              <p class="home-question-text" id="home-question-text">Loading today's question…</p>
              <div class="home-question-answers" id="home-question-answers"></div>
              <form class="home-question-answer-form" id="home-question-answer-form" hidden>
                <textarea name="answer" maxlength="1200" placeholder="Write your answer…" required></textarea>
                <div class="home-question-form-row">
                  <span class="home-question-status" id="home-question-status"></span>
                  <button class="primary" type="submit">Answer Now ♡</button>
                </div>
              </form>
              <button type="button" class="home-see-history-btn" id="home-see-history">See History</button>
            </div>
          </article>
        </div>
      </section>

      <section class="habit-section">
        <div class="section-head home-section-head">
          <h2 class="home-section-title is-habit"><span class="heading-mark" aria-hidden="true">✨</span>Daily Habit</h2>
          <p class="home-section-subtitle">Build habits together</p>
        </div>
        <div id="home-daily-habit" class="habit-cards"></div>
      </section>

      <section class="challenge-pun-section">
        <div class="section-head home-section-head">
          <h2 class="home-section-title is-challenge"><span class="heading-mark" aria-hidden="true">💝</span>Challenges &amp; Punishments</h2>
          <p class="home-section-subtitle">Newly received in the last 24 hours</p>
        </div>
        <div class="home-challenge-board">
          <div class="home-challenge-summary" aria-label="Challenge and punishment summary">
            <div class="home-challenge-summary-stat"><strong data-challenge-filter-count="received">0</strong><span>Received</span></div>
            <div class="home-challenge-summary-stat"><strong data-challenge-filter-count="sent">0</strong><span>Sent</span></div>
            <div class="home-challenge-summary-stat"><strong data-challenge-filter-count="pending">0</strong><span>Pending</span></div>
            <div class="home-challenge-summary-stat"><strong data-challenge-filter-count="finished">0</strong><span>Finished</span></div>
          </div>
          <div class="home-challenge-create-panel" aria-label="Send a playful challenge or punishment">
            <div class="home-challenge-create-head">
              <span class="home-challenge-create-icon" aria-hidden="true">💌</span>
              <span class="home-challenge-create-copy"><strong>Send a little something</strong><small>Choose a sweet challenge or a playful punishment.</small></span>
            </div>
            <div class="home-challenge-kind-options" role="group" aria-label="Choose what to send">
              <button type="button" class="home-challenge-kind-btn" data-home-challenge-kind="challenge"><span>💝 &nbsp;Challenge</span><span aria-hidden="true">→</span></button>
              <button type="button" class="home-challenge-kind-btn punishment" data-home-challenge-kind="punishment"><span>😈 &nbsp;Punishment</span><span aria-hidden="true">→</span></button>
            </div>
          </div>
          <div id="home-challenge-punishment" class="challenge-pun-list"></div>
        </div>
      </section>
    </div>
  `;

  const feed = $("#home-posts-feed", el);
  const dateButton = $("#relationship-date", el);
  const dateInput = $("#relationship-date-input", el);
  const questionProfileKey = getProfileKey(profile);
  const partnerProfileKey = Object.keys(APP_CONFIG.profiles).find(key => key !== questionProfileKey) || "";
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
    el.querySelectorAll("[data-home-challenge-deadline]").forEach(node => {
      const remaining = Number(node.dataset.homeChallengeDeadline) - Date.now();
      node.textContent = remaining < 0 ? "Overdue" : Math.ceil(remaining / 86400000) <= 1 ? "Due today" : `${Math.ceil(remaining / 86400000)} days left`;
    });
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
    const bothAnswered = Boolean(questionParticipants[questionProfileKey] && questionParticipants[partnerProfileKey]);
    const answeredByMe = Boolean(questionParticipants[questionProfileKey] || ownAnswer?.answer);
    if (answers) {
      const people = Object.entries(APP_CONFIG.profiles);
      answers.innerHTML = people.map(([key, person]) => {
        const isMine = key === questionProfileKey;
        const answer = isMine ? ownAnswer : partnerAnswer;
        const answered = Boolean(questionParticipants[key]);
        const locked = !isMine && !bothAnswered;
        const display = answer?.answer || "";
        let showText;
        if (display && bothAnswered) showText = esc(display) + " ♡";
        else if (display) showText = esc(display);
        else if (isMine && answered) showText = "Your answer will appear here.";
        else showText = "Waiting for your partner.";
        const avatar = person.avatar
          ? `<img src="${esc(person.avatar)}" alt="" loading="lazy">`
          : esc(person.name?.[0] || "♡");
        return `<div class="home-question-answer answer-card${locked ? " locked" : ""}" data-profile-key="${esc(key)}"><span class="home-question-avatar" aria-hidden="true">${avatar}</span><span class="home-question-answer-name">${esc(person.name)}:</span><span class="home-question-answer-text">${showText}</span></div>`;
      }).join("");
      answers.querySelectorAll(".answer-card").forEach(card => {
        card.onclick = () => window.App.navigate("questions");
      });
    }
    const form = $("#home-question-answer-form", el);
    const status = $("#home-question-status", el);
    if (form) {
      if (answeredByMe) form.remove();
      else form.hidden = !questionStatusReady;
      if (status) {
        if (answeredByMe && !bothAnswered) status.textContent = "Answered! Your answer is locked until your partner answers ♡";
        else if (bothAnswered) status.textContent = "You both answered. Answers revealed above ♡";
        else status.textContent = "";
      }
    }
  }

  profileUpdateListener = () => {
    if (isCurrent()) renderQuestionWidget();
  };
  window.addEventListener("couple-profiles-updated", profileUpdateListener);

  const answerForm = () => $("#home-question-answer-form", el);
  answerForm()?.addEventListener("submit", async event => {
    event.preventDefault();
    const answer = event.target.elements.answer.value.trim();
    if (!answer) return toast("Write an answer before submitting.");
    const submit = event.target.querySelector("button");
    submit.disabled = true;
    submit.textContent = "Saving…";
    try {
      await submitQuestionAnswer(todayKey(), questionProfileKey, answer);
      ownAnswer = { answer, answeredAt: new Date() };
      questionParticipants[questionProfileKey] = { profileKey: questionProfileKey };
      renderQuestionWidget();
      toast("Your answer is locked until both of you answer ♡");
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("already answered")) {
        try { ownAnswer = await getQuestionAnswer(todayKey(), questionProfileKey); } catch { /* answer listener will refresh it */ }
        questionParticipants[questionProfileKey] ||= { profileKey: questionProfileKey };
        renderQuestionWidget();
        toast("You have already answered today's question ♡");
        return;
      }
      console.error("Could not save today's answer:", error);
      toast(error.message || "Could not save your answer.");
      submit.disabled = false;
      submit.textContent = "Answer Now ♡";
    }
  });

  ensureDailyQuestion(todayKey()).then(questionRecord => {
    if (!isCurrent()) return;
    dailyQuestion = questionRecord;
    const questionDay = todayKey();
    Promise.all([getQuestionParticipants(questionDay), getQuestionAnswer(questionDay, questionProfileKey)]).then(([participants, answer]) => {
      if (!isCurrent()) return;
      questionParticipants = { ...questionParticipants, ...(participants || {}) };
      if (answer) ownAnswer = answer;
      questionStatusReady = true;
      renderQuestionWidget();
    }).catch(error => {
      if (!isCurrent()) return;
      console.error("Today's Question answer status could not be loaded:", error);
    });
    renderQuestionWidget();
    stopQuestionParticipants?.();
    stopQuestionParticipants = watchQuestionParticipants(todayKey(), status => {
      if (!isCurrent()) return;
      questionParticipants = { ...questionParticipants, ...(status || {}) };
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
      if (answer) {
        ownAnswer = answer;
        questionParticipants[questionProfileKey] ||= { profileKey: questionProfileKey };
      }
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
    const count = Math.max(0, Math.min(8, Number(records.find(item => item.id === `water-${todayKey()}-${key}`)?.count || 0)));
    const optimistic = key === questionProfileKey ? pendingWaterWrites.get(`${todayKey()}-${key}`) : null;
    return optimistic ? optimistic.optimisticCount : count;
  }

  function queueWaterProgress(delta) {
    const day = todayKey();
    const waterKey = `${day}-${questionProfileKey}`;
    const currentCount = waterCountFor(questionProfileKey);
    const targetCount = Math.max(0, Math.min(8, currentCount + delta));
    if (targetCount === currentCount) return;

    let state = pendingWaterWrites.get(waterKey);
    if (!state) {
      state = { confirmedCount: currentCount, optimisticCount: currentCount, pendingDeltas: [], queue: Promise.resolve() };
      pendingWaterWrites.set(waterKey, state);
    }
    state.pendingDeltas.push(delta);
    state.optimisticCount = targetCount;
    renderHabit();

    state.queue = state.queue.catch(() => {}).then(async () => {
      const queuedDelta = state.pendingDeltas[0];
      try {
        const savedCount = await changeDailyWaterProgress(day, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, queuedDelta, state.confirmedCount);
        state.confirmedCount = savedCount;
        const trackerId = `water-${day}-${questionProfileKey}`;
        const local = waterTrackers.find(item => item.id === trackerId);
        if (local) { local.count = savedCount; local.updatedAtMs = Date.now(); }
        else waterTrackers.push({ id: trackerId, type: "waterChallenge", dayKey: day, profileKey: questionProfileKey, uid: user.uid, name: profile.name, count: savedCount, updatedAtMs: Date.now() });
        if (queuedDelta > 0 && savedCount === 8) void notifyPartnerSafely(questionProfileKey, "challenge", `${profile.name} completed today's water goal.`, `water-${day}-${questionProfileKey}`, "challenges");
      } catch (error) {
        console.error("Could not update today's water progress:", error);
        toast(error.message || "Could not update water progress.");
      } finally {
        state.pendingDeltas.shift();
        state.optimisticCount = Math.max(0, Math.min(8, state.confirmedCount + state.pendingDeltas.reduce((sum, value) => sum + value, 0)));
        if (!state.pendingDeltas.length) pendingWaterWrites.delete(waterKey);
        if (isCurrent()) renderHabit();
      }
    });
  }

  function renderHabit() {
    const host = $("#home-daily-habit", el);
    if (!host) return;
    let dayChallenges = [];
    try {
      dayChallenges = challengeDays(todayKey(), 1) || [];
    } catch (e) {
      dayChallenges = [];
    }
    // Fallback: ensure send-snap and drink-water challenges always exist
    if (!dayChallenges.length) {
      const dk = todayKey();
      dayChallenges = [
        { id: `${dk}-send-snap`, challengeId: "send-snap", title: "Send Snap 📸", description: "Send your daily photo on Snapchat, then tap the button here to mark it as sent.", dayKey: dk },
        { id: `${dk}-drink-water`, challengeId: "drink-water", title: "Drink Water 💧", description: "Track your glasses of water. Your daily goal is 8 glasses each.", dayKey: dk }
      ];
    }
    const snap = dayChallenges.find(c => c.challengeId === "send-snap");
    const water = dayChallenges.find(c => c.challengeId === "drink-water");

    try {
      const people = Object.entries(APP_CONFIG.profiles);
      const snapAssignment = snap ? assignmentFor(snap) : null;
      const snapCompletedBy = snapAssignment?.completedBy || [];
      const allSnapDone = people.length > 0 && people.every(([key, person]) => snapCompletedBy.some(p => p.profileKey === key || (person.authUid && p.uid === person.authUid)));
      const snapHtml = snap ? `
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
                const sent = snapCompletedBy.some(p => p.profileKey === key || (person.authUid && p.uid === person.authUid));
                const isMine = key === questionProfileKey;
                const avatar = person.avatar ? `<img src="${esc(person.avatar)}" alt="">` : esc((person.name || "♡")[0]);
                const isShazy = person.name?.toLowerCase() === "shazy";
                return `<section class="snap-person-card ${sent ? "is-sent" : "is-pending"}${isShazy ? " is-shazy" : ""}">
                  <div class="snap-person-title"><strong>${esc(person.name || "Partner")}</strong><span aria-hidden="true">${sent ? "💛" : "📸"}</span><span class="snap-status-pill ${sent ? "sent" : "pending"}">${sent ? "✓ Sent" : "◷ Not Sent"}</span></div>
                  <div class="snap-person-main">
                    <div class="snap-visual">${sent ? `<span class="snap-sent-check" role="img" aria-label="Snap sent">✓</span>` : `<span class="snap-avatar">${avatar}</span>`}</div>
                    <div class="snap-person-details">
                      <div class="snap-state-copy"><strong>${sent ? "Snap sent today" : "Snap not sent yet"}</strong><small>${sent ? (isMine ? "You're all caught up" : "Your partner is all caught up") : (isMine ? "Send your daily moment" : "Waiting for your partner")}</small></div>
                    </div>
                  </div>
                  ${isMine && !sent ? `<button type="button" class="snap-send-button" data-action="snap-complete" data-id="${esc(snapAssignment?.id || "")}">Send Snap</button>` : `<div class="snap-action-spacer" aria-hidden="true"></div>`}
                </section>`;
              }).join("")}
            </div>
            ${allSnapDone ? `<div class="water-celebrate">You both sent today's Snap 💛</div>` : ""}
          </div>
        </article>
      ` : "";

      const waterHtml = water ? (() => {
        const waterAssignment = assignmentFor(water);
        const bothDone = people.every(([k]) => waterCountFor(k) >= 8);
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
              ${people.map(([key, person]) => {
                const count = waterCountFor(key);
                const isMine = key === questionProfileKey;
                const isShazy = person.name?.toLowerCase() === "shazy";
                const glassAsset = isShazy ? "Girl.png" : "Boy.png";
                return `<section class="water-person-progress ${isMine ? "is-mine" : ""} ${isShazy ? "water-profile-shazy" : "water-profile-keby"}" aria-label="${esc(person.name)}: ${count} of 8 glasses">
                  <div class="water-person-title"><strong>${esc(person.name)}${isMine ? " · You" : ""}</strong><span aria-hidden="true">${isShazy ? "💗" : "💙"}</span></div>
                  <div class="water-person-main">
                    <div class="water-glass-wrap" aria-hidden="true"><div class="water-glass-fill" style="--water-level:${count / 8 * 82}%"></div><img src="./Asset/${glassAsset}" alt="" loading="lazy" decoding="async"></div>
                    <div class="water-person-details"><div class="water-count"><strong>${count}</strong><span>/ 8<br>glasses</span>${isMine ? `<div class="water-count-controls"><button type="button" class="water-count-minus" data-action="water-remove" data-id="${esc(waterAssignment?.id || "")}" aria-label="Remove one glass" ${!waterTrackersReady || !assignmentsReady || count <= 0 ? "disabled" : ""}>−</button><button type="button" class="water-count-plus" data-action="water-add" data-id="${esc(waterAssignment?.id || "")}" aria-label="Add one glass" ${!waterTrackersReady || !assignmentsReady || count >= 8 ? "disabled" : ""}>＋</button></div>` : ""}</div>
                      <div class="water-progress-track" role="progressbar" aria-label="${esc(person.name)} daily water progress" aria-valuemin="0" aria-valuemax="8" aria-valuenow="${count}"><span style="width:${count / 8 * 100}%"></span></div>
                      <small class="water-progress-caption">${count >= 8 ? "Daily goal complete ✓" : `${8 - count} glasses to go`}</small>
                    </div>
                  </div>
                </section>`;
              }).join("")}
            </div>
            ${bothDone ? `<div class="water-celebrate">Hydrated together 💧✨</div>` : ""}
          </div>
        </article>
      `;
      })() : "";

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
              queueWaterProgress(delta);
              return;
            }
          } catch (error) {
            console.error(error);
            toast(error.message || "Could not update this.");
            btn.disabled = false;
          }
        };
      });
    } catch (e) {
      console.error("Habit render error:", e);
      host.innerHTML = `<div class="challenge-empty">Habit content could not be loaded.</div>`;
    }
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

  function isMineChallenge(item) {
    return item.authorKey === questionProfileKey || item.author === user.uid;
  }

  function isReceivedChallenge(item) {
    return item.recipientKey === questionProfileKey || (!item.recipientKey && !isMineChallenge(item));
  }

  function renderChallengeCards() {
    const host = $("#home-challenge-punishment", el);
    if (!host) return;
    const counts = {
      received: customChallenges.filter(item => isReceivedChallenge(item) && item.status !== "completed").length,
      sent: customChallenges.filter(item => isMineChallenge(item) && item.status !== "completed").length,
      pending: customChallenges.filter(item => item.status !== "completed").length,
      finished: customChallenges.filter(item => item.status === "completed").length
    };
    Object.entries(counts).forEach(([filter, count]) => {
      const countNode = el.querySelector(`[data-challenge-filter-count="${filter}"]`);
      if (countNode) countNode.textContent = String(count);
    });
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const items = customChallenges.filter(item => {
      const receivedAt = Number(item.sentAtMs || item.assignedAtMs || item.createdAtMs || 0);
      return isReceivedChallenge(item) && receivedAt >= dayAgo && receivedAt <= now;
    }).sort((a, b) => Number(b.sentAtMs || b.assignedAtMs || b.createdAtMs || 0) - Number(a.sentAtMs || a.assignedAtMs || a.createdAtMs || 0));
    const statusLabel = item => ({ upcoming: "Pending", "in-progress": "Accepted", submitted: "Proof submitted", "extension-requested": "Extension requested", completed: "Finished" }[item.status] || item.status);
    const cards = items.map(item => {
      const isPunishment = item.kind === "punishment";
      const deadline = item.deadlineAt ? new Date(item.deadlineAt) : null;
      const daysLeft = deadline ? Math.max(0, Math.ceil((deadline.getTime() - now) / 86400000)) : 0;
      const title = item.title || item.description?.slice(0, 50) || "Challenge";
      return `
        <article class="challenge-card" data-challenge-id="${esc(item.id)}">
          <div class="challenge-card-head">
            <span class="challenge-card-type ${isPunishment ? "punishment" : "challenge"}">${isPunishment ? "Punishment" : "Challenge"}</span>
            <span class="challenge-status status-${esc(item.status || "upcoming")}">${esc(statusLabel(item))}</span>
          </div>
          <h3 class="challenge-card-title">${esc(title)}</h3>
          <p class="challenge-card-desc">${esc(item.description || "")}</p>
          <div class="challenge-card-meta">
            <span>By ${esc(item.authorName || "Partner")}</span>
            ${deadline ? `<span>⏳ ${deadline.getTime() < now ? "Overdue" : daysLeft ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left` : "Due today"}</span>` : ""}
          </div>
          <div class="challenge-card-actions">
            ${item.status === "upcoming" ? `<button type="button" class="challenge-card-btn primary" data-action="accept">Accept</button>` : ""}
            ${item.status === "in-progress" ? `<button type="button" class="challenge-card-btn primary" data-action="complete">Submit Proof</button>` : ""}
            <button type="button" class="challenge-card-btn outline" data-action="view">View Details →</button>
          </div>
        </article>`;
    }).join("");
    host.innerHTML = `${cards || `<div class="challenge-empty">No new challenges or punishments received in the last 24 hours.</div>`}<button type="button" class="home-view-more-challenges" data-challenge-view-all>View all challenges →</button>`;
    host.querySelector("[data-challenge-view-all]")?.addEventListener("click", () => {
      sessionStorage.setItem("challenge-open-hub", "true");
      window.App.navigate("challenges");
    });

    host.querySelectorAll("[data-action]").forEach(btn => {
      btn.onclick = async event => {
        event.stopPropagation();
        const action = btn.dataset.action;
        const card = btn.closest(".challenge-card");
        const id = card.dataset.challengeId;
        const item = customChallenges.find(c => c.id === id);
        if (!item) return;

        if (action === "edit") {
          sessionStorage.setItem("challenge-compose-edit-item", JSON.stringify(item));
          window.App.navigate("challenges");
          return;
        }

        if (action === "delete") {
          if (!window.confirm(`Delete “${item.title || "this challenge"}”? This cannot be undone.`)) return;
          btn.disabled = true;
          btn.textContent = "Deleting…";
          try {
            await transitionCustomChallenge(id, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, "delete");
            toast("Challenge deleted.");
            renderChallengeCards();
          } catch (error) {
            console.error("Challenge delete failed:", error);
            toast(error.message || "Could not delete this challenge.");
            btn.disabled = false;
            btn.textContent = "Delete";
          }
          return;
        }

        btn.disabled = true;
        btn.textContent = "Working…";

        try {
          if (action === "accept") {
            await transitionCustomChallenge(id, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, "accept");
            toast("Challenge accepted ♡");
          } else if (action === "complete") {
            if (item.proofType === "none") {
              await transitionCustomChallenge(id, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, "submit-proof", { note: "No proof required." });
              void notifyPartnerSafely(questionProfileKey, "challenge", `${profile.name} submitted “${item.title}” for review.`, `${id}-submitted`, "challenges");
              toast("Sent for review ♡");
              renderChallengeCards();
              return;
            }
            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.accept = item.proofType === "photo" ? "image/*" : item.proofType === "video" ? "video/*" : item.proofType === "voice" ? "audio/*" : "image/*,video/*,audio/*";
            fileInput.onchange = async () => {
              const file = fileInput.files[0];
              if (!file && item.proofType !== "none") { btn.disabled = false; btn.textContent = "Submit Proof"; return; }
              try {
                let photoMetadata = {};
                if (file) {
                  if (item.proofType === "photo" && !file.type.startsWith("image/") || item.proofType === "video" && !file.type.startsWith("video/") || item.proofType === "voice" && !file.type.startsWith("audio/")) throw new Error(`Please submit a ${item.proofType} proof.`);
                  const timestamp = new Date().toLocaleString();
                  const label = file.type.startsWith("video/") ? "Challenge Proof Video" : (file.type.startsWith("audio/") ? "Challenge Proof Voice" : "Challenge Proof Photo");
                  const result = await sendToTelegram(file, `${label} · ${profile.name} · ${timestamp}`);
                  photoMetadata = { ...telegramMediaReferences(result), mimeType: telegramUploadMimeType(file) };
                  if (file.type.startsWith("video/")) photoMetadata.videoMimeType = telegramUploadMimeType(file);
                  if (file.type.startsWith("audio/")) photoMetadata.audioMimeType = telegramUploadMimeType(file);
                  if (file.type.startsWith("image/")) photoMetadata.photoMimeType = telegramUploadMimeType(file);
                }
                await transitionCustomChallenge(id, { uid: user.uid, profileKey: questionProfileKey, name: profile.name }, "submit-proof", { note: "Submitted via dashboard", ...photoMetadata });
                void notifyPartnerSafely(questionProfileKey, "challenge", `${profile.name} submitted proof for a challenge.`, `${id}-submitted`, "challenges");
                toast("Proof sent for review ♡");
              } catch (error) {
                console.error(error);
                toast(error.message || "Could not complete.");
                btn.disabled = false;
                btn.textContent = "Submit Proof";
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
          btn.textContent = action === "accept" ? "Accept Challenge" : "Submit Proof";
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

  el.querySelectorAll("[data-home-challenge-kind]").forEach(button => {
    button.onclick = () => {
      sessionStorage.setItem("challenge-compose-kind", button.dataset.homeChallengeKind);
      window.App.navigate("challenges");
    };
  });

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

  /* Build the media preview HTML for a feed post.
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
      feed.closest(".home-post-panel")?.classList.remove("home-post-panel--media");
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
    const hasMedia = Boolean(photoHtml);
    feed.closest(".home-post-panel")?.classList.toggle("home-post-panel--media", hasMedia);

    feed.innerHTML = `
      <div class="home-post-card${hasMedia ? " home-post-card--media" : ""}" id="home-post-${post.id}">
        <div class="home-post-header">
          <div class="home-post-author">
            <div class="home-avatar">${author?.avatar ? `<img src="${esc(author.avatar)}" alt="">` : esc(authorName[0])}</div>
            <div>
              <strong>${esc(authorName)}</strong><br>
              <small>${timeStr}</small>
            </div>
          </div>
        </div>

        ${!hasMedia && post.text ? `<p class="home-post-text">${esc(post.text).replace(/\n/g, '<br>')}</p>` : ''}
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
  if (profileUpdateListener) {
    window.removeEventListener("couple-profiles-updated", profileUpdateListener);
    profileUpdateListener = null;
  }
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
