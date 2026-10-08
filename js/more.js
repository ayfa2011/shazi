import { $, esc } from "./utils.js";
import { logout } from "./auth.js";
import { renderProfile } from "./profile.js";
import { renderBucket } from "./bucket-list.js";
import { disposeSpecialDays, renderSpecialDays } from "./special-days.js";

export function renderMore(el, user, profile) {
  disposeSpecialDays();
  el.innerHTML = `
    <div class="grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px;">
      <button class="card" id="bucket-card" style="cursor: pointer; text-align: left; padding: 16px;">
        <h3 style="margin: 0 0 6px 0; color: #e11d48; display: flex; align-items: center; gap: 6px;">
          <span>🎯</span> Our Bucket List
        </h3>
        <p class="muted" style="margin: 0; font-size: 13px;">Our future dreams together.</p>
      </button>

      <button class="card" id="profile-card" style="cursor: pointer; text-align: left; padding: 16px;">
        <h3 style="margin: 0 0 6px 0;">👤 Profile</h3>
        <p class="muted" style="margin: 0; font-size: 13px;">Your private profile.</p>
      </button>

      <button class="card" id="special-days-card" style="cursor: pointer; text-align: left; padding: 16px;">
        <h3 style="margin: 0 0 6px 0; color: #e11d48;">♡ Special Days</h3>
        <p class="muted" style="margin: 0; font-size: 13px;">Remember birthdays, anniversaries and celebrations.</p>
      </button>

      <button class="card" id="activities-card" style="cursor: pointer; text-align: left; padding: 16px;">
        <h3 style="margin: 0 0 6px 0;">✨ Activities</h3>
        <p class="muted" style="margin: 0; font-size: 13px;">Questions, games and things to do together.</p>
      </button>

      <button class="card" id="logout-card" style="cursor: pointer; text-align: left; padding: 16px;">
        <h3 style="margin: 0 0 6px 0; color: #dc2626;">🚪 Log out</h3>
        <p class="muted" style="margin: 0; font-size: 13px;">Leave our little world.</p>
      </button>
    </div>

    <!-- Container where Bucket List or Profile details render -->
    <div id="more-detail"></div>
  `;

  const detailEl = $("#more-detail", el);

  // Bucket List Button Click
  $("#bucket-card", el).onclick = () => {
    disposeSpecialDays();
    detailEl.innerHTML = "";
    renderBucket(detailEl, user, profile);
  };

  // Profile Button Click
  $("#profile-card", el).onclick = () => {
    disposeSpecialDays();
    detailEl.innerHTML = "";
    renderProfile(detailEl, user, profile);
  };

  $("#special-days-card", el).onclick = () => {
    detailEl.innerHTML = "";
    renderSpecialDays(detailEl, user);
  };

  $("#activities-card", el).onclick = () => window.App?.navigate("activities");

  // Logout Button Click
  $("#logout-card", el).onclick = () => logout();
}