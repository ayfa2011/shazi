export function updateWaterProgressUI(root, profiles, ownKey, countFor, ready) {
  if (!root) return;

  const cards = [...root.querySelectorAll("[data-water-profile]")];
  let bothDone = profiles.length > 0;

  for (const [key, profile] of profiles) {
    const card = cards.find(candidate => candidate.dataset.waterProfile === key);
    if (!card) {
      bothDone = false;
      continue;
    }

    const count = countFor(key);
    const name = profile.name || "Partner";
    card.setAttribute("aria-label", `${name}: ${count} of 8 glasses`);
    const countLabel = card.querySelector("[data-water-count]");
    if (countLabel) countLabel.textContent = String(count);
    const progress = card.querySelector(".water-progress-track");
    if (progress) {
      progress.setAttribute("aria-valuenow", String(count));
      const bar = progress.querySelector("span");
      if (bar) bar.style.width = `${count / 8 * 100}%`;
    }
    const fill = card.querySelector(".water-glass-fill");
    if (fill) fill.style.setProperty("--water-level", `${count / 8 * 82}%`);
    const caption = card.querySelector(".water-progress-caption");
    if (caption) caption.textContent = count >= 8 ? "Daily goal complete ✓" : `${8 - count} glasses to go`;

    if (key === ownKey) {
      card.querySelector('[data-action="water-remove"]')?.toggleAttribute("disabled", !ready || count <= 0);
      card.querySelector('[data-action="water-add"]')?.toggleAttribute("disabled", !ready || count >= 8);
    }
    if (count < 8) bothDone = false;
  }

  const celebration = root.querySelector("[data-water-celebrate]");
  if (celebration) celebration.hidden = !bothDone;
}
