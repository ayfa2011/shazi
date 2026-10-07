import {$} from "./utils.js";
import {renderQuestions} from "./questions.js";
import {renderChallenges} from "./challenges.js";
import {renderGames} from "./games.js";
import {renderDrawing} from "./drawing.js";
import {renderLetters} from "./letters.js";
export function renderActivities(el,user,profile){
 el.innerHTML=`<div class="grid">
 <button class="card" data-a="questions"><h3>Daily Questions</h3><p class="muted">Ask, answer & discover.</p></button>
 <button class="card" data-a="challenges"><h3>Challenges</h3><p class="muted">Little things to do together.</p></button>
 <button class="card" data-a="games"><h3>Mini Games</h3><p class="muted">Play something silly.</p></button>
 <button class="card" data-a="drawing"><h3>Live Drawing</h3><p class="muted">Draw together online.</p></button>
 <button class="card" data-a="letters"><h3>Letters</h3><p class="muted">Write something from the heart.</p></button>
 </div><div id="activity-detail"></div>`;
 const map={questions:renderQuestions,challenges:renderChallenges,games:renderGames,drawing:renderDrawing,letters:renderLetters};
 el.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>map[b.dataset.a]($("#activity-detail"),user,profile));
}
