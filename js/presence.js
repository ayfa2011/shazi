import { rtdb } from "./firebase.js";
import { ref, set, onDisconnect, onValue } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { APP_CONFIG } from "../config/app-config.js";

const presenceRef = (uid) => ref(rtdb, `couples/${APP_CONFIG.coupleId}/presence/${uid}`);

export function initPresence(uid, name) {
    const pRef = presenceRef(uid);
    set(pRef, { name, online: true });
    onDisconnect(pRef).set({ name, online: false });
}

export function watchAllPresence(callback) {
    const allPresenceRef = ref(rtdb, `couples/${APP_CONFIG.coupleId}/presence`);
    return onValue(allPresenceRef, (snapshot) => {
        callback(snapshot.val() || {});
    });
}
