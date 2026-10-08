import { $, esc, toast, todayKey, scheduleDubaiDayRollover } from "./utils.js";
import { addItem, removeItem, setItem, watchItems } from "./firestore.js";
import { formatSpecialDayCountdown, formatSpecialDayDate, specialDayCountdown } from "./special-day-utils.js";

let stopSpecialDays = null;
let specialDaysRolloverTimer = null;
const categories = ["Birthday", "Anniversary", "Celebration", "Other"];

function sortedSpecialDays(items, today) {
  return items.map(item => ({ ...item, countdown: specialDayCountdown(item, today) }))
    .filter(item => item.countdown)
    .sort((a, b) => {
      const aPast = a.countdown.days < 0;
      const bPast = b.countdown.days < 0;
      if (aPast !== bPast) return aPast ? 1 : -1;
      return aPast ? b.countdown.days - a.countdown.days : a.countdown.days - b.countdown.days;
    });
}

function eventCard(item) {
  const dateLabel = formatSpecialDayDate(item.countdown.date);
  const countdownLabel = formatSpecialDayCountdown(item.countdown.days);
  return `<article class="special-day-item">
    <span class="special-day-item-icon" aria-hidden="true">${item.category === "Birthday" ? "🎂" : item.category === "Anniversary" ? "💞" : item.category === "Celebration" ? "🎉" : "📅"}</span>
    <span class="special-day-item-copy"><strong>${esc(item.title)}</strong><span>${esc(item.category)} · ${esc(dateLabel)}${item.recurring ? " · Every year" : ""}</span></span>
    <span class="special-day-countdown${item.countdown.days < 0 ? " is-past" : ""}">${esc(countdownLabel)}</span>
    <button class="special-day-edit" type="button" data-edit-special-day="${esc(item.id)}" aria-label="Edit ${esc(item.title)}">✎</button>
  </article>`;
}

export function renderSpecialDays(el, user) {
  stopSpecialDays?.();
  stopSpecialDays = null;
  clearTimeout(specialDaysRolloverTimer);
  specialDaysRolloverTimer = null;
  let items = [];
  let editingId = "";

  el.innerHTML = `<section class="special-days">
    <button class="special-days-back" type="button" data-special-days-back>← More</button>
    <header class="special-days-header">
      <div><p class="eyebrow">MARK THE MOMENTS THAT MATTER</p><h1>Special Days ♡</h1><p class="muted">Birthdays, anniversaries, and all the days worth remembering.</p></div>
      <button type="button" class="primary special-days-add" data-add-special-day>+ Add day</button>
    </header>
    <div class="special-days-list" aria-live="polite"><p class="muted">Loading your special days…</p></div>
    <div class="special-days-modal hidden" data-special-days-modal>
      <form class="special-days-form" data-special-days-form>
        <div class="special-days-form-heading"><h2 data-special-days-form-title>Add a special day</h2><button type="button" class="icon-btn" data-cancel-special-day aria-label="Close">×</button></div>
        <label for="special-day-title">Name</label><input id="special-day-title" name="title" type="text" maxlength="80" placeholder="e.g. Keby's Birthday" required>
        <label for="special-day-category">Type</label><select id="special-day-category" name="category">${categories.map(category => `<option value="${category}">${category}</option>`).join("")}</select>
        <label for="special-day-date">Date</label><input id="special-day-date" name="date" type="date" required>
        <label class="special-day-repeat"><input name="recurring" type="checkbox" checked><span>Repeat every year</span></label>
        <div class="special-days-form-actions"><button type="button" class="secondary" data-cancel-special-day>Cancel</button><button type="submit" class="primary">Save day</button></div>
        <button type="button" class="special-day-delete hidden" data-delete-special-day>Delete this day</button>
      </form>
    </div>
  </section>`;

  const list = $(".special-days-list", el);
  const modal = $("[data-special-days-modal]", el);
  const form = $("[data-special-days-form]", el);

  function renderList() {
    const sorted = sortedSpecialDays(items, todayKey());
    list.innerHTML = sorted.length
      ? sorted.map(eventCard).join("")
      : `<div class="special-days-empty"><span aria-hidden="true">♡</span><p>No special days saved yet.</p><small>Add a birthday, anniversary, or any date you want to remember.</small></div>`;
  }

  function scheduleRollover() {
    clearTimeout(specialDaysRolloverTimer);
    specialDaysRolloverTimer = scheduleDubaiDayRollover(() => {
      if (!el.isConnected) return;
      renderList();
      scheduleRollover();
    });
  }

  function openForm(item = null) {
    editingId = item?.id || "";
    form.reset();
    form.elements.title.value = item?.title || "";
    form.elements.category.value = item?.category || "Birthday";
    form.elements.date.value = item?.date || "";
    form.elements.recurring.checked = item ? Boolean(item.recurring) : true;
    $("[data-special-days-form-title]", el).textContent = item ? "Edit special day" : "Add a special day";
    $("[data-delete-special-day]", el).classList.toggle("hidden", !item);
    modal.classList.remove("hidden");
    $("#special-day-title", el).focus();
  }

  function closeForm() {
    modal.classList.add("hidden");
    editingId = "";
  }

  el.onclick = async event => {
    const button = event.target.closest("button");
    if (!button || !el.contains(button)) return;

    if (button.matches("[data-special-days-back]")) {
      window.App?.navigate("more");
      return;
    }
    if (button.matches("[data-add-special-day]")) {
      openForm();
      return;
    }
    if (button.matches("[data-cancel-special-day]")) {
      closeForm();
      return;
    }
    if (button.matches("[data-edit-special-day]")) {
      const item = items.find(day => day.id === button.dataset.editSpecialDay);
      if (item) openForm(item);
      return;
    }
    if (button.matches("[data-delete-special-day]")) {
      const id = editingId;
      if (!id || !window.confirm("Delete this special day for both of you?")) return;
      try {
        await removeItem(id);
        closeForm();
        toast("Special day deleted.");
      } catch (error) {
        console.error("Could not delete special day:", error);
        toast("Could not delete this day. Please try again.");
      }
    }
  };

  form.onsubmit = async event => {
    event.preventDefault();
    const title = form.elements.title.value.trim();
    const category = form.elements.category.value;
    const date = form.elements.date.value;
    const recurring = form.elements.recurring.checked;
    if (!title || title.length > 80 || !categories.includes(category) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast("Please enter a name, type, and valid date.");
      return;
    }

    try {
      const payload = { title, category, date, recurring };
      if (editingId) {
        await setItem(editingId, payload);
        toast("Special day updated ♡");
      } else {
        await addItem("specialDay", { ...payload, author: user.uid });
        toast("Special day saved for both of you ♡");
      }
      closeForm();
    } catch (error) {
      console.error("Could not save special day:", error);
      toast("Could not save this day. Please try again.");
    }
  };

  stopSpecialDays = watchItems("specialDay", nextItems => {
    items = nextItems || [];
    renderList();
  }, error => {
    console.error("Special days could not be loaded:", error);
    list.innerHTML = `<p class="error">Special days could not be loaded. Please try again.</p>`;
  });
  scheduleRollover();
}

export function disposeSpecialDays() {
  stopSpecialDays?.();
  stopSpecialDays = null;
  clearTimeout(specialDaysRolloverTimer);
  specialDaysRolloverTimer = null;
}
