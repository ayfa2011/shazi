import { $, esc, toast } from "./utils.js";
import { watchItems, addItem, removeItem, setItem, addMemoryMedia, notifyPartnerSafely } from "./firestore.js";
import { getProfileKey } from "./profile-data.js";
import { getTelegramMediaUrl, sendToTelegram, telegramMediaReferences, telegramUploadMimeType } from "../src/services/telegramService.js";

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
      .memories-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 12px; padding-top: 10px; }
      .memories-grid > * { min-width: 0; }
      .memory-item { position: relative; display: block; width: 100%; min-width: 0; aspect-ratio: 3 / 4; padding: 0; overflow: hidden; border: 1px solid #f6e6ec; border-radius: 18px; background: linear-gradient(135deg, #fff1f6 0%, #f9dde8 50%, #f7e8da 100%); box-shadow: 0 8px 20px #6d3a5018, 0 2px 6px #6d3a500a; color: inherit; font-family: inherit; text-align: left; cursor: pointer; appearance: none; transition: transform .22s ease, box-shadow .22s ease; animation: mem-rise .45s ease backwards; animation-delay: calc(var(--i, 0) * 45ms); }
      .memory-item:hover, .memory-item:focus-visible { transform: translateY(-3px); box-shadow: 0 14px 28px #a54c7428, 0 0 0 3px #fde6ee; z-index: 2; }
      .memory-item:active { transform: scale(.98); }
      .memory-item:focus-visible { outline: 2px solid #cc7093; outline-offset: 3px; }
      .memory-tape { display:none; }
      .memory-thumb-box { position: absolute; inset: 0; display: grid; width: 100%; height: 100%; place-items: center; overflow: hidden; background: linear-gradient(135deg, #fff1f6 0%, #f9dde8 50%, #f7e8da 100%); color: #d9789b; font-size: 32px; }
      .memory-thumb-box img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; transition: transform .45s ease; }
      .memory-item:hover .memory-thumb-box img { transform: scale(1.04); }
      .memory-thumb-box::after { content: ""; position: absolute; inset: 35% 0 0; background: linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,0)); pointer-events: none; }
      .memory-badge { position: absolute; top: 9px; left: 9px; z-index: 2; padding: 4px 10px; border-radius: 999px; background: #ffffffd9; color: #b04b72; font-size: 10px; font-weight: 700; letter-spacing: .05em; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); box-shadow: 0 4px 12px #0000001a; }
      .memory-meta { position: absolute; right: 12px; bottom: 29px; left: 12px; z-index: 2; display: block; overflow: hidden; margin: 0; color: #fff; font-family: inherit; font-size: 15px; font-weight: 800; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 3px #0008; }
      .memory-item small { position: absolute; right: 12px; bottom: 11px; left: 12px; z-index: 2; display: block; overflow: hidden; margin: 0; color: #ffffffd9; font-size: 10px; font-weight: 600; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 3px #0008; }
      .memory-item small i { display:none; }
      .memory-video-indicator { position:absolute; top:10px; right:10px; z-index:2; display:grid; width:30px; height:30px; place-items:center; border:1px solid #ffffff80; border-radius:50%; background:#24131a7d; color:#fff; font-size:12px; backdrop-filter:blur(5px); }
      #load-more-memories { grid-column: 1 / -1; }
      .memory-item.is-hero { padding: 0; border-radius: 18px; }
      .memory-item.is-hero .memory-thumb-box { border-radius: 0; }
      .memory-item.is-hero .memory-meta { margin:0; font-size:15px; }
      .memory-item.is-hero small { font-size:10px; }

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
      .memory-view-photo { position: relative; display: grid; width:100%; aspect-ratio: 16 / 10; min-height: 170px; max-height: 40dvh; overflow: hidden; place-items: center; border-radius: 22px; background: linear-gradient(145deg,#ffe8f0,#f8dce7); }
      .memory-view-main { display:block; width:100%; height:100%; object-fit:cover; }
      img.memory-view-main { cursor:zoom-in; }
      video.memory-view-main { background:#21151b; }
      .memory-view-date { position:absolute; bottom:12px; left:12px; z-index:3; display:inline-flex; align-items:center; gap:6px; margin:0; padding:7px 12px; border:1px solid #ffffff80; border-radius:999px; background:#fffaf2e8; color:#923f65; font-size:11px; font-weight:700; box-shadow:0 3px 12px #35172420; backdrop-filter:blur(8px); }
      .memory-view-placeholder { color: #e0799c; font-size: 52px; }
      .memory-view-copy { position: relative; padding: 16px 12px 10px; text-align: left; }
      .memory-view-title { margin: 0; color: #6b3d52; font-family: var(--serif); font-size: clamp(24px, 6vw, 32px); font-weight: 700; line-height: 1.15; overflow-wrap: anywhere; }
      .memory-view-title::after { content: ""; }
      .memory-quote { max-width: 500px; margin: 8px 0 0; color: #705b66; font-family: inherit; font-size: 14px; font-style: normal; font-weight: 400; line-height: 1.65; overflow-wrap: anywhere; white-space: pre-wrap; }
      .memory-quote-mark { display:none; }
      .memory-quote-empty { color: #a18b96; font-size: 14px; }
      .memory-gallery { padding:12px; border:1px solid #f5dce6; border-radius:20px; background:#fff8fb; }
      .memory-gallery-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:11px; }
      .memory-gallery-title { min-width:0; margin:0; color:#75445b; font-size:15px; font-weight:800; }
      .memory-gallery-count { display:block; margin-top:3px; color:#a78090; font-size:10px; font-weight:500; }
      .memory-add-photos { flex:none; padding:8px 12px; border:1px solid #f0ccda; border-radius:999px; background:#fff; color:#a5446b; font-size:11px; font-weight:700; cursor:pointer; }
      .memory-add-photos:disabled { opacity:.6; }
      .memory-media-input { display:none; }
      .memory-gallery-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
      .memory-gallery-item { position:relative; display:block; width:100%; aspect-ratio:1; padding:0; overflow:hidden; border:1px solid #f2dce5; border-radius:13px; background:#f9e8ef; cursor:pointer; }
      .memory-gallery-item img { display:block; width:100%; height:100%; object-fit:cover; }
      .memory-gallery-item .memory-video-indicator { top:auto; right:auto; left:50%; bottom:50%; transform:translate(-50%,50%); }
      .memory-view-edit { display: inline-flex; margin: 16px auto 2px; padding: 6px 14px; border: 1px solid #f3dce5; border-radius: 999px; background: transparent; color: #a48794; font-size: 10.5px; font-weight: 700; cursor: pointer; transition: background .2s ease, color .2s ease; }
      .memory-view-edit:hover, .memory-view-edit:focus-visible { background: #fff0f5; color: #8f4263; }
      .memory-view-nav { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 8px 8px 6px; padding-top: 12px; border-top: 1px dashed #f0d9e3; }
      .memory-nav-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 105px; padding: 9px 13px; border: 1px solid #efd5e0; border-radius: 999px; background: #fff8fb; color: #8f4263; font: 600 11px/1.2 inherit; box-shadow: 0 5px 14px #7d35500c; cursor: pointer; transition: transform .18s ease, background .18s ease, box-shadow .18s ease; }
      .memory-nav-btn:hover:not(:disabled) { transform: translateY(-1px); background: #ffedf4; box-shadow: 0 8px 18px #a54c7418; }
      .memory-nav-btn:disabled { opacity: .35; cursor: not-allowed; }
      .memory-nav-position { color: #b08b9b; font-size: 10px; letter-spacing: .1em; white-space: nowrap; }
      .memory-image-lightbox { position:fixed; inset:0; z-index:1100; display:none; align-items:center; justify-content:center; padding:env(safe-area-inset-top,12px) env(safe-area-inset-right,12px) env(safe-area-inset-bottom,12px) env(safe-area-inset-left,12px); background:#1b1018ed; touch-action:pan-x pan-y pinch-zoom; }
      .memory-image-lightbox[aria-hidden="false"] { display:flex; }
      .memory-image-lightbox img, .memory-image-lightbox video { display:block; max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; border-radius:8px; box-shadow:0 14px 50px #0007; touch-action:pan-x pan-y pinch-zoom; }
      .memory-image-lightbox video { width:100%; max-height:calc(100dvh - 36px); background:#080608; }
      .memory-image-lightbox-close { position:absolute; top:max(14px,env(safe-area-inset-top,14px)); right:max(14px,env(safe-area-inset-right,14px)); width:42px; height:42px; border:1px solid #ffffff55; border-radius:50%; background:#fff2; color:#fff; font-size:25px; cursor:pointer; }

      /* ───────── Animations ───────── */
      @keyframes mem-rise { from { opacity: 0; transform: translateY(22px) rotate(var(--tilt, 0deg)) scale(.95); } to { opacity: 1; transform: translateY(0) rotate(var(--tilt, 0deg)) scale(1); } }
      @keyframes mem-beat { 0%, 100% { transform: scale(1); } 14% { transform: scale(1.18); } 28% { transform: scale(1); } 42% { transform: scale(1.12); } 70% { transform: scale(1); } }
      @keyframes mem-float { 0% { opacity: 0; transform: translateY(8px) scale(.8); } 20% { opacity: .85; } 100% { opacity: 0; transform: translateY(-26px) scale(1.15); } }

      /* ───────── Responsive ───────── */
      @media (max-width: 600px) {
        .memories-heading { gap: 8px; }
        .add-memory-btn { gap: 6px; padding: 9px 13px 9px 9px; font-size: 11px; }
        .add-memory-icon { width: 20px; height: 20px; font-size: 14px; }
        .memories-grid { gap: 10px; }
        .memory-item { border-radius: 15px; }
        .memory-meta { right: 9px; bottom: 27px; left: 9px; font-size: 13px; }
        .memory-item small { right: 9px; bottom: 10px; left: 9px; font-size: 9px; }
        .mem-add-overlay { align-items: flex-end; padding: 0; }
        .mem-add-overlay .mem-modal-box { width: 100%; max-height: 94dvh; border-radius: 26px 26px 0 0; }
        .memory-view-card { padding: 8px 8px 6px; border-radius: 26px; }
        .memory-view-close { top: 16px; right: 16px; width: 32px; height: 32px; }
        .memory-view-photo { max-height: 36dvh; }
        .memory-view-copy { padding-top: 14px; }
        .memory-view-nav { margin: 5px 3px 4px; gap: 7px; }
        .memory-nav-btn { min-width: 0; padding: 9px 11px; font-size: 10px; }
        .memory-nav-position { font-size: 9px; }
      }
      @media (max-width: 360px) {
        .memories-heading h1 { font-size: 24px; }
        .memories-eyebrow { font-size: 8px; }
        .add-memory-btn { padding: 8px 10px 8px 8px; }
        .memory-meta { font-size: 12px; }
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
        <div id="view-mem-img-wrap" class="memory-view-photo">
          <div class="memory-view-placeholder" aria-hidden="true">♡</div>
          <p id="view-mem-date" class="memory-view-date"></p>
        </div>
        <div class="memory-view-copy">
          <h2 id="view-mem-title" class="memory-view-title">Memory</h2>
          <span class="memory-quote-mark" aria-hidden="true">“</span>
          <p id="view-mem-note" class="memory-quote"></p>
          <button id="view-mem-edit-btn" class="memory-view-edit" type="button">Edit memory</button>
        </div>
        <section class="memory-gallery" aria-labelledby="memory-gallery-heading">
          <header class="memory-gallery-head">
            <h3 class="memory-gallery-title" id="memory-gallery-heading">Photos and videos<span class="memory-gallery-count" id="memory-gallery-count">0 photos and 0 videos</span></h3>
            <button class="memory-add-photos" id="memory-add-photos" type="button">＋ Add Photos</button>
            <input class="memory-media-input" id="memory-media-input" type="file" accept="image/*,video/*" multiple aria-label="Add photos or videos to this memory">
          </header>
          <div class="memory-gallery-grid" id="memory-gallery-grid"></div>
        </section>
        <nav class="memory-view-nav" aria-label="Memory navigation">
          <button id="memory-prev-btn" class="memory-nav-btn" type="button" aria-label="Previous memory">← Previous</button>
          <span id="memory-nav-position" class="memory-nav-position" aria-live="polite"></span>
          <button id="memory-next-btn" class="memory-nav-btn" type="button" aria-label="Next memory">Next →</button>
        </nav>
      </article>
    </div>
    <div id="memory-image-lightbox" class="memory-image-lightbox" role="dialog" aria-modal="true" aria-label="Full size memory photo" aria-hidden="true">
      <button id="memory-image-lightbox-close" class="memory-image-lightbox-close" type="button" aria-label="Close full size photo">×</button>
      <img id="memory-image-lightbox-img" alt="Full size memory photo">
      <video id="memory-image-lightbox-video" controls playsinline webkit-playsinline preload="metadata" style="display:none" aria-label="Full size memory video"></video>
    </div>
  `;

  const addModal = $("#add-mem-modal", el);
  const viewModal = $("#view-mem-modal", el);
  const form = $("#add-mem-form", el);
  const mediaInput = $("#memory-media-input", el);
  const mediaGrid = $("#memory-gallery-grid", el);
  const imageLightbox = $("#memory-image-lightbox", el);
  const lightboxImage = $("#memory-image-lightbox-img", el);
  const lightboxVideo = $("#memory-image-lightbox-video", el);
  let activeMemoryForView = null;
  let selectedGalleryMedia = null;

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
  $("#memory-image-lightbox-close", el).onclick = closeImageLightbox;
  imageLightbox.onclick = event => {
    if (event.target === imageLightbox) closeImageLightbox();
  };

  function closeImageLightbox() {
    imageLightbox.setAttribute("aria-hidden", "true");
    lightboxImage.removeAttribute("src");
    lightboxImage.style.display = "none";
    lightboxVideo.pause();
    lightboxVideo.removeAttribute("src");
    lightboxVideo.load();
    lightboxVideo.style.display = "none";
  }

  function openImageLightbox(image) {
    lightboxVideo.pause();
    lightboxVideo.removeAttribute("src");
    lightboxVideo.style.display = "none";
    lightboxImage.style.display = "block";
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt || "Full size memory photo";
    imageLightbox.setAttribute("aria-hidden", "false");
    $("#memory-image-lightbox-close", el).focus();
  }

  async function openGalleryMediaLightbox(item) {
    if (!item) return;
    imageLightbox.setAttribute("aria-hidden", "false");
    lightboxImage.removeAttribute("src");
    lightboxImage.style.display = "none";
    lightboxVideo.pause();
    lightboxVideo.removeAttribute("src");
    if (item.type === "video") {
      lightboxVideo.style.display = "block";
      lightboxVideo.setAttribute("aria-label", item.name || "Memory video");
      const url = item.url || (item.telegramFileId ? await getTelegramMediaUrl(item.telegramFileId, item.mimeType || "video/mp4") : "");
      if (!url) { closeImageLightbox(); toast("This video is missing its media link."); return; }
      lightboxVideo.src = url;
      lightboxVideo.load();
    } else {
      lightboxVideo.style.display = "none";
      const url = item.url || (item.telegramFileId ? await getTelegramMediaUrl(item.telegramFileId, item.mimeType || "image/jpeg") : "");
      if (!url) { closeImageLightbox(); toast("This photo is missing its media link."); return; }
      lightboxImage.style.display = "block";
      lightboxImage.src = url;
      lightboxImage.alt = item.name || "Full size memory photo";
    }
    $("#memory-image-lightbox-close", el).focus();
  }

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

    let isVideo = false;
    try {
      let mediaMetadata = {};
      if (file) {
        isVideo = file.type.startsWith("video/");
        const profileKey = getProfileKey(profile);
        const timestamp = new Date().toLocaleString();
        const result = await sendToTelegram(file, `New Memory Uploaded 💖 · ${profile?.name || "Partner"} · ${timestamp}`, new Date().toISOString().slice(0, 10), profileKey, { storeForReveal: false });
        mediaMetadata = { ...telegramMediaReferences(result), photoMimeType: telegramUploadMimeType(file) };
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

      if (file) payload.mediaType = isVideo ? "video" : "image";
      if (file) payload.photoUrl = "";
      Object.assign(payload, mediaMetadata);

      if (editId) {
        await setItem(editId, payload);
        toast("Memory updated ♡");
      } else {
        const payloadData = { ...payload, author: user.uid };
        const memoryRef = await addItem("memory", payloadData);
        // Optimistically add to allMemories
        const newMemory = { id: memoryRef.id, ...payloadData, author: user.uid, createdAt: { toMillis: () => Date.now() }, isOptimistic: true };
        allMemories = [newMemory, ...allMemories];
        renderGrid();

        const profileKey = getProfileKey(profile);
        if (profileKey) void notifyPartnerSafely(profileKey, "memory", `${profile?.name || "Your partner"} added a new memory.`, memoryRef.id, "memories");
        toast("Memory saved ♡");
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

    selectedGalleryMedia = null;
    renderMemoryHero(mem);
    renderMemoryGallery(mem);
    const note = $("#view-mem-note", el);
    note.textContent = mem.note || "A little moment, kept close.";
    note.classList.toggle("memory-quote-empty", !mem.note);
    $("#memory-nav-position", el).textContent = `${activeMemoryIndex + 1} / ${sortedMemories.length}`;
    $("#memory-prev-btn", el).disabled = sortedMemories.length < 2;
    $("#memory-next-btn", el).disabled = sortedMemories.length < 2;
    viewModal.style.display = "flex";
  }

  function renderMemoryHero(memory, selected = null) {
    const imgWrap = $("#view-mem-img-wrap", el);
    imgWrap.onclick = event => {
      const image = event.target.closest("img.memory-view-main");
      if (!image) return;
      openImageLightbox(image);
    };
    imgWrap.onkeydown = event => {
      const image = event.target.closest("img.memory-view-main");
      if (!image || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      openImageLightbox(image);
    };
    const isVideo = selected?.type === "video" || (!selected && memory.mediaType === "video");
    const mediaUrl = selected?.url || memory.photoUrl || "";
    const fileId = selected?.telegramFileId || (!selected ? memory.telegramFileId : "");
    const mimeType = selected?.mimeType || memory.photoMimeType || (isVideo ? "video/mp4" : "image/jpeg");
    imgWrap.querySelectorAll(".memory-view-main,.memory-view-placeholder").forEach(node => node.remove());
    if (isVideo && (mediaUrl || fileId)) {
      const video = document.createElement("video");
      video.className = "memory-view-main";
      video.controls = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.preload = "metadata";
      video.setAttribute("aria-label", selected?.name || "Memory video");
      video.setAttribute("controlslist", "nodownload");
      if (mediaUrl) video.src = mediaUrl;
      else getTelegramMediaUrl(fileId, mimeType).then(url => { if (video.isConnected) { video.src = url; video.load(); } }).catch(error => console.error("Memory video could not load:", error));
      video.addEventListener("error", () => console.error("Memory video playback failed", video.error, { mimeType, mediaUrl }), { once: true });
      imgWrap.prepend(video);
    } else if (mediaUrl || fileId) {
      const image = document.createElement("img");
      image.className = "memory-view-main";
      if (mediaUrl) image.src = mediaUrl;
      else getTelegramMediaUrl(fileId, mimeType).then(url => { if (image.isConnected) image.src = url; }).catch(error => console.error("Memory photo could not load:", error));
      image.alt = memory.title || "A shared memory";
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.setAttribute("aria-label", `View full-size photo: ${memory.title || "A shared memory"}`);
      image.decoding = "async";
      imgWrap.prepend(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "memory-view-placeholder";
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.textContent = "♡";
      imgWrap.prepend(placeholder);
    }
    const dateBadge = $("#view-mem-date", el);
    dateBadge.textContent = memory.date ? `♡  ${memory.date}` : "A moment to remember";
  }

  function renderMemoryGallery(memory) {
    const media = Array.isArray(memory.mediaItems) ? memory.mediaItems : [];
    const primaryIsVideo = memory.mediaType === "video";
    const hasPrimaryMedia = Boolean(memory.photoUrl || memory.telegramFileId);
    const photos = media.filter(item => item.type !== "video").length + (hasPrimaryMedia && !primaryIsVideo ? 1 : 0);
    const videos = media.filter(item => item.type === "video").length + (hasPrimaryMedia && primaryIsVideo ? 1 : 0);
    $("#memory-gallery-count", el).textContent = `${photos} ${photos === 1 ? "photo" : "photos"} and ${videos} ${videos === 1 ? "video" : "videos"}`;
    mediaGrid.innerHTML = media.map((item, index) => {
      const isVideo = item.type === "video";
      const thumbnail = item.thumbnailUrl || (!isVideo ? item.url : "");
      if (!thumbnail && !item.telegramFileId && !item.url) return "";
      const mediaAttrs = thumbnail ? `src="${esc(thumbnail)}"` : item.telegramFileId ? `data-memory-file-id="${esc(item.telegramFileId)}" data-memory-mime="${esc(item.mimeType || (isVideo ? "video/mp4" : "image/jpeg"))}" data-memory-kind="${esc(item.type || "photo")}"` : `data-memory-src="${esc(item.url)}" data-memory-mime="${esc(item.mimeType || "video/mp4")}" data-memory-kind="${esc(item.type || "photo")}"`;
      return `<button class="memory-gallery-item" type="button" data-media-index="${index}" aria-label="Open full-size ${isVideo ? "video" : "photo"}${item.name ? `: ${esc(item.name)}` : ""}"><img ${mediaAttrs} alt="" loading="lazy" decoding="async">${isVideo ? `<span class="memory-video-indicator" aria-hidden="true">▶</span>` : ""}</button>`;
    }).join("");
    mediaGrid.querySelectorAll("[data-media-index]").forEach(button => {
      button.onclick = () => {
        selectedGalleryMedia = media[Number(button.dataset.mediaIndex)] || null;
        if (selectedGalleryMedia) void openGalleryMediaLightbox(selectedGalleryMedia).catch(error => { console.error("Could not open memory media:", error); toast("Could not open this media. Please try again."); });
      };
    });
    hydrateMemoryThumbnails(mediaGrid);
  }

  function hydrateMemoryThumbnails(container) {
    const pending = [...container.querySelectorAll("img[data-memory-file-id], img[data-memory-src]")];
    pending.forEach(async image => {
      try {
        const source = image.dataset.memorySrc || await getTelegramMediaUrl(image.dataset.memoryFileId, image.dataset.memoryMime);
        if (!image.isConnected) return;
        if (image.dataset.memoryKind === "video") {
          const response = await fetch(source);
          if (!response.ok) throw new Error(`Video thumbnail request failed (${response.status})`);
          const blob = await response.blob();
          image.src = await createVideoThumbnail(blob);
        } else image.src = source;
      } catch (error) {
        console.error("Memory thumbnail could not load:", error);
        if (image.isConnected && image.dataset.memoryKind === "video") image.alt = "Video preview unavailable — tap to play";
      }
    });
  }

  $("#memory-add-photos", el).onclick = () => {
    if (!activeMemoryForView) return;
    mediaInput.click();
  };

  mediaInput.onchange = async () => {
    const files = [...(mediaInput.files || [])];
    const memory = activeMemoryForView;
    mediaInput.value = "";
    if (!memory || !files.length) return;
    const addButton = $("#memory-add-photos", el);
    addButton.disabled = true;
    addButton.textContent = "Uploading…";
    try {
      const uploadedMedia = [];
      // Chunk uploads to avoid browser/network limits
      for (let i = 0; i < files.length; i += 3) {
        const chunk = files.slice(i, i + 3);
        const chunkResults = await Promise.all(chunk.map(async file => {
          const type = file.type.startsWith("video/") ? "video" : "photo";
          const createdAtMs = Date.now();
          const timestamp = new Date(createdAtMs).toLocaleString();
          const result = await sendToTelegram(file, `New Memory Uploaded 💖 · ${profile?.name || "Partner"} · ${timestamp}`, new Date(createdAtMs).toISOString().slice(0, 10), getProfileKey(profile), { storeForReveal: false });
          return { ...telegramMediaReferences(result), type, mimeType: telegramUploadMimeType(file), name: file.name || (type === "video" ? "Video" : "Photo"), createdAtMs };
        }));
        uploadedMedia.push(...chunkResults);
        addButton.textContent = `Uploading (${uploadedMedia.length}/${files.length})…`;
      }

      const current = allMemories.find(item => item.id === memory.id) || memory;
      await addMemoryMedia(memory.id, uploadedMedia);
      const mediaItems = [...(current.mediaItems || []), ...uploadedMedia];
      const updateMemory = item => item.id === memory.id ? { ...item, mediaItems } : item;
      allMemories = allMemories.map(updateMemory);
      sortedMemories = sortedMemories.map(updateMemory);
      activeMemoryForView = { ...current, mediaItems };
      toast(`${uploadedMedia.length} item${uploadedMedia.length === 1 ? "" : "s"} added to this memory ♡`);
      renderMemoryGallery(activeMemoryForView);
    } catch (error) {
      console.error("Could not add memory media:", error);
      toast(error.message || "Could not upload media to Telegram. Please try again.");
    } finally {
      addButton.disabled = false;
      addButton.textContent = "＋ Add Photos";
    }
  };

  $("#memory-prev-btn", el).onclick = () => showMemoryAt(activeMemoryIndex - 1);
  $("#memory-next-btn", el).onclick = () => showMemoryAt(activeMemoryIndex + 1);

  function createVideoThumbnail(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const objectUrl = URL.createObjectURL(file);
      const cleanup = () => { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(objectUrl); };
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      const captureFrame = () => {
        try {
          if (!video.videoWidth || !video.videoHeight) throw new Error("Video frame is not ready.");
          const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
          const width = Math.max(1, Math.round(video.videoWidth * scale));
          const height = Math.max(1, Math.round(video.videoHeight * scale));
          const thumbnail = document.createElement("canvas");
          thumbnail.width = width;
          thumbnail.height = height;
          const context = thumbnail.getContext("2d");
          if (!context) throw new Error("Could not create a video thumbnail.");
          context.drawImage(video, 0, 0, width, height);
          const dataUrl = thumbnail.toDataURL("image/jpeg", 0.68);
          cleanup();
          resolve(dataUrl);
        } catch (error) { cleanup(); reject(error); }
      };
      video.onloadeddata = () => {
        if (Number.isFinite(video.duration) && video.duration > 0.4) {
          try { video.currentTime = Math.min(0.5, video.duration / 3); } catch { captureFrame(); }
        } else captureFrame();
      };
      video.onseeked = captureFrame;
      video.onerror = () => { cleanup(); reject(new Error("Could not read this video. Choose another file.")); };
      video.src = objectUrl;
    });
  }

  function memoryCardHtml(item, index) {
    const photo = item.photoUrl
      ? `<img src="${esc(item.photoUrl)}" alt="" loading="lazy" decoding="async">`
      : item.telegramFileId
        ? `<img data-memory-file-id="${esc(item.telegramFileId)}" data-memory-mime="${esc(item.photoMimeType || "application/octet-stream")}" data-memory-kind="${esc(item.mediaType || "image")}" alt="" loading="lazy" decoding="async">`
      : `💖`;
    return `
      <button class="memory-item${index === 0 ? " is-hero" : ""}" type="button" data-id="${esc(item.id)}" style="--i:${index}" aria-label="Open memory: ${esc(item.title || "Our Memory")}${item.mediaType === "video" ? ", video" : ""}">
        <span class="memory-tape" aria-hidden="true"></span>
        <div class="memory-thumb-box">${index === 0 ? `<span class="memory-badge">✧ Latest</span>` : ""}${photo}${item.mediaType === "video" ? `<span class="memory-video-indicator" aria-label="Video">▶</span>` : ""}</div>
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

    const moreHtml = allMemories.length === currentLimit
      ? `<button type="button" id="load-more-memories" class="memory-soft-btn">Load More</button>`
      : "";

    container.innerHTML = sortedMemories.map((item, index) => memoryCardHtml(item, index)).join("") + moreHtml;

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
    hydrateMemoryThumbnails(container);
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
    if (event.key === "Escape" && imageLightbox.getAttribute("aria-hidden") === "false") {
      closeImageLightbox();
      $("#view-mem-img-wrap img.memory-view-main", el)?.focus();
      return;
    }
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
        // Keep media just uploaded in the current view if Firestore briefly
        // delivers an older snapshot before the mediaItems update is visible.
        const incomingItems = items || [];
        const incomingIds = new Set(incomingItems.map(i => i.id));
        const optimisticItems = allMemories.filter(i => i.isOptimistic && !incomingIds.has(i.id));

        const updatedItems = incomingItems.map(item => {
          const previous = allMemories.find(existing => existing.id === item.id);
          if (!previous || !Array.isArray(previous.mediaItems) || !previous.mediaItems.length) return { ...item, isOptimistic: false };
          const savedMedia = Array.isArray(item.mediaItems) ? item.mediaItems : [];
          const mediaKey = media => media.telegramFileId || media.url || `${media.name || ""}:${media.createdAtMs || ""}`;
          const mergedMedia = [...savedMedia];
          const knownKeys = new Set(savedMedia.map(mediaKey));
          for (const media of previous.mediaItems) {
            const key = mediaKey(media);
            if (!knownKeys.has(key)) {
              mergedMedia.push(media);
              knownKeys.add(key);
            }
          }
          return { ...item, mediaItems: mergedMedia, isOptimistic: false };
        });

        allMemories = [...updatedItems, ...optimisticItems];

        if (activeMemoryForView) {
          const refreshed = allMemories.find(item => item.id === activeMemoryForView.id);
          if (refreshed) activeMemoryForView = refreshed;
        }
        renderGrid();
        if (viewModal.style.display !== "none" && activeMemoryForView) {
          renderMemoryGallery(activeMemoryForView);
        }
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
