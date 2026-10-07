import {$,esc,modal,uid,toast} from "./utils.js";
import {watchItems,addItem} from "./firestore.js";
import {storage} from "./firebase.js";
import {ref,uploadBytes,getDownloadURL} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";
let stopMemories=null,active=false;
export function renderMemories(el,user,profile){
 stopMemories?.();active=true;
 el.innerHTML=`<div class="section-head"><div><p class="eyebrow">OUR STORY</p><h3>Memories</h3></div><button id="add-memory" class="primary">+ Add</button></div><div id="memory-grid" class="photo-grid"></div><div id="memory-list" class="list"></div>`;
 $("#add-memory",el).onclick=()=>openMemoryModal(el,user);
 stopMemories=watchItems("memory",items=>{
  if(!active||!el.isConnected)return;
  $("#memory-grid",el).innerHTML=items.filter(x=>x.photoUrl).map(x=>`<img src="${esc(x.photoUrl)}" alt="${esc(x.title)}">`).join("");
  $("#memory-list",el).innerHTML=items.map(x=>`<div class="item"><div><strong>${esc(x.title||"Untitled memory")}</strong><div class="muted">${esc(x.date||"")}</div></div><span class="tag">${esc(x.place||"Memory")}</span></div>`).join("")||`<div class="card"><p class="muted">No memories yet.</p></div>`;
 });
}
export function disposeMemories(){active=false;stopMemories?.();stopMemories=null}
function openMemoryModal(el,user){
 const root=$("#modal-root");root.innerHTML=modal("Add a memory",`<form id="memory-form"><label>Title<input name="title" required placeholder="Our first adventure"></label><label>Date<input name="date" type="date"></label><label>Place<input name="place" placeholder="Where it happened"></label><label>Photo<input name="photo" type="file" accept="image/*"></label><label>Note<textarea name="note" rows="4" placeholder="What do you remember?"></textarea></label><button class="primary" type="submit">Save memory ♡</button></form>`);
 $("[data-close]",root).onclick=()=>root.innerHTML="";
 $("#memory-form",root).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),save=e.target.querySelector('[type="submit"]');save.disabled=true;save.textContent="Saving…";let photoUrl="",photoError="";const file=f.get("photo");if(file?.size){try{if(!storage)throw new Error("Firebase Storage is unavailable.");const r=ref(storage,`couples/our-little-world/memories/${uid()}-${file.name}`);await uploadBytes(r,file);photoUrl=await getDownloadURL(r)}catch(error){photoError=error.message||"Photo upload failed."}}try{await addItem("memory",{title:f.get("title"),date:f.get("date"),place:f.get("place"),note:f.get("note"),photoUrl,photoName:file?.name||"",photoUploadError:photoError,author:user.uid});toast(photoError?"Memory saved; its photo could not be uploaded. ♡":"Memory saved ♡");root.innerHTML=""}catch(error){save.disabled=false;save.textContent="Save memory ♡";toast(error.message||"Could not save memory.")}};
}
