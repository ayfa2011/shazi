import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { firebaseConfig } from "../firebase/firebase-config.js";

export const firebaseReady = ["apiKey", "authDomain", "projectId", "appId", "databaseURL"].every(key =>
  typeof firebaseConfig[key] === "string" && firebaseConfig[key].length > 0 && !firebaseConfig[key].startsWith("YOUR_")
);
const app = firebaseReady ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
export const rtdb = app ? getDatabase(app) : null;
