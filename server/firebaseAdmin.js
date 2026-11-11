import admin from "firebase-admin";
import fs from "fs";

export function initFirebaseAdmin() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!serviceAccountPath) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH env var is required.");
  }

  // ES Module ನಲ್ಲಿ JSON ಫೈಲ್ ಓದಲು fs.readFileSync ಮತ್ತು JSON.parse ಬಳಸಬೇಕು
  const serviceAccount = JSON.parse(
    fs.readFileSync(new URL(serviceAccountPath, import.meta.url), "utf8")
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  return admin;
}