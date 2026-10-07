import {$,esc,toast,todayKey,dailyIndex} from "./utils.js";
import {watchItems,addItem} from "./firestore.js";
import {APP_CONFIG} from "../config/app-config.js";
let stopAnswers=null,active=false;
export function renderQuestions(el,user,profile){
 stopAnswers?.();active=true;
 const date=todayKey(),q=APP_CONFIG.dailyQuestions[dailyIndex(APP_CONFIG.dailyQuestions.length)];
 el.innerHTML=`<div class="card"><p class="eyebrow">TODAY'S QUESTION</p><h3>${esc(q)}</h3><textarea id="answer" rows="5" placeholder="Write your answer…"></textarea><button id="save-answer" class="primary">Save answer</button></div><div class="section-head"><h3>Our answers</h3></div><div id="answers" class="list"></div>`;
 $("#save-answer",el).onclick=async()=>{const a=$("#answer").value.trim();if(!a)return;await addItem("answer",{question:q,questionDate:date,answer:a,author:user.uid,authorName:profile.name,date:new Date().toISOString()});$("#answer").value="";toast("Answer saved ♡")};
 stopAnswers=watchItems("answer",items=>{if(!active||!el.isConnected)return;$("#answers",el).innerHTML=items.filter(x=>x.questionDate===date).map(x=>`<div class="item"><div><strong>${esc(x.authorName)}</strong><p>${esc(x.answer)}</p></div></div>`).join("")||`<p class="muted">No answers for today's question yet.</p>`});
}
export function disposeQuestions(){active=false;stopAnswers?.();stopAnswers=null}
