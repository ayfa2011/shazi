import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";

let adminDb = null;

export function initFirebaseAdmin() {
  if (adminDb) return adminDb;
  if (getApps().length === 0) {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!serviceAccountPath) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH env var is required.");
    }
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    initializeApp({ credential: cert(serviceAccount) });
  }
  adminDb = getFirestore();
  return adminDb;
}

export function getAdminDb() {
  if (!adminDb) throw new Error("Firebase Admin not initialized. Call initFirebaseAdmin() first.");
  return adminDb;
}
