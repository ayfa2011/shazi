import { initAuth, logout } from "./auth.js";
import { $,$$, esc, toast, compressImage } from "./utils.js";
import { renderHome, disposeHome } from "./dashboard.js";
import { renderMemories, disposeMemories } from "./memories.js";
import { renderGames, disposeGames } from "./games.js";
import { renderLetters, disposeLetters } from "./letters.js";
import { renderQuestions, disposeQuestions } from "./questions.js";
import { watchItems, watchDiaryPosts, toggleDiaryLike, watchDiaryComments, addDiaryComment, updateDiaryComment, deleteDiaryComment, addDiaryPost, updateDiaryPost, deleteDiaryPost } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { renderBucket, disposeBucket } from "./bucket-list.js";
import { renderActivities } from "./activities.js";
import { renderMore } from "./more.js";
import { renderProfile } from "./profile.js";
import { disposeSpecialDays } from "./special-days.js";
import { disposeNotificationCenter, initNotificationCenter } from "./notification-center.js";
import { renderDrawing, disposeDrawing } from "./drawing.js";
import { renderChallenges, disposeChallenges } from "./challenges.js";
import { initMusic } from "./music.js";
import { firebaseReady } from "./firebase.js";
import { getCoupleProfiles, saveCoupleProfile, watchCoupleProfiles } from "./firestore.js";
import { applyCoupleProfiles, findProfileForAuthor, getDisplayName, getProfileKey } from "./profile-data.js";

let currentUser = null, currentProfile = null, disposeMusic = null;
let currentRoute = "home", stopCoupleProfiles = null;

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

let stopPostFeed = null, disposePostFeed = null, postCommentStops = new Map();

function renderPostFeed(el, user, profile) {
  disposePostFeed?.();
  let active = true, selectedProfile = "all", posts = [];
  const commentsByPost = new Map();

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
      .tw-post-photo {
        width: 100%;
        border-radius: 16px;
        margin-top: 8px;
        max-height: 350px;
        object-fit: cover;
      }
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
      .tw-comments-section {
        margin-top: 10px;
        padding-left: 10px;
        border-left: 2px solid #eff3f4;
      }
      .tw-comment-item {
        font-size: 13px;
        margin-bottom: 6px;
      }
      .tw-comment-form {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }
      .tw-comment-form input {
        flex: 1;
        border: 1px solid #eff3f4;
        border-radius: 16px;
        padding: 6px 12px;
        font-size: 13px;
        outline: none;
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
          <div class="tw-composer-actions">
            <label style="cursor:pointer; color:#d74482; font-weight:600; font-size:14px;">
              📷 Photo
              <input type="file" name="photo" accept="image/*" style="display:none;">
            </label>
            <span class="tw-photo-name" style="font-size:12px; color:#8b7180;"></span>
            <button type="submit" class="tw-post-btn">Post</button>
          </div>
        </div>
      </form>

      <div id="tw-posts-feed">
        <p style="padding:20px; text-align:center; color:#8b7180;">Loading posts...</p>
      </div>
    </div>
  `;

  const feed = $("#tw-posts-feed", el);
  const composer = $("#tw-main-composer", el);
  const profileView = $("#tw-profile-view", el);

  el.querySelectorAll(".tw-profile-card").forEach(button => {
    button.onclick = () => {
      selectedProfile = button.dataset.profile;
      el.querySelectorAll(".tw-profile-card").forEach(card => card.classList.toggle("selected", card === button));
      render();
    };
  });

  composer.elements.photo.onchange = () => {
    composer.querySelector(".tw-photo-name").textContent = composer.elements.photo.files[0]?.name || "";
  };

  composer.onsubmit = async (e) => {
    e.preventDefault();
    const text = composer.elements.text.value.trim();
    const file = composer.elements.photo.files[0];

    if (!text && !file) return toast("Write something first!");
    const submitButton = composer.querySelector('[type="submit"]');
    if (submitButton.disabled) return;
    submitButton.disabled = true;

    try {
      const photoUrl = file ? await compressImage(file) : "";
      if (file && !photoUrl) return toast("Could not read that photo. Please choose another image.");

      await addDiaryPost({
        authorId: user.uid,
        authorName: profile.name,
        wallId: APP_CONFIG.coupleId,
        text,
        photoUrl,
        createdAt: new Date().toISOString()
      });

      composer.reset();
      composer.querySelector(".tw-photo-name").textContent = "";
      toast("Posted! ✨");
    } catch (err) {
      console.error("Could not create post:", err);
      toast("Could not post.");
    } finally {
      submitButton.disabled = false;
    }
  };

  stopPostFeed = watchDiaryPosts((items) => {
    if (!active) return;
    posts = items || [];
    render();
  });

  function renderComments(postId, comments) {
    const target = feed.querySelector(`#comments-${postId}`);
    if (!target) return;
    target.innerHTML = comments.map(c => {
      const isAuthor = c.authorId === user.uid;
      return `
        <div class="tw-comment-item" id="tw-comment-${c.id}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <strong>${esc(getDisplayName(c.authorId, c.authorName || "Us"))}:</strong>
              <span id="tw-comment-text-${c.id}">${esc(c.text || '')}</span>
            </div>
            ${isAuthor ? `
              <div style="display:flex; gap:8px; margin-left:8px; flex-shrink:0;">
                <button class="tw-comment-edit-btn" data-id="${c.id}" style="border:0; background:none; padding:0; cursor:pointer; font-size:12px;">✏️</button>
                <button class="tw-comment-del-btn" data-id="${c.id}" style="border:0; background:none; padding:0; cursor:pointer; font-size:12px;">🗑️</button>
              </div>
            ` : ""}
          </div>
        </div>
      `;
    }).join("");

    target.querySelectorAll(".tw-comment-del-btn").forEach(btn => {
      btn.onclick = async () => {
        if (confirm("Delete this comment?")) {
          try {
            await deleteDiaryComment(postId, btn.dataset.id);
            toast("Comment deleted!");
          } catch (err) {
            console.error(err);
            toast("Could not delete comment.");
          }
        }
      };
    });

    target.querySelectorAll(".tw-comment-edit-btn").forEach(btn => {
      btn.onclick = async () => {
        const commentId = btn.dataset.id;
        const textEl = target.querySelector(`#tw-comment-text-${commentId}`);
        const oldText = textEl.textContent;
        const newText = prompt("Edit comment:", oldText);
        if (newText !== null && newText.trim() !== "" && newText.trim() !== oldText) {
          try {
            await updateDiaryComment(postId, commentId, { text: newText.trim() });
            toast("Comment updated!");
          } catch (err) {
            console.error(err);
            toast("Could not update comment.");
          }
        }
      };
    });
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
      feed.innerHTML = `<p style="padding:24px 16px; text-align:center; color:#8b7180;">${person ? `No posts yet.` : "No posts yet. Share your first thought!"}</p>`;
      return;
    }

    feed.innerHTML = visiblePosts.map((post) => {
      const own = post.authorId === user.uid || post.authorId === profile.id;
      const isLiked = (post.likedBy || []).includes(user.uid);
      const likeCount = (post.likedBy || []).length;
      const authorName = getDisplayName(post.authorId, post.authorName || "Us");
      const authorProfile = findProfileForAuthor(post.authorId, post.authorName || "");
      const handle = `@${authorName.toLowerCase().replace(/\s+/g, "")}`;
      const createdAt = post.createdAt?.toDate ? post.createdAt.toDate() : post.createdAt ? new Date(post.createdAt) : null;
      const timeStr = createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : "Just now";

      return `
        <div class="tw-post-card" id="post-${post.id}">
          <div class="tw-avatar">${authorProfile?.avatar ? `<img src="${esc(authorProfile.avatar)}" alt="">` : esc(authorName[0])}</div>
          <div class="tw-post-content">
            <div class="tw-post-header">
              <div class="tw-user-info">
                <span class="tw-user-name">${esc(authorName)}</span>
                <span class="tw-user-handle">${handle}</span>
                <time class="tw-post-time">${timeStr}</time>
              </div>
              ${own ? `
                <div style="display:flex; gap:8px;">
                  <button class="tw-action-btn tw-edit-btn" data-id="${post.id}">✏️ Edit</button>
                  <button class="tw-action-btn tw-del-btn" data-id="${post.id}" style="color:#f4212e;">🗑️ Delete</button>
                </div>
              ` : ''}
            </div>

            <p class="tw-post-text" id="post-text-${post.id}">${esc(post.text || '')}</p>
            ${post.photoUrl ? `<img src="${esc(post.photoUrl)}" class="tw-post-photo">` : ''}

            <div class="tw-actions-bar">
              <button class="tw-action-btn tw-reply-btn" data-id="${post.id}">💬 Reply</button>
              <button class="tw-action-btn ${isLiked ? 'liked' : ''} tw-like-btn" data-id="${post.id}">
                ${isLiked ? '❤️' : '🤍'} ${likeCount}
              </button>
            </div>

            <div class="tw-comments-section" id="comments-${post.id}">
              <!-- Comments load here -->
            </div>

            <form class="tw-comment-form" data-post-id="${post.id}">
              <input name="reply" placeholder="Tweet your reply..." required>
              <button type="submit" class="tw-post-btn" style="padding:4px 12px; font-size:12px;">Reply</button>
            </form>
          </div>
        </div>
      `;
    }).join("");

    visiblePosts.forEach((post) => {
      const likeBtn = feed.querySelector(`.tw-like-btn[data-id="${post.id}"]`);
      if (likeBtn) {
        likeBtn.onclick = async () => {
          const liked = (post.likedBy || []).includes(user.uid);
          try {
            await toggleDiaryLike(post.id, user.uid, liked);
          } catch (err) {
            console.error("Could not update post like:", err);
            toast("Could not update the like.");
          }
        };
      }
      feed.querySelector(`.tw-reply-btn[data-id="${post.id}"]`)?.addEventListener("click", () => {
        feed.querySelector(`.tw-comment-form[data-post-id="${post.id}"] input[name="reply"]`)?.focus();
      });

      const delBtn = feed.querySelector(`.tw-del-btn[data-id="${post.id}"]`);
      if (delBtn) {
        delBtn.onclick = async () => {
          if (confirm("Delete this tweet?")) {
            try {
              await deleteDiaryPost(post.id);
              toast("Deleted post");
            } catch (err) {
              console.error("Could not delete post:", err);
              toast("Could not delete post.");
            }
          }
        };
      }

      const editBtn = feed.querySelector(`.tw-edit-btn[data-id="${post.id}"]`);
      if (editBtn) {
        editBtn.onclick = async () => {
          const newText = prompt("Edit your post:", post.text);
          if (newText !== null && newText.trim() !== (post.text || "")) {
            if (!newText.trim() && !post.photoUrl) return toast("A post needs text or a photo.");
            try {
              await updateDiaryPost(post.id, { text: newText.trim() });
              toast("Post updated!");
            } catch (err) {
              console.error("Could not update post:", err);
              toast("Could not update post.");
            }
          }
        };
      }

      if (!postCommentStops.has(post.id)) {
        const stop = watchDiaryComments(post.id, (comments) => {
          if (!active) return;
          commentsByPost.set(post.id, comments);
          renderComments(post.id, comments);
        });
        postCommentStops.set(post.id, stop);
      }
      renderComments(post.id, commentsByPost.get(post.id) || []);

      const commentForm = feed.querySelector(`.tw-comment-form[data-post-id="${post.id}"]`);
      if (commentForm) {
        commentForm.onsubmit = async (e) => {
          e.preventDefault();
          const text = commentForm.elements.reply.value.trim();
          if (!text) return;
          try {
            await addDiaryComment(post.id, {
              authorId: user.uid,
              authorName: profile.name,
              text
            });
            commentForm.reset();
            toast("Reply sent!");
          } catch (err) {
            console.error("Could not send reply:", err);
            toast("Could not send reply.");
          }
        };
      }
    });
  }

  disposePostFeed = () => {
    active = false;
    stopPostFeed?.();
    stopPostFeed = null;
    postCommentStops.forEach((stop) => stop());
    postCommentStops.clear();
  };
}

// Router & Page Handlers
const titles = {
  home: "Keby & Shazy",
  memories: "Memories",
  games: "Games",
  gallery: "Our Posts",
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

export function navigate(route = "home") {
  currentRoute = route;
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
  if (route !== "more") disposeSpecialDays();
  if (route !== "gallery") {
    disposePostFeed?.();
    disposePostFeed = null;
  }

  // Update bottom navigation bar button states
  document.querySelectorAll(".bottom-nav button").forEach((b) => {
    b.classList.toggle("active", b.dataset.route === route);
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

// Initialize Authentication & Router Lifecycle
initAuth(
  async (user, profile) => {
    currentUser = user;
    stopCoupleProfiles?.();
    stopCoupleProfiles = null;
    try {
      applyCoupleProfiles(await getCoupleProfiles());
    } catch (error) {
      console.error("Could not load shared profiles:", error);
      toast("Could not load saved profile settings.");
    }
    if (currentUser?.uid !== user.uid) return;
    currentProfile = Object.values(APP_CONFIG.profiles).find(person => person.email === user.email) || profile;

    const profileKey = getProfileKey(currentProfile);
    if (profileKey && currentProfile.authUid !== user.uid) {
      currentProfile.authUid = user.uid;
      try {
        await saveCoupleProfile(profileKey, { authUid: user.uid });
      } catch (error) {
        console.error("Could not link profile to Firebase account:", error);
        toast("Could not link this account to its shared profile.");
      }
    }
    if (currentUser?.uid !== user.uid) return;

    stopCoupleProfiles = watchCoupleProfiles(data => {
      if (currentUser?.uid !== user.uid) return;
      if (applyCoupleProfiles(data)) {
        currentProfile = Object.values(APP_CONFIG.profiles).find(person => person.email === user.email) || currentProfile;
        updateProfileAvatar(currentProfile);
        if (currentRoute === "profile") $("#main-content")?.dispatchEvent(new Event("couple-profile-settings-changed"));
      }
    }, error => {
      console.error("Shared profile updates failed:", error);
      toast("Profile updates could not be synced.");
    });

    // Hide Login Screen and Show Main App
    const authView = $("#auth-view");
    const appView = $("#app-view");
    if (authView) authView.classList.add("hidden");
    if (appView) appView.classList.remove("hidden");

    // Update Avatar
    updateProfileAvatar(currentProfile);

    const requestedRoute = new URLSearchParams(window.location.search).get("open");
    const notificationRoutes = ["home", "questions", "challenges", "letters", "memories"];
    const initialRoute = notificationRoutes.includes(requestedRoute) ? requestedRoute : "home";
    if (requestedRoute && notificationRoutes.includes(requestedRoute)) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    }
    navigate(initialRoute);
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
    disposeMusic?.();
    disposeMusic = null;
    stopCoupleProfiles?.();
    stopCoupleProfiles = null;
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
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(new URL("../sw.js", import.meta.url), {
      scope: new URL("../", import.meta.url).pathname
    }).catch(error => {
      console.error("Offline app support could not be installed:", error);
    });
  }

  $$(".bottom-nav button").forEach((b) => {
    b.addEventListener("click", () => {
      const route = b.dataset.route;
      if (route) navigate(route);
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