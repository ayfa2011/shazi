import { APP_CONFIG } from "../config/app-config.js";
import { compressImage } from "./utils.js";

async function getDriveToken() {
  if (!APP_CONFIG.googleDriveClientId) throw new Error("Google Drive is not configured.");

  if (!window.google?.accounts?.oauth2) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load Google sign-in."));
      document.head.appendChild(script);
    });
  }

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: APP_CONFIG.googleDriveClientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: response => response.access_token
        ? resolve(response.access_token)
        : reject(new Error("Google Drive permission was not granted.")),
      error_callback: () => reject(new Error("Google Drive sign-in was cancelled."))
    });
    client.requestAccessToken();
  });
}

export async function uploadProfilePhoto(file, profileName) {
  const imageData = await compressImage(file);
  if (!imageData) throw new Error("Could not read this image. Choose another photo.");

  const response = await fetch(imageData);
  const blob = await response.blob();
  const token = await getDriveToken();
  const metadata = {
    name: `Profile - ${profileName} - ${new Date().toISOString()}.jpg`,
    mimeType: "image/jpeg",
    ...(APP_CONFIG.googleDriveFolderId ? { parents: [APP_CONFIG.googleDriveFolderId] } : {})
  };
  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  body.append("file", blob, "profile.jpg");

  const upload = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body
  });
  if (!upload.ok) {
    const details = await upload.text();
    throw new Error(`Google Drive upload failed (${upload.status}): ${details}`);
  }

  const savedFile = await upload.json();
  return {
    driveFileId: savedFile.id,
    avatar: `https://drive.google.com/thumbnail?id=${encodeURIComponent(savedFile.id)}&sz=w512`
  };
}
