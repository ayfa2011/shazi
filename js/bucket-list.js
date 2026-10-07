import {$,esc,toast} from "./utils.js";
import {watchItems,addItem,setItem} from "./firestore.js";
export function renderBucket(el,user,profile){
 el.innerHTML=`<div class="section-head"><div><p class="eyebrow">OUR FUTURE</p><h3>Bucket List</h3></div><button id="add-bucket" class="primary">+ Dream</button></div><div id="bucket-list" class="list"></div>`;
 $("#add-bucket",el).onclick=async()=>{const title=prompt("What should we do together?");if(title) await addItem("bucket",{title,done:false,author:user.uid})};
 watchItems("bucket",items=>{$("#bucket-list").innerHTML=items.map(x=>`<div class="item ${x.done?"done":""}"><label style="display:flex;align-items:center;gap:10px"><input type="checkbox" ${x.done?"checked":""} data-id="${x.id}"><span>${esc(x.title)}</span></label><span class="tag">${x.done?"Done":"Dream"}</span></div>`).join("")||`<div class="card"><p class="muted">Add your first little dream.</p></div>`;el.querySelectorAll("[data-id]").forEach(c=>c.onchange=()=>setItem(c.dataset.id,{done:c.checked}).then(()=>toast(c.checked?"Dream completed ♡":"Moved back to dreams")) )});
}
