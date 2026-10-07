import { auth, firebaseReady } from "./firebase.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { APP_CONFIG } from "../config/app-config.js";
import {$} from "./utils.js";

export function initAuth(onLogin,onLogout){
  $("#login-form").addEventListener("submit",async e=>{
    e.preventDefault(); $("#auth-error").textContent="";
    const profile=APP_CONFIG.profiles[$("#login-user").value];
    if(!profile){$("#auth-error").textContent="Choose your name to continue.";return}
    if(!profile.email){$("#auth-error").textContent="No Firebase account is linked to this name yet.";return}
    if(!firebaseReady){$("#auth-error").textContent="Firebase is not connected yet. Add your Firebase web config first.";return}
    try{await signInWithEmailAndPassword(auth,profile.email,$("#login-password").value)}
    catch(err){
      const messages={
        "auth/invalid-credential":"The Firebase email or password does not match. Check the password saved for this account in Firebase Authentication.",
        "auth/user-not-found":"No Firebase account is linked to this name.",
        "auth/wrong-password":"That password is incorrect.",
        "auth/unauthorized-domain":"This website address is not authorized in Firebase Authentication. Add the site domain in Firebase Console > Authentication > Settings > Authorized domains.",
        "auth/operation-not-allowed":"Email/Password sign-in is disabled in Firebase Authentication.",
        "auth/network-request-failed":"Could not reach Firebase. Check your internet connection and try again."
      };
      $("#auth-error").textContent=messages[err.code]||`Login failed (${err.code||"unknown error"}). Check Firebase Authentication settings.`;
    }
  });
  if(firebaseReady) onAuthStateChanged(auth,user=>{
    if(user) onLogin(user,getProfile(user.email)); else onLogout();
  });
}
export function logout(){return signOut(auth)}
export function getProfile(email){
  const p=Object.values(APP_CONFIG.profiles).find(x=>x.email.toLowerCase()===email?.toLowerCase());
  return p || {id:email,name:"Our Love",emoji:"♡"};
}
