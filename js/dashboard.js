import { $,$$, esc, toast } from "./utils.js";
import { watchDiaryPosts, toggleDiaryLike, watchDiaryComments, addDiaryComment, addDiaryPost, deleteDiaryPost } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { db } from "./firebase.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

let stopPosts = null, active = false, postCommentStops = new Map();

export function renderHome(el, user, profile) {
  stopPosts?.();
  active = true;

  el.innerHTML = `
    <style>
      .home-container {
        max-width: 600px;
        margin: 0 auto;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .home-composer-card {
        background: #ffffff;
        border-radius: 20px;
        padding: 16px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        margin-bottom: 20px;
      }
      .home-composer-head {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }
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
      .home-composer-card textarea {
        width: 100%;
        border: 1px solid #fecdd3;
        border-radius: 12px;
        padding: 12px;
        font-family: inherit;
        font-size: 14px;
        box-sizing: border-box;
        resize: none;
        outline: none;
      }
      .home-composer-card textarea:focus {
        border-color: #f43f5e;
      }
      .home-composer-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 10px;
      }
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
    </style>

    <div class="home-container">
      <!-- Active Working Composer in Home -->
      <form class="home-composer-card" id="home-composer">
        <div class="home-composer-head">
          <div class="home-avatar">${esc((profile.name || 'U')[0])}</div>
          <strong style="color:#881337;">Share a moment, ${esc(profile.name)} ♡</strong>
        </div>
        <textarea name="text" rows="3" placeholder="Write something sweet for us..."></textarea>
        <div class="home-composer-actions">
          <label style="cursor:pointer; color:#e11d48; font-weight:600; font-size:13px;">
            📷 Add Photo
            <input type="file" name="photo" accept="image/*" style="display:none;">
          </label>
          <span class="home-photo-selected" style="font-size:12px; color:#9ca3af;"></span>
          <button type="submit" class="home-post-btn">Post ♡</button>
        </div>
      </form>

      <!-- Unified Feed Showing Both Partners' Posts -->
      <div id="home-posts-feed" class="home-feed">
        <p style="text-align:center; color:#9ca3af; padding:20px;">Loading our posts…</p>
      </div>
    </div>
  `;

  const feed = $("#home-posts-feed", el);
  const composer = $("#home-composer", el);

  // File select label update
  composer.elements.photo.onchange = () => {
    composer.querySelector(".home-photo-selected").textContent = composer.elements.photo.files[0]?.name || "";
  };

  // Submit Post Logic
  composer.onsubmit = async (e) => {
    e.preventDefault();
    const text = composer.elements.text.value.trim();
    const file = composer.elements.photo.files[0];

    if (!text && !file) return toast("Write something or pick a photo first!");

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
      composer.querySelector(".home-photo-selected").textContent = "";
      toast("Post added to our feed! ♡");
    } catch (err) {
      toast("Could not save post.");
    }
  };

  // Watch All Posts (Both Kebyy and Shazy)
  stopPosts = watchDiaryPosts((items) => {
    if (!active) return;
    renderFeed(items);
  });

  function renderFeed(posts) {
    if (posts.length === 0) {
      feed.innerHTML = `<p style="text-align:center; color:#9ca3af; padding:30px;">No posts yet. Share your first moment together!</p>`;
      return;
    }

    feed.innerHTML = posts.map((post) => {
      const own = post.authorId === profile.id;
      const isLiked = (post.likedBy || []).includes(user.uid);
      const likeCount = (post.likedBy || []).length;
      const timeStr = post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Just now';

      // Reads unified photoUrl (Base64 or Direct Link)
      const photoHtml = post.photoUrl ? `<img src="${esc(post.photoUrl)}" class="home-post-photo" alt="Shared photo">` : '';

      return `
        <div class="home-post-card" id="home-post-${post.id}">
          <div class="home-post-header">
            <div class="home-post-author">
              <div class="home-avatar">${esc((post.authorName || 'U')[0])}</div>
              <div>
                <strong>${esc(post.authorName || 'Us')}</strong><br>
                <small>${timeStr}</small>
              </div>
            </div>
            ${own ? `
              <div style="display:flex; gap:8px;">
                <button class="home-action-btn home-edit-btn" data-id="${post.id}">✏️ Edit</button>
                <button class="home-action-btn home-del-btn" data-id="${post.id}" style="color:#dc2626;">🗑️ Delete</button>
              </div>
            ` : ''}
          </div>

          ${post.text ? `<p class="home-post-text">${esc(post.text).replace(/\n/g, '<br>')}</p>` : ''}
          ${photoHtml}

          <div class="home-post-actions">
            <button class="home-action-btn ${isLiked ? 'liked' : ''} home-like-btn" data-id="${post.id}">
              ${isLiked ? '❤️' : '♡'} ${likeCount}
            </button>
          </div>

          <div class="home-comments-list" id="home-comments-${post.id}"></div>

          <form class="home-comment-form" data-post-id="${post.id}">
            <input name="comment" placeholder="Write a comment..." required>
            <button type="submit" class="home-post-btn" style="padding:4px 12px; font-size:12px;">Reply</button>
          </form>
        </div>
      `;
    }).join("");

    posts.forEach((post) => {
      // Like Toggle
      const likeBtn = feed.querySelector(`.home-like-btn[data-id="${post.id}"]`);
      if (likeBtn) {
        likeBtn.onclick = async () => {
          const liked = (post.likedBy || []).includes(user.uid);
          await toggleDiaryLike(post.id, user.uid, liked);
        };
      }

      // Delete Post
      const delBtn = feed.querySelector(`.home-del-btn[data-id="${post.id}"]`);
      if (delBtn) {
        delBtn.onclick = async () => {
          if (confirm("Delete this post?")) {
            await deleteDiaryPost(post.id);
            toast("Deleted post");
          }
        };
      }

      // Edit Post
      const editBtn = feed.querySelector(`.home-edit-btn[data-id="${post.id}"]`);
      if (editBtn) {
        editBtn.onclick = async () => {
          const newText = prompt("Edit post:", post.text);
          if (newText !== null && newText.trim() !== "" && newText !== post.text) {
            try {
              const postRef = doc(db, "diary", post.id);
              await updateDoc(postRef, { text: newText.trim() });
              toast("Post updated! ♡");
            } catch (err) {
              toast("Could not update post.");
            }
          }
        };
      }

      // Comments Watcher
      if (!postCommentStops.has(post.id)) {
        const stop = watchDiaryComments(post.id, (comments) => {
          if (!active) return;
          const target = feed.querySelector(`#home-comments-${post.id}`);
          if (target) {
            target.innerHTML = comments.map(c => `
              <div class="home-comment-item">
                <strong>${esc(c.authorName || 'Us')}:</strong> ${esc(c.text || '')}
              </div>
            `).join("");
          }
        });
        postCommentStops.set(post.id, stop);
      }

      // Submit Comment
      const commentForm = feed.querySelector(`.home-comment-form[data-post-id="${post.id}"]`);
      if (commentForm) {
        commentForm.onsubmit = async (e) => {
          e.preventDefault();
          const text = commentForm.elements.comment.value.trim();
          if (!text) return;
          await addDiaryComment(post.id, {
            authorId: profile.id,
            authorName: profile.name,
            text
          });
          commentForm.reset();
          toast("Comment added!");
        };
      }
    });
  }
}

export function disposeHome() {
  active = false;
  stopPosts?.();
  stopPosts = null;
  postCommentStops.forEach((stop) => stop());
  postCommentStops.clear();
}