export const $ = (s,root=document)=>root.querySelector(s);
export const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
export const esc = (v="")=>String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
export const uid = ()=>crypto.randomUUID();
export function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2400)}
export function todayKey(){return new Date().toISOString().slice(0,10)}
export function modal(title,body,actions=""){return `<div class="modal"><div class="modal-card"><div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close>×</button></div>${body}${actions}</div></div>`}
