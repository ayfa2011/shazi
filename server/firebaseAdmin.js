import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let adminDb = null;

export function initFirebaseAdmin() {
  if (adminDb) return adminDb;
  if (getApps().length === 0) {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!serviceAccountPath) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH env var is required.");
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const serviceAccount = require(serviceAccountPath);
    initializeApp({ credential: cert(serviceAccount) });
  }
  adminDb = getFirestore();
  return adminDb;
}

export function getAdminDb() {
  if (!adminDb) throw new Error("Firebase Admin not initialized. Call initFirebaseAdmin() first.");
  return adminDb;
}
