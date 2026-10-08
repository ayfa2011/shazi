import { $, esc, toast } from "./utils.js";
import { watchItems, addLetter, getScheduledLetterBody, migrateScheduledLetterBody, notifyPartnerSafely } from "./firestore.js";
import { getDisplayName, getProfileKey } from "./profile-data.js";
import { APP_CONFIG } from "../config/app-config.js";

let stopLetters = null, deliveryTimer = null, active = false;

export function renderLetters(el, user, profile) {
  stopLetters?.();
  clearTimeout(deliveryTimer);
  deliveryTimer = null;
  active = true;
  const ownKey = getProfileKey(profile);
  let currentTab = "Inbox";

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
          <label style="font-size:12px; color:#666;">To Recipient:</label>
          <select id="letter-to" required>
            ${Object.entries(APP_CONFIG.profiles).map(([key, person]) => `<option value="${esc(key)}">To ${esc(person.name)}</option>`).join("")}
          </select>
          
          <label style="font-size:12px; color:#666;">Message:</label>
          <textarea id="letter-body" rows="5" placeholder="Write from your heart..." required></textarea>
          
          <label style="font-size:12px; color:#666;">Delivery Type:</label>
          <select id="letter-status">
            <option value="Sent">Send Now</option>
            <option value="Scheduled">Schedule for Later</option>
          </select>

          <div id="deliver-date-group" style="display:none;">
            <label style="font-size:12px; color:#666;">Deliver Date & Time:</label>
            <input type="datetime-local" id="letter-deliver-date">
          </div>

          <div class="letter-modal-actions">
            <button type="button" id="cancel-letter-btn" style="padding: 8px 16px; border-radius: 8px; border: 1px solid #ccc; background: white;">Cancel</button>
            <button type="submit" id="submit-letter-btn" style="padding: 8px 16px; border-radius: 8px; border: none; background: #e11d48; color: white; font-weight:600;">Send Letter ♡</button>
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

  const writeModal = $("#write-letter-modal", el);
  const readModal = $("#read-letter-modal", el);
  const statusSelect = $("#letter-status", el);
  const deliverGroup = $("#deliver-date-group", el);
  const deliverInput = $("#letter-deliver-date", el);
  const submitBtn = $("#submit-letter-btn", el);
  const migratingLetters = new Set();

  statusSelect.onchange = () => {
    if (statusSelect.value === "Scheduled") {
      deliverGroup.style.display = "block";
      deliverInput.required = true;
      submitBtn.textContent = "Schedule Letter ♡";
    } else {
      deliverGroup.style.display = "none";
      deliverInput.required = false;
      submitBtn.textContent = "Send Letter ♡";
    }
  };

  el.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => {
      el.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      renderList();
    };
  });

  $("#write-letter-btn", el).onclick = () => (writeModal.style.display = "flex");
  $("#close-letter-modal", el).onclick = () => (writeModal.style.display = "none");
  $("#cancel-letter-btn", el).onclick = () => (writeModal.style.display = "none");
  $("#close-read-modal", el).onclick = () => (readModal.style.display = "none");

  $("#write-letter-form", el).onsubmit = async (e) => {
    e.preventDefault();
    const recipient = $("#letter-to", el).value;
    const body = $("#letter-body", el).value.trim();
    const status = statusSelect.value;
    const deliverDate = status === "Scheduled" ? new Date(deliverInput.value).toISOString() : new Date().toISOString();

    try {
      const letter = await addLetter({
        recipient,
        body,
        status,
        deliverDate,
        author: user.uid,
        authorName: profile.name,
        createdAt: new Date().toISOString()
      });
      if (status === "Sent" && recipient !== ownKey) {
        void notifyPartnerSafely(ownKey, "letter", "New letter received.", letter.id, "letters");
      }

      writeModal.style.display = "none";
      $("#write-letter-form", el).reset();
      deliverGroup.style.display = "none";
      submitBtn.textContent = "Send Letter ♡";
      toast(status === "Scheduled" ? "Letter scheduled ♡" : "Letter sent ♡");
    } catch (err) {
      toast("Could not send letter. Try again.");
    }
  };

  let allLetters = [];

  function renderList() {
    const container = $("#letters-list-container", el);
    const now = new Date();
    const nowIso = now.toISOString();

    const filtered = allLetters.filter((item) => {
      const deliveryTime = item.deliverDate ? new Date(item.deliverDate).getTime() : 0;
      const isDelivered = !deliveryTime || deliveryTime <= now.getTime();
      const isAuthor = item.author === user.uid;

      if (currentTab === "Inbox") {
        return !isAuthor && recipientKey(item.recipient) === ownKey &&
          (item.status === "Sent" || (item.status === "Scheduled" && isDelivered));
      } else if (currentTab === "Sent") {
        return isAuthor && (item.status === "Sent" || isDelivered);
      } else if (currentTab === "Scheduled") {
        return isAuthor && item.status === "Scheduled" && !isDelivered;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:#9ca3af; padding:20px 0;">No letters in ${currentTab}</p>`;
    } else {
      container.innerHTML = filtered.map((item) => {
        const dateVal = item.deliverDate || item.createdAt;
        const dateStr = dateVal ? new Date(dateVal).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : "Just now";
        const deliveryTime = item.deliverDate ? new Date(item.deliverDate).getTime() : 0;
        const isScheduled = item.status === "Scheduled" && deliveryTime > now.getTime();
        const isLocked = isScheduled && item.author !== user.uid;

        return `
          <div class="letter-item" data-id="${item.id}">
            <div class="letter-left">
              <div class="letter-avatar">💌</div>
              <div class="letter-info">
                <h4>${esc(item.recipient ? `To ${recipientName(item.recipient)}` : `From ${getDisplayName(item.author, item.authorName || "Us")}`)}</h4>
                <p>${isLocked ? '🔒 <i>Scheduled Surprise (Hidden)</i>' : esc(item.body || '')}</p>
              </div>
            </div>
            <div class="letter-date">${isLocked ? '⏳ ' : ''}${dateStr}</div>
          </div>
        `;
      }).join("");
    }

    container.querySelectorAll(".letter-item").forEach((row) => {
      row.onclick = async () => {
        const letter = allLetters.find((l) => l.id === row.dataset.id);
        if (letter) {
          const nowIso = new Date().toISOString();
          if (letter.status === "Scheduled" && letter.deliverDate > nowIso && letter.author !== user.uid) {
            toast("This letter is a surprise and locked until delivery date!");
            return;
          }
          try {
            const body = letter.status === "Scheduled"
              ? letter.body || await getScheduledLetterBody(letter.id)
              : letter.body || "";
            $("#read-letter-title", el).textContent = `To ${recipientName(letter.recipient)} (From ${getDisplayName(letter.author, letter.authorName || "Us")})`;
            $("#read-letter-date", el).textContent = letter.deliverDate ? `Deliver Date: ${new Date(letter.deliverDate).toLocaleString()}` : "";
            $("#read-letter-body", el).textContent = body;
            readModal.style.display = "flex";
          } catch (error) {
            console.error("Could not open letter:", error);
            toast(error.message || "Could not open this letter.");
          }
        }
      };
    });

    const nextDelivery = allLetters
      .filter(item => item.status === "Scheduled" && item.deliverDate)
      .map(item => new Date(item.deliverDate).getTime())
      .filter(time => Number.isFinite(time) && time > now.getTime())
      .sort((a, b) => a - b)[0];
    clearTimeout(deliveryTimer);
    deliveryTimer = nextDelivery
      ? setTimeout(renderList, Math.min(nextDelivery - now.getTime() + 1, 2147483647))
      : null;
  }

  stopLetters = watchItems("letter", (items) => {
    if (!active || !el.isConnected) return;
    allLetters = items;
    renderList();
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
}

export function disposeLetters() {
  active = false;
  clearTimeout(deliveryTimer);
  deliveryTimer = null;
  stopLetters?.();
  stopLetters = null;
}