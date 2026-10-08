import { $, esc, toast, uid } from "./utils.js";
import { watchItems, addItem, removeItem, setItem } from "./firestore.js";
import { storage } from "./firebase.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

let stopMemories = null;
let active = false;

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
  active = true;

  el.innerHTML = `
    <style>
      .memories-card { background: #ffffff; border-radius: 20px; padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; }
      .memories-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
      .memories-title-area { display: flex; align-items: center; gap: 10px; }
      .memories-title-area h3 { margin: 0; font-size: 18px; font-weight: 700; color: #881337; }
      .add-memory-btn { background: #e11d48; color: #ffffff; border: none; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; }
      .memories-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
      @media (max-width: 480px) { .memories-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; } }
      .memory-item { display: flex; flex-direction: column; cursor: pointer; position: relative; }
      .memory-thumb-box { width: 100%; aspect-ratio: 4 / 3; border-radius: 14px; overflow: hidden; background: #ffe4e6; margin-bottom: 6px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #e11d48; }
      .memory-thumb-box img { width: 100%; height: 100%; object-fit: cover; }
      .memory-meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #9ca3af; font-weight: 500; }
      .mem-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
      .mem-modal-box { background: white; padding: 20px; border-radius: 20px; width: 90%; max-width: 420px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
      .mem-modal-box input, .mem-modal-box textarea { width: 100%; padding: 10px; margin: 6px 0 12px 0; box-sizing: border-box; border: 1px solid #fecdd3; border-radius: 10px; font-family: inherit; outline: none; }
      .mem-modal-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
    </style>

    <div class="memories-card">
      <div class="memories-header">
        <div class="memories-title-area">
          <div style="background:#ffe4e6; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#e11d48;">📸</div>
          <h3>Our Memories</h3>
        </div>
        <button id="add-mem-btn" class="add-memory-btn">＋ Add Memory</button>
      </div>

      <div id="memories-grid-container" class="memories-grid">
        <p style="color:#9ca3af; font-size:13px; grid-column: 1 / -1;">Loading memories…</p>
      </div>
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
    <div id="view-mem-modal" class="mem-modal-overlay" style="display: none;">
      <div class="mem-modal-box" style="text-align:center;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <h3 id="view-mem-title" style="margin:0; color:#881337;">Memory</h3>
          <button id="close-view-modal" style="background:none; border:none; font-size:20px; cursor:pointer;">×</button>
        </div>
        <div id="view-mem-img-wrap"></div>
        <p id="view-mem-date" style="font-size:12px; color:#e11d48; font-weight:600; margin:6px 0;"></p>
        <p id="view-mem-note" style="font-size:13px; color:#4b5563; margin-top:8px; text-align:left;"></p>
        <button id="view-mem-edit-btn" style="margin-top:12px; padding:6px 16px; border-radius:12px; border:1px solid #e11d48; background:white; color:#e11d48; font-weight:600; cursor:pointer;">✏️ Edit Memory</button>
      </div>
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
    if (file) {
      try {
        if (storage) {
          const storageRef = ref(storage, `memories/${uid()}-${file.name}`);
          await uploadBytes(storageRef, file);
          photoUrl = await getDownloadURL(storageRef);
        } else {
          photoUrl = await new Promise((res) => {
            const r = new FileReader();
            r.onload = (ev) => res(ev.target.result);
            r.readAsDataURL(file);
          });
        }
      } catch (err) {
        console.warn("Storage upload failed, fallback to inline preview", err);
        toast("Photo upload failed, saving text only.");
      }
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

    try {
      const payload = {
        title,
        date: formattedDate,
        rawDate: dateVal,
        note,
        author: user.uid,
        createdAt: new Date().toISOString()
      };

      if (photoUrl) payload.photoUrl = photoUrl;

      if (editId) {
        await setItem(editId, payload);
        toast("Memory updated ♡");
      } else {
        await addItem("memory", payload);
        toast("Memory saved ♡");
      }

      addModal.style.display = "none";
      form.reset();
    } catch (err) {
      console.error(err);
      toast("Could not save memory.");
    } finally {
      submitBtn.disabled = false;
    }
  };

  let allMemories = [];

  function renderGrid() {
    const container = $("#memories-grid-container", el);

    if (allMemories.length === 0) {
      container.innerHTML = `<p style="color:#9ca3af; font-size:13px; grid-column: 1 / -1; text-align:center; padding:20px 0;">No memories added yet. Click + Add Memory to begin! ♡</p>`;
      return;
    }

    const sorted = [...allMemories].sort((a, b) => {
      const dateA = parseLocalMemoryDate(a.rawDate || a.date);
      const dateB = parseLocalMemoryDate(b.rawDate || b.date);
      return dateB - dateA;
    });

    container.innerHTML = sorted
      .map((item) => {
        return `
        <div class="memory-item" data-id="${item.id}">
          <div class="memory-thumb-box">
            ${
              item.photoUrl
                ? `<img src="${esc(item.photoUrl)}" alt="${esc(item.title)}">`
                : `💖`
            }
          </div>
          <div class="memory-meta">
            <span>${esc(item.title || "Memory")}</span>
          </div>
          <small style="font-size:10px; color:#cbd5e1;">${esc(
            item.date || ""
          )}</small>
        </div>
      `;
      })
      .join("");

    container.querySelectorAll(".memory-item").forEach((card) => {
      card.onclick = () => {
        const mem = allMemories.find((m) => m.id === card.dataset.id);
        if (mem) {
          activeMemoryForView = mem;
          $("#view-mem-title", el).textContent = mem.title || "Our Memory";

          const imgWrap = $("#view-mem-img-wrap", el);
          imgWrap.innerHTML = mem.photoUrl
            ? `<img src="${esc(
                mem.photoUrl
              )}" style="width:100%; max-height:280px; object-fit:cover; border-radius:12px;">`
            : `<div style="padding:30px; background:#ffe4e6; border-radius:12px; font-size:40px;">💖</div>`;

          $("#view-mem-date", el).textContent = mem.date ? `📅 ${mem.date}` : "";
          $("#view-mem-note", el).textContent = mem.note || "";
          viewModal.style.display = "flex";
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

  stopMemories = watchItems("memory", (items) => {
    if (!active || !el.isConnected) return;
    allMemories = items || [];
    renderGrid();
  });
}

export function disposeMemories() {
  active = false;
  stopMemories?.();
  stopMemories = null;
}