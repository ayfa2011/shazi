import { esc, $ } from "./utils.js";

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
        ${post.photoUrl ? `<div class="tw-post-photo-frame"><img src="${esc(post.photoUrl)}" class="tw-post-photo" alt="Photo attached to post" data-post-image style="object-position:${cropPositionStyle(post)}"></div>` : post.telegramFileId ? `<div class="tw-post-photo-frame"><img data-telegram-file-id="${esc(post.telegramFileId)}" data-telegram-mime="${esc(post.photoMimeType || "image/jpeg")}" class="tw-post-photo" alt="Photo attached to post" data-post-image style="object-position:${cropPositionStyle(post)}" loading="lazy"></div>` : ''}
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
