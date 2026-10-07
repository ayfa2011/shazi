import { $, esc, toast } from "./utils.js";
import { watchItems, addItem, setItem } from "./firestore.js";

export function renderBucket(el, user, profile) {
  let currentFilter = "All";

  el.innerHTML = `
    <style>
      .bucket-card {
        background: #ffffff;
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        font-family: system-ui, -apple-system, sans-serif;
      }
      .bucket-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .bucket-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 18px;
        font-weight: 700;
        color: #881337;
      }
      .bucket-title-icon {
        width: 28px;
        height: 28px;
        background: #ffe4e6;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #e11d48;
      }
      .add-dream-btn {
        background: none;
        border: none;
        color: #e11d48;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
      }
      .bucket-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 20px;
        overflow-x: auto;
      }
      .tab-btn {
        padding: 6px 16px;
        border-radius: 20px;
        border: none;
        background: #f3f4f6;
        color: #6b7280;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
      }
      .tab-btn.active {
        background: #f43f5e;
        color: #ffffff;
      }
      .bucket-items-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .bucket-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #f3f4f6;
      }
      .bucket-item:last-child {
        border-bottom: none;
      }
      .item-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .item-img {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        object-fit: cover;
        background: #f1f5f9;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
      }
      .item-details h4 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: #374151;
      }
      .item-details p {
        margin: 2px 0 0 0;
        font-size: 12px;
        color: #9ca3af;
      }
      .status-badge {
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .status-Completed {
        background: #dcfce7;
        color: #16a34a;
      }
      .status-In-Progress {
        background: #dbeafe;
        color: #2563eb;
      }
      .status-Upcoming {
        background: #ffe4e6;
        color: #e11d48;
      }
      
      /* Modal Styles */
      .modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .modal-box {
        background: white;
        padding: 20px;
        border-radius: 16px;
        width: 90%;
        max-width: 400px;
      }
      .modal-box input, .modal-box select {
        width: 100%;
        padding: 8px;
        margin: 8px 0;
        box-sizing: border-box;
        border: 1px solid #ddd;
        border-radius: 8px;
      }
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 12px;
      }
    </style>

    <div class="bucket-card">
      <div class="bucket-header">
        <div class="bucket-title">
          <div class="bucket-title-icon">🎯</div>
          <span>Our Bucket List</span>
        </div>
        <button id="add-bucket" class="add-dream-btn">+ New Dream</button>
      </div>

      <div class="bucket-tabs">
        <button class="tab-btn active" data-tab="All">All</button>
        <button class="tab-btn" data-tab="Upcoming">Upcoming</button>
        <button class="tab-btn" data-tab="In Progress">In Progress</button>
        <button class="tab-btn" data-tab="Completed">Completed</button>
      </div>

      <div id="bucket-list-items" class="bucket-items-list"></div>
    </div>

    <!-- Add Item Modal -->
    <div id="bucket-modal" class="modal-overlay" style="display: none;">
      <div class="modal-box">
        <h3>Add to Bucket List</h3>
        <input type="text" id="modal-title" placeholder="Title (e.g. Buy Our Dream Home)">
        <input type="text" id="modal-date" placeholder="Target Date (e.g. Jan 2025, 2028)">
        <label style="font-size:12px; color:#666;">Choose Image or Photo:</label>
        <input type="file" id="modal-image" accept="image/*">
        <select id="modal-status">
          <option value="Upcoming">Upcoming</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
        </select>
        <div class="modal-actions">
          <button id="modal-cancel" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #ccc; background: white;">Cancel</button>
          <button id="modal-save" style="padding: 6px 12px; border-radius: 6px; border: none; background: #e11d48; color: white;">Save</button>
        </div>
      </div>
    </div>
  `;

  // Tab Filter Toggle
  el.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => {
      el.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.tab;
      renderList();
    };
  });

  // Modal Functionality
  const modal = $("#bucket-modal", el);
  $("#add-bucket", el).onclick = () => (modal.style.display = "flex");
  $("#modal-cancel", el).onclick = () => (modal.style.display = "none");

  // Add Item with Photo Upload (Base64)
  $("#modal-save", el).onclick = async () => {
    const title = $("#modal-title", el).value.trim();
    const dateStr = $("#modal-date", el).value.trim() || "2026";
    const status = $("#modal-status", el).value;
    const fileInput = $("#modal-image", el);

    if (!title) return toast("Please enter a title");

    let imageUrl = "";
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      imageUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    }

    await addItem("bucket", {
      title,
      dateStr,
      status,
      imageUrl,
      done: status === "Completed",
      author: user.uid,
      createdAt: Date.now(),
    });

    modal.style.display = "none";
    $("#modal-title", el).value = "";
    $("#modal-date", el).value = "";
    fileInput.value = "";
    toast("New dream added ♡");
  };

  let allItems = [];

  function renderList() {
    const listEl = $("#bucket-list-items", el);
    const filteredItems = allItems.filter((item) => {
      if (currentFilter === "All") return true;
      return item.status === currentFilter;
    });

    if (filteredItems.length === 0) {
      listEl.innerHTML = `<p style="text-align:center; color:#9ca3af; padding: 20px 0;">No items found in ${currentFilter}</p>`;
      return;
    }

    listEl.innerHTML = filteredItems
      .map((x) => {
        const displayStatus = x.status || (x.done ? "Completed" : "Upcoming");
        const statusClass = displayStatus.replace(" ", "-");
        const defaultImg = "✨";

        return `
        <div class="bucket-item">
          <div class="item-left">
            ${
              x.imageUrl
                ? `<img src="${x.imageUrl}" class="item-img" alt="${esc(x.title)}">`
                : `<div class="item-img">${defaultImg}</div>`
            }
            <div class="item-details">
              <h4>${esc(x.title)}</h4>
              <p>${esc(x.dateStr || "2026")}</p>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="status-badge status-${statusClass}" data-id="${x.id}" data-status="${displayStatus}">
              ${displayStatus}
            </span>
            <span style="color:#ccc; font-size:12px;">›</span>
          </div>
        </div>
      `;
      })
      .join("");

    // Toggle Status on Badge Click
    listEl.querySelectorAll(".status-badge").forEach((badge) => {
      badge.onclick = async () => {
        const id = badge.dataset.id;
        const curr = badge.dataset.status;
        const nextStatus =
          curr === "Upcoming"
            ? "In Progress"
            : curr === "In Progress"
            ? "Completed"
            : "Upcoming";

        await setItem(id, {
          status: nextStatus,
          done: nextStatus === "Completed",
        });
        toast(`Updated to ${nextStatus}`);
      };
    });
  }

  // Realtime Watcher
  watchItems("bucket", (items) => {
    allItems = items;
    renderList();
  });
}