import {$,esc} from "./utils.js";
export function renderProfile(el,user,profile){
 el.innerHTML=`<div class="card"><p class="eyebrow">OUR PROFILE</p><h3>${esc(profile.name)}</h3><p class="muted">${esc(user.email)}</p><div class="tag">Private member</div></div>`;
}
