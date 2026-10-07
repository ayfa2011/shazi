import {$,esc} from "./utils.js";
import {logout} from "./auth.js";
import {renderProfile} from "./profile.js";
export function renderMore(el,user,profile){
 el.innerHTML=`<div class="grid"><button class="card" id="profile-card"><h3>Profile</h3><p class="muted">Your private profile.</p></button><button class="card" id="logout-card"><h3>Log out</h3><p class="muted">Leave our little world.</p></button></div><div id="more-detail"></div>`;
 $("#profile-card",el).onclick=()=>renderProfile($("#more-detail"),user,profile);
 $("#logout-card",el).onclick=()=>logout();
}
