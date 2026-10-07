import {$,esc,toast} from "./utils.js";
import {watchItems,addItem} from "./firestore.js";
export function renderLetters(el,user,profile){
 el.innerHTML=`<div class="section-head"><div><p class="eyebrow">FROM THE HEART</p><h3>Letters</h3></div><button id="write-letter" class="primary">+ Write</button></div><div id="letters" class="list"></div>`;
 $("#write-letter",el).onclick=()=>{const root=$("#modal-root");root.innerHTML=`<div class="modal"><div class="modal-card"><div class="modal-head"><h3>A letter for you ♡</h3><button class="icon-btn" data-close>×</button></div><form id="letter-form"><input name="title" placeholder="Title" required><textarea name="body" rows="10" placeholder="Write from your heart…" required></textarea><button class="primary">Save letter</button></form></div></div>`;$("[data-close]",root).onclick=()=>root.innerHTML="";$("#letter-form",root).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await addItem("letter",{title:f.get("title"),body:f.get("body"),author:user.uid,authorName:profile.name,date:new Date().toISOString()});root.innerHTML="";toast("Letter saved ♡")}};
 watchItems("letter",items=>$("#letters").innerHTML=items.map(x=>`<div class="item"><div><strong>${esc(x.title)}</strong><p class="muted">From ${esc(x.authorName||"us")}</p></div><button class="secondary" data-letter="${x.id}">Read</button></div>`).join(""));
}
