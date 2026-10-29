import { $, esc, toast } from "./utils.js";
import { saveCoupleProfile } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { applyCoupleProfiles, getProfileKey, hydrateCoupleProfileAvatars } from "./profile-data.js";
import { uploadProfilePhoto } from "./drive.js";

export function renderProfile(el, user, profile) {
  if (el.onProfileSettingsChanged) {
    el.removeEventListener("couple-profile-settings-changed", el.onProfileSettingsChanged);
  }
  const ownProfileKey = getProfileKey(profile);
  const person = APP_CONFIG.profiles[ownProfileKey];
  if (!person) {
    el.innerHTML = `<p class="muted">Your profile is unavailable.</p>`;
    return;
  }
  const bio = person.bio || "";
  const avatar = person.avatar || "";
  el.innerHTML = `
    <style>
      .profile-settings { max-width:600px; margin:0 auto; overflow:hidden; background:#fff; border:1px solid #f1dbe5; border-radius:18px; }
      .profile-topbar { display:flex; align-items:center; gap:16px; min-height:54px; padding:8px 16px; border-bottom:1px solid #f1dbe5; }
      .profile-topbar h2 { margin:0; font:700 18px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#34242c; }
      .profile-back { width:34px; height:34px; border-radius:50%; background:transparent; color:#8f315d; font-size:20px; }
      .profile-cover { height:132px; background:linear-gradient(125deg,#f6c3d7,#fff0f6 56%,#e99dbb); }
      .profile-edit-card { position:relative; padding:0 20px 18px; }
      .profile-photo-preview { position:relative; width:172px; height:172px; padding:0; display:grid; place-items:center; overflow:visible; border:5px solid #fff; border-radius:50%; background:linear-gradient(145deg,#ffe9f1,#ffd4e4); color:#8f315d; font:700 54px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; margin-top:-86px; box-shadow:0 0 0 3px #f8c9db,0 12px 30px #a43f6c2b; cursor:pointer; transition:transform .25s ease,box-shadow .25s ease; -webkit-tap-highlight-color:transparent; }
      .profile-photo-preview:hover { transform:translateY(-2px); box-shadow:0 0 0 4px #f4b8d0,0 16px 36px #a43f6c35; }
      .profile-photo-preview:focus-visible { outline:3px solid #d94f8a; outline-offset:5px; }
      .profile-photo-preview img { width:100%; height:100%; object-fit:cover; border-radius:50%; transition:transform .35s ease; object-position:var(--profile-avatar-pos,50% 50%); }
      .profile-photo-preview .verified-badge { right:-4px; bottom:1px; width:46px; height:46px; }
      .profile-photo-preview:hover img { transform:scale(1.04); }
      .profile-photo-picker { display:none !important; }
      .profile-photo-crop { display:none; position:relative; width:220px; height:220px; margin:14px auto 0; border-radius:50%; overflow:hidden; border:3px solid #f3d5e2; background:#fff0f6; touch-action:none; cursor:grab; }
      .profile-photo-crop.is-visible { display:block; }
      .profile-photo-crop:active { cursor:grabbing; }
      .profile-photo-crop img { width:100%; height:100%; object-fit:cover; pointer-events:none; user-select:none; -webkit-user-drag:none; object-position:50% 50%; }
      .profile-photo-crop-hint { position:absolute; right:10px; bottom:10px; left:10px; padding:6px 10px; border-radius:999px; background:#402532a6; color:#fff; font-size:11px; text-align:center; pointer-events:none; }
      .profile-photo-dialog { position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; padding:22px; background:#29151f75; backdrop-filter:blur(7px); -webkit-backdrop-filter:blur(7px); opacity:0; visibility:hidden; transition:opacity .22s ease,visibility .22s ease; }
      .profile-photo-dialog.is-open { opacity:1; visibility:visible; }
      .profile-photo-dialog-card { width:min(100%,330px); padding:24px 20px 18px; text-align:center; border:1px solid #f6d6e3; border-radius:24px; background:linear-gradient(155deg,#fffafd,#fff0f6); box-shadow:0 22px 70px #31132335; transform:translateY(12px) scale(.97); transition:transform .22s ease; }
      .profile-photo-dialog.is-open .profile-photo-dialog-card { transform:translateY(0) scale(1); }
      .profile-photo-dialog-icon { width:58px; height:58px; display:grid; place-items:center; margin:0 auto 12px; border-radius:20px; color:#c7437e; background:#ffe0ec; font-size:26px; }
      .profile-photo-dialog h3 { margin:0 0 7px; color:#492b3a; font-size:18px; }
      .profile-photo-dialog p { margin:0 0 20px; color:#8c6c7c; font-size:13px; }
      .profile-photo-dialog-actions { display:grid; gap:9px; }
      .profile-photo-dialog-actions button { min-height:44px; border-radius:999px; font:600 14px/1.2 inherit; cursor:pointer; }
      .profile-photo-choose { border:0; color:#fff; background:linear-gradient(120deg,#e65391,#c83c79); box-shadow:0 6px 16px #d94f8a35; }
      .profile-photo-cancel { border:1px solid #f0d3df; color:#8f315d; background:#fff; }
      .profile-edit-card > .profile-photo-preview { margin-left:2px; }
      @media(prefers-reduced-motion:reduce) { .profile-photo-preview,.profile-photo-preview img,.profile-photo-dialog,.profile-photo-dialog-card { transition:none !important; } }
      .profile-form-fields { min-width:0; }
      .profile-form-fields form { margin:12px 0 0; gap:12px; }
      .profile-form-fields label { font-size:12px; color:#795364; }
      .profile-form-fields input,.profile-form-fields textarea { width:100%; padding:10px 12px; font-size:14px; border-radius:12px; }
      .profile-form-fields textarea { min-height:76px; resize:vertical; }
      .profile-photo-picker { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .profile-photo-picker input { padding:7px; font-size:11px; }
      .profile-handle { margin:5px 0 14px; color:#8c737d; font-size:13px; }
      .profile-save { justify-self:end; padding:9px 16px; border-radius:999px; }
      @media(max-width:420px) { .profile-cover { height:116px; } .profile-edit-card { padding-right:16px; padding-left:16px; } .profile-photo-preview { width:152px; height:152px; margin-top:-76px; font-size:48px; } .profile-photo-preview .verified-badge { width:42px;height:42px;right:-4px;bottom:1px; } }
      .profile-loading-skeleton { display:grid; gap:14px; padding:18px 20px 22px; }
      .profile-loading-skeleton-avatar { width:152px; height:152px; margin:-76px 0 0 2px; border-radius:50%; border:5px solid #fff; box-shadow:0 0 0 3px #f8c9db; }
      @media(max-width:420px) { .profile-loading-skeleton-avatar { width:132px; height:132px; margin-top:-66px; } }
    </style>
    <section class="profile-settings">
      <header class="profile-topbar"><button type="button" class="profile-back" aria-label="Back">←</button><h2>Profile</h2></header>
      <div class="profile-cover" aria-hidden="true"></div>
      ${person.bioConfigured === true ? "" : `
      <div class="profile-loading-skeleton" role="status" aria-busy="true" aria-label="Loading your profile">
        <i class="skeleton-shape profile-loading-skeleton-avatar"></i>
        <i class="skeleton-shape skeleton-line short" style="height:18px"></i>
        <i class="skeleton-shape skeleton-line" style="height:66px;border-radius:12px"></i>
      </div>`}
      <article class="profile-edit-card" ${person.bioConfigured === true ? "" : "hidden"}>
        <button type="button" class="profile-photo-preview" data-preview="${esc(ownProfileKey)}" aria-label="Change profile photo" aria-haspopup="dialog">
          ${avatar ? `<img src="${esc(avatar)}" alt="">` : esc((person.name || "♡")[0])}
          <span class="verified-badge" role="img" aria-label="Verified profile"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.2 3.1 3.1L15.3 6"/></svg></span>
        </button>
        <div class="profile-form-fields">
          <form data-profile-form="${esc(ownProfileKey)}">
            <label>Display name
              <input name="name" maxlength="40" value="${esc(person.name)}" required>
            </label>
            <label>Bio
              <textarea name="bio" maxlength="160" placeholder="A little about you...">${esc(bio)}</textarea>
            </label>
            <div class="profile-photo-crop" data-profile-crop aria-label="Drag photo to adjust profile crop"><img data-profile-crop-img alt="Profile photo crop preview"><span class="profile-photo-crop-hint">Drag photo to adjust</span></div>
            <label class="profile-photo-picker">Profile photo
              <input name="photo" type="file" accept="image/*" aria-label="Choose or take a profile photo">
            </label>
            <button class="primary profile-save" type="submit">Save</button>
          </form>
        </div>
      </article>
    </section>
    <div class="profile-photo-dialog" data-photo-dialog role="dialog" aria-modal="true" aria-labelledby="profile-photo-dialog-title">
      <div class="profile-photo-dialog-card">
        <div class="profile-photo-dialog-icon" aria-hidden="true">♡</div>
        <h3 id="profile-photo-dialog-title">Update your photo</h3>
        <p>Choose a photo that feels like you.</p>
        <div class="profile-photo-dialog-actions">
          <button type="button" class="profile-photo-choose" data-photo-choose>Choose a photo</button>
          <button type="button" class="profile-photo-cancel" data-photo-cancel>Cancel</button>
        </div>
      </div>
    </div>
  `;

  const form = el.querySelector("[data-profile-form]");
  // First Firebase confirmation of this profile's settings clears the skeleton;
  // if the profile was already hydrated locally this never shows.
  const dismissProfileSkeleton = () => {
    el.querySelector(".profile-loading-skeleton")?.remove();
    el.querySelector(".profile-edit-card")?.removeAttribute("hidden");
  };
  if (!el.querySelector(".profile-loading-skeleton")) dismissProfileSkeleton();
  if (form) {
    const key = ownProfileKey;
    const photoInput = form.elements.photo;
    const preview = $(`[data-preview="${key}"]`, el);
    const photoDialog = $("[data-photo-dialog]", el);
    const cropWrap = $("[data-profile-crop]", el);
    const cropImg = $("[data-profile-crop-img]", el);
    let cropObjectUrl = "";
    let cropPosition = { x: 50, y: 50 };
    let cropDrag = null;
    const clampCrop = v => Math.min(100, Math.max(0, v));
    const applyCrop = () => {
      const pos = `${cropPosition.x}% ${cropPosition.y}%`;
      cropImg?.style.setProperty("object-position", pos);
      preview?.style.setProperty("--profile-avatar-pos", pos);
      if (preview?.querySelector("img")) {
        preview.querySelector("img").style.objectPosition = pos;
      }
    };
    const hideCrop = () => {
      cropWrap?.classList.remove("is-visible");
      if (cropObjectUrl) { URL.revokeObjectURL(cropObjectUrl); cropObjectUrl = ""; }
      cropImg?.removeAttribute("src");
      cropDrag = null;
    };
    cropWrap?.addEventListener("pointerdown", event => {
      if (!cropImg?.src) return;
      event.preventDefault();
      cropDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: cropPosition.x, y: cropPosition.y };
      cropWrap.setPointerCapture(event.pointerId);
    });
    cropWrap?.addEventListener("pointermove", event => {
      if (!cropDrag || cropDrag.pointerId !== event.pointerId || !cropWrap) return;
      const rect = cropWrap.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      cropPosition = {
        x: clampCrop(cropDrag.x - (event.clientX - cropDrag.startX) / rect.width * 100),
        y: clampCrop(cropDrag.y - (event.clientY - cropDrag.startY) / rect.height * 100)
      };
      applyCrop();
    });
    cropWrap?.addEventListener("pointerup", () => { cropDrag = null; });
    cropWrap?.addEventListener("pointercancel", () => { cropDrag = null; });
    const openPhotoDialog = () => {
      photoDialog?.classList.add("is-open");
      photoDialog?.setAttribute("aria-hidden", "false");
      $("[data-photo-choose]", photoDialog)?.focus();
    };
    const closePhotoDialog = () => {
      photoDialog?.classList.remove("is-open");
      photoDialog?.setAttribute("aria-hidden", "true");
      preview?.focus();
    };

    $(".profile-back", el).onclick = () => window.App?.navigate("more");
    preview.onclick = openPhotoDialog;
    $("[data-photo-choose]", photoDialog).onclick = () => {
      closePhotoDialog();
      photoInput.click();
    };
    $("[data-photo-cancel]", photoDialog).onclick = closePhotoDialog;
    photoDialog.onclick = event => {
      if (event.target === photoDialog) closePhotoDialog();
    };
    photoDialog.setAttribute("aria-hidden", "true");
    photoDialog.addEventListener("keydown", event => {
      if (event.key === "Escape") closePhotoDialog();
    });
    let selectedPhoto = null;
    let selectedPhotoPosition = { x: 50, y: 50 };

    photoInput.onchange = () => {
      selectedPhoto = photoInput.files[0] || null;
      if (!selectedPhoto) { hideCrop(); return; }
      cropPosition = { x: 50, y: 50 };
      selectedPhotoPosition = { x: 50, y: 50 };
      if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
      cropObjectUrl = URL.createObjectURL(selectedPhoto);
      if (cropImg) {
        cropImg.src = cropObjectUrl;
        cropImg.style.objectPosition = "50% 50%";
      }
      cropWrap?.classList.add("is-visible");
      applyCrop();
      const reader = new FileReader();
      reader.onload = () => {
        preview.replaceChildren();
        const image = new Image();
        image.alt = `${form.elements.name.value} profile preview`;
        image.src = reader.result;
        image.style.objectPosition = "50% 50%";
        preview.append(image);
        preview.style.setProperty("--profile-avatar-pos", "50% 50%");
      };
      reader.readAsDataURL(selectedPhoto);
    };

    form.onsubmit = async event => {
      event.preventDefault();
      if (key !== ownProfileKey) return toast("You can only edit your own profile.");
      const name = form.elements.name.value.trim();
      const bio = form.elements.bio.value.trim();
      if (!name) return toast("Please enter a name.");

      const saveButton = form.querySelector(".profile-save");
      saveButton.disabled = true;
      saveButton.textContent = "Saving…";
      try {
        const previousNames = [...new Set([
          ...(person.previousNames || []),
          ...(person.name !== name ? [person.name] : [])
        ])];
        const savedProfile = {
          name,
          bio,
          bioConfigured: true,
          avatar: person.avatarTelegramFileId ? "" : (person.avatar || ""),
          avatarTelegramFileId: person.avatarTelegramFileId || "",
          avatarMimeType: person.avatarMimeType || "image/jpeg",
          authUid: person.authUid || (key === ownProfileKey ? user.uid : ""),
          previousNames,
          avatarPosition: selectedPhoto ? `${Math.round(cropPosition.x)}% ${Math.round(cropPosition.y)}%` : (person.avatarPosition || "50% 50%")
        };

        if (selectedPhoto) {
          const uploaded = await uploadProfilePhoto(selectedPhoto, name);
          savedProfile.avatar = "";
          savedProfile.avatarTelegramFileId = uploaded.telegramFileId;
          Object.assign(savedProfile, uploaded);
        }

        await saveCoupleProfile(key, savedProfile);
        applyCoupleProfiles({ [key]: savedProfile });
        try {
          await hydrateCoupleProfileAvatars();
        } catch (error) {
          console.error("Telegram profile photo could not load:", error);
        }
        selectedPhoto = null;
        photoInput.value = "";
        hideCrop();
        cropPosition = { x: 50, y: 50 };
        selectedPhotoPosition = { x: 50, y: 50 };
        window.dispatchEvent(new CustomEvent("couple-profiles-updated"));
        toast("Profile saved ♡");
      } catch (error) {
        console.error("Could not save profile:", error);
        toast(error.message || "Could not save profile.");
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save";
      }
    };
  }

  el.onProfileSettingsChanged = () => {
    const updated = APP_CONFIG.profiles[ownProfileKey];
    if (!updated) return;
    // Profile data has arrived from Firebase: drop the skeleton and reveal the
    // real card (a layout swap inside the same card footprint — no jump).
    dismissProfileSkeleton();
    const currentForm = el.querySelector("[data-profile-form]");
    if (!currentForm) return;
    currentForm.elements.name.value = updated.name;
    currentForm.elements.bio.value = updated.bio || "";
    const currentPreview = $(`[data-preview="${ownProfileKey}"]`, el);
    currentPreview.replaceChildren();
    const pos = updated.avatarPosition || "50% 50%";
    currentPreview.style.setProperty("--profile-avatar-pos", pos);
    if (updated.avatar) {
      const image = new Image();
      image.src = updated.avatar;
      image.alt = `${updated.name} profile`;
      image.style.objectPosition = pos;
      currentPreview.append(image);
    if (updated.avatar) {
      const image = new Image();
      image.src = updated.avatar;
      image.alt = `${updated.name} profile`;
      image.style.objectPosition = pos;
      currentPreview.append(image);
      const apply = () => { image.style.objectPosition = pos; currentPreview.style.setProperty("--profile-avatar-pos", pos); };
      image.addEventListener("load", apply, { once: true });
      apply();
    } else {
    } else {
      currentPreview.textContent = updated.name[0] || "♡";
    }
    $("[data-profile-crop]", el)?.classList.remove("is-visible");
  };
  el.addEventListener("couple-profile-settings-changed", el.onProfileSettingsChanged);
}
