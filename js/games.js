import { $, toast, esc } from "./utils.js";
import { recordGameMatchResult, watchItems, notifyPartnerSafely } from "./firestore.js";
import { firebaseReady, rtdb } from "./firebase.js";
import { getDisplayName, getProfileKey } from "./profile-data.js";
import { APP_CONFIG } from "../config/app-config.js";
import { mountFindTheWordsGame } from "./find-the-words.js";
import { TRUE_FALSE_BANK_VERSION, TRUE_FALSE_QUESTION_BANK, pickTrueFalseQuestions } from "./true-false-question-bank.js";
import { get, onDisconnect, onValue, ref, remove, runTransaction, set } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const sosGameRef = () => ref(rtdb, `couples/${APP_CONFIG.coupleId}/games/sos`);
const sosPresenceRef = uid => ref(rtdb, `couples/${APP_CONFIG.coupleId}/games/sosPresence/${uid}`);
const gameMatchRef = game => ref(rtdb, `couples/our-little-world/games/matches/${game}`);
const trueFalseBankRef = () => ref(rtdb, `couples/${APP_CONFIG.coupleId}/games/questionBanks/trueFalse`);
const SOS_ROWS = 10;
const SOS_COLUMNS = 10;
const SOS_CELL_COUNT = SOS_ROWS * SOS_COLUMNS;
const SOS_TURN_SECONDS = 20;
const SOS_DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const symbols = ["🌸", "🌙", "🍓", "🐻", "💌", "🦋", "✨", "🧸", "🌻", "💖"];
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

let stopGames = null;
let stopSosGame = null;
let stopSosPresence = null;
let stopSosAppPresence = null;
let stopSosConnection = null;
let stopGameMatch = null;
let memoryTimer = null;
let disposeFindTheWords = null;
let sosClock = null;
let sosServerTimeOffset = 0;
let stopSosServerTime = null;

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
  "spin-wheel": "Spin Wheel",
  "couple-trivia": "Couple Trivia",
  sos: "SOS",
  "true-false": "True or False"
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
      (state.lines != null && !Array.isArray(state.lines)) ||
      !(state.lines || []).every(line => Array.isArray(line.cells) && line.cells.length === 3 &&
        line.cells.every(index => Number.isInteger(index) && index >= 0 && index < SOS_CELL_COUNT) &&
        state.board[line.cells[0]] === "S" && state.board[line.cells[1]] === "O" &&
        state.board[line.cells[2]] === "S" && state.playerUids.includes(line.uid))) return false;
  if (state.status === "waiting") return state.playerUids.length === 1 && !state.turnUid;
  if (state.status === "playing") return state.playerUids.length === 2 && state.playerUids.includes(state.turnUid) && Number.isFinite(state.turnDeadline);
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

function makeSosWaitingState(uid, name) {
  return {
    matchId: `${Date.now()}-${uid}`,
    status: "waiting",
    playerUids: [uid],
    players: { [uid]: { name } },
    board: Array(SOS_CELL_COUNT).fill(""),
    owners: Array(SOS_CELL_COUNT).fill(""),
    scores: { [uid]: 0 },
    lines: [],
    turnUid: "",
    turnDeadline: 0,
    turnNumber: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function secondsUntilTurn(state) {
  if (!state?.turnDeadline) return SOS_TURN_SECONDS;
  return Math.max(0, Math.ceil((state.turnDeadline - (Date.now() + sosServerTimeOffset)) / 1000));
}

function gameIsComplete(game, state) {
  if (!state) return false;
  if (game === "memory-match") return Array.isArray(state.matched) && Array.isArray(state.cards) &&
    state.cards.length > 0 && state.matched.length === state.cards.length;
  if (game === "word-guess") {
    if (typeof state.word !== "string" || !Array.isArray(state.guessed)) return false;
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
    if (typeof state.word !== "string" || !Array.isArray(state.guessed) || !Number.isInteger(state.guessesLeft)) return 0;
    const solved = [...state.word.toLocaleLowerCase()].every(char => !/[a-z]/.test(char) || state.guessed.includes(char));
    return solved ? state.guessesLeft + 1 : 0;
  }
  if (game === "emoji-quiz" || game === "couple-trivia") return state.score;
  if (game === "spin-wheel") return Date.now() - state.startedAt;
  return 0;
}

// Firebase Realtime Database does not store empty arrays, so [] comes back as undefined.
// Restore them so saved game state stays valid.
function normalizeActiveState(game, state) {
  if (!state || typeof state !== "object") return state;
  if (game === "memory-match") {
    state.flipped = state.flipped || [];
    state.matched = state.matched || [];
  } else if (game === "word-guess") {
    state.guessed = state.guessed || [];
  }
  return state;
}

function normalizeRoom(room) {
  if (!room || typeof room !== "object") return room;
  const game = room.game;
  if (room.players && typeof room.players === "object") {
    for (const player of Object.values(room.players)) {
      if (player?.state) normalizeActiveState(game, player.state);
    }
  }
  if (room.wordRound) normalizeActiveState("word-guess", room.wordRound);
  if (room.game === "true-false") room.trueFalseAnswers = room.trueFalseAnswers || {};
  return room;
}

function isValidTrueFalseRoom(room) {
  const questions = room.trueFalseQuestions;
  const answers = room.trueFalseAnswers || {};
  if (!Array.isArray(questions) || questions.length !== 12 ||
      !questions.every(question => question && typeof question.id === "string" && Number.isInteger(question.factId) &&
        typeof question.statement === "string" && typeof question.answer === "boolean" &&
        typeof question.explanation === "string" && typeof question.sourceUrl === "string") ||
      !Number.isInteger(room.trueFalseQuestionIndex) || room.trueFalseQuestionIndex < 0 ||
      room.trueFalseQuestionIndex >= questions.length ||
      !["answering", "reveal", "finished"].includes(room.trueFalsePhase) ||
      !answers || typeof answers !== "object" || Array.isArray(answers) ||
      Object.entries(answers).some(([uid, answer]) => !room.playerUids.includes(uid) || typeof answer !== "boolean")) return false;
  const answerCount = Object.keys(answers).length;
  if (room.status === "waiting") return room.playerUids.length === 1 && !room.turnUid && answerCount === 0;
  if (room.status === "playing") return room.playerUids.length === 2 && room.playerUids.includes(room.turnUid) &&
    ((room.trueFalsePhase === "answering" && answerCount < 2) || (room.trueFalsePhase === "reveal" && answerCount === 2));
  if (room.status === "finished") return room.playerUids.length === 2 && !room.turnUid &&
    room.trueFalsePhase === "finished" && answerCount === 2 &&
    (!room.winnerUid || room.playerUids.includes(room.winnerUid));
  return false;
}

function isValidActiveGameState(game, state) {
  if (!state || typeof state !== "object") return false;
  state = normalizeActiveState(game, { ...state });
  if (game === "memory-match") return Array.isArray(state.cards) &&
    (state.cards.length === symbols.length * 2 || state.cards.length === 20 || state.cards.length === 12) &&
    state.cards.every(symbol => typeof symbol === "string" && symbol) && Array.isArray(state.flipped) &&
    Array.isArray(state.matched) && Number.isInteger(state.moves) && state.moves >= 0 &&
    typeof state.locked === "boolean";
  if (game === "word-guess") return typeof state.word === "string" && state.word.length <= 32 &&
    (state.word === "" || (/^[a-zA-Z ]{3,32}$/.test(state.word) && (state.word.match(/[a-z]/gi) || []).length >= 3)) &&
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

function gamePlayerProfile(uid, fallbackName = "") {
  return Object.values(APP_CONFIG.profiles).find(person => person.authUid === uid || person.id === uid) ||
    Object.values(APP_CONFIG.profiles).find(person => fallbackName && (
      person.name?.toLocaleLowerCase() === fallbackName.toLocaleLowerCase() ||
      person.previousNames?.some(name => name.toLocaleLowerCase() === fallbackName.toLocaleLowerCase())
    )) || {};
}

function gamePlayerAvatar(uid, fallbackName = "") {
  const person = gamePlayerProfile(uid, fallbackName);
  const name = person.name || fallbackName || "Partner";
  return person.avatar
    ? `<img class="game-player-avatar" src="${esc(person.avatar)}" alt="${esc(name)}">`
    : `<span class="game-player-avatar fallback" aria-hidden="true">${esc(name.slice(0, 1))}</span>`;
}

/* ------------------------------------------------------------------ */
/*  Scoreboard summary (both partners: wins / losses / games)         */
/* ------------------------------------------------------------------ */

function emptyStats() {
  return { wins: 0, losses: 0, draws: 0, games: 0 };
}

function computeGameStats(items) {
  const stats = new Map();
  const get = uid => {
    if (!stats.has(uid)) stats.set(uid, emptyStats());
    return stats.get(uid);
  };
  const seen = new Set();
  for (const item of items || []) {
    if (!item || (item.result !== "won" && item.result !== "draw") ||
        typeof item.matchId !== "string" || !Array.isArray(item.players) || item.players.length !== 2) continue;
    const key = `${item.game || ""}:${item.matchId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const winnerUid = item.winnerUid || "";
    for (const uid of item.players) {
      if (!uid) continue;
      const entry = get(uid);
      entry.games++;
      if (!winnerUid) entry.draws++;
      else if (winnerUid === uid) entry.wins++;
      else entry.losses++;
    }
  }
  return stats;
}

function findPartnerUid(items, myUid) {
  if (!myUid) return "";
  for (const item of items || []) {
    if (typeof item?.matchId === "string" && Array.isArray(item.players) && item.players.includes(myUid)) {
      const other = item.players.find(uid => uid && uid !== myUid);
      if (other) return other;
    }
  }
  return "";
}

function ownProfileKey(profile, user) {
  return (profile && (profile.id || profile.email) ? getProfileKey(profile) : "") || getProfileKey(user);
}

function scoreboardSummaryMarkup(items, user, profile) {
  const myUid = user?.uid || "";
  const stats = computeGameStats(items);
  const partnerUid = findPartnerUid(items, myUid);
  const mine = stats.get(myUid) || emptyStats();
  const theirs = partnerUid ? (stats.get(partnerUid) || emptyStats()) : emptyStats();
  const partnerName = partnerUid ? getDisplayName(partnerUid, "Partner") : "Partner";
  const ownProfile = APP_CONFIG.profiles[ownProfileKey(profile, user)] || {};
  const partnerProfile = Object.values(APP_CONFIG.profiles).find(person => person.authUid === partnerUid) ||
    APP_CONFIG.profiles[Object.keys(APP_CONFIG.profiles).find(key => key !== ownProfileKey(profile, user))] || {};
  const avatarMarkup = (person, name) => person.avatar
    ? `<img class="games-scoreboard-avatar" src="${esc(person.avatar)}" alt="${esc(name)}">`
    : `<span class="games-scoreboard-avatar fallback" aria-hidden="true">${esc((name || "♡").slice(0, 1))}</span>`;
  const totalMatches = Math.max(mine.games, theirs.games);
  const totalWins = mine.wins + theirs.wins;
  const myShare = totalWins > 0 ? Math.round((mine.wins / totalWins) * 100) : 50;
  const partnerShare = 100 - myShare;
  const hasData = totalMatches > 0;
  const headerSub = hasData
    ? `${totalMatches} ${totalMatches === 1 ? "match" : "matches"} played together`
    : "No matches yet — start playing!";
  return `<section class="games-scoreboard-card" aria-label="Game scoreboard summary">
    <div class="games-scoreboard-head">
      <div>
        <p class="eyebrow">OUR SCOREBOARD</p>
        <h2>Wins &amp; Losses</h2>
      </div>
      <span class="games-scoreboard-total">${esc(headerSub)}</span>
    </div>
    <div class="games-scoreboard-grid">
      <div class="games-scoreboard-player me">
        ${avatarMarkup(ownProfile, "You")}
        <span class="games-scoreboard-name">You</span>
        <strong class="games-scoreboard-wins">${mine.wins}</strong>
        <span class="games-scoreboard-label">${mine.wins === 1 ? "win" : "wins"}</span>
        <div class="games-scoreboard-meta">
          <span><b>${mine.losses}</b> losses</span>
          <span><b>${mine.games}</b> games</span>
        </div>
      </div>
      <span class="games-scoreboard-vs" aria-hidden="true">VS</span>
      <div class="games-scoreboard-player partner">
        ${avatarMarkup(partnerProfile, partnerName)}
        <span class="games-scoreboard-name">${esc(partnerName)}</span>
        <strong class="games-scoreboard-wins">${theirs.wins}</strong>
        <span class="games-scoreboard-label">${theirs.wins === 1 ? "win" : "wins"}</span>
        <div class="games-scoreboard-meta">
          <span><b>${theirs.losses}</b> losses</span>
          <span><b>${theirs.games}</b> games</span>
        </div>
      </div>
    </div>
    <div class="games-scoreboard-bar" role="img" aria-label="Win share between partners">
      <span class="me" style="width:${myShare}%"></span>
      <span class="partner" style="width:${partnerShare}%"></span>
    </div>
    ${hasData ? "" : `<p class="games-scoreboard-empty">Play a match together to fill this scoreboard 💞</p>`}
  </section>`;
}

/* ------------------------------------------------------------------ */
/*  Games hub markup                                                  */
/* ------------------------------------------------------------------ */

function gameCard(id, emoji, title, description, label = "") {
  return `<button class="games-hub-card" type="button" data-start-game="${id}">
    <span class="games-card-emoji" aria-hidden="true">${emoji}</span>
    <span class="games-card-copy"><strong>${title}</strong><span>${description}</span></span>
    ${label ? `<span class="games-card-label">${label}</span>` : ""}
    <span class="games-card-arrow" aria-hidden="true">›</span>
  </button>`;
}

const scoreboardStyles = `<style>
  .games-scoreboard-card{margin:0 0 20px;padding:18px 16px 16px;border-radius:20px;
    background:linear-gradient(135deg,#fff5f9 0%,#fdeaf3 55%,#f6e2ff 100%);
    border:1px solid #f3d5e2;box-shadow:0 14px 30px -20px rgba(182,79,123,.55)}
  .games-scoreboard-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px}
  .games-scoreboard-head .eyebrow{margin:0 0 3px}
  .games-scoreboard-head h2{margin:0;font-size:17px;color:#75435a;letter-spacing:.01em}
  .games-scoreboard-total{font-size:11px;color:#8c7480;text-align:right;max-width:45%;line-height:1.3}
  .games-scoreboard-grid{display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;gap:10px}
  .games-scoreboard-player{display:flex;flex-direction:column;align-items:center;gap:1px;padding:12px 12px;border-radius:14px;
    background:rgba(255,255,255,.8);border:1px solid #f3d5e2}
  .games-scoreboard-player.partner{text-align:center;align-items:center}
  .games-scoreboard-avatar{display:block;width:54px;height:54px;margin:0 0 6px;border:3px solid #fff;border-radius:50%;object-fit:cover;box-shadow:0 4px 12px rgba(182,79,123,.22)}
  .games-scoreboard-avatar.fallback{display:grid;place-items:center;background:linear-gradient(135deg,#f8bbd0,#d5c0f4);color:#75435a;font-size:21px;font-weight:800}
  .games-scoreboard-name{font-size:11px;font-weight:700;color:#75435a;text-transform:uppercase;letter-spacing:.08em;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  .games-scoreboard-wins{font-size:34px;line-height:1.05;font-weight:800;color:#b64f7b;margin-top:2px}
  .games-scoreboard-player.partner .games-scoreboard-wins{color:#7c5cc4}
  .games-scoreboard-label{font-size:11px;color:#8c7480;letter-spacing:.04em}
  .games-scoreboard-meta{display:flex;gap:10px;margin-top:8px;font-size:11px;color:#8c7480;flex-wrap:wrap}
  .games-scoreboard-meta b{color:#75435a;font-weight:700}
  .games-scoreboard-player.partner .games-scoreboard-meta{justify-content:center}
  .games-scoreboard-vs{align-self:center;font-size:10px;font-weight:800;color:#b64f7b;background:#fff;
    border:1px solid #f3d5e2;border-radius:999px;padding:6px 8px;letter-spacing:.1em}
  .games-scoreboard-bar{display:flex;height:8px;margin-top:14px;border-radius:999px;overflow:hidden;background:#f6e2ff}
  .games-scoreboard-bar span{display:block;height:100%;transition:width .45s ease}
  .games-scoreboard-bar .me{background:linear-gradient(90deg,#f7b6cf,#b64f7b)}
  .games-scoreboard-bar .partner{background:linear-gradient(90deg,#c9b6f7,#7c5cc4)}
  .games-scoreboard-empty{font-size:12px;color:#8c7480;text-align:center;margin:12px 0 0}
  @media (max-width:420px){
    .games-scoreboard-wins{font-size:28px}
    .games-scoreboard-grid{gap:6px}
    .games-scoreboard-player{padding:10px}
  }
</style>`;

function gamesHome() {
  return `<section class="games-page">
    ${scoreboardStyles}
    <header class="games-intro">
      <p class="eyebrow">A LITTLE FRIENDLY COMPETITION</p>
      <h1>Our Games <span aria-hidden="true">🎮</span></h1>
      <p class="muted">Start a match on one device, then join it from your partner's device.</p>
    </header>
    <div id="games-scoreboard"></div>
    <div class="games-hub-grid">
      ${gameCard("sos", "🔠", "SOS", "Make SOS lines, earn points, and play live", "LIVE")}
      ${gameCard("memory-match", "🧠", "Memory Match", "Take turns finding matching pairs", "2P")}
      ${gameCard("word-guess", "🔤", "Word Guess", "Set words for each other to guess", "2P")}
      ${gameCard("find-words", "🔎", "Find the Words", "Race to find 16 new words together", "LIVE")}
      ${gameCard("spin-wheel", "🎡", "Spin Wheel", "Complete three surprise challenges fastest", "2P")}
      ${gameCard("couple-trivia", "💞", "Couple Trivia", "Answer, then let your partner guess", "2P")}
      ${gameCard("true-false", "💡", "True or False", "Discover surprising facts together", "2P")}
    </div>
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

function miniScoreboardMarkup(game, state, user, liveMatch) {
  if (!state || typeof state !== "object") return "";
  let label = "Score", value = "—", detail = "";
  if (game === "memory-match") {
    label = "Moves"; value = Number.isInteger(state.moves) ? state.moves : 0;
    detail = `${(state.matched?.length || 0) / 2}/${symbols.length} pairs`;
  } else if (game === "word-guess") {
    label = "Guesses left"; value = Number.isInteger(state.guessesLeft) ? state.guessesLeft : 7;
    detail = state.word ? "Guess the hidden word" : "Choose a word to start";
  } else if (game === "emoji-quiz" || game === "couple-trivia") {
    label = "Points"; value = Number.isFinite(state.score) ? state.score : 0;
    detail = `${Math.min(state.question || 0, state.questions?.length || 0)}/${state.questions?.length || 0} questions`;
  } else if (game === "spin-wheel") {
    label = "Challenges"; value = `${Math.min(state.completedChallenges || 0, 3)}/3`;
    detail = "Complete three challenges";
  } else return "";
  return `<aside class="game-mini-scoreboard" aria-label="Current game score" style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px;padding:9px 12px;border:1px solid #f3d5e2;border-radius:12px;background:#fff8fb;font-size:12px"><span style="font-weight:700;color:#75435a">${esc(label)}</span><strong style="font-size:15px;color:#b64f7b">${esc(String(value))}</strong><span style="margin-left:auto;color:#8c7480;text-align:right">${esc(detail)}</span></aside>`;
}

function renderActiveGame(el, game, user, profile, state, liveMatch = false) {
  renderActiveGameBody(el, game, user, profile, state, liveMatch);
  const content = $("#games-active-content", el);
  if (!content || !state) return;
  content.querySelector(".game-mini-scoreboard")?.remove();
  const markup = miniScoreboardMarkup(game, state, user, liveMatch);
  if (markup) content.insertAdjacentHTML("afterbegin", markup);
}

function renderActiveGameBody(el, game, user, profile, state, liveMatch = false) {
  const content = $("#games-active-content", el);
  if (!content) return;
  if (!isValidActiveGameState(game, state)) {
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
    content.innerHTML = `<div class="game-panel"><p class="games-instructions">${liveMatch ? "Your partner chose a secret word. Guess it before you run out of guesses!" : "Pass the device to your partner, then guess the secret word."}</p><div class="word-guess-word" aria-label="Secret word">${visibleWord}</div><p class="game-result" aria-live="polite">${won ? "You guessed it! 🎉" : lost ? `Out of guesses! The word was ${esc(state.word)}.` : `${state.guessesLeft} guesses left`}</p>${won || lost ? (liveMatch ? "" : `<button type="button" class="primary" data-reset-game>Choose another word</button>`) : `<div class="letter-board">${alphabet.map(letter => `<button type="button" data-word-letter="${letter.toLocaleLowerCase()}"${state.guessed.includes(letter.toLocaleLowerCase()) ? " disabled" : ""}>${letter}</button>`).join("")}</div>${liveMatch ? "" : `<button type="button" class="secondary word-reset" data-reset-game>Start over</button>`}`}</div>`;
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
}

function renderSosGame(content, user, gameState, presence, pendingCell) {
  const uid = user.uid;
  const state = gameState || null;
  if (state && !isValidSosState(state)) {
    content.innerHTML = `<section class="sos-game-page"><header class="sos-header"><button class="sos-back" type="button" data-back-games>← Games</button><h1>SOS</h1></header><p class="error sos-error">This match data is out of date. Start a fresh match to continue.</p><button type="button" class="primary sos-action" data-sos-start>Start a fresh match</button></section>`;
    return;
  }

  const partnerOnline = Object.entries(presence || {}).some(([playerUid, value]) => playerUid !== uid && value?.online === true);
  const member = Boolean(state?.playerUids.includes(uid));
  const waiting = state?.status === "waiting";
  const playing = state?.status === "playing";
  const finished = state?.status === "finished";
  const ownScore = state?.scores?.[uid] || 0;
  const orderedPlayers = state?.playerUids || [uid];
  const partnerUid = orderedPlayers.find(playerUid => playerUid !== uid);
  const partnerScore = partnerUid ? (state.scores?.[partnerUid] || 0) : 0;
  const currentPlayer = state?.players?.[uid];
  const partnerPlayer = partnerUid ? state?.players?.[partnerUid] : null;

  let turnMessage = !state
    ? partnerOnline ? "Your partner is online. Start a live match!" : "Waiting for your partner to come online…"
      : waiting
      ? state.playerUids[0] === uid
          ? "Waiting for your partner to join from their device…"
        : "Your partner has started a match. Join to play!"
      : playing
        ? state.turnUid === uid ? "Tap an empty square, then choose S or O." : "Waiting for the other player…"
        : finished
          ? state.winnerUid ? state.winnerUid === uid ? "You won! 🎉" : "Your partner won this round!" : "It's a tie! 🤝"
          : "This match was cancelled.";

  const lineCells = new Set((state?.lines || []).flatMap(line => line.cells));
  const playerCard = (playerUid, color) => {
    const isOnline = presence?.[playerUid]?.online === true;
    const playerData = state?.players?.[playerUid] || {};
    const playerName = getDisplayName(playerUid, playerData.name || (playerUid === uid ? "You" : "Partner"));
    const score = state?.scores?.[playerUid] || 0;
    const isTurn = state?.turnUid === playerUid && playing;
    const playerSecondsLeft = isTurn ? secondsUntilTurn(state) : 0;
    return `<div class="sos-player-card ${color}${isTurn ? " turn-active" : ""}">
      <span class="sos-avatar-wrap${isTurn ? " sos-avatar-turn" : ""}"${isTurn ? ` style="--sos-turn-progress:${playerSecondsLeft / SOS_TURN_SECONDS}"` : ""}>${gamePlayerAvatar(playerUid, playerName)}${isTurn ? `<span class="sos-avatar-countdown" data-sos-countdown>${String(playerSecondsLeft).padStart(2, "0")}</span>` : ""}<i class="sos-presence${isOnline ? " online" : ""}" aria-label="${isOnline ? "Online" : "Offline"}"></i></span>
      <span class="sos-player-details"><span class="sos-player-name">${esc(playerName)}</span><span class="sos-player-label">${color === "blue" ? "Blue Player" : "Red Player"}</span></span>
      <strong class="sos-live-score">${score}</strong>
    </div>`;
  };
  const cells = (state?.board || Array(SOS_CELL_COUNT).fill("")).map((letter, index) => {
    const owner = state?.owners?.[index];
    const ownership = owner ? (owner === orderedPlayers[0] ? " own" : " partner") : "";
    const lineOwners = (state?.lines || []).filter(line => line.cells.includes(index)).map(line => line.uid);
    const lineClass = lineCells.has(index) ? ` sos-line-cell${lineOwners.includes(orderedPlayers[0]) ? " blue-line" : " red-line"}` : "";
    const disabled = !playing || state.turnUid !== uid || !member || Boolean(letter);
    const latestClass = state?.lastMove === index ? " latest-move" : "";
    const location = `Row ${Math.floor(index / SOS_COLUMNS) + 1}, column ${index % SOS_COLUMNS + 1}`;
    const lineLabel = lineCells.has(index) ? ", part of SOS" : "";
    if (!disabled && pendingCell === index) {
      return `<div class="sos-cell sos-cell-open ${orderedPlayers[0] === uid ? "choice-blue" : "choice-red"}${ownership}${lineClass}${latestClass}" role="gridcell" aria-label="${location}, choose S or O"><div class="sos-cell-picker" role="group" aria-label="Choose a letter"><button type="button" data-sos-cell-choice="S" data-sos-index="${index}">S</button><button type="button" data-sos-cell-choice="O" data-sos-index="${index}">O</button></div></div>`;
    }
    return `<button type="button" class="sos-cell${ownership}${lineClass}${latestClass}" data-sos-cell="${index}" aria-label="${location}${letter ? `, ${letter}` : ", empty, tap to choose S or O"}${lineLabel}${state?.lastMove === index ? ", latest move" : ""}"${disabled ? " disabled" : ""}>${esc(letter)}</button>`;
  }).join("");

  const result = finished
    ? state.winnerUid
      ? `${esc(getDisplayName(state.winnerUid, state.players?.[state.winnerUid]?.name || "Your partner"))} wins!`
      : `It's a draw!`
    : "";
  const canJoin = waiting && state.playerUids[0] !== uid;
  const waitingOwner = waiting && state.playerUids[0] === uid;
  const startAction = !state || finished || state.status === "cancelled"
    ? `<button type="button" class="primary sos-action" data-sos-start>${finished || state ? "Play again" : "Start a match"}</button>`
    : waitingOwner
      ? `<button type="button" class="secondary sos-action" data-sos-cancel>Cancel waiting match</button>`
      : waiting
        ? canJoin
          ? `<button type="button" class="primary sos-action" data-sos-join>Join match</button>`
          : `<button type="button" class="secondary sos-action" disabled>Waiting for your partner</button>`
        : "";

  const secondsLeft = playing ? secondsUntilTurn(state) : SOS_TURN_SECONDS;
  const lineMarkup = (state?.lines || []).map(line => {
    const first = line.cells[0];
    const last = line.cells[2];
    const x1 = ((first % SOS_COLUMNS) + 0.5) * 100;
    const y1 = (Math.floor(first / SOS_COLUMNS) + 0.5) * 100;
    const x2 = ((last % SOS_COLUMNS) + 0.5) * 100;
    const y2 = (Math.floor(last / SOS_COLUMNS) + 0.5) * 100;
    const color = line.uid === orderedPlayers[0] ? "#1595ec" : "#ec3c55";
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}"/>`;
  }).join("");
  content.innerHTML = `<section class="sos-game-page${finished && state.winnerUid === uid ? " sos-won" : ""}">
    <header class="sos-header"><button class="sos-back" type="button" data-back-games>← Games</button><div class="sos-heading"><p class="eyebrow">FIND · CONNECT · WIN</p><h1>S<span>♡</span>S</h1></div><span class="sos-header-note">Better Together</span></header>
    <div class="sos-matchup">${playerCard(orderedPlayers[0], "blue")}<span class="sos-versus">♡ VS ♡</span>${partnerUid ? playerCard(partnerUid, "red") : `<div class="sos-player-card red waiting-player"><span class="sos-player-label">Red Player</span><span class="sos-waiting-label">Waiting to join…</span></div>`}</div>
    <div class="sos-turn${playing && state.turnUid === uid ? " your-turn" : ""}" aria-live="polite">${esc(turnMessage)}</div>
    <div class="sos-board-frame"><div class="sos-board" role="grid" aria-label="SOS game board, ${SOS_COLUMNS} columns by ${SOS_ROWS} rows" style="grid-template-columns: repeat(${SOS_COLUMNS}, minmax(0, 1fr)); grid-template-rows: repeat(${SOS_ROWS}, minmax(0, 1fr));">${cells}<svg class="sos-lines" viewBox="0 0 ${SOS_COLUMNS * 100} ${SOS_ROWS * 100}" preserveAspectRatio="none" aria-hidden="true">${lineMarkup}</svg></div></div>
    ${result ? `<div class="sos-result" aria-live="polite">${result}<span>${ownScore} : ${partnerScore}</span></div>` : ""}
    <footer class="sos-presence-strip"><span class="sos-online-label${presence?.[uid]?.online ? " online" : ""}"><i></i>${presence?.[uid]?.online ? "ONLINE" : "OFFLINE"}<small>You</small></span><span class="sos-tap-hint">Tap an empty cell to choose a letter</span>${partnerUid ? `<span class="sos-online-label${partnerOnline ? " online" : ""}"><i></i>${partnerOnline ? "ONLINE" : "OFFLINE"}<small>${esc(getDisplayName(partnerUid, state?.players?.[partnerUid]?.name || "Partner"))}</small></span>` : `<span class="sos-online-label"><i></i>OFFLINE<small>Partner</small></span>`}</footer>
    ${playing ? "" : `<div class="sos-timer" aria-live="off"><span aria-hidden="true">♡</span><b>◷</b><span>Time Left</span><strong>${String(secondsLeft).padStart(2, "0")}</strong><span aria-hidden="true">♡</span></div>`}
    <div class="sos-actions">${startAction}${member && playing ? `<button type="button" class="secondary sos-action" data-sos-leave>Leave game</button>` : ""}</div>
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

function isValidGameRoom(room, game) {
  if (!room || room.game !== game || typeof room.matchId !== "string" ||
      !["waiting", "playing", "finished", "cancelled"].includes(room.status) ||
      !Array.isArray(room.playerUids) || room.playerUids.length < 1 ||
      room.playerUids.length > 2 || new Set(room.playerUids).size !== room.playerUids.length ||
      !room.playerUids.every(uid => typeof uid === "string" && uid) ||
      !room.players || typeof room.players !== "object") return false;
  if (room.status === "waiting" && room.playerUids.length !== 1) return false;
  if (room.status === "cancelled") return true;
  if (room.status !== "waiting" &&
      (room.playerUids.length !== 2 || !room.playerUids.every(uid => room.players[uid]))) return false;
  if (game === "memory-match" && room.playerUids.some(uid => room.players[uid].state != null &&
      !isValidActiveGameState(game, room.players[uid].state))) return false;
  if (game === "word-guess" && (!['setter', 'guessing', 'result'].includes(room.wordPhase) ||
      !Number.isInteger(room.wordRoundNumber) || room.wordRoundNumber < 0 || room.wordRoundNumber > 1 ||
      !room.playerUids.includes(room.wordSetterUid) ||
      (room.wordPhase === "guessing" && (!isValidActiveGameState(game, room.wordRound) || !room.wordRound.word)) ||
      (room.wordPhase === "setter" && room.wordRound != null) ||
      (room.status === "playing" && room.wordPhase === "setter" && room.turnUid !== room.wordSetterUid) ||
      (room.status === "playing" && room.wordPhase === "guessing" && room.turnUid === room.wordSetterUid) ||
      (room.wordPhase === "result" && room.status !== "finished"))) return false;
  if (game === "couple-trivia" && (!Array.isArray(room.questions) || room.questions.length !== triviaQuestions.length ||
      !Number.isInteger(room.triviaQuestionIndex) || room.triviaQuestionIndex < 0 ||
      room.triviaQuestionIndex >= room.questions.length ||
      !["first", "guess", "result", "finished"].includes(room.triviaStage) ||
      !room.playerUids.includes(room.triviaAnswererUid))) return false;
  if (game === "emoji-quiz" && room.quizPhase && (!["creator", "guesser", "result"].includes(room.quizPhase) ||
      !Number.isInteger(room.quizRoundNumber) || room.quizRoundNumber < 0 ||
      !room.playerUids.includes(room.quizCreatorUid) ||
      (room.quizPhase === "guesser" && (!room.quizRound || typeof room.quizRound.emojis !== "string")))) return false;
  if (game === "true-false") return isValidTrueFalseRoom(room);
  if (room.status === "waiting") return !room.turnUid;
  if (room.status === "playing") return room.playerUids.includes(room.turnUid);
  return !room.turnUid && (!room.winnerUid || room.playerUids.includes(room.winnerUid));
}

function stopSosListeners() {
  if (sosClock) clearInterval(sosClock);
  sosClock = null;
  stopSosGame?.(); stopSosGame = null;
  stopSosPresence?.(); stopSosPresence = null;
  stopSosAppPresence?.(); stopSosAppPresence = null;
  stopSosConnection?.(); stopSosConnection = null;
  stopSosServerTime?.(); stopSosServerTime = null;
  document.body.classList.remove("sos-fullscreen");
}

export function renderGames(el, user, profile) {
  stopGames?.();
  stopGames = null;
  stopGameMatch?.();
  stopGameMatch = null;
  stopSosListeners();
  disposeFindTheWords?.();
  disposeFindTheWords = null;
  if (memoryTimer) clearTimeout(memoryTimer);
  memoryTimer = null;

  let activeGame = "";
  let renderedShellGame = "";
  let activeState = null;
  let sosGameState = null;
  let sosPresence = {};
  let appPresence = {};
  let sosLastExpiryRequest = 0;
  let sosRepairInProgress = false;
  let pendingSosCell = -1;
  let gameRoomState = null;
  let roomStateInitializing = "";
  let savedMatchResults = new Set();
  let gameResults = null;
  let trueFalseBankCache = null;

  el.innerHTML = gamesHome();

  function renderScoreboard() {
    const container = $("#games-scoreboard", el);
    if (!container) return;
    container.innerHTML = scoreboardSummaryMarkup(gameResults || [], user, profile);
  }

  function clearSosSession() {
    if (sosClock) clearInterval(sosClock);
    sosClock = null;
    stopSosGame?.();
    stopSosGame = null;
    stopSosPresence?.();
    stopSosPresence = null;
    stopSosAppPresence?.();
    stopSosAppPresence = null;
    stopSosConnection?.();
    stopSosConnection = null;
    stopSosServerTime?.();
    stopSosServerTime = null;
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
      if (sosGameState?.status !== "playing" || sosGameState.turnUid !== user.uid) pendingSosCell = -1;
      if (sosGameState && !isValidSosState(sosGameState) && !sosRepairInProgress) {
        sosRepairInProgress = true;
        void startOrJoinSosMatch().finally(() => {
          sosRepairInProgress = false;
        });
      }
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
        }).then(() => {
          if (sosGameState.winnerUid === user.uid) void notifyPartnerSafely(ownProfileKey(profile, user), "game", `${profile?.name || getDisplayName(user.uid, "Your partner")} won a game of SOS!`, sosGameState.matchId, "games");
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
    stopSosPresence = onValue(ref(rtdb, `couples/${APP_CONFIG.coupleId}/games/sosPresence`), snapshot => {
      sosPresence = snapshot.val() || {};
      if (activeGame === "sos") renderCurrentGame();
    }, error => {
      console.error("SOS player presence could not be loaded:", error);
    });
    stopSosAppPresence = onValue(ref(rtdb, `couples/${APP_CONFIG.coupleId}/presence`), snapshot => {
      appPresence = snapshot.val() || {};
      if (activeGame === "sos") renderCurrentGame();
    }, error => console.error("Partner presence could not be loaded for SOS:", error));
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
    stopSosServerTime = onValue(ref(rtdb, ".info/serverTimeOffset"), snapshot => {
      sosServerTimeOffset = Number(snapshot.val()) || 0;
    });
    sosClock = setInterval(() => {
      if (activeGame !== "sos" || !isValidSosState(sosGameState) || sosGameState.status !== "playing") return;
      const remaining = secondsUntilTurn(sosGameState);
      el.querySelectorAll("[data-sos-countdown]").forEach(countdown => { countdown.textContent = String(remaining).padStart(2, "0"); });
      el.querySelector(".sos-avatar-turn")?.style.setProperty("--sos-turn-progress", String(remaining / SOS_TURN_SECONDS));
      if (remaining === 0) void expireSosTurn(sosGameState.turnNumber, sosGameState.turnDeadline);
    }, 250);
  }

  function sosNow() { return Date.now() + sosServerTimeOffset; }

  async function expireSosTurn(turnNumber, deadline) {
    if (Date.now() < sosLastExpiryRequest) return;
    sosLastExpiryRequest = Date.now() + 1500;
    try {
      await runTransaction(sosGameRef(), current => {
        if (!isValidSosState(current) || current.status !== "playing" || current.turnNumber !== turnNumber ||
            current.turnDeadline !== deadline || current.turnDeadline > sosNow()) return;
        const nextUid = current.playerUids.find(playerUid => playerUid !== current.turnUid);
        return { ...current, turnUid: nextUid, turnNumber: current.turnNumber + 1,
          turnDeadline: sosNow() + SOS_TURN_SECONDS * 1000, updatedAt: sosNow() };
      });
    } catch (error) {
      sosLastExpiryRequest = 0;
      console.error("SOS turn timeout could not be processed:", error);
    }
  }

  async function startOrJoinSosMatch() {
    if (!rtdb) {
      toast("SOS needs Firebase Realtime Database.");
      return;
    }
    try {
      const transaction = await runTransaction(sosGameRef(), current => {
        if (!isValidSosState(current) || current.status === "finished" || current.status === "cancelled") {
          return makeSosWaitingState(user.uid, getDisplayName(user.uid, profile?.name));
        }
        if (current.status !== "waiting" || current.playerUids.includes(user.uid)) return;
        return {
          ...current,
          playerUids: [...current.playerUids, user.uid],
          players: { ...current.players, [user.uid]: { name: getDisplayName(user.uid, profile?.name) } },
          scores: { ...current.scores, [user.uid]: 0 },
          status: "playing",
          turnUid: Math.random() < 0.5 ? current.playerUids[0] : user.uid,
          turnDeadline: sosNow() + SOS_TURN_SECONDS * 1000,
          turnNumber: (current.turnNumber || 0) + 1,
          updatedAt: Date.now()
        };
      });
      if (!transaction.committed) {
        toast("This SOS match has already started. Ask your partner to join from their device.");
      }
    } catch (error) {
      console.error("Could not start or join SOS:", error);
      toast("SOS could not start. Check your connection and try again.");
    }
  }

  async function cancelSosWaitingMatch() {
    try {
      const transaction = await runTransaction(sosGameRef(), current => {
        if (!isValidSosState(current) || current.status !== "waiting" || current.playerUids[0] !== user.uid) return;
        return { ...current, status: "cancelled", updatedAt: Date.now() };
      });
      if (!transaction.committed) toast("This waiting match has already changed.");
    } catch (error) {
      console.error("Could not cancel SOS match:", error);
      toast("The SOS match could not be cancelled.");
    }
  }

  async function playSosMove(index, letter) {
    pendingSosCell = -1;
    try {
      const transaction = await runTransaction(sosGameRef(), current => {
        if (!isValidSosState(current) || current.status !== "playing" || current.turnUid !== user.uid ||
            !current.playerUids.includes(user.uid) || !Number.isInteger(index) || index < 0 || index >= SOS_CELL_COUNT ||
            !["S", "O"].includes(letter) || current.board[index]) return;
        const board = [...current.board];
        const owners = [...current.owners];
        board[index] = letter;
        owners[index] = user.uid;
        const knownLines = new Set((current.lines || []).map(line => line.cells.join("-")));
        const newLines = findSosLines(board, index, user.uid, knownLines);
        const scores = { ...current.scores, [user.uid]: (current.scores[user.uid] || 0) + newLines.length };
        const lines = [...(current.lines || []), ...newLines];
        const boardFull = board.every(Boolean);
        const opponentUid = current.playerUids.find(playerUid => playerUid !== user.uid);
        const finished = boardFull;
        const winnerUid = !finished ? "" : scores[user.uid] === scores[opponentUid]
          ? ""
          : scores[user.uid] > scores[opponentUid] ? user.uid : opponentUid;
        return {
          ...current,
          board,
          owners,
          lastMove: index,
          scores,
          lines,
          status: finished ? "finished" : "playing",
          turnUid: finished ? "" : newLines.length ? user.uid : opponentUid,
          turnNumber: (current.turnNumber || 0) + 1,
          turnDeadline: finished ? 0 : sosNow() + SOS_TURN_SECONDS * 1000,
          ...(finished ? { winnerUid } : {}),
          updatedAt: Date.now()
        };
      });
      if (!transaction.committed) {
        toast("That square is no longer available, or it is your partner's turn.");
        renderCurrentGame();
      }
    } catch (error) {
      console.error("Could not save SOS move:", error);
      toast("Your SOS move could not be saved. Please try again.");
      renderCurrentGame();
    }
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
      statusEl.innerHTML = `<div class="game-panel game-room-panel"><p class="error">This match has incomplete saved data. Start a fresh match to continue.</p><button type="button" class="primary" data-room-start>Start a fresh match</button></div>`;
      content.replaceChildren();
      return;
    }
    if (activeGame === "true-false") {
      renderTrueFalseRoom(room, statusEl, content);
      return;
    }
    const players = room?.players || {};
    const playerUids = room?.playerUids || [];
    const opponentUid = playerUids.find(uid => uid !== user.uid);
    const opponentName = getDisplayName(opponentUid, players[opponentUid]?.name || "Your partner");
    let message = "";
    content.style.opacity = "";
    if (!room || room.status === "finished" || room.status === "cancelled") {
      const finalScores = room?.status === "finished"
        ? `<div class="game-room-player-row">${room.playerUids.map(uid => `<div class="game-room-player">${gamePlayerAvatar(uid, players[uid]?.name)}<span>${esc(getDisplayName(uid, players[uid]?.name || "Partner"))}</span><strong>${esc(formatGameScore(activeGame, players[uid]?.score))}</strong></div>`).join("")}</div>`
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
      statusEl.innerHTML = `<div class="game-panel game-room-panel"><p class="tic-tac-toe-status">${esc(result)}</p>${finalScores}<button type="button" class="primary" data-room-start>${room ? "Play another match" : "Start a match"}</button></div>`;
      content.replaceChildren();
      return;
    }

    if (room.status === "waiting") {
      const isCreator = room.playerUids[0] === user.uid;
      statusEl.innerHTML = `<div class="game-panel game-room-panel"><p class="tic-tac-toe-status">${isCreator ? "Waiting for your partner to join from their device…" : `${esc(opponentName)} is waiting. Join the match to play!`}</p>${isCreator ? `<button type="button" class="secondary" data-room-cancel>Cancel match</button>` : `<button type="button" class="primary" data-room-start>Join match</button>`}</div>`;
      if (isCreator && activeState) {
        renderActiveGame(el, activeGame, user, profile, activeState, true);
        content.insertAdjacentHTML("afterbegin", `<div class="games-preview-note muted">Game preview · Waiting for your partner to join. You can look around, but play starts after they join.</div>`);
        content.style.opacity = "0.88";
      } else {
        content.replaceChildren();
        content.style.opacity = "";
      }
      return;
    }

    content.style.opacity = "";
    const isTurn = room.turnUid === user.uid;
    if (!room.playerUids.includes(user.uid)) {
      statusEl.innerHTML = `<div class="game-panel game-room-panel"><p class="tic-tac-toe-status">This match is already in progress with your partner.</p></div>`;
      content.replaceChildren();
      return;
    }
    const opponentState = players[opponentUid]?.state;
    const progress = opponentState
      ? activeGame === "emoji-quiz" || activeGame === "couple-trivia"
        ? `Question ${Math.min(opponentState.question + 1, opponentState.questions.length)} of ${opponentState.questions.length}`
        : activeGame === "memory-match"
          ? isValidActiveGameState(activeGame, opponentState)
            ? `${opponentState.matched.length / 2} of ${opponentState.cards.length / 2} pairs`
            : "their round hasn't started yet"
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
    const playerScores = `<div class="game-room-player-row">${room.playerUids.map(uid => `<div class="game-room-player">${gamePlayerAvatar(uid, players[uid]?.name)}<span>${esc(getDisplayName(uid, players[uid]?.name || "Partner"))}</span><strong>${esc(scoreValue(uid))}</strong></div>`).join("")}</div>`;
    statusEl.innerHTML = `<div class="game-panel game-room-panel"><p class="tic-tac-toe-status">${esc(message)}</p>${playerScores}${scoreRule ? `<p class="muted">${esc(scoreRule)}</p>` : ""}<button type="button" class="secondary" data-room-end>End this match</button></div>`;
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
      activeState = activeGame === "memory-match" && playerState.locked && !memoryTimer
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
        if (!player || isValidActiveGameState(activeGame, player.state)) return;
        return {
          ...current,
          players: { ...current.players, [user.uid]: { ...player, state: initialState } },
          updatedAt: Date.now()
        };
      });
    } catch (error) {
      console.error("Could not prepare game turn:", error);
      toast("Your turn could not be loaded. Please try again.");
    } finally {
      roomStateInitializing = "";
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
    saveRoomPlayerState();
    renderCurrentGame();
  }

  function recordFinishedMatch(room) {
    if (!room?.matchId || savedMatchResults.has(room.matchId) || !firebaseReady) return;
    savedMatchResults.add(room.matchId);
    const scores = Object.fromEntries(room.playerUids.map(uid => [uid, room.players[uid]?.score ?? 0]));
    recordGameMatchResult({
      uid: user.uid,
      authorId: profile?.id || user.uid,
      matchId: room.matchId,
      game: gameTitles[activeGame],
      winnerUid: room.winnerUid,
      players: room.playerUids,
      scores
    }).then(() => {
      if (room.winnerUid === user.uid) void notifyPartnerSafely(ownProfileKey(profile, user), "game", `${profile?.name || getDisplayName(user.uid, "Your partner")} won ${gameTitles[activeGame] || "a game"}!`, room.matchId, "games");
    }).catch(error => {
      savedMatchResults.delete(room.matchId);
      console.error("Could not save game result:", error);
      toast("The match ended, but its result could not be saved.");
    });
  }

  function hasValidQuestionBank(bank) {
    const questionCount = TRUE_FALSE_QUESTION_BANK.length;
    return bank?.version === TRUE_FALSE_BANK_VERSION && bank.questionCount === questionCount &&
      bank.questions && typeof bank.questions === "object" && Object.keys(bank.questions).length === questionCount &&
      Array.from({ length: questionCount }, (_, index) => bank.questions[index]).every(question =>
        question && typeof question.id === "string" && typeof question.statement === "string" &&
        typeof question.answer === "boolean" && typeof question.explanation === "string" &&
        typeof question.sourceUrl === "string");
  }

  async function loadTrueFalseQuestionBank() {
    if (trueFalseBankCache) return trueFalseBankCache;
    const bankRef = trueFalseBankRef();
    let snapshot = await get(bankRef);
    let bank = snapshot.val();
    if (!hasValidQuestionBank(bank)) {
      const transaction = await runTransaction(bankRef, current => {
        if (hasValidQuestionBank(current)) return;
        return {
          version: TRUE_FALSE_BANK_VERSION,
          questionCount: TRUE_FALSE_QUESTION_BANK.length,
          seededAt: Date.now(),
          questions: TRUE_FALSE_QUESTION_BANK
        };
      });
      bank = transaction.snapshot.val();
    }
    if (!hasValidQuestionBank(bank)) throw new Error("The True or False question bank could not be loaded.");
    trueFalseBankCache = Array.isArray(bank.questions)
      ? bank.questions
      : Array.from({ length: TRUE_FALSE_QUESTION_BANK.length }, (_, index) => bank.questions[index]);
    return trueFalseBankCache;
  }

  function trueFalsePlayerCards(room) {
    return room.playerUids.map((playerUid, index) => {
      const name = getDisplayName(playerUid, room.players[playerUid]?.name || (index ? "Partner" : "You"));
      const score = room.players[playerUid]?.score || 0;
      return `<div class="true-false-player-card">${gamePlayerAvatar(playerUid, name)}<span>${esc(name)}</span><strong>${score}</strong><small>points</small></div>`;
    }).join("");
  }

  function renderTrueFalseRoom(room, statusEl, content) {
    const playerRow = room ? `<div class="true-false-score-row">${trueFalsePlayerCards(room)}${room.playerUids.length < 2 ? `<div class="true-false-player-card waiting">♡<span>Waiting for partner</span><strong>—</strong><small>points</small></div>` : ""}</div>` : "";
    if (!room || room.status === "finished" || room.status === "cancelled") {
      const winner = room?.winnerUid ? getDisplayName(room.winnerUid, room.players?.[room.winnerUid]?.name || "Your partner") : "";
      const outcome = room?.status === "cancelled" ? "This match was cancelled." : room?.status === "finished"
        ? winner ? `${winner} won this round!` : "It’s a tie! You both did great."
        : "Make a guess, learn a new fact, and compare your points.";
      statusEl.innerHTML = `<div class="game-panel game-room-panel true-false-status"><p class="tic-tac-toe-status">${esc(outcome)}</p>${room?.status === "finished" ? `<div class="true-false-final-scores">${room.playerUids.map(playerUid => `<span>${esc(getDisplayName(playerUid, room.players[playerUid]?.name || "Partner"))}: <b>${room.players[playerUid]?.score || 0}</b></span>`).join("")}</div>` : ""}<button type="button" class="primary" data-room-start>${room ? "Play again" : "Start a match"}</button></div>`;
      if (room?.status === "finished") {
        const lastQuestion = room.trueFalseQuestions[room.trueFalseQuestionIndex];
        content.innerHTML = `<article class="true-false-card true-false-finished"><p class="true-false-eyebrow">YOUR LITTLE KNOWLEDGE ROUND</p><h2>${esc(outcome)}</h2>${playerRow}<p class="true-false-statement">${esc(lastQuestion.statement)}</p><div class="true-false-correct">Correct answer: <strong>${lastQuestion.answer ? "True" : "False"}</strong></div><p class="true-false-explanation">${esc(lastQuestion.explanation)}</p><a class="true-false-source" href="${esc(lastQuestion.sourceUrl)}" target="_blank" rel="noopener noreferrer">Learn more · ${esc(lastQuestion.sourceTitle)}</a></article>`;
      } else content.innerHTML = `<div class="true-false-card true-false-welcome"><span aria-hidden="true">💡</span><h2>Surprising facts, two guesses.</h2><p>Answer separately. The answer and explanation appear after both of you have submitted.</p>${playerRow}</div>`;
      return;
    }

    if (room.status === "waiting") {
      const creator = room.playerUids[0] === user.uid;
      statusEl.innerHTML = `<div class="game-panel game-room-panel true-false-status"><p class="tic-tac-toe-status">${creator ? "Your question pack is ready. Waiting for your partner to join…" : `${esc(getDisplayName(room.playerUids[0], room.players[room.playerUids[0]]?.name || "Your partner"))} is ready to play.`}</p>${playerRow}${creator ? `<button type="button" class="secondary" data-room-cancel>Cancel match</button>` : `<button type="button" class="primary" data-room-start>Join match</button>`}</div>`;
      content.innerHTML = `<div class="true-false-card true-false-welcome"><span aria-hidden="true">💡</span><h2>True or False?</h2><p>Both of you answer each fact. We’ll reveal the answer and a short explanation after you both submit.</p>${playerRow}</div>`;
      return;
    }

    if (!room.playerUids.includes(user.uid)) {
      statusEl.innerHTML = `<div class="game-panel game-room-panel"><p class="tic-tac-toe-status">This match is already in progress with your partner.</p></div>`;
      content.replaceChildren();
      return;
    }

    const question = room.trueFalseQuestions[room.trueFalseQuestionIndex];
    const partnerUid = room.playerUids.find(playerUid => playerUid !== user.uid);
    const answers = room.trueFalseAnswers || {};
    const hasAnswered = Object.prototype.hasOwnProperty.call(answers, user.uid);
    const partnerAnswered = Object.prototype.hasOwnProperty.call(answers, partnerUid);
    const revealed = room.trueFalsePhase === "reveal";
    const questionNumber = room.trueFalseQuestionIndex + 1;
    statusEl.innerHTML = `<div class="game-panel game-room-panel true-false-status"><p class="tic-tac-toe-status">${revealed ? "Both answers are in — here’s the fact!" : hasAnswered ? "Your answer is locked. Waiting for your partner…" : partnerAnswered ? "Your partner has answered. Your turn to guess!" : "Answer this fact separately, then compare."}</p>${playerRow}<p class="true-false-rule">One point for each correct answer · ${questionNumber} of ${room.trueFalseQuestions.length}</p><button type="button" class="secondary" data-room-end>End this match</button></div>`;

    const answerButtons = !revealed && !hasAnswered
      ? `<div class="true-false-choices"><button type="button" class="true-false-choice true-choice" data-true-false-answer="true"><span>✓</span>True</button><button type="button" class="true-false-choice false-choice" data-true-false-answer="false"><span>✕</span>False</button></div>`
      : !revealed ? `<div class="true-false-waiting-answer"><span class="true-false-lock">♡</span><strong>Your answer is submitted</strong><span>${partnerAnswered ? "Both answers are in — revealing…" : "The answer stays hidden until your partner answers too."}</span></div>` : "";
    const reveal = revealed
      ? `<div class="true-false-reveal"><p class="true-false-correct">Correct answer: <strong>${question.answer ? "True" : "False"}</strong></p><div class="true-false-answer-pair">${room.playerUids.map(playerUid => `<span>${esc(getDisplayName(playerUid, room.players[playerUid]?.name || "Partner"))} answered <b>${answers[playerUid] ? "True" : "False"}</b>${answers[playerUid] === question.answer ? " · +1 point" : ""}</span>`).join("")}</div><p class="true-false-explanation">${esc(question.explanation)}</p><a class="true-false-source" href="${esc(question.sourceUrl)}" target="_blank" rel="noopener noreferrer">Learn more · ${esc(question.sourceTitle)}</a><button type="button" class="primary true-false-next" data-next-true-false>${questionNumber === room.trueFalseQuestions.length ? "See our final score" : "Next fact"} <span aria-hidden="true">→</span></button></div>`
      : "";
    content.innerHTML = `<article class="true-false-card"><div class="true-false-question-meta"><span>${esc(question.category)}</span><span>FACT ${String(questionNumber).padStart(2, "0")} / ${room.trueFalseQuestions.length}</span></div><h2 class="true-false-statement">${esc(question.statement)}</h2>${answerButtons}${reveal}</article>`;
  }

  function renderCurrentGame() {
    if (!activeGame) {
      document.body.classList.remove("sos-fullscreen");
      disposeFindTheWords?.();
      disposeFindTheWords = null;
      el.innerHTML = gamesHome();
      renderedShellGame = "";
      renderScoreboard();
      listenForGameResults();
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
      renderSosGame($("#games-active-content", el), user, sosGameState, { ...appPresence, ...sosPresence }, pendingSosCell);
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
      "memory-match": ["Memory Match", "Flip the cards and find all ten pairs.", "🧠"],
      "word-guess": ["Word Guess", "Pick a secret word, then let your partner guess.", "🔤"],
      "spin-wheel": ["Spin Wheel", "Spin for a sweet little challenge.", "🎡"],
      "couple-trivia": ["Couple Trivia", "Answer, pass the device, and see if your partner knows.", "💞"],
      "true-false": ["True or False", "Guess together, then learn a surprising fact.", "💡"]
    }[activeGame];
    if (renderedShellGame !== activeGame) {
      el.innerHTML = activeShell(activeGame, ...gameInfo);
      renderedShellGame = activeGame;
    }
    renderGameRoom();
  }

  function listenForGameResults() {
    if (stopGames) return;
    if (!firebaseReady) {
      return;
    }
    try {
      stopGames = watchItems("game", items => {
        gameResults = items || [];
        if (activeGame) renderCurrentGame();
        else renderScoreboard();
      }, error => {
        console.error("Game scores could not be loaded:", error);
      });
    } catch (error) {
      console.error("Game scores could not be loaded:", error);
    }
  }

  listenForGameResults();

  el.onclick = async event => {
    const target = event.target.closest("button");
    if (!target || !el.contains(target)) return;
    const turnOnlyActions = [
      "data-memory-card", "data-word-letter", "data-emoji-answer", "data-next-emoji",
      "data-spin-wheel", "data-complete-challenge", "data-trivia-answer", "data-trivia-guess", "data-next-trivia"
    ];
    if (activeGame && turnOnlyActions.some(attribute => target.hasAttribute(attribute)) &&
        (gameRoomState?.status !== "playing" || gameRoomState.turnUid !== user.uid)) {
      toast("Please wait for your turn.");
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-start-game")) {
      if (memoryTimer) clearTimeout(memoryTimer);
      memoryTimer = null;
      clearSosSession();
      stopGameMatch?.();
      stopGameMatch = null;
      disposeFindTheWords?.();
      disposeFindTheWords = null;
      activeGame = target.dataset.startGame;
      activeState = resetActiveGame(activeGame);
      sosGameState = null;
      sosPresence = {};
      pendingSosCell = -1;
      gameRoomState = null;
      if (activeGame === "sos") {
        startSosSession();
      } else if (rtdb && activeGame !== "find-words") {
        stopGameMatch = onValue(gameMatchRef(activeGame), snapshot => {
          gameRoomState = normalizeRoom(snapshot.val());
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

    if (activeGame === "sos" && target.hasAttribute("data-sos-cell-choice")) {
      await playSosMove(Number(target.dataset.sosIndex), target.dataset.sosCellChoice === "O" ? "O" : "S");
      return;
    }

    if (activeGame === "sos" && (target.hasAttribute("data-sos-start") || target.hasAttribute("data-sos-join"))) {
      await startOrJoinSosMatch();
      return;
    }

    if (activeGame === "sos" && target.hasAttribute("data-sos-cancel")) {
      await cancelSosWaitingMatch();
      return;
    }

    if (activeGame === "sos" && target.hasAttribute("data-sos-cell")) {
      pendingSosCell = Number(target.dataset.sosCell);
      renderCurrentGame();
      return;
    }

    if (target.hasAttribute("data-room-start")) {
      if (!rtdb) {
        toast("Two-player games need Firebase Realtime Database.");
        return;
      }
      try {
        const trueFalseQuestions = activeGame === "true-false"
          ? pickTrueFalseQuestions(await loadTrueFalseQuestionBank(), 12)
          : [];
        const transaction = await runTransaction(gameMatchRef(activeGame), current => {
          if (!isValidGameRoom(current, activeGame) || current.status === "finished" || current.status === "cancelled") {
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
              trueFalseQuestions,
              trueFalseQuestionIndex: 0,
              trueFalseAnswers: null,
              trueFalsePhase: "answering",
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
          if (!current || current.status !== "playing" || !current.playerUids.includes(user.uid) ||
              (activeGame === "true-false" && (current.trueFalsePhase !== "answering" || current.trueFalseQuestionIndex !== gameRoomState?.trueFalseQuestionIndex))) return;
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

    if (target.hasAttribute("data-back-games") || target.hasAttribute("data-sos-leave")) {
      if (memoryTimer) clearTimeout(memoryTimer);
      memoryTimer = null;
      clearSosSession();
      stopGameMatch?.();
      stopGameMatch = null;
      activeGame = "";
      activeState = null;
      sosGameState = null;
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
          if (memoryTimer) clearTimeout(memoryTimer);
          memoryTimer = setTimeout(() => {
            memoryTimer = null;
            if (activeGame !== "memory-match") return;
            activeState.flipped = [];
            activeState.locked = false;
            renderAndSavePlayerProgress();
          }, 800);
          renderAndSavePlayerProgress();
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

    if (target.hasAttribute("data-true-false-answer") && activeGame === "true-false") {
      const answer = target.dataset.trueFalseAnswer === "true";
      try {
        const transaction = await runTransaction(gameMatchRef(activeGame), current => {
          if (!current || current.game !== "true-false" || current.status !== "playing" ||
              current.trueFalsePhase !== "answering" || !current.playerUids.includes(user.uid) ||
              Object.prototype.hasOwnProperty.call(current.trueFalseAnswers || {}, user.uid)) return;
          const answers = { ...(current.trueFalseAnswers || {}), [user.uid]: answer };
          const bothAnswered = current.playerUids.every(playerUid => Object.prototype.hasOwnProperty.call(answers, playerUid));
          let players = current.players;
          if (bothAnswered) {
            const correctAnswer = current.trueFalseQuestions[current.trueFalseQuestionIndex].answer;
            players = Object.fromEntries(current.playerUids.map(playerUid => {
              const player = current.players[playerUid];
              return [playerUid, { ...player, score: (player.score || 0) + (answers[playerUid] === correctAnswer ? 1 : 0) }];
            }));
          }
          return {
            ...current,
            trueFalseAnswers: answers,
            trueFalsePhase: bothAnswered ? "reveal" : "answering",
            players,
            updatedAt: Date.now()
          };
        });
        if (!transaction.committed) toast("Your answer is already submitted, or this question has changed.");
      } catch (error) {
        console.error("Could not save True or False answer:", error);
        toast("Your answer could not be saved. Please try again.");
      }
      return;
    }

    if (target.hasAttribute("data-next-true-false") && activeGame === "true-false") {
      try {
        const transaction = await runTransaction(gameMatchRef(activeGame), current => {
          if (!current || current.game !== "true-false" || current.status !== "playing" ||
              current.trueFalsePhase !== "reveal" || !current.playerUids.includes(user.uid)) return;
          const finalQuestion = current.trueFalseQuestionIndex >= current.trueFalseQuestions.length - 1;
          if (finalQuestion) {
            return {
              ...current,
              status: "finished",
              trueFalsePhase: "finished",
              turnUid: "",
              winnerUid: gameWinner("true-false", current.playerUids, current.players),
              updatedAt: Date.now()
            };
          }
          return {
            ...current,
            trueFalseQuestionIndex: current.trueFalseQuestionIndex + 1,
            trueFalseAnswers: null,
            trueFalsePhase: "answering",
            updatedAt: Date.now()
          };
        });
        if (!transaction.committed) toast("This question has already changed.");
      } catch (error) {
        console.error("Could not continue True or False:", error);
        toast("The next fact could not be loaded.");
      }
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
  };

  el.onsubmit = async event => {
    if (event.target.id !== "word-guess-setup") return;
    event.preventDefault();
    if (gameRoomState?.status !== "playing" || gameRoomState.turnUid !== user.uid) {
      toast("Waiting for your partner to join before playing.");
      return;
    }
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
  stopSosListeners();
  stopGameMatch?.();
  stopGameMatch = null;
  if (memoryTimer) clearTimeout(memoryTimer);
  memoryTimer = null;
  disposeFindTheWords?.();
  disposeFindTheWords = null;
}
