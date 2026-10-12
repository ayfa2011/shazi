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
  watchQuestionParticipants,
  updateDailyQuestion,
  watchDailyQuestion
} from "./question-service.js";

let stopParticipants = null, stopDailyQuestion = null, dayRolloverTimer = null, questionRenderToken = 0;
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
      button.question-prompt { display:block; width:100%; border:0; text-align:left; cursor:pointer; font:inherit; }
      button.question-prompt::after { content:"✎"; float:right; margin-left:10px; color:#bf5b83; font-size:14px; opacity:.6; }
      button.question-prompt:hover { box-shadow:inset 0 0 0 1px #f0bfd1; }
      .question-edit-modal { position:fixed; inset:0; z-index:1300; display:none; align-items:center; justify-content:center; padding:16px; background:#25151dcc; }
      .question-edit-modal.open { display:flex; }
      .question-edit-card { width:min(100%,460px); padding:20px; border:1px solid #f0d7e2; border-radius:22px; background:linear-gradient(145deg,#fff,#fff6fa); box-shadow:0 20px 60px #25151d55; }
      .question-edit-card h2 { margin:0 0 6px; color:#873456; font-size:20px; }
      .question-edit-card p { margin:0 0 12px; color:#8c737d; font-size:12px; }
      .question-edit-card textarea { width:100%; min-height:115px; padding:12px; border:1px solid #efd0de; border-radius:13px; background:#fffafd; color:#60283f; font:600 15px/1.45 system-ui,sans-serif; resize:vertical; }
      .question-edit-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
      .question-edit-actions button { min-height:39px; padding:8px 14px; border-radius:999px; font-weight:700; }
      .question-edit-cancel { background:#f6edf1; color:#765a68; }
      .question-edit-save { background:linear-gradient(135deg,#e85c91,#c73d76); color:#fff; }
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
      .question-history { margin-top:24px; }
      .question-history-heading { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
      .question-history-heading h2 { margin:0; color:var(--deep); font-size:21px; }
      .question-history-list { position:relative; display:grid; gap:16px; padding-left:23px; }
      .question-history-list::before { content:""; position:absolute; top:18px; bottom:18px; left:7px; width:2px; border-radius:2px; background:linear-gradient(#f1a8c2,#f8dce7 70%,#f1a8c2); }
      .question-history-item { position:relative; min-width:0; padding:15px; border:1px solid #f3dce6; border-radius:19px; background:linear-gradient(145deg,#fff 0%,#fff8fb 100%); box-shadow:0 8px 22px #873c5b0d; }
      .question-history-item::before { content:attr(data-day-number); position:absolute; top:18px; left:-43px; width:31px; height:31px; display:grid; place-items:center; border:3px solid #fff; border-radius:50%; background:#fff0f6; color:#9e5270; font-size:12px; font-weight:800; box-shadow:0 0 0 2px #f3c1d2; }
      .question-history-item header { display:flex; align-items:center; justify-content:flex-start; gap:8px; margin-bottom:10px; }
      .question-history-item time { display:block; color:#9e5270; font-size:12px; font-weight:700; line-height:1.3; }
      .question-history-item h3 { margin:0 0 12px; color:#60283f; font:700 15px/1.4 system-ui,sans-serif; }
      .question-history-answers { display:grid; gap:8px; }
      .question-history-answer { display:flex; align-items:flex-start; gap:9px; min-width:0; margin:0; padding:9px 10px; border:1px solid #f7e4eb; border-radius:14px; background:linear-gradient(110deg,#fff3f8,#fffafd); color:#493540; font-size:12px; line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; }
      .question-history-avatar { flex:none; width:32px; height:32px; display:grid; place-items:center; overflow:hidden; border:2px solid #fff; border-radius:50%; background:linear-gradient(145deg,#ffdce9,#f5bbd0); color:#8b315d; font-size:12px; font-weight:800; box-shadow:0 2px 6px #7d35501a; }
      .question-history-avatar img { display:block; width:100%; height:100%; object-fit:cover; }
      .question-history-copy { min-width:0; flex:1; }
      .question-history-copy strong { display:block; margin:0 0 2px; color:#8b315d; font-size:11px; font-weight:800; }
      .question-history-copy span { display:block; }
      .question-history-locked { align-items:center; background:#f8f5f6; border-color:#eee7ea; color:#9b8c93; font-style:italic; }
      .question-empty { padding:14px; color:var(--muted); text-align:center; font-size:12px; }
      @media(max-width:420px) { .question-page-header h1 { font-size:22px; } .question-prompt { font-size:16px; } .question-card,.question-history-card { padding:12px; } .question-history-list { gap:12px; padding-left:20px; } .question-history-list::before { left:5px; } .question-history-item { padding:12px; border-radius:16px; } .question-history-item::before { left:-35px; top:15px; width:27px; height:27px; } .question-history-item h3 { font-size:14px; } .question-history-answer { gap:7px; padding:8px; font-size:11px; } .question-history-avatar { width:29px; height:29px; } }
    </style>
    <section class="question-page">
      <header class="question-page-header"><h1>Today's Question</h1><span class="question-day">${esc(new Date(`${dayKey}T12:00:00`).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}))}</span></header>
      <article class="question-card" id="today-question-card"><p class="question-empty">Loading today's question…</p></article>
      <section class="question-history">
        <header class="question-history-heading"><h2>Question History</h2></header>
        <div class="question-history-list" id="question-history-list"><p class="question-empty">Loading history…</p></div>
      </section>
    </section>
    <div class="question-edit-modal" id="question-edit-modal" aria-hidden="true"><section class="question-edit-card" role="dialog" aria-modal="true" aria-labelledby="question-edit-title"><h2 id="question-edit-title">Ask your own question ♡</h2><p>This replaces today's default question for both of you.</p><form id="question-edit-form"><textarea name="question" maxlength="300" required aria-label="Today's question"></textarea><div class="question-edit-actions"><button type="button" class="question-edit-cancel" id="question-edit-cancel">Cancel</button><button type="submit" class="question-edit-save">Save question</button></div></form></section></div>
  `;

  const editModal = $("#question-edit-modal", el);
  const editForm = $("#question-edit-form", el);
  function closeQuestionEditor() {
    editModal.classList.remove("open");
    editModal.setAttribute("aria-hidden", "true");
  }
  function openQuestionEditor() {
    if (participants[ownKey] || participants[partnerKey]) {
      toast("Today's question is locked after an answer is submitted.");
      return;
    }
    editForm.elements.question.value = question?.question || "";
    editModal.classList.add("open");
    editModal.setAttribute("aria-hidden", "false");
    editForm.elements.question.focus();
  }
  $("#question-edit-cancel", el).onclick = closeQuestionEditor;
  editModal.addEventListener("click", event => { if (event.target === editModal) closeQuestionEditor(); });
  editForm.onsubmit = async event => {
    event.preventDefault();
    const save = editForm.querySelector("[type=submit]");
    const text = editForm.elements.question.value.trim();
    if (!text) return toast("Enter a question first.");
    save.disabled = true;
    save.textContent = "Saving…";
    try {
      await updateDailyQuestion(dayKey, text);
      question = { ...question, question: text };
      history = history.map(item => item.id === dayKey ? { ...item, question: text } : item);
      renderToday();
      renderHistory();
      closeQuestionEditor();
      toast("Today's question updated for both of you ♡");
    } catch (error) {
      console.error("Could not update today's question:", error);
      toast(error.message || "Could not update today's question.");
    } finally {
      save.disabled = false;
      save.textContent = "Save question";
    }
  };

  function renderToday() {
    const card = $("#today-question-card", el);
    if (!question || !card) return;
    const answeredByMe = Boolean(participants[ownKey]);
    const bothAnswered = Boolean(ownKey && partnerKey && participants[ownKey] && participants[partnerKey]);
    const people = Object.entries(APP_CONFIG.profiles);

    card.innerHTML = `
      <span class="question-category">${esc(question.category)}</span>
      <button type="button" class="question-prompt" id="edit-today-question" aria-label="Edit today's question">${esc(question.question)}</button>
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

    $("#edit-today-question", card)?.addEventListener("click", openQuestionEditor);
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
      <article class="question-history-item" data-history-day="${esc(item.id)}" data-day-number="${esc(new Date(`${item.dayKey}T12:00:00`).getDate())}">
        <header><time datetime="${esc(item.dayKey)}">${esc(new Date(`${item.dayKey}T12:00:00`).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}))}</time></header>
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
        const entries = Object.keys(APP_CONFIG.profiles).map(key => [
          key,
          key === ownKey ? mine : canReveal ? partner : null
        ]).filter(([key]) => key);
        card.innerHTML = entries.map(([key, answer]) => {
          const person = APP_CONFIG.profiles[key];
          const avatar = person.avatar ? `<img src="${esc(person.avatar)}" alt="">` : esc((person.name || "♡")[0]);
          const content = answer?.answer
            ? esc(answer.answer)
            : key === partnerKey && status[partnerKey] && !canReveal
              ? "Answered · locked until both answer"
              : "Not answered yet";
          const lockedClass = answer?.answer ? "" : " question-history-locked";
          return `<div class="question-history-answer${lockedClass}"><span class="question-history-avatar">${avatar}</span><span class="question-history-copy"><strong>${esc(person.name || "Partner")}</strong><span>${content}</span></span></div>`;
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
      stopDailyQuestion = watchDailyQuestion(dayKey, sharedQuestion => {
        if (!isCurrent()) return;
        question = sharedQuestion;
        history = history.map(item => item.id === dayKey ? { ...item, question: sharedQuestion.question } : item);
        renderToday();
        renderHistory();
      }, error => console.error("Today's question sync failed:", error));
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
  stopDailyQuestion?.();
  stopDailyQuestion = null;
}
