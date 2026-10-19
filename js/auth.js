import { auth, firebaseReady, authPersistenceReady } from "./firebase.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { APP_CONFIG } from "../config/app-config.js";
import { $, toastError } from "./utils.js";

export function initAuth(onLogin,onLogout){
  const loginForm = $("#login-form");
  const profileInput = $("#login-user");
  const passwordInput = $("#login-password");
  const passwordLabel = $("#login-password-label");
  const submitButton = $("#login-submit");
  const profileButtons = [...document.querySelectorAll(".login-profile-option")];
  profileButtons.forEach(button => button.addEventListener("click", () => {
    const profileKey = button.dataset.profile;
    if (!APP_CONFIG.profiles[profileKey]) return;
    profileInput.value = profileKey;
    profileButtons.forEach(option => option.setAttribute("aria-pressed", String(option === button)));
    passwordLabel.classList.remove("hidden");
    passwordInput.disabled = false;
    passwordInput.required = true;
    submitButton.classList.remove("hidden");
    submitButton.disabled = false;
    passwordInput.focus();
  }));
  loginForm.addEventListener("submit",async e=>{
    e.preventDefault(); $("#auth-error").textContent="";
    const profile=APP_CONFIG.profiles[profileInput.value];
    if(!profile){$("#auth-error").textContent="Choose your profile photo to continue.";return}
    if(!passwordInput.value){passwordInput.focus();$("#auth-error").textContent="Enter your password to continue.";return}
    if(!profile.email){$("#auth-error").textContent="No Firebase account is linked to this name yet.";return}
    if(!firebaseReady){$("#auth-error").textContent="Firebase is not connected yet. Add your Firebase web config first.";return}
    try{submitButton.disabled=true;await authPersistenceReady;await signInWithEmailAndPassword(auth,profile.email,passwordInput.value)}
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
    if(user) onLogin(user,getProfile(user.email)); else onLogout();
  })).catch(error=>{console.error("Firebase Auth persistence initialization failed:",error);$("#auth-error").textContent="Sign-in storage is unavailable in this browser. Check browser storage settings and try again.";});
}
export function logout(){return signOut(auth)}
export function getProfile(email){
  const p=Object.values(APP_CONFIG.profiles).find(x=>x.email.toLowerCase()===email?.toLowerCase());
  return p || {id:email,name:"Our Love",emoji:"♡"};
}
