import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { firebaseConfig } from "../firebase/firebase-config.js";

export const firebaseReady = ["apiKey", "authDomain", "projectId", "appId", "databaseURL"].every(key =>
  typeof firebaseConfig[key] === "string" && firebaseConfig[key].length > 0 && !firebaseConfig[key].startsWith("YOUR_")
);
const app = firebaseReady ? initializeApp(firebaseConfig) : null;

// Keep authentication only for this browser tab session so reopening the app
// always presents the profile picker and requires an explicit login.
export const auth = app ? getAuth(app) : null;
// Auth initialization/sign-in must wait for persistence selection. Otherwise a
// quick submit can race the asynchronous persistence change on a cold launch.
export const authPersistenceReady = auth
  ? setPersistence(auth, browserSessionPersistence).catch(error => {
      console.warn("Firebase Auth session persistence could not be set:", error);
      throw error;
    })
  : Promise.resolve();

// 3) Firestore Offline Persistence — previously fetched photos metadata,
//    post history, and couple logs stay readable offline via IndexedDB.
//    Uses multi-tab persistent cache (Firestore SDK owns its IndexedDB
//    database). Falls back gracefully when IndexedDB is unavailable
//    (private mode, storage blocked, unsupported browser).
let firestoreInstance = null;
if (app) {
  try {
    firestoreInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch (error) {
    // initializeFirestore throws if already initialized (hot reload) —
    // fall back to the default instance instead of crashing the app.
    console.warn("Firestore persistent cache init failed, using default instance:", error);
    try {
      firestoreInstance = getFirestore(app);
    } catch (fallbackError) {
      console.warn("Firestore could not be initialized:", fallbackError);
      firestoreInstance = null;
    }
  }
}
export const db = firestoreInstance;

// Realtime Database: the Web SDK has no IndexedDB persistence API
// (unlike Android/iOS). It automatically keeps in-memory cache while
// online, reconnects + resyncs on network return, and this app already
// queues drawing strokes in localStorage (`createOfflineQueue`) so no
// strokes are lost offline. Photo bytes themselves are cached in
// IndexedDB by `src/services/telegramService.js` (see olw-media-cache).
export const rtdb = app ? getDatabase(app) : null;

