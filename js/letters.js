import { $, esc, toast } from "./utils.js";
import { watchItems, addLetter, getScheduledLetterBody, migrateScheduledLetterBody, notifyPartnerSafely } from "./firestore.js";
import { findProfileForAuthor, getDisplayName, getProfileKey } from "./profile-data.js";
import { APP_CONFIG } from "../config/app-config.js";

let stopLetters = null, deliveryTimer = null, active = false;

export function renderLetters(el, user, profile) {
  stopLetters?.();
  clearTimeout(deliveryTimer);
  deliveryTimer = null;
  active = true;
  const ownKey = getProfileKey(profile);
  let currentTab = "Inbox";

  function recipientKey(recipient) {
    const normalized = String(recipient || "").trim().toLocaleLowerCase();
    const match = Object.entries(APP_CONFIG.profiles).find(([key, person]) =>
      key.toLocaleLowerCase() === normalized ||
      person.name.toLocaleLowerCase() === normalized ||
      person.previousNames?.some(name => name.toLocaleLowerCase() === normalized) ||
      (key === "kebyy" && normalized === "kebyy")
    );
    return match?.[0] || "";
  }

  function recipientName(recipient) {
    const key = recipientKey(recipient);
    return key ? APP_CONFIG.profiles[key].name : recipient || "Us";
  }

  el.innerHTML = `
    <style>
      .letters-card {
        background: #ffffff;
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        font-family: system-ui, -apple-system, sans-serif;
        max-width: 550px;
        margin: 0 auto;
      }
      .letters-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 16px;
      }
      .letters-title-area {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .letters-icon {
        width: 32px;
        height: 32px;
        background: #ffe4e6;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #e11d48;
        font-size: 16px;
      }
      .letters-text h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: #881337;
      }
      .letters-text p {
        margin: 2px 0 0 0;
        font-size: 12px;
        color: #9ca3af;
      }
      .write-letter-btn {
        background: #e11d48;
        color: #ffffff;
        border: none;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .letters-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 18px;
      }
      .tab-btn {
        padding: 6px 18px;
        border-radius: 20px;
        border: none;
        background: #f3f4f6;
        color: #6b7280;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .tab-btn.active {
        background: #ffe4e6;
        color: #e11d48;
        font-weight: 600;
      }
      .letters-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .letter-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid #f3f4f6;
        cursor: pointer;
      }
      .letter-item:last-child {
        border-bottom: none;
      }
      .letter-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .letter-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #ffe4e6;
        color: #e11d48;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 16px;
      }
      .letter-info h4 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #374151;
      }
      .letter-info p {
        margin: 3px 0 0 0;
        font-size: 13px;
        color: #6b7280;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 260px;
      }
      .letter-date {
        font-size: 12px;
        color: #9ca3af;
        white-space: nowrap;
      }

      .letter-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .letter-modal-box {
        background: white;
        padding: 20px;
        border-radius: 20px;
        width: 90%;
        max-width: 450px;
      }
      .letter-modal-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
      }
      .letter-modal-head h3 {
        margin: 0;
        color: #881337;
      }
      .letter-modal-box input, .letter-modal-box textarea, .letter-modal-box select {
        width: 100%;
        padding: 10px;
        margin: 6px 0 12px 0;
        box-sizing: border-box;
        border: 1px solid #fecdd3;
        border-radius: 10px;
        font-family: inherit;
        outline: none;
      }
      .letter-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .letters-card {
        max-width: 650px;
        padding: 22px;
        border: 1px solid #f2dce6;
        border-radius: 24px;
        background: linear-gradient(145deg,#fff 35%,#fff8fb);
        box-shadow: 0 18px 48px rgba(139,47,88,.09);
      }
      .letters-header { align-items: center; gap: 12px; margin-bottom: 20px; }
      .letters-title-area { gap: 12px; }
      .letters-icon { width: 46px; height: 46px; background: linear-gradient(145deg,#ffe5ef,#ffd2e3); color: #b63368; font-size: 22px; }
      .letters-text h3 { color: #873456; font-size: 21px; }
      .letters-text p { margin-top: 4px; color: #967b87; line-height: 1.4; }
      .write-letter-btn {
        flex: none; padding: 11px 15px; border-radius: 999px;
        background: linear-gradient(135deg,#e85c91,#c73d76); box-shadow: 0 7px 18px #d7478030;
        transition: transform .2s ease,box-shadow .2s ease;
      }
      .write-letter-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 22px #d7478040; }
      .letters-tabs { gap: 7px; padding: 5px; border: 1px solid #f4e8ee; border-radius: 15px; background: #fffafd; }
      .tab-btn { flex: 1; padding: 9px 8px; border-radius: 11px; background: transparent; color: #886e79; font-weight: 600; transition: background .2s ease,color .2s ease; }
      .tab-btn.active { background: #ffe7f0; color: #a72f62; }
      .letters-list { gap: 9px; }
      .letter-item {
        gap: 12px; padding: 13px; border: 1px solid #f2e5eb; border-radius: 17px;
        background: #fff; box-shadow: 0 4px 13px #74314908;
        transition: transform .2s ease,border-color .2s ease,box-shadow .2s ease;
      }
      .letter-item:hover { transform: translateY(-2px); border-color: #edbfd2; box-shadow: 0 9px 20px #74314912; }
      .letter-left { min-width: 0; gap: 11px; }
      .letter-avatar { width: 42px; height: 42px; flex: none; border-radius: 14px; background: #fff0f6; color: #cb4a7b; font-size: 20px; }
      .letter-info { min-width: 0; }
      .letter-info h4 { overflow: hidden; color: #5a3445; text-overflow: ellipsis; white-space: nowrap; }
      .letter-info p { max-width: 390px; color: #8e7a83; font-size: 11px; }
      .letter-date { flex: none; color: #9b8790; font-size: 10px; }
      .letter-modal-overlay { padding: 18px; overflow-y: auto; background: rgba(49,20,36,.56); opacity: 0; backdrop-filter: blur(5px); }
      .letter-modal-overlay.is-open { animation: letter-overlay-in .25s ease forwards; }
      .letter-modal-box {
        width: min(520px,100%); max-height: calc(100dvh - 36px); overflow-y: auto;
        padding: 23px; border: 1px solid #f2dce6; border-radius: 23px;
        background: #fffafd; box-shadow: 0 25px 80px #30132144;
      }
      .letter-modal-overlay.is-open .letter-modal-box { animation: letter-modal-in .55s cubic-bezier(.2,.8,.2,1) both; }
      .letter-modal-head { gap: 12px; }
      .letter-modal-head h3 { color: #873456; font-size: 21px; }
      .letter-close-btn { width: 34px; height: 34px; flex: none; border-radius: 50%; background: #fff0f6; color: #9c3b64; font-size: 21px; }
      .letter-form { gap: 12px; margin-top: 0; }
      .letter-form label { gap: 6px; color: #795565; font-size: 11px; font-weight: 700; }
      .letter-form select,.letter-form input {
        width: 100%; min-height: 43px; margin: 0; border: 1px solid #efd6e1;
        border-radius: 12px; background: #fff; color: #583447; font-size: 13px;
      }
      .letter-form textarea {
        width: 100%; min-height: 235px; resize: vertical; margin: 0; padding: 18px 17px 16px 30px;
        border: 1px solid #edcfb4; border-radius: 12px;
        background-color: #fffdf4;
        background-image: linear-gradient(90deg,transparent 0,transparent 21px,#e8a6af 22px,#e8a6af 23px,transparent 24px),repeating-linear-gradient(to bottom,transparent 0,transparent 31px,#c9dbea 32px,#c9dbea 33px);
        color: #593a48; font-family: "Segoe Print","Bradley Hand","Comic Sans MS",cursive;
        font-size: 17px; line-height: 33px; box-shadow: inset 0 1px 8px #8353340b;
      }
      .letter-form textarea::placeholder { color: #b99e9f; opacity: 1; }
      .letter-form textarea:focus,.letter-form select:focus,.letter-form input:focus { border-color: #db8eae; box-shadow: 0 0 0 3px #ef6d9f16; }
      .letter-prompt { margin: 0; color: #9a7c89; font-size: 10px; text-align: center; }
      .letter-modal-actions { flex-wrap: wrap; gap: 8px; margin-top: 3px; }
      .letter-modal-actions button,.read-letter-actions button { min-height: 40px; padding: 9px 14px; border-radius: 12px; font-size: 12px; font-weight: 700; }
      .letter-cancel-btn { border: 1px solid #efdde5; background: #fff; color: #765a68; }
      .letter-send-btn { background: linear-gradient(135deg,#e85c91,#c73d76); color: #fff; box-shadow: 0 6px 16px #d7478028; }
      .read-letter-date { margin: -9px 0 15px; color: #9b8790; font-size: 11px; }
      .letter-paper {
        position: relative; min-height: 230px; padding: 22px 20px 22px 38px;
        overflow-wrap: anywhere; border: 1px solid #ecd8bb; border-radius: 5px 15px 10px 5px;
        background-color: #fffdf5;
        background-image: linear-gradient(90deg,transparent 0,transparent 26px,#e8a6af 27px,#e8a6af 28px,transparent 29px),repeating-linear-gradient(to bottom,transparent 0,transparent 31px,#c9dbea 32px,#c9dbea 33px);
        box-shadow: 0 12px 26px #603f2a14,inset 0 0 24px #aa74410a; color: #593a48;
        font-family: "Segoe Print","Bradley Hand","Comic Sans MS",cursive;
        font-size: 17px; line-height: 33px; white-space: pre-wrap; transform-origin: top center;
      }
      .letter-paper::after { content: "♡"; position: absolute; right: 14px; bottom: 8px; color: #d889a5; font: 19px Georgia,serif; opacity: .75; }
      .letter-modal-overlay.is-open .letter-paper { animation: letter-paper-unfold .85s .08s cubic-bezier(.2,.75,.2,1) both; }
      .read-letter-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 17px; }
      .letter-reply-btn { background: #ffe5ef; color: #a72f62; }
      .letter-reply-btn[hidden] { display: none; }
      .letter-read-close { background: #f6edf1; color: #765a68; }
      @keyframes letter-overlay-in { to { opacity: 1; } }
      @keyframes letter-modal-in { from { opacity: 0; transform: translateY(16px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes letter-paper-unfold {
        0% { opacity: 0; transform: perspective(900px) rotateX(-16deg) translateY(-9px) scale(.98); }
        55% { opacity: 1; transform: perspective(900px) rotateX(3deg) translateY(0) scale(1); }
        100% { opacity: 1; transform: perspective(900px) rotateX(0) translateY(0) scale(1); }
      }
      @media (max-width: 480px) {
        .letters-card { padding: 16px; border-radius: 20px; }
        .letters-header { align-items: flex-start; }
        .write-letter-btn { padding: 10px 12px; font-size: 11px; }
        .letter-item { padding: 11px; }
        .letter-date { font-size: 9px; }
        .letter-modal-overlay { padding: 10px; }
        .letter-modal-box { padding: 18px; max-height: calc(100dvh - 20px); }
        .letter-form textarea { min-height: 205px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .letter-modal-overlay.is-open,.letter-modal-overlay.is-open .letter-modal-box,.letter-modal-overlay.is-open .letter-paper { animation-duration: .01ms; animation-delay: 0ms; }
        .letter-item,.write-letter-btn { transition: none; }
      }
    </style>

    <div class="letters-card">
      <div class="letters-header">
        <div class="letters-title-area">
          <div class="letters-icon">💖</div>
          <div class="letters-text">
            <h3>Letters</h3>
            <p>Little love notes, sent from one heart to another ♡</p>
          </div>
        </div>
        <button id="write-letter-btn" class="write-letter-btn">＋ Write a letter</button>
      </div>

      <div class="letters-tabs">
        <button class="tab-btn active" data-tab="Inbox">Inbox</button>
        <button class="tab-btn" data-tab="Sent">Sent</button>
        <button class="tab-btn" data-tab="Scheduled">Scheduled</button>
      </div>

      <div id="letters-list-container" class="letters-list">
        <p style="color:#9ca3af; font-size:13px;">Loading letters…</p>
      </div>
    </div>

    <!-- Write Letter Modal -->
    <div id="write-letter-modal" class="letter-modal-overlay" style="display: none;">
      <div class="letter-modal-box">
        <div class="letter-modal-head">
          <h3>Write a Letter ♡</h3>
          <button id="close-letter-modal" class="letter-close-btn" type="button" aria-label="Close letter form">×</button>
        </div>
        <form id="write-letter-form" class="letter-form">
          <label>To
          <select id="letter-to" required>
            ${Object.entries(APP_CONFIG.profiles).map(([key, person]) => `<option value="${esc(key)}">To ${esc(person.name)}</option>`).join("")}
          </select>
          </label>
          <label>Your letter
          <textarea id="letter-body" rows="6" placeholder="My dearest…&#10;&#10;Write from your heart ♡" required></textarea>
          </label>
          <p class="letter-prompt">Take your time. The loveliest words are the ones that sound like you.</p>
          <label>When should it arrive?
          <select id="letter-status">
            <option value="Sent">Send Now</option>
            <option value="Scheduled">Schedule for Later</option>
          </select>
          </label>

          <div id="deliver-date-group" style="display:none;">
            <label>Deliver date &amp; time
            <input type="datetime-local" id="letter-deliver-date">
            </label>
          </div>

          <div class="letter-modal-actions">
            <button type="button" id="cancel-letter-btn" class="letter-cancel-btn">Maybe later</button>
            <button type="submit" id="submit-letter-btn" class="letter-send-btn">Send with love ♡</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Read Letter Modal -->
    <div id="read-letter-modal" class="letter-modal-overlay" style="display: none;">
      <div class="letter-modal-box">
        <div class="letter-modal-head">
          <h3 id="read-letter-title">Letter</h3>
          <button id="close-read-modal" class="letter-close-btn" type="button" aria-label="Close letter">×</button>
        </div>
        <p id="read-letter-date" class="read-letter-date"></p>
        <div id="read-letter-body" class="letter-paper"></div>
        <div class="read-letter-actions">
          <button id="reply-letter-btn" class="letter-reply-btn" type="button" hidden>Write a reply ♡</button>
          <button id="close-read-letter-btn" class="letter-read-close" type="button">Close letter</button>
        </div>
      </div>
    </div>
  `;

  const writeModal = $("#write-letter-modal", el);
  const readModal = $("#read-letter-modal", el);
  const statusSelect = $("#letter-status", el);
  const deliverGroup = $("#deliver-date-group", el);
  const deliverInput = $("#letter-deliver-date", el);
  const submitBtn = $("#submit-letter-btn", el);
  const recipientSelect = $("#letter-to", el);
  const letterBodyInput = $("#letter-body", el);
  const replyBtn = $("#reply-letter-btn", el);
  const migratingLetters = new Set();

  function openModal(modal) {
    modal.style.display = "flex";
    modal.classList.remove("is-open");
    requestAnimationFrame(() => modal.classList.add("is-open"));
  }

  function closeModal(modal) {
    modal.classList.remove("is-open");
    modal.style.display = "none";
  }

  statusSelect.onchange = () => {
    if (statusSelect.value === "Scheduled") {
      deliverGroup.style.display = "block";
      deliverInput.required = true;
      submitBtn.textContent = "Schedule with love ♡";
    } else {
      deliverGroup.style.display = "none";
      deliverInput.required = false;
      submitBtn.textContent = "Send with love ♡";
    }
  };

  el.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => {
      el.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      renderList();
    };
  });

  $("#write-letter-btn", el).onclick = () => {
    recipientSelect.value = Object.keys(APP_CONFIG.profiles).find(key => key !== ownKey) || ownKey;
    openModal(writeModal);
  };
  $("#close-letter-modal", el).onclick = () => closeModal(writeModal);
  $("#cancel-letter-btn", el).onclick = () => closeModal(writeModal);
  $("#close-read-modal", el).onclick = () => closeModal(readModal);
  $("#close-read-letter-btn", el).onclick = () => closeModal(readModal);
  replyBtn.onclick = () => {
    const replyRecipient = replyBtn.dataset.recipient;
    if (!replyRecipient) return;
    closeModal(readModal);
    recipientSelect.value = replyRecipient;
    letterBodyInput.value = "";
    openModal(writeModal);
    requestAnimationFrame(() => letterBodyInput.focus());
  };
  [writeModal, readModal].forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target === modal) closeModal(modal);
    });
  });

  $("#write-letter-form", el).onsubmit = async (e) => {
    e.preventDefault();
    const recipient = $("#letter-to", el).value;
    const body = $("#letter-body", el).value.trim();
    const status = statusSelect.value;
    const deliverDate = status === "Scheduled" ? new Date(deliverInput.value).toISOString() : new Date().toISOString();

    try {
      const letter = await addLetter({
        recipient,
        body,
        status,
        deliverDate,
        author: user.uid,
        authorName: profile.name,
        createdAt: new Date().toISOString()
      });
      if (status === "Sent" && recipient !== ownKey) {
        void notifyPartnerSafely(ownKey, "letter", "New letter received.", letter.id, "letters");
      }

      closeModal(writeModal);
      $("#write-letter-form", el).reset();
      deliverGroup.style.display = "none";
      submitBtn.textContent = "Send with love ♡";
      toast(status === "Scheduled" ? "Letter scheduled ♡" : "Letter sent ♡");
    } catch (err) {
      console.error("Could not send letter:", err);
      toast("Could not send letter. Try again.");
    }
  };

  let allLetters = [];

  function renderList() {
    const container = $("#letters-list-container", el);
    const now = new Date();
    const nowIso = now.toISOString();

    const filtered = allLetters.filter((item) => {
      const deliveryTime = item.deliverDate ? new Date(item.deliverDate).getTime() : 0;
      const isDelivered = !deliveryTime || deliveryTime <= now.getTime();
      const isAuthor = item.author === user.uid;

      if (currentTab === "Inbox") {
        return !isAuthor && recipientKey(item.recipient) === ownKey &&
          (item.status === "Sent" || (item.status === "Scheduled" && isDelivered));
      } else if (currentTab === "Sent") {
        return isAuthor && (item.status === "Sent" || isDelivered);
      } else if (currentTab === "Scheduled") {
        return isAuthor && item.status === "Scheduled" && !isDelivered;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:#9ca3af; padding:20px 0;">No letters in ${currentTab}</p>`;
    } else {
      container.innerHTML = filtered.map((item) => {
        const dateVal = item.deliverDate || item.createdAt;
        const dateStr = dateVal ? new Date(dateVal).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : "Just now";
        const deliveryTime = item.deliverDate ? new Date(item.deliverDate).getTime() : 0;
        const isScheduled = item.status === "Scheduled" && deliveryTime > now.getTime();
        const isLocked = isScheduled && item.author !== user.uid;
        const isReceived = item.author !== user.uid && recipientKey(item.recipient) === ownKey;
        const heading = isReceived
          ? `From ${getDisplayName(item.author, item.authorName || "Us")}`
          : `To ${recipientName(item.recipient)}`;

        return `
          <div class="letter-item" data-id="${item.id}">
            <div class="letter-left">
              <div class="letter-avatar">💌</div>
              <div class="letter-info">
                <h4>${esc(heading)}</h4>
                <p>${isLocked ? '🔒 <i>Scheduled Surprise (Hidden)</i>' : esc(item.body || '')}</p>
              </div>
            </div>
            <div class="letter-date">${isLocked ? '⏳ ' : ''}${dateStr}</div>
          </div>
        `;
      }).join("");
    }

    container.querySelectorAll(".letter-item").forEach((row) => {
      row.onclick = async () => {
        const letter = allLetters.find((l) => l.id === row.dataset.id);
        if (letter) {
          const nowIso = new Date().toISOString();
          if (letter.status === "Scheduled" && letter.deliverDate > nowIso && letter.author !== user.uid) {
            toast("This letter is a surprise and locked until delivery date!");
            return;
          }
          try {
            const body = letter.status === "Scheduled"
              ? letter.body || await getScheduledLetterBody(letter.id)
              : letter.body || "";
            $("#read-letter-title", el).textContent = `A letter from ${getDisplayName(letter.author, letter.authorName || "Us")} ♡`;
            $("#read-letter-date", el).textContent = letter.deliverDate
              ? new Date(letter.deliverDate).toLocaleString([], { dateStyle: "full", timeStyle: "short" })
              : "A little note, written just for you";
            $("#read-letter-body", el).textContent = body;
            const senderProfile = findProfileForAuthor(letter.author, letter.authorName || "");
            const senderKey = senderProfile ? recipientKey(senderProfile.name) : "";
            const canReply = letter.author !== user.uid &&
              recipientKey(letter.recipient) === ownKey &&
              senderKey &&
              senderKey !== ownKey;
            replyBtn.hidden = !canReply;
            replyBtn.dataset.recipient = canReply ? senderKey : "";
            openModal(readModal);
          } catch (error) {
            console.error("Could not open letter:", error);
            toast(error.message || "Could not open this letter.");
          }
        }
      };
    });

    const nextDelivery = allLetters
      .filter(item => item.status === "Scheduled" && item.deliverDate)
      .map(item => new Date(item.deliverDate).getTime())
      .filter(time => Number.isFinite(time) && time > now.getTime())
      .sort((a, b) => a - b)[0];
    clearTimeout(deliveryTimer);
    deliveryTimer = nextDelivery
      ? setTimeout(renderList, Math.min(nextDelivery - now.getTime() + 1, 2147483647))
      : null;
  }

  stopLetters = watchItems("letter", (items) => {
    if (!active || !el.isConnected) return;
    allLetters = items;
    renderList();
    for (const letter of items) {
      const canMigrate = letter.author === user.uid || recipientKey(letter.recipient) === ownKey;
      if (letter.status !== "Scheduled" || !letter.body || !canMigrate || migratingLetters.has(letter.id)) continue;
      migratingLetters.add(letter.id);
      migrateScheduledLetterBody(letter).catch(error => {
        console.error("Could not secure scheduled letter content:", error);
        if (active && el.isConnected) toast("A scheduled letter could not be secured.");
      }).finally(() => migratingLetters.delete(letter.id));
    }
  }, error => {
    console.error("Letters could not be loaded:", error);
    const container = $("#letters-list-container", el);
    if (container) container.innerHTML = `<p style="text-align:center; color:#9ca3af; padding:20px 0;">Letters could not be loaded. Please try again.</p>`;
  });
}

export function disposeLetters() {
  active = false;
  clearTimeout(deliveryTimer);
  deliveryTimer = null;
  stopLetters?.();
  stopLetters = null;
}