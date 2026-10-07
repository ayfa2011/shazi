import { $, esc, toast } from "./utils.js";
import { watchItems, addItem } from "./firestore.js";

let stopLetters = null, active = false;

export function renderLetters(el, user, profile) {
  stopLetters?.();
  active = true;

  let currentTab = "Inbox";

  el.innerHTML = `
    <style>
      .letters-card {
        background: #ffffff;
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        font-family: system-ui, -apple-system, sans-serif;
        max-width: 550px;
        margin: 0 auto;
      }
      .letters-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 16px;
      }
      .letters-title-area {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .letters-icon {
        width: 32px;
        height: 32px;
        background: #ffe4e6;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #e11d48;
        font-size: 16px;
      }
      .letters-text h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: #881337;
      }
      .letters-text p {
        margin: 2px 0 0 0;
        font-size: 12px;
        color: #9ca3af;
      }
      .write-letter-btn {
        background: #e11d48;
        color: #ffffff;
        border: none;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .letters-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 18px;
      }
      .tab-btn {
        padding: 6px 18px;
        border-radius: 20px;
        border: none;
        background: #f3f4f6;
        color: #6b7280;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .tab-btn.active {
        background: #ffe4e6;
        color: #e11d48;
        font-weight: 600;
      }
      .letters-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .letter-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid #f3f4f6;
        cursor: pointer;
      }
      .letter-item:last-child {
        border-bottom: none;
      }
      .letter-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .letter-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #ffe4e6;
        color: #e11d48;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 16px;
      }
      .letter-info h4 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #374151;
      }
      .letter-info p {
        margin: 3px 0 0 0;
        font-size: 13px;
        color: #6b7280;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 260px;
      }
      .letter-date {
        font-size: 12px;
        color: #9ca3af;
        white-space: nowrap;
      }

      /* Modal Styles */
      .letter-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .letter-modal-box {
        background: white;
        padding: 20px;
        border-radius: 20px;
        width: 90%;
        max-width: 450px;
      }
      .letter-modal-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
      }
      .letter-modal-head h3 {
        margin: 0;
        color: #881337;
      }
      .letter-modal-box input, .letter-modal-box textarea, .letter-modal-box select {
        width: 100%;
        padding: 10px;
        margin: 6px 0 12px 0;
        box-sizing: border-box;
        border: 1px solid #fecdd3;
        border-radius: 10px;
        font-family: inherit;
        outline: none;
      }
      .letter-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
    </style>

    <div class="letters-card">
      <div class="letters-header">
        <div class="letters-title-area">
          <div class="letters-icon">💖</div>
          <div class="letters-text">
            <h3>Letters</h3>
            <p>Words from the heart</p>
          </div>
        </div>
        <button id="write-letter-btn" class="write-letter-btn">＋ Write Letter</button>
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
          <h3>Write a Letter ♡</h3>
          <button id="close-letter-modal" style="background:none; border:none; font-size:20px; cursor:pointer;">×</button>
        </div>
        <form id="write-letter-form">
          <label style="font-size:12px; color:#666;">To:</label>
          <input type="text" id="letter-to" placeholder="e.g. To Shazy / To Kebyy" required>
          
          <label style="font-size:12px; color:#666;">Message:</label>
          <textarea id="letter-body" rows="6" placeholder="Write from your heart..." required></textarea>
          
          <label style="font-size:12px; color:#666;">Status:</label>
          <select id="letter-status">
            <option value="Sent">Send Now</option>
            <option value="Scheduled">Schedule for Later</option>
          </select>

          <div class="letter-modal-actions">
            <button type="button" id="cancel-letter-btn" style="padding: 8px 16px; border-radius: 8px; border: 1px solid #ccc; background: white;">Cancel</button>
            <button type="submit" style="padding: 8px 16px; border-radius: 8px; border: none; background: #e11d48; color: white; font-weight:600;">Send Letter ♡</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Read Letter Modal -->
    <div id="read-letter-modal" class="letter-modal-overlay" style="display: none;">
      <div class="letter-modal-box">
        <div class="letter-modal-head">
          <h3 id="read-letter-title">Letter</h3>
          <button id="close-read-modal" style="background:none; border:none; font-size:20px; cursor:pointer;">×</button>
        </div>
        <p id="read-letter-date" style="font-size:12px; color:#9ca3af; margin-top:-10px;"></p>
        <div id="read-letter-body" style="font-size:14px; color:#374151; line-height:1.6; white-space:pre-wrap; margin:15px 0;"></div>
      </div>
    </div>
  `;

  // Tab switching logic
  el.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => {
      el.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      renderList();
    };
  });

  // Modal open/close logic
  const writeModal = $("#write-letter-modal", el);
  const readModal = $("#read-letter-modal", el);

  $("#write-letter-btn", el).onclick = () => (writeModal.style.display = "flex");
  $("#close-letter-modal", el).onclick = () => (writeModal.style.display = "none");
  $("#cancel-letter-btn", el).onclick = () => (writeModal.style.display = "none");
  $("#close-read-modal", el).onclick = () => (readModal.style.display = "none");

  // Form submit logic
  $("#write-letter-form", el).onsubmit = async (e) => {
    e.preventDefault();
    const recipient = $("#letter-to", el).value.trim();
    const body = $("#letter-body", el).value.trim();
    const status = $("#letter-status", el).value;

    await addItem("letter", {
      recipient,
      body,
      status,
      author: user.uid,
      authorName: profile.name,
      createdAt: new Date().toISOString()
    });

    writeModal.style.display = "none";
    $("#write-letter-form", el).reset();
    toast("Letter sent ♡");
  };

  let allLetters = [];

  function renderList() {
    const container = $("#letters-list-container", el);

    const filtered = allLetters.filter((item) => {
      if (currentTab === "Inbox") {
        return item.author !== user.uid && item.status !== "Scheduled";
      } else if (currentTab === "Sent") {
        return item.author === user.uid && item.status === "Sent";
      } else if (currentTab === "Scheduled") {
        return item.status === "Scheduled";
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:#9ca3af; padding:20px 0;">No letters in ${currentTab}</p>`;
      return;
    }

    container.innerHTML = filtered.map((item) => {
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : "Just now";
      
      return `
        <div class="letter-item" data-id="${item.id}">
          <div class="letter-left">
            <div class="letter-avatar">👤</div>
            <div class="letter-info">
              <h4>${esc(item.recipient || `To ${item.authorName || 'Us'}`)}</h4>
              <p>${esc(item.body || '')}</p>
            </div>
          </div>
          <div class="letter-date">${dateStr}</div>
        </div>
      `;
    }).join("");

    // Click item to read letter
    container.querySelectorAll(".letter-item").forEach((row) => {
      row.onclick = () => {
        const letter = allLetters.find((l) => l.id === row.dataset.id);
        if (letter) {
          $("#read-letter-title", el).textContent = letter.recipient || `Letter from ${letter.authorName}`;
          $("#read-letter-date", el).textContent = letter.createdAt ? new Date(letter.createdAt).toLocaleString() : "";
          $("#read-letter-body", el).textContent = letter.body;
          readModal.style.display = "flex";
        }
      };
    });
  }

  // Realtime Watcher
  stopLetters = watchItems("letter", (items) => {
    if (!active || !el.isConnected) return;
    allLetters = items;
    renderList();
  });
}

export function disposeLetters() {
  active = false;
  stopLetters?.();
  stopLetters = null;
}