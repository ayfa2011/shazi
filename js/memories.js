import { $, esc, toast, uid } from "./utils.js";
import { watchItems, addItem } from "./firestore.js";
import { storage } from "./firebase.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

let stopMemories = null, active = false;

export function renderMemories(el, user, profile) {
  stopMemories?.();
  active = true;

  el.innerHTML = `
    <style>
      .memories-card {
        background: #ffffff;
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        font-family: system-ui, -apple-system, sans-serif;
        max-width: 600px;
        margin: 0 auto;
      }
      .memories-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }
      .memories-title-area {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .memories-icon {
        width: 32px;
        height: 32px;
        background: #ffe4e6;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #e11d48;
        font-size: 18px;
      }
      .memories-title-area h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: #881337;
      }
      .memories-top-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .view-all-link {
        color: #e11d48;
        font-size: 13px;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
      }
      .add-memory-btn {
        background: #e11d48;
        color: #ffffff;
        border: none;
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .memories-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 14px;
      }
      @media (max-width: 480px) {
        .memories-grid {
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
      }
      .memory-item {
        display: flex;
        flex-direction: column;
        cursor: pointer;
      }
      .memory-thumb-box {
        width: 100%;
        aspect-ratio: 4 / 3;
        border-radius: 14px;
        overflow: hidden;
        background: #f1f5f9;
        margin-bottom: 6px;
      }
      .memory-thumb-box img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.2s ease;
      }
      .memory-item:hover .memory-thumb-box img {
        transform: scale(1.04);
      }
      .memory-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #9ca3af;
        font-weight: 500;
      }
      .memory-heart-icon {
        color: #f43f5e;
        font-size: 12px;
      }

      /* Modal Styles */
      .mem-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .mem-modal-box {
        background: white;
        padding: 20px;
        border-radius: 20px;
        width: 90%;
        max-width: 420px;
      }
      .mem-modal-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
      }
      .mem-modal-head h3 {
        margin: 0;
        color: #881337;
      }
      .mem-modal-box input, .mem-modal-box textarea {
        width: 100%;
        padding: 10px;
        margin: 6px 0 12px 0;
        box-sizing: border-box;
        border: 1px solid #fecdd3;
        border-radius: 10px;
        font-family: inherit;
        outline: none;
      }
      .mem-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
    </style>

    <div class="memories-card">
      <div class="memories-header">
        <div class="memories-title-area">
          <div class="memories-icon">📈</div>
          <h3>Recent Memories</h3>
        </div>
        <div class="memories-top-actions">
          <button id="add-mem-btn" class="add-memory-btn">＋ Add</button>
          <span class="view-all-link">View All →</span>
        </div>
      </div>

      <div id="memories-grid-container" class="memories-grid">
        <p style="color:#9ca3af; font-size:13px; grid-column: 1 / -1;">Loading memories…</p>
      </div>
    </div>

    <!-- Add Memory Modal -->
    <div id="add-mem-modal" class="mem-modal-overlay" style="display: none;">
      <div class="mem-modal-box">
        <div class="mem-modal-head">
          <h3>Add New Memory ♡</h3>
          <button id="close-mem-modal" style="background:none; border:none; font-size:20px; cursor:pointer;">×</button>
        </div>
        <form id="add-mem-form">
          <label style="font-size:12px; color:#666;">Title / Place:</label>
          <input type="text" id="mem-title" placeholder="e.g. Sunset at Beach" required>
          
          <label style="font-size:12px; color:#666;">Date:</label>
          <input type="date" id="mem-date" required>
          
          <label style="font-size:12px; color:#666;">Photo:</label>
          <input type="file" id="mem-photo" accept="image/*">
          
          <label style="font-size:12px; color:#666;">Note:</label>
          <textarea id="mem-note" rows="3" placeholder="Write a short memory note..."></textarea>

          <div class="mem-modal-actions">
            <button type="button" id="cancel-mem-btn" style="padding: 8px 16px; border-radius: 8px; border: 1px solid #ccc; background: white;">Cancel</button>
            <button type="submit" id="save-mem-submit" style="padding: 8px 16px; border-radius: 8px; border: none; background: #e11d48; color: white; font-weight:600;">Save Memory ♡</button>
          </div>
        </form>
      </div>
    </div>

    <!-- View Image Lightbox Modal -->
    <div id="view-mem-modal" class="mem-modal-overlay" style="display: none;">
      <div class="mem-modal-box" style="text-align:center;">
        <div class="mem-modal-head">
          <h3 id="view-mem-title">Memory</h3>
          <button id="close-view-modal" style="background:none; border:none; font-size:20px; cursor:pointer;">×</button>
        </div>
        <img id="view-mem-img" src="" style="width:100%; max-height:300px; object-fit:cover; border-radius:12px; margin-bottom:10px;">
        <p id="view-mem-date" style="font-size:12px; color:#e11d48; font-weight:600; margin:4px 0;"></p>
        <p id="view-mem-note" style="font-size:13px; color:#4b5563; margin-top:8px; text-align:left;"></p>
      </div>
    </div>
  `;

  const addModal = $("#add-mem-modal", el);
  const viewModal = $("#view-mem-modal", el);

  $("#add-mem-btn", el).onclick = () => (addModal.style.display = "flex");
  $("#close-mem-modal", el).onclick = () => (addModal.style.display = "none");
  $("#cancel-mem-btn", el).onclick = () => (addModal.style.display = "none");
  $("#close-view-modal", el).onclick = () => (viewModal.style.display = "none");

  // Save Memory Form
  $("#add-mem-form", el).onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = $("#save-mem-submit", el);
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    const title = $("#mem-title", el).value.trim();
    const dateVal = $("#mem-date", el).value;
    const note = $("#mem-note", el).value.trim();
    const fileInput = $("#mem-photo", el);
    const file = fileInput.files ? fileInput.files[0] : null;

    let photoUrl = "";
    let photoError = "";

    if (file) {
      try {
        if (storage) {
          const storageRef = ref(storage, `couples/our-little-world/memories/${uid()}-${file.name}`);
          await uploadBytes(storageRef, file);
          photoUrl = await getDownloadURL(storageRef);
        } else {
          // Fallback Base64 string preview if storage is off
          photoUrl = await new Promise((res) => {
            const r = new FileReader();
            r.onload = (ev) => res(ev.target.result);
            r.readAsDataURL(file);
          });
        }
      } catch (err) {
        photoError = "Photo upload failed, text saved.";
        // Fallback Base64 preview
        photoUrl = await new Promise((res) => {
          const r = new FileReader();
          r.onload = (ev) => res(ev.target.result);
          r.readAsDataURL(file);
        });
      }
    }

    // Format date string to display format e.g., "12 Oct 2026"
    let formattedDate = "Today";
    if (dateVal) {
      const d = new Date(dateVal);
      formattedDate = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }

    try {
      await addItem("memory", {
        title,
        date: formattedDate,
        rawDate: dateVal || new Date().toISOString(),
        note,
        photoUrl,
        author: user.uid,
        createdAt: new Date().toISOString()
      });

      toast(photoError ? "Memory saved with local photo ♡" : "Memory saved ♡");
      addModal.style.display = "none";
      $("#add-mem-form", el).reset();
    } catch (err) {
      toast("Could not save memory.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Memory ♡";
    }
  };

  let allMemories = [];

  function renderGrid() {
    const container = $("#memories-grid-container", el);

    if (allMemories.length === 0) {
      container.innerHTML = `<p style="color:#9ca3af; font-size:13px; grid-column: 1 / -1; text-align:center; padding:20px 0;">No memories added yet. Click + Add to start! ♡</p>`;
      return;
    }

    container.innerHTML = allMemories.map((item) => {
      const imgSrc = item.photoUrl || "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=400&auto=format&fit=crop";
      const displayDate = item.date || "12 Oct 2026";

      return `
        <div class="memory-item" data-id="${item.id}">
          <div class="memory-thumb-box">
            <img src="${esc(imgSrc)}" alt="${esc(item.title || 'Memory')}">
          </div>
          <div class="memory-meta">
            <span class="memory-heart-icon">💖</span>
            <span>${esc(displayDate)}</span>
          </div>
        </div>
      `;
    }).join("");

    // Lightbox view click event
    container.querySelectorAll(".memory-item").forEach((card) => {
      card.onclick = () => {
        const mem = allMemories.find((m) => m.id === card.dataset.id);
        if (mem) {
          $("#view-mem-title", el).textContent = mem.title || "Our Memory";
          $("#view-mem-img", el).src = mem.photoUrl || "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=400&auto=format&fit=crop";
          $("#view-mem-date", el).textContent = `💖 ${mem.date || '12 Oct 2026'}`;
          $("#view-mem-note", el).textContent = mem.note || "";
          viewModal.style.display = "flex";
        }
      };
    });
  }

  // Realtime Watcher
  stopMemories = watchItems("memory", (items) => {
    if (!active || !el.isConnected) return;
    allMemories = items;
    renderGrid();
  });
}

export function disposeMemories() {
  active = false;
  stopMemories?.();
  stopMemories = null;
}