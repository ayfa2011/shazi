import { $, esc, toast } from "./utils.js";
import { watchItems, addItem, setItem, removeItem } from "./firestore.js";

let stopBucketWatcher = null;

export function renderBucket(el, user) {
  stopBucketWatcher?.();
  const currentYear = new Date().getFullYear();
  let currentFilter = "All";
  let allItems = [];

  el.innerHTML = `
    <style>
      .bucket-card { background: #ffffff; border-radius: 20px; padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; }
      .bucket-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
      .bucket-title { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 700; color: #881337; }
      .add-dream-btn { background: none; border: none; color: #e11d48; font-weight: 600; cursor: pointer; font-size: 14px; }
      .bucket-tabs { display: flex; gap: 8px; margin-bottom: 20px; overflow-x: auto; }
      .tab-btn { padding: 6px 16px; border-radius: 20px; border: none; background: #f3f4f6; color: #6b7280; font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; }
      .tab-btn.active { background: #f43f5e; color: #ffffff; }
      .bucket-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
      .status-badge { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; }
      .status-Completed { background: #dcfce7; color: #16a34a; }
      .status-In-Progress { background: #dbeafe; color: #2563eb; }
      .status-Upcoming { background: #ffe4e6; color: #e11d48; }
      .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
      .modal-box { background: white; padding: 20px; border-radius: 16px; width: 90%; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
      .modal-box input, .modal-box select { width: 100%; padding: 10px; margin: 6px 0 12px 0; box-sizing: border-box; border: 1px solid #ddd; border-radius: 8px; font-family: inherit; }
    </style>

    <header class="bucket-page-header">
      <button type="button" class="games-back-button" data-bucket-back>← More</button>
      <div><p class="eyebrow">OUR FUTURE DREAMS</p><h1>Our Bucket List</h1></div>
    </header>
    <div class="bucket-card">
      <div class="bucket-header">
        <div class="bucket-title">
          <div style="background:#ffe4e6; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; color:#e11d48;">🎯</div>
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

      <div id="bucket-list-items"></div>
    </div>

    <!-- Bucket Modal -->
    <div id="bucket-modal" class="modal-overlay" style="display: none;">
      <div class="modal-box">
        <h3 id="bucket-modal-title" style="margin:0 0 10px 0; color:#881337;">Add to Bucket List</h3>
        <input type="hidden" id="modal-item-id">
        <label style="font-size:12px; color:#666;">Dream Title:</label>
        <input type="text" id="modal-title" placeholder="Title (e.g. Visit Paris)">
        
        <label style="font-size:12px; color:#666;">Target Date / Year:</label>
        <input type="text" id="modal-date" placeholder="Target Date (e.g. ${currentYear + 1})">
        
        <label style="font-size:12px; color:#666;">Status:</label>
        <select id="modal-status">
          <option value="Upcoming">Upcoming</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
        </select>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
          <button id="modal-delete" style="padding: 6px 12px; border-radius: 6px; border: none; background: #fee2e2; color: #dc2626; display:none; cursor:pointer;">Delete</button>
          <div style="display:flex; gap:8px; margin-left:auto;">
            <button id="modal-cancel" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #ccc; background: white; cursor:pointer;">Cancel</button>
            <button id="modal-save" style="padding: 6px 12px; border-radius: 6px; border: none; background: #e11d48; color: white; font-weight:600; cursor:pointer;">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const modal = $("#bucket-modal", el);
  $("[data-bucket-back]", el).onclick = () => window.App?.navigate("more");

  function openModal(item = null) {
    if (item) {
      $("#bucket-modal-title", el).textContent = "Edit Dream";
      $("#modal-item-id", el).value = item.id;
      $("#modal-title", el).value = item.title || "";
      $("#modal-date", el).value = item.dateStr || String(currentYear);
      $("#modal-status", el).value = item.status || "Upcoming";
      $("#modal-delete", el).style.display = "block";
    } else {
      $("#bucket-modal-title", el).textContent = "Add to Bucket List";
      $("#modal-item-id", el).value = "";
      $("#modal-title", el).value = "";
      $("#modal-date", el).value = String(currentYear);
      $("#modal-status", el).value = "Upcoming";
      $("#modal-delete", el).style.display = "none";
    }
    modal.style.display = "flex";
  }

  el.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => {
      el.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.tab;
      renderList();
    };
  });

  $("#add-bucket", el).onclick = () => openModal();
  $("#modal-cancel", el).onclick = () => (modal.style.display = "none");

  $("#modal-delete", el).onclick = async () => {
    const id = $("#modal-item-id", el).value;
    if (id && confirm("Delete this dream?")) {
      try {
        await removeItem(id);
        toast("Dream deleted");
        modal.style.display = "none";
      } catch (err) {
        console.error(err);
        toast("Could not delete item.");
      }
    }
  };

  $("#modal-save", el).onclick = async () => {
    const id = $("#modal-item-id", el).value;
    const title = $("#modal-title", el).value.trim();
    const dateStr = $("#modal-date", el).value.trim() || String(currentYear);
    const status = $("#modal-status", el).value;

    if (!title) return toast("Please enter a title");

    try {
      const payload = {
        title,
        dateStr,
        status,
        done: status === "Completed"
      };

      if (id) {
        await setItem(id, payload);
        toast("Dream updated ♡");
      } else {
        await addItem("bucket", { ...payload, author: user.uid });
        toast("New dream added ♡");
      }

      modal.style.display = "none";
    } catch (err) {
      console.error(err);
      toast("Error saving item. Please try again.");
    }
  };

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
        const statusClass = displayStatus.replace(/\s+/g, "-");

        return `
        <div class="bucket-item">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="font-size:20px;">✨</div>
            <div>
              <h4 style="margin:0; font-size:15px; color:#374151;">${esc(x.title)}</h4>
              <p style="margin:2px 0 0 0; font-size:12px; color:#9ca3af;">${esc(x.dateStr || currentYear)}</p>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="status-badge status-${statusClass}" data-id="${x.id}">
              ${displayStatus}
            </button>
            <button class="edit-bucket-btn" data-id="${x.id}" style="background:none; border:none; color:#cbd5e1; cursor:pointer;">✏️</button>
          </div>
        </div>
      `;
      })
      .join("");

    listEl.querySelectorAll(".status-badge").forEach((badge) => {
      badge.onclick = (e) => {
        e.stopPropagation();
        const item = allItems.find((i) => i.id === badge.dataset.id);
        if (item) openModal(item);
      };
    });

    listEl.querySelectorAll(".edit-bucket-btn").forEach((btn) => {
      btn.onclick = () => {
        const item = allItems.find((i) => i.id === btn.dataset.id);
        if (item) openModal(item);
      };
    });
  }

  stopBucketWatcher = watchItems("bucket", (items) => {
    allItems = items || [];
    renderList();
  }, error => {
    console.error("Bucket list could not be loaded:", error);
    const listEl = $("#bucket-list-items", el);
    if (listEl) listEl.innerHTML = `<p style="text-align:center; color:#9ca3af; padding:20px 0;">Bucket list could not be loaded. Please try again.</p>`;
  });
}

export function disposeBucket() {
  stopBucketWatcher?.();
  stopBucketWatcher = null;
}