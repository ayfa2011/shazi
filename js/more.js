import { $, toast } from "./utils.js";
import { logout } from "./auth.js";
import { disposeSpecialDays, renderSpecialDays } from "./special-days.js";

export function renderMore(el, user) {
  disposeSpecialDays();
  const assetUrl = fileName => new URL(`../Asset/${fileName}`, import.meta.url).href;
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
        <button type="button" class="more-action card" data-more-route="bucket" aria-label="Our Bucket List">
          <img src="${assetUrl("Our Bucket List.png")}" alt="Our Bucket List">
        </button>
        <button type="button" class="more-action card" data-more-route="gallery-library" aria-label="Gallery">
          <img src="${assetUrl("Gallery.png")}" alt="Gallery">
        </button>
        <button type="button" class="more-action card" id="special-days-card" aria-label="Special Days">
          <img src="${assetUrl("Special Days.png")}" alt="Special Days">
        </button>

      </div>
      <div id="more-detail"></div>
    </section>
  `;

  $("[data-more-route='bucket']", el).onclick = () => window.App?.navigate("bucket");
  $("[data-more-route='gallery-library']", el).onclick = () => window.App?.navigate("gallery-library");
  $("#special-days-card", el).onclick = () => {
    const morePage = $(".more-page", el);
    morePage.classList.add("showing-special-days");
    renderSpecialDays($("#more-detail", el), user);
  };

  $(".more-logout", el).onclick = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Could not log out:", error);
      toast(error.message || "Could not log out.");
    }
  };
}
