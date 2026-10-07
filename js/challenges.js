import {$,esc,toast,dailyIndex,todayKey} from "./utils.js";
import {watchItems,addItem,setItem} from "./firestore.js";
import {APP_CONFIG} from "../config/app-config.js";
export function renderChallenges(el,user,profile){
 const date=todayKey(),c=APP_CONFIG.starterChallenges[dailyIndex(APP_CONFIG.starterChallenges.length)];
 el.innerHTML=`<div class="card"><p class="eyebrow">TODAY'S CHALLENGE</p><h3>${esc(c)}</h3><button id="complete-challenge" class="primary">Mark complete ♡</button></div><div class="section-head"><h3>Challenge history</h3></div><div id="challenge-list" class="list"></div>`;
 $("#complete-challenge",el).onclick=async()=>{await addItem("challenge",{title:c,done:true,author:user.uid,challengeDate:date,date:new Date().toISOString()});toast("Challenge completed ♡")};
 watchItems("challenge",items=>$("#challenge-list").innerHTML=items.map(x=>`<div class="item"><span>${esc(x.title)}</span><span class="tag">Completed</span></div>`).join(""));
}
