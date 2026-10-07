import { $, toast } from "./utils.js";
import { addItem, watchItems } from "./firestore.js";

function getDailySeed() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash << 5) - hash + dateStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 9;
}

let stopGames = null;

export function renderGames(el, user) {
  stopGames?.();
  const dailyTarget = getDailySeed();
  let finished = false;

  el.innerHTML = `
    <style>
      .game-card { background: #ffffff; border-radius: 20px; padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); font-family: system-ui, -apple-system, sans-serif; max-width: 500px; margin: 0 auto; }
      .game-board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0; }
      .game-square { aspect-ratio: 1; border-radius: 12px; border: 1px solid #fecdd3; background: #fff1f2; color: #e11d48; font-size: 20px; font-weight: bold; cursor: pointer; transition: all 0.2s ease; }
      .game-square:disabled { background: #f1f5f9; border-color: #e2e8f0; color: #94a3b8; cursor: not-allowed; }
      .game-square.found { background: #f43f5e; color: #ffffff; border-color: #e11d48; }
      .score-history { margin-top: 20px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
      .score-item { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; color: #475569; border-bottom: 1px dashed #f1f5f9; }
    </style>

    <div class="game-card">
      <p class="eyebrow" style="color: #e11d48; font-size: 11px; font-weight: 700; letter-spacing: 1px; margin: 0;">DAILY MINI GAME</p>
      <h3 style="margin: 4px 0; color: #881337;">Today's Hidden Heart ♡</h3>
      <p style="color: #64748b; font-size: 13px; margin-bottom: 16px;">Find today's hidden heart! The location updates once every 24 hours.</p>
      
      <div id="game-board" class="game-board"></div>
      <p id="game-result" style="font-weight: 600; text-align: center; color: #e11d48; min-height: 24px;"></p>
      
      <div class="score-history">
        <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 14px;">Recent Game Wins 🏆</h4>
        <div id="game-scores-list"><p style="color:#94a3b8; font-size:12px;">Loading wins...</p></div>
      </div>
    </div>
  `;

  const board = $("#game-board", el);
  const resultText = $("#game-result", el);

  function buildBoard() {
    board.replaceChildren();
    for (let i = 0; i < 9; i++) {
      const btn = document.createElement("button");
      btn.className = "game-square";
      btn.textContent = "♡";

      btn.onclick = async () => {
        if (finished) return;

        if (i === dailyTarget) {
          finished = true;
          btn.textContent = "♥";
          btn.classList.add("found");
          resultText.textContent = "🎉 You found today's hidden heart! ♡";
          toast("Congratulations! Daily heart found! ♡");
          
          try {
            await addItem("game", {
              game: "Today's Hidden Heart",
              result: "won",
              author: user.uid,
              createdAt: new Date().toISOString()
            });
          } catch (err) {
            console.error("Failed to save score:", err);
            toast("Could not save score history.");
          }
        } else {
          btn.disabled = true;
          btn.textContent = "·";
          resultText.textContent = "Not there — try another tile!";
        }
      };
      board.append(btn);
    }
  }

  buildBoard();

  stopGames = watchItems("game", (items) => {
    const listEl = $("#game-scores-list", el);
    if (!listEl) return;

    if (!items || items.length === 0) {
      listEl.innerHTML = `<p style="color:#94a3b8; font-size:12px;">No wins recorded yet.</p>`;
      return;
    }

    const wins = items.filter((x) => x.result === "won").slice(0, 5);
    if (wins.length === 0) {
      listEl.innerHTML = `<p style="color:#94a3b8; font-size:12px;">No wins recorded yet.</p>`;
      return;
    }

    listEl.innerHTML = wins
      .map((w) => {
        const d = w.createdAt
          ? new Date(w.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short"
            })
          : "Today";
        return `
        <div class="score-item">
          <span>🎯 Found Daily Heart</span>
          <span style="font-weight:600; color:#e11d48;">${d}</span>
        </div>
      `;
      })
      .join("");
  });
}

export function disposeGames() {
  stopGames?.();
  stopGames = null;
}