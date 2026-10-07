import { initAuth, logout } from "./auth.js";
import { $,$$, esc } from "./utils.js";
import { renderHome, disposeHome } from "./dashboard.js";
import { renderMemories } from "./memories.js";
import { renderGames } from "./games.js";
import { renderLetters } from "./letters.js";
import { watchItems, watchDiaryPosts, toggleDiaryLike, watchDiaryComments, addDiaryComment, addDiaryPost, deleteDiaryPost } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { toast } from "./utils.js";
import { renderBucket } from "./bucket-list.js";
import { renderActivities } from "./activities.js";
import { renderMore } from "./more.js";
import { renderDrawing, disposeDrawing } from "./drawing.js";
import { initMusic } from "./music.js";
import { firebaseReady } from "./firebase.js";

let currentUser = null, currentProfile = null;

function renderGallery(el, user, profile) {
  renderPostFeed(el, user, profile);
}

let stopPostFeed = null, disposePostFeed = null, postCommentStops = new Map();

function renderPostFeed(el, user, profile) {
  disposePostFeed?.();
  let active = true, filter = "all", posts = [];
  el.innerHTML = `<section class="post-page"><header class="post-page-head"><div><p class="eyebrow">OUR LITTLE WORLD</p><h1>Posts</h1></div><button class="primary post-compose-open" type="button">＋ Post</button></header><div class="post-profiles" role="tablist" aria-label="Filter posts"><button class="selected" data-profile="all">♡ Together</button><button data-profile="keby">Keby</button><button data-profile="shazy">Shazy</button></div><form class="diary-composer post-page-composer hidden"><div class="feed-avatar">${esc(profile.name[0])}</div><textarea name="text" rows="3" maxlength="3000" placeholder="Share a little moment, ${esc(profile.name)}…" aria-label="Write a post"></textarea><div class="composer-actions"><label class="photo-select">＋ Photo<input type="file" name="photo" accept="image/*"></label><span class="selected-photo muted"></span><button class="primary" type="submit">Post</button></div><p class="drive-note">Photos are saved to your shared Google Drive ♡</p></form><div class="post-page-feed" id="post-page-feed"><p class="muted">Loading posts…</p></div></section>`;
  
  const feed = $("#post-page-feed", el), composer = el.querySelector(".post-page-composer");
  
  el.querySelector(".post-compose-open").onclick = () => {
    composer.classList.toggle("hidden");
    if (!composer.classList.contains("hidden")) composer.elements.text.focus();
  };
  
  el.querySelectorAll("[data-profile]").forEach(button => button.onclick = () => {
    filter = button.dataset.profile;
    el.querySelectorAll("[data-profile]").forEach(tab => tab.classList.toggle("selected", tab === button));
    render();
  });
  
  composer.elements.photo.onchange = () => composer.querySelector(".selected-photo").textContent = composer.elements.photo.files[0]?.name || "";
  
  composer.onsubmit = async e => {
    e.preventDefault();
    const text = composer.elements.text.value.trim(), file = composer.elements.photo.files[0];
    if (!text && !file) { toast("Write a note or add a photo first."); return; }
    try {
      const photoData = file ? await uploadPostPhoto(file) : {};
      await addDiaryPost({ authorId: profile.id, authorName: profile.name, wallId: APP_CONFIG.coupleId, text, ...photoData });
      composer.reset();
      composer.querySelector(".selected-photo").textContent = "";
      composer.classList.add("hidden");
      toast("Your post is saved ♡");
    } catch (error) {
      toast(error.message || "Could not save your post.");
    }
  };
  
  stopPostFeed = watchDiaryPosts(items => { if (!active) return; posts = items; render(); });
  
  function render() {
    const shown = posts.filter(post => filter === "all" || post.authorId === APP_CONFIG.profiles[filter]?.id);
    feed.innerHTML = shown.map(post => postCard(post)).join("") || `<div class="empty-diary"><span>♡</span><p>No posts here yet.</p><small>Share a little moment together.</small></div>`;
    
    feed.querySelectorAll("[data-post-like]").forEach(b => b.onclick = async () => {
      const post = posts.find(p => p.id === b.dataset.postLike);
      if (!post) return;
      const liked = (post.likedBy || []).includes(user.uid);
      b.disabled = true;
      try {
        await toggleDiaryLike(post.id, user.uid, liked);
        post.likedBy = liked ? post.likedBy.filter(id => id !== user.uid) : [...(post.likedBy || []), user.uid];
        b.textContent = `♡ ${post.likedBy.length}`;
        b.classList.toggle("liked", !liked);
      } catch {
        toast("Could not update like.");
      } finally {
        b.disabled = false;
      }
    });

    feed.querySelectorAll("[data-post-delete]").forEach(b => b.onclick = async () => {
      if (confirm("Delete this post?")) {
        try { await deleteDiaryPost(b.dataset.postDelete); } catch { toast("Could not delete this post."); }
      }
    });

    feed.querySelectorAll("[data-post-comment]").forEach(form => form.onsubmit = async e => {
      e.preventDefault();
      const text = form.elements.comment.value.trim();
      if (!text) return;
      try {
        await addDiaryComment(form.dataset.postComment, { authorId: profile.id, authorName: profile.name, text });
        form.reset();
      } catch {
        toast("Could not save your comment.");
      }
    });

    feed.querySelectorAll("[data-drive-photo]").forEach(button => button.onclick = () => loadPostPhoto(button.dataset.drivePhoto, button));
  }

  function postCard(post) {
    const name = post.authorName || "Us", own = post.authorId === profile.id, photo = post.photoDriveFileId ? (post.photoUrl?.startsWith("https://") ? `<img src="${esc(post.photoUrl)}" alt="Photo shared by ${esc(name)}" loading="lazy">` : `<button class="post-drive-load" type="button" data-drive-photo="${esc(post.photoDriveFileId)}">Load photo…</button>`) : "";
    if (!postCommentStops.has(post.id)) {
      const stop = watchDiaryComments(post.id, comments => {
        if (!active) return;
        post._comments = comments;
        const target = feed.querySelector(`[data-comments="${post.id}"]`);
        if (target) target.innerHTML = comments.map(c => `<p class="post-comment"><strong>${esc(c.authorName || "Us")}</strong> ${esc(c.text || "")}</p>`).join("");
      });
      postCommentStops.set(post.id, stop);
    }
    const time = post.createdAt?.toDate ? post.createdAt.toDate().toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Just now";
    return `<article class="social-post"><header><span class="social-avatar">${esc(name[0])}</span><span class="social-author"><strong>${esc(name)}</strong><small>${time}</small></span>${own ? `<button class="text-button post-delete" data-post-delete="${esc(post.id)}">Delete</button>` : ""}</header>${post.text ? `<p class="social-post-text">${esc(post.text).replace(/\n/g, "<br>")}</p>` : ""}${photo ? `<div class="social-post-photo">${photo}</div>` : ""}<div class="social-post-actions"><button class="text-button ${(post.likedBy || []).includes(user.uid) ? "liked" : ""}" data-post-like="${esc(post.id)}">♡ ${(post.likedBy || []).length}</button><a href="https://drive.google.com/file/d/${encodeURIComponent(post.photoDriveFileId || "")}/view" target="_blank" rel="noopener">${post.photoDriveFileId ? "Open photo ↗" : ""}</a></div><div data-comments="${esc(post.id)}" class="social-comments">${(post._comments || []).map(c => `<p class="post-comment"><strong>${esc(c.authorName \vert{}\vert{} "Us")}</strong> ${esc(c.text || "")}</p>`).join("")}</div><form class="social-comment-form" data-post-comment="${esc(post.id)}"><input name="comment" placeholder="Write a comment…" maxlength="1000"><button type="submit">Reply</button></form></article>`;
  }

  async function uploadPostPhoto(file) {
    if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Choose a photo under 8 MB.");
    const config = APP_CONFIG, token = await driveToken();
    if (!config.googleDriveFolderId) throw new Error("Google Drive folder is not configured.");
    const metadata = { name: `Our Little World - ${file.name}`, mimeType: file.type, parents: [config.googleDriveFolderId] }, body = new FormData();
    body.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    body.append("file", file);
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink,mimeType", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
    if (!response.ok) throw new Error("Google Drive could not save that photo.");
    const saved = await response.json();
    return { photoDriveFileId: saved.id, photoUrl: saved.thumbnailLink || "", photoName: saved.name };
  }

  async function driveToken() {
    if (!APP_CONFIG.googleDriveClientId) throw new Error("Google Drive is not configured.");
    if (!window.google?.accounts?.oauth2) await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Google sign-in could not load."));
      document.head.appendChild(s);
    });
    return new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: APP_CONFIG.googleDriveClientId,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: r => r.access_token ? resolve(r.access_token) : reject(new Error("Google Drive access was not granted.")),
        error_callback: () => reject(new Error("Google Drive sign-in was cancelled."))
      });
      client.requestAccessToken();
    });
  }

  async function loadPostPhoto(id, button) {
    try {
      const token = await driveToken(), response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Could not load this photo from Drive.");
      const url = URL.createObjectURL(await response.blob());
      if (active && button.isConnected) button.outerHTML = `<img src="${url}" alt="Photo shared on our wall" loading="lazy">`;
    } catch (e) {
      if (active) toast(e.message || "Could not load photo.");
    }
  }

  disposePostFeed = () => {
    active = false;
    stopPostFeed?.();
    stopPostFeed = null;
    postCommentStops.forEach(stop => stop());
    postCommentStops.clear();
  };
}

const titles = {
  home: "Keby & Shazy",
  memories: "Memories",
  games: "Games",
  gallery: "Post",
  letters: "Letter",
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
  bucket: renderBucket,
  activities: renderActivities,
  more: renderMore,
  drawing: renderDrawing
};

window.App = { navigate };

function navigate(route = "home") {
  if (route !== "home") disposeHome();
  if (route !== "drawing") disposeDrawing();
  if (route !== "gallery") { disposePostFeed?.(); disposePostFeed = null; }

  document.querySelectorAll(".bottom-nav button").forEach(b => b.classList.toggle("active", b.dataset.route === route));

  const pageTitle = titles[route] || "Dashboard";
  $("#page-title").textContent = pageTitle;

  routes[route]?.($("#main-content"), currentUser, currentProfile);
}

initAuth((user, profile) => {
  currentUser = user;
  currentProfile = profile;
  $("#auth-view").classList.add("hidden");
  $("#app-view").classList.remove("hidden");
  $("#avatar-letter").textContent = profile.emoji || "♡";
  navigate("home");
  if (firebaseReady) initMusic();
}, () => {
  disposeHome();
  disposeDrawing();
  $("#app-view").classList.add("hidden");
  $("#auth-view").classList.remove("hidden"); });  $$(".bottom-nav button").forEach(b => b.addEventListener("click", () => navigate(b.dataset.route)));
$("#profile-btn").addEventListener("click", () => navigate("more"));
$("#music-toggle").addEventListener("click", () => $("#music-drawer").classList.toggle("hidden"));
$("#music-close").addEventListener("click", () => $("#music-drawer").classList.add("hidden"));