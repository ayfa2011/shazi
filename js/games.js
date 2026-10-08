import { $, toast, todayKey, dailyIndex, esc } from "./utils.js";
import { recordDailyGameWin, watchItems } from "./firestore.js";
import { rtdb } from "./firebase.js";
import { getDisplayName } from "./profile-data.js";
import { onValue, ref, runTransaction } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const ticTacToeRef = () => ref(rtdb, "couples/our-little-world/games/ticTacToe");
const symbols = ["🌸", "🌙", "🍓", "🐻", "💌", "🦋"];
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const challenges = [
  "Choose today's movie.",
  "Give each other a ten-second hug.",
  "Make your partner a little snack.",
  "Take a silly selfie together.",
  "Pick a song and have a tiny dance party.",
  "Tell each other one thing you appreciate.",
  "Plan your next little date.",
  "Let your partner choose your dessert."
];
const emojiQuestions = [
  { emojis: "🌙 ✈️ ❤️", options: ["Love you to the moon and back", "A romantic trip at night", "Our first holiday"], answer: 0 },
  { emojis: "🐝 💛 🐝", options: ["Busy day ahead", "You are my honey", "A picnic in the garden"], answer: 1 },
  { emojis: "☕ 🌧️ 🫂", options: ["Rainy-day cuddles and coffee", "Let's go for a swim", "Coffee spilled in the rain"], answer: 0 },
  { emojis: "🍿 🎬 🛋️", options: ["Movie night at home", "A trip to the cinema", "The sofa needs popcorn"], answer: 0 },
  { emojis: "🌹 💌 💋", options: ["A love note and a kiss", "A flower delivery", "A secret admirer"], answer: 0 },
  { emojis: "🍓 🍫 😋", options: ["A sweet treat to share", "Strawberry shopping", "Chocolate for breakfast"], answer: 0 }
];
const triviaQuestions = [
  { prompt: "Who made the first move?", options: ["Keby", "Shazy", "Both of us", "Still debating"] },
  { prompt: "Who is more likely to fall asleep during a movie?", options: ["Keby", "Shazy", "Both of us", "Neither of us"] },
  { prompt: "Who takes longer to get ready?", options: ["Keby", "Shazy", "About the same", "It depends on the plans"] },
  { prompt: "Who is more likely to suggest a spontaneous date?", options: ["Keby", "Shazy", "Both of us", "Neither of us"] },
  { prompt: "Which kind of date sounds best right now?", options: ["A cozy movie night", "A yummy dinner out", "A little adventure", "A quiet day together"] },
  { prompt: "Who gives the best hugs?", options: ["Keby", "Shazy", "It's a tie", "We need a rematch"] }
];
const winningLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

let stopGames = null;
let stopTicTacToe = null;
let memoryTimer = null;

function getDailySeed() {
  return dailyIndex(9);
}

function gameCard(id, emoji, title, description, label = "") {
  return `<button class="games-hub-card" type="button" data-start-game="${id}">
    <span class="games-card-emoji" aria-hidden="true">${emoji}</span>
    <span class="games-card-copy"><strong>${title}</strong><span>${description}</span></span>
    ${label ? `<span class="games-card-label">${label}</span>` : ""}
    <span class="games-card-arrow" aria-hidden="true">›</span>
  </button>`;
}

function gamesHome() {
  return `<section class="games-page">
    <header class="games-intro">
      <p class="eyebrow">A LITTLE FRIENDLY COMPETITION</p>
      <h1>Our Games <span aria-hidden="true">🎮</span></h1>
      <p class="muted">Pick a game, make a memory, and have fun together.</p>
    </header>
    <div class="games-hub-grid">
      ${gameCard("tic-tac-toe", "⭕", "Tic Tac Toe", "A real-time game for two", "LIVE")}
      ${gameCard("memory-match", "🧠", "Memory Match", "Find all the matching pairs")}
      ${gameCard("word-guess", "🔤", "Word Guess", "Choose a secret word to guess")}
      ${gameCard("emoji-quiz", "🌙", "Emoji Quiz", "Decode a little love in emojis")}
      ${gameCard("spin-wheel", "🎡", "Spin Wheel", "Get a sweet surprise challenge")}
      ${gameCard("couple-trivia", "💞", "Couple Trivia", "See how well you know each other")}
    </div>
    <section class="games-daily">
      <div class="games-daily-heading"><span aria-hidden="true">♡</span><div><p class="eyebrow">DAILY MINI GAME</p><h2>Today's Hidden Heart</h2></div></div>
      <p class="muted">Find today's hidden heart. Its location changes every day.</p>
      <div id="game-board" class="game-board" aria-label="Find the hidden heart"></div>
      <p id="game-result" class="game-result" aria-live="polite"></p>
      <div class="score-history"><h3>Recent Game Wins 🏆</h3><div id="game-scores-list"><p class="muted">Loading wins…</p></div></div>
    </section>
  </section>`;
}

function activeShell(id, title, description, emoji) {
  return `<section class="games-page games-play-page">
    <button class="games-back-button" type="button" data-back-games>← All games</button>
    <header class="games-play-heading"><span class="games-card-emoji" aria-hidden="true">${emoji}</span><div><p class="eyebrow">OUR GAMES</p><h1>${title}</h1><p class="muted">${description}</p></div></header>
    <div id="games-active-content" class="games-active-content" data-active-game="${id}"></div>
  </section>`;
}

function renderActiveGame(el, game, user, profile, state) {
  const content = $("#games-active-content", el);
  if (!content) return;

  if (game === "memory-match") {
    const cards = state.cards.map((symbol, index) => {
      const revealed = state.flipped.includes(index) || state.matched.includes(index);
      return `<button type="button" class="memory-card${state.matched.includes(index) ? " matched" : ""}" data-memory-card="${index}" aria-label="${revealed ? esc(symbol) : "Hidden card"}"${revealed || state.locked ? " disabled" : ""}>${revealed ? esc(symbol) : "♡"}</button>`;
    }).join("");
    content.innerHTML = `<div class="game-panel"><p class="games-instructions">Flip two cards at a time and find every matching pair.</p><div class="memory-board">${cards}</div><p class="game-result" aria-live="polite">${state.matched.length === state.cards.length ? `You found them all in ${state.moves} moves! 🎉` : `${state.matched.length / 2} of ${symbols.length} pairs found · ${state.moves} moves`}</p><button type="button" class="secondary" data-reset-game>Play again</button></div>`;
    return;
  }

  if (game === "word-guess") {
    if (!state.word) {
      content.innerHTML = `<div class="game-panel"><p class="games-instructions">One of you picks a word, then passes the device so your partner can guess it. The word stays hidden after you submit it.</p><form id="word-guess-setup" class="game-form"><label for="word-guess-word">Choose a secret word</label><input id="word-guess-word" type="password" maxlength="32" autocomplete="off" placeholder="At least 3 letters" required><button class="primary" type="submit">Set the secret word</button><p class="game-form-error" aria-live="polite"></p></form></div>`;
      return;
    }
    const visibleWord = [...state.word].map(char => /[a-z]/i.test(char) && !state.guessed.includes(char.toLocaleLowerCase()) ? "_" : char).join(" ");
    const won = [...state.word.toLocaleLowerCase()].every(char => !/[a-z]/.test(char) || state.guessed.includes(char));
    const lost = state.guessesLeft === 0 && !won;
    content.innerHTML = `<div class="game-panel"><p class="games-instructions">Pass the device to your partner, then guess the secret word.</p><div class="word-guess-word" aria-label="Secret word">${visibleWord}</div><p class="game-result" aria-live="polite">${won ? "You guessed it! 🎉" : lost ? `Out of guesses! The word was ${esc(state.word)}.` : `${state.guessesLeft} guesses left`}</p>${won || lost ? `<button type="button" class="primary" data-reset-game>Choose another word</button>` : `<div class="letter-board">${alphabet.map(letter => `<button type="button" data-word-letter="${letter.toLocaleLowerCase()}"${state.guessed.includes(letter.toLocaleLowerCase()) ? " disabled" : ""}>${letter}</button>`).join("")}</div><button type="button" class="secondary word-reset" data-reset-game>Start over</button>`}</div>`;
    return;
  }

  if (game === "emoji-quiz") {
    const question = emojiQuestions[state.question % emojiQuestions.length];
    content.innerHTML = `<div class="game-panel quiz-panel"><p class="games-instructions">What do these emojis mean?</p><div class="emoji-question">${question.emojis}</div><div class="quiz-options">${question.options.map((option, index) => `<button type="button" class="quiz-option${state.answered && index === question.answer ? " correct" : ""}${state.answered && index === state.selected && index !== question.answer ? " incorrect" : ""}" data-emoji-answer="${index}"${state.answered ? " disabled" : ""}>${esc(option)}</button>`).join("")}</div>${state.answered ? `<p class="game-result" aria-live="polite">${state.selected === question.answer ? "That's right! 💖" : "Not quite — love is in the details! 💕"} ${state.score} correct</p><button type="button" class="primary" data-next-emoji>Next question</button>` : ""}</div>`;
    return;
  }

  if (game === "spin-wheel") {
    content.innerHTML = `<div class="game-panel spin-panel"><div class="spin-wheel" aria-hidden="true">🎡</div><p class="games-instructions">Ready for a little surprise?</p><button type="button" class="primary" data-spin-wheel>Spin for a challenge</button>${state.challenge ? `<div class="spin-result" aria-live="polite"><p class="eyebrow">🎉 YOUR CHALLENGE</p><strong>${esc(state.challenge)}</strong><button type="button" class="secondary" data-spin-wheel>Spin again</button></div>` : ""}</div>`;
    return;
  }

  if (game === "couple-trivia") {
    const question = triviaQuestions[state.question % triviaQuestions.length];
    if (state.stage === "guess") {
      content.innerHTML = `<div class="game-panel quiz-panel"><p class="games-instructions">Now pass the device to your partner. Guess what ${esc(state.answerer)} picked!</p><h2 class="trivia-question">${esc(question.prompt)}</h2><div class="quiz-options">${question.options.map((option, index) => `<button type="button" class="quiz-option" data-trivia-guess="${index}">${esc(option)}</button>`).join("")}</div></div>`;
      return;
    }
    if (state.stage === "result") {
      const matched = state.guess === state.answer;
      content.innerHTML = `<div class="game-panel quiz-panel"><p class="eyebrow">THE REVEAL</p><h2 class="trivia-question">${esc(question.prompt)}</h2><p class="trivia-answer">${esc(state.answerer)} picked <strong>${esc(question.options[state.answer])}</strong>.</p><p class="trivia-answer">Their partner guessed <strong>${esc(question.options[state.guess])}</strong>.</p><p class="game-result" aria-live="polite">${matched ? "You know each other so well! 💞" : "The fun is in learning something new! 💗"} Score: ${state.score}</p><button type="button" class="primary" data-next-trivia>Next question</button></div>`;
      return;
    }
    content.innerHTML = `<div class="game-panel quiz-panel"><p class="games-instructions">${state.stage === "first" ? `First, ${esc(getDisplayName(user.uid, profile?.name))} answers honestly. Your partner will guess after you pass the device.` : "Pass the device to your partner to guess your answer."}</p><h2 class="trivia-question">${esc(question.prompt)}</h2><div class="quiz-options">${question.options.map((option, index) => `<button type="button" class="quiz-option" data-trivia-answer="${index}">${esc(option)}</button>`).join("")}</div></div>`;
    return;
  }

  if (game === "tic-tac-toe") renderTicTacToe(content, user, state);
}

function renderTicTacToe(content, user, gameState) {
  const uid = user?.uid;
  const state = gameState || null;
  const cells = Array.isArray(state?.board) && state.board.length === 9 ? state.board : Array(9).fill("");
  const mark = state?.xUid === uid ? "X" : state?.oUid === uid ? "O" : "";
  const isPlaying = state?.status === "playing";
  const waitingForOpponent = state?.status === "waiting" && state.xUid === uid;
  const canJoin = state?.status === "waiting" && state.xUid !== uid && !state.oUid;
  const turnText = !state
    ? "Start a match or join your partner's waiting game."
    : waitingForOpponent
      ? "Waiting for your partner to join…"
      : canJoin
        ? "Your partner is waiting. Join the match!"
        : !mark
          ? "This match is for your partner. Start a new game after it ends."
          : isPlaying
            ? state.turnUid === uid ? "Your turn!" : "Waiting for your partner's move…"
            : state.winnerUid ? (state.winnerUid === uid ? "You won! 🎉" : "Your partner won this round!") : "It's a draw! 🤝";
  const isFinished = state?.status === "finished";

  content.innerHTML = `<div class="game-panel tic-tac-toe-panel">
    <p class="games-instructions">Play live against your partner. Your moves appear on both screens.</p>
    <p class="tic-tac-toe-status" aria-live="polite">${esc(turnText)}</p>
    ${state?.status === "waiting" || isPlaying || isFinished ? `<div class="tic-tac-toe-board" role="grid" aria-label="Tic Tac Toe board">${cells.map((cell, index) => `<button type="button" class="tic-tac-toe-cell${cell ? ` played played-${cell.toLocaleLowerCase()}` : ""}" data-ttt-cell="${index}" aria-label="Row ${Math.floor(index / 3) + 1}, column ${index % 3 + 1}${cell ? `, ${cell}` : ""}"${!isPlaying || state.turnUid !== uid || cell || !mark ? " disabled" : ""}>${esc(cell)}</button>`).join("")}</div>` : ""}
    ${!state || isFinished ? `<button type="button" class="primary" data-ttt-start>${isFinished ? "Start a new match" : "Start a match"}</button>` : canJoin ? `<button type="button" class="primary" data-ttt-start>Join your partner</button>` : ""}
    <p class="tic-tac-toe-legend">${mark ? `You are ${mark} · ${mark === "X" ? "❌" : "⭕"}` : "❌ goes first"}</p>
  </div>`;
}

function makeMemoryState() {
  const deck = [...symbols, ...symbols].map((symbol, index) => ({ symbol, key: `${symbol}-${index}` }));
  for (let index = deck.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[randomIndex]] = [deck[randomIndex], deck[index]];
  }
  return { cards: deck.map(card => card.symbol), flipped: [], matched: [], moves: 0, locked: false };
}

function resetActiveGame(game, state) {
  if (memoryTimer) clearTimeout(memoryTimer);
  memoryTimer = null;
  if (game === "memory-match") return makeMemoryState();
  if (game === "word-guess") return { word: "", guessed: [], guessesLeft: 7 };
  if (game === "emoji-quiz") return { question: 0, answered: false, selected: -1, score: 0 };
  if (game === "spin-wheel") return { challenge: "" };
  if (game === "couple-trivia") return { question: state?.question || 0, stage: "first", answer: -1, guess: -1, answerer: "", score: state?.score || 0 };
  return {};
}

function hasWinningLine(board, mark) {
  return winningLines.some(line => line.every(index => board[index] === mark));
}

export function renderGames(el, user, profile) {
  stopGames?.();
  stopGames = null;
  stopTicTacToe?.();
  stopTicTacToe = null;
  if (memoryTimer) clearTimeout(memoryTimer);
  memoryTimer = null;

  let activeGame = "";
  let activeState = null;
  let ticTacToeState = null;
  let dailyGameItems = null;
  const dailyTarget = getDailySeed();
  let finished = false;

  el.innerHTML = gamesHome();

  function buildDailyBoard() {
    const board = $("#game-board", el);
    if (!board) return;
    board.replaceChildren();
    for (let index = 0; index < 9; index++) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "game-square";
      button.textContent = "♡";
      button.setAttribute("aria-label", `Heart tile ${index + 1}`);
      button.onclick = async () => {
        if (finished) return;
        if (index === dailyTarget) {
          finished = true;
          button.textContent = "♥";
          button.classList.add("found");
          const resultText = $("#game-result", el);
          if (resultText) resultText.textContent = "🎉 You found today's hidden heart! ♡";
          toast("Congratulations! Daily heart found! ♡");
          try {
            const recorded = await recordDailyGameWin(user.uid, todayKey());
            if (!recorded && $("#game-result", el)) $("#game-result", el).textContent = "You already found today's hidden heart ♡";
          } catch (error) {
            console.error("Failed to save score:", error);
            toast("Could not save score history.");
          }
        } else {
          button.disabled = true;
          button.textContent = "·";
          button.setAttribute("aria-label", `Heart tile ${index + 1}, not this one`);
          const resultText = $("#game-result", el);
          if (resultText) resultText.textContent = "Not there — try another tile!";
        }
      };
      board.append(button);
    }
  }

  function renderCurrentGame() {
    if (!activeGame) {
      el.innerHTML = gamesHome();
      buildDailyBoard();
      if (dailyGameItems) renderDailyWins(dailyGameItems);
      listenForDailyWins();
      return;
    }
    const gameInfo = {
      "tic-tac-toe": ["Tic Tac Toe", "Play a live match from two devices.", "⭕"],
      "memory-match": ["Memory Match", "Flip the cards and find all six pairs.", "🧠"],
      "word-guess": ["Word Guess", "Pick a secret word, then let your partner guess.", "🔤"],
      "emoji-quiz": ["Emoji Quiz", "Can you read the message in these emojis?", "🌙"],
      "spin-wheel": ["Spin Wheel", "Spin for a sweet little challenge.", "🎡"],
      "couple-trivia": ["Couple Trivia", "Answer, pass the device, and see if your partner knows.", "💞"]
    }[activeGame];
    el.innerHTML = activeShell(activeGame, ...gameInfo);
    renderActiveGame(el, activeGame, user, profile, activeGame === "tic-tac-toe" ? ticTacToeState : activeState);
  }

  function listenForDailyWins() {
    if (stopGames) return;
    stopGames = watchItems("game", items => {
      dailyGameItems = items || [];
      renderDailyWins(dailyGameItems);
    }, error => {
      console.error("Game scores could not be loaded:", error);
      const listEl = $("#game-scores-list", el);
      if (listEl) listEl.innerHTML = `<p class="muted">Game wins could not be loaded.</p>`;
    });
  }

  function renderDailyWins(items) {
    const listEl = $("#game-scores-list", el);
    if (!listEl) return;
    if (items.length === 0) {
      listEl.innerHTML = `<p class="muted">No wins recorded yet.</p>`;
      return;
    }

    const wins = items.filter(item => item.result === "won");
    const alreadyWonToday = wins.some(win => {
      if (win.author !== user.uid) return false;
      if (win.gameDay) return win.gameDay === todayKey();
      const createdAt = win.createdAt?.toDate?.() || (win.createdAt ? new Date(win.createdAt) : null);
      return createdAt && todayKey(createdAt) === todayKey();
    });
    if (alreadyWonToday) {
      finished = true;
      const resultText = $("#game-result", el);
      if (resultText) resultText.textContent = "You already found today's hidden heart ♡";
      $("#game-board", el)?.querySelectorAll("button").forEach(button => { button.disabled = true; });
    }

    const recentWins = wins.slice(0, 5);
    if (recentWins.length === 0) {
      listEl.innerHTML = `<p class="muted">No wins recorded yet.</p>`;
      return;
    }
    listEl.innerHTML = recentWins.map(win => {
      const date = win.createdAt
        ? (win.createdAt?.toDate?.() || new Date(win.createdAt)).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : "Today";
      return `<div class="score-item"><span>🎯 Found Daily Heart</span><span>${esc(date)}</span></div>`;
    }).join("");
  }

  buildDailyBoard();
  listenForDailyWins();

  el.onclick = async event => {
    const target = event.target.closest("button");
    if (!target || !el.contains(target)) return;

    if (target.hasAttribute("data-start-game")) {
      if (memoryTimer) clearTimeout(memoryTimer);
      memoryTimer = null;
      activeGame = target.dataset.startGame;
      activeState = resetActiveGame(activeGame);
      if (activeGame === "tic-tac-toe") {
        if (rtdb) {
          stopTicTacToe = onValue(ticTacToeRef(), snapshot => {
            ticTacToeState = snapshot.val();
            if (activeGame === "tic-tac-toe") renderCurrentGame();
          }, error => {
            console.error("Tic Tac Toe could not be loaded:", error);
            const content = $("#games-active-content", el);
            if (content) content.innerHTML = `<div class="game-panel"><p class="error">The live game could not be loaded. Please try again.</p></div>`;
          });
        } else {
          ticTacToeState = null;
        }
      }
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-back-games")) {
      if (memoryTimer) clearTimeout(memoryTimer);
      memoryTimer = null;
      stopTicTacToe?.();
      stopTicTacToe = null;
      activeGame = "";
      activeState = null;
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-reset-game")) {
      activeState = resetActiveGame(activeGame, activeState);
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-memory-card")) {
      const index = Number(target.dataset.memoryCard);
      if (activeState.locked || activeState.flipped.includes(index) || activeState.matched.includes(index)) return;
      activeState.flipped.push(index);
      if (activeState.flipped.length === 2) {
        activeState.moves++;
        const [first, second] = activeState.flipped;
        if (activeState.cards[first] === activeState.cards[second]) {
          activeState.matched.push(first, second);
          activeState.flipped = [];
        } else {
          activeState.locked = true;
          renderCurrentGame();
          memoryTimer = setTimeout(() => {
            if (activeGame !== "memory-match") return;
            activeState.flipped = [];
            activeState.locked = false;
            memoryTimer = null;
            renderCurrentGame();
          }, 800);
          return;
        }
      }
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-word-letter")) {
      const letter = target.dataset.wordLetter;
      if (activeState.guessed.includes(letter)) return;
      activeState.guessed.push(letter);
      if (!activeState.word.toLocaleLowerCase().includes(letter)) activeState.guessesLeft--;
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-emoji-answer")) {
      const question = emojiQuestions[activeState.question % emojiQuestions.length];
      const answer = Number(target.dataset.emojiAnswer);
      activeState.answered = true;
      activeState.selected = answer;
      if (answer === question.answer) activeState.score++;
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-next-emoji")) {
      activeState.question++;
      activeState.answered = false;
      activeState.selected = -1;
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-spin-wheel")) {
      const available = challenges.filter(challenge => challenge !== activeState.challenge);
      activeState.challenge = available[Math.floor(Math.random() * available.length)];
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-trivia-answer")) {
      activeState.answer = Number(target.dataset.triviaAnswer);
      activeState.answerer = getDisplayName(user.uid, profile?.name);
      activeState.stage = "guess";
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-trivia-guess")) {
      activeState.guess = Number(target.dataset.triviaGuess);
      activeState.stage = "result";
      if (activeState.guess === activeState.answer) activeState.score++;
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-next-trivia")) {
      activeState.question++;
      activeState.stage = "first";
      activeState.answer = -1;
      activeState.guess = -1;
      activeState.answerer = "";
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-ttt-start")) {
      try {
        const transaction = await runTransaction(ticTacToeRef(), current => {
          if (!current || current.status === "finished" || (current.status === "waiting" && current.xUid === user.uid)) {
            return { status: "waiting", xUid: user.uid, oUid: "", board: Array(9).fill(""), turnUid: user.uid, winnerUid: "", updatedAt: Date.now() };
          }
          if (current.status === "waiting" && current.xUid !== user.uid && !current.oUid) {
            return { ...current, oUid: user.uid, status: "playing", turnUid: current.xUid, updatedAt: Date.now() };
          }
          return current;
        });
        ticTacToeState = transaction.snapshot.val();
        renderCurrentGame();
      } catch (error) {
        console.error("Could not start Tic Tac Toe:", error);
        toast("Could not start the live game. Please try again.");
      }
      return;
    }

    if (target.hasAttribute("data-ttt-cell")) {
      const index = Number(target.dataset.tttCell);
      try {
        const transaction = await runTransaction(ticTacToeRef(), current => {
          if (!current || current.status !== "playing" || current.turnUid !== user.uid || current.board?.[index]) return;
          const mark = current.xUid === user.uid ? "X" : current.oUid === user.uid ? "O" : "";
          if (!mark) return;
          const nextBoard = [...current.board];
          nextBoard[index] = mark;
          const winnerUid = hasWinningLine(nextBoard, mark) ? user.uid : "";
          const isDraw = !winnerUid && nextBoard.every(Boolean);
          return {
            ...current,
            board: nextBoard,
            turnUid: winnerUid || isDraw ? "" : mark === "X" ? current.oUid : current.xUid,
            status: winnerUid || isDraw ? "finished" : "playing",
            winnerUid,
            updatedAt: Date.now()
          };
        });
        ticTacToeState = transaction.snapshot.val();
        renderCurrentGame();
      } catch (error) {
        console.error("Could not make Tic Tac Toe move:", error);
        toast("Your move could not be saved. Please try again.");
      }
    }
  };

  el.onsubmit = event => {
    if (event.target.id !== "word-guess-setup") return;
    event.preventDefault();
    const input = $("#word-guess-word", el);
    const word = input.value.trim().replace(/\s+/g, " ");
    const error = $(".game-form-error", event.target);
    if (!/^[a-zA-Z ]{3,32}$/.test(word)) {
      error.textContent = "Please choose a word with 3–32 letters.";
      return;
    }
    activeState = { word, guessed: [], guessesLeft: 7 };
    renderCurrentGame();
  };

}

export function disposeGames() {
  stopGames?.();
  stopGames = null;
  stopTicTacToe?.();
  stopTicTacToe = null;
  if (memoryTimer) clearTimeout(memoryTimer);
  memoryTimer = null;
}
