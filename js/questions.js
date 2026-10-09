import { $, esc, toast, todayKey, scheduleDubaiDayRollover } from "./utils.js";
import { APP_CONFIG } from "../config/app-config.js";
import { getProfileKey } from "./profile-data.js";
import {
  ensureDailyQuestion,
  getQuestionAnswer,
  getQuestionHistory,
  getQuestionParticipants,
  migrateLegacyQuestionAnswers,
  submitQuestionAnswer,
  watchQuestionParticipants
} from "./question-service.js";

let stopParticipants = null, dayRolloverTimer = null, questionRenderToken = 0;
const legacyMigrationPromises = new Map();

function timestamp(value) {
  if (value?.toDate) return value.toDate().getTime();
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function migrateLegacyAnswersOnce(user, profileKey, isCurrent) {
  const marker = `question-legacy-migrated-v1-${user.uid}`;
  try {
    if (localStorage.getItem(marker) === "true") return null;
  } catch (error) {
    console.error("Legacy question migration status could not be read:", error);
    if (isCurrent()) toast("Legacy question history could not be checked.");
    return null;
  }
  if (legacyMigrationPromises.has(user.uid)) return legacyMigrationPromises.get(user.uid);

  const migration = migrateLegacyQuestionAnswers(user, profileKey)
    .then(results => {
      if (results.failed > 0) {
        console.warn(`Legacy migration completed with ${results.failed} errors.`);
        return false;
      }
      localStorage.setItem(marker, "true");
      return true;
    })
    .catch(error => {
      console.error("Legacy question answers could not be migrated:", error);
      if (isCurrent()) toast("Legacy question history could not be migrated.");
      return false;
    })
    .finally(() => legacyMigrationPromises.delete(user.uid));
  legacyMigrationPromises.set(user.uid, migration);
  return migration;
}

export function renderQuestions(el, user, profile) {
  disposeQuestions();
  const renderToken = questionRenderToken;
  const isCurrent = () => renderToken === questionRenderToken && el.isConnected;
  const ownKey = getProfileKey(profile);
  clearTimeout(dayRolloverTimer);
  dayRolloverTimer = scheduleDubaiDayRollover(() => {
    if (isCurrent()) window.App?.navigate("questions");
  });
  const partnerKey = Object.keys(APP_CONFIG.profiles).find(key => key !== ownKey) || "";
  const dayKey = todayKey();
  let question = null, participants = {}, ownAnswer = null, partnerAnswer = null, history = [], loadToken = 0;

  el.innerHTML = `
    <style>
      .question-page { width:min(700px,100%); margin:0 auto; }
      .question-card,.question-history-card { padding:16px; border:1px solid #f1dbe5; border-radius:18px; background:#fff; }
      .question-page-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
      .question-page-header h1 { margin:0; color:var(--deep); font-size:25px; }
      .question-category { display:inline-flex; padding:5px 10px; border-radius:999px; background:#fff0f6; color:var(--deep); font-size:12px; font-weight:700; }
      .question-day { color:var(--muted); font-size:11px; }
      .question-prompt { margin:14px 0; padding:16px; border-radius:15px; background:linear-gradient(120deg,#fff0f6,#fff9fb); color:#60283f; font-size:18px; font-weight:700; line-height:1.45; }
      .question-answer-form { display:grid; gap:9px; margin:10px 0; }
      .question-answer-form textarea { width:100%; min-height:86px; resize:vertical; border-color:#f0ccda; }
      .question-submit { justify-self:end; padding:9px 16px; border-radius:999px; }
      .question-status { min-height:20px; margin:8px 0; color:var(--muted); font-size:12px; }
      .question-answers { display:grid; gap:9px; margin-top:14px; }
      .question-answer { display:flex; align-items:flex-start; gap:10px; padding:11px; border:1px solid #f4e4eb; border-radius:14px; background:#fffafd; }
      .question-answer-avatar { flex:none; width:36px; height:36px; display:grid; place-items:center; overflow:hidden; border-radius:50%; background:#ffe5ef; color:var(--deep); font-weight:700; }
      .question-answer-avatar img { width:100%; height:100%; object-fit:cover; }
      .question-answer-body { min-width:0; flex:1; }
      .question-answer-body header { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
      .question-answer-body strong { color:#60283f; font-size:13px; }
      .question-answer-body time { flex:none; color:var(--muted); font-size:10px; }
      .question-answer-body p { margin:5px 0 0; color:#493540; font-size:13px; line-height:1.45; white-space:pre-wrap; overflow-wrap:anywhere; }
      .question-answer-locked { filter:blur(5px); user-select:none; }
      .question-reveal-message { padding:12px; border-radius:12px; background:#fff0f6; color:var(--deep); font-size:12px; text-align:center; }
      .question-history { margin-top:20px; }
      .question-history-heading { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
      .question-history-heading h2 { margin:0; color:var(--deep); font-size:20px; }
      .question-history-list { display:grid; gap:9px; }
      .question-history-item { padding:12px; border:1px solid #f3e1e9; border-radius:15px; background:#fff; }
      .question-history-item header { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .question-history-item time { color:var(--muted); font-size:10px; }
      .question-history-item h3 { margin:9px 0; color:#60283f; font:600 14px/1.4 system-ui,sans-serif; }
      .question-history-answer { margin:6px 0 0; padding:8px 10px; border-radius:10px; background:#fff7fa; color:#493540; font-size:12px; white-space:pre-wrap; overflow-wrap:anywhere; }
      .question-history-locked { color:var(--muted); font-style:italic; }
      .question-empty { padding:14px; color:var(--muted); text-align:center; font-size:12px; }
      @media(max-width:420px) { .question-page-header h1 { font-size:22px; } .question-prompt { font-size:16px; } .question-card,.question-history-card { padding:12px; } }
    </style>
    <section class="question-page">
      <header class="question-page-header"><h1>Today's Question</h1><span class="question-day">${esc(new Date(`${dayKey}T12:00:00`).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}))}</span></header>
      <article class="question-card" id="today-question-card"><p class="question-empty">Loading today's question…</p></article>
      <section class="question-history">
        <header class="question-history-heading"><h2>Question History</h2></header>
        <div class="question-history-list" id="question-history-list"><p class="question-empty">Loading history…</p></div>
      </section>
    </section>
  `;

  function renderToday() {
    const card = $("#today-question-card", el);
    if (!question || !card) return;
    const answeredByMe = Boolean(participants[ownKey]);
    const bothAnswered = Boolean(ownKey && partnerKey && participants[ownKey] && participants[partnerKey]);
    const people = Object.entries(APP_CONFIG.profiles);

    card.innerHTML = `
      <span class="question-category">${esc(question.category)}</span>
      <p class="question-prompt">${esc(question.question)}</p>
      <p class="question-status">${bothAnswered ? "You both answered. Your answers are revealed below." : answeredByMe ? "Your answer is locked. Waiting for your partner to answer." : participants[partnerKey] ? "Your partner has answered. Add yours to reveal both answers." : "Answer privately. Your partner cannot see it until you have both answered."}</p>
      ${answeredByMe ? "" : `
        <form class="question-answer-form" id="question-answer-form">
          <textarea name="answer" maxlength="1200" placeholder="Write your answer…" required></textarea>
          <button class="primary question-submit" type="submit">Answer Now ♡</button>
        </form>
      `}
      <div class="question-answers">
        ${people.map(([key, person]) => {
          const isMine = key === ownKey;
          const answer = isMine ? ownAnswer : bothAnswered ? partnerAnswer : null;
          const isLocked = !isMine && !bothAnswered;
          const display = answer?.answer || (isMine && answeredByMe ? "Loading your answer…" : "");
          const answerDate = answer?.answeredAt ? new Date(timestamp(answer.answeredAt)).toLocaleString() : "";
          return `
            <article class="question-answer">
              <div class="question-answer-avatar">${person.avatar ? `<img src="${esc(person.avatar)}" alt="">` : esc(person.name[0])}</div>
              <div class="question-answer-body">
                <header><strong>${esc(person.name)}</strong>${answerDate ? `<time>${esc(answerDate)}</time>` : ""}</header>
                ${isLocked
                  ? `<p class="question-answer-locked">🔒 Answer hidden until both partners answer</p>`
                  : display ? `<p>${esc(display)} ♡</p>` : `<p class="question-history-locked">${isMine ? "Your answer will appear here after you submit." : "Waiting for your partner."}</p>`}
              </div>
            </article>
          `;
        }).join("")}
      </div>
      ${answeredByMe && !bothAnswered ? `<div class="question-reveal-message">Answered! Your answer is locked until your partner answers.</div>` : ""}
      ${bothAnswered ? `<button type="button" class="question-reveal-message" id="question-view-answers">Answered! Click to view both answers ♡</button>` : ""}
    `;

    $("#question-view-answers", card)?.addEventListener("click", () => {
      $(".question-answers", card)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    const form = $("#question-answer-form", card);
    if (form) {
      form.onsubmit = async event => {
        event.preventDefault();
        const answer = form.elements.answer.value.trim();
        if (!answer) return toast("Write an answer before submitting.");
        const submit = form.querySelector("button");
        submit.disabled = true;
        submit.textContent = "Saving…";
        try {
          await submitQuestionAnswer(dayKey, ownKey, answer);
          ownAnswer = { answer, answeredAt: new Date() };
          participants[ownKey] = { profileKey: ownKey };
          renderToday();
          toast("Your answer is locked until both of you answer ♡");
        } catch (error) {
          console.error("Could not save today's answer:", error);
          toast(error.message || "Could not save your answer.");
          submit.disabled = false;
          submit.textContent = "Answer Now ♡";
        }
      };
    }
  }

  async function refreshAnswers() {
    const token = ++loadToken;
    try {
      const currentParticipants = await getQuestionParticipants(dayKey);
      if (!isCurrent() || token !== loadToken) return;
      participants = currentParticipants;
      ownAnswer = ownKey && participants[ownKey] ? await getQuestionAnswer(dayKey, ownKey) : null;
      const bothAnswered = Boolean(ownKey && partnerKey && participants[ownKey] && participants[partnerKey]);
      partnerAnswer = bothAnswered ? await getQuestionAnswer(dayKey, partnerKey) : null;
      if (!isCurrent() || token !== loadToken) return;
      renderToday();
    } catch (error) {
      if (!isCurrent()) return;
      console.error("Could not load today's answers:", error);
      toast("Could not load today's answer status.");
    }
  }

  function renderHistory() {
    const host = $("#question-history-list", el);
    if (!host) return;
    if (!history.length) {
      host.innerHTML = `<p class="question-empty">Your shared question history will appear here.</p>`;
      return;
    }
    host.innerHTML = history.map(item => `
      <article class="question-history-item" data-history-day="${esc(item.id)}">
        <header><span class="question-category">${esc(item.category || "💗 About Us")}</span><time>${esc(new Date(`${item.dayKey}T12:00:00`).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}))}</time></header>
        <h3>${esc(item.question)}</h3>
        <div class="question-history-answers"><p class="question-empty">Loading answers…</p></div>
      </article>
    `).join("");
  }

  async function loadHistoryAnswers(todayOnly = false) {
    const historyItems = todayOnly ? history.filter(item => item.id === dayKey) : history;
    await Promise.all(historyItems.map(async item => {
      try {
        let status, mine, partner;
        if (item.id === dayKey) {
          status = participants;
          mine = ownAnswer;
          partner = partnerAnswer;
        } else {
          status = await getQuestionParticipants(item.id);
          mine = status[ownKey] ? await getQuestionAnswer(item.id, ownKey) : null;
          partner = status[ownKey] && status[partnerKey]
            ? await getQuestionAnswer(item.id, partnerKey)
            : null;
        }
        const canReveal = Boolean(status[ownKey] && status[partnerKey]);
        const card = el.querySelector(`[data-history-day="${item.id}"] .question-history-answers`);
        if (!card || !isCurrent()) return;
        const entries = [
          [ownKey, mine],
          [partnerKey, canReveal ? partner : null]
        ].filter(([key]) => key);
        card.innerHTML = entries.map(([key, answer]) => {
          const person = APP_CONFIG.profiles[key];
          if (answer?.answer) return `<p class="question-history-answer"><strong>${esc(person.name)}:</strong> ${esc(answer.answer)}</p>`;
          if (key === partnerKey && status[partnerKey] && !canReveal) return `<p class="question-history-answer question-history-locked">${esc(person.name)} answered · locked until both answer</p>`;
          return `<p class="question-history-answer question-history-locked">${esc(person.name)} has not answered</p>`;
        }).join("");
      } catch (error) {
        console.error(`Could not load question history for ${item.dayKey}:`, error);
        const card = el.querySelector(`[data-history-day="${item.id}"] .question-history-answers`);
        if (card) card.innerHTML = `<p class="question-history-locked">Answers could not be loaded.</p>`;
      }
    }));
  }

  async function refreshHistory() {
    history = await getQuestionHistory();
    if (!isCurrent()) return;
    renderHistory();
    await loadHistoryAnswers();
  }

  async function loadQuestion() {
    try {
      question = await ensureDailyQuestion(dayKey);
      if (!isCurrent()) return;
      renderToday();
      stopParticipants = watchQuestionParticipants(dayKey, status => {
        if (!isCurrent()) return;
        participants = status;
        refreshAnswers().then(() => loadHistoryAnswers(true));
      }, error => {
        if (!isCurrent()) return;
        console.error("Question status updates failed:", error);
        toast("Answer status could not be synced.");
      });
      const migration = migrateLegacyAnswersOnce(user, ownKey, isCurrent);
      await refreshAnswers();
      await refreshHistory();
      migration?.then(migrated => {
        if (!migrated || !isCurrent()) return;
        refreshHistory().catch(error => {
          console.error("Migrated question history could not be refreshed:", error);
          if (isCurrent()) toast("Migrated question history could not be loaded.");
        });
      });
    } catch (error) {
      if (!isCurrent()) return;
      console.error("Could not load Today's Question:", error);
      const card = $("#today-question-card", el);
      if (card) card.innerHTML = `<p class="question-empty">Today's Question could not be loaded. Check your connection and try again.</p>`;
      toast(error.message || "Today's Question could not be loaded.");
    }
  }

  if (!ownKey) {
    $("#today-question-card", el).innerHTML = `<p class="question-empty">Your profile could not be matched to this account.</p>`;
    return;
  }
  loadQuestion();
}

export function disposeQuestions() {
  questionRenderToken++;
  clearTimeout(dayRolloverTimer);
  dayRolloverTimer = null;
  stopParticipants?.();
  stopParticipants = null;
}
