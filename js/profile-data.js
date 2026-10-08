import { APP_CONFIG } from "../config/app-config.js";

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

    for (const field of ["name", "bio", "avatar", "driveFileId", "authUid"]) {
      if (typeof saved[field] !== "string") continue;
      if (field === "bio" && !saved.bio && saved.bioConfigured !== true && profile.bio) continue;
      if (field === "avatar" && !saved.avatar && profile.avatar) continue;
      if (profile[field] !== saved[field]) changed = true;
      profile[field] = saved[field];
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
