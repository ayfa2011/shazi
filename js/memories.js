import { $, esc, toast, compressImage } from "./utils.js";
import { watchItems, addItem, removeItem, setItem, notifyPartnerSafely } from "./firestore.js";
import { getProfileKey } from "./profile-data.js";
import { sendToTelegram } from "../src/services/telegramService.js";

let stopMemories = null;
let active = false;
let removeMemoryEscapeListener = null;
let memoryLoadTimer = null;
let memoryWatchGeneration = 0;

function parseLocalMemoryDate(dateStr) {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(dateStr);
}

export function renderMemories(el, user, profile) {
  stopMemories?.();
  clearTimeout(memoryLoadTimer);
  removeMemoryEscapeListener?.();
  removeMemoryEscapeListener = null;
  active = true;

  el.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap');

      /* ───────── Page ───────── */
      .memories-page { --hand: "Caveat", "Segoe Script", "Bradley Hand", "Noto Sans Kannada", cursive; --serif: "Playfair Display", Georgia, serif; position: relative; isolation: isolate; max-width: 980px; margin: 0 auto; padding: 0 2px 28px; color: #45333e; overflow-x: clip; }
      .memories-page, .memories-page * { box-sizing: border-box; }
      .memories-page button { -webkit-tap-highlight-color: transparent; font-family: inherit; }
      .memories-page::before, .memories-page::after { content: ""; position: absolute; z-index: -1; pointer-events: none; border-radius: 50%; filter: blur(8px); }
      .memories-page::before { top: -30px; right: -70px; width: 240px; height: 240px; background: radial-gradient(circle, #ffc3d8aa 0%, #ffc3d800 70%); }
      .memories-page::after { top: 46%; left: -90px; width: 280px; height: 280px; background: radial-gradient(circle, #ffe2cdaa 0%, #ffe2cd00 70%); }

      /* ───────── Header (compact) ───────── */
      .memories-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 2px 16px; }
      .memories-heading-copy { position: relative; min-width: 0; }
      .memories-eyebrow { margin: 0 0 3px; color: #a16e83; font-size: 9px; font-weight: 700; letter-spacing: .2em; }
      .memories-heading h1 { margin: 0; color: #75445b; font-family: var(--serif); font-size: clamp(26px, 7vw, 34px); line-height: 1.1; letter-spacing: -.035em; text-shadow: 0 4px 22px #d79ab42e; }
      .memories-heading h1 span { display: inline-block; color: #e9648f; font-family: sans-serif; font-size: .66em; animation: mem-beat 2.4s ease-in-out infinite; transform-origin: center; }
      .memories-meta-row { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; margin-top: 9px; }
      .memories-count { display: inline-flex; align-items: center; gap: 5px; padding: 4px 11px; border: 1px solid #f6d6e2; border-radius: 999px; background: linear-gradient(135deg, #fff 0%, #fff0f5 100%); color: #a85475; font-size: 10.5px; font-weight: 700; letter-spacing: .02em; box-shadow: 0 4px 12px #a64e740d; }
      .memories-count::before { content: "♡"; color: #e9648f; font-size: 11px; }
      .memories-since { color: #b88598; font-family: var(--hand); font-size: 17px; line-height: 1; }
      .memories-float { position: absolute; color: #f1a3bd; font-size: 10px; opacity: 0; pointer-events: none; animation: mem-float 5.5s ease-in infinite; }
      .memories-float:nth-child(1) { top: 6px; left: 150px; animation-delay: 0s; }
      .memories-float:nth-child(2) { top: 18px; left: 190px; font-size: 13px; animation-delay: 1.8s; }
      .memories-float:nth-child(3) { top: 2px; left: 120px; font-size: 8px; animation-delay: 3.4s; }
      .add-memory-btn { flex: none; display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px 10px 11px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #ee7399 0%, #c94f7c 100%); color: #fff; box-shadow: 0 10px 24px #c94f7c42, inset 0 1px 0 #ffffff55; font-size: 11.5px; font-weight: 700; letter-spacing: .01em; cursor: pointer; transition: transform .22s ease, box-shadow .22s ease; }
      .add-memory-btn:hover { transform: translateY(-2px); box-shadow: 0 14px 28px #c94f7c55, inset 0 1px 0 #ffffff55; }
      .add-memory-btn:active { transform: scale(.97); }
      .add-memory-icon { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 50%; background: #ffffff38; color: #fff; font-size: 15px; line-height: 1; }

      /* ───────── Keepsake wall ───────── */
      .memories-shelf { position: relative; padding: 0; }
      .memories-grid { display: flex; flex-direction: column; gap: 20px; padding-top: 10px; }
      .memories-grid > * { min-width: 0; }
      .mem-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
      .mem-col { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
      .mem-col:nth-child(2) { padding-top: 34px; }

      .memory-item { position: relative; display: block; width: 100%; min-width: 0; padding: 8px 8px 11px; border: 1px solid #f6e6ec; border-radius: 16px; background: linear-gradient(180deg, #fff 0%, #fffafc 100%); box-shadow: 0 10px 26px #6d3a5014, 0 2px 6px #6d3a500a; color: inherit; font-family: inherit; text-align: left; cursor: pointer; appearance: none; transform: rotate(var(--tilt, 0deg)); transition: transform .3s cubic-bezier(.2, .8, .2, 1), box-shadow .3s ease; animation: mem-rise .6s cubic-bezier(.2, .8, .2, 1) backwards; animation-delay: calc(var(--i, 0) * 80ms); }
      .memory-item:hover, .memory-item:focus-visible { transform: translateY(-5px) rotate(0deg) scale(1.025); box-shadow: 0 20px 40px #a54c7428, 0 0 0 3px #fde6ee; z-index: 2; }
      .memory-item:active { transform: scale(.98) rotate(0deg); }
      .memory-item:focus-visible { outline: 2px solid #cc7093; outline-offset: 3px; }
      .memory-tape { position: absolute; top: -9px; left: 50%; z-index: 3; width: 56px; height: 18px; border-radius: 3px; background: repeating-linear-gradient(45deg, #ffd6e4d9 0 6px, #ffe9f1d9 6px 12px); box-shadow: 0 1px 4px #00000014; transform: translateX(-50%) rotate(-3deg); pointer-events: none; }
      .mem-col .memory-item:nth-child(3n+2) .memory-tape { background: repeating-linear-gradient(45deg, #ffe3c9d9 0 6px, #fff0e0d9 6px 12px); transform: translateX(-50%) rotate(2.5deg); }
      .mem-col .memory-item:nth-child(3n+3) .memory-tape { background: repeating-linear-gradient(45deg, #e6d8ffd9 0 6px, #f3ecffd9 6px 12px); transform: translateX(-50%) rotate(-1.5deg); }
      .memory-thumb-box { position: relative; display: grid; width: 100%; place-items: center; overflow: hidden; border-radius: 11px; background: linear-gradient(135deg, #fff1f6 0%, #f9dde8 50%, #f7e8da 100%); color: #d9789b; font-size: 32px; box-shadow: inset 0 0 0 1px #00000008; }
      .memory-thumb-box img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 40%; transition: transform .7s ease; }
      .memory-item:hover .memory-thumb-box img { transform: scale(1.06); }
      .memory-thumb-box::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(180deg, transparent 62%, #3a1b2a22 100%); pointer-events: none; }
      .memory-badge { position: absolute; top: 9px; left: 9px; z-index: 2; padding: 4px 10px; border-radius: 999px; background: #ffffffd9; color: #b04b72; font-size: 10px; font-weight: 700; letter-spacing: .05em; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); box-shadow: 0 4px 12px #0000001a; }
      .memory-meta { display: block; overflow: hidden; margin: 10px 4px 0; color: #6b3d52; font-family: var(--hand); font-size: 22px; font-weight: 700; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }
      .memory-item small { display: flex; align-items: center; gap: 5px; margin: 4px 4px 0; color: #b08b9b; font-size: 10.5px; font-weight: 600; letter-spacing: .05em; }
      .memory-item small i { color: #ec7ea0; font-style: normal; font-size: 10px; }
      .memory-item.is-hero { padding: 10px 10px 13px; border-radius: 20px; }
      .memory-item.is-hero .memory-thumb-box { border-radius: 14px; }
      .memory-item.is-hero .memory-meta { margin-top: 12px; font-size: 28px; }
      .memory-item.is-hero small { font-size: 11px; }

      .memory-soft-btn { padding: 10px 16px; border: 1px solid #f0d5e0; border-radius: 999px; background: #fff8fb; color: #8f4263; font-size: 12px; font-weight: 700; cursor: pointer; transition: transform .18s ease, background .18s ease; }
      .memory-soft-btn:hover { transform: translateY(-1px); background: #ffedf4; }
      #load-more-memories { align-self: center; margin-top: 4px; }
      .memories-empty { margin: 0; padding: 38px 16px; border: 1.5px dashed #efc9d8; border-radius: 22px; background: #fffafc99; color: #987e8b; font-size: 13px; line-height: 1.7; text-align: center; }
      .memories-empty span { display: block; margin-bottom: 8px; color: #e9648f; font-size: 28px; animation: mem-beat 2.4s ease-in-out infinite; }
      .memories-empty .memory-soft-btn { margin-top: 12px; }

      /* ───────── Modals ───────── */
      .mem-modal-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; background: rgba(48, 31, 42, .62); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px); }
      .mem-modal-box { position: relative; width: min(420px, 100%); max-height: min(92dvh, 780px); overflow-y: auto; padding: 22px 20px 20px; border: 1px solid #f6e3eb; border-radius: 26px; background: linear-gradient(170deg, #fff 0%, #fff8fb 100%); box-shadow: 0 28px 90px #29132250; animation: memory-view-arrive .28s ease-out; }
      .mem-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
      .mem-modal-head h3 { margin: 0; color: #75445b; font-family: var(--hand); font-size: 30px; font-weight: 700; line-height: 1; }
      .mem-modal-close { display: grid; width: 32px; height: 32px; place-items: center; border: 0; border-radius: 50%; background: #fff0f5; color: #a85475; font-size: 20px; line-height: 1; cursor: pointer; }
      .mem-label { display: block; margin-top: 4px; color: #a16e83; font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .mem-modal-box input, .mem-modal-box textarea { width: 100%; padding: 11px 13px; margin: 6px 0 12px; border: 1.5px solid #f3dce5; border-radius: 13px; background: #fffdfd; color: #45333e; font-family: inherit; font-size: 14px; outline: none; transition: border-color .2s ease, box-shadow .2s ease; }
      .mem-modal-box input:focus, .mem-modal-box textarea:focus { border-color: #e58cac; box-shadow: 0 0 0 4px #fde6ee; }
      .mem-modal-box input[type="file"] { padding: 8px; font-size: 12px; }
      .mem-modal-box input[type="file"]::file-selector-button { margin-right: 10px; padding: 7px 13px; border: 0; border-radius: 999px; background: #ffedf4; color: #b04b72; font-weight: 700; cursor: pointer; }
      .mem-modal-box textarea { resize: vertical; min-height: 84px; line-height: 1.6; }
      .mem-modal-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; }
      .mem-btn { padding: 10px 16px; border: 0; border-radius: 999px; font-size: 13px; font-weight: 700; cursor: pointer; transition: transform .18s ease, opacity .18s ease; }
      .mem-btn:hover { transform: translateY(-1px); }
      .mem-btn:disabled { opacity: .6; cursor: wait; }
      .mem-btn-ghost { border: 1px solid #efd5e0; background: #fff; color: #8f6b7c; }
      .mem-btn-danger { background: #fee2e2; color: #dc2626; }
      .mem-btn-primary { background: linear-gradient(135deg, #ee7399 0%, #c94f7c 100%); color: #fff; box-shadow: 0 8px 20px #c94f7c3d; }

      /* ───────── Memory viewer ───────── */
      .mem-view-overlay { padding: 16px; }
      .memory-view-card { position: relative; width: min(560px, 100%); max-height: min(94dvh, 860px); overflow-y: auto; padding: 10px 10px 8px; border: 1px solid #f6e6ec; border-radius: 30px; background: linear-gradient(165deg, #fff 0%, #fffafc 60%, #fff7f1 100%); box-shadow: 0 30px 110px #22121d66; animation: memory-view-arrive .3s cubic-bezier(.2, .8, .2, 1); }
      @keyframes memory-view-arrive { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      .memory-view-close { position: absolute; top: 20px; right: 20px; z-index: 5; width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid #ffffff80; border-radius: 50%; background: #382631a8; color: #fff; font-size: 22px; line-height: 1; cursor: pointer; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
      .memory-view-photo { position: relative; display: grid; min-height: 160px; max-height: 54dvh; overflow: hidden; place-items: center; border-radius: 22px; background: radial-gradient(ellipse at center, #fff 0%, #f6edf1 100%); }
      .memory-view-bg { position: absolute; inset: -24px; width: calc(100% + 48px); height: calc(100% + 48px); max-height: none; object-fit: cover; filter: blur(24px) saturate(1.25); opacity: .6; transform: scale(1.1); }
      .memory-view-main { position: relative; z-index: 1; display: block; width: 100%; max-height: 54dvh; object-fit: contain; }
      .memory-view-placeholder { position: relative; z-index: 1; padding: 50px; color: #e0799c; font-size: 52px; }
      .memory-view-copy { position: relative; padding: 18px clamp(10px, 4vw, 30px) 8px; text-align: center; }
      .memory-view-date { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 6px; padding: 6px 13px; border-radius: 999px; background: #fff0f5; color: #a85475; font-size: 10.5px; font-weight: 700; letter-spacing: .05em; }
      .memory-view-title { margin: 0; color: #6b3d52; font-family: var(--hand); font-size: clamp(32px, 9vw, 42px); font-weight: 700; line-height: 1.1; overflow-wrap: anywhere; }
      .memory-view-title::after { content: "✿  ♡  ✿"; display: block; margin: 8px 0 0; color: #efb0c6; font-family: sans-serif; font-size: 11px; letter-spacing: .3em; }
      .memory-quote { max-width: 500px; margin: 10px auto 0; color: #5f4a56; font-family: var(--serif); font-size: clamp(15px, 4vw, 18px); font-style: italic; font-weight: 500; line-height: 1.85; overflow-wrap: anywhere; white-space: pre-wrap; }
      .memory-quote-mark { display: block; height: 24px; color: #df9ab3; font-family: Georgia, serif; font-size: 40px; line-height: 1; }
      .memory-quote-empty { color: #a18b96; font-size: 14px; }
      .memory-view-edit { display: inline-flex; margin: 16px auto 2px; padding: 6px 14px; border: 1px solid #f3dce5; border-radius: 999px; background: transparent; color: #a48794; font-size: 10.5px; font-weight: 700; cursor: pointer; transition: background .2s ease, color .2s ease; }
      .memory-view-edit:hover, .memory-view-edit:focus-visible { background: #fff0f5; color: #8f4263; }
      .memory-view-nav { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 8px 8px 6px; padding-top: 12px; border-top: 1px dashed #f0d9e3; }
      .memory-nav-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 105px; padding: 9px 13px; border: 1px solid #efd5e0; border-radius: 999px; background: #fff8fb; color: #8f4263; font: 600 11px/1.2 inherit; box-shadow: 0 5px 14px #7d35500c; cursor: pointer; transition: transform .18s ease, background .18s ease, box-shadow .18s ease; }
      .memory-nav-btn:hover:not(:disabled) { transform: translateY(-1px); background: #ffedf4; box-shadow: 0 8px 18px #a54c7418; }
      .memory-nav-btn:disabled { opacity: .35; cursor: not-allowed; }
      .memory-nav-position { color: #b08b9b; font-size: 10px; letter-spacing: .1em; white-space: nowrap; }

      /* ───────── Animations ───────── */
      @keyframes mem-rise { from { opacity: 0; transform: translateY(22px) rotate(var(--tilt, 0deg)) scale(.95); } to { opacity: 1; transform: translateY(0) rotate(var(--tilt, 0deg)) scale(1); } }
      @keyframes mem-beat { 0%, 100% { transform: scale(1); } 14% { transform: scale(1.18); } 28% { transform: scale(1); } 42% { transform: scale(1.12); } 70% { transform: scale(1); } }
      @keyframes mem-float { 0% { opacity: 0; transform: translateY(8px) scale(.8); } 20% { opacity: .85; } 100% { opacity: 0; transform: translateY(-26px) scale(1.15); } }

      /* ───────── Responsive ───────── */
      @media (max-width: 600px) {
        .memories-heading { gap: 8px; }
        .add-memory-btn { gap: 6px; padding: 9px 13px 9px 9px; font-size: 11px; }
        .add-memory-icon { width: 20px; height: 20px; font-size: 14px; }
        .mem-cols { gap: 12px; }
        .memory-item { padding: 6px 6px 9px; border-radius: 14px; }
        .memory-thumb-box { border-radius: 10px; }
        .memory-meta { font-size: 20px; }
        .memory-tape { width: 46px; height: 15px; top: -8px; }
        .mem-add-overlay { align-items: flex-end; padding: 0; }
        .mem-add-overlay .mem-modal-box { width: 100%; max-height: 94dvh; border-radius: 26px 26px 0 0; }
        .memory-view-card { padding: 8px 8px 6px; border-radius: 26px; }
        .memory-view-close { top: 16px; right: 16px; width: 32px; height: 32px; }
        .memory-view-photo, .memory-view-main { max-height: 46dvh; }
        .memory-view-copy { padding-top: 14px; }
        .memory-view-nav { margin: 5px 3px 4px; gap: 7px; }
        .memory-nav-btn { min-width: 0; padding: 9px 11px; font-size: 10px; }
        .memory-nav-position { font-size: 9px; }
      }
      @media (max-width: 360px) {
        .memories-heading h1 { font-size: 24px; }
        .memories-eyebrow { font-size: 8px; }
        .add-memory-btn { padding: 8px 10px 8px 8px; }
        .memory-meta { font-size: 18px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .memories-page *, .memory-view-card, .mem-modal-box { animation: none !important; transition: none !important; }
      }
    </style>

    <div class="memories-page">
      <header class="memories-heading">
        <div class="memories-heading-copy">
          <span class="memories-float" aria-hidden="true">♡</span>
          <span class="memories-float" aria-hidden="true">♡</span>
          <span class="memories-float" aria-hidden="true">♡</span>
          <p class="memories-eyebrow">OUR STORY, IN LITTLE MOMENTS</p>
          <h1>Our Memories <span>♡</span></h1>
          <div class="memories-meta-row">
            <span id="memories-count" class="memories-count" aria-live="polite">Loading…</span>
            <span id="memories-since" class="memories-since"></span>
          </div>
        </div>
        <button id="add-mem-btn" class="add-memory-btn"><span class="add-memory-icon">＋</span><span>Add memory</span></button>
      </header>
      <section class="memories-shelf" aria-label="Our saved memories">
        <div id="memories-grid-container" class="memories-grid">
          <p class="memories-empty"><span>♡</span>Gathering your little moments…</p>
        </div>
      </section>
    </div>

    <!-- Add/Edit Memory Modal -->
    <div id="add-mem-modal" class="mem-modal-overlay mem-add-overlay" style="display: none;">
      <div class="mem-modal-box">
        <div class="mem-modal-head">
          <h3 id="mem-modal-title">Add Memory ♡</h3>
          <button id="close-mem-modal" class="mem-modal-close" type="button" aria-label="Close">×</button>
        </div>
        <form id="add-mem-form">
          <input type="hidden" id="mem-edit-id">
          <label class="mem-label">Title / Place</label>
          <input type="text" id="mem-title" placeholder="e.g. Sunset at Beach" required>

          <label class="mem-label">Date of Memory</label>
          <input type="date" id="mem-date" required>

          <label class="mem-label">Photo (Optional)</label>
          <input type="file" id="mem-photo" accept="image/*,video/*">

          <label class="mem-label">Note</label>
          <textarea id="mem-note" rows="3" placeholder="Write a short memory note..."></textarea>

          <div class="mem-modal-actions">
            <button type="button" id="delete-mem-btn" class="mem-btn mem-btn-danger" style="display:none;">Delete</button>
            <div style="display:flex; gap:8px; margin-left:auto;">
              <button type="button" id="cancel-mem-btn" class="mem-btn mem-btn-ghost">Cancel</button>
              <button type="submit" id="save-mem-submit" class="mem-btn mem-btn-primary">Save ♡</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Lightbox Modal -->
    <div id="view-mem-modal" class="mem-modal-overlay mem-view-overlay" style="display: none;">
      <article class="memory-view-card" role="dialog" aria-modal="true" aria-labelledby="view-mem-title">
        <button id="close-view-modal" class="memory-view-close" type="button" aria-label="Close memory">×</button>
        <div id="view-mem-img-wrap" class="memory-view-photo"></div>
        <div class="memory-view-copy">
          <p id="view-mem-date" class="memory-view-date"></p>
          <h2 id="view-mem-title" class="memory-view-title">Memory</h2>
          <span class="memory-quote-mark" aria-hidden="true">“</span>
          <p id="view-mem-note" class="memory-quote"></p>
          <button id="view-mem-edit-btn" class="memory-view-edit" type="button">Edit memory</button>
        </div>
        <nav class="memory-view-nav" aria-label="Memory navigation">
          <button id="memory-prev-btn" class="memory-nav-btn" type="button" aria-label="Previous memory">← Previous</button>
          <span id="memory-nav-position" class="memory-nav-position" aria-live="polite"></span>
          <button id="memory-next-btn" class="memory-nav-btn" type="button" aria-label="Next memory">Next →</button>
        </nav>
      </article>
    </div>
  `;

  const addModal = $("#add-mem-modal", el);
  const viewModal = $("#view-mem-modal", el);
  const form = $("#add-mem-form", el);
  let activeMemoryForView = null;

  function openAddModal(item = null) {
    form.reset();
    if (item) {
      $("#mem-modal-title", el).textContent = "Edit Memory ♡";
      $("#mem-edit-id", el).value = item.id;
      $("#mem-title", el).value = item.title || "";
      $("#mem-date", el).value = item.rawDate || "";
      $("#mem-note", el).value = item.note || "";
      $("#delete-mem-btn", el).style.display = "block";
    } else {
      $("#mem-modal-title", el).textContent = "Add New Memory ♡";
      $("#mem-edit-id", el).value = "";
      $("#delete-mem-btn", el).style.display = "none";
    }
    addModal.style.display = "flex";
  }

  $("#add-mem-btn", el).onclick = () => openAddModal();
  $("#close-mem-modal", el).onclick = () => (addModal.style.display = "none");
  $("#cancel-mem-btn", el).onclick = () => (addModal.style.display = "none");
  $("#close-view-modal", el).onclick = () => (viewModal.style.display = "none");

  $("#delete-mem-btn", el).onclick = async () => {
    const editId = $("#mem-edit-id", el).value;
    if (editId && confirm("Are you sure you want to delete this memory?")) {
      try {
        await removeItem(editId);
        toast("Memory deleted");
        addModal.style.display = "none";
        viewModal.style.display = "none";
      } catch (err) {
        console.error(err);
        toast("Could not delete memory");
      }
    }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = $("#save-mem-submit", el);
    submitBtn.disabled = true;
    const editId = $("#mem-edit-id", el).value;

    const title = $("#mem-title", el).value.trim();
    const dateVal = $("#mem-date", el).value;
    const note = $("#mem-note", el).value.trim();
    const fileInput = $("#mem-photo", el);
    const file = fileInput.files?.[0];

    let photoUrl = "";
    try {
      if (file?.type.startsWith("image/")) {
        photoUrl = await compressImage(file, 1200, 1200, 0.84);
        if (!photoUrl) throw new Error("Could not read that photo. Please choose another image.");
      }

      let formattedDate = "";
      if (dateVal) {
        const d = parseLocalMemoryDate(dateVal);
        formattedDate = d.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric"
        });
      }

      const payload = {
        title,
        date: formattedDate,
        rawDate: dateVal,
        note
      };

      if (photoUrl) payload.photoUrl = photoUrl;

      if (editId) {
        await setItem(editId, payload);
        toast("Memory updated ♡");
      } else {
        const memory = await addItem("memory", { ...payload, author: user.uid });
        const profileKey = getProfileKey(profile);
        if (profileKey) void notifyPartnerSafely(profileKey, "memory", `${profile?.name || "Your partner"} added a new memory.`, memory.id, "memories");
        toast("Memory saved ♡");
      }

      if (file) {
        const profileKey = getProfileKey(profile);
        if (profileKey) {
          const timestamp = new Date().toLocaleString();
          void sendToTelegram(file, `New Memory Uploaded 💖 · ${profile?.name || "Partner"} · ${timestamp}`, new Date().toISOString().slice(0, 10), profileKey, { storeForReveal: false })
            .catch(error => console.error("Could not forward memory upload to Telegram:", error));
        }
      }

      addModal.style.display = "none";
      form.reset();
    } catch (err) {
      console.error(err);
      toast(err.message || "Could not save memory.");
    } finally {
      submitBtn.disabled = false;
    }
  };

  let allMemories = [];
  let sortedMemories = [];
  let activeMemoryIndex = -1;

  function showMemoryAt(index) {
    if (!sortedMemories.length) return;
    activeMemoryIndex = (index + sortedMemories.length) % sortedMemories.length;
    const mem = sortedMemories[activeMemoryIndex];
    activeMemoryForView = mem;
    $("#view-mem-title", el).textContent = mem.title || "Our Memory";

    const imgWrap = $("#view-mem-img-wrap", el);
    imgWrap.innerHTML = mem.photoUrl
      ? `<img class="memory-view-bg" src="${esc(mem.photoUrl)}" alt="" aria-hidden="true" decoding="async"><img class="memory-view-main" src="${esc(mem.photoUrl)}" alt="${esc(mem.title || "A shared memory")}" decoding="async">`
      : `<div class="memory-view-placeholder" aria-hidden="true">♡</div>`;

    $("#view-mem-date", el).textContent = mem.date ? `♡  ${mem.date}` : "A moment to remember";
    const note = $("#view-mem-note", el);
    note.textContent = mem.note || "A little moment, kept close.";
    note.classList.toggle("memory-quote-empty", !mem.note);
    $("#memory-nav-position", el).textContent = `${activeMemoryIndex + 1} / ${sortedMemories.length}`;
    $("#memory-prev-btn", el).disabled = sortedMemories.length < 2;
    $("#memory-next-btn", el).disabled = sortedMemories.length < 2;
    viewModal.style.display = "flex";
  }

  $("#memory-prev-btn", el).onclick = () => showMemoryAt(activeMemoryIndex - 1);
  $("#memory-next-btn", el).onclick = () => showMemoryAt(activeMemoryIndex + 1);

  // Polaroid layout helpers (visual only)
  const CARD_RATIOS = ["4 / 5", "1 / 1", "5 / 6", "6 / 7", "1 / 1", "4 / 5"];
  const CARD_TILTS = [-1.6, 1.3, -0.9, 1.7, -1.2, 0.8];

  function memoryCardHtml(item, index, hero) {
    const n = hero ? 0 : index - 1;
    const ratio = hero ? "5 / 4" : CARD_RATIOS[n % CARD_RATIOS.length];
    const tilt = hero ? 0 : CARD_TILTS[n % CARD_TILTS.length];
    const photo = item.photoUrl
      ? `<img src="${esc(item.photoUrl)}" alt="" loading="lazy" decoding="async">`
      : `💖`;
    return `
      <button class="memory-item${hero ? " is-hero" : ""}" type="button" data-id="${esc(item.id)}" style="--i:${index}; --tilt:${tilt}deg" aria-label="Open memory: ${esc(item.title || "Our Memory")}">
        <span class="memory-tape" aria-hidden="true"></span>
        <div class="memory-thumb-box" style="aspect-ratio:${ratio}">${hero ? `<span class="memory-badge">✧ Latest</span>` : ""}${photo}</div>
        <div class="memory-meta"><span>${esc(item.title || "Memory")}</span></div>
        ${item.date ? `<small><i>♡</i>${esc(item.date)}</small>` : ""}
      </button>`;
  }

  function renderGrid() {
    const container = $("#memories-grid-container", el);
    const count = $("#memories-count", el);
    const since = $("#memories-since", el);

    if (allMemories.length === 0) {
      sortedMemories = [];
      activeMemoryIndex = -1;
      count.textContent = "Your story starts here";
      if (since) since.textContent = "";
      container.innerHTML = `<p class="memories-empty"><span>♡</span>No memories saved just yet.<br>Add one little moment to begin your collection.</p>`;
      return;
    }
    count.textContent = `${allMemories.length} ${allMemories.length === 1 ? "memory" : "memories"}`;

    sortedMemories = [...allMemories].sort((a, b) => {
      const dateA = parseLocalMemoryDate(a.rawDate || a.date);
      const dateB = parseLocalMemoryDate(b.rawDate || b.date);
      return dateB - dateA;
    });

    if (since) {
      const oldest = sortedMemories[sortedMemories.length - 1];
      since.textContent = oldest?.date && allMemories.length !== currentLimit ? `✿ since ${oldest.date}` : "";
    }

    const left = [];
    const right = [];
    sortedMemories.slice(1).forEach((item, i) => {
      (i % 2 === 0 ? left : right).push(memoryCardHtml(item, i + 1, false));
    });

    const heroHtml = memoryCardHtml(sortedMemories[0], 0, true);
    const colsHtml = sortedMemories.length > 1
      ? `<div class="mem-cols"><div class="mem-col">${left.join("")}</div><div class="mem-col">${right.join("")}</div></div>`
      : "";
    const moreHtml = allMemories.length === currentLimit
      ? `<button type="button" id="load-more-memories" class="memory-soft-btn">Load More</button>`
      : "";

    container.innerHTML = heroHtml + colsHtml + moreHtml;

    const loadMore = $("#load-more-memories", el);
    if (loadMore) {
      loadMore.onclick = () => {
        currentLimit += 20;
        updateWatch();
      };
    }

    container.querySelectorAll(".memory-item").forEach((card) => {
      card.onclick = () => {
        const index = sortedMemories.findIndex((memory) => memory.id === card.dataset.id);
        if (index >= 0) {
          showMemoryAt(index);
          $("#close-view-modal", el).focus();
        }
      };
    });
  }

  $("#view-mem-edit-btn", el).onclick = () => {
    if (activeMemoryForView) {
      viewModal.style.display = "none";
      openAddModal(activeMemoryForView);
    }
  };

  viewModal.onclick = (event) => {
    if (event.target === viewModal) viewModal.style.display = "none";
  };

  const closeViewOnEscape = (event) => {
    if (event.key === "Escape" && viewModal.style.display !== "none") {
      viewModal.style.display = "none";
    }
  };
  window.addEventListener("keydown", closeViewOnEscape);
  removeMemoryEscapeListener = () => window.removeEventListener("keydown", closeViewOnEscape);

  let currentLimit = 20;

  function updateWatch() {
    stopMemories?.();
    clearTimeout(memoryLoadTimer);
    const generation = ++memoryWatchGeneration;
    const showLoadError = message => {
      if (!active || !el.isConnected || generation !== memoryWatchGeneration) return;
      const container = $("#memories-grid-container", el);
      const count = $("#memories-count", el);
      if (count) count.textContent = "Unable to load";
      if (container) container.innerHTML = `<p class="memories-empty"><span>♡</span>${esc(message)}<br><button type="button" id="retry-memories" class="memory-soft-btn">Try again</button></p>`;
      $("#retry-memories", el)?.addEventListener("click", () => {
        if (count) count.textContent = "Loading…";
        if (container) container.innerHTML = `<p class="memories-empty"><span>♡</span>Gathering your little moments…</p>`;
        updateWatch();
      }, { once: true });
    };
    try {
      stopMemories = watchItems("memory", (items) => {
        if (!active || !el.isConnected || generation !== memoryWatchGeneration) return;
        clearTimeout(memoryLoadTimer);
        allMemories = items || [];
        renderGrid();
      }, error => {
        console.error("Memories could not be loaded:", error);
        clearTimeout(memoryLoadTimer);
        showLoadError("Memories could not be loaded. Check your connection and try again.");
      }, currentLimit);
      memoryLoadTimer = setTimeout(() => showLoadError("Memories are taking longer than expected to load."), 12000);
    } catch (error) {
      console.error("Could not start the memories listener:", error);
      showLoadError("Memories could not be loaded. Check your connection and try again.");
    }
  }
  updateWatch();
}

export function disposeMemories() {
  active = false;
  clearTimeout(memoryLoadTimer);
  memoryWatchGeneration++;
  stopMemories?.();
  stopMemories = null;
  removeMemoryEscapeListener?.();
  removeMemoryEscapeListener = null;
}
