import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);
const ALLOWED_EMAILS = new Set(['akabeeram@gmail.com', 'hizasgallery@gmail.com']);

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
  bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function verifyFirebaseUser(request, env) {
  if (!env.FIREBASE_PROJECT_ID) throw new HttpError(500, 'FIREBASE_PROJECT_ID is not configured');
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Missing sign-in token');
  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
    }));
  } catch {
    throw new HttpError(401, 'Invalid or expired sign-in token');
  }
  if (!ALLOWED_EMAILS.has(String(payload.email || '').toLowerCase())) throw new HttpError(403, 'This account cannot access couple media.');
  return payload;
}

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'DELETE') {
        throw new HttpError(405, 'Method not allowed');
      }

      await verifyFirebaseUser(request, env);

      const url = new URL(request.url);
      const dayKey = url.searchParams.get('dayKey') || '';
      const profileKey = url.searchParams.get('profileKey') || '';
      const storeForReveal = url.searchParams.get('storeForReveal') !== 'false';
      const api = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

      // Gallery records hold these Telegram references in Firestore. Media bytes are
      // proxied from Telegram so neither the browser nor Firebase Storage keeps them.
      const telegramFileId = url.searchParams.get('fileId') || url.searchParams.get('galleryFileId') || '';
      if (request.method === 'GET' && telegramFileId) {
        if (telegramFileId.length > 256) throw new HttpError(400, 'Invalid Telegram file reference');
        const requestedMime = url.searchParams.get('mimeType') || 'application/octet-stream';
        const mimeType = /^[\w.+-]+\/[\w.+-]+$/.test(requestedMime) ? requestedMime : 'application/octet-stream';
        const fileRes = await fetch(`${api}/getFile?file_id=${encodeURIComponent(telegramFileId)}`);
        const fileData = await fileRes.json().catch(() => ({}));
        if (!fileData.ok || !fileData.result?.file_path) throw new HttpError(502, fileData.description || 'Telegram getFile failed');
        const mediaRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`);
        if (!mediaRes.ok || !mediaRes.body) throw new HttpError(502, 'Telegram media download failed');
        return new Response(mediaRes.body, {
          headers: { ...cors, 'Content-Type': mimeType, 'Cache-Control': 'private, no-store' },
        });
      }

      if (request.method === 'DELETE') {
        const chatId = url.searchParams.get('galleryChatId') || '';
        const messageId = Number(url.searchParams.get('galleryMessageId'));
        if (chatId !== String(env.TELEGRAM_CHAT_ID) || !/^-?\d+$/.test(chatId) || !Number.isSafeInteger(messageId) || messageId < 1) {
          throw new HttpError(400, 'Invalid Telegram message reference');
        }
        const response = await fetch(`${api}/deleteMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new HttpError(502, result.description || 'Telegram could not delete this media');
        return json({ ok: true });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new HttpError(400, 'Invalid dayKey');
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(profileKey)) throw new HttpError(400, 'Invalid profileKey');

      const kvKey = (key) => `photo:${dayKey}:${key}`;

      if (request.method === 'POST') {
        const formData = await request.formData();
        const file = formData.get('file');
        const caption = formData.get('caption') || '';
        if (!file || typeof file === 'string') throw new HttpError(400, 'No file uploaded');

        const fileName = file.name || 'love-note.jpg';
        const tg = new FormData();
        tg.append('chat_id', env.TELEGRAM_CHAT_ID);
        tg.append('document', file, fileName);
        if (caption) tg.append('caption', String(caption));

        const res = await fetch(`${api}/sendDocument`, { method: 'POST', body: tg });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) throw new HttpError(502, data.description || 'Telegram upload failed');

        if (storeForReveal) {
          const fileId =
            data.result?.document?.file_id ||
            data.result?.photo?.[data.result.photo.length - 1]?.file_id;
          if (!fileId) throw new HttpError(502, 'Telegram did not return a file_id');

          const ext = fileName.split('.').pop().toLowerCase();
          const mime = file.type && file.type.startsWith('image/') ? file.type : MIME[ext] || 'application/octet-stream';
          await env.PHOTOS.put(kvKey(profileKey), JSON.stringify({ fileId, mime }));
        }

        return json(data);
      }

      const viewerKey = url.searchParams.get('viewerKey') || '';
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(viewerKey)) throw new HttpError(400, 'Invalid viewerKey');

      if (viewerKey !== profileKey) {
        const viewerUpload = await env.PHOTOS.get(kvKey(viewerKey));
        if (!viewerUpload) throw new HttpError(423, 'Both partners need to upload first');
      }

      const stored = await env.PHOTOS.get(kvKey(profileKey), 'json');
      if (!stored?.fileId) throw new HttpError(404, 'Photo not found');

      const fileRes = await fetch(`${api}/getFile?file_id=${encodeURIComponent(stored.fileId)}`);
      const fileData = await fileRes.json().catch(() => ({}));
      if (!fileData.ok || !fileData.result?.file_path) {
        throw new HttpError(502, fileData.description || 'Telegram getFile failed');
      }

      const imageRes = await fetch(
        `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`
      );
      if (!imageRes.ok || !imageRes.body) throw new HttpError(502, 'Telegram download failed');

      return new Response(imageRes.body, {
        headers: {
          ...cors,
          'Content-Type': stored.mime || 'application/octet-stream',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json({ ok: false, error: err.message || 'Server error' }, status);
    }
  },
};
