import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);
const ALLOWED_EMAILS = new Set(['akabeeram@gmail.com', 'hizasgallery@gmail.com']);

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
        // Safari/iOS video playback commonly requests byte ranges. Forward the
        // range to Telegram and preserve its partial-content headers so seeking
        // and playback do not require downloading the entire file first.
        const range = request.headers.get('Range');
        const mediaRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`, {
          headers: range ? { Range: range } : undefined,
        });
        if (!mediaRes.ok || !mediaRes.body) throw new HttpError(502, 'Telegram media download failed');
        const extension = String(fileData.result.file_path).split('.').pop().toLowerCase();
        const inferredMime = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
          mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp'
        }[extension];
        const actualMime = inferredMime || (mimeType !== 'application/octet-stream' ? mimeType : mediaRes.headers.get('Content-Type') || 'application/octet-stream');
        const mediaHeaders = {
          ...cors,
          'Content-Type': actualMime,
          'Cache-Control': 'private, no-store',
          'Accept-Ranges': mediaRes.headers.get('Accept-Ranges') || 'bytes',
        };
        const contentLength = mediaRes.headers.get('Content-Length');
        if (contentLength) mediaHeaders['Content-Length'] = contentLength;
        const contentRange = mediaRes.headers.get('Content-Range');
        if (contentRange) mediaHeaders['Content-Range'] = contentRange;
        return new Response(mediaRes.body, {
          status: mediaRes.status,
          headers: mediaHeaders,
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

      if (request.method === 'POST') {
        const formData = await request.formData();
        const file = formData.get('file');
        const caption = formData.get('caption') || '';
        if (!file || typeof file === 'string') throw new HttpError(400, 'No file uploaded');

        const fileName = file.name || 'media';
        const tg = new FormData();
        tg.append('chat_id', env.TELEGRAM_CHAT_ID);
        tg.append('document', file, fileName);
        if (caption) tg.append('caption', String(caption));

        const res = await fetch(`${api}/sendDocument`, { method: 'POST', body: tg });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) throw new HttpError(502, data.description || 'Telegram upload failed');

        return json(data);
      }
      throw new HttpError(400, 'Missing Telegram file reference');
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json({ ok: false, error: err.message || 'Server error' }, status);
    }
  },
};
