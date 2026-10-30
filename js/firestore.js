import { db, firebaseReady } from "./firebase.js";
import { toastError } from "./utils.js";
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
    profile.previousNames?.some(name => name.toLocaleLowerCase() === normalized)
  )?.[0] || "";
}

export async function addItem(type, data) {
  return addDoc(root(), { type, ...data, createdAt: serverTimestamp(), clientCreatedAt: Date.now() });
}

export async function addLetter(data) {
  if (!firebaseReady) throw new Error("Connect Firebase before sending letters.");
  const reference = doc(root());
  const batch = writeBatch(db);
  const { body, ...letter } = data;
  const deliverDate = letter.status === "Scheduled" ? Timestamp.fromDate(new Date(letter.deliverDate)) : letter.deliverDate;
  batch.set(reference, { type: "letter", ...letter, deliverDate, ...(letter.status === "Sent" ? { body } : {}), createdAt: serverTimestamp() });
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

export async function markLetterRead(letterId) {
  if (!firebaseReady) throw new Error("Connect Firebase before updating the letter receipt.");
  const reference = doc(root(), letterId);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().readAt) return false;
    transaction.update(reference, { readAt: serverTimestamp() });
    return true;
  });
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

function sanitizeMemoryMediaItem(item) {
  if (!item || typeof item !== "object") return null;
  const clean = {};
  // Thumbnails are generated as Base64 data URLs in the browser. Never store
  // those in the Firestore document: a few photos can exceed Firestore's 1 MiB limit.
  const blockedKeys = new Set(["thumbnailUrl", "thumbnail", "blurThumb", "previewDataUrl", "dataUrl"]);
  for (const [key, value] of Object.entries(item)) {
    if (blockedKeys.has(key)) continue;
    if (typeof value === "string") {
      if (/^data:(image|video)\//i.test(value)) continue;
      // Avoid accidentally persisting large encoded payloads in metadata fields.
      if (value.length > 8000 && !/^https?:\/\//i.test(value)) continue;
    }
    if (value !== undefined && typeof value !== "function") clean[key] = value;
  }
  return clean.telegramFileId || clean.url ? clean : null;
}

export async function addMemoryMedia(memoryId, mediaItems) {
  if (!firebaseReady) throw new Error("Connect Firebase before adding memory media.");
  const items = Array.isArray(mediaItems) ? mediaItems.map(sanitizeMemoryMediaItem).filter(Boolean) : [];
  if (!items.length) return;
  const reference = doc(root(), memoryId);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().type !== "memory") throw new Error("This memory no longer exists.");
    const data = snapshot.data();
    // Clean older records too, so a previous oversized thumbnail does not keep
    // the document above Firestore's maximum size when new media is appended.
    const existingRaw = Array.isArray(data.mediaItems) ? data.mediaItems : [];
    const existing = existingRaw.map(sanitizeMemoryMediaItem).filter(Boolean);
    const keys = new Set(existing.map(item => item.telegramFileId || item.url).filter(Boolean));
    const additions = items.filter(item => {
      const key = item.telegramFileId || item.url;
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
    const nextMediaItems = [...existing, ...additions];
    const update = { mediaItems: nextMediaItems };
    // Remove legacy Base64 primary-media fields if present.
    if (typeof data.photoUrl === "string" && /^data:(image|video)\//i.test(data.photoUrl)) update.photoUrl = deleteField();
    if (typeof data.thumbnailUrl === "string" && /^data:(image|video)\//i.test(data.thumbnailUrl)) update.thumbnailUrl = deleteField();
    if (additions.length || existingRaw.length !== existing.length || existingRaw.some((item, index) => JSON.stringify(item) !== JSON.stringify(existing[index]))) {
      transaction.update(reference, update);
    }
    return nextMediaItems;
  });
}

export async function removeMemoryMedia(memoryId, mediaKey) {
  if (!firebaseReady) throw new Error("Connect Firebase before removing memory media.");
  if (!memoryId || typeof mediaKey !== "string" || !mediaKey) throw new Error("Memory media details are incomplete.");
  const reference = doc(root(), memoryId);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().type !== "memory") throw new Error("This memory no longer exists.");
    const data = snapshot.data();
    const mediaItems = Array.isArray(data.mediaItems) ? data.mediaItems : [];
    const nextMediaItems = mediaItems.filter(item => (item.telegramFileId || item.url) !== mediaKey);
    const isPrimaryMedia = data.telegramFileId === mediaKey || data.photoUrl === mediaKey;
    if (nextMediaItems.length !== mediaItems.length) transaction.update(reference, { mediaItems: nextMediaItems });
    else if (isPrimaryMedia) transaction.update(reference, {
      telegramFileId: deleteField(), photoUrl: deleteField(), mediaType: deleteField(), photoMimeType: deleteField()
    });
    return { mediaItems: nextMediaItems, removed: nextMediaItems.length !== mediaItems.length || isPrimaryMedia };
  });
}

export async function removeItem(id) {
  return deleteDoc(doc(root(), id));
}

// Diary posts live in their own collection, separate from generic items.
export async function updatePost(postId, data) {
  if (!firebaseReady) throw new Error("Connect Firebase before editing posts.");
  return updateDoc(doc(diaryCollection(), postId), data);
}

export async function deletePost(postId) {
  if (!firebaseReady) throw new Error("Connect Firebase before deleting posts.");
  const postRef = doc(diaryCollection(), postId);
  const snapshot = await getDoc(postRef);
  if (!snapshot.exists()) return;

  // Hide the post and block new comments before clearing its subcollection.
  if (!snapshot.data().deleting) await updateDoc(postRef, { deleting: true });
  const comments = await getDocs(commentsCollection(postId));
  for (let start = 0; start < comments.docs.length; start += 450) {
    const batch = writeBatch(db);
    comments.docs.slice(start, start + 450).forEach(comment => batch.delete(comment.ref));
    await batch.commit();
  }
  await deleteDoc(postRef);
}

// Optimized backend listener filter
export function watchItems(type, cb, onError, limitVal = null, options = {}) {
  let q = query(root(), where("type", "==", type), orderBy("createdAt", "desc"));
  if (limitVal) {
      q = query(q, limit(limitVal));
  }
  const handleSnapshot = snapshot => cb(
    snapshot.docs.map(d => ({ id: d.id, ...d.data() })),
    snapshot.metadata
  );
  return options.includeMetadataChanges
    ? onSnapshot(q, { includeMetadataChanges: true }, handleSnapshot, onError)
    : onSnapshot(q, handleSnapshot, onError);
}

export function watchRecentGameResults(cutoffDate, cb, onError) {
  const cutoff = Timestamp.fromDate(cutoffDate);
  const q = query(
    root(),
    where("type", "==", "game"),
    where("createdAt", ">=", cutoff),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, snapshot => cb(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

const couplePath = () => ["couples", APP_CONFIG.coupleId];
const notificationsRef = () => collection(db, ...couplePath(), "notifications");

export async function notifyPartner(actorKey, type, message, sourceId, route) {
  if (!firebaseReady) throw new Error("Connect Firebase before sending notifications.");
  const actor = APP_CONFIG.profiles[actorKey];
  const recipientKey = Object.keys(APP_CONFIG.profiles).find(key => key !== actorKey);
  if (!actor || !recipientKey) throw new Error("Could not identify both partners for this notification.");
  if (!["question", "challenge", "letter", "memory", "drawing", "post", "comment", "like", "bucket", "customQuestion", "specialDay", "game", "music"].includes(type)) throw new Error("Unsupported notification type.");
  if (typeof message !== "string" || !message.trim() || message.length > 240) throw new Error("Notification message is invalid.");
  if (!["home", "questions", "challenges", "letters", "memories", "drawing", "gallery", "bucket", "more", "games"].includes(route)) throw new Error("Notification route is invalid.");
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
    toastError(`Could not create the ${type} notification: ${error.message}`);
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
      })),
    onError
  );
}

export async function markNotificationsRead(notificationIds) {
  if (!firebaseReady) throw new Error("Connect Firebase before updating notifications.");
  const ids = [...new Set(notificationIds)].filter(id => typeof id === "string" && id);
  for (let offset = 0; offset < ids.length; offset += 450) {
    const batch = writeBatch(db);
    ids.slice(offset, offset + 450).forEach(id => batch.update(doc(notificationsRef(), id), { readAt: serverTimestamp() }));
    await batch.commit();
  }
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

export function watchDiaryPosts(cb, maxItems = 50, authorIds = [], onError) {
  const authors = [...new Set(authorIds.filter(authorId => typeof authorId === "string" && authorId))];
  const constraints = [];
  if (authors.length) constraints.push(where("authorId", authors.length === 1 ? "==" : "in", authors.length === 1 ? authors[0] : authors));
  constraints.push(orderBy("createdAt", "desc"));
  if (maxItems) constraints.push(limit(maxItems));
  return onSnapshot(query(diaryCollection(), ...constraints), s => {
    cb(s.docs.filter(d => !d.data().deleting).map(d => ({ id: d.id, ...d.data() })), s);
  }, onError);
}

export async function loadOlderDiaryPosts(cursor, maxItems = 50) {
  if (!cursor) return { items: [], cursor: null, hasMore: false };
  const snapshot = await getDocs(query(diaryCollection(), orderBy("createdAt", "desc"), startAfter(cursor), limit(maxItems)));
  return {
    items: snapshot.docs.filter(item => !item.data().deleting).map(item => ({ id: item.id, ...item.data() })),
    cursor: snapshot.docs.at(-1) || cursor,
    hasMore: snapshot.size === maxItems
  };
}

export async function toggleDiaryLike(postId, uid) {
  if (!firebaseReady) throw new Error("Connect Firebase before liking posts.");
  const ref = doc(diaryCollection(), postId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().deleting) throw new Error("This post is no longer available.");
    const likedBy = Array.isArray(snapshot.data().likedBy) ? snapshot.data().likedBy : [];
    const currentlyLiked = likedBy.includes(uid);
    transaction.update(ref, { likedBy: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid) });
  });
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

export function watchDiaryComments(postId, cb, onError) {
  return onSnapshot(query(commentsCollection(postId), orderBy("createdAt", "asc")), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
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

export async function deleteDrawingMessage(id) {
  return deleteDoc(doc(drawingCollection(), id));
}

export async function recordGameMatchResult({ uid, authorId, matchId, game, winnerUid, players, scores }) {
  if (!firebaseReady) throw new Error("Connect Firebase before saving game results.");
  if (!uid || !authorId || typeof matchId !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(matchId) ||
      typeof game !== "string" || !game || !Array.isArray(players) || players.length !== 2 ||
      new Set(players).size !== 2 || !players.every(player => typeof player === "string" && player)) {
    console.error("Game result details are incomplete:", { uid, authorId, matchId, game, players });
    throw new Error("Game result details are incomplete.");
  }
  if (winnerUid && !players.includes(winnerUid)) {
    console.error("Game match result error: winnerUid not in players", { winnerUid, players });
    throw new Error("Game result details are incomplete.");
  }
  if (!players.includes(uid)) {
    console.error("Game match result error: uid not in players", { uid, players });
    throw new Error("Only a match participant can save its result.");
  }
  return setItem(`game-match-${matchId}`, {
    type: "game",
    game,
    result: winnerUid ? "won" : "draw",
    winnerUid: winnerUid || "",
    players,
    scores,
    matchId,
    author: uid,
    authorId: uid,
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
    if (action === "complete" && hasCompleted) return;

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

export async function changeDailyWaterProgress(dayKey, actor, delta, baselineCount = 0) {
  if (!firebaseReady) throw new Error("Connect Firebase before tracking water.");
  if (!Number.isInteger(delta) || ![-1, 1].includes(delta)) throw new Error("Choose one glass to add or remove.");
  const trackerRef = doc(root(), `water-${dayKey}-${actor.profileKey}`);
  const assignmentRef = doc(challengeAssignments(), `${dayKey}-drink-water`);
  let nextCount = 0;
  await runTransaction(db, async transaction => {
    const [snapshot, assignmentSnapshot] = await Promise.all([
      transaction.get(trackerRef),
      transaction.get(assignmentRef)
    ]);
    if (!assignmentSnapshot.exists()) throw new Error("Today's water challenge is not ready yet. Please try again.");
    const current = snapshot.exists() ? snapshot.data() : {};
    const previousCount = Math.max(0, Math.min(8, Number(snapshot.exists() ? current.count || 0 : baselineCount || 0)));
    nextCount = Math.max(0, Math.min(8, previousCount + delta));
    transaction.set(trackerRef, {
      ...current,
      type: "waterChallenge",
      dayKey,
      profileKey: actor.profileKey,
      uid: actor.uid,
      author: actor.uid,
      name: actor.name,
      count: nextCount,
      createdAt: serverTimestamp(),
      updatedAtMs: Date.now()
    });
    if ((nextCount === 8 && previousCount < 8) || (nextCount < 8 && previousCount === 8)) {
      const assignment = assignmentSnapshot.data();
      const isActor = person => person.uid === actor.uid || person.profileKey === actor.profileKey;
      const completedBy = (assignment.completedBy || []).filter(person => !isActor(person));
      if (nextCount === 8) completedBy.push({ ...actor, note: "Reached today's 8-glass water goal.", completedAt: Date.now() });
      const acceptedBy = (assignment.acceptedBy || []).filter(person => !isActor(person));
      if (nextCount === 8) acceptedBy.push(actor);
      const skippedValues = Array.isArray(assignment.skippedBy) ? assignment.skippedBy : assignment.skippedBy ? [assignment.skippedBy] : [];
      const skippedBy = skippedValues.filter(person => !isActor(person));
      const participantCount = Math.max(1, Object.keys(APP_CONFIG.profiles).length);
      const status = completedBy.length >= participantCount ? "completed"
        : skippedBy.length >= participantCount ? "skipped"
        : acceptedBy.length || completedBy.length ? "in-progress" : "upcoming";
      transaction.update(assignmentRef, {
        completedBy,
        acceptedBy,
        skippedBy,
        status,
        completedAt: status === "completed" ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      });
    }
  });
  return nextCount;
}

export async function transitionCustomChallenge(id, actor, action, extra = {}) {
  if (!firebaseReady) throw new Error("Connect Firebase before using challenges.");
  const reference = doc(root(), id);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || snapshot.data().type !== "customChallenge") throw new Error("This challenge is no longer available.");
    const current = snapshot.data();
    if (action === "edit" || action === "delete") {
      if (current.author !== actor.uid) throw new Error("Only the person who created this challenge can change it.");
      if (current.status === "completed") throw new Error("Completed challenges are kept as history.");
      if (action === "delete") { transaction.delete(reference); return; }
      transaction.update(reference, { ...extra, updatedAtMs: Date.now() });
      return;
    }
    if (current.author === actor.uid) throw new Error("You cannot act on a challenge you created.");
    const actions = Array.isArray(current.actions) ? current.actions : [];
    const previous = actions.find(item => item.profileKey === actor.profileKey);
    if (action === "accept") {
      if (current.status !== "upcoming" && current.status !== "in-progress") throw new Error("This challenge is no longer open.");
      if (previous?.status === "accepted") return;
      const nextActions = actions.filter(item => item.profileKey !== actor.profileKey);
      nextActions.push({ ...actor, status: "accepted", updatedAtMs: Date.now() });
      transaction.update(reference, { status: "in-progress", actions: nextActions, acceptedBy: actor.uid, acceptedAtMs: Date.now() });
      return;
    }
    if (action === "complete") {
      if (current.status !== "in-progress") throw new Error("Accept this challenge before completing it.");
      transaction.update(reference, { status: "completed", note: extra.note || "", ...(extra.photoUrl !== undefined ? { photoUrl: extra.photoUrl } : {}), ...(extra.telegramFileId ? { telegramFileId: extra.telegramFileId, telegramFileUniqueId: extra.telegramFileUniqueId || "", telegramMessageId: extra.telegramMessageId || null, telegramChatId: extra.telegramChatId || null, photoMimeType: extra.photoMimeType || "image/jpeg" } : {}), completedBy: actor.uid, completedByKey: actor.profileKey, completedAtMs: Date.now(), actions: [...actions.filter(item => item.profileKey !== actor.profileKey), { ...actor, status: "completed", updatedAtMs: Date.now() }] });
    }
  });
}

export function watchChallengeAssignments(callback, onError, sinceDayKey = "", limitVal = 100) {
  if (!firebaseReady) throw new Error("Connect Firebase before using challenges.");
  const constraints = [];
  if (sinceDayKey) constraints.push(where("challengeDate", ">=", sinceDayKey));
  constraints.push(orderBy("challengeDate", "desc"));
  let q = query(challengeAssignments(), ...constraints);
  if (limitVal) {
      q = query(q, limit(limitVal));
  }
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
}
