import { APP_CONFIG } from "../config/app-config.js";
import { getTelegramMediaUrl } from "../src/services/telegramService.js";

export function getProfileKey(profile) {
  return Object.entries(APP_CONFIG.profiles).find(([, candidate]) =>
    candidate.id === profile?.id || candidate.email === profile?.email
  )?.[0] || "";
}

export function applyCoupleProfiles(data = {}) {
  let changed = false;

  for (const [key, saved] of Object.entries(data)) {
    const profile = APP_CONFIG.profiles[key];
    if (!profile || !saved || typeof saved !== "object") continue;
    const previousAvatarFileId = profile.avatarTelegramFileId || "";

    for (const field of ["name", "bio", "avatar", "driveFileId", "authUid", "avatarTelegramFileId", "avatarMimeType", "avatarPosition"]) {
      if (typeof saved[field] !== "string") continue;
      const incoming = ["avatar", "avatarTelegramFileId"].includes(field) && ["null", "undefined"].includes(saved[field].trim().toLowerCase())
        ? "" : saved[field];
      if (field === "bio" && !incoming && saved.bioConfigured !== true && profile.bio) continue;
      const currentAvatarIsSentinel = ["null", "undefined"].includes(String(profile.avatar || "").trim().toLowerCase());
      if (field === "avatar" && !incoming && profile.avatar && !currentAvatarIsSentinel) continue;
      if (profile[field] !== incoming) changed = true;
      profile[field] = incoming;
    }
    if (previousAvatarFileId !== (profile.avatarTelegramFileId || "")) {
      profile.avatarPreviewDataUrl = "";
      profile.avatarPreviewFileId = "";
    }
    if (saved.avatarTelegramFileId && !saved.avatar && profile._loadedAvatarTelegramFileId !== saved.avatarTelegramFileId) {
      if (profile.avatar) changed = true;
      profile.avatar = "";
    }
    if (saved.bioConfigured === true) profile.bioConfigured = true;

    const previousNames = Array.isArray(saved.previousNames)
      ? saved.previousNames.filter(name => typeof name === "string")
      : [];
    if (JSON.stringify(profile.previousNames || []) !== JSON.stringify(previousNames)) changed = true;
    profile.previousNames = previousNames;
  }

  return changed;
}

export async function hydrateCoupleProfileAvatars() {
  const results = await Promise.allSettled(Object.values(APP_CONFIG.profiles).map(async profile => {
    const fileId = profile.avatarTelegramFileId;
    if (!fileId || profile._loadedAvatarTelegramFileId === fileId) return false;
    const url = await getTelegramMediaUrl(fileId, profile.avatarMimeType || "image/jpeg");
    profile.avatar = url;
    profile._loadedAvatarTelegramFileId = fileId;
    return true;
  }));
  return results.some(result => result.status === "fulfilled" && result.value);
}

export function findProfileForAuthor(authorId, fallbackName = "") {
  const normalizedName = fallbackName.trim().toLocaleLowerCase();
  return Object.values(APP_CONFIG.profiles).find(profile =>
    authorId && (profile.id === authorId || profile.authUid === authorId)
  ) || Object.values(APP_CONFIG.profiles).find(profile =>
    normalizedName && (
      profile.name.toLocaleLowerCase() === normalizedName ||
      profile.previousNames?.some(name => name.toLocaleLowerCase() === normalizedName)
    )
  ) || null;
}

export function getDisplayName(authorId, fallbackName = "") {
  return findProfileForAuthor(authorId, fallbackName)?.name || fallbackName || "Us";
}
