import { db, firebaseReady } from "./firebase.js";
import { collection, doc, addDoc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, query, where, orderBy, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, runTransaction } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { APP_CONFIG } from "../config/app-config.js";

const root = () => {
  if (!firebaseReady) throw new Error("Connect Firebase before using saved features.");
  return collection(db, "couples", APP_CONFIG.coupleId, "items");
};

export async function addItem(type, data) {
  return addDoc(root(), { type, ...data, createdAt: serverTimestamp() });
}

export async function setItem(id, data, customCollection = null) {
  if (customCollection) {
    return setDoc(doc(db, "couples", APP_CONFIG.coupleId, customCollection, id), data, { merge: true });
  }
  return setDoc(doc(root(), id), data, { merge: true });
}

export async function removeItem(id) {
  return deleteDoc(doc(root(), id));
}

// Optimized with backend type query filter
export async function listItems(type) {
  const q = query(root(), where("type", "==", type), orderBy("createdAt", "desc"));
  const s = await getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Optimized backend listener filter
export function watchItems(type, cb) {
  const q = query(root(), where("type", "==", type), orderBy("createdAt", "desc"));
  return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

const couplePath = () => ["couples", APP_CONFIG.coupleId];

const profilesRef = () => doc(db, ...couplePath(), "settings", "profiles");

export async function getCoupleProfiles() {
  const snapshot = await getDoc(profilesRef());
  return snapshot.exists() ? snapshot.data() : {};
}

export function watchCoupleProfiles(cb, onError) {
  return onSnapshot(profilesRef(), snapshot => cb(snapshot.exists() ? snapshot.data() : {}), onError);
}

export async function saveCoupleProfile(profileKey, profileData) {
  await setDoc(profilesRef(), { [profileKey]: profileData, updatedAt: serverTimestamp() }, { merge: true });
}

const diaryCollection = () => {
  if (!firebaseReady) throw new Error("Connect Firebase before using the diary.");
  return collection(db, ...couplePath(), "diaryPosts");
};

export async function saveRelationshipStartDate(date) {
  const ref = doc(db, ...couplePath(), "settings", "relationship");
  await setDoc(ref, { startDate: date, updatedAt: serverTimestamp() }, { merge: true });
}

export function watchRelationshipStartDate(cb) {
  const ref = doc(db, ...couplePath(), "settings", "relationship");
  return onSnapshot(ref, s => cb(s.exists() ? s.data().startDate || "" : ""));
}

export async function addDiaryPost(data) {
  return addDoc(diaryCollection(), { ...data, createdAt: serverTimestamp(), likedBy: [] });
}

export async function updateDiaryPost(postId, data) {
  return updateDoc(doc(diaryCollection(), postId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteDiaryPost(postId) {
  return deleteDoc(doc(diaryCollection(), postId));
}

export function watchDiaryPosts(cb) {
  return onSnapshot(query(diaryCollection(), orderBy("createdAt", "desc")), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function toggleDiaryLike(postId, uid, liked) {
  const ref = doc(diaryCollection(), postId);
  await updateDoc(ref, { likedBy: liked ? arrayRemove(uid) : arrayUnion(uid) });
}

const commentsCollection = postId => collection(diaryCollection(), postId, "comments");

export async function addDiaryComment(postId, data) {
  return addDoc(commentsCollection(postId), { ...data, createdAt: serverTimestamp() });
}

export function watchDiaryComments(postId, cb) {
  return onSnapshot(query(commentsCollection(postId), orderBy("createdAt", "asc")), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

const drawingCollection = () => collection(db, ...couplePath(), "drawingMessages");

export async function addDrawingMessage(data) {
  return addDoc(drawingCollection(), { ...data, createdAt: serverTimestamp() });
}

export function watchDrawingMessages(cb) {
  return onSnapshot(
    query(drawingCollection(), orderBy("createdAt", "desc")),
    s => {
      cb(s.docs.map(d => ({ id: d.id, ...d.data() })));
    }
  );
}

export async function getDrawingsFolder() {
  const s = await getDoc(doc(db, ...couplePath(), "settings", "drawings"));
  return s.exists() ? s.data().folderId || "" : "";
}

export async function saveDrawingsFolder(folderId) {
  await setDoc(doc(db, ...couplePath(), "settings", "drawings"), { folderId, updatedAt: serverTimestamp() }, { merge: true });
}

const challengeAssignments = () => collection(db, ...couplePath(), "challengeAssignments");

export async function ensureChallengeAssignment(challenge) {
  if (!firebaseReady) throw new Error("Connect Firebase before using challenges.");
  const reference = doc(challengeAssignments(), challenge.id);
  const record = {
    title: challenge.title,
    description: challenge.description,
    challengeDate: challenge.dayKey,
    status: "upcoming",
    acceptedBy: [],
    completedBy: []
  };
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists()) return { id: snapshot.id, ...snapshot.data() };
    transaction.set(reference, record);
    return { id: challenge.id, ...record };
  });
}

async function transitionChallengeAssignment(challengeId, allowedStates, status, actor, extra = {}) {
  if (!firebaseReady) throw new Error("Connect Firebase before using challenges.");
  const reference = doc(challengeAssignments(), challengeId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("This challenge is no longer available.");
    const current = snapshot.data();
    if (!allowedStates.includes(current.status || "upcoming")) {
      throw new Error("This challenge has already changed state.");
    }
    transaction.update(reference, {
      status,
      updatedAt: serverTimestamp(),
      ...(status === "in-progress" ? { acceptedBy: arrayUnion(actor) } : {}),
      ...(status === "skipped" ? { skippedBy: actor, skippedAt: serverTimestamp() } : {}),
      ...(status === "completed" ? {
        completedBy: arrayUnion(actor),
        completedAt: serverTimestamp(),
        ...extra
      } : {})
    });
  });
}

export async function acceptChallengeAssignment(challengeId, uid, name) {
  await transitionChallengeAssignment(challengeId, ["upcoming"], "in-progress", { uid, name });
}

export async function skipChallengeAssignment(challengeId, uid, name) {
  await transitionChallengeAssignment(challengeId, ["upcoming", "in-progress"], "skipped", { uid, name });
}

export async function completeChallengeAssignment(challengeId, actor, note, photoUrl) {
  await transitionChallengeAssignment(challengeId, ["in-progress"], "completed", {
    uid: actor.uid,
    profileKey: actor.profileKey,
    name: actor.name
  }, {
    ...(note ? { note } : {}),
    ...(photoUrl ? { photoUrl } : {})
  });
}

export function watchChallengeAssignments(callback, onError) {
  if (!firebaseReady) throw new Error("Connect Firebase before using challenges.");
  return onSnapshot(query(challengeAssignments(), orderBy("challengeDate", "desc")), snapshot => {
    callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
}