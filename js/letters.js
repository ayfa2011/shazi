import { $, esc, toast } from "./utils.js";
import { watchItems, addLetter, markLetterRead, getScheduledLetterBody, migrateScheduledLetterBody, notifyPartnerSafely } from "./firestore.js";
import { findProfileForAuthor, getDisplayName, getProfileKey } from "./profile-data.js";
import { APP_CONFIG } from "../config/app-config.js";
import { sendToTelegram, telegramMediaReferences } from "../src/services/telegramService.js";

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
      @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&display=swap');

      /* ── Notebook paper colour palette ─────────────────── */
      :root {
        --nb-line: #bed8f0;       /* horizontal ruling */
        --nb-margin: #ef6d7a;     /* red/pink margin line */
        --nb-bg: #fcfaf6;         /* warm ivory paper */
        --nb-ink: #162e51;        /* dark-blue/navy ink */
        --nb-line-h: 38px;        /* ruling pitch */
      }
      /* Warm ambient backdrop for full-screen mode */
      .letter-modal-box.is-fullscreen {
        width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0; padding: 16px; margin: 0; position: fixed; inset: 0; z-index: 1000;
        background: radial-gradient(ellipse at center, rgba(45, 22, 35, 0.92), rgba(20, 10, 16, 0.98));
        display: flex; flex-direction: column; align-items: center; justify-content: center;
      }
      .letter-modal-box.is-fullscreen .letter-paper-wrapper {
        width: 100%; max-width: 900px; height: 100%; max-height: 90vh;
        background: #fbf8f2; box-shadow: 0 10px 50px rgba(0,0,0,0.5);
        display: flex; flex-direction: column; position: relative;
      }

      /* ── Card shell ──────────────────────────────────────── */
      .letters-card {
        max-width: 650px;
        padding: 22px;
        border: 1px solid #f2dce6;
        border-radius: 24px;
        background: linear-gradient(145deg,#fff 35%,#fff8fb);
        box-shadow: 0 18px 48px rgba(139,47,88,.09);
        font-family: system-ui, -apple-system, sans-serif;
        margin: 0 auto;
      }
      .letters-header { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:20px; }
      .letters-title-area { display:flex; align-items:center; gap:12px; }
      .letters-icon { width:46px; height:46px; flex:none; display:flex; align-items:center; justify-content:center; background:linear-gradient(145deg,#ffe5ef,#ffd2e3); border-radius:50%; color:#b63368; font-size:22px; }
      .letters-text h3 { margin:0; color:#873456; font-size:21px; font-family:"Playfair Display",serif; }
      .letters-text p { margin:4px 0 0; color:#967b87; font-size:12px; line-height:1.4; }
      .write-letter-btn {
        flex:none; padding:11px 15px; border-radius:999px; border:none; cursor:pointer;
        background:linear-gradient(135deg,#e85c91,#c73d76); color:#fff; font-size:13px; font-weight:600;
        display:flex; align-items:center; gap:4px;
        box-shadow:0 7px 18px #d7478030; transition:transform .2s ease,box-shadow .2s ease;
      }
      .write-letter-btn:hover { transform:translateY(-2px); box-shadow:0 10px 22px #d7478040; }

      /* ── Tabs ────────────────────────────────────────────── */
      .letters-tabs { display:flex; gap:7px; padding:5px; border:1px solid #f4e8ee; border-radius:15px; background:#fffafd; margin-bottom:18px; }
      .tab-btn { flex:1; padding:9px 8px; border-radius:11px; border:none; background:transparent; color:#886e79; font-size:13px; font-weight:600; cursor:pointer; transition:background .2s ease,color .2s ease; }
      .tab-btn.active { background:#ffe7f0; color:#a72f62; }

      /* ── Letter list ─────────────────────────────────────── */
      .letters-list { display:flex; flex-direction:column; gap:9px; }
      .letter-item {
        position:relative; display:flex; align-items:center; justify-content:space-between;
        gap:12px; padding:13px; border:1px solid #f2e5eb; border-radius:17px;
        background:#fff; box-shadow:0 4px 13px #74314908; cursor:pointer;
        transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease;
      }
      .letter-item:hover { transform:translateY(-2px); border-color:#edbfd2; box-shadow:0 9px 20px #74314912; }
      .letter-left { display:flex; align-items:center; min-width:0; gap:11px; }
      .letter-envelope { position:relative; width:48px; height:38px; flex:none; display:grid; place-items:center; overflow:visible; border:1px solid #f0bfd1; border-radius:7px; background:linear-gradient(145deg,#fff9fc,#ffe4ee); color:#cc4b7b; font-size:20px; box-shadow:0 3px 8px #9a476313; }
      .letter-envelope::before { content:""; position:absolute; z-index:1; inset:0 0 auto; height:52%; border-radius:6px 6px 50% 50%; background:linear-gradient(150deg,#ffedf4,#f9c9dc); clip-path:polygon(0 0,100% 0,50% 100%); transform-origin:top; transition:transform .36s cubic-bezier(.2,.75,.2,1); }
      .letter-envelope::after { content:""; position:absolute; z-index:2; inset:auto 0 0; height:55%; border-radius:0 0 6px 6px; background:linear-gradient(35deg,#f7c9da 49%,transparent 50%),linear-gradient(-35deg,#fbe0e9 49%,transparent 50%); }
      .letter-item.is-opening .letter-envelope::before { transform:rotateX(180deg); }
      .letter-unread-dot { position:absolute; top:-5px; right:-5px; z-index:4; width:12px; height:12px; border:2px solid white; border-radius:50%; background:#ef3e65; box-shadow:0 1px 5px #a31d3f55; }
      .letter-info { min-width:0; }
      .letter-info h4 { margin:0; font-size:14px; font-weight:700; color:#5a3445; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .letter-info p { margin:3px 0 0; font-size:11px; color:#8e7a83; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:260px; }
      .letter-date { flex:none; color:#9b8790; font-size:10px; white-space:nowrap; }
      .letter-date .letter-read-receipt { display:block; margin-top:4px; text-align:right; }

      /* ── Modals ──────────────────────────────────────────── */
      .letter-modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; padding:18px; display:flex; align-items:center; justify-content:center; overflow-y:auto; background:rgba(49,20,36,.56); opacity:0; backdrop-filter:blur(5px); z-index:1000; }
      .letter-modal-overlay.is-open { animation:letter-overlay-in .25s ease forwards; }
      .letter-modal-box { width:min(520px,100%); max-height:calc(100dvh - 36px); overflow-y:auto; padding:23px; border:1px solid #f2dce6; border-radius:23px; background:#fffafd; box-shadow:0 25px 80px #30132144; }
      .letter-modal-overlay.is-open .letter-modal-box { animation:letter-modal-in .55s cubic-bezier(.2,.8,.2,1) both; }
      .letter-modal-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:15px; }
      .letter-modal-head h3 { margin:0; color:#873456; font-size:21px; font-family:"Playfair Display",serif; }
      .letter-close-btn { width:34px; height:34px; flex:none; border-radius:50%; border:none; background:#fff0f6; color:#9c3b64; font-size:21px; cursor:pointer; }
      .letter-form { display:grid; gap:12px; margin-top:0; }
      .letter-form label { display:grid; gap:6px; color:#795565; font-size:11px; font-weight:700; }
      .letter-form select,.letter-form input {
        width:100%; min-height:43px; margin:0; padding:10px; box-sizing:border-box;
        border:1px solid #efd6e1; border-radius:12px; background:#fff; color:#583447;
        font-size:13px; outline:none;
      }
      .letter-form select:focus,.letter-form input:focus { border-color:#db8eae; box-shadow:0 0 0 3px #ef6d9f16; }

      /* ── Notebook paper textarea & paper styles (Shared ruling) ── */
      .nb-ruling {
        background-color: var(--nb-bg);
        background-image:
          /* left margin red line */
          linear-gradient(90deg, transparent 0, transparent 40px, var(--nb-margin) 41px, var(--nb-margin) 42px, transparent 43px),
          /* horizontal ruling */
          repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--nb-line-h) - 1px), var(--nb-line) calc(var(--nb-line-h) - 1px), var(--nb-line) var(--nb-line-h));
        background-attachment: local;
        background-position: 0 32px; /* Calibrated to align baseline */
      }
      .letter-form textarea {
        width:100%; min-height:240px; resize:vertical; margin:0;
        padding: 40px 17px 20px 60px; /* Top padding calibrated to ruling */
        box-sizing:border-box; outline:none;
        border:1px solid #c5d8ee;
        border-radius:4px 12px 10px 4px;
        color: var(--nb-ink);
        font-family: "Caveat", "Segoe Print", "Bradley Hand", cursive;
        font-size: 22px;
        line-height: var(--nb-line-h);
        box-shadow: inset 0 1px 8px rgba(50,90,150,.05), 2px 3px 12px rgba(30,60,120,.06);
      }
      .letter-form textarea.nb-ruling {
        padding-top: 40px;
      }
      .letter-form textarea::placeholder { color:#88a8c8; opacity:1; font-style:italic; }
      .letter-form textarea:focus { border-color:#88b4d9; box-shadow:0 0 0 3px #bed8f028, inset 0 1px 8px rgba(50,90,150,.05); }

      /* Fullscreen enhancements */
      .letter-modal-box.is-fullscreen textarea {
        min-height: 80vh;
        font-size: 26px;
      }

      .letter-prompt { margin:0; color:#9a7c89; font-size:10px; text-align:center; }
      .letter-modal-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:3px; justify-content:flex-end; }
      .letter-modal-actions button,.read-letter-actions button { min-height:40px; padding:9px 14px; border-radius:12px; font-size:12px; font-weight:700; cursor:pointer; border:none; }
      .letter-cancel-btn { border:1px solid #efdde5 !important; background:#fff; color:#765a68; }
      .letter-send-btn { background:linear-gradient(135deg,#e85c91,#c73d76); color:#fff; box-shadow:0 6px 16px #d7478028; }

      /* ── Read-letter meta bar ────────────────────────────── */
      .read-letter-meta { display:flex; align-items:center; gap:9px; margin:0 0 15px; padding:10px 12px; border:1px solid #f0e1d0; border-radius:14px; background:linear-gradient(120deg,#fffaf0,#fffdf8); }
      .read-letter-sender-avatar { width:35px; height:35px; flex:none; display:grid; place-items:center; overflow:hidden; border:2px solid white; border-radius:50%; background:#ffe4ef; color:#96365f; font-weight:800; box-shadow:0 2px 7px #7340511c; }
      .read-letter-sender-avatar img { width:100%; height:100%; object-fit:cover; }
      .read-letter-meta-copy { min-width:0; flex:1; display:grid; gap:2px; }
      .read-letter-meta-copy strong { color:#754258; font-size:11px; }
      .read-letter-meta-copy time { color:#9b8790; font-size:10px; }
      .letter-read-receipt { flex:none; color:#8796a4; font-size:11px; font-weight:700; white-space:nowrap; }
      .letter-read-receipt.is-read { color:#299bd0; }

      .letter-paper {
        background-color: #fdeef4;
        background-image: url("./Asset/Letter Background.png");
        background-size: cover;
        background-position: center top;
        background-repeat: no-repeat;
        min-height: min(78dvh, 640px);
        max-height: 82dvh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        border-radius: 16px;
        box-shadow: 0 12px 40px #30132126;
      }
      .letter-paper-header {
        padding: 12px 16px;
        border-bottom: 1px dashed #f0e1d0;
        font-size: 11px;
        color: #877a85;
        flex: none;
      }
      .letter-paper-body {
        padding: 16px 18px 8px 18px;
        flex: 1;
        min-height: 0;
      }
      .letter-stage-text {
        line-height: 1.8;
        font-size: 16px;
        font-family: "Caveat", "Segoe Print", "Bradley Hand", cursive;
        color: #4a2438;
        min-height: 55vh;
      }
      .letter-stage-text p { margin: 0 0 0.7em 0; }
      .letter-stage-text b, .letter-stage-text strong { font-weight: 700; }
      .letter-stage-text .align-left { text-align: left; }
      .letter-stage-text .align-center { text-align: center; }
      .letter-stage-text .align-right { text-align: right; }
      .letter-stage-text .align-justify { text-align: justify; }
      .letter-stage-text .fs-xs { font-size: 13px; }
      .letter-stage-text .fs-sm { font-size: 15px; }
      .letter-stage-text .fs-md { font-size: 18px; }
      .letter-stage-text .fs-lg { font-size: 22px; }
      .letter-stage-text .fs-xl { font-size: 28px; }

      /* top-right corner: sender avatar + name + timestamp */
      .letter-paper-header {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 10px 14px 0 44px;
        min-height: var(--nb-line-h);
      }
      .letter-paper-avatar {
        width: 28px; height: 28px; flex: none;
        border-radius: 50%; overflow: hidden;
        border: 1.5px solid #c5d8ee;
        background: #ffe4ef; color: #96365f; font-weight: 800; font-size: 13px;
        display: grid; place-items: center;
      }
      .letter-paper-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .letter-paper-meta-text {
        display: grid; gap: 1px; text-align: right;
      }
      .letter-paper-meta-text strong {
        font-size: 11px; font-weight: 700; color: var(--nb-ink);
        font-family: "DM Sans", sans-serif; line-height: 1.2;
      }
      .letter-paper-meta-text time {
        font-size: 9px; color: #6688aa;
        font-family: "DM Sans", sans-serif; line-height: 1.2;
      }

      /* actual body text area – padding keeps text on the ruled lines */
      .letter-paper-body {
        padding: 4px 17px 20px 44px;
        min-height: 180px;
      }
      .letter-paper::after { content:"♡"; position:absolute; right:14px; bottom:8px; color:#d889a5; font:19px Georgia,serif; opacity:.75; }
      .letter-modal-overlay.is-open .letter-paper { animation:letter-paper-unfold .85s .08s cubic-bezier(.2,.75,.2,1) both; }

      .read-letter-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:17px; }
      .letter-reply-btn { background:#ffe5ef; color:#a72f62; }
      .letter-reply-btn[hidden] { display:none; }
      .letter-read-close { background:#f6edf1; color:#765a68; }

      /* ── Snap-status (other card) ────────────────────────── */
      .snap-status { margin-top:6px; font-size:11px; color:#9b8790; text-align:center; }

      /* ── Animations ──────────────────────────────────────── */
      @keyframes letter-overlay-in { to { opacity:1; } }
      @keyframes letter-modal-in { from { opacity:0; transform:translateY(16px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
      @keyframes letter-paper-unfold {
        0% { opacity:0; transform:perspective(900px) rotateX(-16deg) translateY(-9px) scale(.98); }
        55% { opacity:1; transform:perspective(900px) rotateX(3deg) translateY(0) scale(1); }
        100% { opacity:1; transform:perspective(900px) rotateX(0) translateY(0) scale(1); }
      }

      /* ── Mobile ──────────────────────────────────────────── */
      @media (max-width:480px) {
        .letters-card { padding:16px; border-radius:20px; }
        .letters-header { align-items:flex-start; }
        .write-letter-btn { padding:10px 12px; font-size:11px; }
        .letter-item { padding:11px; }
        .letter-date { font-size:9px; }
        .letter-modal-overlay { padding:10px; }
        .letter-modal-box { padding:18px; max-height:calc(100dvh - 20px); }
        .letter-form textarea { min-height:205px; font-size:18px; }
        .letter-paper { font-size:18px; }
      }
      @media (prefers-reduced-motion:reduce) {
        .letter-modal-overlay.is-open,.letter-modal-overlay.is-open .letter-modal-box,.letter-modal-overlay.is-open .letter-paper { animation-duration:.01ms; animation-delay:0ms; }
        .letter-item,.write-letter-btn { transition:none; }
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
          <div style="display:flex; gap:8px;">
            <button id="toggle-fullscreen-write" class="letter-close-btn" type="button" aria-label="Toggle Fullscreen">⛶</button>
            <button id="close-letter-modal" class="letter-close-btn" type="button" aria-label="Close letter form">×</button>
          </div>
        </div>
        <form id="write-letter-form" class="letter-form">
          <label>To
          <select id="letter-to" required>
            ${Object.entries(APP_CONFIG.profiles).map(([key, person]) => `<option value="${esc(key)}">To ${esc(person.name)}</option>`).join("")}
          </select>
          </label>
          <label>Your letter
          <textarea id="letter-body" class="nb-ruling" rows="6" placeholder="My dearest…&#10;&#10;Write from your heart ♡" required></textarea>
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
          <div style="display:flex; gap:8px;">
            <button id="toggle-fullscreen-read" class="letter-close-btn" type="button" aria-label="Toggle Fullscreen">⛶</button>
            <button id="close-read-modal" class="letter-close-btn" type="button" aria-label="Close letter">×</button>
          </div>
        </div>
        <div id="read-letter-meta" class="read-letter-meta"></div>
        <div id="read-letter-body" class="letter-paper nb-ruling">
          <div id="read-letter-paper-header" class="letter-paper-header"></div>
          <div id="read-letter-paper-text" class="letter-paper-body"></div>
        </div>
        <div class="read-letter-actions">
          <button id="reply-letter-btn" class="letter-reply-btn" type="button" hidden>Write a reply ♡</button>
          <button id="close-read-letter-btn" class="letter-read-close" type="button">Close letter</button>
        </div>
      </div>
    </div>
  `;

  const writeModal = $("#write-letter-modal", el);
  const writeModalBox = writeModal.querySelector(".letter-modal-box");
  const toggleFullscreenBtn = $("#toggle-fullscreen-write", el);

  toggleFullscreenBtn.onclick = () => {
    writeModalBox.classList.toggle("is-fullscreen");
    toggleFullscreenBtn.textContent = writeModalBox.classList.contains("is-fullscreen") ? "🗗" : "⛶";
  };

  const readModal = $("#read-letter-modal", el);
  const readModalBox = readModal.querySelector(".letter-modal-box");
  const toggleReadFullscreenBtn = $("#toggle-fullscreen-read", el);

  toggleReadFullscreenBtn.onclick = () => {
    readModalBox.classList.toggle("is-fullscreen");
    toggleReadFullscreenBtn.textContent = readModalBox.classList.contains("is-fullscreen") ? "🗗" : "⛶";
  };

  const statusSelect = $("#letter-status", el);
  const deliverGroup = $("#deliver-date-group", el);
  const deliverInput = $("#letter-deliver-date", el);
  const submitBtn = $("#submit-letter-btn", el);
  const recipientSelect = $("#letter-to", el);
  const letterBodyInput = $("#letter-body", el);
  const replyBtn = $("#reply-letter-btn", el);
  const migratingLetters = new Set();

  function asDate(value) {
    if (value?.toDate) return value.toDate();
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

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

      const sendLetterImage = async () => {
        try {
          const letterEl = document.getElementById('write-letter-form');
          if (!letterEl) return null;
          let imageDataUrl = null;
          if (typeof html2canvas !== 'undefined') {
            const canvas = await html2canvas(letterEl, {
              backgroundColor: null,
              useCORS: true,
              allowTaint: true,
              scale: 2,
              logging: false
            });
            imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
          } else {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 800;
            canvas.height = 1000;
            ctx.fillStyle = '#fcfbfb';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#1b365d';
            ctx.font = '20px Caveat, "Segoe Print", "Bradley Hand", cursive';
            ctx.fillText('Letter Content', 50, 100);
            imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
          }
          const response = await fetch(imageDataUrl);
          const blob = await response.blob();
          const file = new File([blob], `letter-${Date.now()}.jpg`, { type: 'image/jpeg' });
          const telegramResult = await sendToTelegram(file, `Letter from ${profile.name}`);
          console.log('Telegram upload succeeded:', telegramResult);
          return telegramResult;
        } catch (error) {
          console.error('Failed to convert or upload letter image:', error);
          return null;
        }
      };

      await sendLetterImage();

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
        const dateVal = asDate(item.deliverDate) || asDate(item.createdAt);
        const dateStr = dateVal ? dateVal.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : "Just now";
        const deliveryTime = item.deliverDate ? new Date(item.deliverDate).getTime() : 0;
        const isScheduled = item.status === "Scheduled" && deliveryTime > now.getTime();
        const isLocked = isScheduled && item.author !== user.uid;
        const isReceived = item.author !== user.uid && recipientKey(item.recipient) === ownKey;
        const heading = isReceived
          ? `From ${getDisplayName(item.author, item.authorName || "Us")}`
          : `To ${recipientName(item.recipient)}`;
        const isUnread = isReceived && !item.readAt;
        const readDate = asDate(item.readAt);

        return `
          <div class="letter-item" data-id="${item.id}">
            <div class="letter-left">
              <div class="letter-envelope" aria-hidden="true">💌${isUnread ? '<span class="letter-unread-dot"></span>' : ''}</div>
              <div class="letter-info">
                <h4>${esc(heading)}</h4>
                <p>${isLocked ? '🔒 <i>Scheduled Surprise (Hidden)</i>' : ''}</p>
              </div>
            </div>
            <div class="letter-date">${isLocked ? '⏳ ' : ''}${dateStr}${!isReceived && item.author === user.uid && !isScheduled ? `<span class="letter-read-receipt${readDate ? ' is-read' : ''}" title="${readDate ? `Read ${esc(readDate.toLocaleString())}` : 'Not read yet'}">${readDate ? '✓✓ Read' : 'Sent ✓'}</span>` : ''}</div>
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
            const shouldMarkRead = letter.author !== user.uid && recipientKey(letter.recipient) === ownKey && !letter.readAt;
            if (shouldMarkRead) {
              row.classList.add("is-opening");
              if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) await new Promise(resolve => setTimeout(resolve, 370));
            }
            const body = letter.status === "Scheduled"
              ? letter.body || await getScheduledLetterBody(letter.id)
              : letter.body || "";
            $("#read-letter-title", el).textContent = `A letter from ${getDisplayName(letter.author, letter.authorName || "Us")} ♡`;
            const senderProfile = findProfileForAuthor(letter.author, letter.authorName || "");
            const senderName = getDisplayName(letter.author, letter.authorName || "Us");
            const sentAt = asDate(letter.createdAt) || asDate(letter.deliverDate);
            const readAt = asDate(letter.readAt);
            const avatar = senderProfile?.avatar ? `<img src="${esc(senderProfile.avatar)}" alt="">` : esc(senderName[0] || "♡");
            $("#read-letter-meta", el).innerHTML = `<span class="read-letter-sender-avatar">${avatar}</span><span class="read-letter-meta-copy"><strong>From ${esc(senderName)}</strong><time>${sentAt ? esc(sentAt.toLocaleString([], { dateStyle: "full", timeStyle: "short" })) : "A little note, written just for you"}</time></span>${letter.author === user.uid ? `<span class="letter-read-receipt${readAt ? ' is-read' : ''}">${readAt ? '✓✓ Read' : 'Sent ✓'}</span>` : ""}`;
            $("#read-letter-body", el).textContent = body;
            const senderKey = senderProfile ? recipientKey(senderProfile.name) : "";
            const canReply = letter.author !== user.uid &&
              recipientKey(letter.recipient) === ownKey &&
              senderKey &&
              senderKey !== ownKey;
            replyBtn.hidden = !canReply;
            replyBtn.dataset.recipient = canReply ? senderKey : "";
            openModal(readModal);
            if (shouldMarkRead) void markLetterRead(letter.id).catch(error => console.error("Could not mark letter as read:", error));
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
