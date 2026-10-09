import { $, toast, todayKey, dailyIndex, scheduleDubaiDayRollover, esc } from "./utils.js";
import { recordDailyGameWin, recordGameMatchResult, watchItems } from "./firestore.js";
import { firebaseReady, rtdb } from "./firebase.js";
import { getDisplayName } from "./profile-data.js";
import { mountFindTheWordsGame } from "./find-the-words.js";
import { onDisconnect, onValue, ref, remove, runTransaction, set } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const ticTacToeRef = () => ref(rtdb, "couples/our-little-world/games/ticTacToe");
const sosGameRef = () => ref(rtdb, "couples/our-little-world/games/sos");
const sosPresenceRef = uid => ref(rtdb, `couples/our-little-world/games/sosPresence/${uid}`);
const gameMatchRef = game => ref(rtdb, `couples/our-little-world/games/matches/${game}`);
const SOS_ROWS = 9;
const SOS_COLUMNS = 7;
const SOS_CELL_COUNT = SOS_ROWS * SOS_COLUMNS;
const SOS_DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];
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
let stopSosGame = null;
let stopSosPresence = null;
let stopSosConnection = null;
let stopGameMatch = null;
let memoryTimer = null;
let dailyRolloverTimer = null;
let disposeFindTheWords = null;

function getDailySeed() {
  return dailyIndex(9);
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function makeEmojiQuestions() {
  return shuffle(emojiQuestions).map(question => {
    const options = shuffle(question.options.map((text, index) => ({ text, index })));
    return {
      ...question,
      options: options.map(option => option.text),
      answer: options.findIndex(option => option.index === question.answer)
    };
  });
}

function makeTriviaQuestions() {
  return shuffle(triviaQuestions).map(question => ({ ...question, options: shuffle(question.options) }));
}

const gameTitles = {
  "memory-match": "Memory Match",
  "word-guess": "Word Guess",
  "emoji-quiz": "Emoji Quiz",
  "spin-wheel": "Spin Wheel",
  "couple-trivia": "Couple Trivia",
  "tic-tac-toe": "Tic Tac Toe",
  sos: "SOS",
  "daily-hidden-heart": "Today's Hidden Heart"
};

function isValidSosState(state) {
  if (!state || typeof state !== "object" || typeof state.matchId !== "string" ||
      !["waiting", "playing", "finished", "cancelled"].includes(state.status) ||
      !Array.isArray(state.playerUids) || state.playerUids.length < 1 || state.playerUids.length > 2 ||
      new Set(state.playerUids).size !== state.playerUids.length ||
      !state.playerUids.every(uid => typeof uid === "string" && uid) ||
      !Array.isArray(state.board) || state.board.length !== SOS_CELL_COUNT ||
      !Array.isArray(state.owners) || state.owners.length !== SOS_CELL_COUNT ||
      !state.board.every((letter, index) => ["", "S", "O"].includes(letter) &&
        (letter ? state.playerUids.includes(state.owners[index]) : state.owners[index] === "")) ||
      !state.scores || typeof state.scores !== "object" ||
      !state.playerUids.every(uid => Number.isInteger(state.scores[uid]) && state.scores[uid] >= 0) ||
      !Array.isArray(state.lines) ||
      !state.lines.every(line => Array.isArray(line.cells) && line.cells.length === 3 &&
        line.cells.every(index => Number.isInteger(index) && index >= 0 && index < SOS_CELL_COUNT) &&
        state.board[line.cells[0]] === "S" && state.board[line.cells[1]] === "O" &&
        state.board[line.cells[2]] === "S" && state.playerUids.includes(line.uid))) return false;
  if (state.status === "waiting") return state.playerUids.length === 1 && !state.turnUid;
  if (state.status === "playing") return state.playerUids.length === 2 && state.playerUids.includes(state.turnUid);
  if (state.status === "finished") return state.playerUids.length === 2 && !state.turnUid &&
    (!state.winnerUid || state.playerUids.includes(state.winnerUid));
  return !state.turnUid;
}

function findSosLines(board, moveIndex, uid, knownLines) {
  const row = Math.floor(moveIndex / SOS_COLUMNS);
  const column = moveIndex % SOS_COLUMNS;
  const found = [];
  for (const [rowStep, columnStep] of SOS_DIRECTIONS) {
    for (let offset = -2; offset <= 0; offset++) {
      const startRow = row + rowStep * offset;
      const startColumn = column + columnStep * offset;
      const coordinates = [0, 1, 2].map(step => [
        startRow + rowStep * step,
        startColumn + columnStep * step
      ]);
      if (coordinates.some(([lineRow, lineColumn]) =>
        lineRow < 0 || lineRow >= SOS_ROWS || lineColumn < 0 || lineColumn >= SOS_COLUMNS)) continue;
      const cells = coordinates.map(([lineRow, lineColumn]) => lineRow * SOS_COLUMNS + lineColumn);
      if (cells.map(index => board[index]).join("") !== "SOS") continue;
      const key = cells.join("-");
      if (knownLines.has(key)) continue;
      knownLines.add(key);
      found.push({ cells, uid });
    }
  }
  return found;
}

function gameIsComplete(game, state) {
  if (!state) return false;
  if (game === "memory-match") return state.matched.length === state.cards.length;
  if (game === "word-guess") {
    const won = [...state.word.toLocaleLowerCase()].every(char => !/[a-z]/.test(char) || state.guessed.includes(char));
    return Boolean(state.word) && (won || state.guessesLeft === 0);
  }
  if (game === "emoji-quiz" || game === "couple-trivia") return state.question >= state.questions.length;
  if (game === "spin-wheel") return state.completedChallenges >= 3;
  return false;
}

function gameScore(game, state) {
  if (game === "memory-match") return state.moves;
  if (game === "word-guess") {
    const solved = [...state.word.toLocaleLowerCase()].every(char => !/[a-z]/.test(char) || state.guessed.includes(char));
    return solved ? state.guessesLeft + 1 : 0;
  }
  if (game === "emoji-quiz" || game === "couple-trivia") return state.score;
  if (game === "spin-wheel") return Date.now() - state.startedAt;
  return 0;
}

function isValidActiveGameState(game, state) {
  if (!state || typeof state !== "object") return false;
  if (game === "memory-match") return Array.isArray(state.cards) && state.cards.length === symbols.length * 2 &&
    state.cards.every(symbol => symbols.includes(symbol)) && Array.isArray(state.flipped) &&
    Array.isArray(state.matched) && Number.isInteger(state.moves) && state.moves >= 0 &&
    typeof state.locked === "boolean";
  if (game === "word-guess") return typeof state.word === "string" && state.word.length <= 32 &&
    Array.isArray(state.guessed) && state.guessed.every(letter => /^[a-z]$/.test(letter)) &&
    Number.isInteger(state.guessesLeft) && state.guessesLeft >= 0 && state.guessesLeft <= 7;
  if (game === "emoji-quiz" || game === "couple-trivia") return Array.isArray(state.questions) &&
    state.questions.length === (game === "emoji-quiz" ? emojiQuestions.length : triviaQuestions.length) &&
    Number.isInteger(state.question) && state.question >= 0 && state.question <= state.questions.length &&
    Number.isInteger(state.score) && state.score >= 0;
  if (game === "spin-wheel") return typeof state.challenge === "string" &&
    Number.isInteger(state.completedChallenges) && state.completedChallenges >= 0 && state.completedChallenges <= 3 &&
    Number.isFinite(state.startedAt);
  return false;
}

function gameWinner(game, playerUids, results) {
  const [firstUid, secondUid] = playerUids;
  const firstScore = results[firstUid]?.score;
  const secondScore = results[secondUid]?.score;
  if (firstScore === secondScore) return "";
  if (game === "memory-match" || game === "spin-wheel") return firstScore < secondScore ? firstUid : secondUid;
  return firstScore > secondScore ? firstUid : secondUid;
}

function formatGameScore(game, score) {
  if (score == null) return "—";
  if (game === "memory-match") return `${score} moves`;
  if (game === "spin-wheel") return `${(score / 1000).toFixed(1)}s`;
  return `${score} points`;
}

function isDailyHeartWin(item) {
  return item.game === gameTitles["daily-hidden-heart"] || item.game === "Find the heart";
}

function uniqueMatchResults(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item.matchId) return true;
    const key = `${item.game}:${item.matchId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
      <p class="muted">Start a match on one device, then join it from your partner's device.</p>
    </header>
    <div class="games-hub-grid">
      ${gameCard("tic-tac-toe", "⭕", "Tic Tac Toe", "A real-time game for two", "LIVE")}
      ${gameCard("sos", "🔠", "SOS", "Make SOS lines, earn points, and play live", "LIVE")}
      ${gameCard("memory-match", "🧠", "Memory Match", "Take turns finding matching pairs", "2P")}
      ${gameCard("word-guess", "🔤", "Word Guess", "Set words for each other to guess", "2P")}
      ${gameCard("find-words", "🔎", "Find the Words", "Race to find 16 new words together", "LIVE")}
      ${gameCard("emoji-quiz", "🌙", "Emoji Quiz", "Take turns decoding love in emojis", "2P")}
      ${gameCard("spin-wheel", "🎡", "Spin Wheel", "Complete three surprise challenges fastest", "2P")}
      ${gameCard("couple-trivia", "💞", "Couple Trivia", "Answer, then let your partner guess", "2P")}
    </div>
    <section class="games-daily">
      <button type="button" class="games-hub-card" data-start-game="daily-hidden-heart">
        <span class="games-card-emoji" aria-hidden="true">♡</span>
        <span class="games-card-copy"><strong>Today's Hidden Heart</strong><span>Find today's hidden heart. Its location changes every day.</span></span>
        <span class="games-card-arrow" aria-hidden="true">›</span>
      </button>
      <div id="hidden-heart-game" class="hidden">
        <div id="game-board" class="game-board" aria-label="Find the hidden heart"></div>
        <p id="game-result" class="game-result" aria-live="polite"></p>
      </div>
      <div class="score-history"><h3>Recent Game Wins 🏆</h3><div id="game-scores-list"><p class="muted">Loading wins…</p></div></div>
      <div id="games-leaderboards"></div>
    </section>
  </section>`;
}

function activeShell(id, title, description, emoji) {
  return `<section class="games-page games-play-page">
    <button class="games-back-button" type="button" data-back-games>← All games</button>
    <header class="games-play-heading"><span class="games-card-emoji" aria-hidden="true">${emoji}</span><div><p class="eyebrow">OUR GAMES · TWO DEVICES</p><h1>${title}</h1><p class="muted">${description}</p></div></header>
    <div id="games-room-status"></div>
    <div id="games-active-content" class="games-active-content" data-active-game="${id}"></div>
  </section>`;
}

function renderActiveGame(el, game, user, profile, state, liveMatch = false) {
  const content = $("#games-active-content", el);
  if (!content) return;
  if (game !== "tic-tac-toe" && !isValidActiveGameState(game, state)) {
    content.innerHTML = `<div class="game-panel"><p class="error">This game's saved progress is invalid. Please start a new match.</p></div>`;
    return;
  }

  if (game === "memory-match") {
    const cards = state.cards.map((symbol, index) => {
      const revealed = state.flipped.includes(index) || state.matched.includes(index);
      return `<button type="button" class="memory-card${state.matched.includes(index) ? " matched" : ""}" data-memory-card="${index}" aria-label="${revealed ? esc(symbol) : "Hidden card"}"${revealed || state.locked ? " disabled" : ""}>${revealed ? esc(symbol) : "♡"}</button>`;
    }).join("");
    content.innerHTML = `<div class="game-panel"><p class="games-instructions">Flip two cards at a time and find every matching pair.</p><div class="memory-board">${cards}</div><p class="game-result" aria-live="polite">${state.matched.length === state.cards.length ? `You found them all in ${state.moves} moves! 🎉` : `${state.matched.length / 2} of ${symbols.length} pairs found · ${state.moves} moves`}</p>${liveMatch ? "" : `<button type="button" class="secondary" data-reset-game>Play again</button>`}</div>`;
    return;
  }

  if (game === "word-guess") {
    if (!state.word) {
      content.innerHTML = `<div class="game-panel"><p class="games-instructions">${liveMatch ? "Choose a secret word for your partner to guess." : "One of you picks a word, then passes the device so your partner can guess it. The word stays hidden after you submit it."}</p><form id="word-guess-setup" class="game-form"><label for="word-guess-word">Choose a secret word</label><input id="word-guess-word" type="password" maxlength="32" autocomplete="off" placeholder="At least 3 letters" required><button class="primary" type="submit">Set the secret word</button><p class="game-form-error" aria-live="polite"></p></form></div>`;
      return;
    }
    const visibleWord = [...state.word].map(char => /[a-z]/i.test(char) && !state.guessed.includes(char.toLocaleLowerCase()) ? "_" : char).join(" ");
    const won = [...state.word.toLocaleLowerCase()].every(char => !/[a-z]/.test(char) || state.guessed.includes(char));
    const lost = state.guessesLeft === 0 && !won;
    content.innerHTML = `<div class="game-panel"><p class="games-instructions">${liveMatch ? "Guess your own secret word to complete this turn, then pass the match to your partner." : "Pass the device to your partner, then guess the secret word."}</p><div class="word-guess-word" aria-label="Secret word">${visibleWord}</div><p class="game-result" aria-live="polite">${won ? "You guessed it! 🎉" : lost ? `Out of guesses! The word was ${esc(state.word)}.` : `${state.guessesLeft} guesses left`}</p>${won || lost ? (liveMatch ? "" : `<button type="button" class="primary" data-reset-game>Choose another word</button>`) : `<div class="letter-board">${alphabet.map(letter => `<button type="button" data-word-letter="${letter.toLocaleLowerCase()}"${state.guessed.includes(letter.toLocaleLowerCase()) ? " disabled" : ""}>${letter}</button>`).join("")}</div>${liveMatch ? "" : `<button type="button" class="secondary word-reset" data-reset-game>Start over</button>`}`}</div>`;
    return;
  }

  if (game === "emoji-quiz") {
    if (state.question >= state.questions.length) {
      content.innerHTML = `<div class="game-panel quiz-panel"><p class="eyebrow">QUIZ COMPLETE</p><h2 class="trivia-question">You got ${state.score} of ${state.questions.length} right! 💖</h2>${liveMatch ? "" : `<button type="button" class="primary" data-reset-game>Play again</button>`}</div>`;
      return;
    }
    const question = state.questions[state.question];
    content.innerHTML = `<div class="game-panel quiz-panel"><p class="games-instructions">What do these emojis mean?</p><div class="emoji-question">${question.emojis}</div><div class="quiz-options">${question.options.map((option, index) => `<button type="button" class="quiz-option${state.answered && index === question.answer ? " correct" : ""}${state.answered && index === state.selected && index !== question.answer ? " incorrect" : ""}" data-emoji-answer="${index}"${state.answered ? " disabled" : ""}>${esc(option)}</button>`).join("")}</div>${state.answered ? `<p class="game-result" aria-live="polite">${state.selected === question.answer ? "That's right! 💖" : "Not quite — love is in the details! 💕"} ${state.score} correct</p><button type="button" class="primary" data-next-emoji>Next question</button>` : ""}</div>`;
    return;
  }

  if (game === "spin-wheel") {
    content.innerHTML = `<div class="game-panel spin-panel"><div class="spin-wheel" aria-hidden="true">🎡</div><p class="games-instructions">${liveMatch ? `Complete three challenges for your turn (${state.completedChallenges}/3).` : "Ready for a little surprise?"}</p><button type="button" class="primary" data-spin-wheel${liveMatch && state.completedChallenges >= 3 ? " disabled" : ""}>Spin for a challenge</button>${state.challenge ? `<div class="spin-result" aria-live="polite"><p class="eyebrow">🎉 YOUR CHALLENGE</p><strong>${esc(state.challenge)}</strong>${liveMatch ? `<button type="button" class="secondary" data-complete-challenge${state.completedChallenges >= 3 ? " disabled" : ""}>I completed it</button>` : `<button type="button" class="secondary" data-spin-wheel>Spin again</button>`}</div>` : ""}</div>`;
    return;
  }

  if (game === "couple-trivia") {
    if (state.question >= state.questions.length) {
      content.innerHTML = `<div class="game-panel quiz-panel"><p class="eyebrow">TRIVIA COMPLETE</p><h2 class="trivia-question">Final score: ${state.score} of ${state.questions.length} 💞</h2>${liveMatch ? "" : `<button type="button" class="primary" data-reset-game>Play again</button>`}</div>`;
      return;
    }
    const question = state.questions[state.question];
    if (state.stage === "guess") {
      content.innerHTML = `<div class="game-panel quiz-panel"><p class="games-instructions">${liveMatch ? `${esc(state.answerer)} answered. Choose what you think they picked.` : `Now pass the device to your partner. Guess what ${esc(state.answerer)} picked!`}</p><h2 class="trivia-question">${esc(question.prompt)}</h2><div class="quiz-options">${question.options.map((option, index) => `<button type="button" class="quiz-option" data-trivia-guess="${index}">${esc(option)}</button>`).join("")}</div></div>`;
      return;
    }
    if (state.stage === "result") {
      const matched = state.guess === state.answer;
      content.innerHTML = `<div class="game-panel quiz-panel"><p class="eyebrow">THE REVEAL</p><h2 class="trivia-question">${esc(question.prompt)}</h2><p class="trivia-answer">${esc(state.answerer)} picked <strong>${esc(question.options[state.answer])}</strong>.</p><p class="trivia-answer">Their partner guessed <strong>${esc(question.options[state.guess])}</strong>.</p><p class="game-result" aria-live="polite">${matched ? "You know each other so well! 💞" : "The fun is in learning something new! 💗"} Score: ${state.score}</p>${liveMatch ? state.canAdvance ? `<button type="button" class="primary" data-next-trivia>Next question</button>` : "" : `<button type="button" class="primary" data-next-trivia>Next question</button>`}</div>`;
      return;
    }
    content.innerHTML = `<div class="game-panel quiz-panel"><p class="games-instructions">${liveMatch ? "Choose your honest answer. Your partner will guess from their device." : `First, ${esc(getDisplayName(user.uid, profile?.name))} answers honestly. Your partner will guess after you pass the device.`}</p><h2 class="trivia-question">${esc(question.prompt)}</h2><div class="quiz-options">${question.options.map((option, index) => `<button type="button" class="quiz-option" data-trivia-answer="${index}">${esc(option)}</button>`).join("")}</div></div>`;
    return;
  }

  if (game === "tic-tac-toe") renderTicTacToe(content, user, state);
}

function renderTicTacToe(content, user, gameState) {
  const uid = user?.uid;
  const state = gameState || null;
  if (state && !isValidTicTacToeState(state)) {
    content.innerHTML = `<div class="game-panel tic-tac-toe-panel"><p class="error">This match has invalid game data. Start a new match to continue.</p><button type="button" class="primary" data-ttt-start>Start a new match</button></div>`;
    return;
  }
  const cells = state?.board || Array(9).fill("");
  const mark = state?.xUid === uid ? "X" : state?.oUid === uid ? "O" : "";
  const isPlaying = state?.status === "playing";
  const isFinished = state?.status === "finished";
  const waitingForOpponent = state?.status === "waiting" && state.xUid === uid;
  const canJoin = state?.status === "waiting" && state.xUid !== uid && !state.oUid;
  const turnText = !state
    ? "Start a match or join your partner's waiting game."
    : isFinished
      ? state.cancelled
        ? "The waiting match was canceled."
        : state.endedByUid
          ? "This match was ended."
          : state.winnerUid
            ? state.winnerUid === uid ? "You won! 🎉" : "Your partner won this round!"
            : "It's a draw! 🤝"
      : waitingForOpponent
        ? "Waiting for your partner to join…"
        : canJoin
          ? "Your partner is waiting. Join the match!"
          : !mark
            ? "This match is for your partner. Start a new game after it ends."
            : isPlaying
              ? state.turnUid === uid ? "Your turn!" : "Waiting for your partner's move…"
              : "Waiting for your partner to join…";

  content.innerHTML = `<div class="game-panel tic-tac-toe-panel">
    <p class="games-instructions">Play live against your partner. Your moves appear on both screens.</p>
    <p class="tic-tac-toe-status" aria-live="polite">${esc(turnText)}</p>
    ${state?.status === "waiting" || isPlaying || isFinished ? `<div class="tic-tac-toe-board" role="grid" aria-label="Tic Tac Toe board">${cells.map((cell, index) => `<button type="button" class="tic-tac-toe-cell${cell ? ` played played-${cell.toLocaleLowerCase()}` : ""}" data-ttt-cell="${index}" aria-label="Row ${Math.floor(index / 3) + 1}, column ${index % 3 + 1}${cell ? `, ${cell}` : ""}"${!isPlaying || state.turnUid !== uid || cell || !mark ? " disabled" : ""}>${esc(cell)}</button>`).join("")}</div>` : ""}
    ${!state || isFinished ? `<button type="button" class="primary" data-ttt-start>${isFinished ? "Start a new match" : "Start a match"}</button>` : canJoin ? `<button type="button" class="primary" data-ttt-start>Join your partner</button>` : ""}
    ${(state?.status === "waiting" && state.xUid === uid) || (isPlaying && (state.xUid === uid || state.oUid === uid)) ? `<button type="button" class="secondary" data-ttt-reset>${state.status === "waiting" ? "Cancel waiting match" : "End this match"}</button>` : ""}
    <p class="tic-tac-toe-legend">${mark ? `You are ${mark} · ${mark === "X" ? "❌" : "⭕"}` : "❌ goes first"}</p>
  </div>`;
}

function renderSosGame(content, user, gameState, presence, selectedLetter) {
  const uid = user.uid;
  const state = gameState || null;
  if (state && !isValidSosState(state)) {
    content.innerHTML = `<section class="sos-game-page"><header class="sos-header"><button class="sos-back" type="button" data-back-games>← Games</button><h1>SOS</h1></header><p class="error sos-error">This match has invalid game data. Please start a new match.</p></section>`;
    return;
  }

  const partnerOnline = Object.entries(presence || {}).some(([playerUid, value]) =>
    playerUid !== uid && value?.online === true
  );
  const member = Boolean(state?.playerUids.includes(uid));
  const waiting = state?.status === "waiting";
  const playing = state?.status === "playing";
  const finished = state?.status === "finished";
  const ownScore = state?.scores?.[uid] || 0;
  const partnerUid = state?.playerUids.find(playerUid => playerUid !== uid);
  const partnerScore = partnerUid ? state.scores[partnerUid] || 0 : 0;
  let turnMessage = !state
    ? partnerOnline ? "Your partner is online. Start a live match!" : "Waiting for your partner to come online…"
    : waiting
      ? state.playerUids[0] === uid
        ? partnerOnline ? "Your partner is online — waiting for them to join…" : "Waiting for your partner to come online…"
        : partnerOnline ? "Your partner is online. Join to start playing!" : "Your partner is offline."
      : playing
        ? state.turnUid === uid ? "Your turn — choose S or O, then tap a square." : "Your partner's turn…"
        : finished
          ? state.winnerUid ? state.winnerUid === uid ? "You won! 🎉" : "Your partner won this round!" : "It's a tie! 🤝"
          : "This match was cancelled.";

  const lineCells = new Set((state?.lines || []).flatMap(line => line.cells));
  const cells = (state?.board || Array(SOS_CELL_COUNT).fill("")).map((letter, index) => {
    const owner = state?.owners?.[index];
    const ownership = owner ? owner === uid ? " own" : " partner" : "";
    const lineClass = lineCells.has(index) ? " sos-line-cell" : "";
    const disabled = !playing || state.turnUid !== uid || !member || Boolean(letter);
    return `<button type="button" class="sos-cell${ownership}${lineClass}" data-sos-cell="${index}" aria-label="Row ${Math.floor(index / SOS_COLUMNS) + 1}, column ${index % SOS_COLUMNS + 1}${letter ? `, ${letter}` : ", empty"}${lineCells.has(index) ? ", part of SOS" : ""}"${disabled ? " disabled" : ""}>${esc(letter)}</button>`;
  }).join("");

  const result = finished
    ? state.winnerUid
      ? `${esc(getDisplayName(state.winnerUid, state.players?.[state.winnerUid]?.name || "Your partner"))} wins with ${Math.max(ownScore, partnerScore)} SOS!`
      : `You both made ${ownScore} SOS. What a match!`
    : "";
  const canJoin = waiting && state.playerUids[0] !== uid && partnerOnline;
  const waitingOwner = waiting && state.playerUids[0] === uid;
  const startAction = !state || finished || state.status === "cancelled"
    ? `<button type="button" class="primary sos-action" data-sos-start>${finished || state ? "Play again" : "Start a match"}</button>`
    : waitingOwner
      ? `<button type="button" class="secondary sos-action" data-sos-cancel>Cancel waiting match</button>`
      : waiting
        ? canJoin
          ? `<button type="button" class="primary sos-action" data-sos-join>Join match</button>`
          : `<button type="button" class="secondary sos-action" disabled>Waiting for both players online</button>`
        : "";

  content.innerHTML = `<section class="sos-game-page${finished && state.winnerUid === uid ? " sos-won" : ""}">
    <header class="sos-header">
      <button class="sos-back" type="button" data-back-games>← Games</button>
      <div class="sos-heading"><p class="eyebrow">LIVE · TWO PLAYERS</p><h1>SOS</h1></div>
      <span class="sos-online${partnerOnline ? " online" : ""}" aria-label="${partnerOnline ? "Partner online" : "Partner offline"}"></span>
    </header>
    <div class="sos-turn" aria-live="polite">${esc(turnMessage)}</div>
    <div class="sos-symbol-picker" aria-label="Choose your letter">
      <button type="button" class="sos-symbol${selectedLetter === "S" ? " selected" : ""}" data-sos-letter="S" aria-pressed="${selectedLetter === "S"}">S</button>
      <button type="button" class="sos-symbol${selectedLetter === "O" ? " selected" : ""}" data-sos-letter="O" aria-pressed="${selectedLetter === "O"}">O</button>
      ${startAction}
    </div>
    ${result ? `<div class="sos-result" aria-live="polite">${result}</div>` : ""}
    <div class="sos-board" role="grid" aria-label="SOS game board, 7 columns by 9 rows">${cells}</div>
    <footer class="sos-scoreboard" aria-label="Match scores">
      <div class="sos-player-score own"><span>You</span><strong>${ownScore}</strong></div>
      <span class="sos-versus">VS</span>
      <div class="sos-player-score partner"><span>${esc(partnerUid ? getDisplayName(partnerUid, state?.players?.[partnerUid]?.name || "Partner") : "Partner")}</span><strong>${partnerScore}</strong></div>
    </footer>
  </section>`;
}

function makeMemoryState() {
  const deck = [...symbols, ...symbols].map((symbol, index) => ({ symbol, key: `${symbol}-${index}` }));
  for (let index = deck.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[randomIndex]] = [deck[randomIndex], deck[index]];
  }
  return { cards: deck.map(card => card.symbol), flipped: [], matched: [], moves: 0, locked: false };
}

function resetActiveGame(game) {
  if (memoryTimer) clearTimeout(memoryTimer);
  memoryTimer = null;
  if (game === "memory-match") return makeMemoryState();
  if (game === "word-guess") return { word: "", guessed: [], guessesLeft: 7 };
  if (game === "emoji-quiz") return { questions: makeEmojiQuestions(), question: 0, answered: false, selected: -1, score: 0 };
  if (game === "spin-wheel") return { challenge: "", completedChallenges: 0, startedAt: Date.now() };
  if (game === "couple-trivia") return { questions: makeTriviaQuestions(), question: 0, stage: "first", answer: -1, guess: -1, answerer: "", score: 0 };
  return {};
}

function hasWinningLine(board, mark) {
  return winningLines.some(line => line.every(index => board[index] === mark));
}

function isValidTicTacToeState(state) {
  if (!state ||
      !["waiting", "playing", "finished"].includes(state.status) ||
      typeof state.xUid !== "string" || !state.xUid ||
      typeof state.oUid !== "string" ||
      typeof state.turnUid !== "string" ||
      typeof state.winnerUid !== "string" ||
      !Array.isArray(state.board) || state.board.length !== 9 ||
      !state.board.every(cell => cell === "" || cell === "X" || cell === "O")) return false;
  if (state.status === "waiting") return !state.oUid && state.turnUid === state.xUid;
  if (state.status === "playing") return Boolean(state.oUid && state.oUid !== state.xUid && [state.xUid, state.oUid].includes(state.turnUid));
  return !state.turnUid && (!state.winnerUid || [state.xUid, state.oUid].includes(state.winnerUid));
}

function isValidGameRoom(room, game) {
  if (!room || room.game !== game || typeof room.matchId !== "string" ||
      !["waiting", "playing", "finished", "cancelled"].includes(room.status) ||
      !Array.isArray(room.playerUids) || room.playerUids.length < 1 ||
      room.playerUids.length > 2 || new Set(room.playerUids).size !== room.playerUids.length ||
      !room.playerUids.every(uid => typeof uid === "string" && uid) ||
      !room.players || typeof room.players !== "object") return false;
  if (room.status === "waiting") return room.playerUids.length === 1;
  if (room.status === "cancelled") return true;
  if (room.playerUids.length !== 2 || !room.playerUids.every(uid => room.players[uid])) return false;
  if (game === "word-guess" && (!["setter", "guessing", "result"].includes(room.wordPhase) ||
      !Number.isInteger(room.wordRoundNumber) || room.wordRoundNumber < 0 || room.wordRoundNumber > 1 ||
      (room.wordPhase === "guessing" &&
        (!room.wordRound || typeof room.wordRound.word !== "string" ||
          !room.playerUids.includes(room.wordSetterUid))))) return false;
  if (game === "couple-trivia" && (!Array.isArray(room.questions) || room.questions.length !== triviaQuestions.length ||
      !Number.isInteger(room.triviaQuestionIndex) || room.triviaQuestionIndex < 0 ||
      room.triviaQuestionIndex >= room.questions.length ||
      !["first", "guess", "result", "finished"].includes(room.triviaStage) ||
      !room.playerUids.includes(room.triviaAnswererUid))) return false;
  if (room.status === "playing") return room.playerUids.includes(room.turnUid);
  return !room.turnUid && (!room.winnerUid || room.playerUids.includes(room.winnerUid));
}

export function renderGames(el, user, profile) {
  if (dailyRolloverTimer) clearTimeout(dailyRolloverTimer);
  dailyRolloverTimer = null;
  stopGames?.();
  stopGames = null;
  stopTicTacToe?.();
  stopTicTacToe = null;
  if (memoryTimer) clearTimeout(memoryTimer);
  memoryTimer = null;

  let activeGame = "";
  let renderedShellGame = "";
  let activeState = null;
  let ticTacToeState = null;
  let sosGameState = null;
  let sosPresence = {};
  let selectedSosLetter = "S";
  let gameRoomState = null;
  let roomStateInitializing = "";
  let savedMatchResults = new Set();
  let dailyGameItems = null;
  let dailyDayKey = todayKey();
  let dailyTarget = getDailySeed();
  let finished = false;
  let savingDailyWin = false;

  el.innerHTML = gamesHome();

  function ownDailyWin() {
    return (dailyGameItems || []).find(win => {
      if (!isDailyHeartWin(win) || win.result !== "won" || win.author !== user.uid) return false;
      if (win.gameDay) return win.gameDay === dailyDayKey;
      const createdAt = win.createdAt?.toDate?.() || (win.createdAt ? new Date(win.createdAt) : null);
      return createdAt && todayKey(createdAt) === dailyDayKey;
    });
  }

  function buildDailyBoard() {
    const board = $("#game-board", el);
    if (!board) return;
    board.replaceChildren();
    const alreadyWon = Boolean(ownDailyWin());
    finished = alreadyWon;
    for (let index = 0; index < 9; index++) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "game-square";
      const found = alreadyWon && index === dailyTarget;
      button.textContent = found ? "♥" : "♡";
      if (found) button.classList.add("found");
      button.disabled = alreadyWon;
      button.setAttribute("aria-label", `Heart tile ${index + 1}${found ? ", found" : ""}`);
      button.onclick = async () => {
        if (todayKey() !== dailyDayKey) {
          refreshDailyTarget();
          return;
        }
        if (finished || savingDailyWin) return;
        if (index === dailyTarget) {
          const winningDayKey = dailyDayKey;
          savingDailyWin = true;
          button.disabled = true;
          try {
            const recorded = await recordDailyGameWin(user.uid, winningDayKey);
            if (dailyDayKey === winningDayKey) {
              finished = true;
              button.textContent = "♥";
              button.classList.add("found");
              button.setAttribute("aria-label", `Heart tile ${index + 1}, found`);
              $("#game-board", el)?.querySelectorAll("button").forEach(tile => { tile.disabled = true; });
              const resultText = $("#game-result", el);
              if (resultText) resultText.textContent = recorded
                ? "🎉 You found today's hidden heart! ♡"
                : "You already found today's hidden heart ♡";
              if (recorded) toast("Congratulations! Daily heart found! ♡");
            }
          } catch (error) {
            console.error("Failed to save score:", error);
            toast("Could not save score history.");
            if (dailyDayKey === winningDayKey) button.disabled = false;
          } finally {
            if (dailyDayKey === winningDayKey) savingDailyWin = false;
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
    const resultText = $("#game-result", el);
    if (resultText && alreadyWon) resultText.textContent = "You already found today's hidden heart ♡";
  }

  function refreshDailyTarget() {
    const currentDayKey = todayKey();
    if (currentDayKey === dailyDayKey) return;
    dailyDayKey = currentDayKey;
    dailyTarget = getDailySeed();
    finished = false;
    savingDailyWin = false;
    buildDailyBoard();
  }

  function scheduleDailyRollover() {
    if (dailyRolloverTimer) clearTimeout(dailyRolloverTimer);
    dailyRolloverTimer = scheduleDubaiDayRollover(() => {
      refreshDailyTarget();
      scheduleDailyRollover();
    });
  }

  function clearSosSession() {
    stopSosGame?.();
    stopSosGame = null;
    stopSosPresence?.();
    stopSosPresence = null;
    stopSosConnection?.();
    stopSosConnection = null;
    document.body.classList.remove("sos-fullscreen");
    if (!rtdb) return;
    const playerRef = sosPresenceRef(user.uid);
    onDisconnect(playerRef).cancel()
      .then(() => remove(playerRef))
      .catch(error => console.error("SOS presence could not be cleared:", error));
  }

  function startSosSession() {
    if (!rtdb) return;
    stopSosGame = onValue(sosGameRef(), snapshot => {
      const previousState = sosGameState;
      sosGameState = snapshot.val();
      if (isValidSosState(sosGameState) && sosGameState.status === "finished" &&
          previousState?.status !== "finished" && !savedMatchResults.has(sosGameState.matchId) && firebaseReady) {
        savedMatchResults.add(sosGameState.matchId);
        recordGameMatchResult({
          uid: user.uid,
          authorId: profile?.id || user.uid,
          matchId: sosGameState.matchId,
          game: gameTitles.sos,
          winnerUid: sosGameState.winnerUid,
          players: sosGameState.playerUids,
          scores: sosGameState.scores
        }).catch(error => {
          savedMatchResults.delete(sosGameState.matchId);
          console.error("Could not save SOS result:", error);
          toast("The match ended, but its result could not be saved.");
        });
      }
      if (activeGame === "sos") renderCurrentGame();
    }, error => {
      console.error("SOS game could not be loaded:", error);
      const content = $("#games-active-content", el);
      if (content) content.innerHTML = `<p class="error">The live SOS game could not be loaded. Please try again.</p>`;
    });
    stopSosPresence = onValue(ref(rtdb, "couples/our-little-world/games/sosPresence"), snapshot => {
      sosPresence = snapshot.val() || {};
      if (activeGame === "sos") renderCurrentGame();
    }, error => {
      console.error("SOS player presence could not be loaded:", error);
    });
    stopSosConnection = onValue(ref(rtdb, ".info/connected"), snapshot => {
      if (snapshot.val() !== true) return;
      const playerRef = sosPresenceRef(user.uid);
      onDisconnect(playerRef).remove()
        .then(() => set(playerRef, { online: true, name: getDisplayName(user.uid, profile?.name) }))
        .catch(error => {
          console.error("SOS presence could not be updated:", error);
          toast("Your online status could not be shared for SOS.");
        });
    }, error => {
      console.error("SOS connection status could not be loaded:", error);
    });
  }

  function matchLeaderboard(game) {
    const wins = uniqueMatchResults((dailyGameItems || []).filter(item =>
      item.result === "won" &&
      (item.game === gameTitles[game] || game === "daily-hidden-heart" && isDailyHeartWin(item)) &&
      (item.winnerUid || item.author)
    ));
    const totals = new Map();
    for (const win of wins) {
      const winnerUid = win.winnerUid || win.author;
      totals.set(winnerUid, (totals.get(winnerUid) || 0) + 1);
    }
    const ranked = [...totals].sort((first, second) => second[1] - first[1]);
    return `<section class="score-history game-leaderboard"><h3>${esc(gameTitles[game])} Leaderboard 🏆</h3>${ranked.length
      ? ranked.map(([uid, count]) => `<div class="score-item"><span>${esc(uid === user.uid ? "You" : getDisplayName(uid, "Your partner"))}</span><strong>${count} ${count === 1 ? "win" : "wins"}</strong></div>`).join("")
      : `<p class="muted">No wins yet.</p>`}</section>`;
  }

  function renderGameRoom() {
    const statusEl = $("#games-room-status", el);
    const content = $("#games-active-content", el);
    if (!statusEl || !content) return;
    if (!rtdb) {
      statusEl.innerHTML = `<p class="error">Two-player games need Firebase Realtime Database.</p>`;
      content.replaceChildren();
      return;
    }

    const room = gameRoomState;
    if (room && !isValidGameRoom(room, activeGame)) {
      statusEl.innerHTML = `<p class="error">This match has invalid saved data. Please cancel it or contact your partner before starting another.</p>`;
      content.replaceChildren();
      return;
    }
    const players = room?.players || {};
    const playerUids = room?.playerUids || [];
    const opponentUid = playerUids.find(uid => uid !== user.uid);
    const opponentName = getDisplayName(opponentUid, players[opponentUid]?.name || "Your partner");
    let message = "";
    if (!room || room.status === "finished" || room.status === "cancelled") {
      const finalScores = room?.status === "finished"
        ? `<p class="muted">${esc(getDisplayName(room.playerUids[0], players[room.playerUids[0]]?.name || "Player 1"))}: ${esc(formatGameScore(activeGame, players[room.playerUids[0]]?.score))} · ${esc(getDisplayName(room.playerUids[1], players[room.playerUids[1]]?.name || "Player 2"))}: ${esc(formatGameScore(activeGame, players[room.playerUids[1]]?.score))}</p>`
        : "";
      const result = room?.status === "cancelled"
        ? "This match was cancelled."
        : room?.status === "finished"
        ? room.winnerUid === user.uid
          ? "You won this match! 🎉"
          : room.winnerUid
            ? `${getDisplayName(room.winnerUid, players[room.winnerUid]?.name || "Your partner")} won this match.`
            : "This match was a draw."
        : "Start a match, then your partner joins from their device.";
      statusEl.innerHTML = `<div class="game-panel game-room-panel"><p class="tic-tac-toe-status">${esc(result)}</p>${finalScores}<button type="button" class="primary" data-room-start>${room ? "Play another match" : "Start a match"}</button></div>${matchLeaderboard(activeGame)}`;
      content.replaceChildren();
      return;
    }

    if (room.status === "waiting") {
      const isCreator = room.playerUids[0] === user.uid;
      statusEl.innerHTML = `<div class="game-panel game-room-panel"><p class="tic-tac-toe-status">${isCreator ? "Waiting for your partner to join from their device…" : `${esc(opponentName)} is waiting. Join the match to play!`}</p>${isCreator ? `<button type="button" class="secondary" data-room-cancel>Cancel match</button>` : `<button type="button" class="primary" data-room-start>Join match</button>`}</div>${matchLeaderboard(activeGame)}`;
      content.replaceChildren();
      return;
    }

    const isTurn = room.turnUid === user.uid;
    if (!room.playerUids.includes(user.uid)) {
      statusEl.innerHTML = `<div class="game-panel game-room-panel"><p class="tic-tac-toe-status">This match is already in progress with your partner.</p></div>${matchLeaderboard(activeGame)}`;
      content.replaceChildren();
      return;
    }
    const opponentState = players[opponentUid]?.state;
    const progress = opponentState
      ? activeGame === "emoji-quiz" || activeGame === "couple-trivia"
        ? `Question ${Math.min(opponentState.question + 1, opponentState.questions.length)} of ${opponentState.questions.length}`
        : activeGame === "memory-match"
          ? `${opponentState.matched.length / 2} of ${symbols.length} pairs`
          : activeGame === "spin-wheel"
            ? `${opponentState.completedChallenges}/3 challenges`
            : "playing now"
      : "their round hasn't started yet";
    if (activeGame === "word-guess") {
      message = room.wordPhase === "setter"
        ? isTurn
          ? "Your turn: choose a secret word. Your partner will guess it."
          : `${opponentName} is choosing a secret word for you to guess.`
        : isTurn
          ? `${opponentName} chose a word — it's your turn to guess!`
          : `Your partner is guessing the word you chose.`
    } else if (activeGame === "couple-trivia") {
      message = room.triviaStage === "first"
        ? isTurn ? "Your turn to answer. Your partner will guess next." : `${opponentName} is answering; then it's your turn to guess.`
        : room.triviaStage === "guess"
          ? isTurn ? `${opponentName} answered — your turn to guess!` : "You answered. Waiting for your partner to guess…"
          : isTurn ? "Your partner guessed. Review the answer and continue." : `${opponentName} is reviewing the answer.`
    } else message = isTurn
      ? players[opponentUid]?.completed
        ? "Your partner has finished their turn — now it's your turn!"
        : "Your turn! Your partner will play after you finish."
      : `${opponentName} is taking their turn (${progress}). Your turn starts next.`;
    const scoreRule = {
      "memory-match": "Fewest moves wins.",
      "word-guess": "Guess correctly to earn points; efficient guesses earn more.",
      "emoji-quiz": "Most correct answers wins.",
      "spin-wheel": "Fastest to complete three challenges wins.",
      "couple-trivia": "Each correct partner guess earns a point."
    }[activeGame];
    const scoreValue = uid => activeGame === "memory-match" || activeGame === "spin-wheel"
      ? players[uid]?.completed ? formatGameScore(activeGame, players[uid].score) : "—"
      : formatGameScore(activeGame, players[uid]?.score);
    statusEl.innerHTML = `<div class="game-panel game-room-panel"><p class="tic-tac-toe-status">${esc(message)}</p><p class="muted">${esc(getDisplayName(room.playerUids[0], players[room.playerUids[0]]?.name || "Player 1"))}: ${esc(scoreValue(room.playerUids[0]))} · ${esc(getDisplayName(room.playerUids[1], players[room.playerUids[1]]?.name || "Player 2"))}: ${esc(scoreValue(room.playerUids[1]))}</p>${scoreRule ? `<p class="muted">${esc(scoreRule)}</p>` : ""}<button type="button" class="secondary" data-room-end>End this match</button></div>${matchLeaderboard(activeGame)}`;
    if (!isTurn) {
      content.innerHTML = `<div class="game-panel"><p class="games-instructions">Your partner's turn is in progress. You can leave this page; your turn will be ready when they finish.</p></div>`;
      return;
    }
    const playerState = activeGame === "word-guess" && room.wordPhase === "guessing"
      ? room.wordRound
      : activeGame === "couple-trivia"
        ? {
            questions: room.questions,
            question: room.triviaQuestionIndex,
            stage: room.triviaStage,
            answer: room.triviaAnswer,
            guess: room.triviaGuess,
            answerer: getDisplayName(room.triviaAnswererUid, players[room.triviaAnswererUid]?.name || "Your partner"),
            score: players[user.uid]?.score || 0,
            canAdvance: isTurn
          }
        : players[user.uid]?.state;
    if (playerState) {
      activeState = activeGame === "memory-match" && playerState.locked
        ? { ...playerState, flipped: [], locked: false }
        : playerState;
      renderActiveGame(el, activeGame, user, profile, activeState, true);
      if (activeState !== playerState) saveRoomPlayerState();
    } else {
      content.innerHTML = `<div class="game-panel"><p class="games-instructions">Preparing your saved turn…</p></div>`;
      initializeRoomTurn(room);
    }
    if (activeGame !== "couple-trivia" && gameIsComplete(activeGame, activeState)) {
      statusEl.querySelector(".game-room-panel")?.insertAdjacentHTML("beforeend", `<button type="button" class="primary" data-room-finish>Finish my turn</button>`);
    }
  }

  async function initializeRoomTurn(room) {
    const token = `${room.matchId}:${user.uid}`;
    if (roomStateInitializing === token) return;
    roomStateInitializing = token;
    const initialState = resetActiveGame(activeGame);
    activeState = initialState;
    try {
      await runTransaction(gameMatchRef(activeGame), current => {
        if (!current || current.matchId !== room.matchId || current.status !== "playing" || current.turnUid !== user.uid) return;
        const player = current.players?.[user.uid];
        if (!player || player.state) return;
        return {
          ...current,
          players: { ...current.players, [user.uid]: { ...player, state: initialState } },
          updatedAt: Date.now()
        };
      });
    } catch (error) {
      roomStateInitializing = "";
      console.error("Could not prepare game turn:", error);
      toast("Your turn could not be loaded. Please try again.");
    }
  }

  function saveRoomPlayerState() {
    const room = gameRoomState;
    if (!room || room.status !== "playing" || room.turnUid !== user.uid || !activeState) return;
    const matchId = room.matchId;
    const state = activeState;
    runTransaction(gameMatchRef(activeGame), current => {
      if (!current || current.matchId !== matchId || current.status !== "playing" || current.turnUid !== user.uid) return;
      if (activeGame === "word-guess" && current.wordPhase === "guessing") {
        return { ...current, wordRound: state, updatedAt: Date.now() };
      }
      const player = current.players?.[user.uid];
      if (!player) return;
      return {
        ...current,
        players: { ...current.players, [user.uid]: { ...player, state } },
        updatedAt: Date.now()
      };
    }).catch(error => {
      console.error("Could not save game turn:", error);
      toast("Your game progress could not be saved.");
    });
  }

  function renderAndSavePlayerProgress() {
    renderCurrentGame();
    saveRoomPlayerState();
  }

  function recordFinishedMatch(room) {
    if (!room?.matchId || savedMatchResults.has(room.matchId) || !firebaseReady) return;
    savedMatchResults.add(room.matchId);
    const scores = Object.fromEntries(room.playerUids.map(uid => [uid, room.players[uid]?.score]));
    recordGameMatchResult({
      uid: user.uid,
      authorId: profile?.id || user.uid,
      matchId: room.matchId,
      game: gameTitles[activeGame],
      winnerUid: room.winnerUid,
      players: room.playerUids,
      scores
    }).catch(error => {
      savedMatchResults.delete(room.matchId);
      console.error("Could not save game result:", error);
      toast("The match ended, but its result could not be saved.");
    });
  }

  function renderCurrentGame() {
    if (!activeGame) {
      document.body.classList.remove("sos-fullscreen");
      disposeFindTheWords?.();
      disposeFindTheWords = null;
      el.innerHTML = gamesHome();
      renderedShellGame = "";
      buildDailyBoard();
      if (dailyGameItems) renderDailyWins(dailyGameItems);
      listenForDailyWins();
      return;
    }
    if (activeGame === "sos") {
      document.body.classList.add("sos-fullscreen");
      if (renderedShellGame !== activeGame) {
        el.innerHTML = `<div id="games-active-content" data-active-game="sos"></div>`;
        renderedShellGame = activeGame;
      }
      if (!rtdb) {
        $("#games-active-content", el).innerHTML = `<section class="sos-game-page"><header class="sos-header"><button class="sos-back" type="button" data-back-games>← Games</button><h1>SOS</h1></header><p class="error sos-error">Live SOS is unavailable because Firebase Realtime Database is not configured.</p></section>`;
        return;
      }
      renderSosGame($("#games-active-content", el), user, sosGameState, sosPresence, selectedSosLetter);
      return;
    }
    document.body.classList.remove("sos-fullscreen");
    if (activeGame === "find-words") {
      if (renderedShellGame !== activeGame) {
        el.innerHTML = `<section id="find-words-game"></section>`;
        renderedShellGame = activeGame;
      }
      if (!disposeFindTheWords) {
        disposeFindTheWords = mountFindTheWordsGame($("#find-words-game", el), user, profile);
      }
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
    if (renderedShellGame !== activeGame) {
      el.innerHTML = activeShell(activeGame, ...gameInfo);
      renderedShellGame = activeGame;
    }
    if (activeGame === "tic-tac-toe" && !rtdb) {
      $("#games-active-content", el).innerHTML = `<div class="game-panel"><p class="error">Live Tic Tac Toe is unavailable because Firebase Realtime Database is not configured.</p></div>`;
      return;
    }
    if (activeGame !== "tic-tac-toe") {
      renderGameRoom();
      return;
    }
    renderActiveGame(el, activeGame, user, profile, activeGame === "tic-tac-toe" ? ticTacToeState : activeState);
  }

  function listenForDailyWins() {
    if (stopGames) return;
    if (!firebaseReady) {
      const listEl = $("#game-scores-list", el);
      if (listEl) listEl.innerHTML = `<p class="muted">Connect Firebase to load game wins.</p>`;
      return;
    }
    try {
      stopGames = watchItems("game", items => {
        dailyGameItems = items || [];
        if (activeGame) renderCurrentGame();
        else renderDailyWins(dailyGameItems);
      }, error => {
        console.error("Game scores could not be loaded:", error);
        const listEl = $("#game-scores-list", el);
        if (listEl) listEl.innerHTML = `<p class="muted">Game wins could not be loaded.</p>`;
      });
    } catch (error) {
      console.error("Game scores could not be loaded:", error);
      const listEl = $("#game-scores-list", el);
      if (listEl) listEl.innerHTML = `<p class="muted">Game wins could not be loaded.</p>`;
    }
  }

  function renderDailyWins(items) {
    const listEl = $("#game-scores-list", el);
    if (!listEl) return;
    const leaderboards = $("#games-leaderboards", el);
    if (leaderboards) leaderboards.innerHTML = Object.keys(gameTitles)
      .map(game => matchLeaderboard(game))
      .join("");
    refreshDailyTarget();
    if (items.length === 0) {
      listEl.innerHTML = `<p class="muted">No wins recorded yet.</p>`;
      return;
    }

    const wins = uniqueMatchResults(items.filter(item => item.result === "won"));
    const alreadyWonToday = Boolean(ownDailyWin());
    if (alreadyWonToday && !finished) buildDailyBoard();
    if (alreadyWonToday) {
      const resultText = $("#game-result", el);
      if (resultText) resultText.textContent = "You already found today's hidden heart ♡";
    }

    const timestamp = item => {
      const value = item.createdAt?.toDate?.() || (item.createdAt ? new Date(item.createdAt) : null);
      return value && Number.isFinite(value.getTime()) ? value.getTime() : 0;
    };
    const recentWins = [...wins].sort((first, second) => timestamp(second) - timestamp(first)).slice(0, 5);
    if (recentWins.length === 0) {
      listEl.innerHTML = `<p class="muted">No wins recorded yet.</p>`;
      return;
    }
    listEl.innerHTML = recentWins.map(win => {
      const createdAt = win.createdAt?.toDate?.() || (win.createdAt ? new Date(win.createdAt) : null);
      const date = createdAt && Number.isFinite(createdAt.getTime())
        ? createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : "Today";
      const winnerUid = win.winnerUid || win.author;
      const name = winnerUid === user.uid ? "You" : getDisplayName(winnerUid, "Your partner");
      const label = isDailyHeartWin(win) ? "found the hidden heart" : `won ${win.game || "a game"}`;
      return `<div class="score-item"><span>🎯 ${esc(name)} ${esc(label)}</span><span>${esc(date)}</span></div>`;
    }).join("");
  }

  buildDailyBoard();
  scheduleDailyRollover();
  listenForDailyWins();

  el.onclick = async event => {
    const target = event.target.closest("button");
    if (!target || !el.contains(target)) return;
    const turnOnlyActions = [
      "data-memory-card", "data-word-letter", "data-emoji-answer", "data-next-emoji",
      "data-spin-wheel", "data-complete-challenge", "data-trivia-answer", "data-trivia-guess", "data-next-trivia"
    ];
    if (activeGame && activeGame !== "tic-tac-toe" &&
        turnOnlyActions.some(attribute => target.hasAttribute(attribute)) &&
        (gameRoomState?.status !== "playing" || gameRoomState.turnUid !== user.uid)) {
      toast("Please wait for your turn.");
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-start-game")) {
      if (target.dataset.startGame === "daily-hidden-heart") {
        const board = $("#hidden-heart-game", el);
        board.classList.toggle("hidden");
        return;
      }
      if (memoryTimer) clearTimeout(memoryTimer);
      memoryTimer = null;
      clearSosSession();
      stopTicTacToe?.();
      stopTicTacToe = null;
      stopGameMatch?.();
      stopGameMatch = null;
      disposeFindTheWords?.();
      disposeFindTheWords = null;
      activeGame = target.dataset.startGame;
      activeState = resetActiveGame(activeGame);
      ticTacToeState = null;
      sosGameState = null;
      sosPresence = {};
      selectedSosLetter = "S";
      gameRoomState = null;
      if (activeGame === "sos") {
        startSosSession();
      } else if (activeGame === "tic-tac-toe") {
        if (rtdb) {
          stopTicTacToe = onValue(ticTacToeRef(), snapshot => {
            const previousState = ticTacToeState;
            ticTacToeState = snapshot.val();
            const content = $("#games-active-content", el);
            if (activeGame === "tic-tac-toe" && content) renderTicTacToe(content, user, ticTacToeState);
            if (isValidTicTacToeState(ticTacToeState) &&
                ticTacToeState.status === "finished" &&
                previousState?.status === "playing" &&
                previousState.matchId === ticTacToeState.matchId &&
                !ticTacToeState.endedByUid &&
                ticTacToeState.xUid &&
                ticTacToeState.oUid) {
              const matchId = ticTacToeState.matchId || `${ticTacToeState.updatedAt}-${ticTacToeState.xUid}`;
              if (!savedMatchResults.has(matchId) && firebaseReady) {
                savedMatchResults.add(matchId);
                recordGameMatchResult({
                  uid: user.uid,
                  authorId: profile?.id || user.uid,
                  matchId,
                  game: gameTitles["tic-tac-toe"],
                  winnerUid: ticTacToeState.winnerUid,
                  players: [ticTacToeState.xUid, ticTacToeState.oUid],
                  scores: {
                    [ticTacToeState.xUid]: ticTacToeState.winnerUid === ticTacToeState.xUid ? 1 : 0,
                    [ticTacToeState.oUid]: ticTacToeState.winnerUid === ticTacToeState.oUid ? 1 : 0
                  }
                }).catch(error => {
                  savedMatchResults.delete(matchId);
                  console.error("Could not save Tic Tac Toe result:", error);
                  toast("The match ended, but its result could not be saved.");
                });
              }
            }
          }, error => {
            console.error("Tic Tac Toe could not be loaded:", error);
            const content = $("#games-active-content", el);
            if (content) content.innerHTML = `<div class="game-panel"><p class="error">The live game could not be loaded. Please try again.</p></div>`;
          });
        } else {
          ticTacToeState = null;
        }
      } else if (rtdb && activeGame !== "find-words") {
        stopGameMatch = onValue(gameMatchRef(activeGame), snapshot => {
          gameRoomState = snapshot.val();
          if (gameRoomState?.status === "finished") recordFinishedMatch(gameRoomState);
          if (gameRoomState?.matchId !== roomStateInitializing?.split(":")[0]) roomStateInitializing = "";
          renderCurrentGame();
        }, error => {
          console.error("Game match could not be loaded:", error);
          const status = $("#games-room-status", el);
          if (status) status.innerHTML = `<p class="error">This game match could not be loaded. Please try again.</p>`;
        });
      }
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-room-start")) {
      if (!rtdb) {
        toast("Two-player games need Firebase Realtime Database.");
        return;
      }
      try {
        const transaction = await runTransaction(gameMatchRef(activeGame), current => {
          if (!current || current.status === "finished" || current.status === "cancelled") {
                const matchId = `${Date.now()}-${user.uid}`;
            return {
              matchId,
              game: activeGame,
              status: "waiting",
              playerUids: [user.uid],
              turnUid: "",
              winnerUid: "",
              wordPhase: activeGame === "word-guess" ? "setter" : "",
              wordRoundNumber: 0,
              wordSetterUid: activeGame === "word-guess" ? user.uid : "",
              wordRound: null,
              questions: activeGame === "couple-trivia" ? makeTriviaQuestions() : [],
              triviaQuestionIndex: 0,
              triviaStage: "first",
              triviaAnswererUid: user.uid,
              triviaAnswer: -1,
              triviaGuess: -1,
              players: {
                [user.uid]: { name: getDisplayName(user.uid, profile?.name), score: 0, completed: false, state: null }
              },
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
          }
          if (current.status === "waiting" && !current.playerUids.includes(user.uid)) {
            return {
              ...current,
              playerUids: [...current.playerUids, user.uid],
              players: {
                ...current.players,
                [user.uid]: { name: getDisplayName(user.uid, profile?.name), score: 0, completed: false, state: null }
              },
              status: "playing",
              turnUid: current.game === "couple-trivia" ? current.triviaAnswererUid : current.playerUids[0],
              updatedAt: Date.now()
            };
          }
          return;
        });
        if (!transaction.committed) toast("This match is already in progress or waiting for your partner.");
      } catch (error) {
        console.error("Could not start game match:", error);
        toast("Could not start or join this match. Please try again.");
      }
      return;
    }

    if (target.hasAttribute("data-room-cancel")) {
      try {
        const transaction = await runTransaction(gameMatchRef(activeGame), current => {
          if (!current || current.status !== "waiting" || current.playerUids[0] !== user.uid) return;
          return { ...current, status: "cancelled", updatedAt: Date.now() };
        });
        if (!transaction.committed) toast("This match can no longer be cancelled.");
      } catch (error) {
        console.error("Could not cancel game match:", error);
        toast("The waiting match could not be cancelled.");
      }
      return;
    }

    if (target.hasAttribute("data-room-end")) {
      try {
        const transaction = await runTransaction(gameMatchRef(activeGame), current => {
          if (!current || current.status !== "playing" || !current.playerUids.includes(user.uid)) return;
          return { ...current, status: "cancelled", turnUid: "", updatedAt: Date.now() };
        });
        if (!transaction.committed) toast("This match is no longer active.");
      } catch (error) {
        console.error("Could not end game match:", error);
        toast("The match could not be ended. Please try again.");
      }
      return;
    }

    if (target.hasAttribute("data-room-finish")) {
      const room = gameRoomState;
      const opponentUid = room?.playerUids?.find(uid => uid !== user.uid);
      if (!room || !opponentUid || !gameIsComplete(activeGame, activeState)) return;
      try {
        const transaction = await runTransaction(gameMatchRef(activeGame), current => {
          if (!current || current.matchId !== room.matchId || current.status !== "playing" ||
                current.turnUid !== user.uid) return;
            if (activeGame === "word-guess") {
              if (current.wordPhase !== "guessing" || !gameIsComplete(activeGame, current.wordRound)) return;
              const setterUid = current.wordSetterUid;
              const guesserScore = (current.players[user.uid].score || 0) +
                (gameScore(activeGame, current.wordRound) ? 1 : 0);
              const setterScore = (current.players[setterUid].score || 0) +
                (gameScore(activeGame, current.wordRound) ? 0 : 1);
              const players = {
                ...current.players,
                [user.uid]: { ...current.players[user.uid], score: guesserScore, completed: false, state: null },
                [setterUid]: { ...current.players[setterUid], score: setterScore, completed: false, state: null }
              };
              if (current.wordRoundNumber === 1) {
                players[user.uid].completed = true;
                players[setterUid].completed = true;
                const winnerUid = gameWinner(activeGame, current.playerUids, players);
                return { ...current, players, status: "finished", winnerUid, turnUid: "", wordPhase: "result", updatedAt: Date.now() };
              }
              return {
                ...current,
                players,
                wordRound: null,
                wordRoundNumber: 1,
                wordPhase: "setter",
                wordSetterUid: user.uid,
                turnUid: user.uid,
                updatedAt: Date.now()
              };
            }
            if (!gameIsComplete(activeGame, current.players?.[user.uid]?.state)) return;
          const players = {
            ...current.players,
            [user.uid]: {
              ...current.players[user.uid],
              score: gameScore(activeGame, current.players[user.uid].state),
              completed: true,
              state: null
            }
          };
          if (players[opponentUid]?.completed) {
            const winnerUid = gameWinner(activeGame, current.playerUids, players);
            return { ...current, players, status: "finished", winnerUid, turnUid: "", updatedAt: Date.now() };
          }
          return { ...current, players, turnUid: opponentUid, updatedAt: Date.now() };
        });
        if (!transaction.committed) toast("Your turn has changed. Refresh the match status.");
      } catch (error) {
        console.error("Could not finish game turn:", error);
        toast("Your turn could not be saved. Please try again.");
      }
      return;
    }

    if (target.hasAttribute("data-back-games")) {
      if (memoryTimer) clearTimeout(memoryTimer);
      memoryTimer = null;
      stopTicTacToe?.();
      stopTicTacToe = null;
      stopGameMatch?.();
      stopGameMatch = null;
      activeGame = "";
      activeState = null;
      ticTacToeState = null;
      gameRoomState = null;
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-reset-game")) {
      activeState = resetActiveGame(activeGame);
      renderAndSavePlayerProgress();
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
          renderAndSavePlayerProgress();
          memoryTimer = setTimeout(() => {
            if (activeGame !== "memory-match") return;
            activeState.flipped = [];
            activeState.locked = false;
            memoryTimer = null;
            renderAndSavePlayerProgress();
          }, 800);
          return;
        }
      }
      renderAndSavePlayerProgress();
      return;
    }

    if (target.hasAttribute("data-word-letter")) {
      const letter = target.dataset.wordLetter;
      if (activeState.guessed.includes(letter)) return;
      activeState.guessed.push(letter);
      if (!activeState.word.toLocaleLowerCase().includes(letter)) activeState.guessesLeft--;
      renderAndSavePlayerProgress();
      return;
    }

    if (target.hasAttribute("data-emoji-answer")) {
      const question = activeState.questions[activeState.question];
      const answer = Number(target.dataset.emojiAnswer);
      activeState.answered = true;
      activeState.selected = answer;
      if (answer === question.answer) activeState.score++;
      renderAndSavePlayerProgress();
      return;
    }

    if (target.hasAttribute("data-next-emoji")) {
      activeState.question++;
      activeState.answered = false;
      activeState.selected = -1;
      renderAndSavePlayerProgress();
      return;
    }

    if (target.hasAttribute("data-spin-wheel")) {
      const available = challenges.filter(challenge => challenge !== activeState.challenge);
      activeState.challenge = available[Math.floor(Math.random() * available.length)];
      renderAndSavePlayerProgress();
      return;
    }

    if (target.hasAttribute("data-complete-challenge")) {
      activeState.completedChallenges++;
      activeState.challenge = "";
      renderAndSavePlayerProgress();
      return;
    }

    if (target.hasAttribute("data-trivia-answer")) {
      if (activeGame === "couple-trivia" && gameRoomState?.status === "playing") {
        const opponentUid = gameRoomState.playerUids.find(uid => uid !== user.uid);
        try {
          const transaction = await runTransaction(gameMatchRef(activeGame), current => {
            if (!current || current.status !== "playing" || current.triviaStage !== "first" ||
                current.turnUid !== user.uid || current.triviaAnswererUid !== user.uid) return;
            return {
              ...current,
              triviaAnswer: Number(target.dataset.triviaAnswer),
              triviaStage: "guess",
              triviaGuess: -1,
              turnUid: opponentUid,
              updatedAt: Date.now()
            };
          });
          if (!transaction.committed) toast("It is not your turn to answer this question.");
        } catch (error) {
          console.error("Could not save trivia answer:", error);
          toast("Your answer could not be saved.");
        }
        return;
      }
      activeState.answer = Number(target.dataset.triviaAnswer);
      activeState.answerer = getDisplayName(user.uid, profile?.name);
      activeState.stage = "guess";
      renderAndSavePlayerProgress();
      return;
    }

    if (target.hasAttribute("data-trivia-guess")) {
      if (activeGame === "couple-trivia" && gameRoomState?.status === "playing") {
        const guess = Number(target.dataset.triviaGuess);
        const answererUid = gameRoomState.triviaAnswererUid;
        try {
          const transaction = await runTransaction(gameMatchRef(activeGame), current => {
            if (!current || current.status !== "playing" || current.triviaStage !== "guess" ||
                current.turnUid !== user.uid || current.triviaAnswererUid === user.uid) return;
            const player = current.players[user.uid];
            return {
              ...current,
              triviaGuess: guess,
              triviaStage: "result",
              turnUid: answererUid,
              players: {
                ...current.players,
                [user.uid]: {
                  ...player,
                  score: player.score + (guess === current.triviaAnswer ? 1 : 0)
                }
              },
              updatedAt: Date.now()
            };
          });
          if (!transaction.committed) toast("It is not your turn to guess this answer.");
        } catch (error) {
          console.error("Could not save trivia guess:", error);
          toast("Your guess could not be saved.");
        }
        return;
      }
      activeState.guess = Number(target.dataset.triviaGuess);
      activeState.stage = "result";
      if (activeState.guess === activeState.answer) activeState.score++;
      renderAndSavePlayerProgress();
      return;
    }

    if (target.hasAttribute("data-next-trivia")) {
      if (activeGame === "couple-trivia" && gameRoomState?.status === "playing") {
        try {
          const transaction = await runTransaction(gameMatchRef(activeGame), current => {
            if (!current || current.status !== "playing" || current.triviaStage !== "result" ||
                current.turnUid !== user.uid || current.triviaAnswererUid !== user.uid) return;
            if (current.triviaQuestionIndex >= current.questions.length - 1) {
              const winnerUid = gameWinner(activeGame, current.playerUids, current.players);
              return {
                ...current,
                status: "finished",
                turnUid: "",
                winnerUid,
                triviaStage: "finished",
                updatedAt: Date.now()
              };
            }
            const nextAnswererUid = current.playerUids.find(uid => uid !== current.triviaAnswererUid);
            return {
              ...current,
              triviaQuestionIndex: current.triviaQuestionIndex + 1,
              triviaAnswererUid: nextAnswererUid,
              triviaAnswer: -1,
              triviaGuess: -1,
              triviaStage: "first",
              turnUid: nextAnswererUid,
              updatedAt: Date.now()
            };
          });
          if (!transaction.committed) toast("This question has already changed.");
        } catch (error) {
          console.error("Could not continue Couple Trivia:", error);
          toast("The next question could not be loaded.");
        }
        return;
      }
      activeState.question++;
      activeState.stage = "first";
      activeState.answer = -1;
      activeState.guess = -1;
      activeState.answerer = "";
      renderAndSavePlayerProgress();
      return;
    }

    if (target.hasAttribute("data-ttt-start")) {
      if (!rtdb) {
        toast("Live Tic Tac Toe is unavailable because Firebase Realtime Database is not configured.");
        return;
      }
      try {
        const transaction = await runTransaction(ticTacToeRef(), current => {
          if (!isValidTicTacToeState(current) || current.status === "finished" || (current.status === "waiting" && current.xUid === user.uid)) {
            return { status: "waiting", matchId: `${Date.now()}-${user.uid}`, xUid: user.uid, oUid: "", board: Array(9).fill(""), turnUid: user.uid, winnerUid: "", endedByUid: "", updatedAt: Date.now() };
          }
          if (current.status === "waiting" && current.xUid !== user.uid && !current.oUid) {
            return { ...current, oUid: user.uid, status: "playing", turnUid: current.xUid, updatedAt: Date.now() };
          }
          return;
        });
        if (!transaction.committed) toast("That match changed before your action. Please try again.");
      } catch (error) {
        console.error("Could not start Tic Tac Toe:", error);
        toast("Could not start the live game. Please try again.");
      }
      return;
    }

    if (target.hasAttribute("data-ttt-reset")) {
      if (!rtdb) {
        toast("Live Tic Tac Toe is unavailable because Firebase Realtime Database is not configured.");
        return;
      }
      try {
        const transaction = await runTransaction(ticTacToeRef(), current => {
          if (!isValidTicTacToeState(current)) return;
          const isWaitingOwner = current.status === "waiting" && current.xUid === user.uid;
          const isActivePlayer = current.status === "playing" && (current.xUid === user.uid || current.oUid === user.uid);
          if (!isWaitingOwner && !isActivePlayer) return;
          return {
            ...current,
            status: "finished",
            turnUid: "",
            winnerUid: "",
            endedByUid: user.uid,
            cancelled: isWaitingOwner,
            updatedAt: Date.now()
          };
        });
        if (!transaction.committed) toast("This match can no longer be ended.");
      } catch (error) {
        console.error("Could not end Tic Tac Toe:", error);
        toast("The match could not be ended. Please try again.");
      }
      return;
    }

    if (target.hasAttribute("data-ttt-cell")) {
      const index = Number(target.dataset.tttCell);
      if (!rtdb) {
        toast("Live Tic Tac Toe is unavailable because Firebase Realtime Database is not configured.");
        return;
      }
      try {
        const transaction = await runTransaction(ticTacToeRef(), current => {
          if (!isValidTicTacToeState(current) || !Number.isInteger(index) || index < 0 || index >= 9 ||
              current.status !== "playing" || current.turnUid !== user.uid || current.board[index] !== "") return;
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
        if (!transaction.committed) toast("That move was not accepted. The board may have changed.");
      } catch (error) {
        console.error("Could not make Tic Tac Toe move:", error);
        toast("Your move could not be saved. Please try again.");
      }
    }
  };

  el.onsubmit = async event => {
    if (event.target.id !== "word-guess-setup") return;
    event.preventDefault();
    const input = $("#word-guess-word", el);
    const word = input.value.trim().replace(/\s+/g, " ");
    const error = $(".game-form-error", event.target);
    const letterCount = (word.match(/[a-z]/gi) || []).length;
    if (!/^[a-zA-Z ]{3,32}$/.test(word) || letterCount < 3) {
      error.textContent = "Please choose a word with 3–32 letters.";
      return;
    }
    activeState = { word, guessed: [], guessesLeft: 7 };
    if (activeGame === "word-guess" && gameRoomState?.status === "playing") {
      const opponentUid = gameRoomState.playerUids.find(uid => uid !== user.uid);
      try {
        const transaction = await runTransaction(gameMatchRef(activeGame), current => {
          if (!current || current.status !== "playing" || current.wordPhase !== "setter" ||
              current.turnUid !== user.uid || current.wordRoundNumber > 1) return;
          return {
            ...current,
            wordRound: activeState,
            wordPhase: "guessing",
            wordSetterUid: user.uid,
            turnUid: opponentUid,
            players: {
              ...current.players,
              [user.uid]: { ...current.players[user.uid], state: null }
            },
            updatedAt: Date.now()
          };
        });
        if (!transaction.committed) toast("It is not your turn to set a word.");
      } catch (saveError) {
        console.error("Could not save secret word:", saveError);
        toast("Your secret word could not be saved.");
      }
      return;
    }
    renderAndSavePlayerProgress();
  };

}

export function disposeGames() {
  stopGames?.();
  stopGames = null;
  stopTicTacToe?.();
  stopTicTacToe = null;
  stopGameMatch?.();
  stopGameMatch = null;
  if (memoryTimer) clearTimeout(memoryTimer);
  memoryTimer = null;
  if (dailyRolloverTimer) clearTimeout(dailyRolloverTimer);
  dailyRolloverTimer = null;
  disposeFindTheWords?.();
  disposeFindTheWords = null;
}
