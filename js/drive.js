import { compressImage } from "./utils.js";
import { storage } from "./firebase.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

export async function uploadProfilePhoto(file) {
  const avatar = await compressImage(file);
  if (!avatar) throw new Error("Could not read this image. Choose another photo.");
  return { avatar };
}

export async function uploadLoveChallengePhoto(file, dayKey, profileKey, uid) {
  if (!storage || !file || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !["kebyy", "shazy"].includes(profileKey)) {
    throw new Error("Choose a valid photo and try again.");
  }
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
  const knownPhotoTypes = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp", avif: "image/avif", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp" };
  const contentType = file.type?.startsWith("image/") ? file.type : knownPhotoTypes[extension];
  if (!contentType) throw new Error("Choose a photo in JPEG, PNG, HEIC, HEIF, WebP, AVIF, TIFF, GIF, or BMP format.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose a photo smaller than 12 MB.");
  const path = `couples/our-little-world/love-challenge/${dayKey}/${profileKey}-${uid}.${extension}`;
  const object = storageRef(storage, path);
  await uploadBytes(object, file, { contentType, customMetadata: { ownerUid: uid, profileKey, dayKey } });
  return { photoUrl: await getDownloadURL(object), path };
}
