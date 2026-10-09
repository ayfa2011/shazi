import { $, esc, toast, compressImage } from "./utils.js";
import { watchItems, addItem, removeItem, setItem, notifyPartnerSafely } from "./firestore.js";
import { getProfileKey } from "./profile-data.js";

let stopMemories = null;
let active = false;
let removeMemoryEscapeListener = null;

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
  removeMemoryEscapeListener?.();
  removeMemoryEscapeListener = null;
  active = true;

  el.innerHTML = `
    <style>
      .memories-page { max-width: 980px; margin: 0 auto; padding: 4px 2px 20px; color: #45333e; }
      .memories-page, .memories-page * { box-sizing: border-box; }
      .memories-page button { -webkit-tap-highlight-color: transparent; }
      .memories-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 12px 4px 22px; }
      .memories-heading-copy { position: relative; }
      .memories-heading h1 { font-family: "Playfair Display", Georgia, serif; letter-spacing: -.035em; text-shadow: 0 4px 22px #d79ab41c; }
      .memories-heading-copy { min-width: 0; }
      .memories-eyebrow { margin: 0 0 6px; color: #a16e83; font-size: 9px; font-weight: 700; letter-spacing: .18em; }
      .memories-heading h1 { margin: 0; color: #75445b; font-size: clamp(27px, 7vw, 37px); line-height: 1.15; }
      .memories-heading h1 span { color: #e58cac; font-family: sans-serif; font-size: .72em; }
      .memories-heading-copy > p:last-child { margin: 8px 0 0; color: #917d87; font-size: 12px; line-height: 1.55; }
      .add-memory-btn { flex: none; display: inline-flex; align-items: center; gap: 7px; padding: 10px 15px; border: 1px solid #f3d4df; border-radius: 999px; background: linear-gradient(135deg, #fff 0%, #fff2f6 100%); color: #8f4263; box-shadow: 0 8px 22px #a64e7412, inset 0 1px 0 #fff; font-size: 11px; font-weight: 700; transition: transform .22s ease, box-shadow .22s ease; }
      .add-memory-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 20px #8f315d18; }
      .add-memory-icon { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: #ffedf4; color: #cd5a83; font-size: 15px; }
      .memories-shelf { position: relative; padding: clamp(12px, 2.4vw, 22px); border: 1px solid #f0dfe7; border-radius: 28px; background: linear-gradient(145deg, #ffffffed 0%, #fff8fbf2 55%, #fff5efed 100%); box-shadow: 0 18px 48px #8f315d10, inset 0 1px 0 #fff; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
      .memories-shelf-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 1px 13px; }
      .memories-shelf-label { display: flex; align-items: center; gap: 7px; color: #785364; font-size: 11px; font-weight: 700; }
      .memories-shelf-label span { font-size: 14px; }
      .memories-count { color: #aa8f9c; font-size: 10px; }
      .memories-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(8px, 1.8vw, 18px); align-items: start; }
      .memories-grid > * { min-width: 0; }
      .memory-item { min-width: 0; display: flex; flex-direction: column; align-items: stretch; padding: 0; border: 0; background: transparent; color: inherit; font-family: inherit; text-align: left; cursor: pointer; appearance: none; }
      .memory-item:focus-visible { outline: 2px solid #cc7093; outline-offset: 3px; border-radius: 17px; }
      .memory-thumb-box { position: relative; width: 100%; aspect-ratio: 1 / 1; overflow: hidden; border: 1px solid #f5dce6; border-radius: 18px; padding: 3px; background: linear-gradient(135deg, #fff 0%, #f7dce6 48%, #f4e4d8 100%); box-shadow: 0 7px 20px #70405612, inset 0 1px 0 #fff; display: grid; place-items: center; color: #d9789b; font-size: 27px; transition: transform .24s ease, box-shadow .24s ease, border-color .24s ease; }
      .memory-thumb-box img { border-radius: 14px; }
      .memory-item:hover .memory-thumb-box, .memory-item:focus-visible .memory-thumb-box { transform: translateY(-3px) scale(1.012); border-color: #e8b4c8; box-shadow: 0 13px 28px #a54c741e, 0 0 0 3px #fbe8ef; }
      .memory-thumb-box img { display: block; width: 100%; height: 100%; object-fit: cover; }
      .memory-meta { display: block; overflow: hidden; margin: 9px 2px 0; color: #614657; font-family: "Playfair Display", Georgia, serif; font-size: 12px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .memory-item small { margin: 4px 2px 0; color: #a58e9a; font-size: 10px; }
      .memory-view-nav { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 8px 10px 7px; padding-top: 14px; border-top: 1px solid #f1e0e7; }
      .memory-nav-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-width: 105px; padding: 9px 13px; border: 1px solid #efd5e0; border-radius: 999px; background: #fff8fb; color: #8f4263; font: 600 11px/1.2 inherit; box-shadow: 0 5px 14px #7d35500c; cursor: pointer; transition: transform .18s ease, background .18s ease, box-shadow .18s ease; }
      .memory-nav-btn:hover:not(:disabled) { transform: translateY(-1px); background: #ffedf4; box-shadow: 0 8px 18px #a54c7418; }
      .memory-nav-btn:disabled { opacity: .35; cursor: not-allowed; }
      .memory-nav-position { color: #b08b9b; font-size: 10px; letter-spacing: .08em; white-space: nowrap; }
      .memories-empty { grid-column: 1 / -1; margin: 0; padding: 28px 12px; border: 1px dashed #efd8e2; border-radius: 17px; color: #987e8b; font-size: 12px; line-height: 1.6; text-align: center; }
      .memories-empty span { display: block; margin-bottom: 6px; font-size: 23px; }
      .mem-modal-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; background: rgba(48, 31, 42, .64); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px); }
      .mem-modal-box { width: min(420px, 100%); max-height: min(90dvh, 760px); overflow-y: auto; padding: 22px; border: 1px solid #f2dfe7; border-radius: 22px; background: #fffdfd; box-shadow: 0 24px 80px #29132240; }
      .mem-modal-box input, .mem-modal-box textarea { width: 100%; padding: 10px; margin: 6px 0 12px; border: 1px solid #efd9e2; border-radius: 10px; background: #fff; color: #45333e; font-family: inherit; outline: none; }
      .mem-modal-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; }
      .mem-view-overlay { padding: 18px; }
      .memory-view-card { position: relative; width: min(690px, 100%); max-height: min(92dvh, 820px); overflow-y: auto; padding: 12px; border: 1px solid #f3e4e9; border-radius: 28px; background: linear-gradient(160deg, #fff 0%, #fffafc 60%, #fff8f3 100%); box-shadow: 0 28px 100px #22121d55; animation: memory-view-arrive .24s ease-out; }
      @keyframes memory-view-arrive { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
      .memory-view-close { position: absolute; top: 21px; right: 21px; z-index: 1; width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid #fff8; border-radius: 50%; background: #382631a8; color: #fff; font-size: 22px; line-height: 1; backdrop-filter: blur(8px); }
      .memory-view-photo { display: grid; min-height: 150px; max-height: 55dvh; overflow: hidden; place-items: center; border-radius: 20px; background: radial-gradient(ellipse at center, #fff 0%, #f6edf1 100%); }
      .memory-view-photo img { display: block; width: 100%; max-height: 55dvh; object-fit: contain; }
      .memory-view-placeholder { padding: 45px; color: #d9789b; font-size: 48px; }
      .memory-view-copy { padding: 20px clamp(8px, 4vw, 32px) 9px; text-align: center; }
      .memory-view-date { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 8px; padding: 6px 10px; border-radius: 999px; background: #fff0f5; color: #a85475; font-size: 10px; font-weight: 700; letter-spacing: .035em; }
      .memory-view-title { margin: 0; color: #684355; font-size: clamp(23px, 6vw, 31px); line-height: 1.2; overflow-wrap: anywhere; }
      .memory-quote { max-width: 530px; margin: 15px auto 0; color: #624d58; font-family: "Playfair Display", Georgia, serif; font-size: clamp(15px, 4vw, 19px); font-weight: 500; line-height: 1.8; overflow-wrap: anywhere; white-space: pre-wrap; }
      .memory-quote-mark { display: block; height: 22px; color: #df9ab3; font-family: Georgia, serif; font-size: 36px; line-height: 1; }
      .memory-quote-empty { color: #a18b96; font-size: 14px; font-style: italic; }
      .memory-view-edit { display: block; margin: 17px auto 3px; padding: 5px 8px; border-radius: 8px; background: transparent; color: #a48794; font-size: 10px; font-weight: 600; opacity: .82; }
      .memory-view-edit:hover, .memory-view-edit:focus-visible { background: #fff0f5; color: #8f4263; opacity: 1; }
      @media (max-width: 600px) {
        .memories-heading { align-items: center; gap: 9px; }
        .memories-heading-copy > p:last-child { max-width: 215px; font-size: 10px; }
        .add-memory-btn { gap: 5px; padding: 8px 10px; font-size: 10px; }
        .memories-shelf { padding: 12px; border-radius: 21px; }
        .memories-grid { gap: 10px; }
        .memory-thumb-box { border-radius: 14px; }
        .memory-view-card { padding: 9px; border-radius: 23px; }
        .memory-view-close { top: 16px; right: 16px; width: 32px; height: 32px; }
        .memory-view-photo, .memory-view-photo img { max-height: 43dvh; }
        .memory-view-copy { padding-top: 16px; }
        .memory-view-nav { margin: 5px 3px 4px; gap: 7px; }
        .memory-nav-btn { min-width: 0; padding: 9px 11px; font-size: 10px; }
        .memory-nav-position { font-size: 9px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .memory-item, .memory-thumb-box, .add-memory-btn, .memory-nav-btn, .memory-view-card { animation: none !important; transition: none !important; }
      }
      @media (max-width: 360px) {
        .memories-heading h1 { font-size: 25px; }
        .memories-eyebrow { font-size: 8px; }
        .add-memory-btn { padding: 7px 8px; }
      }
    </style>

    <div class="memories-page">
      <header class="memories-heading">
        <div class="memories-heading-copy">
          <p class="memories-eyebrow">OUR STORY, IN LITTLE MOMENTS</p>
          <h1>Our Memories <span>♡</span></h1>
          <p>A little place to return to the moments that feel like home.</p>
        </div>
        <button id="add-mem-btn" class="add-memory-btn"><span class="add-memory-icon">＋</span><span>Add memory</span></button>
      </header>
      <section class="memories-shelf" aria-label="Our saved memories">
        <div class="memories-shelf-head">
          <div class="memories-shelf-label"><span>✧</span> Little keepsakes</div>
          <span id="memories-count" class="memories-count" aria-live="polite">Loading…</span>
        </div>
        <div id="memories-grid-container" class="memories-grid">
          <p class="memories-empty"><span>♡</span>Gathering your little moments…</p>
        </div>
      </section>
    </div>

    <!-- Add/Edit Memory Modal -->
    <div id="add-mem-modal" class="mem-modal-overlay" style="display: none;">
      <div class="mem-modal-box">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 id="mem-modal-title" style="margin:0; color:#881337;">Add Memory ♡</h3>
          <button id="close-mem-modal" style="background:none; border:none; font-size:20px; cursor:pointer;">×</button>
        </div>
        <form id="add-mem-form">
          <input type="hidden" id="mem-edit-id">
          <label style="font-size:12px; color:#666;">Title / Place:</label>
          <input type="text" id="mem-title" placeholder="e.g. Sunset at Beach" required>
          
          <label style="font-size:12px; color:#666;">Date of Memory:</label>
          <input type="date" id="mem-date" required>
          
          <label style="font-size:12px; color:#666;">Photo (Optional):</label>
          <input type="file" id="mem-photo" accept="image/*">
          
          <label style="font-size:12px; color:#666;">Note:</label>
          <textarea id="mem-note" rows="3" placeholder="Write a short memory note..."></textarea>

          <div class="mem-modal-actions">
            <button type="button" id="delete-mem-btn" style="padding: 8px 14px; border-radius: 8px; border: none; background: #fee2e2; color: #dc2626; font-weight:600; display:none;">Delete</button>
            <div style="display:flex; gap:8px; margin-left:auto;">
              <button type="button" id="cancel-mem-btn" style="padding: 8px 14px; border-radius: 8px; border: 1px solid #ccc; background: white;">Cancel</button>
              <button type="submit" id="save-mem-submit" style="padding: 8px 16px; border-radius: 8px; border: none; background: #e11d48; color: white; font-weight:600;">Save ♡</button>
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
      if (file) {
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
      ? `<img src="${esc(mem.photoUrl)}" alt="${esc(mem.title || "A shared memory")}" decoding="async">`
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

  function renderGrid() {
    const container = $("#memories-grid-container", el);
    const count = $("#memories-count", el);

    if (allMemories.length === 0) {
      sortedMemories = [];
      activeMemoryIndex = -1;
      count.textContent = "Your story starts here";
      container.innerHTML = `<p class="memories-empty"><span>♡</span>No memories saved just yet.<br>Add one little moment to begin your collection.</p>`;
      return;
    }
    count.textContent = `${allMemories.length} ${allMemories.length === 1 ? "memory" : "memories"}`;

    sortedMemories = [...allMemories].sort((a, b) => {
      const dateA = parseLocalMemoryDate(a.rawDate || a.date);
      const dateB = parseLocalMemoryDate(b.rawDate || b.date);
      return dateB - dateA;
    });

    container.innerHTML = sortedMemories
      .map((item) => `
        <button class="memory-item" type="button" data-id="${esc(item.id)}" aria-label="Open memory: ${esc(item.title || "Our Memory")}">
          <div class="memory-thumb-box">${
            item.photoUrl
              ? `<img src="${esc(item.photoUrl)}" alt="" loading="lazy" decoding="async">`
              : `💖`
          }</div>
          <div class="memory-meta"><span>${esc(item.title || "Memory")}</span></div>
          <small>${esc(item.date || "")}</small>
        </button>
      `)
      .join("");

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

  stopMemories = watchItems("memory", (items) => {
    if (!active || !el.isConnected) return;
    allMemories = items || [];
    renderGrid();
  }, error => {
    console.error("Memories could not be loaded:", error);
    const container = $("#memories-grid-container", el);
    if (container) container.innerHTML = `<p style="color:#9ca3af; font-size:13px; grid-column:1/-1;">Memories could not be loaded. Please try again.</p>`;
  });
}

export function disposeMemories() {
  active = false;
  stopMemories?.();
  stopMemories = null;
  removeMemoryEscapeListener?.();
  removeMemoryEscapeListener = null;
}