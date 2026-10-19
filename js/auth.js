import { auth, firebaseReady, authPersistenceReady } from "./firebase.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { APP_CONFIG } from "../config/app-config.js";
import { getCachedTelegramMediaPreview } from "../src/services/telegramService.js";
import { $, toastError } from "./utils.js";

export function initAuth(onLogin,onLogout){
  const loginForm = $("#login-form");
  const profileInput = $("#login-user");
  const emailInput = $("#login-email");
  const passwordInput = $("#login-password");
  const passwordLabel = $("#login-password-label");
  const submitButton = $("#login-submit");
  const profileButtons = [...document.querySelectorAll(".login-profile-option")];
  sessionStorage.removeItem("olw-explicit-login");
  try {
    const saved = JSON.parse(localStorage.getItem("olw-login-profiles") || "{}");
    for (const [key, fields] of Object.entries(saved)) {
      if (APP_CONFIG.profiles[key] && fields && typeof fields === "object") Object.assign(APP_CONFIG.profiles[key], fields);
    }
  } catch { /* Ignore an incomplete local profile cache. */ }
  const renderLoginProfiles = () => {
    const saved = {};
    profileButtons.forEach(button => {
      const key = button.dataset.profile;
      const person = APP_CONFIG.profiles[key];
      const image = button.querySelector("[data-login-profile-image]");
      const fallback = button.querySelector("[data-login-profile-fallback]");
      const name = button.querySelector("span:last-child");
      if (person) saved[key] = {
        name: person.name || "",
        avatar: person.avatar?.startsWith("blob:") ? "" : (person.avatar || ""),
        avatarPreviewDataUrl: person.avatarPreviewFileId === person.avatarTelegramFileId ? (person.avatarPreviewDataUrl || "") : "",
        avatarPreviewFileId: person.avatarPreviewFileId === person.avatarTelegramFileId ? (person.avatarPreviewFileId || "") : "",
        avatarTelegramFileId: person.avatarTelegramFileId || "",
        avatarMimeType: person.avatarMimeType || "image/jpeg"
      };
      const displayPhoto = (person?.avatarPreviewFileId === person?.avatarTelegramFileId ? person.avatarPreviewDataUrl : "") || (person?.avatar && !person.avatar.startsWith("blob:") ? person.avatar : "");
      if (fallback) fallback.textContent = (person?.name || key).slice(0, 1).toUpperCase();
      if (image) {
        image.fetchPriority = "high";
        image.classList.toggle("is-loaded", Boolean(displayPhoto));
        image.onerror = () => { image.classList.remove("is-loaded"); image.removeAttribute("src"); };
        image.onload = () => image.classList.add("is-loaded");
        if (displayPhoto && image.src !== displayPhoto) image.src = displayPhoto;
        else if (!displayPhoto) image.removeAttribute("src");
      }
      if (name) name.textContent = person?.name || key;
      if (image && person?.avatarTelegramFileId && !person.avatarPreviewDataUrl && !image.dataset.hydrating) {
        const fileId = person.avatarTelegramFileId;
        image.dataset.hydrating = fileId;
        void getCachedTelegramMediaPreview(fileId, person.avatarMimeType || "image/jpeg")
          .then(preview => {
            if (!preview || !image.isConnected || APP_CONFIG.profiles[key]?.avatarTelegramFileId !== fileId) return;
            person.avatarPreviewDataUrl = preview;
            person.avatarPreviewFileId = fileId;
            image.src = preview;
            try {
              const current = JSON.parse(localStorage.getItem("olw-login-profiles") || "{}");
              current[key] = { ...(current[key] || {}), name: person.name || "", avatarPreviewDataUrl: preview, avatarPreviewFileId: fileId, avatarTelegramFileId: fileId, avatarMimeType: person.avatarMimeType || "image/jpeg" };
              localStorage.setItem("olw-login-profiles", JSON.stringify(current));
            } catch { /* Private browsing or full storage: the in-memory preview still works. */ }
          })
          .catch(() => {})
          .finally(() => { if (image.dataset.hydrating === fileId) delete image.dataset.hydrating; });
      }
    });
    try { localStorage.setItem("olw-login-profiles", JSON.stringify(saved)); } catch { /* Best effort profile-photo cache. */ }
  };
  renderLoginProfiles();
  window.addEventListener("couple-profiles-updated", renderLoginProfiles);
  profileButtons.forEach(button => button.addEventListener("click", () => {
    const profileKey = button.dataset.profile;
    if (!APP_CONFIG.profiles[profileKey]) return;
    profileInput.value = profileKey;
    emailInput.value = APP_CONFIG.profiles[profileKey].email || "";
    passwordInput.value = "";
    profileButtons.forEach(option => option.setAttribute("aria-pressed", String(option === button)));
    passwordLabel.classList.add("hidden");
    passwordInput.disabled = true;
    passwordInput.required = false;
    submitButton.classList.add("hidden");
    submitButton.disabled = true;
    $("#auth-error").textContent = "";
    if (!firebaseReady) { $("#auth-error").textContent = "Firebase is not connected yet."; return; }
    button.disabled = true;
    passwordLabel.classList.remove("hidden");
    passwordInput.disabled = false;
    passwordInput.required = true;
    submitButton.classList.remove("hidden");
    submitButton.disabled = false;
    passwordInput.focus();
    button.disabled = false;
    // If the browser password manager has saved credentials, an explicit
    // profile tap may use its autofill. The app itself never stores passwords.
    setTimeout(() => {
      if (profileInput.value === profileKey && passwordInput.value) loginForm.requestSubmit();
    }, 250);
  }));
  loginForm.addEventListener("submit",async e=>{
    e.preventDefault(); $("#auth-error").textContent="";
    const profile=APP_CONFIG.profiles[profileInput.value];
    if(!profile){$("#auth-error").textContent="Choose your profile photo to continue.";return}
    if(!passwordInput.value){passwordInput.focus();$("#auth-error").textContent="Enter your password to continue.";return}
    if(!profile.email){$("#auth-error").textContent="No Firebase account is linked to this name yet.";return}
    if(!firebaseReady){$("#auth-error").textContent="Firebase is not connected yet. Add your Firebase web config first.";return}
    try{submitButton.disabled=true;await authPersistenceReady;await signInWithEmailAndPassword(auth,profile.email,passwordInput.value);sessionStorage.setItem("olw-explicit-login", "1")}
    catch(err){
      const messages={
        "auth/invalid-credential":"The Firebase email or password does not match. Check the password saved for this account in Firebase Authentication.",
        "auth/user-not-found":"No Firebase account is linked to this name.",
        "auth/wrong-password":"That password is incorrect.",
        "auth/unauthorized-domain":"This website address is not authorized in Firebase Authentication. Add the site domain in Firebase Console > Authentication > Settings > Authorized domains.",
        "auth/operation-not-allowed":"Email/Password sign-in is disabled in Firebase Authentication.",
        "auth/network-request-failed":"Could not reach Firebase. Check your internet connection and try again."
      };
      toastError(messages[err.code]||`Login failed (${err.code||"unknown error"}). Check Firebase Authentication settings.`);
    } finally { submitButton.disabled = false; }
      });
  if(firebaseReady) authPersistenceReady.then(()=>onAuthStateChanged(auth,user=>{
    if (!user) {
      onLogout();
      return;
    }
    if (!sessionStorage.getItem("olw-explicit-login")) {
      void signOut(auth);
      onLogout();
      return;
    }
    onLogin(user,getProfile(user.email));
  })).catch(error=>{console.error("Firebase Auth persistence initialization failed:",error);$("#auth-error").textContent="Sign-in storage is unavailable in this browser. Check browser storage settings and try again.";});
}
export function logout(){sessionStorage.removeItem("olw-explicit-login");return signOut(auth)}
export function getProfile(email){
  const p=Object.values(APP_CONFIG.profiles).find(x=>x.email.toLowerCase()===email?.toLowerCase());
  return p || {id:email,name:"Our Love",emoji:"♡"};
}
