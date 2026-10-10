import { db, firebaseReady } from "./firebase.js";
import { collection, doc, addDoc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, query, where, orderBy, limit, startAfter, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, runTransaction, writeBatch, deleteField, Timestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { APP_CONFIG } from "../config/app-config.js";

const root = () => {
  if (!firebaseReady) throw new Error("Connect Firebase before using saved features.");
  return collection(db, "couples", APP_CONFIG.coupleId, "items");
};

function recipientProfileKey(recipient) {
  const normalized = String(recipient || "").trim().toLocaleLowerCase();
  return Object.entries(APP_CONFIG.profiles).find(([key, profile]) =>
    key.toLocaleLowerCase() === normalized ||
    profile.name.toLocaleLowerCase() === normalized ||
    profile.previousNames?.some(name => name.toLocaleLowerCase() === normalized) ||
    (key === "kebyy" && normalized === "kebyy")
  )?.[0] || "";
}

export async function addItem(type, data) {
  return addDoc(root(), { type, ...data, createdAt: serverTimestamp() });
}

export async function addLetter(data) {
  if (!firebaseReady) throw new Error("Connect Firebase before sending letters.");
  const reference = doc(root());
  const batch = writeBatch(db);
  const { body, ...letter } = data;
  batch.set(reference, { type: "letter", ...letter, ...(letter.status === "Sent" ? { body } : {}), createdAt: serverTimestamp() });
  if (letter.status === "Scheduled") {
    batch.set(doc(db, ...couplePath(), "scheduledLetterContents", reference.id), {
      author: letter.author,
      recipient: recipientProfileKey(letter.recipient),
      deliverDate: Timestamp.fromDate(new Date(letter.deliverDate)),
      body
    });
  }
  await batch.commit();
  return reference;
}

export async function getScheduledLetterBody(letterId) {
  if (!firebaseReady) throw new Error("Connect Firebase before opening letters.");
  const snapshot = await getDoc(doc(db, ...couplePath(), "scheduledLetterContents", letterId));
  if (!snapshot.exists()) throw new Error("The scheduled letter content is unavailable.");
  return snapshot.data().body || "";
}

export async function migrateScheduledLetterBody(letter) {
  if (!firebaseReady) throw new Error("Connect Firebase before migrating letters.");
  if (!letter?.id || !letter.body) return;
  const batch = writeBatch(db);
  batch.set(doc(db, ...couplePath(), "scheduledLetterContents", letter.id), {
    author: letter.author,
    recipient: recipientProfileKey(letter.recipient),
    deliverDate: Timestamp.fromDate(new Date(letter.deliverDate)),
    body: letter.body
  });
  batch.update(doc(root(), letter.id), { body: deleteField() });
  await batch.commit();
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

export async function listItemsPaginated(type, limitVal = 20, lastVisible = null) {
  let q = query(root(), where("type", "==", type), orderBy("createdAt", "desc"), limit(limitVal));
  if (lastVisible) {
      q = query(root(), where("type", "==", type), orderBy("createdAt", "desc"), startAfter(lastVisible), limit(limitVal));
  }
  const s = await getDocs(q);
  return {
    items: s.docs.map(d => ({ id: d.id, ...d.data() })),
    lastVisible: s.docs[s.docs.length - 1] || null
  };
}

// Optimized backend listener filter
export function watchItems(type, cb, onError, limitVal = null) {
  let q = query(root(), where("type", "==", type), orderBy("createdAt", "desc"));
  if (limitVal) {
      q = query(q, limit(limitVal));
  }
  return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

const couplePath = () => ["couples", APP_CONFIG.coupleId];
const notificationsRef = () => collection(db, ...couplePath(), "notifications");

export async function notifyPartner(actorKey, type, message, sourceId, route) {
  if (!firebaseReady) throw new Error("Connect Firebase before sending notifications.");
  const actor = APP_CONFIG.profiles[actorKey];
  const recipientKey = Object.keys(APP_CONFIG.profiles).find(key => key !== actorKey);
  if (!actor || !recipientKey) throw new Error("Could not identify both partners for this notification.");
  if (!["question", "challenge", "letter", "memory"].includes(type)) throw new Error("Unsupported notification type.");
  if (typeof message !== "string" || !message.trim() || message.length > 240) throw new Error("Notification message is invalid.");
  if (!["home", "questions", "challenges", "letters", "memories"].includes(route)) throw new Error("Notification route is invalid.");
  const safeSourceId = String(sourceId || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100);
  if (!safeSourceId) throw new Error("Notification source is missing.");

  const notificationId = `${type}-${safeSourceId}-${recipientKey}`;
  const reference = doc(notificationsRef(), notificationId);
  return runTransaction(db, async transaction => {
    if ((await transaction.get(reference)).exists()) return false;
    transaction.set(reference, {
      recipientKey,
      actorKey,
      type,
      title: actor.name,
      message: message.trim(),
      route,
      sourceId: safeSourceId,
      createdAt: serverTimestamp(),
      readAt: null
    });
    return true;
  });
}

export async function notifyPartnerSafely(actorKey, type, message, sourceId, route) {
  try {
    return await notifyPartner(actorKey, type, message, sourceId, route);
  } catch (error) {
    console.error(`Could not create the ${type} notification:`, error);
    return false;
  }
}

export function watchNotifications(recipientKey, callback, onError) {
  if (!firebaseReady) throw new Error("Connect Firebase before loading notifications.");
  if (!Object.hasOwn(APP_CONFIG.profiles, recipientKey)) throw new Error("Could not identify the notification recipient.");
  return onSnapshot(
    query(notificationsRef(), where("recipientKey", "==", recipientKey)),
    snapshot => callback(snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => {
        const timestamp = value => value?.toMillis?.() || Date.parse(value || "") || 0;
        return timestamp(b.createdAt) - timestamp(a.createdAt);
      })
      .slice(0, 50)),
    onError
  );
}

export async function markNotificationsRead(notificationIds) {
  if (!firebaseReady) throw new Error("Connect Firebase before updating notifications.");
  const ids = [...new Set(notificationIds)].filter(id => typeof id === "string" && id);
  if (ids.length > 50) throw new Error("Too many notifications to update at once.");
  if (!ids.length) return;
  const batch = writeBatch(db);
  ids.forEach(id => batch.update(doc(notificationsRef(), id), { readAt: serverTimestamp() }));
  await batch.commit();
}

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
  const postReference = doc(diaryCollection(), postId);
  await updateDoc(postReference, { deleting: true });
  try {
    const comments = commentsCollection(postId);
    while (true) {
      const snapshot = await getDocs(query(comments, limit(10)));
      if (snapshot.empty) break;
      const batch = writeBatch(db);
      snapshot.docs.forEach(comment => batch.delete(comment.ref));
      await batch.commit();
    }
    await deleteDoc(postReference);
  } catch (error) {
    try {
      await updateDoc(postReference, { deleting: deleteField() });
    } catch (restoreError) {
      console.error("Could not restore the post after comment cleanup failed:", restoreError);
    }
    throw error;
  }
}

export function watchDiaryPosts(cb, maxItems, authorIds = []) {
  const authors = [...new Set(authorIds.filter(authorId => typeof authorId === "string" && authorId))];
  const constraints = [];
  if (authors.length) constraints.push(where("authorId", authors.length === 1 ? "==" : "in", authors.length === 1 ? authors[0] : authors));
  constraints.push(orderBy("createdAt", "desc"));
  if (maxItems) constraints.push(limit(maxItems));
  return onSnapshot(query(diaryCollection(), ...constraints), s => {
    cb(s.docs.filter(d => !d.data().deleting).map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function toggleDiaryLike(postId, uid, liked) {
  const ref = doc(diaryCollection(), postId);
  await updateDoc(ref, { likedBy: liked ? arrayRemove(uid) : arrayUnion(uid) });
}

const commentsCollection = postId => collection(diaryCollection(), postId, "comments");

export async function addDiaryComment(postId, data) {
  return addDoc(commentsCollection(postId), { ...data, createdAt: serverTimestamp(), likedBy: [] });
}

export async function updateDiaryComment(postId, commentId, data) {
  return updateDoc(doc(commentsCollection(postId), commentId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteDiaryComment(postId, commentId) {
  return deleteDoc(doc(commentsCollection(postId), commentId));
}

export async function toggleDiaryCommentLike(postId, commentId, uid, liked) {
  const ref = doc(commentsCollection(postId), commentId);
  await updateDoc(ref, { likedBy: liked ? arrayRemove(uid) : arrayUnion(uid) });
}

export function watchDiaryComments(postId, cb) {
  return onSnapshot(query(commentsCollection(postId), orderBy("createdAt", "asc")), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

const drawingCollection = () => collection(db, ...couplePath(), "drawingMessages");

export async function addDrawingMessage(data) {
  return addDoc(drawingCollection(), { ...data, createdAt: serverTimestamp() });
}

export function watchDrawingMessages(cb, maxItems) {
  const constraints = [orderBy("createdAt", "desc")];
  if (maxItems) constraints.push(limit(maxItems));
  return onSnapshot(
    query(drawingCollection(), ...constraints),
    s => {
      cb(s.docs.map(d => ({ id: d.id, ...d.data() })));
    }
  );
}

export async function recordDailyGameWin(uid, dayKey) {
  if (!firebaseReady) throw new Error("Connect Firebase before saving game scores.");
  const reference = doc(root(), `game-${dayKey}-${uid}`);
  return runTransaction(db, async transaction => {
    const existing = await transaction.get(reference);
    if (existing.exists()) return false;
    transaction.set(reference, {
      type: "game",
      game: "Today's Hidden Heart",
      result: "won",
      author: uid,
      gameDay: dayKey,
      createdAt: serverTimestamp()
    });
    return true;
  });
}

export async function recordGameMatchResult({ uid, authorId, matchId, game, winnerUid, players, scores }) {
  if (!firebaseReady) throw new Error("Connect Firebase before saving game results.");
  if (!uid || !authorId || typeof matchId !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(matchId) ||
      typeof game !== "string" || !game || !Array.isArray(players) || players.length !== 2 ||
      new Set(players).size !== 2 || !players.every(player => typeof player === "string" && player) ||
      (winnerUid && !players.includes(winnerUid))) {
    throw new Error("Game result details are incomplete.");
  }
  if (!players.includes(uid)) throw new Error("Only a match participant can save its result.");
  return setItem(`game-match-${matchId}-${uid}`, {
    type: "game",
    game,
    result: winnerUid ? "won" : "draw",
    winnerUid: winnerUid || "",
    players,
    scores,
    matchId,
    author: uid,
    authorId,
    createdAt: serverTimestamp()
  });
}

const challengeAssignments = () => collection(db, ...couplePath(), "challengeAssignments");

export async function ensureChallengeAssignment(challenge) {
  if (!firebaseReady) throw new Error("Connect Firebase before using challenges.");
  const reference = doc(challengeAssignments(), challenge.id);
  const record = {
    title: challenge.title,
    description: challenge.description,
    challengeDate: challenge.dayKey,
    challengeId: challenge.challengeId,
    status: "upcoming",
    acceptedBy: [],
    skippedBy: [],
    completedBy: []
  };
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists()) return { id: snapshot.id, ...snapshot.data() };
    transaction.set(reference, record);
    return { id: challenge.id, ...record };
  });
}

async function transitionChallengeAssignment(challengeId, action, actor, extra = {}) {
  if (!firebaseReady) throw new Error("Connect Firebase before using challenges.");
  const reference = doc(challengeAssignments(), challengeId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("This challenge is no longer available.");
    const current = snapshot.data();
    const acceptedBy = current.acceptedBy || [];
    const skippedBy = Array.isArray(current.skippedBy)
      ? current.skippedBy
      : current.skippedBy ? [current.skippedBy] : [];
    const completedBy = current.completedBy || [];
    const isActor = person => person.uid === actor.uid
      || (actor.profileKey && person.profileKey === actor.profileKey);
    const participantCount = Math.max(1, Object.keys(APP_CONFIG.profiles).length);
    const hasCompleted = completedBy.some(isActor);
    if (current.status === "skipped" && skippedBy.length === 0) {
      throw new Error("This challenge has already been skipped.");
    }
    if (completedBy.length >= participantCount) {
      throw new Error("Both partners have already completed this challenge.");
    }
    if (skippedBy.length >= participantCount) {
      throw new Error("Both partners have already skipped this challenge.");
    }
    if (action === "complete" && hasCompleted) {
      throw new Error("You have already recorded your completion.");
    }

    const nextAccepted = acceptedBy.filter(person => !isActor(person));
    const nextSkipped = skippedBy.filter(person => !isActor(person));
    const nextCompleted = completedBy.filter(person => !isActor(person));
    if (action === "accept") nextAccepted.push(actor);
    if (action === "skip") nextSkipped.push(actor);
    if (action === "complete") {
      nextAccepted.push(actor);
      nextCompleted.push({
        ...actor,
        ...extra,
        completedAt: Date.now()
      });
    }

    const status = nextCompleted.length >= participantCount
      ? "completed"
      : nextSkipped.length >= participantCount
        ? "skipped"
        : nextAccepted.length || nextCompleted.length
          ? "in-progress"
          : "upcoming";
    transaction.update(reference, {
      status,
      updatedAt: serverTimestamp(),
      acceptedBy: nextAccepted,
      skippedBy: nextSkipped,
      completedBy: nextCompleted,
      ...(status === "completed" ? {
        completedAt: serverTimestamp(),
      } : { completedAt: null })
    });
  });
}

export async function acceptChallengeAssignment(challengeId, uid, profileKey, name) {
  await transitionChallengeAssignment(challengeId, "accept", { uid, profileKey, name });
}

export async function skipChallengeAssignment(challengeId, uid, profileKey, name) {
  await transitionChallengeAssignment(challengeId, "skip", { uid, profileKey, name });
}

export async function completeChallengeAssignment(challengeId, actor, note, photoUrl) {
  await transitionChallengeAssignment(challengeId, "complete", actor, {
    ...(note ? { note } : {}),
    ...(photoUrl ? { photoUrl } : {})
  });
}

export function watchChallengeAssignments(callback, onError, limitVal = null) {
  if (!firebaseReady) throw new Error("Connect Firebase before using challenges.");
  let q = query(challengeAssignments(), orderBy("challengeDate", "desc"));
  if (limitVal) {
      q = query(q, limit(limitVal));
  }
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
}