import { $, esc, toast, todayKey, scheduleDubaiDayRollover } from "./utils.js";
import { watchDiaryPosts, watchRelationshipStartDate, saveRelationshipStartDate, watchDrawingMessages, toggleDiaryLike, toggleDiaryCommentLike, watchDiaryComments, addDiaryComment, updateDiaryComment, deleteDiaryComment, watchItems } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { findProfileForAuthor, getDisplayName, getProfileKey } from "./profile-data.js";
import { formatSpecialDayDate, specialDayCountdown } from "./special-day-utils.js";
import { ensureDailyQuestion, watchQuestionParticipants } from "./question-service.js";
import { challengeForDay } from "./challenge-bank.js";

let stopPosts = null, stopRelationship = null, stopDrawings = null, stopQuestionParticipants = null, stopSpecialDays = null, counterTimer = null, dayRolloverTimer = null, homeRenderToken = 0, postCommentStops = new Map();

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
  const challenge = challengeForDay(todayKey());
  let dailyQuestion = null, questionParticipants = {};
  const commentsByPost = new Map();

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
      .home-date-control { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-self: center; gap: 7px; width: fit-content; max-width: 100%; padding: 5px 11px; border: 1px solid #e89ab8; border-radius: 999px; background: #fff8fbdd; color: #741e4b; font-size: 12px; line-height: 1.2; font-weight: 600; }
      .home-date-heart { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: #ffe4ef; color: #d74482; font-size: 14px; line-height: 1; }
      .home-date-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
      .home-counter-art { position: absolute; right: 15px; bottom: -26px; color: #fff9; font: 190px/1 "Playfair Display",serif; pointer-events: none; }
      .home-counter-content { position: relative; z-index: 1; }
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
      .home-post-panel .home-post-photo { max-height: 140px; margin-top: 6px; border-radius: 11px; object-fit: cover; }
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
    </style>

    <div class="home-container">
      <div class="couple-brand">
        <div class="brand-hearts" aria-hidden="true">♡♡</div>
        <h1>Keby &amp; Shazy</h1>
        <p>TWO HEARTS <span>♥</span> ONE JOURNEY</p>
      </div>

      <aside class="home-special-day-reminders" id="home-special-day-reminders" aria-live="polite" hidden></aside>

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
          <div id="home-posts-feed" class="home-feed">
            <p style="text-align:center; color:#9ca3af; padding:20px;">Loading your partner's posts…</p>
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
      : latest.thumbnailUrl);
    preview.innerHTML = `<img src="${esc(imageUrl)}" alt="Latest shared drawing">`;
  }, 1);

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
  }).catch(error => {
    if (!isCurrent()) return;
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

  const partnerProfile = Object.values(APP_CONFIG.profiles).find(candidate =>
    candidate.id !== profile.id && candidate.email !== profile.email
  );
  const partnerAuthorIds = [...new Set([partnerProfile?.id, partnerProfile?.authUid].filter(Boolean))];

  stopPosts = watchDiaryPosts((items) => {
    if (!isCurrent()) return;
    renderFeed(items);
  }, 2, partnerAuthorIds);

  function renderFeed(posts) {
    const visiblePostIds = new Set(posts.map(post => post.id));
    for (const [postId, stop] of postCommentStops) {
      if (!visiblePostIds.has(postId)) {
        stop();
        postCommentStops.delete(postId);
        commentsByPost.delete(postId);
      }
    }

    if (posts.length === 0) {
      feed.innerHTML = `<p style="text-align:center; color:#9ca3af; padding:16px 8px; font-size:12px;">Your partner's posts will appear here ♡</p>`;
      return;
    }

    feed.innerHTML = posts.slice(0, 2).map((post) => {
      const author = findProfileForAuthor(post.authorId, post.authorName || "");
      const authorName = getDisplayName(post.authorId, post.authorName || "Us");
      const isLiked = (post.likedBy || []).includes(user.uid);
      const likeCount = (post.likedBy || []).length;
      const createdAt = post.createdAt?.toDate ? post.createdAt.toDate() : post.createdAt ? new Date(post.createdAt) : null;
      const timeStr = createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        : "Just now";

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
          </div>

          ${post.text ? `<p class="home-post-text">${esc(post.text).replace(/\n/g, '<br>').slice(0, 100) + (post.text.length > 100 ? '...' : '')}</p>` : ''}
          ${photoHtml}

          <div class="home-post-actions">
            <button class="home-action-btn ${isLiked ? 'liked' : ''} home-like-btn" data-id="${post.id}">
              ${isLiked ? '❤️' : '♡'} ${likeCount}
            </button>
          </div>
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
    });
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
  stopSpecialDays?.();
  stopSpecialDays = null;
  clearInterval(counterTimer);
  counterTimer = null;
  clearTimeout(dayRolloverTimer);
  dayRolloverTimer = null;
  postCommentStops.forEach((stop) => stop());
  postCommentStops.clear();
}