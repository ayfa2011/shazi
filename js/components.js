import { esc, $ } from "./utils.js";

/** Video detection shared by feed cards and the detail modal. */
export function isVideoPost(post) {
  const mime = String(post.videoMimeType || post.photoMimeType || post.telegramMimeType || "").toLowerCase();
  if (post.telegramVideoFileId || mime.startsWith("video/")) return true;
  return mime.includes("mp4") || mime.includes("quicktime") || mime.includes("webm") || mime.includes("matroska");
}

/** Photo or video markup for a post's Telegram media reference. */
export function mediaMarkup(post, cropPositionStyle) {
  if (post.photoUrl) {
    return `<div class="tw-post-photo-frame"><img src="${esc(post.photoUrl)}" class="tw-post-photo" alt="Photo attached to post" data-post-image draggable="false" style="object-position:${cropPositionStyle(post)}"></div>`;
  }
  if (isVideoPost(post)) {
    const fileId = esc(post.telegramVideoFileId || post.telegramFileId || "");
    if (!fileId) return "";
    return `<div class="tw-post-video-frame" data-post-video="${post.id}"><span class="tw-video-waiting" aria-hidden="true">◌</span><span class="tw-video-play-overlay" aria-hidden="true">▶</span><button type="button" class="tw-video-mute" aria-label="Mute or unmute video">🔈</button></div>`;
  }
  if (post.telegramFileId) {
    return `<div class="tw-post-photo-frame"><img data-telegram-file-id="${esc(post.telegramFileId)}" data-telegram-mime="${esc(post.photoMimeType || "image/jpeg")}" class="tw-post-photo" alt="Photo attached to post" data-post-image draggable="false" style="object-position:${cropPositionStyle(post)}" loading="lazy"></div>`;
  }
  return "";
}

export function postCardComponent(post, isLiked, likeCount, isAuthor, authorName, authorProfile, handle, timeStr, voiceMarkup, commentsCount, cropPositionStyle) {
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
        </div>

        <p class="tw-post-text" id="post-text-${post.id}">${esc(post.text || '')}</p>
        ${mediaMarkup(post, cropPositionStyle)}
        ${voiceMarkup(post)}

        <div class="tw-actions-bar">
          <button class="tw-action-btn tw-reply-btn" data-id="${post.id}">💬 ${Number.isFinite(commentsCount) ? `${commentsCount} comments` : "Reply"}</button>
          <button class="tw-action-btn ${isLiked ? 'liked' : ''} tw-like-btn" data-id="${post.id}">
            ${isLiked ? '❤️' : '🤍'} ${likeCount}
          </button>
        </div>
      </div>

      ${isAuthor ? `
      <div class="tw-post-actions">
        <button type="button" class="tw-post-menu-btn" data-menu-post="${post.id}" aria-label="Post options" aria-haspopup="menu" aria-expanded="false">⋯</button>
        <div class="tw-post-menu" role="menu" data-menu-list="${post.id}">
          <button type="button" class="tw-edit-btn" role="menuitem" data-edit-post="${post.id}" aria-label="Edit post">✏️ Edit</button>
          <button type="button" class="tw-del-btn" role="menuitem" data-delete-post="${post.id}" aria-label="Delete post">🗑 Delete</button>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

export function commentComponent(comment, user, voiceMarkup) {
  return `
    <div class="tw-detail-comment" id="tw-comment-${comment.id}">
      <strong>${esc(comment.authorName || "Us")}</strong>
      <div>${esc(comment.text || "")}</div>
      ${voiceMarkup(comment, "tw-comment-voice")}
      ${comment.authorId === user.uid ? `
        <div class="tw-detail-comment-actions">
          <button type="button" class="tw-comment-edit-btn" data-id="${esc(comment.id)}">Edit</button>
          <button type="button" class="tw-comment-del-btn" data-id="${esc(comment.id)}">Delete</button>
        </div>
      ` : ""}
    </div>
  `;
}
