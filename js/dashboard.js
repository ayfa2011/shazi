import { $, esc, toast, todayKey, compressImage } from "./utils.js";
import { watchDiaryPosts, watchRelationshipStartDate, saveRelationshipStartDate, watchDrawingMessages, toggleDiaryLike, watchDiaryComments, addDiaryComment, addDiaryPost, updateDiaryPost, deleteDiaryPost } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { findProfileForAuthor, getDisplayName, getProfileKey } from "./profile-data.js";
import { ensureDailyQuestion, watchQuestionParticipants } from "./question-service.js";
import { challengeForDay } from "./challenge-bank.js";

let stopPosts = null, stopRelationship = null, stopDrawings = null, stopQuestionParticipants = null, counterTimer = null, active = false, postCommentStops = new Map();

export function renderHome(el, user, profile) {
  stopPosts?.();
  stopRelationship?.();
  stopDrawings?.();
  stopQuestionParticipants?.();
  clearInterval(counterTimer);
  active = true;
  const challenge = challengeForDay(todayKey());
  let dailyQuestion = null, questionParticipants = {};

  el.innerHTML = `
    <style>
      .home-container {
        max-width: 1050px;
        margin: 0 auto;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .home-post-panel {
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 22px;
        background: #fff;
        box-shadow: 0 8px 30px #8f315d0a;
      }
      .home-post-panel .home-composer-card {
        margin: 12px 0;
        padding: 13px;
        border: 1px solid var(--line);
        box-shadow: none;
      }
      .home-date-control { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-self: center; gap: 7px; width: fit-content; max-width: 100%; padding: 5px 11px; border: 1px solid #e89ab8; border-radius: 999px; background: #fff8fbdd; color: #741e4b; font-size: 12px; line-height: 1.2; font-weight: 600; }
      .home-date-heart { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: #ffe4ef; color: #d74482; font-size: 14px; line-height: 1; }
      .home-date-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
      .home-counter-art { position: absolute; right: 15px; bottom: -26px; color: #fff9; font: 190px/1 "Playfair Display",serif; pointer-events: none; }
      .home-counter-content { position: relative; z-index: 1; }
      .home-drawing-panel { margin-top: 0; border: 1px solid var(--line); }
      .home-post-panel { padding: 10px; }
      .home-post-panel .home-composer-card { margin: 0 0 10px; padding: 10px; }
      .home-post-panel .home-avatar { width: 32px; height: 32px; }
      .home-post-panel .home-composer-card textarea { min-height: 54px; padding: 8px 10px; font-size: 13px; }
      .home-post-panel .home-composer-actions { margin-top: 7px; }
      .home-post-panel .home-post-btn { padding: 7px 12px; font-size: 12px; }
      .home-post-panel .home-feed { gap: 9px; }
      .home-view-more { width: 100%; margin-top: 9px; padding: 8px 10px; border: 1px solid #f4d6e2; border-radius: 999px; background: #fff4f8; color: var(--deep); font-size: 11px; font-weight: 600; cursor: pointer; }
      .home-view-more span { margin-left: 5px; color: var(--pink); }
      .home-post-panel .home-post-card { padding: 11px; border: 1px solid var(--line); border-radius: 16px; box-shadow: none; }
      .home-post-panel .home-post-header { margin-bottom: 6px; }
      .home-post-panel .home-post-author { gap: 7px; }
      .home-post-panel .home-post-author strong { font-size: 13px; }
      .home-post-panel .home-post-author small { font-size: 10px; }
      .home-post-panel .home-post-text { margin: 6px 0; font-size: 13px; }
      .home-post-panel .home-post-photo { max-height: 230px; margin-top: 6px; border-radius: 11px; }
      .home-post-panel .home-post-actions { margin-top: 7px; padding-top: 6px; }
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
      .home-avatar img { width:100%; height:100%; border-radius:50%; object-fit:cover; }
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
      <div class="couple-brand">
        <div class="brand-hearts" aria-hidden="true">♡♡</div>
        <h1>Keby &amp; Shazy</h1>
        <p>TWO HEARTS <span>♥</span> ONE JOURNEY</p>
      </div>

      <section class="together-counter" aria-label="Relationship counter">
        <div class="counter-script" aria-hidden="true">Together<br>Since ↗<br>♡</div>
        <div class="counter-main home-counter-content">
          <small>OUR RELATIONSHIP STARTED ON</small>
          <button type="button" class="home-date-control" id="relationship-date">
            <span class="home-date-heart" aria-hidden="true">♡</span>
            <span id="relationship-date-label">Choose our date</span>
          </button>
          <input class="home-date-input" id="relationship-date-input" type="date" aria-label="Choose relationship start date">
          <div class="counter-units" aria-live="off">
            <span><b id="counter-days">0</b><small>Days</small></span><i aria-hidden="true"></i>
            <span><b id="counter-hours">00</b><small>Hours</small></span><i aria-hidden="true"></i>
            <span><b id="counter-minutes">00</b><small>Minutes</small></span><i aria-hidden="true"></i>
            <span><b id="counter-seconds">00</b><small>Seconds</small></span>
          </div>
        </div>
        <span class="home-counter-art" aria-hidden="true">♡</span>
      </section>

      <section class="home-feature-grid">
        <div class="home-post-panel">
          <form class="home-composer-card" id="home-composer">
            <textarea name="text" rows="2" placeholder="Write a post..."></textarea>
            <div class="home-composer-actions">
              <label style="cursor:pointer; color:#e11d48; font-weight:600; font-size:13px;">
                📷 Add Photo
                <input type="file" name="photo" accept="image/*" style="display:none;">
              </label>
              <span class="home-photo-selected" style="font-size:12px; color:#9ca3af;"></span>
              <button type="submit" class="home-post-btn">Post ♡</button>
            </div>
          </form>
          <div id="home-posts-feed" class="home-feed">
            <p style="text-align:center; color:#9ca3af; padding:20px;">Loading our posts…</p>
          </div>
          <button type="button" class="home-view-more" id="view-more-posts">View more posts <span aria-hidden="true">→</span></button>
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
          <div><p class="eyebrow">A LITTLE SOMETHING FOR TODAY</p><h2>Grow closer, every day</h2></div>
        </div>
        <div class="today-cards">
          <article class="card today-question">
            <span class="today-icon" aria-hidden="true">♡</span>
            <div class="today-card-copy">
              <strong>Today's Question</strong>
              <span class="today-question-category" id="home-question-category"></span>
              <p><em id="home-question-text">Loading today's question…</em></p>
              <button type="button" class="today-link" id="home-question-link">Answer Now →</button>
            </div>
          </article>
          <article class="card today-challenge" id="home-daily-challenge" role="link" tabindex="0" aria-label="Open Daily Challenges">
            <span class="today-icon challenge-icon" aria-hidden="true">★</span>
            <div class="today-card-copy">
              <strong>Daily Challenge</strong>
              <p><em>${esc(challenge.title)}</em></p>
              <button type="button" class="today-link" id="home-challenge-link">Take the challenge →</button>
            </div>
          </article>
        </div>
      </section>
    </div>
  `;

  const feed = $("#home-posts-feed", el);
  const composer = $("#home-composer", el);
  const dateButton = $("#relationship-date", el);
  const dateInput = $("#relationship-date-input", el);
  const questionProfileKey = getProfileKey(profile);
  let startDate = "";

  const now = new Date();
  dateInput.max = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  function updateCounter() {
    $("#relationship-date-label", el).textContent = startDate
      ? new Date(`${startDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "Choose our date";
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
    if (!active || !el.isConnected) return;
    startDate = date || "";
    dateInput.value = startDate;
    updateCounter();
  });

  stopDrawings = watchDrawingMessages(messages => {
    if (!active || !el.isConnected) return;
    const preview = $("#home-drawing-preview", el);
    if (!preview) return;
    const latest = messages?.[0];
    if (!latest) {
      preview.innerHTML = `<span class="home-canvas-heart" aria-hidden="true">♡</span><small>No drawings yet</small>`;
      return;
    }
    const imageUrl = latest.thumbnailUrl || `https://drive.google.com/thumbnail?id=${encodeURIComponent(latest.driveFileId)}&sz=w800`;
    preview.innerHTML = `<img src="${esc(imageUrl)}" alt="Latest shared drawing">`;
  });

  function renderQuestionWidget() {
    const questionText = $("#home-question-text", el);
    const category = $("#home-question-category", el);
    const button = $("#home-question-link", el);
    if (!questionText || !category || !button || !dailyQuestion) return;
    questionText.textContent = dailyQuestion.question;
    category.textContent = dailyQuestion.category;
    category.hidden = false;
    button.textContent = questionParticipants[questionProfileKey] ? "View Answers →" : "Answer Now →";
  }

  ensureDailyQuestion(todayKey()).then(questionRecord => {
    if (!active || !el.isConnected) return;
    dailyQuestion = questionRecord;
    renderQuestionWidget();
    stopQuestionParticipants?.();
    stopQuestionParticipants = watchQuestionParticipants(todayKey(), status => {
      if (!active || !el.isConnected) return;
      questionParticipants = status;
      renderQuestionWidget();
    }, error => {
      console.error("Today's Question status could not be synced:", error);
      toast("Today's Question status could not be synced.");
    });
  }).catch(error => {
    console.error("Today's Question could not be prepared:", error);
    const questionText = $("#home-question-text", el);
    if (questionText) questionText.textContent = "Today's Question is unavailable right now.";
    const category = $("#home-question-category", el);
    if (category) category.hidden = true;
  });

  $("#open-drawing", el).onclick = () => window.App.navigate("drawing");
  $("#view-more-posts", el).onclick = () => window.App.navigate("gallery");
  $("#home-question-link", el).onclick = () => window.App.navigate("questions");
  const challengeCard = $("#home-daily-challenge", el);
  const openChallenges = () => window.App.navigate("challenges");
  challengeCard.onclick = openChallenges;
  challengeCard.onkeydown = event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openChallenges();
    }
  };
  $("#home-challenge-link", el).onclick = event => {
    event.stopPropagation();
    openChallenges();
  };
  el.querySelectorAll("[data-route]").forEach(button => {
    button.onclick = () => window.App.navigate(button.dataset.route);
  });

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
      const photoUrl = file ? await compressImage(file) : "";
      if (file && !photoUrl) return toast("Could not read that photo. Please choose another image.");

      await addDiaryPost({
        authorId: user.uid,
        authorName: profile.name,
        wallId: APP_CONFIG.coupleId,
        text,
        ...(photoUrl ? { photoUrl } : {})
      });

      composer.reset();
      composer.querySelector(".home-photo-selected").textContent = "";
      toast("Post added to our feed! ♡");
    } catch (err) {
      console.error("Could not save post:", err);
      toast("Could not save post.");
    }
  };

  // Watch All Posts (Both Kebyy and Shazy)
  stopPosts = watchDiaryPosts((items) => {
    if (!active) return;
    renderFeed(items.slice(0, 1));
  });

  function renderFeed(posts) {
    if (posts.length === 0) {
      feed.innerHTML = `<p style="text-align:center; color:#9ca3af; padding:16px 8px; font-size:12px;">No posts yet</p>`;
      return;
    }

    feed.innerHTML = posts.map((post) => {
      const own = post.authorId === user.uid || post.authorId === profile.id;
      const author = findProfileForAuthor(post.authorId, post.authorName || "");
      const authorName = getDisplayName(post.authorId, post.authorName || "Us");
      const isLiked = (post.likedBy || []).includes(user.uid);
      const likeCount = (post.likedBy || []).length;
      const createdAt = post.createdAt?.toDate ? post.createdAt.toDate() : post.createdAt ? new Date(post.createdAt) : null;
      const timeStr = createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : "Just now";

      // Reads unified photoUrl (Base64 or Direct Link)
      const photoHtml = post.photoUrl ? `<img src="${esc(post.photoUrl)}" class="home-post-photo" alt="Shared photo">` : '';

      return `
        <div class="home-post-card" id="home-post-${post.id}">
          <div class="home-post-header">
            <div class="home-post-author">
              <div class="home-avatar">${author?.avatar ? `<img src="${esc(author.avatar)}" alt="">` : esc(authorName[0])}</div>
              <div>
                <strong>${esc(authorName)}</strong><br>
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
            <button class="home-action-btn home-reply-focus-btn" data-id="${post.id}" aria-label="Comment on post">♡</button>
            <button class="home-action-btn ${isLiked ? 'liked' : ''} home-like-btn" data-id="${post.id}">
              ${isLiked ? '❤️' : '♡'} ${likeCount}
            </button>
          </div>

          <div class="home-comments-list" id="home-comments-${post.id}"></div>

          <form class="home-comment-form" data-post-id="${post.id}">
            <div class="home-replying-to" hidden><span></span><button type="button" aria-label="Cancel reply">×</button></div>
            <input type="hidden" name="parentId">
            <input name="comment" placeholder="Write a comment..." required>
            <button type="submit" class="home-post-btn">Reply</button>
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
          try {
            await toggleDiaryLike(post.id, user.uid, liked);
          } catch (err) {
            console.error("Could not update post like:", err);
            toast("Could not update the like.");
          }
        };
      }
      feed.querySelector(`.home-reply-focus-btn[data-id="${post.id}"]`)?.addEventListener("click", () => {
        feed.querySelector(`.home-comment-form[data-post-id="${post.id}"] input[name="comment"]`)?.focus();
      });

      // Delete Post
      const delBtn = feed.querySelector(`.home-del-btn[data-id="${post.id}"]`);
      if (delBtn) {
        delBtn.onclick = async () => {
          if (confirm("Delete this post?")) {
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

      // Edit Post
      const editBtn = feed.querySelector(`.home-edit-btn[data-id="${post.id}"]`);
      if (editBtn) {
        editBtn.onclick = async () => {
          const newText = prompt("Edit post:", post.text || "");
          if (newText !== null && newText.trim() !== (post.text || "")) {
            if (!newText.trim() && !post.photoUrl) {
              toast("A post needs text or a photo.");
              return;
            }
            try {
              await updateDiaryPost(post.id, { text: newText.trim() });
              toast("Post updated! ♡");
            } catch (err) {
              console.error("Could not update post:", err);
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
            const roots = comments.filter(comment => !comment.parentId);
            target.innerHTML = roots.map(comment => {
              const replies = comments.filter(reply => reply.parentId === comment.id);
              return `
                <div class="home-comment-thread">
                  <div class="home-comment-item">
                    <strong>${esc(getDisplayName(comment.authorId, comment.authorName || "Us"))}</strong>
                    <p>${esc(comment.text || "")}</p>
                    <button class="home-comment-reply-btn" type="button" data-comment-id="${comment.id}" data-author="${esc(getDisplayName(comment.authorId, comment.authorName || "Us"))}">Reply</button>
                  </div>
                  ${replies.length ? `<div class="home-comment-replies">${replies.map(reply => `
                    <div class="home-comment-item"><strong>${esc(getDisplayName(reply.authorId, reply.authorName || "Us"))}</strong><p>${esc(reply.text || "")}</p></div>
                  `).join("")}</div>` : ""}
                </div>
              `;
            }).join("");

            target.querySelectorAll(".home-comment-reply-btn").forEach(button => {
              button.onclick = () => {
                const form = feed.querySelector(`.home-comment-form[data-post-id="${post.id}"]`);
                const replyIndicator = form.querySelector(".home-replying-to");
                form.elements.parentId.value = button.dataset.commentId;
                replyIndicator.querySelector("span").textContent = `Replying to ${button.dataset.author}`;
                replyIndicator.hidden = false;
                form.elements.comment.placeholder = `Reply to ${button.dataset.author}...`;
                form.elements.comment.focus();
              };
            });
          }
        });
        postCommentStops.set(post.id, stop);
      }

      // Submit Comment
      const commentForm = feed.querySelector(`.home-comment-form[data-post-id="${post.id}"]`);
      if (commentForm) {
        const replyIndicator = commentForm.querySelector(".home-replying-to");
        replyIndicator.querySelector("button").onclick = () => {
          commentForm.elements.parentId.value = "";
          commentForm.elements.comment.placeholder = "Write a comment...";
          replyIndicator.hidden = true;
        };
        commentForm.onsubmit = async (e) => {
          e.preventDefault();
          const text = commentForm.elements.comment.value.trim();
          if (!text) return;
          try {
            await addDiaryComment(post.id, {
              authorId: user.uid,
              authorName: profile.name,
              text,
              ...(commentForm.elements.parentId.value ? { parentId: commentForm.elements.parentId.value } : {})
            });
            commentForm.reset();
            replyIndicator.hidden = true;
            commentForm.elements.comment.placeholder = "Write a comment...";
            toast("Reply sent!");
          } catch (err) {
            console.error("Could not send comment:", err);
            toast("Could not send reply.");
          }
        };
      }
    });
  }
}

export function disposeHome() {
  active = false;
  stopPosts?.();
  stopPosts = null;
  stopRelationship?.();
  stopRelationship = null;
  stopDrawings?.();
  stopDrawings = null;
  stopQuestionParticipants?.();
  stopQuestionParticipants = null;
  clearInterval(counterTimer);
  counterTimer = null;
  postCommentStops.forEach((stop) => stop());
  postCommentStops.clear();
}