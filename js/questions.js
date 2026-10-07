import { $, esc, toast, todayKey, dailyIndex } from "./utils.js";
import { watchItems, addItem } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";

let stopAnswers = null, active = false;

export function renderQuestions(el, user, profile) {
  stopAnswers?.();
  active = true;

  const dateKey = todayKey(); // Standardized Date Key
  const questionsList = APP_CONFIG.dailyQuestions || [
    "What is your favourite thing about us?",
    "What do you think is the most important quality in a partner?",
    "What is your favorite memory of us together?"
  ];
  
  const currentQuestion = questionsList[dailyIndex(questionsList.length)];
  const displayDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  el.innerHTML = `
    <style>
      .daily-q-card {
        background: #ffffff;
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        font-family: system-ui, -apple-system, sans-serif;
        max-width: 500px;
        margin: 0 auto;
      }
      .dq-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .dq-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 18px;
        font-weight: 700;
        color: #881337;
      }
      .dq-title-icon {
        width: 28px;
        height: 28px;
        background: #ffe4e6;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #e11d48;
      }
      .dq-view-all {
        color: #e11d48;
        font-size: 13px;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
      }
      .question-box {
        background: #fff1f2;
        border-radius: 16px;
        padding: 18px;
        position: relative;
        margin-bottom: 20px;
      }
      .question-text {
        font-size: 16px;
        font-weight: 700;
        color: #881337;
        margin: 0;
        line-height: 1.4;
        max-width: 85%;
      }
      .question-heart-art {
        position: absolute;
        right: 16px;
        top: 50%;
        transform: translateY(-50%);
        color: #fda4af;
        font-size: 28px;
      }
      .section-label {
        font-size: 14px;
        font-weight: 700;
        color: #881337;
        margin-bottom: 12px;
      }
      .answers-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-bottom: 20px;
      }
      .answer-item {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        padding-bottom: 12px;
        border-bottom: 1px solid #f3f4f6;
      }
      .answer-item:last-child {
        border-bottom: none;
      }
      .answer-avatar {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        object-fit: cover;
        background: #f1f5f9;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        color: #e11d48;
      }
      .answer-content {
        flex: 1;
      }
      .answer-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .author-name {
        font-weight: 700;
        font-size: 14px;
        color: #1f2937;
      }
      .answer-date {
        font-size: 12px;
        color: #9ca3af;
      }
      .answer-text-val {
        font-size: 13.5px;
        color: #4b5563;
        line-height: 1.4;
        margin: 0;
      }
      .hidden-answer {
        font-style: italic;
        color: #9ca3af;
        background: #f8fafc;
        padding: 8px 12px;
        border-radius: 8px;
      }
      .input-answer-box {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 10px;
      }
      .input-answer-box textarea {
        width: 100%;
        border: 1px solid #fecdd3;
        border-radius: 12px;
        padding: 12px;
        font-family: inherit;
        font-size: 14px;
        box-sizing: border-box;
        resize: none;
        outline: none;
      }
      .input-answer-box textarea:focus {
        border-color: #f43f5e;
      }
      .submit-ans-btn {
        background: #e11d48;
        color: white;
        border: none;
        padding: 10px 18px;
        border-radius: 20px;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        align-self: flex-end;
      }
      .both-answered-banner {
        background: #fff1f2;
        border-radius: 16px;
        padding: 14px 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .banner-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .banner-icon {
        color: #e11d48;
        font-size: 20px;
      }
      .banner-text h4 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #881337;
      }
      .banner-text p {
        margin: 2px 0 0 0;
        font-size: 11.5px;
        color: #9f1239;
      }
    </style>

    <div class="daily-q-card">
      <div class="dq-header">
        <div class="dq-title">
          <div class="dq-title-icon">💖</div>
          <span>Today's Question</span>
        </div>
        <span class="dq-view-all">View All →</span>
      </div>

      <div class="question-box">
        <p class="question-text">${esc(currentQuestion)}</p>
        <div class="question-heart-art">♡</div>
      </div>

      <div class="section-label">Answers</div>

      <div id="answers-container" class="answers-list">
        <p style="color:#9ca3af; font-size:13px;">Loading answers…</p>
      </div>

      <div id="my-answer-input-container"></div>

      <div id="both-answered-container" style="display:none;">
        <div class="both-answered-banner">
          <div class="banner-left">
            <span class="banner-icon">💖</span>
            <div class="banner-text">
              <h4>You both answered!</h4>
              <p>Next question will be available tomorrow.</p>
            </div>
          </div>
          <span style="color:#f43f5e; font-size:20px;">♡</span>
        </div>
      </div>
    </div>
  `;

  // Realtime Answers Watcher
  stopAnswers = watchItems("answer", items => {
    if (!active || !el.isConnected) return;

    // Filter today's answers for current question
    const todayAnswers = items.filter(x => x.questionDate === dateKey && x.question === currentQuestion);
    
    const answersContainer = $("#answers-container", el);
    const inputContainer = $("#my-answer-input-container", el);
    const bothContainer = $("#both-answered-container", el);

    // Check by user UID
    const myAnswer = todayAnswers.find(x => x.author === user.uid);
    const bothAnswered = todayAnswers.length >= 2;

    // Render Answers List (with Spoiler Hide)
    if (todayAnswers.length === 0) {
      answersContainer.innerHTML = `<p style="color:#9ca3af; font-size:13px; margin:0;">No answers yet today. Be the first to answer! ♡</p>`;
    } else {
      answersContainer.innerHTML = todayAnswers.map(x => {
        const isSelf = x.author === user.uid;
        const canView = isSelf || bothAnswered;

        return `
          <div class="answer-item">
            <div class="answer-avatar">
              ${x.photoUrl ? `<img src="${x.photoUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : esc((x.authorName || 'U')[0])}
            </div>
            <div class="answer-content">
              <div class="answer-meta">
                <span class="author-name">${esc(x.authorName || 'Us')}</span>
                <span class="answer-date">${displayDate}</span>
              </div>
              ${canView 
                ? `<p class="answer-text-val">${esc(x.answer)} ♡</p>` 
                : `<p class="answer-text-val hidden-answer">🔒 Answer hidden until both partners answer!</p>`}
            </div>
          </div>
        `;
      }).join("");
    }

    // Input form or Both answered banner
    if (!myAnswer) {
      inputContainer.style.display = "block";
      bothContainer.style.display = "none";
      inputContainer.innerHTML = `
        <div class="input-answer-box">
          <textarea id="answer-text-input" rows="3" placeholder="Type your answer..."></textarea>
          <button id="submit-ans-btn" class="submit-ans-btn">Submit Answer</button>
        </div>
      `;

      $("#submit-ans-btn", inputContainer).onclick = async () => {
        const text = $("#answer-text-input", inputContainer).value.trim();
        if (!text) return toast("Please write an answer first!");

        await addItem("answer", {
          question: currentQuestion,
          questionDate: dateKey,
          answer: text,
          author: user.uid,
          authorName: profile.name,
          photoUrl: profile.avatar || "",
          date: new Date().toISOString()
        });

        toast("Answer saved ♡");
      };
    } else {
      inputContainer.style.display = "none";
      if (bothAnswered) {
        bothContainer.style.display = "block";
      } else {
        bothContainer.style.display = "none";
      }
    }
  });
}

export function disposeQuestions() {
  active = false;
  stopAnswers?.();
  stopAnswers = null;
}