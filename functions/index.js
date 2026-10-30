import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp({ databaseURL: "https://our-little-world-e9cbb-default-rtdb.firebaseio.com" });

const database = getDatabase();
const firestore = getFirestore();
const GAME_RESULT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export const pruneExpiredGameResults = onSchedule({
  schedule: "every 24 hours",
  timeZone: "UTC",
}, async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - GAME_RESULT_RETENTION_MS);
  const gameResults = firestore.collection("couples").doc("our-little-world").collection("items");
  let deletedCount = 0;

  while (true) {
    const expired = await gameResults
      .where("type", "==", "game")
      .where("createdAt", "<", cutoff)
      .orderBy("createdAt", "asc")
      .limit(450)
      .get();
    if (expired.empty) break;

    const batch = firestore.batch();
    expired.docs.forEach(document => batch.delete(document.ref));
    await batch.commit();
    deletedCount += expired.size;
    if (expired.size < 450) break;
  }

  if (deletedCount) console.info(`Deleted ${deletedCount} game results older than 90 days.`);
});
