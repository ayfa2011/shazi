import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);
const ALLOWED_EMAILS = new Set(['akabeeram@gmail.com', 'hizasgallery@gmail.com']);
const DRIVE_UPLOAD_SESSION_ORIGIN = 'https://www.googleapis.com';
const DRIVE_UPLOAD_SESSION_PATH = '/upload/drive/v3/files';
const DRIVE_MAX_VIDEO_BYTES = 2 * 1024 ** 3;
const DRIVE_MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const TELEGRAM_FILE_PATH_TTL_MS = 50 * 60 * 1000;
const telegramFilePathCache = new Map();
let driveTokenCache = { value: '', expires: 0 };

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

async function driveAccessToken(env) {
  if (driveTokenCache.value && driveTokenCache.expires > Date.now() + 60_000) return driveTokenCache.value;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
    throw new HttpError(500, 'Google Drive is not configured');
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new HttpError(502, 'Google Drive sign-in failed');
  driveTokenCache = {
    value: data.access_token,
    expires: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };
  return driveTokenCache.value;
}

function validateDriveUploadSession(value) {
  let session;
  try { session = new URL(value); }
  catch { throw new HttpError(400, 'Invalid Drive upload session'); }
  if (session.protocol !== 'https:' || session.origin !== DRIVE_UPLOAD_SESSION_ORIGIN ||
      session.pathname !== DRIVE_UPLOAD_SESSION_PATH || session.searchParams.get('uploadType') !== 'resumable' ||
      !session.searchParams.has('upload_id')) {
    throw new HttpError(400, 'Invalid Drive upload session');
  }
  return session.toString();
}

async function handleDrive(request, env, url, json) {
  const op = url.searchParams.get('drive');
  const auth = { Authorization: `Bearer ${await driveAccessToken(env)}` };

  if (request.method === 'POST' && op === 'init') {
    const { name, mimeType, size } = await request.json().catch(() => ({}));
    if (!/^(audio|video)\/[\w.+-]+$/.test(mimeType || '') || !Number.isSafeInteger(size) || size < 1 || size > DRIVE_MAX_VIDEO_BYTES) {
      throw new HttpError(400, 'Invalid audio or video details');
    }
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
      method: 'POST',
      headers: {
        ...auth,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(size),
      },
      body: JSON.stringify({ name: String(name || 'memory-video').slice(0, 120) }),
    });
    const session = response.headers.get('Location');
    if (!response.ok || !session) throw new HttpError(502, 'Could not start the Drive upload');
    validateDriveUploadSession(session);
    return json({ ok: true, session });
  }

  if (request.method === 'PUT' && (op === 'chunk' || op === 'status')) {
    const session = validateDriveUploadSession(request.headers.get('X-Drive-Upload-Session') || '');
    const contentRange = request.headers.get('Content-Range') || '';
    const statusCheck = op === 'status';
    const match = statusCheck ? /^bytes \*\/(\d+)$/.exec(contentRange) : /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
    if (!match) throw new HttpError(400, 'Invalid Content-Range');
    let total, body;
    if (statusCheck) {
      total = Number(match[1]);
      body = null;
    } else {
      const [, rawStart, rawEnd, rawTotal] = match;
      const start = Number(rawStart), end = Number(rawEnd);
      total = Number(rawTotal);
      body = await request.arrayBuffer();
      if (start > end || end >= total || end - start + 1 !== body.byteLength || body.byteLength > DRIVE_MAX_CHUNK_BYTES) {
        throw new HttpError(400, 'Invalid video chunk');
      }
    }
    if (!Number.isSafeInteger(total) || total < 1 || total > DRIVE_MAX_VIDEO_BYTES) throw new HttpError(400, 'Invalid video size');
    const response = await fetch(session, {
      method: 'PUT',
      redirect: 'manual',
      headers: { 'Content-Range': contentRange },
      body,
    });
    if (response.status === 308) return json({ ok: true, done: false, range: response.headers.get('Range') || '' });
    if (response.status === 200 || response.status === 201) {
      const file = await response.json().catch(() => ({}));
      if (!file.id) throw new HttpError(502, 'Drive did not return a file id');
      return json({ ok: true, done: true, id: file.id });
    }
    throw new HttpError(502, `Drive upload failed (HTTP ${response.status})`);
  }

  if (request.method === 'GET' && op === 'stream') {
    const id = url.searchParams.get('id') || '';
    if (!/^[\w-]{10,100}$/.test(id)) throw new HttpError(400, 'Invalid Drive file reference');
    const range = request.headers.get('Range');
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
      headers: { ...auth, ...(range ? { Range: range } : {}) },
    });
    if (!response.ok || !response.body) throw new HttpError(response.status === 404 ? 404 : 502, 'Drive media download failed');
    const requested = url.searchParams.get('mimeType') || '';
    const headers = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
      'Content-Type': /^(audio|video)\/[\w.+-]+$/.test(requested) ? requested : (response.headers.get('Content-Type') || 'application/octet-stream'),
      'Cache-Control': 'private, no-store',
      'Accept-Ranges': 'bytes',
    };
    for (const header of ['Content-Length', 'Content-Range']) {
      if (response.headers.get(header)) headers[header] = response.headers.get(header);
    }
    return new Response(response.body, { status: response.status, headers });
  }

  if (request.method === 'DELETE' && op === 'delete') {
    const id = url.searchParams.get('id') || '';
    if (!/^[\w-]{10,100}$/.test(id)) throw new HttpError(400, 'Invalid Drive file reference');
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE', headers: auth });
    if (!response.ok && response.status !== 404) throw new HttpError(502, 'Drive file deletion failed');
    return json({ ok: true, deleted: response.status !== 404 });
  }

  throw new HttpError(400, 'Unsupported Drive request');
}

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Content-Range, Range, X-Drive-Upload-Session, X-Requested-With',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
      'Access-Control-Max-Age': '86400',
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'PUT' && request.method !== 'DELETE') {
        throw new HttpError(405, 'Method not allowed');
      }

      await verifyFirebaseUser(request, env);

      const url = new URL(request.url);
      const api = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

      const driveRef = url.searchParams.get('fileId') || '';
      if (request.method === 'GET' && driveRef.startsWith('drive:')) {
        url.searchParams.set('drive', 'stream');
        url.searchParams.set('id', driveRef.slice(6));
        return await handleDrive(request, env, url, json);
      }
      if (url.searchParams.has('drive')) return await handleDrive(request, env, url, json);

      // Gallery records hold these Telegram references in Firestore. Media bytes are
      // proxied from Telegram so neither the browser nor Firebase Storage keeps them.
      const telegramFileId = url.searchParams.get('fileId') || url.searchParams.get('galleryFileId') || '';
      if (request.method === 'GET' && telegramFileId) {
        if (telegramFileId.length > 256) throw new HttpError(400, 'Invalid Telegram file reference');
        const requestedMime = url.searchParams.get('mimeType') || 'application/octet-stream';
        const mimeType = /^[\w.+-]+\/[\w.+-]+$/.test(requestedMime) ? requestedMime : 'application/octet-stream';
        let filePath = '';
        const cachedPath = telegramFilePathCache.get(telegramFileId);
        if (cachedPath && cachedPath.expires > Date.now()) {
          filePath = cachedPath.path;
        } else {
          const fileRes = await fetch(`${api}/getFile?file_id=${encodeURIComponent(telegramFileId)}`);
          const fileData = await fileRes.json().catch(() => ({}));
          if (!fileData.ok || !fileData.result?.file_path) throw new HttpError(502, fileData.description || 'Telegram getFile failed');
          filePath = fileData.result.file_path;
          telegramFilePathCache.set(telegramFileId, { path: filePath, expires: Date.now() + TELEGRAM_FILE_PATH_TTL_MS });
          if (telegramFilePathCache.size > 500) telegramFilePathCache.delete(telegramFilePathCache.keys().next().value);
        }
        // Safari/iOS video playback commonly requests byte ranges. Forward the
        // range to Telegram and preserve its partial-content headers so seeking
        // and playback do not require downloading the entire file first.
        const range = request.headers.get('Range');
        const mediaRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`, {
          headers: range ? { Range: range } : undefined,
        });
        if (!mediaRes.ok || !mediaRes.body) throw new HttpError(502, 'Telegram media download failed');
        const extension = String(filePath).split('.').pop().toLowerCase();
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
        if (!response.ok) throw new HttpError(502, result.description || 'Telegram could not delete this media');
        if (!result.ok) {
          return json({ ok: true, deleted: false, error: result.description || 'Telegram could not delete this media' });
        }
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
