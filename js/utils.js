export const $ = (s,root=document)=>root.querySelector(s);
export const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
export const esc = (v="")=>String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
export const uid = ()=>crypto.randomUUID();
export function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2400)}
export function todayKey(date=new Date()){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dubai",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);return `${parts.find(x=>x.type==="year").value}-${parts.find(x=>x.type==="month").value}-${parts.find(x=>x.type==="day").value}`}
export function dailyIndex(length,date=new Date()){if(!length)return 0;const day=Date.parse(`${todayKey(date)}T00:00:00Z`)/86400000;return Math.floor(day)%length}
export function modal(title,body,actions=""){return `<div class="modal"><div class="modal-card"><div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close>×</button></div>${body}${actions}</div></div>`}
