import { $, esc, toast, dailyIndex, todayKey } from "./utils.js";
import { watchItems, addItem } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { getDisplayName } from "./profile-data.js";

let stopChallenges = null, active = false;

export function renderChallenges(el, user, profile) {
  stopChallenges?.();
  active = true;

  const date = todayKey();
  const c = APP_CONFIG.starterChallenges[dailyIndex(APP_CONFIG.starterChallenges.length)];

  el.innerHTML = `
    <div class="card">
      <p class="eyebrow">TODAY'S CHALLENGE</p>
      <h3>${esc(c)}</h3>
      <button id="complete-challenge" class="primary">Mark complete ♡</button>
    </div>
    <div class="section-head">
      <h3>Challenge history</h3>
    </div>
    <div id="challenge-list" class="list"></div>
  `;

  const btn = $("#complete-challenge", el);

  btn.onclick = async () => {
    btn.disabled = true;
    await addItem("challenge", {
      title: c,
      done: true,
      author: user.uid,
      authorName: profile.name,
      challengeDate: date,
      date: new Date().toISOString()
    });
    toast("Challenge completed ♡");
  };

  stopChallenges = watchItems("challenge", items => {
    if (!active || !el.isConnected) return;

    // Check if user already completed this challenge today
    const completedToday = items.some(x => x.challengeDate === date && x.author === user.uid && x.title === c);
    
    if (completedToday) {
      btn.disabled = true;
      btn.textContent = "Completed Today ✓";
      btn.classList.add("secondary");
    } else {
      btn.disabled = false;
      btn.textContent = "Mark complete ♡";
      btn.classList.remove("secondary");
    }

    // Scoped list query
    const listEl = $("#challenge-list", el);
    if (listEl) {
      if (items.length === 0) {
        listEl.innerHTML = `<p style="color:#9ca3af; font-size:13px;">No completed challenges yet.</p>`;
      } else {
        listEl.innerHTML = items.map(x => `
          <div class="item">
            <div>
              <strong>${esc(x.title)}</strong>
              <br><small style="color:#9ca3af;">By ${esc(getDisplayName(x.author, x.authorName || "Us"))}</small>
            </div>
            <span class="tag">Completed</span>
          </div>
        `).join("");
      }
    }
  });
}

export function disposeChallenges() {
  active = false;
  stopChallenges?.();
  stopChallenges = null;
}