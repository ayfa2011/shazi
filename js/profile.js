import { $, esc, toast } from "./utils.js";
import { saveCoupleProfile } from "./firestore.js";
import { APP_CONFIG } from "../config/app-config.js";
import { applyCoupleProfiles, getProfileKey } from "./profile-data.js";
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
      .profile-cover { height:108px; background:linear-gradient(125deg,#f6c3d7,#fff0f6 56%,#e99dbb); }
      .profile-edit-card { position:relative; padding:0 16px 18px; }
      .profile-photo-preview { width:88px; height:88px; display:grid; place-items:center; overflow:hidden; border:4px solid #fff; border-radius:50%; background:#ffe4ef; color:#8f315d; font-size:30px; font-weight:700; margin-top:-44px; }
      .profile-photo-preview img { width:100%; height:100%; object-fit:cover; }
      .profile-form-fields { min-width:0; }
      .profile-form-fields form { margin:12px 0 0; gap:12px; }
      .profile-form-fields label { font-size:12px; color:#795364; }
      .profile-form-fields input,.profile-form-fields textarea { width:100%; padding:10px 12px; font-size:14px; border-radius:12px; }
      .profile-form-fields textarea { min-height:76px; resize:vertical; }
      .profile-photo-picker { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .profile-photo-picker input { padding:7px; font-size:11px; }
      .profile-handle { margin:5px 0 14px; color:#8c737d; font-size:13px; }
      .profile-save { justify-self:end; padding:9px 16px; border-radius:999px; }
      @media(max-width:420px) { .profile-cover { height:88px; } .profile-photo-preview { width:76px; height:76px; margin-top:-38px; } }
    </style>
    <section class="profile-settings">
      <header class="profile-topbar"><button type="button" class="profile-back" aria-label="Back">←</button><h2>Profile</h2></header>
      <div class="profile-cover" aria-hidden="true"></div>
      <article class="profile-edit-card">
        <div class="profile-photo-preview" data-preview="${esc(ownProfileKey)}">
          ${avatar ? `<img src="${esc(avatar)}" alt="${esc(person.name)}">` : esc((person.name || "♡")[0])}
        </div>
        <div class="profile-form-fields">
          <form data-profile-form="${esc(ownProfileKey)}">
            <label>Display name
              <input name="name" maxlength="40" value="${esc(person.name)}" required>
            </label>
            <label>Bio
              <textarea name="bio" maxlength="160" placeholder="A little about you...">${esc(bio)}</textarea>
            </label>
            <label class="profile-photo-picker">Profile photo
              <input name="photo" type="file" accept="image/*" capture="environment" aria-label="Choose or take a profile photo">
            </label>
            <button class="primary profile-save" type="submit">Save</button>
          </form>
        </div>
      </article>
    </section>
  `;

  const form = el.querySelector("[data-profile-form]");
  if (form) {
    const key = ownProfileKey;
    const photoInput = form.elements.photo;
    const preview = $(`[data-preview="${key}"]`, el);
    let selectedPhoto = null;

    $(".profile-back", el).onclick = () => window.App?.navigate("more");
    photoInput.onchange = () => {
      selectedPhoto = photoInput.files[0] || null;
      if (!selectedPhoto) return;
      const reader = new FileReader();
      reader.onload = () => {
        preview.replaceChildren();
        const image = new Image();
        image.alt = `${form.elements.name.value} profile preview`;
        image.src = reader.result;
        preview.append(image);
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
          avatar: person.avatar || "",
          driveFileId: person.driveFileId || "",
          authUid: person.authUid || (key === ownProfileKey ? user.uid : ""),
          previousNames
        };

        if (selectedPhoto) {
          const uploaded = await uploadProfilePhoto(selectedPhoto, name);
          savedProfile.avatar = uploaded.avatar;
          savedProfile.driveFileId = uploaded.driveFileId;
        }

        await saveCoupleProfile(key, savedProfile);
        applyCoupleProfiles({ [key]: savedProfile });
        selectedPhoto = null;
        photoInput.value = "";
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
    const currentForm = el.querySelector("[data-profile-form]");
    if (!updated || !currentForm) return;
    currentForm.elements.name.value = updated.name;
    currentForm.elements.bio.value = updated.bio || "";
    const currentPreview = $(`[data-preview="${ownProfileKey}"]`, el);
    currentPreview.replaceChildren();
    if (updated.avatar) {
      const image = new Image();
      image.src = updated.avatar;
      image.alt = `${updated.name} profile`;
      currentPreview.append(image);
    } else {
      currentPreview.textContent = updated.name[0] || "♡";
    }
  };
  el.addEventListener("couple-profile-settings-changed", el.onProfileSettingsChanged);
}
