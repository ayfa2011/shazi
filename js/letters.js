import { $, esc, toast } from "./utils.js";
import { watchItems, addLetter, markLetterRead, removeItem, getScheduledLetterBody, migrateScheduledLetterBody, notifyPartnerSafely } from "./firestore.js";
import { findProfileForAuthor, getDisplayName, getProfileKey } from "./profile-data.js";
import { APP_CONFIG } from "../config/app-config.js";
import { sendToTelegram } from "../src/services/telegramService.js";

let stopLetters = null, deliveryTimer = null, active = false, visibilityHandler = null, persistDraftOnDispose = null;
let html2canvasPromise = null;

function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (html2canvasPromise) return html2canvasPromise;
  html2canvasPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.async = true;
    script.onload = () => window.html2canvas ? resolve(window.html2canvas) : reject(new Error("Letter preview renderer did not initialize."));
    script.onerror = () => { html2canvasPromise = null; reject(new Error("Letter preview renderer could not be loaded.")); };
    document.head.append(script);
  });
  return html2canvasPromise;
}

export function renderLetters(el, user, profile) {
  stopLetters?.();
  clearTimeout(deliveryTimer);
  deliveryTimer = null;
  if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
  active = true;
  const ownKey = getProfileKey(profile);
  const draftStorageKey = `olw-letter-draft:${user.uid}:${ownKey || "profile"}`;
  let draftSaveTimer = null;
  let sendingLetter = false;
  let composeFontSize = 20;
  let composerOpened = false;
  let currentTab = "Inbox";
  let allLetters = [];
  // Optimistic local state prevents the unread dot flashing back while Firestore syncs.
  const locallyReadLetterIds = new Set();
  let replyToId = null;
  let openingLetterGeneration = 0;

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
      .letter-item:focus-visible { outline:3px solid #e9a4c0; outline-offset:3px; }
      .letter-item.is-unread { border-color:#efc1d4; background:linear-gradient(115deg,#fff 45%,#fff5f9); box-shadow:0 5px 18px #c84d7d10; }
      .letter-item.is-unread::after { content:""; position:absolute; left:0; top:13px; bottom:13px; width:3px; border-radius:0 4px 4px 0; background:linear-gradient(#f28ab1,#d94e88); }
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
      .letter-open-hint { display:inline-flex; align-items:center; gap:5px; margin-top:6px; color:#c04479; font-size:11px; font-weight:700; letter-spacing:.01em; animation:letter-hint-glow 2s ease-in-out infinite; }
      .letter-open-hint .hint-arrow { display:inline-block; animation:letter-hint-nudge 1.2s ease-in-out infinite; }
      .letter-item.is-unread .letter-envelope { animation:letter-envelope-float 2.6s ease-in-out infinite; }
      .letter-date { flex:none; color:#9b8790; font-size:12px; line-height:1.35; white-space:nowrap; text-align:right; }
      .letter-date .letter-read-receipt { display:block; margin-top:4px; text-align:right; }
      .letter-read-receipt { color:#8796a4; font-size:11px; font-weight:700; white-space:nowrap; }
      .letter-read-receipt.is-read { color:#299bd0; }

      /* ── Modals ─────────────────────────────────────── */
      .letter-modal-overlay { position:fixed; inset:0; padding:clamp(8px,2vw,24px); display:flex; align-items:center; justify-content:center; overflow-y:auto; background:rgba(49,20,36,.56); opacity:0; backdrop-filter:blur(5px); z-index:1000; }
      .letter-modal-overlay.is-open { animation:letter-overlay-in .25s ease forwards; }
      .letter-modal-box { width:min(780px,100%); max-height:calc(100dvh - 24px); overflow-y:auto; padding:clamp(16px,2.5vw,30px); border:1px solid #f2dce6; border-radius:23px; background:#fffafd; box-shadow:0 25px 80px #30132144; }
      .letter-read-modal-box { width:min(920px,100%); background:linear-gradient(145deg,#fffafd,#fff5f9); }
      .letter-read-modal-box .letter-paper { width:min(100%,680px); max-height:84dvh; }
      .letter-modal-overlay.is-open .letter-modal-box { animation:letter-modal-in .55s cubic-bezier(.2,.8,.2,1) both; }
      .letter-modal-box.is-fullscreen { position:fixed; inset:0; z-index:1000; width:100vw; max-width:none; max-height:100dvh; height:100dvh; overflow-y:auto; border-radius:0; padding:max(12px,env(safe-area-inset-top)) 14px max(16px,env(safe-area-inset-bottom)); }
      .letter-modal-box.is-fullscreen .letter-editor-paper { height:calc(100dvh - 270px); min-height:300px; }
      .letter-modal-box.is-fullscreen .letter-editor-content { padding:30px 24px; }
      .letter-modal-box.is-fullscreen .letter-form { gap:10px; }
      .letter-modal-box.is-fullscreen .letter-prompt { display:none; }
      .letter-modal-box.is-fullscreen .letter-modal-head { position:sticky; top:0; z-index:2; background:#fffafd; }
      #read-letter-modal { position:fixed; inset:0; z-index:1000; align-items:stretch; justify-content:center; overflow-y:auto; padding:0; background:linear-gradient(150deg,#fff3f8,#fffafd 50%,#f8f4ff); opacity:1; backdrop-filter:none; }
      #read-letter-modal.is-open { animation:none; }
      #read-letter-modal .letter-read-modal-box { width:min(900px,100%); max-width:none; height:auto; min-height:100dvh; max-height:none; overflow:visible; padding:clamp(20px,5vw,56px); border:0; border-radius:0; background:transparent; box-shadow:none; animation:none; }
      #read-letter-modal .letter-paper { max-height:none; box-shadow:0 12px 35px rgba(48,19,33,.11); }
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
        font-size: var(--letter-compose-font-size, 20px);
        line-height: 34px; /* MUST match ruling pitch so text sits ON the line */
        caret-color: #c83f78;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        transform-origin: top left;
        touch-action: manipulation;
        -webkit-user-select: text;
        user-select: text;
      }
      .letter-editor-content:empty:before { content: attr(data-placeholder); color: #b38d9e; white-space: pre-wrap; pointer-events: none; }
      .letter-editor-content p { margin: 0; }
      .letter-editor-toolbar { display:inline-flex; align-items:center; gap:8px; width:fit-content; padding:4px 8px; border:1px solid #f0dce6; border-radius:999px; background:#fffafd; }
      .letter-editor-toolbar button { min-width:34px; min-height:32px; padding:5px 8px; border-radius:999px; background:#fff; color:#754258; border:1px solid #f0dce6; font-size:13px; font-weight:800; touch-action:manipulation; }
      .letter-font-label { color:#754258; font-size:11px; font-weight:700; }
      .letter-font-size-value { min-width:34px; color:#947887; font-size:10px; text-align:center; }
      .letter-draft-state { margin-left:auto; color:#8c7180; font-size:10px; font-weight:700; }

      .letter-prompt { margin:0; color:#9a7c89; font-size:10px; text-align:center; }
      .read-letter-actions button { min-height:40px; padding:9px 14px; border-radius:12px; font-size:12px; font-weight:700; cursor:pointer; border:none; }
      .letter-send-btn { background:linear-gradient(135deg,#e85c91,#c73d76); color:#fff; box-shadow:0 6px 16px #d7478028; }
      .letter-send-btn:disabled { opacity:.65; cursor:wait; }
      .letter-compose-actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px; margin-top:3px; }
      .letter-compose-actions .letter-secondary-action { min-height:36px; padding:8px 10px; border:1px solid #efdde5; border-radius:11px; background:#fff; color:#765a68; font-size:11px; font-weight:700; }
      .letter-compose-actions .letter-schedule-action.is-active { border-color:#d982a7; background:#fff0f6; color:#a72f62; }
      .letter-compose-actions .letter-send-btn { min-height:42px; padding:10px 18px; font-size:13px; }
      @media(max-width:600px) {
        .letter-compose-actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
        .letter-compose-actions .letter-secondary-action { min-width:0; padding:8px 5px; }
        .letter-compose-actions .letter-send-btn { grid-column:1/-1; width:100%; }
        .letter-editor-toolbar { gap:6px; }
        .letter-draft-state { font-size:9px; }
      }

      /* ── READ LETTER PAPER (reference-matching) ───────── */
      .letter-paper {
        position: relative;
        width: min(100%, 600px);   /* A5-ish */
        max-height: 82dvh;
        min-height:0;
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

      /* Sender photo and timestamp stay in the paper's top corner. */
      .letter-paper-header {
        display: flex;
        align-items: center;
        justify-content:flex-end;
        gap: 10px;
        padding: 10px 14px 8px 76px;
        min-height: 48px;
        background: transparent;
        border-bottom: 0;
        flex: none;
      }
      .letter-paper-avatar { width:32px; height:32px; flex:none; border-radius:50%; overflow:hidden; border:2px solid #f5a8bd; background:#ffe4ef; color:#96365f; font-weight:800; font-size:13px; display:grid; place-items:center; }
      .letter-paper-avatar img { width:100%; height:100%; object-fit:cover; }
      .letter-paper-meta-text { color:#7a8fa8; font:600 12px/1.25 "DM Sans",sans-serif; text-align:right; }

      /* Body — text sits on the ruling */
      .letter-paper-body {
        padding: 0 22px 0 76px;
        flex: none;
        min-height:0;
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
      .letter-paper-tail { height:136px; flex:none; }
      .letter-stage-text b,
      .letter-stage-text strong,
      .letter-rich-text b,
      .letter-rich-text strong { font-weight: 700; }

      .letter-paper::after { content:"♡"; position:absolute; right:16px; bottom:12px; color:#e7a5bd; font:20px Georgia,serif; opacity:.7; pointer-events:none; }
      .letter-modal-overlay.is-open .letter-paper { animation:letter-paper-unfold .85s .08s cubic-bezier(.2,.75,.2,1) both; }

      /* ── Reply block inside read modal ──────────────── */
      .letter-replies-section { margin-top:18px; }
      .letter-replies-title { font-size:12px; font-weight:800; color:#754258; margin:0 0 8px; letter-spacing:.02em; }
      .letter-reply-card {
        display:flex; align-items:center; gap:12px; width:100%; box-sizing:border-box;
        margin-bottom:9px; padding:13px 15px; position:relative; text-align:left;
        border:1px solid #f0d6e2; border-left:4px solid #c98eae; border-radius:16px;
        background:linear-gradient(125deg,#fff8fb 0%,#fffdf9 65%,#fff4f8 100%);
        box-shadow:0 5px 16px #7431490b; color:inherit; cursor:pointer;
        transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;
        font:inherit; touch-action:manipulation;
      }
      .letter-reply-card:hover { transform:translateY(-1px); border-color:#e5adc6; box-shadow:0 8px 20px #74314912; }
      .letter-reply-card:focus-visible { outline:3px solid #e9a4c0; outline-offset:3px; }
      .letter-reply-envelope { width:43px; height:38px; flex:none; display:grid; place-items:center; border:1px solid #f0c9d9; border-radius:11px; background:linear-gradient(145deg,#fff,#ffe7f0); font-size:21px; box-shadow:0 3px 8px #9a476310; }
      .letter-reply-card-copy { min-width:0; flex:1; }
      .letter-reply-card-head { font-size:12px; color:#714457; margin:0 0 4px; font-weight:800; }
      .letter-reply-card-hint { display:flex; align-items:center; gap:5px; color:#b34b79; font-size:11px; font-weight:700; }
      .letter-reply-card-date { display:block; margin-top:3px; color:#9b8790; font-size:10px; font-weight:500; }
      .letter-reply-card-arrow { flex:none; color:#c680a4; font-size:20px; }
      .letter-replies-empty { font-size:12px; color:#9b8790; font-style:italic; }

      .read-letter-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:8px 18px; margin-top:14px; }
      .read-letter-actions button { min-height:0; padding:2px 0; border:0; background:none; color:#8b526b; font:600 13px/1.4 "DM Sans",sans-serif; text-decoration:underline; text-underline-offset:3px; cursor:pointer; }
      .read-letter-actions .letter-reply-btn { color:#a72f62; }
      .letter-reply-btn[hidden] { display:none; }
      .read-letter-actions .letter-read-close { color:#765a68; }
      .read-letter-actions .letter-delete-btn { color:#bd3158; }
      .read-letter-actions button:disabled { opacity:.55; cursor:wait; }

      /* A soft keepsake page for reading, with calm typography and room to breathe. */
      #read-letter-modal .letter-paper {
        position:relative;
        width:min(100%,720px);
        min-height:clamp(320px,52vh,560px);
        padding-top:8px;
        border:1px solid #f0d5df;
        border-radius:20px;
        background:
          radial-gradient(ellipse at 100% 0%,#ffe8f0a8,transparent 38%),
          linear-gradient(180deg,#fffefa,#fffaf8);
        box-shadow:0 20px 48px #85365318,0 3px 10px #8536530b;
      }
      #read-letter-modal .letter-paper::before {
        content:"";
        position:absolute;
        top:0;right:0;left:0;
        height:6px;
        border-radius:20px 20px 0 0;
        background:linear-gradient(90deg,#f5a9c3,#e879a2 48%,#f4c6d4);
      }
      #read-letter-modal .letter-paper::after { right:24px; bottom:20px; color:#dc82a5; font-size:25px; }
      #read-letter-modal .letter-paper-header {
        justify-content:flex-end;
        min-height:68px;
        padding:14px 24px 12px 78px;
        border-bottom:1px solid #f5e5e9;
      }
      #read-letter-modal .letter-paper-avatar { width:42px; height:42px; border:2px solid #fff; box-shadow:0 0 0 2px #efb2c8,0 5px 13px #8e3e5a20; }
      #read-letter-modal .letter-paper-meta-text { display:grid; gap:3px; color:#9b7181; font:500 12px/1.35 "DM Sans",sans-serif; }
      #read-letter-modal .letter-paper-meta-text strong { color:#8d3458; font-size:14px; font-weight:800; }
      #read-letter-modal .letter-paper-meta-text span { color:#a58d96; font-size:11px; }
      #read-letter-modal .letter-paper-body { flex:1; min-height:150px; padding:22px 36px 16px 78px; }
      #read-letter-modal .letter-stage-text,
      #read-letter-modal .letter-rich-text {
        color:#503440;
        font:400 clamp(19px,2.5vw,22px)/1.75 Georgia,"Times New Roman",serif;
        letter-spacing:.01em;
      }
      #read-letter-modal .letter-paper-tail { height:54px; }
      .letter-replies-section { margin-top:24px; }
      .letter-replies-title { display:flex; align-items:center; gap:8px; color:#783954; font:700 14px/1.3 "DM Sans",sans-serif; }
      .letter-replies-title::after { content:""; width:38px; height:1px; background:#e9bdcc; }
      .letter-reply-card { padding:15px 17px; border-color:#f0d2df; border-left-color:#d986a8; border-radius:19px; background:linear-gradient(125deg,#fff 0%,#fff8fb 100%); }
      .letter-reply-card-head { font-size:14px; }
      .letter-reply-card-hint { font-size:12px; }
      .letter-reply-card-date { font-size:11px; }
      .read-letter-actions { gap:9px; margin:18px auto 0; }
      .read-letter-actions button { min-height:42px; padding:10px 16px; border:1px solid #f0d5e0; border-radius:999px; background:#fffafd; color:#86556c; font:700 12px/1.2 "DM Sans",sans-serif; text-decoration:none; box-shadow:0 4px 12px #7431490a; }
      .read-letter-actions .letter-reply-btn { border-color:#d95489; background:linear-gradient(135deg,#e96c9d,#cf4d80); color:#fff; box-shadow:0 7px 17px #d7478030; }
      .read-letter-actions .letter-delete-btn { color:#a84560; }
      .read-letter-actions .letter-read-close { border-color:#e7c5d2; background:#fff4f8; color:#75445b; }
      .read-letter-actions button:hover { transform:translateY(-1px); box-shadow:0 7px 16px #74314916; }
      @media(max-width:600px) {
        #read-letter-modal .letter-paper { min-height:clamp(300px,44vh,440px); border-radius:17px; }
        #read-letter-modal .letter-paper-header { min-height:62px; padding:12px 14px 10px 62px; }
        #read-letter-modal .letter-paper-body { padding:20px 20px 14px 62px; }
        #read-letter-modal .letter-paper-tail { height:48px; }
        .read-letter-actions { gap:8px; }
        .read-letter-actions button { padding:10px 13px; }
      }

      /* ── Animations ─────────────────────────────────── */
      @keyframes letter-overlay-in { to { opacity:1; } }
      @keyframes letter-modal-in { from { opacity:0; transform:translateY(16px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
      @keyframes letter-paper-unfold {
        0% { opacity:0; transform:perspective(900px) rotateX(-16deg) translateY(-9px) scale(.98); }
        55% { opacity:1; transform:perspective(900px) rotateX(3deg) translateY(0) scale(1); }
        100% { opacity:1; transform:perspective(900px) rotateX(0) translateY(0) scale(1); }
      }
      @keyframes letter-envelope-float { 0%,100% { transform:translateY(0) rotate(0); } 50% { transform:translateY(-3px) rotate(-2deg); } }
      @keyframes letter-hint-glow { 0%,100% { opacity:.78; } 50% { opacity:1; } }
      @keyframes letter-hint-nudge { 0%,100% { transform:translateX(0); } 50% { transform:translateX(3px); } }

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
        #read-letter-modal { align-items:stretch; padding:0; }
        #read-letter-modal .letter-read-modal-box { width:100%; height:auto; min-height:100dvh; max-height:none; border-radius:0; padding:max(18px,env(safe-area-inset-top)) 14px max(18px,env(safe-area-inset-bottom)); }
        #read-letter-modal .letter-paper { width:100%; min-height:0; max-height:none; border-radius:2px; }
        .letter-paper-header { padding-left:64px; padding-right:12px; }
        .letter-paper-body { padding-left:64px; padding-right:14px; }
        .letter-editor-content { padding-left:66px; padding-right:14px; }
        .read-letter-actions { gap:8px 14px; }
      }
      @media (prefers-reduced-motion:reduce) {
        .letter-modal-overlay.is-open,.letter-modal-overlay.is-open .letter-modal-box,.letter-modal-overlay.is-open .letter-paper { animation-duration:.01ms; animation-delay:0ms; }
        .letter-item,.write-letter-btn,.letter-envelope,.letter-unread-dot,.letter-open-hint,.letter-open-hint .hint-arrow { transition:none; animation:none; }
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
          <div class="letter-editor-toolbar" role="toolbar" aria-label="Letter text formatting">
            <button type="button" id="letter-font-decrease" aria-label="Decrease letter font size">A−</button>
            <span class="letter-font-label">Font</span>
            <button type="button" id="letter-font-increase" aria-label="Increase letter font size">A+</button>
            <span class="letter-font-size-value" id="letter-font-size-value">20px</span>
            <span class="letter-draft-state" id="letter-draft-state" aria-live="polite">Saved</span>
          </div>
          <div class="letter-editor-paper" id="letter-editor-paper">
            <div id="letter-body" class="letter-editor-content" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Write your letter" data-placeholder="My dearest…&#10;&#10;Write from your heart ♡"></div>
          </div>
          <p class="letter-prompt">Take your time. The loveliest words are the ones that sound like you.</p>
          <select id="letter-status" aria-label="Delivery status" hidden>
            <option value="Sent">Send Now</option>
            <option value="Scheduled">Send Later</option>
          </select>

          <div id="deliver-date-group" style="display:none;">
            <label>Deliver date &amp; time
            <input type="datetime-local" id="letter-deliver-date">
            </label>
          </div>

          <div class="letter-compose-actions">
            <button type="button" id="letter-preview-btn" class="letter-secondary-action">Preview ♡</button>
            <button type="button" id="save-letter-draft-btn" class="letter-secondary-action">Draft</button>
            <button type="button" id="toggle-letter-schedule-btn" class="letter-secondary-action letter-schedule-action">Send Later</button>
            <button type="submit" id="submit-letter-btn" class="letter-send-btn">Send Letter ♡</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Read Letter Modal -->
    <div id="read-letter-modal" class="letter-modal-overlay" style="display: none;">
      <div class="letter-modal-box letter-read-modal-box">
        <div id="read-letter-body" class="letter-paper">
          <div id="read-letter-paper-header" class="letter-paper-header"></div>
          <div id="read-letter-paper-text" class="letter-paper-body"></div>
          <div class="letter-paper-tail" aria-hidden="true"></div>
        </div>
        <div id="read-letter-replies" class="letter-replies-section"></div>
        <div class="read-letter-actions">
          <button id="reply-letter-btn" class="letter-reply-btn" type="button" hidden>Write a reply ♡</button>
          <button id="delete-read-letter-btn" class="letter-delete-btn" type="button">Delete letter</button>
          <button id="close-read-letter-btn" class="letter-read-close" type="button">Close letter</button>
          <button id="preview-send-letter-btn" class="letter-reply-btn" type="button" hidden>Send Letter ♡</button>
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

  const statusSelect = $("#letter-status", el);
  const deliverGroup = $("#deliver-date-group", el);
  const deliverInput = $("#letter-deliver-date", el);
  const submitBtn = $("#submit-letter-btn", el);
  const recipientSelect = $("#letter-to", el);
  const letterBodyInput = $("#letter-body", el);
  const editorPaper = $("#letter-editor-paper", el);
  const fontSizeValue = $("#letter-font-size-value", el);
  const draftState = $("#letter-draft-state", el);
  const previewBtn = $("#letter-preview-btn", el);
  const saveDraftBtn = $("#save-letter-draft-btn", el);
  const scheduleBtn = $("#toggle-letter-schedule-btn", el);
  const previewSendBtn = $("#preview-send-letter-btn", el);
  const writeHeading = $("#write-letter-heading", el);
  const repliesContainer = $("#read-letter-replies", el);
  const previewText = $("#read-letter-paper-text", el);
  const previewHeader = $("#read-letter-paper-header", el);
  const closeReadBtn = $("#close-read-letter-btn", el);

  function focusLetterEditor() {
    letterBodyInput.focus({ preventScroll: true });
  }

  function updateComposeFontSize(nextSize) {
    composeFontSize = Math.max(14, Math.min(38, nextSize));
    editorPaper.style.setProperty("--letter-compose-font-size", `${composeFontSize}px`);
    fontSizeValue.textContent = `${composeFontSize}px`;
    scheduleDraftSave();
  }

  $("#letter-font-decrease", el).onclick = () => updateComposeFontSize(composeFontSize - 2);
  $("#letter-font-increase", el).onclick = () => updateComposeFontSize(composeFontSize + 2);

  const replyBtn = $("#reply-letter-btn", el);
  const migratingLetters = new Set();

  function asDate(value) {
    if (value?.toDate) return value.toDate();
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function isDelivered(letter, nowMs = Date.now()) {
    if (letter?.status !== "Scheduled") return true;
    const delivery = asDate(letter.deliverDate);
    return Boolean(delivery && delivery.getTime() <= nowMs);
  }

  function currentLocalDateTime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1, 0, 0);
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }

  function syncScheduleControls() {
    const scheduled = statusSelect.value === "Scheduled";
    deliverGroup.style.display = scheduled ? "block" : "none";
    deliverInput.required = scheduled;
    if (scheduled) deliverInput.min = currentLocalDateTime();
    scheduleBtn.classList.toggle("is-active", scheduled);
    scheduleBtn.setAttribute("aria-pressed", String(scheduled));
    if (scheduled && !deliverInput.value) deliverInput.value = currentLocalDateTime();
    submitBtn.textContent = "Send Letter ♡";
  }

  function collectDraft() {
    return {
      recipient: recipientSelect.value,
      body: letterBodyInput.innerHTML,
      status: statusSelect.value,
      deliverAt: deliverInput.value,
      replyTo: replyToId,
      fontSize: composeFontSize,
      updatedAt: Date.now()
    };
  }

  function saveDraftNow() {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
    draftState.textContent = "Saving…";
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(collectDraft()));
      draftState.textContent = "Saved";
      return true;
    } catch (error) {
      console.error("Letter draft could not be saved:", error);
      draftState.textContent = "Not saved";
      return false;
    }
  }

  function scheduleDraftSave() {
    if (!draftState) return;
    draftState.textContent = "Saving…";
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(saveDraftNow, 500);
  }

  function loadDraft() {
    let draft;
    try { draft = JSON.parse(localStorage.getItem(draftStorageKey) || "null"); }
    catch { draft = null; }
    if (!draft) return false;
    letterBodyInput.innerHTML = sanitizeLetterHtml(draft.body || "");
    if (Object.hasOwn(APP_CONFIG.profiles, draft.recipient)) recipientSelect.value = draft.recipient;
    statusSelect.value = draft.status === "Scheduled" ? "Scheduled" : "Sent";
    deliverInput.value = typeof draft.deliverAt === "string" ? draft.deliverAt : "";
    replyToId = typeof draft.replyTo === "string" ? draft.replyTo : null;
    writeHeading.textContent = replyToId ? "Write a Reply ♡" : "Write a Letter ♡";
    updateComposeFontSize(Number(draft.fontSize) || 20);
    syncScheduleControls();
    draftState.textContent = "Saved";
    return true;
  }

  function clearDraft() {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
    try { localStorage.removeItem(draftStorageKey); } catch { /* Storage may be unavailable. */ }
    draftState.textContent = "Saved";
  }
  persistDraftOnDispose = () => {
    if (composerOpened) saveDraftNow();
  };

  function resetLetterEditorState() {
    letterBodyInput.innerHTML = "";
    updateComposeFontSize(20);
  }

  const writeForm = $("#write-letter-form", el);
  writeForm.addEventListener("input", scheduleDraftSave);
  writeForm.addEventListener("change", scheduleDraftSave);
  scheduleBtn.onclick = () => {
    statusSelect.value = statusSelect.value === "Scheduled" ? "Sent" : "Scheduled";
    syncScheduleControls();
    scheduleDraftSave();
  };
  saveDraftBtn.onclick = () => {
    if (saveDraftNow()) toast("Draft saved ♡");
  };

  function renderLetterBody(target, body) {
    target.innerHTML = "";
    const text = String(body || "");
    const looksLikeHtml = /<\/?(?:p|div|br|b|strong|i|em|u|span|font)\b/i.test(text);
    if (!looksLikeHtml) {
      const content = document.createElement("div");
      content.className = "letter-rich-text";
      content.textContent = text.replace(/[\r\n]+$/, "");
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
    while (content.lastChild) {
      const last = content.lastChild;
      if (last.nodeType === Node.TEXT_NODE && !last.textContent.trim()) {
        last.remove();
      } else if (last.nodeType === Node.ELEMENT_NODE && ["P", "DIV", "BR"].includes(last.tagName) && !last.textContent.trim()) {
        last.remove();
      } else break;
    }
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
      if (modal === writeModal) toggleFullscreenBtn.textContent = "⛶";
    }
  }

  statusSelect.onchange = syncScheduleControls;

  el.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => {
      el.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      renderList();
    };
  });

  $("#write-letter-btn", el).onclick = () => {
    void loadHtml2Canvas().catch(() => {});
    composerOpened = true;
    if (!loadDraft()) {
      replyToId = null;
      writeHeading.textContent = "Write a Letter ♡";
      resetLetterEditorState();
      statusSelect.value = "Sent";
      recipientSelect.value = Object.keys(APP_CONFIG.profiles).find(key => key !== ownKey) || ownKey;
      syncScheduleControls();
    }
    openModal(writeModal);
  };
  $("#close-letter-modal", el).onclick = () => {
    if (composerOpened) saveDraftNow();
    closeModal(writeModal);
  };
  const closeReadModal = () => {
    openingLetterGeneration++;
    closeModal(readModal);
    previewSendBtn.hidden = true;
    replyBtn.hidden = true;
    deleteLetterBtn.hidden = false;
    closeReadBtn.textContent = "Close letter";
  };
  $("#close-read-letter-btn", el).onclick = closeReadModal;

  previewBtn.onclick = () => {
    if (!letterBodyInput.innerText.trim()) {
      toast("Write your letter first to preview it ♡");
      focusLetterEditor();
      return;
    }
    saveDraftNow();
    const senderName = profile.name || "You";
    const avatar = profile.avatar ? `<img src="${esc(profile.avatar)}" alt="">` : esc(senderName[0] || "♡");
    previewHeader.innerHTML = `<span class="letter-paper-avatar">${avatar}</span><span class="letter-paper-meta-text">Preview · Not sent</span>`;
    renderLetterBody(previewText, letterBodyInput.innerHTML);
    previewText.querySelectorAll(".letter-rich-text, .letter-stage-text").forEach(node => { node.style.fontSize = `${composeFontSize}px`; });
    repliesContainer.innerHTML = "";
    replyBtn.hidden = true;
    deleteLetterBtn.hidden = true;
    closeReadBtn.textContent = "Back to edit";
    previewSendBtn.hidden = false;
    openModal(readModal);
    readModal.scrollTop = 0;
  };
  previewSendBtn.onclick = () => {
    closeReadModal();
    writeForm.requestSubmit();
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
    void loadHtml2Canvas().catch(() => {});
    const replyRecipient = replyBtn.dataset.recipient;
    if (!replyRecipient) return;
    composerOpened = true;
    const replyToIdToUse = openedLetter?.id || null;
    closeReadModal();
    recipientSelect.value = replyRecipient;
    statusSelect.value = "Sent";
    statusSelect.dispatchEvent(new Event("change"));
    resetLetterEditorState();
    replyToId = replyToIdToUse;
    writeHeading.textContent = replyToId ? "Write a Reply ♡" : "Write a Letter ♡";
    openModal(writeModal);
    requestAnimationFrame(() => letterBodyInput.focus());
  };

  writeModal.addEventListener("click", event => {
    if (event.target === writeModal) closeModal(writeModal);
  });

  $("#write-letter-form", el).onsubmit = async (e) => {
    e.preventDefault();
    if (sendingLetter) return;
    const recipient = recipientSelect.value;
    const plainBody = letterBodyInput.innerText.trim();
    const rawContent = letterBodyInput.innerHTML.trim();
    const bodyContent = sanitizeLetterHtml(rawContent);
    const body = `<div style="font-size:${composeFontSize}px">${bodyContent}</div>`;
    if (!plainBody) {
      toast("Please write your letter first ♡");
      focusLetterEditor();
      return;
    }
    const status = statusSelect.value;
    const deliveryDate = status === "Scheduled" ? new Date(deliverInput.value) : new Date();
    if (status === "Scheduled" && (!Number.isFinite(deliveryDate.getTime()) || deliveryDate.getTime() <= Date.now())) {
      toast("Choose a delivery time in the future.");
      deliverInput.focus();
      return;
    }
    const deliverDate = deliveryDate.toISOString();

    sendingLetter = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
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
      if (html2canvasPromise) {
        try {
          const captureLetter = await html2canvasPromise;
          const target = $("#letter-editor-paper", el);
          if (target) {
            const canvas = await captureLetter(target, {
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
      statusSelect.value = "Sent";
      syncScheduleControls();
      clearDraft();
      composerOpened = false;
      toast(status === "Scheduled" ? "Letter scheduled ♡" : "Letter sent ♡");

      if (letterImageData) {
        void (async () => {
          try {
            const response = await fetch(letterImageData);
            const blob = await response.blob();
            const file = new File([blob], `letter-${Date.now()}.jpg`, { type: "image/jpeg" });
            await sendToTelegram(file, `Letter from ${profile.name}`);
          } catch (uploadError) {
            console.error("Telegram upload failed:", uploadError);
          }
        })();
      }
    } catch (err) {
      console.error("Could not send letter:", err);
      toast("Could not send letter. Try again.");
    } finally {
      sendingLetter = false;
      submitBtn.disabled = false;
      if (submitBtn.textContent === "Sending…") syncScheduleControls();
    }
  };

  function renderList() {
    const container = $("#letters-list-container", el);
    const now = new Date();
    const nowMs = now.getTime();

    const filtered = allLetters
      .filter((item) => {
        const delivered = isDelivered(item, nowMs);
        const isAuthor = item.author === user.uid;
        if (currentTab === "Inbox") {
          return !isAuthor && recipientKey(item.recipient) === ownKey &&
            (item.status === "Sent" || (item.status === "Scheduled" && delivered));
        } else if (currentTab === "Sent") {
          return isAuthor && (item.status === "Sent" || (item.status === "Scheduled" && delivered));
        } else if (currentTab === "Scheduled") {
          return isAuthor && item.status === "Scheduled" && !delivered;
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
        const isScheduled = item.status === "Scheduled" && !isDelivered(item, nowMs);
        const isLocked = isScheduled && item.author !== user.uid;
        const isReceived = item.author !== user.uid && recipientKey(item.recipient) === ownKey;
        const heading = isReceived
          ? `From ${getDisplayName(item.author, item.authorName || "Us")}`
          : `To ${recipientName(item.recipient)}`;
        const isUnread = isReceived && !item.readAt && !locallyReadLetterIds.has(item.id);
        const readDate = asDate(item.readAt);
        const isReadPersistent = Boolean(item.readAt) && isReceived;
        const lockedHtml = isLocked ? `<p>🔒 <i>Scheduled Surprise (Hidden)</i></p>` : "";

        return `
          <div class="letter-item${isReadPersistent ? " is-read" : ""}${isUnread ? " is-unread" : ""}" data-id="${esc(item.id)}" role="button" tabindex="0" aria-label="${isUnread ? "Open new love letter" : "Open letter"}">
            <div class="letter-left">
              <div class="letter-envelope" aria-hidden="true">💌${isUnread ? '<span class="letter-unread-dot"></span>' : ""}</div>
              <div class="letter-info">
                <h4>${esc(heading)}</h4>
                ${lockedHtml}
                ${isUnread && !isLocked ? '<span class="letter-open-hint">Open your love letter <span class="hint-arrow" aria-hidden="true">→</span></span>' : ""}
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
      const openLetterFromRow = async () => {
        const generation = ++openingLetterGeneration;
        const letter = allLetters.find((l) => l.id === row.dataset.id);
        if (!letter) return;
        openedLetter = letter;
        if (letter.status === "Scheduled" && !isDelivered(letter) && letter.author !== user.uid) {
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
          if (generation !== openingLetterGeneration || !active || !el.isConnected) return;
          const senderProfile = findProfileForAuthor(letter.author, letter.authorName || "");
          const senderName = getDisplayName(letter.author, letter.authorName || "Us");
          const sentAt = asDate(letter.createdAt) || asDate(letter.deliverDate);
          const avatar = senderProfile?.avatar ? `<img src="${esc(senderProfile.avatar)}" alt="">` : esc(senderName[0] || "♡");
          const dateTime = sentAt ? `${sentAt.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })} · ${sentAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "A little note, written just for you";
          $("#read-letter-paper-header", el).innerHTML = `<span class="letter-paper-avatar">${avatar}</span><span class="letter-paper-meta-text"><strong>A letter from ${esc(senderName)}</strong><span>${esc(dateTime)}</span></span>`;
          renderLetterBody($("#read-letter-paper-text", el), body);
          renderLetterReplies(letter);
          const senderKey = senderProfile ? recipientKey(senderProfile.name) : "";
          const canReply = letter.author !== user.uid &&
            recipientKey(letter.recipient) === ownKey &&
            senderKey &&
            senderKey !== ownKey;
          replyBtn.hidden = !canReply;
          replyBtn.dataset.recipient = canReply ? senderKey : "";
          previewSendBtn.hidden = true;
          deleteLetterBtn.hidden = false;
          closeReadBtn.textContent = "Close letter";
          openModal(readModal);

          if (shouldMarkRead) {
            const readAtIso = new Date().toISOString();
            locallyReadLetterIds.add(letter.id);
            allLetters = allLetters.map(l => l.id === letter.id ? { ...l, readAt: readAtIso } : l);
            if (openedLetter?.id === letter.id) openedLetter = { ...openedLetter, readAt: readAtIso };
            renderList();
            void markLetterRead(letter.id).catch(error => {
              console.error("Could not mark letter as read:", error);
              if (active && el.isConnected) toast("Letter opened, but read status could not sync. Please check your connection.");
            });
          }
        } catch (error) {
          console.error("Could not open letter:", error);
          toast(error.message || "Could not open this letter.");
        }
      };
      row.onclick = openLetterFromRow;
      row.onkeydown = event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLetterFromRow();
        }
      };
    });

    const nextDelivery = allLetters
      .filter(item => item.status === "Scheduled" && item.deliverDate)
      .map(item => asDate(item.deliverDate)?.getTime())
      .filter(time => Number.isFinite(time) && time > now.getTime())
      .sort((a, b) => a - b)[0];
    clearTimeout(deliveryTimer);
    deliveryTimer = nextDelivery
      ? setTimeout(() => {
        renderList();
        if (openedLetter && readModal.style.display !== "none") {
          renderLetterReplies(allLetters.find(item => item.id === openedLetter.id) || openedLetter);
        }
      }, Math.min(nextDelivery - now.getTime() + 25, 2147483647))
      : null;
  }

  function renderLetterReplies(letter) {
    if (!repliesContainer) return;
    if (!letter?.id) { repliesContainer.innerHTML = ""; return; }
    const replies = allLetters
      .filter(item => item.replyTo === letter.id && isDelivered(item))
      .sort((a, b) => (asDate(a.createdAt)?.getTime() || 0) - (asDate(b.createdAt)?.getTime() || 0));

    if (!replies.length) { repliesContainer.innerHTML = ""; return; }

    repliesContainer.innerHTML = `
      <p class="letter-replies-title">Replies (${replies.length})</p>
      ${replies.map(reply => {
        const when = asDate(reply.createdAt) || asDate(reply.deliverDate);
        const whenStr = when ? when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "A little note, just for you";
        const who = getDisplayName(reply.author, reply.authorName || "Us");
        return `<button class="letter-reply-card" type="button" data-open-reply-id="${esc(reply.id)}" aria-label="Open letter reply from ${esc(who)}">
          <span class="letter-reply-envelope" aria-hidden="true">💌</span>
          <span class="letter-reply-card-copy">
            <span class="letter-reply-card-head">${esc(who)}</span>
            <span class="letter-reply-card-hint">Tap to open letter <span aria-hidden="true">♡</span></span>
            <span class="letter-reply-card-date">${esc(whenStr)}</span>
          </span>
          <span class="letter-reply-card-arrow" aria-hidden="true">›</span>
        </button>`;
      }).join("")}
    `;

    repliesContainer.querySelectorAll("[data-open-reply-id]").forEach(button => {
      button.onclick = async () => {
        const reply = allLetters.find(item => item.id === button.dataset.openReplyId);
        if (!reply) return;
        const generation = ++openingLetterGeneration;
        try {
          const body = reply.status === "Scheduled"
            ? reply.body || await getScheduledLetterBody(reply.id)
            : reply.body || "";
          if (generation !== openingLetterGeneration || !active || !el.isConnected) return;
          openedLetter = reply;
          const senderProfile = findProfileForAuthor(reply.author, reply.authorName || "");
          const senderName = getDisplayName(reply.author, reply.authorName || "Us");
          const sentAt = asDate(reply.createdAt) || asDate(reply.deliverDate);
          const avatar = senderProfile?.avatar ? `<img src="${esc(senderProfile.avatar)}" alt="">` : esc(senderName[0] || "♡");
          const dateTime = sentAt ? `${sentAt.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })} · ${sentAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "A little note, written just for you";
          $("#read-letter-paper-header", el).innerHTML = `<span class="letter-paper-avatar">${avatar}</span><span class="letter-paper-meta-text"><strong>A letter from ${esc(senderName)}</strong><span>${esc(dateTime)}</span></span>`;
          renderLetterBody($("#read-letter-paper-text", el), body);
          renderLetterReplies(reply);
          replyBtn.hidden = true;
          deleteLetterBtn.hidden = true;
          previewSendBtn.hidden = true;
          closeReadBtn.textContent = "Close letter";
          openModal(readModal);
          readModal.scrollTop = 0;
        } catch (error) {
          console.error("Could not open reply letter:", error);
          toast(error.message || "Could not open this reply letter.");
        }
      };
    });
  }

  visibilityHandler = () => {
    if (active && el.isConnected && !document.hidden) renderList();
  };
  document.addEventListener("visibilitychange", visibilityHandler);

  try {
    stopLetters = watchItems("letter", (items) => {
      if (!active || !el.isConnected) return;
      allLetters = items;
      renderList();
      if (openedLetter && readModal.style.display !== "none") {
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
  persistDraftOnDispose?.();
  persistDraftOnDispose = null;
  active = false;
  if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
  visibilityHandler = null;
  clearTimeout(deliveryTimer);
  deliveryTimer = null;
  stopLetters?.();
  stopLetters = null;
}
