import {$,esc,toast} from "./utils.js";
import {addItem} from "./firestore.js";
export function renderGames(el,user,profile){
 let target=Math.floor(Math.random()*9);let board=Array(9).fill("");
 el.innerHTML=`<div class="card"><p class="eyebrow">MINI GAME</p><h3>Find the heart ♡</h3><p class="muted">Tap a square. Can you find today's hidden heart?</p><div id="game-board" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"></div><p id="game-result"></p></div>`;
 const b=$("#game-board",el);board.forEach((_,i)=>{const btn=document.createElement("button");btn.className="secondary";btn.style.aspectRatio="1";btn.textContent="♡";btn.onclick=async()=>{if(i===target){$("#game-result").textContent="You found it! ♡";toast("Winner!");await addItem("game",{game:"Find the heart",result:"won",author:user.uid})}else{$("#game-result").textContent="Not there — try again.";btn.textContent="·"}};b.append(btn)});
}
