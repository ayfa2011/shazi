import {$,esc,toast} from "./utils.js";
import {watchItems,addItem} from "./firestore.js";
import {APP_CONFIG} from "../config/app-config.js";
export function renderQuestions(el,user,profile){
 const q=APP_CONFIG.dailyQuestions[new Date().getDate()%APP_CONFIG.dailyQuestions.length];
 el.innerHTML=`<div class="card"><p class="eyebrow">TODAY'S QUESTION</p><h3>${esc(q)}</h3><textarea id="answer" rows="5" placeholder="Write your answer…"></textarea><button id="save-answer" class="primary">Save answer</button></div><div class="section-head"><h3>Our answers</h3></div><div id="answers" class="list"></div>`;
 $("#save-answer",el).onclick=async()=>{const a=$("#answer").value.trim();if(!a)return;await addItem("answer",{question:q,answer:a,author:user.uid,authorName:profile.name,date:new Date().toISOString()});$("#answer").value="";toast("Answer saved ♡")};
 watchItems("answer",items=>$("#answers").innerHTML=items.filter(x=>x.question===q).map(x=>`<div class="item"><div><strong>${esc(x.authorName)}</strong><p>${esc(x.answer)}</p></div></div>`).join(""));
}
