import { $, esc, toast, todayKey, scheduleDubaiDayRollover, compressImageFile } from "./utils.js";
import { addItem, removeItem, setItem, watchItems, notifyPartnerSafely } from "./firestore.js";
import { formatSpecialDayCountdown, formatSpecialDayDate, specialDayCountdown } from "./special-day-utils.js";
import { APP_CONFIG } from "../config/app-config.js";
import { getTelegramMediaUrl, sendToTelegram, telegramMediaReferences, telegramUploadMimeType } from "../src/services/telegramService.js";

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
  const initials = item.title.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase() || "♡";
  const photo = item.telegramFileId
    ? `<img data-special-day-photo="${esc(item.telegramFileId)}" data-special-day-mime="${esc(item.photoMimeType || "image/jpeg")}" alt="${esc(item.title)}" loading="lazy">`
    : `<span class="special-day-initials" aria-hidden="true">${esc(initials)}</span>`;
  return `<article class="special-day-item" data-edit-special-day="${esc(item.id)}" tabindex="0" role="button" aria-label="Edit ${esc(item.title)}">
    <button type="button" class="special-day-photo" data-pick-special-day-photo="${esc(item.id)}" aria-label="Change photo for ${esc(item.title)}">${photo}</button>
    <div class="special-day-item-copy"><strong>${esc(item.title)}</strong><span>${esc(item.category)} · ${esc(dateLabel)}</span><small>${item.recurring ? "Every year" : "One time"}</small></div>
    <span class="special-day-countdown${item.countdown.days < 0 ? " is-past" : ""}">${esc(countdownLabel)}</span>
  </article>`;
}

export function renderSpecialDays(el, user) {
  stopSpecialDays?.();
  stopSpecialDays = null;
  clearTimeout(specialDaysRolloverTimer);
  specialDaysRolloverTimer = null;
  let items = [];
  let editingId = "";
  let selectedPhoto = null;
  let photoPreviewUrl = "";
  let isSaving = false;
  let cardPhotoDayId = "";
  const awaitingSnapshot = new Map();
  const ownKey = Object.keys(APP_CONFIG.profiles).find(key => APP_CONFIG.profiles[key].email === user.email);
  const actorName = APP_CONFIG.profiles[ownKey]?.name || "Your partner";

  el.innerHTML = `<section class="special-days">
    <button class="special-days-back" type="button" data-special-days-back>← More</button>
    <header class="special-days-header">
      <div><p class="eyebrow">MARK THE MOMENTS THAT MATTER</p><h1>♡ Special Days</h1><p class="muted">Birthdays, anniversaries, and all the days worth remembering.</p></div>
      <span class="special-days-calendar" aria-hidden="true">▦</span>
    </header>
    <div class="special-days-banner"><span>Celebrate your special moments together always ❤️</span><button type="button" class="primary special-days-add" data-add-special-day>+ Add Day</button></div>
    <h2 class="special-days-section-title">Upcoming Special Days</h2>
    <div class="special-days-list" aria-live="polite"><p class="muted">Loading your special days…</p></div>
    <input type="file" accept="image/*" data-card-photo-file hidden>
    <div class="special-days-modal hidden" data-special-days-modal>
      <form class="special-days-form" data-special-days-form>
        <div class="special-days-form-heading"><h2 data-special-days-form-title>Add a special day</h2><button type="button" class="icon-btn" data-cancel-special-day aria-label="Close">×</button></div>
        <div class="special-day-form-photo-wrap"><button type="button" class="special-day-form-photo" data-form-pick-photo aria-label="Choose a personal photo"><span class="special-day-initials" data-photo-initials>♡</span><img data-form-photo-preview alt="Special day photo preview" hidden></button><span class="special-day-change-photo" data-form-photo-label>Choose a photo (optional)</span><input type="file" accept="image/*" data-special-day-file hidden></div>
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
  const formFile = $("[data-special-day-file]", el);
  const cardFile = $("[data-card-photo-file]", el);

  function hydrateCardPhotos() {
    list.querySelectorAll("img[data-special-day-photo]").forEach(image => {
      if (image.dataset.loading) return;
      image.dataset.loading = "1";
      getTelegramMediaUrl(image.dataset.specialDayPhoto, image.dataset.specialDayMime || "image/jpeg")
        .then(url => { if (image.isConnected) image.src = url; })
        .catch(error => {
          console.error("Special day photo could not load:", error);
          if (image.isConnected) image.replaceWith(Object.assign(document.createElement("span"), { className: "special-day-initials", textContent: "♡", ariaHidden: "true" }));
        });
    });
  }

  function renderList() {
    const sorted = sortedSpecialDays(items, todayKey());
    list.innerHTML = sorted.length
      ? sorted.map(eventCard).join("")
      : `<div class="special-days-empty"><span aria-hidden="true">♡</span><p>No special days saved yet.</p><small>Add a birthday, anniversary, or any date you want to remember.</small></div>`;
    hydrateCardPhotos();
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
    selectedPhoto = null;
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoPreviewUrl = "";
    formFile.value = "";
    form.reset();
    form.elements.title.value = item?.title || "";
    form.elements.category.value = item?.category || "Birthday";
    form.elements.date.value = item?.date || "";
    form.elements.recurring.checked = item ? Boolean(item.recurring) : true;
    $("[data-special-days-form-title]", el).textContent = item ? "Edit special day" : "Add a special day";
    $("[data-delete-special-day]", el).classList.toggle("hidden", !item);
    const preview = $("[data-form-photo-preview]", el);
    const initials = $("[data-photo-initials]", el);
    const label = $("[data-form-photo-label]", el);
    preview.hidden = true;
    preview.removeAttribute("src");
    initials.hidden = false;
    initials.textContent = (item?.title || "♡").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase() || "♡";
    label.textContent = item?.telegramFileId ? "Change Photo" : "Choose a photo (optional)";
    if (item?.telegramFileId) getTelegramMediaUrl(item.telegramFileId, item.photoMimeType || "image/jpeg").then(url => {
      if (editingId === item.id && !selectedPhoto) { preview.src = url; preview.hidden = false; initials.hidden = true; }
    }).catch(error => console.error("Special day photo preview could not load:", error));
    modal.classList.remove("hidden");
    $("#special-day-title", el).focus();
  }

  function closeForm() {
    modal.classList.add("hidden");
    editingId = "";
    selectedPhoto = null;
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoPreviewUrl = "";
  }

  async function uploadSpecialDayPhoto(file, item) {
    if (!file || !file.type.startsWith("image/")) throw new Error("Choose an image file.");
    const compressed = await compressImageFile(file, { maxDimension: 1000, quality: 0.78, mimeType: "image/jpeg" });
    const type = compressed.type || file.type || "image/jpeg";
    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/gif": "gif" })[type] || "img";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "special-day";
    const uploadFile = compressed === file ? new File([compressed], `${baseName}.${extension}`, { type }) : compressed;
    const result = await sendToTelegram(uploadFile, `Special Day Photo · ${item.title}`);
    return { ...telegramMediaReferences(result), photoMimeType: telegramUploadMimeType(uploadFile) || "image/jpeg" };
  }

  $(`[data-form-pick-photo]`, el).onclick = () => formFile.click();
  formFile.onchange = () => {
    selectedPhoto = formFile.files?.[0] || null;
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoPreviewUrl = selectedPhoto ? URL.createObjectURL(selectedPhoto) : "";
    const preview = $(`[data-form-photo-preview]`, el);
    const initials = $(`[data-photo-initials]`, el);
    const label = $(`[data-form-photo-label]`, el);
    if (selectedPhoto) { preview.src = photoPreviewUrl; preview.hidden = false; initials.hidden = true; label.textContent = selectedPhoto.name; }
  };

  cardFile.onchange = async () => {
    const file = cardFile.files?.[0];
    const day = items.find(item => item.id === cardPhotoDayId);
    cardPhotoDayId = "";
    if (!file || !day || isSaving) return;
    const previewUrl = URL.createObjectURL(file);
    const photoButton = [...list.querySelectorAll("[data-pick-special-day-photo]")].find(button => button.dataset.pickSpecialDayPhoto === day.id);
    if (photoButton) photoButton.innerHTML = `<img src="${previewUrl}" alt="${esc(day.title)}">`;
    isSaving = true;
    try {
      const photo = await uploadSpecialDayPhoto(file, day);
      await setItem(day.id, { title: day.title, category: day.category, date: day.date, recurring: day.recurring, ...photo });
      items = items.map(item => item.id === day.id ? { ...item, ...photo } : item);
      renderList();
      toast("Photo saved ♡");
    } catch (error) {
      console.error("Could not save special day photo:", error);
      toast("Could not upload this photo. Please try again.");
    } finally { isSaving = false; cardFile.value = ""; URL.revokeObjectURL(previewUrl); }
  };

  el.onclick = async event => {
    const button = event.target.closest("button");
    if (!el.contains(event.target)) return;
    const photoPicker = event.target.closest("[data-pick-special-day-photo]");
    if (photoPicker) {
      event.stopPropagation();
      cardPhotoDayId = photoPicker.dataset.pickSpecialDayPhoto;
      cardFile.click();
      return;
    }
    const card = event.target.closest("[data-edit-special-day]");
    if (card && !event.target.closest("button")) {
      const item = items.find(day => day.id === card.dataset.editSpecialDay);
      if (item) openForm(item);
      return;
    }
    if (!button) return;

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
    if (button.matches("[data-delete-special-day]")) {
      const id = editingId;
      if (!id || !window.confirm("Delete this special day for both of you?")) return;
      try {
        await removeItem(id);
        awaitingSnapshot.delete(id);
        closeForm();
        toast("Special day deleted.");
      } catch (error) {
        console.error("Could not delete special day:", error);
        toast("Could not delete this day. Please try again.");
      }
    }
  };

  el.onkeydown = event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-edit-special-day]");
    if (!card || event.target.closest("button")) return;
    event.preventDefault();
    const item = items.find(day => day.id === card.dataset.editSpecialDay);
    if (item) openForm(item);
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

    if (isSaving) return;
    isSaving = true;
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      const existing = items.find(item => item.id === editingId);
      let payload = { title, category, date, recurring };
      if (existing?.telegramFileId) payload = { ...payload, telegramFileId: existing.telegramFileId, telegramFileUniqueId: existing.telegramFileUniqueId || "", telegramMessageId: existing.telegramMessageId || null, telegramChatId: existing.telegramChatId || null, photoMimeType: existing.photoMimeType || "image/jpeg" };
      if (selectedPhoto) payload = { ...payload, ...await uploadSpecialDayPhoto(selectedPhoto, { title }) };
      if (editingId) {
        await setItem(editingId, payload);
        awaitingSnapshot.set(editingId, { id: editingId, ...payload });
        items = [...items.filter(item => item.id !== editingId), { id: editingId, ...payload }];
        renderList();
        if (ownKey) void notifyPartnerSafely(ownKey, "specialDay", `${actorName} updated a special day.`, `${editingId}-updated-${Date.now()}`, "more");
        toast("Special day updated ♡");
      } else {
        const day = await addItem("specialDay", { ...payload, author: user.uid });
        awaitingSnapshot.set(day.id, { id: day.id, ...payload });
        items = [...items, { id: day.id, ...payload }];
        renderList();
        if (ownKey) void notifyPartnerSafely(ownKey, "specialDay", `${actorName} added a special day.`, day.id, "more");
        toast("Special day saved for both of you ♡");
      }
      closeForm();
    } catch (error) {
      console.error("Could not save special day:", error);
      toast(selectedPhoto ? "Could not save the day or upload its photo. Please try again." : "Could not save this day. Please try again.");
    } finally { isSaving = false; submitButton.disabled = false; }
  };

  stopSpecialDays = watchItems("specialDay", nextItems => {
    const liveItems = nextItems || [];
    const liveIds = new Set(liveItems.map(item => item.id));
    // Keep optimistic writes visible until the server confirms them. A local
    // snapshot can omit a pending server-timestamp document from this ordered
    // query, which previously made a newly saved day disappear immediately.
    for (const [id, optimisticItem] of awaitingSnapshot) {
      const confirmedItem = liveItems.find(item => item.id === id);
      if (confirmedItem && !confirmedItem.createdAt?.toDate && confirmedItem.createdAt) {
        awaitingSnapshot.delete(id);
      } else if (confirmedItem) {
        awaitingSnapshot.set(id, { ...optimisticItem, ...confirmedItem });
      }
    }
    items = [...liveItems, ...[...awaitingSnapshot.values()].filter(item => !liveIds.has(item.id))];
    renderList();
  }, error => {
    console.error("Special days could not be loaded:", error);
    list.innerHTML = `<p class="error">Special days could not be loaded. Please try again.</p>`;
  }, null, { includeMetadataChanges: true });
  scheduleRollover();
}

export function disposeSpecialDays() {
  stopSpecialDays?.();
  stopSpecialDays = null;
  clearTimeout(specialDaysRolloverTimer);
  specialDaysRolloverTimer = null;
}
