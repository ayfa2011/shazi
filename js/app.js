import { initAuth, logout } from "./auth.js";
import { $, $$, esc, toast } from "./utils.js";
import { postCardComponent, commentComponent, isVideoPost } from "./components.js";
import { initPresence, watchAllPresence } from "./presence.js";
import { initPartnerChat } from "./partner-chat.js";
import { renderHome, disposeHome } from "./dashboard.js";
import { renderMemories, disposeMemories } from "./memories.js";
import { renderGames, disposeGames } from "./games.js";
import { renderLetters, disposeLetters } from "./letters.js";
import { renderQuestions, disposeQuestions } from "./questions.js";
import { watchItems, watchDiaryPosts, loadOlderDiaryPosts, toggleDiaryLike, watchDiaryComments, addDiaryComment, updateDiaryComment, deleteDiaryComment, addDiaryPost, updatePost, deletePost, notifyPartnerSafely } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { renderBucket, disposeBucket } from "./bucket-list.js";
import { renderActivities } from "./activities.js";
import { renderMore } from "./more.js";
import { renderSharedGallery, disposeSharedGallery } from "./gallery.js";
import { renderProfile } from "./profile.js";
import { disposeSpecialDays } from "./special-days.js";
import { disposeNotificationCenter, initNotificationCenter } from "./notification-center.js";
import { renderDrawing, disposeDrawing } from "./drawing.js";
import { renderChallenges, disposeChallenges } from "./challenges.js";
import { initMusic } from "./music.js";
import { firebaseReady } from "./firebase.js";
import { getTelegramMediaUrl, getCachedTelegramMediaUrl, sendToTelegram, telegramMediaReferences, telegramUploadMimeType } from "../src/services/telegramService.js";
import { saveCoupleProfile, watchCoupleProfiles } from "./firestore.js";
import { applyCoupleProfiles, findProfileForAuthor, getDisplayName, getProfileKey, hydrateCoupleProfileAvatars } from "./profile-data.js";

let currentUser = null, currentProfile = null, disposeMusic = null, stopPresence = null, disposePartnerChat = null;
let currentRoute = "home", stopCoupleProfiles = null, handlingPopState = false;
let navBadgeStops = [];
const navBadgeState = {};

function setNavBadge(route, visible) {
  document.querySelector(`.bottom-nav [data-route="${route}"]`)?.classList.toggle("has-new", Boolean(visible));
}

function navSeenKey(route) {
  return `olw-nav-seen:${APP_CONFIG.coupleId}:${getProfileKey(currentProfile) || "profile"}:${route}`;
}

function updateContentBadge(route, items) {
  const signature = (items || []).map(item => item.id).join(",");
  navBadgeState[route] = signature;
  const key = navSeenKey(route);
  try {
    const seen = localStorage.getItem(key);
    if (seen === null) localStorage.setItem(key, signature);
    setNavBadge(route, Boolean(seen && seen !== signature && currentRoute !== route));
    if (currentRoute === route) localStorage.setItem(key, signature);
  } catch { setNavBadge(route, false); }
}

function initNavBadges(user) {
  navBadgeStops.forEach(stop => stop?.());
  navBadgeStops = [];
  try {
    navBadgeStops.push(watchDiaryPosts(items => updateContentBadge("gallery", items), 1));
    navBadgeStops.push(watchItems("memory", items => updateContentBadge("memories", items)));
    navBadgeStops.push(watchItems("customChallenge", items => updateContentBadge("more", items)));
    navBadgeStops.push(watchItems("letter", items => {
      const profileKey = getProfileKey(currentProfile);
      const unread = (items || []).some(letter => letter.author !== user.uid && !letter.readAt && recipientKeyForNav(letter.recipient) === profileKey && letter.status !== "Scheduled");
      setNavBadge("letters", unread);
    }));
  } catch (error) {
    console.error("Navigation updates could not be loaded:", error);
  }
}

function recipientKeyForNav(recipient) {
  if (!recipient) return "";
  if (Object.hasOwn(APP_CONFIG.profiles, recipient)) return recipient;
  const profile = Object.entries(APP_CONFIG.profiles).find(([key, value]) => value.id === recipient || value.authUid === recipient || value.email === recipient || value.name === recipient);
  return profile?.[0] || "";
}

function updateProfileAvatar(profile) {
  const avatar = $("#avatar-letter");
  if (!avatar) return;
  if (profile.avatar) {
    const image = new Image();
    image.alt = "";
    image.src = profile.avatar;
    avatar.replaceChildren(image);
  } else {
    avatar.textContent = profile.emoji || profile.name?.[0] || "♡";
  }
}

window.addEventListener("couple-profiles-updated", () => {
  if (!currentUser) return;
  currentProfile = Object.values(APP_CONFIG.profiles).find(person => person.email === currentUser.email) || currentProfile;
  if (currentProfile) updateProfileAvatar(currentProfile);
  if (currentRoute === "profile") $("#main-content")?.dispatchEvent(new Event("couple-profile-settings-changed"));
});

// Post / Twitter Feed Logic
function renderGallery(el, user, profile) {
  renderPostFeed(el, user, profile);
}

let stopPostFeed = null, disposePostFeed = null, stopActivePostComments = null, activePostCommentsId = "";

function renderPostFeed(el, user, profile) {
  disposePostFeed?.();
  let active = true, selectedProfile = "all", posts = [];
  const postPageSize = 50;
  let postPageCursor = null, postHasMore = false, postPageLoading = false;
  let olderPosts = [];
  const commentsByPost = new Map();
  let detailPostId = "";
  let voiceRecorder = null;
  let voiceChunks = [];
  let voicePromise = null;
  let voiceResolve = null;
  let voiceTarget = null;
  let selectedPostVoice = null;
  let selectedPostMediaFile = null;
  let selectedPhotoPosition = { x: 50, y: 50 };
  let selectedPhotoPreviewUrl = "";
  const getPostAuthorKey = (post) => {
    const author = findProfileForAuthor(post.authorId, post.authorName || "Us");
    return author ? getProfileKey(author) : null;
  };

  el.innerHTML = `
    <style>
      .tw-feed-container {
        max-width: 550px;
        margin: 0 auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .tw-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #ffffff;
        border-bottom: 1px solid #eff3f4;
        position: sticky;
        top: 0;
        z-index: 10;
      }
      .tw-header h1 {
        font-size: 18px;
        font-weight: 800;
        margin: 0;
        color: #0f1419;
      }
      .tw-composer {
        display: flex;
        gap: 12px;
        padding: 14px 16px;
        background: #ffffff;
        border-bottom: 1px solid #eff3f4;
      }
      .tw-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #e11d48;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        flex-shrink: 0;
      }
      .tw-composer-input {
        flex: 1;
      }
      .tw-composer-input textarea {
        width: 100%;
        border: none;
        outline: none;
        font-size: 16px;
        resize: none;
        font-family: inherit;
      }
      .tw-composer-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 10px;
        border-top: 1px solid #eff3f4;
        padding-top: 10px;
      }
      .tw-post-btn {
        background: #d74482;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 20px;
        font-weight: 700;
        cursor: pointer;
      }
      .tw-post-card {
        padding: 14px 16px;
        border-bottom: 1px solid #eff3f4;
        background: #ffffff;
        display: flex;
        gap: 12px;
        position: relative;
        margin-bottom: 0.1cm;
      }
      .tw-post-card .tw-post-actions {
        position: absolute;
        top: 10px;
        right: 12px;
      }
      .tw-post-menu-btn {
        min-width: 0;
        min-height: 0;
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: #536471;
        font-size: 16px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: 1px;
        text-indent: 1px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .tw-post-menu-btn:hover {
        background: #f0f6fa;
        color: #d74482;
      }
      .tw-post-menu {
        display: none;
        position: absolute;
        top: 30px;
        right: 0;
        z-index: 20;
        min-width: 130px;
        padding: 6px;
        border: 1px solid #eff3f4;
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 8px 24px rgba(15, 20, 25, 0.12);
      }
      .tw-post-menu.open {
        display: grid;
        gap: 2px;
      }
      .tw-post-card .tw-edit-btn,
      .tw-post-card .tw-del-btn {
        min-width: 0;
        min-height: 0;
        padding: 8px 10px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        font: 700 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: left;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .tw-post-card .tw-edit-btn {
        color: #0f1419;
      }
      .tw-post-card .tw-edit-btn:hover {
        background: #f0f6fa;
      }
      .tw-post-card .tw-del-btn {
        color: #bd3158;
      }
      .tw-post-card .tw-del-btn:hover {
        background: #fff0f2;
      }
      .tw-post-content {
        flex: 1;
      }
      .tw-post-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .tw-user-info {
        font-size: 14px;
      }
      .tw-user-name {
        font-weight: 700;
        color: #0f1419;
      }
      .tw-user-handle {
        color: #536471;
        margin-left: 4px;
      }
      .tw-post-time {
        display: block;
        margin-top: 2px;
        color: #8b98a5;
        font-size: 11px;
      }
      .tw-post-text {
        font-size: 15px;
        color: #0f1419;
        margin: 6px 0;
        line-height: 1.4;
      }
      .tw-post-photo-frame { width:100%; aspect-ratio:4/3; margin-top:8px; overflow:hidden; border-radius:16px; background:#fff0f6; touch-action:pan-x pan-y pinch-zoom; cursor:zoom-in; -webkit-tap-highlight-color:transparent; }
      .tw-post-photo {
        display:block; width:100%; height:100%;
        border-radius: 16px;
        object-fit: cover;
        cursor: zoom-in;
        touch-action:pan-x pan-y pinch-zoom;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        -webkit-user-drag: none;
      }
      .tw-post-detail-photo-frame { height:min(65dvh,600px); aspect-ratio:auto; display:grid; place-items:center; background:#fff8fb; cursor:zoom-in; touch-action:pan-x pan-y pinch-zoom; }
      .tw-post-detail-photo-frame .tw-post-photo { width:auto; height:auto; max-width:100%; max-height:100%; object-fit:contain; }
      .tw-image-backdrop img { touch-action:pan-x pan-y pinch-zoom; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
      .tw-crop-editor { display:none; position:relative; width:min(100%,360px); aspect-ratio:4/3; margin:10px 0 2px; overflow:hidden; border:1px solid #f0cedd; border-radius:14px; background:#fff0f6; touch-action:none; cursor:grab; }
      .tw-crop-editor.visible { display:block; }
      .tw-crop-editor:active { cursor:grabbing; }
      .tw-crop-editor img { display:block; width:100%; height:100%; object-fit:cover; pointer-events:none; user-select:none; -webkit-user-drag:none; }
      .tw-crop-hint { position:absolute; right:8px; bottom:8px; left:8px; width:max-content; max-width:calc(100% - 16px); margin:auto; padding:6px 10px; border:1px solid #ffffff80; border-radius:999px; background:#402532a6; color:#fff; font-size:11px; text-align:center; pointer-events:none; }
      .tw-post-voice,.tw-comment-voice { display:flex; align-items:center; gap:10px; width:min(100%,360px); margin-top:9px; padding:10px 12px; border:1px solid #f1dbe5; border-radius:16px; background:linear-gradient(120deg,#fff1f7,#fffafd); color:#713451; }
      .tw-post-voice audio,.tw-comment-voice audio { display:none; }
      .tw-audio-play { flex:none; width:34px; height:34px; border-radius:50%; background:#e95f97; color:white; cursor:pointer; }
      .tw-audio-wave { display:flex; flex:1; height:26px; align-items:center; justify-content:center; gap:3px; overflow:hidden; }
      .tw-audio-wave i { width:3px; min-height:4px; border-radius:4px; background:#dc7ba2; opacity:.72; }
      .tw-audio-wave.playing i { animation:tw-wave .65s ease-in-out infinite alternate; }
      .tw-audio-wave.playing i:nth-child(3n) { animation-delay:.2s; }
      .tw-audio-wave.playing i:nth-child(2n) { animation-delay:.35s; }
      @keyframes tw-wave { to { transform:scaleY(.45); opacity:.4; } }
      .tw-voice-duration { flex:none; color:#896678; font-size:11px; font-variant-numeric:tabular-nums; }
      .tw-voice-recorder { min-height:36px; padding:7px 11px; border-radius:999px; background:#fff0f6; color:#a33d68; font-weight:700; cursor:pointer; }
      .tw-voice-recorder.recording { background:#a33d68; color:white; animation:tw-record-pulse 1s infinite alternate; }
      .tw-media-icon { display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; background:#fff0f6; color:#a33d68; font-size:17px; cursor:pointer; border:none; }
      .tw-media-icon.active { background:#d74482; color:white; }
      .tw-post-video-frame { position:relative; width:100%; aspect-ratio:4/3; margin-top:8px; overflow:hidden; border-radius:16px; background:#160711; }
      .tw-post-video-frame video { display:block; width:100%; height:100%; object-fit:cover; border-radius:16px; background:#160711; }
      .tw-post-video-frame .tw-video-play-overlay { position:absolute; inset:0; display:grid; place-items:center; border:none; background:transparent; color:#fff; font-size:44px; cursor:pointer; text-shadow:0 2px 12px #0009; pointer-events:none; }
      .tw-post-video-frame.playing .tw-video-play-overlay { display:none; }
      .tw-post-video-frame .tw-video-mute { position:absolute; right:8px; bottom:8px; z-index:2; width:32px; height:32px; border-radius:50%; border:none; background:#16071199; color:#fff; font-size:14px; cursor:pointer; }
      .tw-video-waiting { position:absolute; inset:0; display:grid; place-items:center; color:#fff3; font-size:26px; }
      .tw-load-older { display:none; }
      .tw-feed-sentinel { min-height:8px; }
      @keyframes tw-record-pulse { to { opacity:.65; } }
      .tw-detail-backdrop,.tw-image-backdrop { position:fixed; inset:0; z-index:1400; display:none; align-items:center; justify-content:center; padding:16px; background:#21131bc9; }
      .tw-detail-backdrop.open,.tw-image-backdrop.open { display:flex; }
      .tw-detail-modal { width:min(100%,650px); max-height:min(88dvh,900px); overflow:auto; border-radius:22px; background:#fffafd; box-shadow:0 20px 70px #16071155; }
      .tw-detail-head { position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between; padding:13px 16px; border-bottom:1px solid #f4e2e9; background:#fffafd; }
      .tw-detail-head strong { color:#793752; }
      .tw-detail-close { width:36px; height:36px; border-radius:50%; background:#fff0f6; color:#8f315d; font-size:21px; cursor:pointer; }
      .tw-detail-body { padding:16px; }
      .tw-detail-comments { display:grid; gap:10px; margin-top:15px; }
      .tw-detail-comment { padding:11px 12px; border:1px solid #f2e1e8; border-radius:15px; background:white; color:#483640; font-size:13px; line-height:1.45; overflow-wrap:anywhere; }
      .tw-detail-comment strong { color:#8f315d; }
      .tw-detail-comment-actions { display:flex; gap:8px; margin-top:7px; }
      .tw-detail-reply { display:flex; gap:8px; margin-top:12px; }
      .tw-detail-reply input { min-width:0; flex:1; border:1px solid #efdce5; border-radius:999px; padding:10px 13px; outline:none; }
      .tw-image-backdrop { z-index:1450; }
      .tw-image-backdrop img { max-width:100%; max-height:90dvh; object-fit:contain; border-radius:12px; }
      .tw-actions-bar {
        display: flex;
        justify-content: space-between;
        max-width: 350px;
        margin-top: 10px;
        color: #536471;
        font-size: 13px;
      }
      .tw-action-btn {
        background: none;
        border: none;
        color: #536471;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
      }
      .tw-action-btn:hover {
        color: #d74482;
      }
      .tw-action-btn.liked {
        color: #f91880;
      }
      .tw-profile-picker { display:flex; gap:0; overflow-x:auto; padding:8px 12px; background:#fff; border-bottom:1px solid #f3e2e9; }
      .tw-profile-card { flex:0 0 auto; display:flex; align-items:center; gap:9px; min-width:104px; padding:8px 10px; border:0; border-bottom:2px solid transparent; background:#fff; color:#60283f; text-align:left; cursor:pointer; }
      .tw-profile-card.selected { border-bottom-color:#d74482; background:#fff8fb; }
      .tw-profile-avatar { width:38px; height:38px; display:grid; place-items:center; flex:none; overflow:hidden; border-radius:50%; background:linear-gradient(135deg,#f7a8c5,#de4e88); color:#fff; font-weight:700; }
      .tw-profile-card small { display:block; margin-top:2px; color:#8b7180; font-size:10px; }
      .tw-profile-avatar img,.tw-avatar img { width:100%; height:100%; border-radius:50%; object-fit:cover; }
      .tw-profile-bio { display:block; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tw-profile-view { padding:0 16px 14px; border-bottom:1px solid #f3e2e9; background:#fff; }
      .tw-profile-cover { height:105px; margin:0 -16px; background:linear-gradient(125deg,#f6c3d7,#fff0f6 56%,#e99dbb); }
      .tw-profile-summary { display:flex; justify-content:space-between; align-items:flex-end; min-height:48px; }
      .tw-profile-large-avatar { width:78px; height:78px; margin-top:-39px; display:grid; place-items:center; overflow:hidden; border:4px solid white; border-radius:50%; background:#ffe4ef; color:#8f315d; font-size:27px; font-weight:700; }
      .tw-profile-large-avatar img { width:100%; height:100%; object-fit:cover; }
      .tw-profile-name { margin:8px 0 0; color:#34242c; font-size:19px; font-weight:800; }
      .tw-profile-handle { margin:1px 0 0; color:#8c737d; font-size:13px; }
      .tw-profile-description { margin:9px 0 2px; color:#34242c; font-size:13px; line-height:1.45; overflow-wrap:anywhere; }
      .tw-profile-post-count { color:#8c737d; font-size:12px; }
      .tw-profile-card strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tw-profile-picker [data-profile="all"] { min-width:88px; justify-content:center; text-align:center; }
      .tw-composer,.tw-post-card,.tw-header { border-color:#f3e2e9; }
    </style>

    <div class="tw-feed-container">
      <div class="tw-header">
        <h1>Our Posts</h1>
        <span style="color:#d74482; font-size:18px;">♡</span>
      </div>

      <div class="tw-profile-picker" aria-label="Choose a profile">
        ${Object.entries(APP_CONFIG.profiles).map(([key, person]) => `
          <button type="button" class="tw-profile-card" data-profile="${esc(key)}">
            <span class="tw-profile-avatar">${person.avatar ? `<img src="${esc(person.avatar)}" alt="">` : esc(person.name[0])}</span>
            <span><strong>${esc(person.name)}</strong></span>
          </button>
        `).join("")}
        <button type="button" class="tw-profile-card selected" data-profile="all">All posts</button>
      </div>

      <div class="tw-profile-view hidden" id="tw-profile-view"></div>
      <form class="tw-composer" id="tw-main-composer">
        <div class="tw-avatar">${profile.avatar ? `<img src="${esc(profile.avatar)}" alt="">` : esc((profile.name || "U")[0])}</div>
        <div class="tw-composer-input">
          <textarea name="text" rows="3" placeholder="What's happening?"></textarea>
          <div class="tw-crop-editor" id="tw-crop-editor" aria-label="Drag photo to adjust thumbnail crop"><img id="tw-crop-preview" alt="Post thumbnail crop preview"><span class="tw-crop-hint">Drag photo to show the part you want ♡</span></div>
          <div class="tw-composer-actions">
            <span style="display:flex; gap:9px; align-items:center;">
              <button type="button" class="tw-media-icon" data-media-pick="photo" aria-label="Add a photo" title="Photo">🖼️</button>
              <button type="button" class="tw-media-icon" data-media-pick="video" aria-label="Add a video" title="Video">🎬</button>
              <button type="button" class="tw-media-icon" data-voice-record="post" aria-label="Record voice note" title="Voice note">🎙️</button>
            </span>
            <input type="file" name="photo" accept="image/*" style="display:none;">
            <input type="file" name="video" accept="video/*" style="display:none;">
            <span class="tw-photo-name" style="font-size:12px; color:#8b7180; flex:1; text-align:left;"></span>
            <button type="submit" class="tw-post-btn">Post</button>
          </div>
        </div>
      </form>

      <div id="tw-posts-feed">
        <p style="padding:20px; text-align:center; color:#8b7180;">Loading posts...</p>
      </div>
      <div class="tw-detail-backdrop" id="tw-post-detail" aria-hidden="true"><section class="tw-detail-modal" role="dialog" aria-modal="true" aria-label="Post details"><header class="tw-detail-head"><strong>Post & replies</strong><button type="button" class="tw-detail-close" id="tw-detail-close" aria-label="Close">×</button></header><div class="tw-detail-body" id="tw-detail-body"></div></section></div>
      <div class="tw-image-backdrop" id="tw-post-image-viewer" aria-hidden="true"><img alt="Full size post photo"></div>
    </div>
  `;

  const feed = $("#tw-posts-feed", el);
  const composer = $("#tw-main-composer", el);
  const profileView = $("#tw-profile-view", el);
  const detailModal = $("#tw-post-detail", el);
  const detailBody = $("#tw-detail-body", el);
  const imageViewer = $("#tw-post-image-viewer", el);
  const cropEditor = $("#tw-crop-editor", el);
  const cropPreview = $("#tw-crop-preview", el);

  function clampCrop(value) { return Math.max(0, Math.min(100, value)); }
  function cropPositionStyle(post) {
    const raw = post.photoPosition;
    if (typeof raw === "string" && /^\d{1,3}%\s+\d{1,3}%$/.test(raw)) return raw;
    return "50% 50%";
  }

  function setPhotoPreview(file) {
    if (selectedPhotoPreviewUrl) URL.revokeObjectURL(selectedPhotoPreviewUrl);
    selectedPhotoPreviewUrl = "";
    if (!file) {
      cropEditor.classList.remove("visible");
      cropPreview.removeAttribute("src");
      selectedPhotoPosition = { x: 50, y: 50 };
      return;
    }
    selectedPhotoPosition = { x: 50, y: 50 };
    selectedPhotoPreviewUrl = URL.createObjectURL(file);
    cropPreview.src = selectedPhotoPreviewUrl;
    cropPreview.style.objectPosition = "50% 50%";
    cropEditor.classList.add("visible");
  }

  let cropDrag = null;
  cropEditor.addEventListener("pointerdown", event => {
    if (!cropPreview.src) return;
    event.preventDefault();
    cropDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: selectedPhotoPosition.x, y: selectedPhotoPosition.y };
    cropEditor.setPointerCapture(event.pointerId);
  });
  cropEditor.addEventListener("pointermove", event => {
    if (!cropDrag || cropDrag.pointerId !== event.pointerId) return;
    const rect = cropEditor.getBoundingClientRect();
    selectedPhotoPosition = {
      x: clampCrop(cropDrag.x - (event.clientX - cropDrag.startX) / rect.width * 100),
      y: clampCrop(cropDrag.y - (event.clientY - cropDrag.startY) / rect.height * 100)
    };
    cropPreview.style.objectPosition = `${selectedPhotoPosition.x}% ${selectedPhotoPosition.y}%`;
  });
  cropEditor.addEventListener("pointerup", () => { cropDrag = null; });
  cropEditor.addEventListener("pointercancel", () => { cropDrag = null; });

  async function recordVoice(button, target) {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast("Voice recording is not supported in this browser.");
      return null;
    }
    if (voiceRecorder) {
      if (voiceTarget?.kind !== target.kind || voiceTarget?.postId !== target.postId) { toast("Finish the current voice recording first."); return null; }
      voiceRecorder.stop();
      button.classList.remove("recording");
      button.textContent = "🎙 Record voice note";
      return voicePromise;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(type => MediaRecorder.isTypeSupported?.(type)) || "";
      voiceRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      voiceChunks = [];
      voiceTarget = target;
      voicePromise = new Promise(resolve => { voiceResolve = resolve; });
      voiceRecorder.ondataavailable = event => { if (event.data.size) voiceChunks.push(event.data); };
      voiceRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const durationMs = Math.max(0, Date.now() - (voiceTarget?.startedAt || Date.now()));
        const blob = new Blob(voiceChunks, { type: voiceRecorder.mimeType || "audio/webm" });
        voiceRecorder = null;
        voiceChunks = [];
        button.classList.remove("recording");
        button.textContent = "🎙 Record voice note";
        try {
          const extension = blob.type.includes("mp4") ? "m4a" : "webm";
          const file = new File([blob], `voice-note-${Date.now()}.${extension}`, { type: blob.type });
          const result = await sendToTelegram(file, `Post voice note · ${profile.name} · ${new Date().toLocaleString()}`);
          voiceResolve?.({ ...telegramMediaReferences(result), mimeType: telegramUploadMimeType(file), durationMs });
        } catch (error) {
          console.error("Voice note upload failed:", error);
          toast(error.message || "Voice note could not be uploaded.");
          voiceResolve?.(null);
        } finally { voiceResolve = null; voiceTarget = null; voicePromise = null; }
      };
      voiceTarget = { ...target, startedAt: Date.now() };
      voiceRecorder.start();
      button.classList.add("recording");
      button.textContent = "● Stop recording";
      toast("Recording voice note… Tap again to finish.");
      return null;
    } catch (error) {
      console.error("Could not start voice recording:", error);
      toast("Allow microphone access to record a voice note.");
      return null;
    }
  }

  function hydrateVoicePlayers(root) {
    root.querySelectorAll("audio[data-telegram-audio-id]").forEach(audio => {
      getTelegramMediaUrl(audio.dataset.telegramAudioId, audio.dataset.telegramMime || "audio/webm")
        .then(url => { if (audio.isConnected) audio.src = url; })
        .catch(error => console.error("Post voice note could not load:", error));
      const card = audio.closest(".tw-post-voice,.tw-comment-voice");
      const button = card?.querySelector(".tw-audio-play");
      const wave = card?.querySelector(".tw-audio-wave");
      button?.addEventListener("click", async () => {
        if (audio.paused) { try { await audio.play(); } catch (error) { toast("Voice note is still loading."); } }
        else audio.pause();
      });
      audio.addEventListener("play", () => { wave?.classList.add("playing"); if (button) button.textContent = "Ⅱ"; });
      audio.addEventListener("pause", () => { wave?.classList.remove("playing"); if (button) button.textContent = "▶"; });
      audio.addEventListener("ended", () => { wave?.classList.remove("playing"); if (button) button.textContent = "▶"; });
    });
  }

  function voiceMarkup(item, className = "tw-post-voice") {
    if (!item?.telegramAudioFileId) return "";
    const seconds = Math.max(0, Math.round((Number(item.voiceDurationMs) || 0) / 1000));
    const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    const bars = [8,14,20,12,24,16,9,19,25,13,18,10,22,15,7,17,23,12,19,8];
    return `<div class="${className}"><button type="button" class="tw-audio-play" aria-label="Play voice note">▶</button><span class="tw-audio-wave" aria-hidden="true">${bars.map((height, index) => `<i style="height:${height}px;animation-delay:${index * 35}ms"></i>`).join("")}</span><span class="tw-voice-duration">${duration}</span><audio preload="none" data-telegram-audio-id="${esc(item.telegramAudioFileId)}" data-telegram-mime="${esc(item.voiceMimeType || "audio/webm")}"></audio></div>`;
  }

  function openPostDetail(postId) {
    if (activePostCommentsId !== postId) {
      stopActivePostComments?.();
      if (activePostCommentsId) commentsByPost.delete(activePostCommentsId);
      activePostCommentsId = postId;
      commentsByPost.set(postId, []);
      stopActivePostComments = watchDiaryComments(postId, comments => {
        if (!active || detailPostId !== postId) return;
        commentsByPost.set(postId, comments);
        renderPostDetail();
        const count = feed.querySelector(`.tw-reply-btn[data-id="${postId}"]`);
        if (count) count.textContent = `💬 ${comments.length} comments`;
      }, error => {
        console.error("Post replies could not be loaded:", error);
        if (active && detailPostId === postId) toast("Replies could not be loaded. Check your connection and try again.");
      });
    }
    detailPostId = postId;
    detailModal.classList.add("open");
    detailModal.setAttribute("aria-hidden", "false");
    renderPostDetail();
  }

  function closePostDetail() {
    detailPostId = "";
    stopActivePostComments?.();
    stopActivePostComments = null;
    activePostCommentsId = "";
    detailModal.classList.remove("open");
    detailModal.setAttribute("aria-hidden", "true");
  }

  // Instagram-style infinite feed: a sentinel div at the bottom of the feed
  // auto-triggers loading of the next page of older posts as you scroll.
  let feedSentinelObserver = null;
  function mountFeedSentinel(hasMore) {
    let sentinel = feed.querySelector(".tw-feed-sentinel");
    if (!hasMore) {
      sentinel?.remove();
      if (feedSentinelObserver) { feedSentinelObserver.disconnect(); feedSentinelObserver = null; }
      return;
    }
    if (!sentinel) {
      sentinel = document.createElement("div");
      sentinel.className = "tw-feed-sentinel";
      feed.appendChild(sentinel);
    }
    if (!("IntersectionObserver" in window)) { void loadOlderPosts(); return; }
    if (feedSentinelObserver) feedSentinelObserver.disconnect();
    feedSentinelObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && postHasMore && !postPageLoading) void loadOlderPosts();
    }, { rootMargin: "400px" });
    feedSentinelObserver.observe(sentinel);
  }

  function renderPostDetail() {
    const post = posts.find(item => item.id === detailPostId);
    if (!post || !detailPostId) return;
    const comments = commentsByPost.get(post.id) || [];
    const image = post.photoUrl ? `<div class="tw-post-photo-frame tw-post-detail-photo-frame"><img src="${esc(post.photoUrl)}" class="tw-post-photo" alt="Post photo" data-post-image draggable="false"></div>` : post.telegramFileId ? `<div class="tw-post-photo-frame tw-post-detail-photo-frame"><img data-telegram-file-id="${esc(post.telegramFileId)}" data-telegram-mime="${esc(post.photoMimeType || "image/jpeg")}" class="tw-post-photo" alt="Post photo" data-post-image draggable="false"></div>` : "";
    const isAuthor = getPostAuthorKey(post) === getProfileKey(profile);
    detailBody.innerHTML = `<article><div class="tw-post-header"><strong>${esc(getDisplayName(post.authorId, post.authorName || "Us"))}</strong><time class="tw-post-time">${esc(post.createdAt?.toDate ? post.createdAt.toDate().toLocaleString() : post.createdAt ? new Date(post.createdAt).toLocaleString() : "Just now")}</time></div><p class="tw-post-text">${esc(post.text || "")}</p>        ${isVideoPost(post)
          ? `<div class="tw-post-video-frame" data-post-video="${post.id}"><span class="tw-video-waiting" aria-hidden="true">◌</span><span class="tw-video-play-overlay" aria-hidden="true">▶</span><button type="button" class="tw-video-mute" aria-label="Mute or unmute video">🔈</button></div>`
          : image}<div class="tw-actions-bar"><span>❤️ ${(post.likedBy || []).length} likes</span><span>💬 ${comments.length} comments</span></div>${isAuthor ? `<div class="tw-detail-comment-actions"><button type="button" class="tw-edit-btn" data-id="${esc(post.id)}">✏️ Edit post</button><button type="button" class="tw-del-btn" data-id="${esc(post.id)}">🗑 Delete post</button></div>` : ""}</article><h3>Replies</h3><div class="tw-detail-comments">${comments.map(comment => commentComponent(comment, user, voiceMarkup)).join("") || `<p style="color:#8c737d">No replies yet. Start the conversation ♡</p>`}</div><form class="tw-detail-reply" id="tw-detail-reply-form"><input name="reply" placeholder="Write a reply…"><button class="tw-post-btn" type="submit">Reply</button></form><button type="button" class="tw-voice-recorder" data-voice-record="comment" aria-label="Record reply voice note">🎙 Record voice note</button><span id="tw-comment-voice-state" class="tw-photo-name"></span>`;
    detailBody.querySelectorAll("img[data-telegram-file-id]").forEach(img => getTelegramMediaUrl(img.dataset.telegramFileId, img.dataset.telegramMime).then(url => { if (img.isConnected) img.src = url; }).catch(() => {}));
    hydrateVoicePlayers(detailBody);
    hydratePostVideos(detailBody);
    detailBody.querySelector("#tw-detail-reply-form").onsubmit = async event => {
      event.preventDefault();
      const input = event.currentTarget.elements.reply;
      const text = input.value.trim();
      const voice = selectedCommentVoice;
      if (!text && !voice) return toast("Write a reply or record a voice note.");
      try {
        const comment = await addDiaryComment(post.id, { authorId: user.uid, authorName: profile.name, text, ...(voice ? { telegramAudioFileId: voice.telegramFileId, telegramAudioFileUniqueId: voice.telegramFileUniqueId, telegramAudioMessageId: voice.telegramMessageId, telegramAudioChatId: voice.telegramChatId, voiceMimeType: voice.mimeType, voiceDurationMs: voice.durationMs } : {}) });
        selectedCommentVoice = null;
        void notifyPartnerSafely(getProfileKey(profile), "comment", `${profile.name} replied to a post.`, comment.id, "gallery");
        input.value = "";
        toast("Reply sent!");
      } catch (error) { console.error(error); toast("Could not send reply."); }
    };
    detailBody.querySelectorAll(".tw-comment-del-btn").forEach(button => button.onclick = async () => { if (confirm("Delete this comment?")) await deleteDiaryComment(post.id, button.dataset.id); });
    detailBody.querySelectorAll(".tw-comment-edit-btn").forEach(button => button.onclick = async () => { const item = comments.find(comment => comment.id === button.dataset.id); const text = prompt("Edit comment:", item?.text || ""); if (text?.trim()) await updateDiaryComment(post.id, item.id, { text: text.trim() }); });
    detailBody.querySelectorAll(".tw-del-btn").forEach(button => button.onclick = async () => {
      if (!confirm("Delete this post?")) return;
      button.disabled = true;
      try {
        await deletePost(button.dataset.id);
        closePostDetail();
        toast("Post deleted.");
      } catch (error) {
        console.error("Could not delete post:", error);
        button.disabled = false;
        toast("Could not delete post.");
      }
    });
    detailBody.querySelectorAll(".tw-edit-btn").forEach(button => button.onclick = async () => {
      const postId = button.dataset.id;
      const item = posts.find(p => p.id === postId);
      if (!item) return;
      const text = prompt("Edit your post:", item.text || "");
      if (text === null || text.trim() === (item.text || "")) return;
      if (!text.trim() && !item.photoUrl && !item.telegramFileId && !item.telegramAudioFileId) return toast("A post needs text or media.");
      try { await updatePost(postId, { text: text.trim() }); toast("Post updated!"); } catch (error) { console.error(error); toast("Could not update post."); }
    });
  }
  let selectedCommentVoice = null;
  // ── Tap-vs-scroll guard: scrolling starting on a post photo must never
  // open the image viewer (that is what makes scroll feel "stuck" on photos).
  let postPhotoTouchStart = null;
  let suppressPostPhotoClickUntil = 0;
  const POST_PHOTO_TAP_SLOP = 12;
  function trackPostPhotoTouchStart(event) {
    if (event.touches?.length !== 1) { postPhotoTouchStart = null; return; }
    const touch = event.touches[0];
    postPhotoTouchStart = { x: touch.clientX, y: touch.clientY };
  }
  function trackPostPhotoTouchEnd(event) {
    if (!postPhotoTouchStart || event.changedTouches?.length !== 1) { postPhotoTouchStart = null; return; }
    const touch = event.changedTouches[0];
    const dx = Math.abs(touch.clientX - postPhotoTouchStart.x);
    const dy = Math.abs(touch.clientY - postPhotoTouchStart.y);
    postPhotoTouchStart = null;
    if (Math.max(dx, dy) > POST_PHOTO_TAP_SLOP) suppressPostPhotoClickUntil = Date.now() + 600;
  }
  function shouldSuppressPostPhotoClick() { return Date.now() < suppressPostPhotoClickUntil; }
  function openPostImageViewer(image) {
    if (!image || shouldSuppressPostPhotoClick()) return;
    const viewerImage = imageViewer.querySelector("img");
    viewerImage.src = image.currentSrc || image.src;
    imageViewer.classList.add("open");
    imageViewer.setAttribute("aria-hidden", "false");
  }
  [feed, detailBody].forEach(scope => {
    scope.addEventListener("touchstart", trackPostPhotoTouchStart, { passive: true });
    scope.addEventListener("touchend", trackPostPhotoTouchEnd, { passive: true });
    scope.addEventListener("touchcancel", () => { postPhotoTouchStart = null; }, { passive: true });
  });
  // iOS/Safari long-press drag on an <img> can hijack the scroll gesture.
  feed.addEventListener("dragstart", event => {
    if (event.target?.closest?.("[data-post-image]")) event.preventDefault();
  });
  detailBody.addEventListener("dragstart", event => {
    if (event.target?.closest?.("[data-post-image]")) event.preventDefault();
  });
  detailBody.addEventListener("click", event => {
    const image = event.target.closest("[data-post-image]");
    if (!image) return;
    openPostImageViewer(image);
  });

  el.querySelectorAll(".tw-profile-card").forEach(button => {
    button.onclick = () => {
      selectedProfile = button.dataset.profile;
      el.querySelectorAll(".tw-profile-card").forEach(card => card.classList.toggle("selected", card === button));
      render();
    };
  });

  composer.elements.photo.onchange = () => {
    const file = composer.elements.photo.files[0] || null;
    selectedPostMediaFile = file;
    composer.querySelector(".tw-photo-name").textContent = file ? `📷 ${file.name}` : "";
    composer.elements.video.value = "";
    composer.querySelectorAll("[data-media-pick]").forEach(button => button.classList.toggle("active", Boolean(file) && button.dataset.mediaPick === "photo"));
    setPhotoPreview(file);
  };
  composer.elements.video.onchange = () => {
    const file = composer.elements.video.files[0] || null;
    selectedPostMediaFile = file;
    composer.querySelector(".tw-photo-name").textContent = file ? `🎬 ${file.name}` : "";
    composer.elements.photo.value = "";
    composer.querySelectorAll("[data-media-pick]").forEach(button => button.classList.toggle("active", Boolean(file) && button.dataset.mediaPick === "video"));
    setPhotoPreview(null);
  };
  el.querySelectorAll("[data-media-pick]").forEach(button => {
    button.onclick = () => {
      const input = button.dataset.mediaPick === "video" ? composer.elements.video : composer.elements.photo;
      input.click();
    };
  });

  composer.onsubmit = async (e) => {
    e.preventDefault();
    const text = composer.elements.text.value.trim();
    const file = selectedPostMediaFile;
    const isVideoFile = Boolean(file?.type?.startsWith("video/") || /\.(mp4|mov|webm|m4v|mkv|avi|3gp)$/i.test(file?.name || ""));

    if (!text && !file && !selectedPostVoice) return toast("Write something first or add a photo, video or voice note.");
    const submitButton = composer.querySelector('[type="submit"]');
    if (submitButton.disabled) return;
    submitButton.disabled = true;

    try {
      let photoMetadata = {};
      if (file) {
        const timestamp = new Date().toLocaleString();
        const result = await sendToTelegram(file, `${isVideoFile ? "New Post Video 🎬" : "New Post Photo 📸"} · ${profile.name} · ${timestamp}`);
        photoMetadata = { ...telegramMediaReferences(result), photoMimeType: telegramUploadMimeType(file) };
        if (isVideoFile) photoMetadata.videoMimeType = telegramUploadMimeType(file);
      }

      const postRef = await addDiaryPost({
        authorId: user.uid,
        authorName: profile.name,
        wallId: APP_CONFIG.coupleId,
        text,
        ...photoMetadata,
        ...(file ? { photoPosition: `${Math.round(selectedPhotoPosition.x)}% ${Math.round(selectedPhotoPosition.y)}%` } : {}),
        ...(selectedPostVoice ? { telegramAudioFileId: selectedPostVoice.telegramFileId, telegramAudioFileUniqueId: selectedPostVoice.telegramFileUniqueId, telegramAudioMessageId: selectedPostVoice.telegramMessageId, telegramAudioChatId: selectedPostVoice.telegramChatId, voiceMimeType: selectedPostVoice.mimeType, voiceDurationMs: selectedPostVoice.durationMs } : {}),
        createdAt: new Date().toISOString()
      });
      await notifyPartnerSafely(getProfileKey(profile), "post", `${profile.name} shared a new post.`, postRef.id, "gallery");

      composer.reset();
      selectedPostMediaFile = null;
      composer.querySelectorAll("[data-media-pick]").forEach(button => button.classList.remove("active"));
      setPhotoPreview(null);
      selectedPostVoice = null;
      composer.querySelector(".tw-photo-name").textContent = "";
      toast("Posted! ✨");
    } catch (err) {
      console.error("Could not create post:", err);
      toast("Could not post.");
    } finally {
      submitButton.disabled = false;
    }
  };

  stopPostFeed = watchDiaryPosts((items, snapshot) => {
    if (!active) return;
    postPageCursor = snapshot?.docs?.at(-1) || postPageCursor;
    postHasMore = (snapshot?.size || 0) === postPageSize;
    const liveItems = items || [];
    const liveIds = new Set(liveItems.map(post => post.id));
    posts = [...liveItems, ...olderPosts.filter(post => !liveIds.has(post.id))];
    const visibleIds = new Set(posts.map(post => post.id));
    if (detailPostId && !visibleIds.has(detailPostId)) closePostDetail();
    render();
  }, postPageSize, [], error => {
    console.error("Post feed could not be loaded:", error);
    if (active && feed.isConnected) feed.innerHTML = `<p style="padding:24px;text-align:center;color:#8b7180">Posts could not be loaded. Check your connection and try again.</p>`;
  });

  async function loadOlderPosts(button) {
    if (postPageLoading || !postPageCursor) return;
    postPageLoading = true;
    if (button) {
      button.disabled = true;
      button.textContent = "Loading…";
    }
    try {
      const page = await loadOlderDiaryPosts(postPageCursor, postPageSize);
      if (!active) return;
      postPageCursor = page.cursor;
      postHasMore = page.hasMore;
      const loadedIds = new Set(posts.map(post => post.id));
      const newItems = page.items.filter(post => !loadedIds.has(post.id));
      olderPosts.push(...newItems);
      posts = [...posts, ...newItems];
    } catch (error) {
      console.error("Could not load older posts:", error);
      toast("Could not load older posts.");
    } finally {
      postPageLoading = false;
      if (active) render();
    }
  }

  function render() {
    const visiblePosts = selectedProfile === "all"
      ? posts
      : posts.filter(post => {
        const person = APP_CONFIG.profiles[selectedProfile];
        return person && findProfileForAuthor(post.authorId, post.authorName || "") === person;
      });
    const selectedPerson = APP_CONFIG.profiles[selectedProfile];
    profileView.classList.toggle("hidden", !selectedPerson);
    composer.classList.toggle("hidden", Boolean(selectedPerson));
    if (selectedPerson) {
      const postCount = visiblePosts.length;
      const handle = `@${selectedPerson.name.toLocaleLowerCase().replace(/\s+/g, "")}`;
      profileView.innerHTML = `
        <div class="tw-profile-cover"></div>
        <div class="tw-profile-summary">
          <div class="tw-profile-large-avatar">${selectedPerson.avatar ? `<img src="${esc(selectedPerson.avatar)}" alt="${esc(selectedPerson.name)}">` : esc(selectedPerson.name[0] || "♡")}</div>
        </div>
        <h2 class="tw-profile-name">${esc(selectedPerson.name)}</h2>
        <p class="tw-profile-handle">${esc(handle)}</p>
        <p class="tw-profile-description">${esc(selectedPerson.bio || "")}</p>
        <span class="tw-profile-post-count">${postCount} ${postCount === 1 ? "post" : "posts"}</span>
      `;
    }
    if (visiblePosts.length === 0) {
      const person = APP_CONFIG.profiles[selectedProfile];
      feed.innerHTML = `<p style="padding:24px 16px; text-align:center; color:#8b7180;">${person ? `No posts yet.` : "No posts yet. Share your first thought!"}</p><div class="tw-feed-sentinel"></div>`;
      mountFeedSentinel(postHasMore);
      return;
    }

    feed.innerHTML = visiblePosts.map((post) => {
      const isLiked = (post.likedBy || []).includes(user.uid);
      const likeCount = (post.likedBy || []).length;
      const isAuthor = getPostAuthorKey(post) === getProfileKey(profile);
      const authorName = getDisplayName(post.authorId, post.authorName || "Us");
      const authorProfile = findProfileForAuthor(post.authorId, post.authorName || "");
      const handle = `@${authorName.toLowerCase().replace(/\s+/g, "")}`;
      const createdAt = post.createdAt?.toDate ? post.createdAt.toDate() : post.createdAt ? new Date(post.createdAt) : null;
      const timeStr = createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : "Just now";

      const knownCommentCount = commentsByPost.has(post.id) ? commentsByPost.get(post.id).length : null;
      return postCardComponent(post, isLiked, likeCount, isAuthor, authorName, authorProfile, handle, timeStr, voiceMarkup, knownCommentCount, cropPositionStyle);
    }).join("");

    feed.querySelectorAll("img[data-telegram-file-id]").forEach(image => {
      image.loading = "lazy";
      image.decoding = "async";
      const fileId = image.dataset.telegramFileId;
      const mime = image.dataset.telegramMime || "image/jpeg";
      // Paint cached post photos immediately; only uncached/nearby photos
      // should start an authenticated media request.
      void getCachedTelegramMediaUrl(fileId, mime).then(cachedUrl => {
        if (cachedUrl && image.isConnected) image.src = cachedUrl;
      }).catch(() => {});
    });
    hydratePostImages(feed);
    hydrateVoicePlayers(feed);
    hydratePostVideos(feed, true);
    mountFeedSentinel(postHasMore);

    visiblePosts.forEach((post) => {
      const likeBtn = feed.querySelector(`.tw-like-btn[data-id="${post.id}"]`);
      if (likeBtn) {
        likeBtn.onclick = async () => {
          const liked = (post.likedBy || []).includes(user.uid);
          likeBtn.disabled = true;
          try {
            await toggleDiaryLike(post.id, user.uid, liked);
            if (!liked) {
              void notifyPartnerSafely(getProfileKey(profile), "like", `${profile.name} liked a post.`, `${post.id}-${user.uid}-${Date.now()}`, "gallery");
            }
          } catch (err) {
            console.error("Could not update post like:", err);
            toast("Could not update the like.");
            likeBtn.disabled = false;
          }
        };
      }
      feed.querySelector(`.tw-reply-btn[data-id="${post.id}"]`)?.addEventListener("click", () => {
        openPostDetail(post.id);
      });
      feed.querySelector(`#post-${post.id} .tw-post-content`)?.addEventListener("click", event => {
        if (event.target.closest("button")) return;
        if (event.target.matches("[data-post-image]")) return;
        openPostDetail(post.id);
      });

      const menuBtn = feed.querySelector(`.tw-post-menu-btn[data-menu-post="${post.id}"]`);
      if (menuBtn) {
        menuBtn.onclick = event => {
          event.stopPropagation();
          const menu = feed.querySelector(`.tw-post-menu[data-menu-list="${post.id}"]`);
          const isOpen = menu?.classList.contains("open");
          feed.querySelectorAll(".tw-post-menu.open").forEach(m => m.classList.remove("open"));
          feed.querySelectorAll(".tw-post-menu-btn[aria-expanded='true']").forEach(b => b.setAttribute("aria-expanded", "false"));
          if (menu && !isOpen) {
            menu.classList.add("open");
            menuBtn.setAttribute("aria-expanded", "true");
          }
        };
      }
      const closeMenu = () => {
        const menu = feed.querySelector(`.tw-post-menu[data-menu-list="${post.id}"]`);
        menu?.classList.remove("open");
        menuBtn?.setAttribute("aria-expanded", "false");
      };
      const editBtn = feed.querySelector(`.tw-edit-btn[data-edit-post="${post.id}"]`);
      if (editBtn) {
        editBtn.onclick = async () => {
          closeMenu();
          if (getPostAuthorKey(post) !== getProfileKey(profile)) return toast("Only you can edit your own post.");
          const text = prompt("Edit your post:", post.text || "");
          if (text === null || text.trim() === (post.text || "")) return;
          if (!text.trim() && !post.photoUrl && !post.telegramFileId && !post.telegramAudioFileId) return toast("A post needs text or media.");
          try {
            await updatePost(post.id, { text: text.trim() });
            toast("Post updated!");
          } catch (error) {
            console.error(error);
            toast("Could not update post.");
          }
        };
      }
      const deleteBtn = feed.querySelector(`.tw-del-btn[data-delete-post="${post.id}"]`);
      if (deleteBtn) {
        deleteBtn.onclick = async () => {
          closeMenu();
          if (getPostAuthorKey(post) !== getProfileKey(profile)) return toast("Only you can delete your own post.");
          if (!confirm("Delete this post?")) return;
          try {
            deleteBtn.disabled = true;
            await deletePost(post.id);
            toast("Post deleted.");
          } catch (error) {
            console.error(error);
            toast("Could not delete post.");
            deleteBtn.disabled = false;
          }
        };
      }
    });
    if (detailPostId) renderPostDetail();
  }

  function hydratePostImages(root) {
    const pending = [...root.querySelectorAll("img[data-telegram-file-id]:not([src])")];
    const load = image => {
      if (!image.isConnected || image.src || image.dataset.loadingMedia) return;
      image.dataset.loadingMedia = "1";
      getTelegramMediaUrl(image.dataset.telegramFileId, image.dataset.telegramMime || "image/jpeg")
        .then(url => { if (image.isConnected) image.src = url; })
        .catch(error => console.error("Post photo could not load from Telegram:", error))
        .finally(() => { delete image.dataset.loadingMedia; });
    };
    if (!("IntersectionObserver" in window)) { pending.slice(0, 4).forEach(load); return; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      load(entry.target);
    }), { rootMargin: "300px" });
    pending.forEach(image => observer.observe(image));
  }

  // ── Instagram-style video playback ──────────────────────────────────────
  // Each feed video is attached to a frame only once, loaded lazily from the
  // authenticated Telegram proxy, and muted-autoplayed when ≥55% visible.
  // Scrolling away pauses and frees it, so playback stays smooth.
  const videoFrames = new Map();   // postId -> { frame, video, observer }
  let visibleVideoId = "";
  function attachPostVideo(frame, postId, autoplay) {
    if (frame.dataset.attached) return;
    const post = posts.find(item => item.id === postId);
    if (!post) return;
    const fileId = post.telegramVideoFileId || post.telegramFileId;
    const mime = post.videoMimeType || post.photoMimeType || post.telegramMimeType || "video/mp4";
    if (!fileId) return;
    frame.dataset.attached = "1";
    const waiting = frame.querySelector(".tw-video-waiting");
    const overlay = frame.querySelector(".tw-video-play-overlay");
    const muteBtn = frame.querySelector(".tw-video-mute");
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.loop = true;
    video.preload = autoplay ? "auto" : "metadata";
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.dataset.postVideoEl = postId;
    frame.insertBefore(video, frame.firstChild);
    videoFrames.set(postId, { frame, video });
    video.addEventListener("loadedmetadata", () => { if (waiting) waiting.remove(); });
    video.addEventListener("playing", () => frame.classList.add("playing"));
    video.addEventListener("pause", () => frame.classList.remove("playing"));
    video.addEventListener("waiting", () => frame.classList.remove("playing"));
    overlay?.addEventListener("click", () => {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    });
    muteBtn?.addEventListener("click", event => {
      event.stopPropagation();
      video.muted = !video.muted;
      muteBtn.textContent = video.muted ? "🔈" : "🔊";
      if (!video.muted && visibleVideoId && visibleVideoId !== postId) {
        videoFrames.get(visibleVideoId)?.video.pause();
      }
      if (!video.muted) visibleVideoId = postId;
    });
    getTelegramMediaUrl(fileId, mime)
      .then(url => { if (video.isConnected) video.src = url; })
      .catch(error => console.error("Post video could not load from Telegram:", error));
    if (autoplay) video.play().catch(() => {});
  }
  function hydratePostVideos(root, autoplayFirst = false) {
    const frames = [...root.querySelectorAll(".tw-post-video-frame[data-post-video]")];
    frames.forEach(frame => {
      const postId = frame.dataset.postVideo;
      if (!("IntersectionObserver" in window)) { attachPostVideo(frame, postId, autoplayFirst); return; }
      if (frame.dataset.observed) return;
      frame.dataset.observed = "1";
      const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        const record = videoFrames.get(postId);
        if (entry.intersectionRatio >= 0.55) {
          attachPostVideo(frame, postId, true);
          const video = videoFrames.get(postId)?.video;
          if (video) {
            if (visibleVideoId && visibleVideoId !== postId && video.muted) videoFrames.get(visibleVideoId)?.video.pause();
            visibleVideoId = postId;
            if (video.paused) video.play().catch(() => {});
          }
        } else if (record && entry.intersectionRatio < 0.25) {
          record.video.pause();
          if (visibleVideoId === postId) visibleVideoId = "";
        }
      }), { threshold: [0, 0.25, 0.55, 0.75] });
      observer.observe(frame);
    });
  }
  function releasePostVideos() {
    videoFrames.forEach(({ video }) => { try { video.pause(); video.removeAttribute("src"); video.load(); } catch { /* ignore */ } });
    videoFrames.clear();
    visibleVideoId = "";
  }

  detailModal.addEventListener("click", event => { if (event.target === detailModal) closePostDetail(); });
  el.addEventListener("click", event => {
    if (event.target.closest?.(".tw-post-actions,[data-voice-record]")) return;
    feed.querySelectorAll(".tw-post-menu.open").forEach(m => m.classList.remove("open"));
    feed.querySelectorAll(".tw-post-menu-btn[aria-expanded='true']").forEach(b => b.setAttribute("aria-expanded", "false"));
  });
  $("#tw-detail-close", el).onclick = closePostDetail;
  imageViewer.addEventListener("click", () => { imageViewer.classList.remove("open"); imageViewer.setAttribute("aria-hidden", "true"); });
  feed.addEventListener("click", event => {
    const image = event.target.closest("[data-post-image]");
    if (!image) return;
    if (shouldSuppressPostPhotoClick()) return;
    event.stopPropagation();
    openPostImageViewer(image);
  });
  el.addEventListener("click", async event => {
    const button = event.target.closest("[data-voice-record]");
    if (!button) return;
    if (button.dataset.voiceRecord === "post") {
      const metadata = await recordVoice(button, { kind: "post" });
      if (metadata) { selectedPostVoice = metadata; composer.querySelector(".tw-photo-name").textContent = "Voice note attached ♡"; }
    } else {
      const metadata = await recordVoice(button, { kind: "comment", postId: detailPostId });
      if (metadata) { selectedCommentVoice = metadata; $("#tw-comment-voice-state", detailBody).textContent = "Voice note ready ♡"; }
    }
  });

  disposePostFeed = () => {
    active = false;
    releasePostVideos();
    if (feedSentinelObserver) { feedSentinelObserver.disconnect(); feedSentinelObserver = null; }
    if (voiceRecorder) {
      voiceRecorder.stream?.getTracks().forEach(track => track.stop());
      voiceRecorder.stop();
      voiceRecorder = null;
    }
    if (selectedPhotoPreviewUrl) URL.revokeObjectURL(selectedPhotoPreviewUrl);
    selectedPhotoPreviewUrl = "";
    stopPostFeed?.();
    stopPostFeed = null;
    stopActivePostComments?.();
    stopActivePostComments = null;
    activePostCommentsId = "";
  };
}

// Router & Page Handlers
const titles = {
  home: "Keby & Shazy",
  memories: "Memories",
  games: "Games",
  gallery: "Our Posts",
  "gallery-library": "Our Gallery",
  letters: "Letters",
  questions: "Today's Question",
  bucket: "Our Bucket List",
  profile: "Profile",
  activities: "Activities",
  more: "More",
  drawing: "Our Drawing Canvas",
  challenges: "✨ Challenges"
};

const routes = {
  home: renderHome,
  memories: renderMemories,
  games: renderGames,
  gallery: renderGallery,
  "gallery-library": renderSharedGallery,
  letters: renderLetters,
  questions: renderQuestions,
  bucket: renderBucket,
  profile: renderProfile,
  activities: renderActivities,
  more: renderMore,
  drawing: renderDrawing,
  challenges: renderChallenges
};

// Global App Navigation Object Definition
window.App = {
  navigate
};

export function navigate(route = "home", { history = true } = {}) {
  if (!routes[route]) route = "home";
  if (history && route !== currentRoute) {
    window.history.pushState({ route }, "", `#${route}`);
  }
  currentRoute = route;
  if (["gallery", "memories", "more"].includes(route) && navBadgeState[route] !== undefined) {
    try { localStorage.setItem(navSeenKey(route), navBadgeState[route]); } catch { /* Storage may be unavailable. */ }
    setNavBadge(route, false);
  }
  document.body.classList.toggle("home-dashboard", route === "home");
  // Dispose active listeners based on previous page to stop leaks
  if (route !== "home") disposeHome();
  if (route !== "drawing") disposeDrawing();
  if (route !== "memories") disposeMemories?.();
  if (route !== "letters") disposeLetters?.();
  if (route !== "questions") disposeQuestions?.();
  if (route !== "challenges") disposeChallenges?.();
  if (route !== "games") disposeGames?.();
  if (route !== "bucket") disposeBucket?.();
  if (route !== "gallery-library") disposeSharedGallery();
  if (route !== "more") disposeSpecialDays();
  if (route !== "gallery") {
    disposePostFeed?.();
    disposePostFeed = null;
  }

  // Update bottom navigation bar button states
  document.querySelectorAll(".bottom-nav button").forEach((b) => {
    const isCurrent = b.dataset.route === route;
    b.classList.toggle("active", isCurrent);
    if (isCurrent) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });

  // Update Page Title
  const pageTitle = titles[route] || "Dashboard";
  const titleElem = $("#page-title");
  if (titleElem) titleElem.textContent = pageTitle;

  // Render view
  const mainElem = $("#main-content");
  if (mainElem && routes[route]) {
    routes[route](mainElem, currentUser, currentProfile);
  }
}

function closeTransientUi() {
  const drawer = $("#music-drawer");
  if (drawer && !drawer.classList.contains("hidden")) {
    drawer.classList.add("hidden");
    return true;
  }
  const openModal = document.querySelector(".tw-detail-backdrop.open, .tw-image-backdrop.open, .mem-modal-overlay[style*='display: flex'], .letter-modal-overlay.is-open, .drawing-history-overlay:not(.hidden), .drawing-preview-overlay:not(.hidden), .question-edit-modal.open, .gallery-viewer.open, .special-days-modal:not(.hidden)");
  if (openModal) {
    const close = openModal.querySelector("[aria-label='Close'], [aria-label^='Close'], .tw-detail-close, .memory-view-close, .mem-modal-close, .drawing-close, .letter-close-btn, #gallery-viewer-close, #question-edit-cancel");
    if (close) close.click();
    else openModal.classList.remove("open", "is-open");
    return true;
  }
  return false;
}

window.addEventListener("popstate", event => {
  if (closeTransientUi()) {
    window.history.pushState({ route: currentRoute }, "", `#${currentRoute}`);
    return;
  }
  const route = event.state?.route || window.location.hash.slice(1);
  navigate(routes[route] ? route : "home", { history: false });
});

// Initialize Authentication & Router Lifecycle
initAuth(
  async (user, profile) => {
    currentUser = user;
    stopCoupleProfiles?.();
    stopCoupleProfiles = null;
    // Realtime-first: onSnapshot serves the persistent-cache snapshot
    // instantly (zero-latency, works offline), then patches the UI live
    // when the network returns — no one-time getDoc gate on login.
    stopCoupleProfiles = watchCoupleProfiles(data => {
      if (currentUser?.uid !== user.uid) return;
      if (applyCoupleProfiles(data)) {
        currentProfile = Object.values(APP_CONFIG.profiles).find(person => person.email === user.email) || currentProfile || profile;
        updateProfileAvatar(currentProfile);
        if (currentRoute === "profile") $("#main-content")?.dispatchEvent(new Event("couple-profile-settings-changed"));
        window.dispatchEvent(new CustomEvent("couple-profiles-updated"));
      }
      void hydrateCoupleProfileAvatars().then(changed => {
        if (!changed || currentUser?.uid !== user.uid) return;
        updateProfileAvatar(currentProfile);
        window.dispatchEvent(new CustomEvent("couple-profiles-updated"));
      }).catch(error => console.error("Telegram profile photos could not load:", error));
    }, error => {
      console.error("Shared profile updates failed:", error);
      toast("Profile updates could not be synced.");
    });
    currentProfile = Object.values(APP_CONFIG.profiles).find(person => person.email === user.email) || profile;
    initNavBadges(user);
    void hydrateCoupleProfileAvatars().then(() => {
      if (currentUser?.uid !== user.uid) return;
      updateProfileAvatar(currentProfile);
      window.dispatchEvent(new CustomEvent("couple-profiles-updated"));
    }).catch(error => console.error("Telegram profile photos could not load:", error));

    const profileKey = getProfileKey(currentProfile);
    if (profileKey && currentProfile.authUid !== user.uid) {
      currentProfile.authUid = user.uid;
      // Do not hold the login screen open for this account-link write. Firestore
      // can remain pending until the network returns; the app can load from its
      // local state and the SDK will sync the queued write in the background.
      void saveCoupleProfile(profileKey, { authUid: user.uid }).catch(error => {
        console.error("Could not link profile to Firebase account:", error);
        toast("Could not link this account to its shared profile.");
      });
    }
    if (currentUser?.uid !== user.uid) return;

    // Hide Login Screen and Show Main App
    const authView = $("#auth-view");
    const appView = $("#app-view");
    if (authView) authView.classList.add("hidden");
    if (appView) appView.classList.remove("hidden");

    // Update Avatar
    updateProfileAvatar(currentProfile);

    function renderPresence(presence) {
        const presenceEl = $("#partner-presence");
        if (!presenceEl) return;
        const partnerProfile = Object.values(APP_CONFIG.profiles).find(p => p.email !== currentUser.email);
        const partnerPresence = Object.values(presence).find(p => p.name === partnerProfile.name);
        if (partnerPresence && partnerPresence.online) {
            presenceEl.innerHTML = `
                <button type="button" class="partner-presence-chat" data-open-partner-chat aria-label="Chat with ${esc(partnerProfile.name)}" title="Chat with ${esc(partnerProfile.name)}">
                    ${partnerProfile.avatar ? `<img src="${esc(partnerProfile.avatar)}" alt="${esc(partnerProfile.name)}">` : `<span>${esc((partnerProfile.name || "♡")[0])}</span>`}
                    <i class="partner-online-dot" aria-label="Online"></i>
                </button>
            `;
        } else {
            presenceEl.innerHTML = "";
        }
    }

    const partnerProfile = Object.values(APP_CONFIG.profiles).find(p => p.email !== currentUser.email);
    disposePartnerChat?.();
    disposePartnerChat = initPartnerChat(user, currentProfile, partnerProfile);
    initPresence(user.uid, currentProfile.name);
    stopPresence = watchAllPresence(renderPresence);


    const requestedRoute = new URLSearchParams(window.location.search).get("open");
    const notificationRoutes = ["home", "questions", "challenges", "letters", "memories"];
    const initialRoute = notificationRoutes.includes(requestedRoute) ? requestedRoute : "home";
    if (requestedRoute && notificationRoutes.includes(requestedRoute)) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    }
    const routeFromHash = window.location.hash.slice(1);
    const route = routes[routeFromHash] ? routeFromHash : initialRoute;
    window.history.replaceState({ route }, "", `#${route}`);
    navigate(route, { history: false });
    initNotificationCenter(user, currentProfile, navigate);

    // Initialize Background Music if Firebase Ready
    if (firebaseReady) {
      try {
        disposeMusic?.();
        disposeMusic = initMusic(user);
      } catch (e) {
        console.warn("Music initialization error:", e);
      }
    }
  },
  () => {
    currentUser = null;
    currentProfile = null;
    navBadgeStops.forEach(stop => stop?.());
    navBadgeStops = [];
    disposeMusic?.();
    disposeMusic = null;
    stopCoupleProfiles?.();
    stopCoupleProfiles = null;
    stopPresence?.();
    stopPresence = null;
    disposePartnerChat?.();
    disposePartnerChat = null;
    // Clean up all active Firestore subscriptions on logout
    disposeHome();
    disposeDrawing();
    disposeMemories?.();
    disposeLetters?.();
    disposeQuestions?.();
    disposeChallenges?.();
    disposeGames?.();
    disposeBucket?.();
    disposePostFeed?.();
    disposeSpecialDays();
    disposeNotificationCenter();

    const appView = $("#app-view");
    const authView = $("#auth-view");
    if (appView) appView.classList.add("hidden");
    $("#music-drawer")?.classList.add("hidden");
    if (authView) authView.classList.remove("hidden");
  }
);

// Event Listeners setup
document.addEventListener("DOMContentLoaded", () => {
  const hardRefreshButton = $("#hard-refresh-btn");
  hardRefreshButton?.addEventListener("click", async () => {
    hardRefreshButton.disabled = true;
    hardRefreshButton.title = "Updating app files…";
    hardRefreshButton.setAttribute("aria-label", "Updating app files");
    toast("Updating app files and reloading…");
    const controller = navigator.serviceWorker?.controller;
    if (controller && "MessageChannel" in window) {
      await new Promise(resolve => {
        const channel = new MessageChannel();
        const timeout = setTimeout(resolve, 1500);
        channel.port1.onmessage = () => { clearTimeout(timeout); resolve(); };
        controller.postMessage({ type: "REFRESH_ASSETS" }, [channel.port2]);
      });
    } else {
      await navigator.serviceWorker?.getRegistration().then(registration => registration?.update()).catch(() => {});
    }
    // This action refreshes the application shell and code. Live Firestore
    // listeners independently refresh app data when the page starts/reconnects.
    window.location.reload();
  });

  let assetUpdateNoticeShown = false;
  navigator.serviceWorker?.addEventListener("message", event => {
    if (event.data?.type !== "APP_ASSET_UPDATED" || assetUpdateNoticeShown) return;
    assetUpdateNoticeShown = true;
    toast("A new app version is ready. Refresh the page to apply it ♡");
  });

  if ("serviceWorker" in navigator) {
    // Canonical file is service-worker.js; sw.js is a legacy alias.
    const swUrl = new URL("../service-worker.js", import.meta.url);
    const scope = new URL("../", import.meta.url).pathname;
    navigator.serviceWorker.register(swUrl, { scope }).then(registration => {
      // Take updates ASAP so a fresh deploy activates without 2 restarts.
      if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            toast("A fresh update is ready — reopen the app to use it ♡");
          }
        });
      });
    }).catch(error => {
      console.error("Offline app support could not be installed:", error);
    });
    // Reload once when the new worker takes control (standard PWA pattern).
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  $$(".bottom-nav button").forEach((b) => {
    b.addEventListener("click", () => {
      const route = b.dataset.route;
      if (route && route !== currentRoute) navigate(route);
    });
  });

  const profileBtn = $("#profile-btn");
  if (profileBtn) {
    profileBtn.addEventListener("click", () => navigate("profile"));
  }

  const musicToggle = $("#music-toggle");
  if (musicToggle) {
    musicToggle.addEventListener("click", () => {
      const drawer = $("#music-drawer");
      if (drawer) {
        drawer.classList.toggle("hidden");
      }
    });
  }

  const musicClose = $("#music-close");
  if (musicClose) {
    musicClose.addEventListener("click", () => {
      const drawer = $("#music-drawer");
      if (drawer) drawer.classList.add("hidden");
    });
  }
});
