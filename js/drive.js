import { compressImage } from "./utils.js";
import { storage } from "./firebase.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

export async function uploadProfilePhoto(file) {
  const avatar = await compressImage(file);
  if (!avatar) throw new Error("Could not read this image. Choose another photo.");
  return { avatar };
}

export async function uploadLoveChallengePhoto(file, dayKey, profileKey, uid) {
  if (!storage || !file || !/^\\d{4}-\\d{2}-\\d{2}$/.test(dayKey) || !["kebyy", "shazy"].includes(profileKey)) {
    throw new Error("Choose a valid photo and try again.");
  }
  if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
  const path = `couples/our-little-world/love-challenge/${dayKey}/${profileKey}-${uid}.${extension}`;
  const object = storageRef(storage, path);
  await uploadBytes(object, file, { contentType: file.type, customMetadata: { ownerUid: uid, profileKey, dayKey } });
  return { photoUrl: await getDownloadURL(object), path };
}
