import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";

let adminDb = null;

export function initFirebaseAdmin() {
  if (adminDb) return adminDb;
  if (getApps().length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is required.");

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(raw);
    } catch {
      // Treat as a file path
      serviceAccount = JSON.parse(fs.readFileSync(raw, "utf8"));
    }

    initializeApp({ credential: cert(serviceAccount) });
  }
  adminDb = getFirestore();
  return adminDb;
}

export function getAdminDb() {
  if (!adminDb) throw new Error("Firebase Admin not initialized. Call initFirebaseAdmin() first.");
  return adminDb;
}
