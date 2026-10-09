import { db, firebaseReady } from "./firebase.js";
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, where, writeBatch } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { QUESTION_BANK_VERSION, QUESTION_CATEGORIES } from "./question-bank.js";
import { todayKey } from "./utils.js";
import { notifyPartnerSafely } from "./firestore.js";

const coupleId = APP_CONFIG.coupleId;
const bankRef = () => collection(db, "coupleQuestionBank", coupleId, "questions");
const bankMetaRef = () => doc(db, "coupleQuestionBank", coupleId, "meta", QUESTION_BANK_VERSION);
const dailyCollection = () => collection(db, "coupleDailyQuestions", coupleId, "days");
const dailyRef = dayKey => doc(dailyCollection(), dayKey);
const participantsRef = dayKey => collection(dailyRef(dayKey), "participants");
const participantRef = (dayKey, profileKey) => doc(participantsRef(dayKey), profileKey);
const answersRef = dayKey => collection(db, "coupleDailyQuestions", coupleId, "days", dayKey, "answers");
const answerRef = (dayKey, profileKey) => doc(answersRef(dayKey), profileKey);
const legacyAnswersRef = () => collection(db, "couples", coupleId, "items");

function requireFirebase() {
  if (!firebaseReady) throw new Error("Connect Firebase before using Today's Question.");
}

function dayNumber(dayKey) {
  return Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86400000);
}

function chooseCategory(dayKey) {
  const index = ((dayNumber(dayKey) % QUESTION_CATEGORIES.length) + QUESTION_CATEGORIES.length) % QUESTION_CATEGORIES.length;
  return QUESTION_CATEGORIES[index];
}

async function chooseQuestion(dayKey) {
  const category = chooseCategory(dayKey);
  const snapshot = await getDocs(query(bankRef(), where("categoryId", "==", category.id)));
  const questions = snapshot.docs.sort((a, b) => a.data().position - b.data().position);
  if (!questions.length) throw new Error(`No Firestore questions found in the ${category.label} category.`);
  const questionIndex = Math.floor(dayNumber(dayKey) / QUESTION_CATEGORIES.length) % questions.length;
  const selected = questions[questionIndex];
  const data = selected.data();
  return {
    id: selected.id,
    categoryId: data.categoryId,
    category: data.category,
    question: data.question
  };
}

function hashQuestion(question) {
  let hash = 2166136261;
  for (let index = 0; index < question.length; index++) {
    hash = Math.imul(hash ^ question.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(36);
}

export async function ensureQuestionBank() {
  requireFirebase();
  if ((await getDoc(bankMetaRef())).exists()) return;

  const batch = writeBatch(db);
  let count = 0;
  for (const category of QUESTION_CATEGORIES) {
    category.questions.forEach((question, index) => {
      batch.set(doc(bankRef(), question.id), {
        categoryId: category.id,
        category: `${category.emoji} ${category.label}`,
        question: question.text,
        position: index + 1
      });
      count++;
    });
  }
  batch.set(bankMetaRef(), {
    version: QUESTION_BANK_VERSION,
    questionCount: count,
    seededAt: serverTimestamp()
  });
  await batch.commit();
}

export async function ensureDailyQuestion(dayKey = todayKey()) {
  requireFirebase();
  await ensureQuestionBank();
  const reference = dailyRef(dayKey);
  const existing = await getDoc(reference);
  if (existing.exists()) return { id: existing.id, ...existing.data() };
  const selected = await chooseQuestion(dayKey);
  return runTransaction(db, async transaction => {
    const latest = await transaction.get(reference);
    if (latest.exists()) return { id: latest.id, ...latest.data() };
    const record = { ...selected, dayKey, createdAt: serverTimestamp() };
    transaction.set(reference, record);
    return { id: dayKey, ...record };
  });
}

export function watchQuestionParticipants(dayKey, callback, onError) {
  requireFirebase();
  return onSnapshot(participantsRef(dayKey), snapshot => {
    callback(Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()])));
  }, onError);
}

export async function getQuestionParticipants(dayKey) {
  requireFirebase();
  const snapshot = await getDocs(participantsRef(dayKey));
  return Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()]));
}

export async function getQuestionAnswer(dayKey, profileKey) {
  requireFirebase();
  const snapshot = await getDoc(answerRef(dayKey, profileKey));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function submitQuestionAnswer(dayKey, profileKey, answer) {
  requireFirebase();
  const batch = writeBatch(db);
  const answerDocument = answerRef(dayKey, profileKey);
  batch.set(answerDocument, { profileKey, answer, answeredAt: serverTimestamp() });
  batch.set(participantRef(dayKey, profileKey), { profileKey, answeredAt: serverTimestamp() });
  await batch.commit();
  const name = APP_CONFIG.profiles[profileKey]?.name || "Your partner";
  void notifyPartnerSafely(profileKey, "question", `${name} answered today's question.`, dayKey, "questions");
}

export async function migrateLegacyQuestionAnswers(user, profileKey) {
  requireFirebase();
  const legacyQuery = query(legacyAnswersRef(), where("author", "==", user.uid));
  const snapshot = await getDocs(legacyQuery);
  const uniqueAnswers = new Map();
  for (const legacyDoc of snapshot.docs) {
    const item = legacyDoc.data();
    if (item.type !== "answer" || typeof item.answer !== "string" || !item.answer.trim()) continue;
    if (item.answer.length > 1200 || !/^\d{4}-\d{2}-\d{2}$/.test(item.questionDate || "")) {
      console.warn(`Skipping unsupported legacy question answer ${legacyDoc.id}.`);
      continue;
    }
    const key = `${item.questionDate}\u0000${item.question || ""}`;
    if (!uniqueAnswers.has(key)) uniqueAnswers.set(key, item);
  }

  for (const item of uniqueAnswers.values()) {
    const dayKey = item.questionDate;
    const questionText = typeof item.question === "string" ? item.question.trim() : "";
    if (!questionText) continue;
    const legacyQuestionId = `legacy-${hashQuestion(questionText)}`;
    const dayDocumentId = `legacy-${dayKey}-${hashQuestion(questionText)}`;
    await setDoc(doc(bankRef(), legacyQuestionId), {
      categoryId: "legacy",
      category: "Legacy question",
      question: questionText,
      position: 0
    }, { merge: true });
    const existingAnswer = await getDoc(answerRef(dayDocumentId, profileKey));
    if (existingAnswer.exists()) continue;
    const legacyDailyRef = dailyRef(dayDocumentId);
    await runTransaction(db, async transaction => {
      const existing = await transaction.get(legacyDailyRef);
      if (!existing.exists()) {
        transaction.set(legacyDailyRef, {
          id: legacyQuestionId,
          categoryId: "about-us",
          category: "💗 About Us",
          question: questionText,
          dayKey,
          createdAt: serverTimestamp()
        });
      } else if (existing.data().question !== questionText) {
        throw new Error("A historical question ID matched different question text.");
      }
    });

    const batch = writeBatch(db);
    const answeredAt = item.createdAt?.toDate ? item.createdAt : serverTimestamp();
    batch.set(answerRef(dayDocumentId, profileKey), { profileKey, answer: item.answer.trim(), answeredAt });
    batch.set(participantRef(dayDocumentId, profileKey), { profileKey, answeredAt });
    try {
      await batch.commit();
    } catch (error) {
      const answerAfterRace = await getDoc(answerRef(dayDocumentId, profileKey));
      if (!answerAfterRace.exists()) throw error;
    }
  }
}

export async function getQuestionHistory() {
  requireFirebase();
  const snapshot = await getDocs(query(dailyCollection(), orderBy("dayKey", "desc")));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
