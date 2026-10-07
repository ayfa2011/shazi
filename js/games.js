import {$,toast} from "./utils.js";
import {addItem} from "./firestore.js";
export function renderGames(el,user){
 let target=0,finished=false;
 el.innerHTML=`<div class="card"><p class="eyebrow">MINI GAME</p><h3>Find the heart ♡</h3><p class="muted">Tap a square. Can you find today's hidden heart?</p><div id="game-board" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"></div><p id="game-result"></p><button id="play-again" class="secondary hidden" type="button">Play again ♡</button></div>`;
 const board=$("#game-board",el),again=$("#play-again",el);
 function startRound(){target=Math.floor(Math.random()*9);finished=false;$("#game-result",el).textContent="";again.classList.add("hidden");board.replaceChildren();for(let i=0;i<9;i++){const button=document.createElement("button");button.className="secondary";button.style.aspectRatio="1";button.textContent="♡";button.onclick=async()=>{if(finished)return;if(i===target){finished=true;button.textContent="♥";$("#game-result",el).textContent="You found it! ♡";again.classList.remove("hidden");toast("Winner!");try{await addItem("game",{game:"Find the heart",result:"won",author:user.uid})}catch{toast("Your win could not be saved.")}}else{button.disabled=true;button.textContent="·";$("#game-result",el).textContent="Not there — try again."}};board.append(button)}}
 again.onclick=startRound;startRound();
}
