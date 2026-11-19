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
      @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Quicksand:wght@500;600;700&family=Noto+Sans+Kannada:wght@400;600&display=swap');

      /* ───────── Tokens ───────── */
      .letters-scope {
        --nb-line: #ffd9e6; --nb-margin: #ffa3c1; --nb-bg: #fffdfa; --nb-ink: #5b3447; --nb-line-h: 38px;
        --hand: "Caveat", "Noto Sans Kannada", "Segoe Print", "Bradley Hand", cursive;
        --ui: "Quicksand", "Noto Sans Kannada", system-ui, sans-serif;
        --ink: #5b3447; --ink2: #8a6577; --muted: #b48fa0; --rasp: #d6457a; --bubble: #ff8fb3; --lav: #b9a4f2;
        --airmail: repeating-linear-gradient(135deg, #ff8fb3 0 12px, #fff 12px 20px, #b9a4f2 20px 32px, #fff 32px 40px);
        --airmail-soft: repeating-linear-gradient(135deg, #ffd0df 0 12px, #fff 12px 20px, #e2d8fa 20px 32px, #fff 32px 40px);
        --hearts: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56'%3E%3Cpath d='M28 40s-11-6.8-11-13.6a5.9 5.9 0 0 1 11-3 5.9 5.9 0 0 1 11 3C39 33.2 28 40 28 40z' fill='%23ff8fb3' fill-opacity='.13'/%3E%3C/svg%3E");
        font-family: var(--ui);
      }

      /* ───────── Post-office card ───────── */
      .letters-card { max-width: 650px; margin: 0 auto; padding: 22px; border: 1px solid #ffd6e4; border-radius: 28px; background: var(--hearts), linear-gradient(160deg, #fff8fb 30%, #ffedf4); box-shadow: 0 22px 50px -20px #d6457a66; font-family: var(--ui); }
      .letters-card::before { content: ""; display: block; height: 10px; margin: -22px -22px 18px; border-radius: 28px 28px 0 0; background: var(--airmail); }
      .letters-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; }
      .letters-title-area { display: flex; align-items: center; gap: 14px; min-width: 0; }
      .letters-icon { width: 48px; height: 56px; flex: none; display: flex; align-items: center; justify-content: center; border: 3px solid #fff; border-radius: 5px; outline: 2px dashed #ffb3cc; outline-offset: 2px; background: linear-gradient(160deg, #ffe3ee, #ffc2d6); font-size: 24px; box-shadow: 0 10px 18px -8px #d6457a77; rotate: -5deg; animation: letter-swing 4s ease-in-out infinite; transform-origin: 50% 0; }
      .letters-text h3 { margin: 0; color: var(--rasp); font-family: var(--hand); font-size: 38px; font-weight: 700; line-height: .95; }
      .letters-text p { margin: 5px 0 0; color: var(--ink2); font-size: 12px; font-weight: 600; line-height: 1.4; }
      .write-letter-btn { flex: none; position: relative; overflow: hidden; display: flex; align-items: center; gap: 4px; padding: 11px 16px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #ff8fb3, #d6457a); color: #fff; font: 700 13px var(--ui); box-shadow: 0 12px 22px -8px #d6457acc, inset 0 1px 0 #ffffff66; cursor: pointer; transition: transform .25s cubic-bezier(.34, 1.56, .64, 1), box-shadow .25s ease; }
      .write-letter-btn::after { content: ""; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 30%, #ffffff66 50%, transparent 70%); transform: translateX(-120%); transition: transform .6s ease; }
      .write-letter-btn:hover { transform: translateY(-2px) scale(1.04); }
      .write-letter-btn:hover::after { transform: translateX(120%); }
      .write-letter-btn:active { transform: scale(.95); }

      /* ───────── Tabs ───────── */
      .letters-tabs { display: flex; gap: 6px; margin-bottom: 18px; padding: 5px; border: 1.5px solid #ffd9e6; border-radius: 999px; background: #fff; box-shadow: 0 8px 18px -12px #d6457a66; }
      .tab-btn { flex: 1; padding: 9px 8px; border: 0; border-radius: 999px; background: transparent; color: var(--ink2); font: 700 13px var(--ui); cursor: pointer; transition: background .25s ease, color .25s ease, transform .25s cubic-bezier(.34, 1.56, .64, 1); }
      .tab-btn:active { transform: scale(.94); }
      .tab-btn.active { background: linear-gradient(135deg, #ffb3cc, #ff7fa8); color: #fff; box-shadow: 0 8px 16px -8px #d6457acc; }
      .tab-btn.active::before { content: "♡ "; }

      /* ───────── Envelope list ───────── */
      .letters-list { display: flex; flex-direction: column; gap: 16px; padding-top: 6px; }
      .letters-list > p { margin: 0; padding: 30px 16px !important; border: 2px dashed #ffc2d6; border-radius: 22px; background: #ffffffb3; color: var(--ink2) !important; font-weight: 600; text-align: center !important; }
      .letters-list > p::before { content: "💌"; display: block; margin-bottom: 6px; font-size: 34px; animation: letter-swing 3.2s ease-in-out infinite; }
      .letter-item { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 12px 14px 14px; border: 2.5px solid transparent; border-radius: 18px; background: linear-gradient(#fffdfd, #fffdfd) padding-box, var(--airmail-soft) border-box; box-shadow: 0 10px 20px -12px #d6457a66; cursor: pointer; transition: transform .3s cubic-bezier(.34, 1.56, .64, 1), box-shadow .25s ease; }
      .letter-item:hover { transform: translateY(-3px) rotate(-.6deg); box-shadow: 0 16px 26px -12px #d6457a88; }
      .letter-item:active { transform: scale(.97); }
      .letter-item:focus-visible { outline: 3px solid var(--bubble); outline-offset: 3px; }
      .letter-item.is-unread { background: linear-gradient(#fff6fa, #fff6fa) padding-box, var(--airmail) border-box; box-shadow: 0 14px 26px -12px #d6457a99; }
      .letter-item.is-unread::after { content: "new ♡"; position: absolute; top: -12px; right: 16px; padding: 2px 10px; border-radius: 999px; background: linear-gradient(135deg, #ff7fa8, #e0386f); color: #fff; font: 700 10.5px var(--ui); rotate: 4deg; box-shadow: 0 6px 12px -4px #d6457a99; animation: letter-pop 2.4s ease-in-out infinite; }
      .letter-left { display: flex; align-items: center; min-width: 0; gap: 13px; }
      .letter-envelope { position: relative; width: 56px; height: 42px; flex: none; display: grid; place-items: center; overflow: visible; border: 1px solid #ffc2d6; border-radius: 8px; background: linear-gradient(145deg, #fff, #ffe3ee); color: transparent; font-size: 0; box-shadow: 0 6px 12px -6px #d6457a88; transition: transform .25s ease; }
      .letter-envelope::before { content: ""; position: absolute; z-index: 1; inset: 0 0 auto; height: 56%; border-radius: 7px 7px 50% 50%; background: linear-gradient(150deg, #ffd9e7, #ffb3cc); clip-path: polygon(0 0, 100% 0, 50% 100%); transform-origin: top; transition: transform .36s cubic-bezier(.2, .75, .2, 1); }
      .letter-envelope::after { content: ""; position: absolute; z-index: 2; inset: 0; border-radius: 8px; background: radial-gradient(circle at 50% 50%, #e0386f 0 5px, #ff8fb3 5px 6.5px, transparent 7px), linear-gradient(35deg, #ffd0df 49%, transparent 50%), linear-gradient(-35deg, #ffe6ef 49%, transparent 50%); }
      .letter-item.is-read .letter-envelope::before, .letter-item.is-opening .letter-envelope::before { transform: rotateX(180deg); }
      .letter-item.is-read .letter-envelope::after { background: linear-gradient(35deg, #ffd0df 49%, transparent 50%), linear-gradient(-35deg, #ffe6ef 49%, transparent 50%); }
      .letter-item.is-opening .letter-envelope { transform: scale(1.14); }
      .letter-unread-dot { position: absolute; top: -6px; right: -6px; z-index: 4; width: 13px; height: 13px; border: 2px solid #fff; border-radius: 50%; background: #ff3d7a; box-shadow: 0 2px 6px #c01e5a66; animation: letter-dot-pulse 1.6s ease-in-out infinite; }
      @keyframes letter-dot-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }
      .letter-info { min-width: 0; flex: 1; }
      .letter-info h4 { margin: 0; overflow: hidden; color: var(--ink); font: 700 25px/1.05 var(--hand); text-overflow: ellipsis; white-space: nowrap; }
      .letter-info p { max-width: 260px; margin: 3px 0 0; overflow: hidden; color: var(--ink2); font-size: 11.5px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
      .letter-open-hint { display: inline-flex; align-items: center; gap: 5px; margin-top: 6px; padding: 3px 10px; border-radius: 999px; background: #ffe3ee; color: var(--rasp); font-size: 11px; font-weight: 700; animation: letter-hint-glow 2s ease-in-out infinite; }
      .letter-open-hint .hint-arrow { display: inline-block; animation: letter-hint-nudge 1.2s ease-in-out infinite; }
      .letter-item.is-unread .letter-envelope { animation: letter-envelope-float 2.6s ease-in-out infinite; }
      .letter-date { flex: none; padding: 6px 9px; border: 1.5px dashed #ffb3cc; border-radius: 9px; background: #fff8fb; color: #a85475; font-size: 11.5px; font-weight: 700; line-height: 1.35; text-align: right; white-space: nowrap; rotate: 2deg; }
      .letter-date span[style] { color: var(--muted) !important; font-weight: 600; }
      .letter-date .letter-read-receipt { display: block; margin-top: 4px; text-align: right; }
      .letter-read-receipt { color: var(--muted); font-size: 11px; font-weight: 700; white-space: nowrap; }
      .letter-read-receipt.is-read { color: #8b6fe0; }

      /* ───────── Modals ───────── */
      .letter-modal-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: clamp(8px, 2vw, 24px); overflow-y: auto; background: rgba(91, 52, 71, .5); opacity: 0; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
      .letter-modal-overlay.is-open { animation: letter-overlay-in .25s ease forwards; }
      .letter-modal-box { position: relative; width: min(780px, 100%); max-height: calc(100dvh - 24px); overflow-y: auto; padding: clamp(18px, 2.5vw, 30px); border: 1px solid #ffd6e4; border-radius: 28px; background: var(--hearts), linear-gradient(170deg, #fffafc, #fff0f6); box-shadow: 0 30px 80px #5b34476b; }
      .letter-modal-box:not(.letter-read-modal-box)::before { content: ""; position: absolute; top: 0; right: 0; left: 0; height: 9px; background: var(--airmail); }
      .letter-read-modal-box { width: min(920px, 100%); }
      .letter-read-modal-box .letter-paper { width: min(100%, 680px); max-height: 84dvh; }
      .letter-modal-overlay.is-open .letter-modal-box { animation: letter-modal-in .55s cubic-bezier(.2, .9, .3, 1.1) both; }
      .letter-modal-box.is-fullscreen { position: fixed; inset: 0; z-index: 1000; width: 100vw; max-width: none; max-height: 100dvh; height: 100dvh; overflow-y: auto; border-radius: 0; padding: max(12px, env(safe-area-inset-top)) 14px max(16px, env(safe-area-inset-bottom)); }
      .letter-modal-box.is-fullscreen .letter-editor-paper { height: calc(100dvh - 270px); min-height: 300px; }
      .letter-modal-box.is-fullscreen .letter-editor-content { padding: 30px 24px; }
      .letter-modal-box.is-fullscreen .letter-form { gap: 10px; }
      .letter-modal-box.is-fullscreen .letter-prompt { display: none; }
      .letter-modal-box.is-fullscreen .letter-modal-head { position: sticky; top: 0; z-index: 2; background: #fff6fa; }
      #read-letter-modal { position: fixed; inset: 0; z-index: 1000; align-items: stretch; justify-content: center; overflow-y: auto; padding: 0; background: radial-gradient(circle at 85% 8%, #ffd6e6aa, transparent 40%), radial-gradient(circle at 8% 70%, #e8defbaa, transparent 38%), var(--hearts), linear-gradient(160deg, #fff3f8, #fffafd 50%, #f6f0ff); opacity: 1; backdrop-filter: none; -webkit-backdrop-filter: none; }
      #read-letter-modal.is-open { animation: none; }
      #read-letter-modal .letter-read-modal-box { width: min(900px, 100%); max-width: none; height: auto; min-height: 100dvh; max-height: none; overflow: visible; padding: clamp(28px, 5vw, 56px); border: 0; border-radius: 0; background: transparent; box-shadow: none; animation: none; }
      #read-letter-modal .letter-read-modal-box::before { display: none; }
      .letter-modal-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 6px 0 15px; }
      .letter-modal-head h3 { margin: 0; color: var(--rasp); font: 700 clamp(30px, 6vw, 40px)/1 var(--hand); }
      .letter-close-btn { display: grid; width: 36px; height: 36px; flex: none; place-items: center; border: 0; border-radius: 50%; background: #ffe3ee; color: var(--rasp); font-size: 20px; cursor: pointer; transition: transform .25s cubic-bezier(.34, 1.56, .64, 1); }
      .letter-close-btn:hover { transform: rotate(90deg) scale(1.1); }
      .letter-form { display: grid; gap: 12px; margin-top: 0; }
      .letter-form label { display: grid; gap: 6px; color: var(--ink2); font-size: 12px; font-weight: 700; }
      .letter-form select, .letter-form input { width: 100%; min-height: 44px; margin: 0; padding: 10px 14px; border: 1.5px solid #fbd9e5; border-radius: 15px; background: #fff; color: var(--ink); font: 600 13.5px var(--ui); box-sizing: border-box; outline: none; transition: border-color .2s ease, box-shadow .2s ease; }
      .letter-form select:focus, .letter-form input:focus { border-color: var(--bubble); box-shadow: 0 0 0 4px #ffe3ee; }
      .nb-ruling { background: transparent; }

      /* ───────── Writing paper ───────── */
      .letter-editor-content, .letter-stage-text, .letter-rich-text { font-family: var(--hand); }
      .letter-editor-paper { position: relative; width: 100%; height: clamp(300px, 56dvh, 650px); min-height: 300px; overflow: auto; border: 1.5px solid #ffd0df; border-radius: 18px; background-color: #fffdfa; background-image: linear-gradient(90deg, transparent 0, transparent 55px, #ffa3c1 55px, #ffa3c1 57px, transparent 57px), repeating-linear-gradient(to bottom, transparent 0, transparent 33px, #ffd9e6 33px, #ffd9e6 34px); background-size: 100% 100%, 100% 34px; background-position: 0 0, 0 6px; background-repeat: no-repeat, repeat; box-shadow: 0 14px 28px -16px #d6457a77; -webkit-overflow-scrolling: touch; touch-action: manipulation; }
      .letter-editor-content { min-height: 100%; width: 100%; padding: 6px 22px 40px 74px; outline: none; color: var(--ink); font-size: var(--letter-compose-font-size, 20px); line-height: 34px; caret-color: var(--rasp); overflow-wrap: anywhere; white-space: pre-wrap; transform-origin: top left; touch-action: manipulation; -webkit-user-select: text; user-select: text; }
      .letter-editor-content:empty:before { content: attr(data-placeholder); color: #d3a3b8; white-space: pre-wrap; pointer-events: none; }
      .letter-editor-content p { margin: 0; }
      .letter-editor-toolbar { display: inline-flex; align-items: center; gap: 8px; width: fit-content; max-width: 100%; padding: 4px 8px; border: 1.5px solid #ffd9e6; border-radius: 999px; background: #fff; }
      .letter-editor-toolbar button { min-width: 34px; min-height: 32px; padding: 5px 9px; border: 0; border-radius: 999px; background: #ffe3ee; color: var(--rasp); font: 800 13px var(--ui); touch-action: manipulation; transition: transform .2s cubic-bezier(.34, 1.56, .64, 1); }
      .letter-editor-toolbar button:active { transform: scale(.9); }
      .letter-font-label { color: var(--ink2); font-size: 11px; font-weight: 700; }
      .letter-font-size-value { min-width: 34px; color: var(--muted); font-size: 10.5px; font-weight: 700; text-align: center; }
      .letter-draft-state { margin-left: auto; color: var(--muted); font-size: 10.5px; font-weight: 700; }
      .letter-prompt { margin: 0; color: var(--muted); font: 600 19px/1.2 var(--hand); text-align: center; }
      .letter-send-btn { background: linear-gradient(135deg, #ff8fb3, #d6457a); color: #fff; box-shadow: 0 12px 22px -8px #d6457acc; }
      .letter-send-btn:disabled { opacity: .65; cursor: wait; }
      .letter-compose-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 3px; }
      .letter-compose-actions .letter-secondary-action { min-height: 38px; padding: 8px 13px; border: 1.5px solid #ffd0df; border-radius: 999px; background: #fff; color: var(--ink2); font: 700 12px var(--ui); transition: transform .25s cubic-bezier(.34, 1.56, .64, 1); }
      .letter-compose-actions .letter-secondary-action:active { transform: scale(.94); }
      .letter-compose-actions .letter-schedule-action.is-active { border-color: var(--bubble); background: #ffe3ee; color: var(--rasp); }
      .letter-compose-actions .letter-send-btn { min-height: 44px; padding: 10px 20px; border: 0; border-radius: 999px; font: 700 13.5px var(--ui); cursor: pointer; }

      /* ───────── Reading paper ───────── */
      .letter-paper { position: relative; width: min(100%, 600px); max-height: 82dvh; min-height: 0; margin: 0 auto; display: flex; flex-direction: column; }
      #read-letter-modal .letter-paper { width: min(100%, 720px); min-height: clamp(320px, 52vh, 560px); max-height: none; overflow: visible; border: 0; border-radius: 22px; background: radial-gradient(ellipse at 100% 0%, #ffe3eeb3, transparent 42%), var(--hearts), linear-gradient(180deg, #fffefb, #fff7f6); box-shadow: 0 0 0 9px #fff, 0 26px 50px -16px #d6457a77; outline: 2px dashed #ffb3cc; outline-offset: 6px; }
      #read-letter-modal .letter-paper::before { content: ""; position: absolute; top: -14px; left: 50%; z-index: 2; width: 96px; height: 26px; translate: -50% 0; rotate: -3deg; border-radius: 3px; background: repeating-linear-gradient(45deg, #ffc7dacc 0 8px, #ffe9f1d9 8px 16px); box-shadow: 0 2px 4px #d6457a22; }
      .letter-paper::after { content: "♡"; position: absolute; right: 24px; bottom: 18px; color: #ff9fbd; font: 26px Georgia, serif; opacity: .8; pointer-events: none; animation: letter-heart-beat 2.6s ease-in-out infinite; }
      .letter-modal-overlay.is-open .letter-paper { animation: letter-paper-unfold .85s .08s cubic-bezier(.2, .75, .2, 1) both; }
      .letter-paper-header { display: flex; align-items: center; justify-content: flex-start; gap: 12px; flex: none; min-height: 68px; padding: 22px 26px 12px; border-bottom: 2px dotted #ffd0df; background: transparent; }
      .letter-paper-avatar { display: grid; width: 46px; height: 46px; flex: none; place-items: center; overflow: hidden; border: 3px solid #fff; border-radius: 50%; background: #ffe4ef; box-shadow: 0 0 0 2.5px #ffa3c1, 0 8px 14px -6px #d6457a88; color: var(--rasp); font-weight: 800; font-size: 16px; }
      .letter-paper-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .letter-paper-meta-text { display: grid; gap: 1px; color: var(--muted); font: 600 12px/1.3 var(--ui); text-align: left; }
      .letter-paper-meta-text strong { color: var(--rasp); font: 700 27px/1 var(--hand); }
      .letter-paper-meta-text span { color: var(--muted); font-size: 11.5px; }
      .letter-paper-body { flex: 1; min-height: 150px; padding: 18px 30px 8px; }
      .letter-stage-text, .letter-rich-text { color: var(--ink); font: 500 clamp(24px, 5.5vw, 28px)/1.55 var(--hand); letter-spacing: .005em; white-space: pre-wrap; overflow-wrap: anywhere; }
      .letter-stage-text p, .letter-rich-text p { margin: 0; }
      .letter-stage-text b, .letter-stage-text strong, .letter-rich-text b, .letter-rich-text strong { font-weight: 700; }
      .letter-paper-tail { flex: none; min-height: 70px; }
      .letter-paper-tail::before { content: "with all my love ♡"; display: block; padding: 18px 40px 0 0; color: #e0799c; font: 700 26px var(--hand); text-align: right; }

      /* ───────── Replies & actions ───────── */
      .letter-replies-section { margin-top: 28px; }
      .letter-replies-title { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; color: var(--rasp); font: 700 27px/1.1 var(--hand); }
      .letter-replies-title::after { content: ""; width: 44px; height: 0; border-top: 2px dotted #ffb3cc; }
      .letter-reply-card { position: relative; display: flex; align-items: center; gap: 12px; width: 100%; margin-bottom: 10px; padding: 14px 16px; border: 2.5px solid transparent; border-radius: 19px; background: linear-gradient(#fffafc, #fffafc) padding-box, var(--airmail-soft) border-box; box-shadow: 0 10px 20px -12px #d6457a77; box-sizing: border-box; color: inherit; font: inherit; text-align: left; cursor: pointer; touch-action: manipulation; transition: transform .3s cubic-bezier(.34, 1.56, .64, 1), box-shadow .25s ease; }
      .letter-reply-card:hover { transform: translateY(-2px) rotate(-.5deg); box-shadow: 0 16px 24px -12px #d6457a88; }
      .letter-reply-card:active { transform: scale(.97); }
      .letter-reply-card:focus-visible { outline: 3px solid var(--bubble); outline-offset: 3px; }
      .letter-reply-envelope { display: grid; width: 44px; height: 38px; flex: none; place-items: center; border: 1px solid #ffc2d6; border-radius: 11px; background: linear-gradient(145deg, #fff, #ffe3ee); font-size: 21px; box-shadow: 0 4px 10px -4px #d6457a77; }
      .letter-reply-card-copy { min-width: 0; flex: 1; }
      .letter-reply-card-head { margin: 0 0 2px; color: var(--ink); font: 700 24px/1 var(--hand); }
      .letter-reply-card-hint { display: flex; align-items: center; gap: 5px; color: var(--rasp); font-size: 11.5px; font-weight: 700; }
      .letter-reply-card-date { display: block; margin-top: 3px; color: var(--muted); font-size: 10.5px; font-weight: 600; }
      .letter-reply-card-arrow { flex: none; color: var(--bubble); font-size: 22px; }
      .letter-replies-empty { color: var(--muted); font-size: 12px; font-style: italic; }
      .read-letter-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 9px; margin: 22px auto 0; }
      .read-letter-actions button { min-height: 44px; padding: 10px 18px; border: 1.5px solid #ffd0df; border-radius: 999px; background: #fff; color: var(--ink2); font: 700 12.5px var(--ui); cursor: pointer; box-shadow: 0 8px 16px -10px #d6457a77; transition: transform .25s cubic-bezier(.34, 1.56, .64, 1), box-shadow .2s ease; }
      .read-letter-actions button:hover { transform: translateY(-2px) scale(1.04); }
      .read-letter-actions button:active { transform: scale(.95); }
      .read-letter-actions .letter-reply-btn { border: 0; background: linear-gradient(135deg, #ff8fb3, #d6457a); color: #fff; box-shadow: 0 12px 22px -8px #d6457acc; }
      .letter-reply-btn[hidden] { display: none; }
      .read-letter-actions .letter-read-close { background: #ffe9f1; color: var(--rasp); }
      .read-letter-actions .letter-delete-btn { color: #d93a50; }
      .read-letter-actions button:disabled { opacity: .55; cursor: wait; }

      /* ───────── Animations ───────── */
      @keyframes letter-overlay-in { to { opacity: 1; } }
      @keyframes letter-modal-in { from { opacity: 0; transform: translateY(24px) scale(.94); } 60% { opacity: 1; transform: translateY(-3px) scale(1.01); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes letter-paper-unfold { 0% { opacity: 0; transform: perspective(900px) rotateX(-18deg) translateY(-12px) scale(.96); } 55% { opacity: 1; transform: perspective(900px) rotateX(4deg) translateY(0) scale(1.01); } 100% { opacity: 1; transform: perspective(900px) rotateX(0) translateY(0) scale(1); } }
      @keyframes letter-envelope-float { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-4px) rotate(-3deg); } }
      @keyframes letter-hint-glow { 0%, 100% { opacity: .8; } 50% { opacity: 1; } }
      @keyframes letter-hint-nudge { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(3px); } }
      @keyframes letter-swing { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(4deg); } 70% { transform: rotate(-4deg); } }
      @keyframes letter-pop { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
      @keyframes letter-heart-beat { 0%, 100% { transform: scale(1); } 14% { transform: scale(1.2); } 28% { transform: scale(1); } 42% { transform: scale(1.12); } 70% { transform: scale(1); } }

      /* ───────── Responsive ───────── */
      @media (max-width: 600px) {
        .letter-modal-overlay { padding: 0; align-items: stretch; }
        .letter-modal-box { width: 100%; max-width: none; max-height: 100dvh; height: 100dvh; border-radius: 0; padding: max(14px, env(safe-area-inset-top)) 14px max(14px, env(safe-area-inset-bottom)); }
        .letter-editor-paper { height: calc(100dvh - 350px); min-height: 240px; }
        .letter-modal-box.is-fullscreen .letter-editor-paper { height: calc(100dvh - 340px); min-height: 240px; }
        .letter-compose-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
        .letter-compose-actions .letter-secondary-action { min-width: 0; padding: 8px 5px; }
        .letter-compose-actions .letter-send-btn { grid-column: 1 / -1; width: 100%; }
        .letter-editor-toolbar { gap: 6px; }
        .letter-draft-state { font-size: 9.5px; }
        #read-letter-modal { align-items: stretch; padding: 0; }
        #read-letter-modal .letter-read-modal-box { width: 100%; height: auto; min-height: 100dvh; max-height: none; border-radius: 0; padding: max(34px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom)); }
        #read-letter-modal .letter-paper { width: 100%; min-height: clamp(300px, 44vh, 440px); max-height: none; border-radius: 20px; }
        .letter-paper-header { padding: 20px 18px 10px; }
        .letter-paper-body { padding: 16px 20px 8px; }
        .letter-editor-content { padding-left: 66px; padding-right: 14px; }
        .read-letter-actions { gap: 8px; }
        .read-letter-actions button { padding: 10px 14px; }
      }
      @media (max-width: 480px) {
        .letters-card { padding: 16px; border-radius: 24px; }
        .letters-card::before { margin: -16px -16px 14px; border-radius: 24px 24px 0 0; }
        .letters-header { align-items: flex-start; }
        .letters-text h3 { font-size: 32px; }
        .write-letter-btn { padding: 10px 13px; font-size: 11.5px; }
        .letter-item { padding: 12px 10px 12px 12px; }
        .letter-left { gap: 10px; }
        .letter-info h4 { font-size: 22px; }
        .letter-date { font-size: 10.5px; padding: 5px 7px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .letter-modal-overlay.is-open, .letter-modal-overlay.is-open .letter-modal-box, .letter-modal-overlay.is-open .letter-paper { animation-duration: .01ms; animation-delay: 0ms; }
        .letters-scope *, .letters-scope *::before, .letters-scope *::after { animation: none !important; transition: none !important; }
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
