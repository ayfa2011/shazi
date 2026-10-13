import { $, esc, toast } from "./utils.js";
import { watchItems, addLetter, markLetterRead, removeItem, getScheduledLetterBody, migrateScheduledLetterBody, notifyPartnerSafely } from "./firestore.js";
import { findProfileForAuthor, getDisplayName, getProfileKey } from "./profile-data.js";
import { APP_CONFIG } from "../config/app-config.js";
import { sendToTelegram } from "../src/services/telegramService.js";

let stopLetters = null, deliveryTimer = null, active = false;

export function renderLetters(el, user, profile) {
  stopLetters?.();
  clearTimeout(deliveryTimer);
  deliveryTimer = null;
  active = true;
  const ownKey = getProfileKey(profile);
  let currentTab = "Inbox";
  let allLetters = [];
  let readFontScale = 1.0;
  let replyToId = null;

  el.classList.add("letters-scope");

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

  function sanitizeLetterHtml(html) {
    if (!html) return "";
    try {
      const doc = new DOMParser().parseFromString(String(html), "text/html");
      doc.querySelectorAll("script, style, iframe, object, embed, link, meta, base").forEach(node => node.remove());
      doc.querySelectorAll("*").forEach(node => {
        [...node.attributes].forEach(attr => {
          if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
          if ((attr.name === "href" || attr.name === "src") && /^\s*javascript:/i.test(attr.value)) {
            node.removeAttribute(attr.name);
          }
        });
      });
      return doc.body.innerHTML;
    } catch {
      return "";
    }
  }

  el.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&display=swap');

      .letters-scope {
        --nb-line: #bed8f0;
        --nb-margin: #ef6d7a;
        --nb-bg: #fcfaf6;
        --nb-ink: #162e51;
        --nb-line-h: 38px;
      }

      /* ── Card shell ─────────────────────────────────── */
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

      /* ── Tabs ───────────────────────────────────────── */
      .letters-tabs { display:flex; gap:7px; padding:5px; border:1px solid #f4e8ee; border-radius:15px; background:#fffafd; margin-bottom:18px; }
      .tab-btn { flex:1; padding:9px 8px; border-radius:11px; border:none; background:transparent; color:#886e79; font-size:13px; font-weight:600; cursor:pointer; transition:background .2s ease,color .2s ease; }
      .tab-btn.active { background:#ffe7f0; color:#a72f62; }

      /* ── Letter list ────────────────────────────────── */
      .letters-list { display:flex; flex-direction:column; gap:9px; }
      .letter-item {
        position:relative; display:flex; align-items:center; justify-content:space-between;
        gap:12px; padding:13px; border:1px solid #f2e5eb; border-radius:17px;
        background:#fff; box-shadow:0 4px 13px #74314908; cursor:pointer;
        transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease;
      }
      .letter-item:hover { transform:translateY(-2px); border-color:#edbfd2; box-shadow:0 9px 20px #74314912; }
      .letter-left { display:flex; align-items:center; min-width:0; gap:11px; }
      .letter-envelope { position:relative; width:48px; height:38px; flex:none; display:grid; place-items:center; overflow:visible; border:1px solid #f0bfd1; border-radius:7px; background:linear-gradient(145deg,#fff9fc,#ffe4ee); color:#cc4b7b; font-size:20px; box-shadow:0 3px 8px #9a476313; transition:transform .2s ease; }
      .letter-envelope::before { content:""; position:absolute; z-index:1; inset:0 0 auto; height:52%; border-radius:6px 6px 50% 50%; background:linear-gradient(150deg,#ffedf4,#f9c9dc); clip-path:polygon(0 0,100% 0,50% 100%); transform-origin:top; transition:transform .36s cubic-bezier(.2,.75,.2,1); }
      .letter-envelope::after { content:""; position:absolute; z-index:2; inset:auto 0 0; height:55%; border-radius:0 0 6px 6px; background:linear-gradient(35deg,#f7c9da 49%,transparent 50%),linear-gradient(-35deg,#fbe0e9 49%,transparent 50%); }
      /* Envelope stays open when the letter has been read */
      .letter-item.is-read .letter-envelope::before,
      .letter-item.is-opening .letter-envelope::before { transform:rotateX(180deg); }
      .letter-item.is-opening .letter-envelope { transform:scale(1.12); }
      .letter-unread-dot { position:absolute; top:-5px; right:-5px; z-index:4; width:12px; height:12px; border:2px solid white; border-radius:50%; background:#ef3e65; box-shadow:0 1px 5px #a31d3f55; animation:letter-dot-pulse 1.6s ease-in-out infinite; }
      @keyframes letter-dot-pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.14); } }
      .letter-info { min-width:0; flex:1; }
      .letter-info h4 { margin:0; font-size:14px; font-weight:700; color:#5a3445; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .letter-info p { margin:3px 0 0; font-size:11px; color:#8e7a83; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:260px; }
      .letter-date { flex:none; color:#9b8790; font-size:12px; line-height:1.35; white-space:nowrap; text-align:right; }
      .letter-date .letter-read-receipt { display:block; margin-top:4px; text-align:right; }

      /* ── Modals ─────────────────────────────────────── */
      .letter-modal-overlay { position:fixed; inset:0; padding:clamp(8px,2vw,24px); display:flex; align-items:center; justify-content:center; overflow-y:auto; background:rgba(49,20,36,.56); opacity:0; backdrop-filter:blur(5px); z-index:1000; }
      .letter-modal-overlay.is-open { animation:letter-overlay-in .25s ease forwards; }
      .letter-modal-box { width:min(780px,100%); max-height:calc(100dvh - 24px); overflow-y:auto; padding:clamp(16px,2.5vw,30px); border:1px solid #f2dce6; border-radius:23px; background:#fffafd; box-shadow:0 25px 80px #30132144; }
      .letter-modal-overlay.is-open .letter-modal-box { animation:letter-modal-in .55s cubic-bezier(.2,.8,.2,1) both; }
      .letter-modal-box.is-fullscreen { position:fixed; inset:0; z-index:1000; width:100vw; max-width:none; max-height:100dvh; height:100dvh; overflow-y:auto; border-radius:0; padding:max(12px,env(safe-area-inset-top)) 14px max(16px,env(safe-area-inset-bottom)); }
      .letter-modal-box.is-fullscreen .letter-editor-paper { height:calc(100dvh - 270px); min-height:300px; }
      .letter-modal-box.is-fullscreen .letter-editor-content { padding:30px 24px; }
      .letter-modal-box.is-fullscreen .letter-form { gap:10px; }
      .letter-modal-box.is-fullscreen .letter-prompt { display:none; }
      .letter-modal-box.is-fullscreen .letter-modal-head { position:sticky; top:0; z-index:2; background:#fffafd; }
      .letter-modal-box.is-fullscreen #read-letter-body { min-height:calc(100dvh - 205px); max-height:calc(100dvh - 185px); }
      .letter-modal-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:15px; }
      .letter-modal-head h3 { margin:0; color:#873456; font-size:clamp(22px,3vw,34px); font-family:"Playfair Display",serif; }
      .letter-close-btn { width:34px; height:34px; flex:none; border-radius:50%; border:none; background:#fff0f6; color:#9c3b64; font-size:21px; cursor:pointer; }
      .letter-form { display:grid; gap:12px; margin-top:0; }
      .letter-form label { display:grid; gap:6px; color:#795565; font-size:11px; font-weight:700; }
      .letter-form select,.letter-form input {
        width:100%; min-height:43px; margin:0; padding:10px; box-sizing:border-box;
        border:1px solid #efd6e1; border-radius:12px; background:#fff; color:#583447;
        font-size:13px; outline:none;
      }
      .letter-form select:focus,.letter-form input:focus { border-color:#db8eae; box-shadow:0 0 0 3px #ef6d9f16; }

      /* ═══════════════════════════════════════════════════════
         NOTEPAD PAPER — exactly like the reference image
         • Red vertical margin line on the left
         • Light blue horizontal ruling lines
         • Handwriting font, text sits ON each line
         ═══════════════════════════════════════════════════════ */
      .nb-ruling {
        /* Kept for backward-compat; visual is defined on .letter-editor-paper/.letter-paper */
        background: transparent;
      }

      /* Editorial handwriting fonts shared by the editor + read view */
      .letter-editor-content,
      .letter-stage-text,
      .letter-rich-text {
        font-family: "Caveat", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive;
      }

      /* ── Editor paper ───────────────────────────────── */
      .letter-editor-paper {
        position: relative;
        width: 100%;
        height: clamp(300px, 56dvh, 650px);
        min-height: 300px;
        overflow: auto;
        border: 1px solid #e5d5de;
        border-radius: 6px;
        background-color: #ffffff;
        /* Vertical pink margin line at 56px, horizontal blue ruling every 34px */
        background-image:
          linear-gradient(90deg,
            transparent 0,
            transparent 55px,
            #f5a8bd 55px,
            #f5a8bd 57px,
            transparent 57px),
          repeating-linear-gradient(to bottom,
            transparent 0,
            transparent 33px,
            #bed8ee 33px,
            #bed8ee 34px);
        background-size: 100% 100%, 100% 34px;
        background-position: 0 0, 0 6px;
        background-repeat: no-repeat, repeat;
        box-shadow: 0 4px 16px #30132112;
        -webkit-overflow-scrolling: touch;
        touch-action: manipulation;
      }
      .letter-editor-content {
        min-height: 100%;
        width: 100%;
        padding: 6px 22px 40px 74px; /* text starts right of margin line */
        outline: none;
        color: #1e3150;
        font-size: 22px;
        line-height: 34px; /* MUST match ruling pitch so text sits ON the line */
        caret-color: #c83f78;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        transform: translate(var(--letter-text-x,0px), var(--letter-text-y,0px));
        transform-origin: top left;
        touch-action: manipulation;
        -webkit-user-select: text;
        user-select: text;
      }
      .letter-editor-content:empty:before { content: attr(data-placeholder); color: #b38d9e; white-space: pre-wrap; pointer-events: none; }
      .letter-editor-content p { margin: 0; }
      .letter-editor-content.is-move-mode { cursor: grab; touch-action: none; user-select: none; }
      .letter-editor-content.is-move-mode:active { cursor: grabbing; }
      .letter-editor-paper.is-move-mode { border-color: #d982a7; }

      .letter-editor-label { font-size:12px; font-weight:800; color:#754258; }
      .letter-editor-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:8px; border:1px solid #f0dce6; border-radius:14px; background:#fffafd; }
      .letter-editor-toolbar button { min-width:34px; min-height:34px; padding:6px 9px; border-radius:9px; background:#fff; color:#754258; border:1px solid #f0dce6; font-size:13px; touch-action:manipulation; }
      .letter-editor-toolbar button[aria-pressed="true"] { background:#f8dce8; border-color:#d982a7; }
      .letter-editor-toolbar select { min-width:0; max-width:145px; flex:1; padding:8px 6px; border-radius:9px; font-size:11px; touch-action:manipulation; }
      .letter-editor-toolbar input[type="color"] { min-width:38px; height:34px; padding:2px; border-radius:9px; border:1px solid #f0dce6; background:#fff; cursor:pointer; touch-action:manipulation; }

      .letter-prompt { margin:0; color:#9a7c89; font-size:10px; text-align:center; }
      .letter-modal-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:3px; justify-content:flex-end; }
      .letter-modal-actions button,.read-letter-actions button { min-height:40px; padding:9px 14px; border-radius:12px; font-size:12px; font-weight:700; cursor:pointer; border:none; }
      .letter-cancel-btn { border:1px solid #efdde5 !important; background:#fff; color:#765a68; }
      .letter-send-btn { background:linear-gradient(135deg,#e85c91,#c73d76); color:#fff; box-shadow:0 6px 16px #d7478028; }

      /* ── Read-letter meta bar ───────────────────────── */
      .read-letter-meta { display:flex; align-items:center; gap:9px; margin:0 0 15px; padding:10px 12px; border:1px solid #f0e1d0; border-radius:14px; background:linear-gradient(120deg,#fffaf0,#fffdf8); }
      .read-letter-sender-avatar { width:35px; height:35px; flex:none; display:grid; place-items:center; overflow:hidden; border:2px solid white; border-radius:50%; background:#ffe4ef; color:#96365f; font-weight:800; box-shadow:0 2px 7px #7340511c; }
      .read-letter-sender-avatar img { width:100%; height:100%; object-fit:cover; }
      .read-letter-meta-copy { min-width:0; flex:1; display:grid; gap:2px; }
      .read-letter-meta-copy strong { color:#754258; font-size:13px; }
      .read-letter-meta-copy time { color:#8c7180; font-size:14px; font-weight:600; }
      .letter-read-receipt { flex:none; color:#8796a4; font-size:11px; font-weight:700; white-space:nowrap; }
      .letter-read-receipt.is-read { color:#299bd0; }

      /* ── READ LETTER PAPER (reference-matching) ───────── */
      .letter-paper {
        position: relative;
        width: min(100%, 600px);   /* A5-ish */
        aspect-ratio: 1 / 1.414;   /* true A-series ratio */
        max-height: 82dvh;
        margin: 0 auto;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        border: 1px solid #e3d3dc;
        border-radius: 4px;
        background-color: #ffffff;
        /* Pink margin line at 60px, blue ruling every 34px */
        background-image:
          linear-gradient(90deg,
            transparent 0,
            transparent 59px,
            #f5a8bd 59px,
            #f5a8bd 61px,
            transparent 61px),
          repeating-linear-gradient(to bottom,
            transparent 0,
            transparent 33px,
            #bed8ee 33px,
            #bed8ee 34px);
        background-size: 100% 100%, 100% 34px;
        background-position: 0 0, 0 10px;
        background-repeat: no-repeat, repeat;
        box-shadow: 0 14px 40px rgba(48,19,33,.14);
        -webkit-overflow-scrolling: touch;
        touch-action: manipulation;
      }

      /* Sender meta header — kept minimal so paper looks clean */
      .letter-paper-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px 12px 76px;
        min-height: 34px;
        background: transparent;
        border-bottom: 0;
        flex: none;
      }
      .letter-paper-avatar { width:32px; height:32px; flex:none; border-radius:50%; overflow:hidden; border:2px solid #f5a8bd; background:#ffe4ef; color:#96365f; font-weight:800; font-size:13px; display:grid; place-items:center; }
      .letter-paper-avatar img { width:100%; height:100%; object-fit:cover; }
      .letter-paper-meta-text { display:grid; gap:1px; }
      .letter-paper-meta-text strong { font-size:14px; font-weight:700; color:#1e3150; font-family:"Caveat","Segoe Print",cursive; line-height:1.2; }
      .letter-paper-meta-text time { font-size:13px; color:#7a8fa8; font-family:"Caveat","Segoe Print",cursive; line-height:1.2; }

      /* Body — text sits on the ruling */
      .letter-paper-body {
        padding: 0 22px 40px 76px;
        flex: 1;
        min-height: 220px;
      }
      .letter-stage-text,
      .letter-rich-text {
        font-size: calc(21px * var(--letter-font-scale, 1));
        line-height: 34px;   /* MUST match ruling pitch */
        color: #1e3150;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .letter-stage-text p,
      .letter-rich-text p { margin: 0; }
      .letter-stage-text b,
      .letter-stage-text strong,
      .letter-rich-text b,
      .letter-rich-text strong { font-weight: 700; }

      .letter-paper::after { content:"♡"; position:absolute; right:16px; bottom:12px; color:#e7a5bd; font:20px Georgia,serif; opacity:.7; pointer-events:none; }
      .letter-modal-overlay.is-open .letter-paper { animation:letter-paper-unfold .85s .08s cubic-bezier(.2,.75,.2,1) both; }

      /* ── Read modal font size controls ──────────────── */
      .letter-read-controls { display:flex; align-items:center; gap:6px; margin-bottom:10px; padding:6px 10px; border:1px solid #f0dce6; border-radius:999px; background:#fffafd; width:fit-content; }
      .letter-read-controls span { font-size:11px; font-weight:700; color:#754258; margin-right:2px; }
      .letter-read-controls button { min-width:32px; height:30px; padding:0 9px; border-radius:999px; background:#fff; border:1px solid #f0dce6; color:#754258; font-size:13px; font-weight:800; cursor:pointer; touch-action:manipulation; }
      .letter-read-controls button:hover { background:#fff0f6; }
      .letter-read-controls .letter-read-scale-value { min-width:42px; text-align:center; font-size:11px; color:#8c7180; font-weight:600; }

      /* ── Reply block inside read modal ──────────────── */
      .letter-replies-section { margin-top:18px; }
      .letter-replies-title { font-size:12px; font-weight:800; color:#754258; margin:0 0 8px; letter-spacing:.02em; }
      .letter-reply-card {
        margin-bottom:8px; padding:12px 14px 10px 46px;
        position:relative;
        border:1px solid #f0dce6;
        border-left:4px solid #c9a0b8;
        border-radius:12px;
        background:linear-gradient(145deg,#fff8fc,#fffdf9);
        box-shadow:0 3px 10px #74314908;
      }
      .letter-reply-card::before { content:"↩"; position:absolute; left:14px; top:12px; color:#c680a4; font-size:18px; line-height:1; }
      .letter-reply-card-head { font-size:11px; color:#8c7180; margin:0 0 4px; font-weight:700; }
      .letter-reply-card-body { font-family:"Caveat","Segoe Print","Bradley Hand",cursive; font-size:19px; line-height:28px; color:#1e3150; white-space:pre-wrap; overflow-wrap:anywhere; }
      .letter-reply-card-body p { margin:0; }
      .letter-replies-empty { font-size:12px; color:#9b8790; font-style:italic; }

      .read-letter-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; margin-top:17px; }
      .letter-reply-btn { background:#ffe5ef; color:#a72f62; }
      .letter-reply-btn[hidden] { display:none; }
      .letter-read-close { background:#f6edf1; color:#765a68; }
      .letter-delete-btn { background:#fff0f2; color:#bd3158; border:1px solid #f2b9c8 !important; }
      .letter-delete-btn:disabled { opacity:.55; cursor:wait; }

      /* ── Animations ─────────────────────────────────── */
      @keyframes letter-overlay-in { to { opacity:1; } }
      @keyframes letter-modal-in { from { opacity:0; transform:translateY(16px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
      @keyframes letter-paper-unfold {
        0% { opacity:0; transform:perspective(900px) rotateX(-16deg) translateY(-9px) scale(.98); }
        55% { opacity:1; transform:perspective(900px) rotateX(3deg) translateY(0) scale(1); }
        100% { opacity:1; transform:perspective(900px) rotateX(0) translateY(0) scale(1); }
      }

      /* ── Mobile ─────────────────────────────────────── */
      @media (max-width:480px) {
        .letters-card { padding:16px; border-radius:20px; }
        .letters-header { align-items:flex-start; }
        .write-letter-btn { padding:10px 12px; font-size:11px; }
        .letter-item { padding:11px; }
        .letter-date { font-size:11px; }
        .letter-modal-overlay { padding:10px; }
        .letter-modal-box { padding:18px; max-height:calc(100dvh - 20px); }
      }
      @media(max-width:600px) {
        .letter-modal-overlay { padding:0; align-items:stretch; }
        .letter-modal-box { width:100%; max-width:none; max-height:100dvh; height:100dvh; border-radius:0; padding:max(14px,env(safe-area-inset-top)) 14px max(14px,env(safe-area-inset-bottom)); }
        .letter-editor-paper { height:calc(100dvh - 350px); min-height:240px; }
        .letter-modal-box.is-fullscreen .letter-editor-paper { height:calc(100dvh - 340px); min-height:240px; }
        .letter-paper { width:100%; aspect-ratio:auto; min-height:calc(100dvh - 260px); max-height:calc(100dvh - 200px); border-radius:2px; }
        .letter-paper-header { padding-left:64px; padding-right:12px; }
        .letter-paper-body { padding-left:64px; padding-right:14px; padding-bottom:32px; }
        .letter-editor-content { padding-left:66px; padding-right:14px; }
        .read-letter-actions { justify-content:stretch; gap:6px; }
        .read-letter-actions button { flex:1; padding:10px 8px; }
        .letter-editor-toolbar select { min-height:36px; font-size:12px; }
      }
      @media (prefers-reduced-motion:reduce) {
        .letter-modal-overlay.is-open,.letter-modal-overlay.is-open .letter-modal-box,.letter-modal-overlay.is-open .letter-paper { animation-duration:.01ms; animation-delay:0ms; }
        .letter-item,.write-letter-btn,.letter-envelope,.letter-unread-dot { transition:none; animation:none; }
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
          <h3 id="write-letter-heading">Write a Letter ♡</h3>
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
          <div class="letter-editor-label">Your letter</div>
          <div class="letter-editor-toolbar" role="toolbar" aria-label="Letter text formatting">
            <button type="button" data-letter-command="bold" aria-label="Bold"><strong>B</strong></button>
            <button type="button" data-letter-command="italic" aria-label="Italic"><em>I</em></button>
            <button type="button" data-letter-command="underline" aria-label="Underline"><u>U</u></button>
            <input type="color" id="letter-text-color" value="#1e3150" aria-label="Text color" title="Text color">
            <select id="letter-font-family" aria-label="Font style">
              <option value="Caveat">Handwritten</option>
              <option value="Arial">Classic</option>
              <option value="Georgia">Elegant</option>
              <option value="Verdana">Clean</option>
              <option value="monospace">Typewriter</option>
            </select>
            <select id="letter-font-size" aria-label="Text size">
              <option value="16px">Small</option>
              <option value="20px" selected>Normal</option>
              <option value="24px">Large</option>
              <option value="30px">Extra large</option>
              <option value="38px">Huge</option>
            </select>
            <button type="button" data-letter-command="justifyLeft" aria-label="Align left">≡</button>
            <button type="button" data-letter-command="justifyCenter" aria-label="Center text">☰</button>
            <button type="button" data-letter-command="justifyRight" aria-label="Align right">☷</button>
            <button type="button" id="letter-move-text" aria-pressed="false" title="Drag to reposition text">↔ Move text</button>
          </div>
          <div class="letter-editor-paper" id="letter-editor-paper">
            <div id="letter-body" class="letter-editor-content" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Write your letter" data-placeholder="My dearest…&#10;&#10;Write from your heart ♡"></div>
          </div>
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
        <div class="letter-read-controls" role="group" aria-label="Letter text size">
          <span>Text size</span>
          <button type="button" id="read-font-decrease" aria-label="Decrease text size">A−</button>
          <span class="letter-read-scale-value" id="read-font-value">100%</span>
          <button type="button" id="read-font-increase" aria-label="Increase text size">A＋</button>
        </div>
        <div id="read-letter-body" class="letter-paper">
          <div id="read-letter-paper-header" class="letter-paper-header"></div>
          <div id="read-letter-paper-text" class="letter-paper-body"></div>
        </div>
        <div id="read-letter-replies" class="letter-replies-section"></div>
        <div class="read-letter-actions">
          <button id="reply-letter-btn" class="letter-reply-btn" type="button" hidden>Write a reply ♡</button>
          <button id="delete-read-letter-btn" class="letter-delete-btn" type="button">Delete letter</button>
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
  let openedLetter = null;
  const deleteLetterBtn = $("#delete-read-letter-btn", el);
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
  const editorPaper = $("#letter-editor-paper", el);
  const fontFamilySelect = $("#letter-font-family", el);
  const fontSizeSelect = $("#letter-font-size", el);
  const textColorInput = $("#letter-text-color", el);
  const moveTextButton = $("#letter-move-text", el);
  const writeHeading = $("#write-letter-heading", el);
  const readPaper = $("#read-letter-body", el);
  const readFontValue = $("#read-font-value", el);
  const repliesContainer = $("#read-letter-replies", el);
  let moveTextState = { x: 0, y: 0 };
  let dragState = null;

  function focusLetterEditor() {
    letterBodyInput.focus({ preventScroll: true });
  }

  function applyLetterCommand(command, value = null) {
    focusLetterEditor();
    document.execCommand(command, false, value);
  }

  el.querySelectorAll("[data-letter-command]").forEach(button => {
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => applyLetterCommand(button.dataset.letterCommand));
  });

  fontFamilySelect.onchange = () => {
    focusLetterEditor();
    document.execCommand("fontName", false, fontFamilySelect.value);
  };

  fontSizeSelect.onchange = () => {
    focusLetterEditor();
    document.execCommand("fontSize", false, "7");
    letterBodyInput.querySelectorAll('font[size="7"]').forEach(node => {
      const span = document.createElement("span");
      span.style.fontSize = fontSizeSelect.value;
      while (node.firstChild) span.appendChild(node.firstChild);
      node.replaceWith(span);
    });
  };

  textColorInput.oninput = () => {
    focusLetterEditor();
    document.execCommand("foreColor", false, textColorInput.value);
  };

  moveTextButton.onclick = () => {
    const enabled = moveTextButton.getAttribute("aria-pressed") !== "true";
    moveTextButton.setAttribute("aria-pressed", String(enabled));
    moveTextButton.textContent = enabled ? "✓ Drag text" : "↔ Move text";
    letterBodyInput.classList.toggle("is-move-mode", enabled);
    editorPaper.classList.toggle("is-move-mode", enabled);
    if (enabled) toast("Drag the text to reposition it. Tap Move text again to type.");
  };

  letterBodyInput.addEventListener("pointerdown", event => {
    if (!letterBodyInput.classList.contains("is-move-mode")) return;
    dragState = { x: event.clientX, y: event.clientY, startX: moveTextState.x, startY: moveTextState.y };
    letterBodyInput.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  letterBodyInput.addEventListener("pointermove", event => {
    if (!dragState) return;
    moveTextState.x = Math.max(-120, Math.min(120, dragState.startX + event.clientX - dragState.x));
    moveTextState.y = Math.max(-120, Math.min(240, dragState.startY + event.clientY - dragState.y));
    letterBodyInput.style.setProperty("--letter-text-x", `${moveTextState.x}px`);
    letterBodyInput.style.setProperty("--letter-text-y", `${moveTextState.y}px`);
  });
  const stopDrag = () => { dragState = null; };
  letterBodyInput.addEventListener("pointerup", stopDrag);
  letterBodyInput.addEventListener("pointercancel", stopDrag);

  const replyBtn = $("#reply-letter-btn", el);
  const migratingLetters = new Set();

  function asDate(value) {
    if (value?.toDate) return value.toDate();
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function resetLetterEditorState() {
    letterBodyInput.innerHTML = "";
    letterBodyInput.style.setProperty("--letter-text-x", "0px");
    letterBodyInput.style.setProperty("--letter-text-y", "0px");
    moveTextState = { x: 0, y: 0 };
    moveTextButton.setAttribute("aria-pressed", "false");
    moveTextButton.textContent = "↔ Move text";
    letterBodyInput.classList.remove("is-move-mode");
    editorPaper.classList.remove("is-move-mode");
    fontSizeSelect.value = "20px";
    textColorInput.value = "#1e3150";
  }

  function renderLetterBody(target, body) {
    target.innerHTML = "";
    const text = String(body || "");
    const looksLikeHtml = /<\/?(?:p|div|br|b|strong|i|em|u|span|font)\b/i.test(text);
    if (!looksLikeHtml) {
      const content = document.createElement("div");
      content.className = "letter-rich-text";
      content.textContent = text;
      target.appendChild(content);
      return;
    }
    const parsed = new DOMParser().parseFromString(text, "text/html");
    const allowedTags = new Set(["P", "DIV", "BR", "B", "STRONG", "I", "EM", "U", "SPAN", "FONT"]);
    const copySafe = node => {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue || "");
      if (node.nodeType !== Node.ELEMENT_NODE || !allowedTags.has(node.tagName)) {
        const fragment = document.createDocumentFragment();
        [...(node.childNodes || [])].forEach(child => fragment.appendChild(copySafe(child)));
        return fragment;
      }
      const copy = document.createElement(node.tagName.toLowerCase());
      if (["SPAN", "FONT", "DIV", "P"].includes(node.tagName)) {
        const style = node.getAttribute("style") || "";
        const size = style.match(/font-size\s*:\s*(\d+(?:\.\d+)?(?:px|pt|em|rem|%))/i)?.[1];
        const family = style.match(/font-family\s*:\s*([^;]+)/i)?.[1] || node.getAttribute("face");
        const color = style.match(/color\s*:\s*(#[0-9a-f]{3,8}|[a-z]+)/i)?.[1] || node.getAttribute("color");
        const align = style.match(/text-align\s*:\s*(left|right|center|justify)/i)?.[1] || node.getAttribute("align");
        const transform = style.match(/transform\s*:\s*translate\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px\s*\)/i);
        if (size) copy.style.fontSize = size;
        if (family) copy.style.fontFamily = family.replace(/["']/g, "").slice(0, 80);
        if (color) copy.style.color = color;
        if (align) copy.style.textAlign = align;
        if (transform) {
          const x = Math.max(-120, Math.min(120, Number(transform[1])));
          const y = Math.max(-120, Math.min(240, Number(transform[2])));
          copy.style.transform = `translate(${x}px, ${y}px)`;
        }
      }
      [...node.childNodes].forEach(child => copy.appendChild(copySafe(child)));
      return copy;
    };
    const content = document.createElement("div");
    content.className = "letter-rich-text";
    [...parsed.body.childNodes].forEach(node => content.appendChild(copySafe(node)));
    target.appendChild(content);
  }

  function openModal(modal) {
    modal.style.display = "flex";
    modal.classList.remove("is-open");
    requestAnimationFrame(() => modal.classList.add("is-open"));
  }

  function closeModal(modal) {
    modal.classList.remove("is-open");
    modal.style.display = "none";
    const box = modal.querySelector(".letter-modal-box");
    if (box?.classList.contains("is-fullscreen")) {
      box.classList.remove("is-fullscreen");
      const toggle = modal.id === "write-letter-modal" ? toggleFullscreenBtn : toggleReadFullscreenBtn;
      if (toggle) toggle.textContent = "⛶";
    }
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
    replyToId = null;
    writeHeading.textContent = "Write a Letter ♡";
    recipientSelect.value = Object.keys(APP_CONFIG.profiles).find(key => key !== ownKey) || ownKey;
    openModal(writeModal);
  };
  $("#close-letter-modal", el).onclick = () => closeModal(writeModal);
  $("#cancel-letter-btn", el).onclick = () => {
    resetLetterEditorState();
    $("#write-letter-form", el).reset();
    deliverGroup.style.display = "none";
    deliverInput.required = false;
    submitBtn.textContent = "Send with love ♡";
    replyToId = null;
    closeModal(writeModal);
  };
  $("#close-read-modal", el).onclick = () => closeModal(readModal);
  $("#close-read-letter-btn", el).onclick = () => closeModal(readModal);

  function updateReadScale() {
    readPaper.style.setProperty("--letter-font-scale", String(readFontScale));
    if (readFontValue) readFontValue.textContent = `${Math.round(readFontScale * 100)}%`;
  }
  $("#read-font-decrease", el).onclick = () => {
    readFontScale = Math.max(0.75, Number((readFontScale - 0.1).toFixed(2)));
    updateReadScale();
  };
  $("#read-font-increase", el).onclick = () => {
    readFontScale = Math.min(1.8, Number((readFontScale + 0.1).toFixed(2)));
    updateReadScale();
  };

  deleteLetterBtn.onclick = async () => {
    if (!openedLetter?.id) return;
    if (!window.confirm("Delete this letter? This cannot be undone.")) return;
    deleteLetterBtn.disabled = true;
    try {
      await removeItem(openedLetter.id);
      openedLetter = null;
      closeModal(readModal);
      toast("Letter deleted ♡");
    } catch (error) {
      console.error("Could not delete letter:", error);
      toast("Could not delete this letter. Please check your permissions.");
    } finally {
      deleteLetterBtn.disabled = false;
    }
  };

  replyBtn.onclick = () => {
    const replyRecipient = replyBtn.dataset.recipient;
    if (!replyRecipient) return;
    const replyToIdToUse = openedLetter?.id || null;
    closeModal(readModal);
    recipientSelect.value = replyRecipient;
    resetLetterEditorState();
    replyToId = replyToIdToUse;
    writeHeading.textContent = replyToId ? "Write a Reply ♡" : "Write a Letter ♡";
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
    const plainBody = letterBodyInput.innerText.trim();
    const rawContent = letterBodyInput.innerHTML.trim();
    const bodyContent = sanitizeLetterHtml(rawContent);
    const body = `<div style="transform:translate(${moveTextState.x}px, ${moveTextState.y}px)">${bodyContent}</div>`;
    if (!plainBody) {
      toast("Please write your letter first ♡");
      focusLetterEditor();
      return;
    }
    const status = statusSelect.value;
    const deliverDate = status === "Scheduled" ? new Date(deliverInput.value).toISOString() : new Date().toISOString();

    try {
      const payload = {
        recipient, body, status, deliverDate,
        author: user.uid,
        authorName: profile.name,
        createdAt: new Date().toISOString()
      };
      if (replyToId) payload.replyTo = replyToId;

      const letter = await addLetter(payload);
      if (status === "Sent" && recipient !== ownKey) {
        const msg = replyToId ? "New reply received." : "New letter received.";
        void notifyPartnerSafely(ownKey, "letter", msg, letter.id, "letters");
      }

      let letterImageData = null;
      if (typeof html2canvas !== "undefined") {
        try {
          const target = $("#letter-editor-paper", el);
          if (target) {
            const canvas = await html2canvas(target, {
              backgroundColor: "#ffffff",
              useCORS: true,
              allowTaint: true,
              scale: 2,
              logging: false
            });
            letterImageData = canvas.toDataURL("image/jpeg", 0.95);
          }
        } catch (captureError) {
          console.error("Letter capture failed:", captureError);
        }
      }

      closeModal(writeModal);
      $("#write-letter-form", el).reset();
      resetLetterEditorState();
      deliverGroup.style.display = "none";
      deliverInput.required = false;
      submitBtn.textContent = "Send with love ♡";
      replyToId = null;
      writeHeading.textContent = "Write a Letter ♡";
      toast(status === "Scheduled" ? "Letter scheduled ♡" : "Letter sent ♡");

      if (letterImageData) {
        void (async () => {
          try {
            const response = await fetch(letterImageData);
            const blob = await response.blob();
            const file = new File([blob], `letter-${Date.now()}.jpg`, { type: "image/jpeg" });
            const telegramResult = await sendToTelegram(file, `Letter from ${profile.name}`);
            console.log("Telegram upload succeeded:", telegramResult);
          } catch (uploadError) {
            console.error("Telegram upload failed:", uploadError);
          }
        })();
      }
    } catch (err) {
      console.error("Could not send letter:", err);
      toast("Could not send letter. Try again.");
    }
  };

  function renderList() {
    const container = $("#letters-list-container", el);
    const now = new Date();

    const filtered = allLetters
      .filter((item) => {
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
      })
      .sort((a, b) => {
        const at = asDate(a.createdAt)?.getTime() || 0;
        const bt = asDate(b.createdAt)?.getTime() || 0;
        return bt - at;
      });

    if (filtered.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:#9ca3af; padding:20px 0;">No letters in ${currentTab}</p>`;
    } else {
      container.innerHTML = filtered.map((item) => {
        const dateVal = asDate(item.deliverDate) || asDate(item.createdAt);
        const dateStr = dateVal ? dateVal.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Just now";
        const timeStr = dateVal ? dateVal.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        const deliveryTime = item.deliverDate ? new Date(item.deliverDate).getTime() : 0;
        const isScheduled = item.status === "Scheduled" && deliveryTime > now.getTime();
        const isLocked = isScheduled && item.author !== user.uid;
        const isReceived = item.author !== user.uid && recipientKey(item.recipient) === ownKey;
        const heading = isReceived
          ? `From ${getDisplayName(item.author, item.authorName || "Us")}`
          : `To ${recipientName(item.recipient)}`;
        const isUnread = isReceived && !item.readAt;
        const readDate = asDate(item.readAt);
        const isReadPersistent = Boolean(item.readAt) && isReceived;
        const lockedHtml = isLocked ? `<p>🔒 <i>Scheduled Surprise (Hidden)</i></p>` : "";

        return `
          <div class="letter-item${isReadPersistent ? " is-read" : ""}" data-id="${item.id}">
            <div class="letter-left">
              <div class="letter-envelope" aria-hidden="true">💌${isUnread ? '<span class="letter-unread-dot"></span>' : ""}</div>
              <div class="letter-info">
                <h4>${esc(heading)}</h4>
                ${lockedHtml}
              </div>
            </div>
            <div class="letter-date">
              ${isLocked ? "⏳ " : ""}${dateStr}<br><span style="font-size:11px;color:#8c7180;">${timeStr}</span>
              ${!isReceived && item.author === user.uid && !isScheduled ? `<span class="letter-read-receipt${readDate ? " is-read" : ""}" title="${readDate ? `Read ${esc(readDate.toLocaleString())}` : "Not read yet"}">${readDate ? "✓✓ Read" : "Sent ✓"}</span>` : ""}
            </div>
          </div>
        `;
      }).join("");
    }

    container.querySelectorAll(".letter-item").forEach((row) => {
      row.onclick = async () => {
        const letter = allLetters.find((l) => l.id === row.dataset.id);
        if (!letter) return;
        openedLetter = letter;
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
          const dateLine = sentAt
            ? `${esc(sentAt.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}`
            : "A little note, written just for you";
          const timeLine = sentAt ? esc(sentAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })) : "";
          $("#read-letter-meta", el).innerHTML = `<span class="read-letter-sender-avatar">${avatar}</span><span class="read-letter-meta-copy"><strong>From ${esc(senderName)}</strong><time>${dateLine}</time>${timeLine ? `<time>${timeLine}</time>` : ""}</span>${letter.author === user.uid ? `<span class="letter-read-receipt${readAt ? " is-read" : ""}">${readAt ? "✓✓ Read" : "Sent ✓"}</span>` : ""}`;
          renderLetterBody($("#read-letter-paper-text", el), body);
          renderLetterReplies(letter);
          const senderKey = senderProfile ? recipientKey(senderProfile.name) : "";
          const canReply = letter.author !== user.uid &&
            recipientKey(letter.recipient) === ownKey &&
            senderKey &&
            senderKey !== ownKey;
          replyBtn.hidden = !canReply;
          replyBtn.dataset.recipient = canReply ? senderKey : "";
          updateReadScale();
          openModal(readModal);

          if (shouldMarkRead) {
            const readAtIso = new Date().toISOString();
            allLetters = allLetters.map(l => l.id === letter.id ? { ...l, readAt: readAtIso } : l);
            if (openedLetter?.id === letter.id) openedLetter = { ...openedLetter, readAt: readAtIso };
            renderList();
            void markLetterRead(letter.id).catch(error => console.error("Could not mark letter as read:", error));
          }
        } catch (error) {
          console.error("Could not open letter:", error);
          toast(error.message || "Could not open this letter.");
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

  function renderLetterReplies(letter) {
    if (!repliesContainer) return;
    if (!letter?.id) { repliesContainer.innerHTML = ""; return; }
    const replies = allLetters
      .filter(item => item.replyTo === letter.id)
      .sort((a, b) => (asDate(a.createdAt)?.getTime() || 0) - (asDate(b.createdAt)?.getTime() || 0));

    if (!replies.length) { repliesContainer.innerHTML = ""; return; }

    repliesContainer.innerHTML = `
      <p class="letter-replies-title">Replies (${replies.length})</p>
      ${replies.map(reply => {
        const when = asDate(reply.createdAt) || asDate(reply.deliverDate);
        const whenStr = when ? when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
        const who = getDisplayName(reply.author, reply.authorName || "Us");
        return `<article class="letter-reply-card">
          <p class="letter-reply-card-head">${esc(who)} · ${esc(whenStr)}</p>
          <div class="letter-reply-card-body" data-reply-body-id="${esc(reply.id)}"></div>
        </article>`;
      }).join("")}
    `;

    replies.forEach(reply => {
      const target = repliesContainer.querySelector(`[data-reply-body-id="${CSS.escape(reply.id)}"]`);
      if (!target) return;
      renderLetterBody(target, reply.body || "");
      const body = target.querySelector(".letter-rich-text");
      if (body) body.style.fontSize = "calc(19px * var(--letter-font-scale, 1))";
    });
  }

  try {
    stopLetters = watchItems("letter", (items) => {
      if (!active || !el.isConnected) return;
      allLetters = items;
      renderList();
      if (openedLetter && !readModal.classList.contains("hidden")) {
        renderLetterReplies(openedLetter);
      }
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
  } catch (error) {
    console.error("Letters could not be loaded:", error);
    const container = $("#letters-list-container", el);
    if (container) container.innerHTML = `<p style="text-align:center; color:#9ca3af; padding:20px 0;">Letters could not be loaded. Please try again.</p>`;
  }
}

export function disposeLetters() {
  active = false;
  clearTimeout(deliveryTimer);
  deliveryTimer = null;
  stopLetters?.();
  stopLetters = null;
}