import {initAuth,logout} from "./auth.js";
import {$,$$,esc} from "./utils.js";
import {renderHome,disposeHome} from "./dashboard.js";
import {renderMemories} from "./memories.js";
import {renderBucket} from "./bucket-list.js";
import {renderActivities} from "./activities.js";
import {renderMore} from "./more.js";
import {renderDrawing,disposeDrawing} from "./drawing.js";
import {initMusic} from "./music.js";
import {firebaseReady} from "./firebase.js";

let currentUser=null,currentProfile=null;
const routes={home:renderHome,memories:renderMemories,bucket:renderBucket,activities:renderActivities,more:renderMore,drawing:renderDrawing};
window.App={navigate};
function navigate(route="home"){if(route!=="home")disposeHome();if(route!=="drawing")disposeDrawing();document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.route===route));$("#page-title").textContent=({home:"Keby & Shazy",memories:"Memories",bucket:"Dreams",activities:"Activities",more:"More",drawing:"Our Drawing Canvas"})[route]||"Dashboard";routes[route]?.($("#main-content"),currentUser,currentProfile)}
initAuth((user,profile)=>{
  currentUser=user;currentProfile=profile;$("#auth-view").classList.add("hidden");$("#app-view").classList.remove("hidden");$("#avatar-letter").textContent=profile.emoji||"♡";navigate("home");if(firebaseReady)initMusic();
},()=>{disposeHome();disposeDrawing();$("#app-view").classList.add("hidden");$("#auth-view").classList.remove("hidden")});
$$(".bottom-nav button").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.route)));
$("#profile-btn").addEventListener("click",()=>navigate("more"));
$("#music-toggle").addEventListener("click",()=>$("#music-drawer").classList.toggle("hidden"));
$("#music-close").addEventListener("click",()=>$("#music-drawer").classList.add("hidden"));
