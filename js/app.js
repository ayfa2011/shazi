import { initAuth, logout } from "./auth.js";
import { $,$$, esc, toast } from "./utils.js";
import { renderHome, disposeHome } from "./dashboard.js";
import { renderMemories, disposeMemories } from "./memories.js";
import { renderGames } from "./games.js";
import { renderLetters, disposeLetters } from "./letters.js";
import { renderQuestions, disposeQuestions } from "./questions.js";
import { watchItems, watchDiaryPosts, toggleDiaryLike, watchDiaryComments, addDiaryComment, addDiaryPost, deleteDiaryPost, setItem } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { renderBucket } from "./bucket-list.js";
import { renderActivities } from "./activities.js";
import { renderMore } from "./more.js";
import { renderDrawing, disposeDrawing } from "./drawing.js";
import { initMusic } from "./music.js";
import { firebaseReady } from "./firebase.js";

let currentUser = null, currentProfile = null;

// Post / Twitter Feed Logic
function renderGallery(el, user, profile) {
  renderPostFeed(el, user, profile);
}

let stopPostFeed = null, disposePostFeed = null, postCommentStops = new Map();

function renderPostFeed(el, user, profile) {
  disposePostFeed?.();
  let active = true, filter = "all", posts = [];

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
        background: #1d9bf0;
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
        color: #1d9bf0;
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
    </style>

    <div class="tw-feed-container">
      <div class="tw-header">
        <h1>Home</h1>
        <span style="color:#1d9bf0; font-size:18px;">✨</span>
      </div>

      <form class="tw-composer" id="tw-main-composer">
        <div class="tw-avatar">${esc(profile.name[0])}</div>
        <div class="tw-composer-input">
          <textarea name="text" rows="3" placeholder="What's happening?"></textarea>
          <div class="tw-composer-actions">
            <label style="cursor:pointer; color:#1d9bf0; font-weight:600; font-size:14px;">
              📷 Photo
              <input type="file" name="photo" accept="image/*" style="display:none;">
            </label>
            <span class="tw-photo-name" style="font-size:12px; color:#536471;"></span>
            <button type="submit" class="tw-post-btn">Post</button>
          </div>
        </div>
      </form>

      <div id="tw-posts-feed">
        <p style="padding:20px; text-align:center; color:#536471;">Loading posts...</p>
      </div>
    </div>
  `;

  const feed = $("#tw-posts-feed", el);
  const composer = $("#tw-main-composer", el);

  composer.elements.photo.onchange = () => {
    composer.querySelector(".tw-photo-name").textContent = composer.elements.photo.files[0]?.name || "";
  };

  composer.onsubmit = async (e) => {
    e.preventDefault();
    const text = composer.elements.text.value.trim();
    const file = composer.elements.photo.files[0];

    if (!text && !file) return toast("Write something first!");

    try {
      let photoUrl = "";
      if (file) {
        photoUrl = await new Promise((res) => {
          const r = new FileReader();
          r.onload = (ev) => res(ev.target.result);
          r.readAsDataURL(file);
        });
      }

      await addDiaryPost({
        authorId: profile.id,
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
      toast("Could not post.");
    }
  };

  stopPostFeed = watchDiaryPosts((items) => {
    if (!active) return;
    posts = items;
    render();
  });

  function render() {
    if (posts.length === 0) {
      feed.innerHTML = `<p style="padding:30px; text-align:center; color:#536471;">No posts yet. Share your first thought!</p>`;
      return;
    }

    feed.innerHTML = posts.map((post) => {
      const own = post.authorId === profile.id;
      const isLiked = (post.likedBy || []).includes(user.uid);
      const likeCount = (post.likedBy || []).length;
      const handle = `@${(post.authorName || 'us').toLowerCase()}`;

      return `
        <div class="tw-post-card" id="post-${post.id}">
          <div class="tw-avatar">${esc((post.authorName || 'U')[0])}</div>
          <div class="tw-post-content">
            <div class="tw-post-header">
              <div class="tw-user-info">
                <span class="tw-user-name">${esc(post.authorName || 'Us')}</span>
                <span class="tw-user-handle">${handle}</span>
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

    posts.forEach((post) => {
      const likeBtn = feed.querySelector(`.tw-like-btn[data-id="${post.id}"]`);
      if (likeBtn) {
        likeBtn.onclick = async () => {
          const liked = (post.likedBy || []).includes(user.uid);
          await toggleDiaryLike(post.id, user.uid, liked);
        };
      }

      const delBtn = feed.querySelector(`.tw-del-btn[data-id="${post.id}"]`);
      if (delBtn) {
        delBtn.onclick = async () => {
          if (confirm("Delete this tweet?")) {
            await deleteDiaryPost(post.id);
            toast("Deleted post");
          }
        };
      }

      const editBtn = feed.querySelector(`.tw-edit-btn[data-id="${post.id}"]`);
      if (editBtn) {
        editBtn.onclick = async () => {
          const newText = prompt("Edit your post:", post.text);
          if (newText !== null && newText.trim() !== "") {
            await setItem(post.id, { text: newText.trim() }, "diary");
            toast("Post updated!");
          }
        };
      }

      if (!postCommentStops.has(post.id)) {
        const stop = watchDiaryComments(post.id, (comments) => {
          if (!active) return;
          const target = feed.querySelector(`#comments-${post.id}`);
          if (target) {
            target.innerHTML = comments.map(c => `
              <div class="tw-comment-item">
                <strong>${esc(c.authorName || 'Us')}:</strong> ${esc(c.text || '')}
              </div>
            `).join("");
          }
        });
        postCommentStops.set(post.id, stop);
      }

      const commentForm = feed.querySelector(`.tw-comment-form[data-post-id="${post.id}"]`);
      if (commentForm) {
        commentForm.onsubmit = async (e) => {
          e.preventDefault();
          const text = commentForm.elements.reply.value.trim();
          if (!text) return;
          await addDiaryComment(post.id, {
            authorId: profile.id,
            authorName: profile.name,
            text
          });
          commentForm.reset();
          toast("Reply sent!");
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
  home: "Dashboard",
  memories: "Memories",
  games: "Games",
  gallery: "Post",
  letters: "Letters",
  questions: "Today's Question",
  bucket: "Our Bucket List",
  activities: "Activities",
  more: "More",
  drawing: "Our Drawing Canvas"
};

const routes = {
  home: renderHome,
  memories: renderMemories,
  games: renderGames,
  gallery: renderGallery,
  letters: renderLetters,
  questions: renderQuestions,
  bucket: renderBucket,
  activities: renderActivities,
  more: renderMore,
  drawing: renderDrawing
};

// Global App Navigation Object Definition
window.App = {
  navigate
};

function navigate(route = "home") {
  // Dispose active listeners based on previous page
  if (route !== "home") disposeHome();
  if (route !== "drawing") disposeDrawing();
  if (route !== "memories") disposeMemories?.();
  if (route !== "letters") disposeLetters?.();
  if (route !== "questions") disposeQuestions?.();
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
  (user, profile) => {
    currentUser = user;
    currentProfile = profile;

    // Hide Login Screen and Show Main App
    const authView = $("#auth-view");
    const appView = $("#app-view");
    if (authView) authView.classList.add("hidden");
    if (appView) appView.classList.remove("hidden");

    // Update Avatar
    const avatarElem = $("#avatar-letter");
    if (avatarElem) avatarElem.textContent = profile.emoji || profile.name?.[0] || "♡";

    // Route to Home by default
    navigate("home");

    // Initialize Background Music if Firebase Ready
    if (firebaseReady) {
      try {
        initMusic();
      } catch (e) {
        console.warn("Music initialization error:", e);
      }
    }
  },
  () => {
    // Logout / Unauthenticated Callback
    disposeHome();
    disposeDrawing();
    disposeMemories?.();
    disposeLetters?.();
    disposeQuestions?.();
    
    const appView = $("#app-view");
    const authView = $("#auth-view");     if (appView) appView.classList.add("hidden");     if (authView) authView.classList.remove("hidden");   } );  // Event Listeners setup document.addEventListener("DOMContentLoaded", () => {   $$(".bottom-nav button").forEach((b) => {
    b.addEventListener("click", () => {
      const route = b.dataset.route;
      if (route) navigate(route);
    });
  });

  const profileBtn = $("#profile-btn");
  if (profileBtn) {
    profileBtn.addEventListener("click", () => navigate("more"));
  }

  const musicToggle = $("#music-toggle");
  if (musicToggle) {
    musicToggle.addEventListener("click", () => {
      const drawer = $("#music-drawer");
      if (drawer) drawer.classList.toggle("hidden");
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