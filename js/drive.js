import { compressImage } from "./utils.js";

export async function uploadProfilePhoto(file) {
  const avatar = await compressImage(file);
  if (!avatar) throw new Error("Could not read this image. Choose another photo.");
  return { avatar };
}
