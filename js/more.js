import { $, toast } from "./utils.js";
import { logout } from "./auth.js";
import { disposeSpecialDays, renderSpecialDays } from "./special-days.js";

export function renderMore(el, user) {
  disposeSpecialDays();
  el.innerHTML = `
    <section class="more-page">
      <header class="more-page-heading">
        <div>
          <p class="eyebrow">OUR LITTLE WORLD</p>
          <h1>More</h1>
        </div>
        <button type="button" class="more-logout" aria-label="Log out" title="Log out">↪</button>
      </header>
      <div class="more-page-actions">
        <button type="button" class="more-action card" data-more-route="bucket">
          <span class="more-action-icon" aria-hidden="true">🎯</span>
          <span><strong>Our Bucket List</strong><small>Our future dreams together</small></span>
          <span class="more-action-arrow" aria-hidden="true">›</span>
        </button>
        <button type="button" class="more-action card" id="special-days-card">
          <span class="more-action-icon" aria-hidden="true">♡</span>
          <span><strong>Special Days</strong><small>Birthdays, anniversaries and celebrations</small></span>
          <span class="more-action-arrow" aria-hidden="true">›</span>
        </button>
      </div>
      <div id="more-detail"></div>
    </section>
  `;

  $("[data-more-route='bucket']", el).onclick = () => window.App?.navigate("bucket");
  $("#special-days-card", el).onclick = () => renderSpecialDays($("#more-detail", el), user);
  $(".more-logout", el).onclick = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Could not log out:", error);
      toast(error.message || "Could not log out.");
    }
  };
}
