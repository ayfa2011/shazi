import { getProfileKey, getDisplayName } from "./profile-data.js";
import { $, esc, toast } from "./utils.js";
import { rtdb } from "./firebase.js";
import { onDisconnect, onValue, ref, runTransaction, set } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const BOARD_SIZE = 14;
const WORDS_PER_GAME = 16;
const gameRef = () => ref(rtdb, "couples/our-little-world/games/findTheWords");
const presenceRef = uid => ref(rtdb, `couples/our-little-world/games/findTheWordsPresence/${uid}`);
const DIRECTIONS = [
  [0, 1], [1, 0], [0, -1], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1]
];
const WORD_BANK = [
  "about", "above", "across", "action", "active", "adore", "after", "again", "agree", "ahead",
  "alive", "almost", "alone", "along", "always", "amazing", "answer", "anyone", "around", "arrive",
  "artist", "asleep", "autumn", "away", "baby", "back", "balance", "beautiful", "because", "before",
  "begin", "believe", "belong", "best", "better", "between", "beyond", "birthday", "bliss", "bloom",
  "blue", "book", "brave", "breakfast", "bright", "bring", "buddy", "build", "butterfly", "calm",
  "camera", "care", "careful", "carry", "celebrate", "change", "charm", "cheer", "choice", "choose",
  "circle", "clean", "clever", "close", "cloud", "coffee", "color", "comfort", "coming", "common",
  "cookie", "cool", "corner", "could", "courage", "cozy", "create", "dance", "daring", "day",
  "dear", "decide", "delight", "dream", "easy", "enjoy", "enough", "evening", "every", "exact",
  "excited", "extra", "family", "famous", "fancy", "favorite", "feeling", "finally", "find", "finish",
  "first", "flower", "follow", "forever", "forget", "found", "fresh", "friend", "front", "fun",
  "gentle", "gift", "giggle", "glad", "glance", "glow", "golden", "good", "grace", "grand",
  "great", "green", "greet", "grow", "guess", "happy", "hard", "heart", "hello", "help",
  "hidden", "home", "honest", "hope", "hug", "idea", "imagine", "inside", "island", "jacket",
  "jelly", "join", "joke", "journey", "joy", "kind", "kindness", "kiss", "kitchen", "knock",
  "laugh", "learn", "leave", "light", "like", "little", "lively", "lucky", "magic", "make",
  "maybe", "memory", "message", "midnight", "minute", "moment", "morning", "movie", "music", "near",
  "never", "night", "notice", "number", "ocean", "offer", "often", "okay", "open", "orange",
  "outside", "paint", "paper", "partner", "party", "peace", "people", "perfect", "picnic", "place",
  "plan", "play", "please", "pocket", "pretty", "promise", "purple", "quick", "quiet", "rain",
  "rainbow", "ready", "reason", "remember", "repeat", "reply", "rest", "right", "river", "romance",
  "room", "rose", "safe", "same", "save", "school", "secret", "share", "shine", "simple",
  "sincere", "sister", "smile", "soft", "someone", "something", "sound", "special", "spirit", "spring",
  "start", "stay", "story", "strong", "summer", "sunny", "sweet", "table", "take", "talk",
  "teach", "thank", "thing", "think", "together", "tomorrow", "touch", "travel", "treat", "trust",
  "truth", "tulip", "under", "unique", "until", "useful", "vacation", "value", "velvet", "visit",
  "voice", "warm", "watch", "water", "welcome", "whole", "window", "wish", "wonder", "wonderful",
  "world", "write", "yellow", "yesterday", "young", "your", "zebra"
];

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function updateSelection(container, start, end) {
  const selected = new Set(start == null || end == null ? [] : traceCells(start, end));
  container.querySelectorAll("[data-find-cell]").forEach(cell => {
    cell.classList.toggle("selecting", selected.has(Number(cell.dataset.findCell)));
  });
}

function makeBoard(excludedWords = []) {
  const excluded = new Set(excludedWords);
  const chosenWords = shuffle(WORD_BANK.filter(word => !excluded.has(word))).slice(0, WORDS_PER_GAME);
  let board = null;
  let words = null;

  for (let boardAttempt = 0; boardAttempt < 20 && !words; boardAttempt++) {
    const candidate = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(""));
    const paths = new Map();
    let complete = true;
    for (const word of [...chosenWords].sort((first, second) => second.length - first.length)) {
      let placed = false;
      for (let attempt = 0; attempt < 500 && !placed; attempt++) {
        const [rowStep, columnStep] = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
        const row = Math.floor(Math.random() * BOARD_SIZE);
        const column = Math.floor(Math.random() * BOARD_SIZE);
        const cells = [...word].map((_, offset) => ({
          row: row + rowStep * offset,
          column: column + columnStep * offset
        }));
        if (cells.some((cell, index) => cell.row < 0 || cell.row >= BOARD_SIZE || cell.column < 0 || cell.column >= BOARD_SIZE ||
          (candidate[cell.row][cell.column] && candidate[cell.row][cell.column] !== word[index]))) continue;
        cells.forEach((cell, index) => { candidate[cell.row][cell.column] = word[index]; });
        paths.set(word, cells.map(cell => cell.row * BOARD_SIZE + cell.column));
        placed = true;
      }
      if (!placed) {
        complete = false;
        break;
      }
    }
    if (complete) {
      board = candidate;
      words = chosenWords.map(word => ({ word, cells: paths.get(word), foundBy: "" }));
    }
  }
  if (!board || !words) throw new Error("Could not build a complete Find the Words board.");

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let column = 0; column < BOARD_SIZE; column++) {
      if (!board[row][column]) board[row][column] = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    }
  }
  return { grid: board.map(line => line.join("")), words };
}

function validGame(game) {
  return Boolean(game && typeof game === "object" &&
    Array.isArray(game.grid) && game.grid.length === BOARD_SIZE &&
    game.grid.every(row => typeof row === "string" && row.length === BOARD_SIZE && /^[A-Z]+$/.test(row)) &&
    Array.isArray(game.words) && game.words.length === WORDS_PER_GAME &&
    game.words.every(item => typeof item.word === "string" && /^[a-z]{3,12}$/.test(item.word) &&
      Array.isArray(item.cells) && item.cells.length === item.word.length &&
      item.cells.every(index => Number.isInteger(index) && index >= 0 && index < BOARD_SIZE * BOARD_SIZE) &&
      typeof item.foundBy === "string") &&
    game.players && typeof game.players === "object" &&
    ["playing", "finished"].includes(game.status));
}

function traceCells(start, end) {
  const startRow = Math.floor(start / BOARD_SIZE), startColumn = start % BOARD_SIZE;
  const endRow = Math.floor(end / BOARD_SIZE), endColumn = end % BOARD_SIZE;
  const rowDifference = endRow - startRow, columnDifference = endColumn - startColumn;
  const length = Math.max(Math.abs(rowDifference), Math.abs(columnDifference));
  if (length === 0) return [start];
  if (rowDifference !== 0 && columnDifference !== 0 && Math.abs(rowDifference) !== Math.abs(columnDifference)) return [];
  const rowStep = Math.sign(rowDifference), columnStep = Math.sign(columnDifference);
  return Array.from({ length: length + 1 }, (_, index) =>
    (startRow + rowStep * index) * BOARD_SIZE + startColumn + columnStep * index);
}

function wordAt(game, cells) {
  if (!cells.length) return null;
  const picked = cells.map(index => game.grid[Math.floor(index / BOARD_SIZE)][index % BOARD_SIZE]).join("").toLocaleLowerCase();
  return game.words.find(item => !item.foundBy && (
    item.word === picked || item.word === [...picked].reverse().join("")
  )) || null;
}

export function mountFindTheWordsGame(container, user, profile) {
  if (!container) return () => {};
  document.body.classList.add("word-search-fullscreen");
  const playerName = getDisplayName(user.uid, profile?.name || "Player");
  const profileKey = getProfileKey(profile);
  const stopListeners = [];
  let game = null;
  let presence = {};
  let selectionStart = null;
  let selectionEnd = null;
  let saving = false;
  let disposed = false;

  container.innerHTML = `<main class="find-words-page">
    <header class="find-words-header">
      <button type="button" class="find-words-back" data-back-games aria-label="Back to games">‹ <span>Games</span></button>
      <div class="find-words-title"><span class="find-words-title-icon" aria-hidden="true">🔎</span><div><p class="eyebrow">OUR LITTLE WORLD · LIVE GAME</p><h1>Find the Words</h1></div></div>
      <div class="find-words-online" id="find-words-online"></div>
    </header>
    <div id="find-words-content" class="find-words-content" aria-live="polite"></div>
    <p id="find-words-message" class="find-words-message" aria-live="polite"></p>
  </main>`;

  const content = $("#find-words-content", container);
  const message = $("#find-words-message", container);

  function render() {
    if (!content) return;
    if (!rtdb) {
      content.innerHTML = `<section class="find-words-welcome"><span>♡</span><h2>Live play needs Firebase</h2><p>Firebase Realtime Database is not configured, so the shared word board is unavailable.</p></section>`;
      return;
    }
    if (!validGame(game)) {
      content.innerHTML = `<section class="find-words-welcome"><span>🔤</span><h2>A fresh word hunt awaits</h2><p>Find ${WORDS_PER_GAME} common words in a new full-screen letter grid. Your partner sees every find live.</p><button class="primary" type="button" data-new-find-words>Start a new game</button></section>`;
      return;
    }

    const participants = Object.entries(game.players);
    const otherPlayer = participants.find(([uid]) => uid !== user.uid);
    const foundCounts = Object.fromEntries(participants.map(([uid]) => [uid, game.words.filter(item => item.foundBy === uid).length]));
    const completedCount = game.words.filter(item => item.foundBy).length;
    const finished = game.status === "finished";
    const ownerMessage = finished
      ? game.winnerUid === user.uid ? "You won this word hunt! 🎉" : game.winnerUid ? `${esc(getDisplayName(game.winnerUid, "Your partner"))} won this word hunt! 💕` : "It's a tie! Great teamwork. 💕"
      : "Drag across a word in any direction. Found words light up for both of you.";
    const pathColors = new Map();
    game.words.filter(item => item.foundBy).forEach(item => {
      const style = item.foundBy === user.uid ? "own" : "partner";
      item.cells.forEach(index => pathColors.set(index, style));
    });
    const previewCells = selectionStart == null || selectionEnd == null ? [] : traceCells(selectionStart, selectionEnd);
    const scoreCards = participants.map(([uid, player]) => `<div class="find-words-score"><span class="find-words-score-dot ${uid === user.uid ? "own" : "partner"}"></span><span>${uid === user.uid ? "You" : esc(player.name || getDisplayName(uid, "Partner"))}</span><strong>${foundCounts[uid] || 0}</strong></div>`).join("");
    const cells = game.grid.flatMap(row => [...row]).map((letter, index) => {
      const style = pathColors.get(index) || "";
      const selected = previewCells.includes(index);
      return `<button type="button" class="find-words-cell ${style}${selected ? " selecting" : ""}" data-find-cell="${index}" aria-label="${letter}, row ${Math.floor(index / BOARD_SIZE) + 1}, column ${index % BOARD_SIZE + 1}">${letter}</button>`;
    }).join("");
    const wordList = game.words.map(item => {
      const finder = item.foundBy ? item.foundBy === user.uid ? "You" : getDisplayName(item.foundBy, "Partner") : "";
      const style = item.foundBy ? item.foundBy === user.uid ? "own" : "partner" : "";
      return `<li class="find-words-word ${style}${item.foundBy ? " found" : ""}"><span>${esc(item.word.toLocaleUpperCase())}</span>${finder ? `<small>${esc(finder)}</small>` : ""}</li>`;
    }).join("");
    content.innerHTML = `<section class="find-words-match">
      <div class="find-words-status">
        <div><strong>${finished ? "Round complete" : "Word hunt is live"}</strong><span>${esc(ownerMessage)}</span></div>
        <div class="find-words-counter">${completedCount}<small> / ${WORDS_PER_GAME}</small></div>
      </div>
      <div class="find-words-scores">${scoreCards}<div class="find-words-online-count"><span class="find-words-presence-dot${presence[otherPlayer?.[0]]?.online ? " online" : ""}"></span>${presence[otherPlayer?.[0]]?.online ? "Partner online" : "Partner offline"}</div></div>
      <div class="find-words-play-area">
        <div class="find-words-board-wrap"><div class="find-words-board" role="group" aria-label="Letter grid">${cells}</div></div>
        <aside class="find-words-words-panel"><h2>Find these words <span>${WORDS_PER_GAME}</span></h2><ul class="find-words-list">${wordList}</ul></aside>
      </div>
      ${finished ? `<button class="primary find-words-new-round" type="button" data-new-find-words>Play with a new set of words</button>` : ""}
    </section>`;
  }

  async function startGame() {
    if (!rtdb || saving) return;
    saving = true;
    const button = $("[data-new-find-words]", container);
    if (button) button.disabled = true;
    try {
      const next = makeBoard(game?.words?.map(item => item.word) || []);
      const transaction = await runTransaction(gameRef(), current => {
        if (validGame(current) && current.status === "playing") return;
        return {
          ...next,
          gameId: `${Date.now()}-${user.uid}`,
          status: "playing",
          winnerUid: "",
          players: { [user.uid]: { name: playerName } },
          createdAt: Date.now()
        };
      });
      if (!transaction.committed) toast("This word hunt is already in progress. Join the live game!");
    } catch (error) {
      console.error("Could not start Find the Words:", error);
      toast("A new word hunt could not be started. Please try again.");
    } finally {
      saving = false;
      if (!disposed) render();
    }
  }

  async function joinGame(current) {
    if (!validGame(current) || current.status !== "playing" || current.players[user.uid]) return;
    const playerUids = Object.keys(current.players);
    if (playerUids.length >= 2) return;
    try {
      const transaction = await runTransaction(gameRef(), latest => {
        if (!validGame(latest) || latest.gameId !== current.gameId || latest.status !== "playing" ||
            latest.players[user.uid] || Object.keys(latest.players).length >= 2) return;
        return { ...latest, players: { ...latest.players, [user.uid]: { name: playerName } } };
      });
      if (!transaction.committed && !disposed) toast("This word hunt is already full or has ended.");
    } catch (error) {
      console.error("Could not join Find the Words:", error);
      toast("You could not join the live word hunt. Please try again.");
    }
  }

  async function claimWord(foundWord) {
    if (!rtdb || !game || saving || !foundWord) return;
    saving = true;
    try {
      const transaction = await runTransaction(gameRef(), current => {
        if (!validGame(current) || current.status !== "playing" || !current.players[user.uid]) return;
        const item = current.words.find(entry => entry.word === foundWord.word && !entry.foundBy);
        if (!item) return;
        const words = current.words.map(entry => entry === item ? { ...entry, foundBy: user.uid } : entry);
        const finished = words.every(entry => entry.foundBy);
        const scores = Object.fromEntries(Object.keys(current.players).map(uid => [
          uid, words.filter(entry => entry.foundBy === uid).length
        ]));
        const ordered = Object.entries(scores).sort((first, second) => second[1] - first[1]);
        return {
          ...current,
          words,
          status: finished ? "finished" : "playing",
          winnerUid: finished && ordered[0]?.[1] !== ordered[1]?.[1] ? ordered[0]?.[0] || "" : "",
          updatedAt: Date.now()
        };
      });
      if (!transaction.committed && !disposed && message) message.textContent = "Your partner found that word first!";
    } catch (error) {
      console.error("Could not save found word:", error);
      if (!disposed && message) message.textContent = "That word could not be synced. Please try again.";
    } finally {
      saving = false;
    }
  }

  let dragStart = null;
  container.addEventListener("pointerdown", event => {
    const cell = event.target.closest("[data-find-cell]");
    if (!cell || game?.status !== "playing" || !game.players?.[user.uid]) return;
    dragStart = Number(cell.dataset.findCell);
    selectionStart = dragStart;
    selectionEnd = dragStart;
    updateSelection(container, selectionStart, selectionEnd);
  });
  container.addEventListener("pointerover", event => {
    const cell = event.target.closest("[data-find-cell]");
    if (dragStart == null || !cell) return;
    selectionEnd = Number(cell.dataset.findCell);
    updateSelection(container, selectionStart, selectionEnd);
  });
  container.addEventListener("pointerup", event => {
    if (dragStart == null) return;
    const cell = event.target.closest("[data-find-cell]");
    const end = cell ? Number(cell.dataset.findCell) : selectionEnd;
    const cells = traceCells(dragStart, end);
    const found = game && wordAt(game, cells);
    dragStart = null;
    selectionStart = null;
    selectionEnd = null;
    updateSelection(container, null, null);
    if (found) claimWord(found);
  });
  container.addEventListener("pointercancel", () => {
    dragStart = null;
    selectionStart = null;
    selectionEnd = null;
    updateSelection(container, null, null);
  });
  container.addEventListener("click", event => {
    if (event.target.closest("[data-new-find-words]")) startGame();
    const cell = event.target.closest("[data-find-cell]");
    if (cell && game?.status === "playing" && !dragStart) {
      const index = Number(cell.dataset.findCell);
      const found = wordAt(game, [index]);
      if (found) claimWord(found);
    }
  });

  if (rtdb) {
    stopListeners.push(onValue(gameRef(), snapshot => {
      game = snapshot.val();
      if (validGame(game) && game.status === "playing" && !game.players[user.uid]) joinGame(game);
      render();
    }, error => {
      console.error("Find the Words could not be loaded:", error);
      if (content) content.innerHTML = `<section class="find-words-welcome"><p class="error">The live word board could not be loaded. Check your connection and try again.</p></section>`;
    }));
    const connectionRef = ref(rtdb, ".info/connected");
    stopListeners.push(onValue(connectionRef, snapshot => {
      if (snapshot.val() !== true || !profileKey) return;
      const playerRef = presenceRef(user.uid);
      set(playerRef, { name: playerName, profileKey, online: true, lastSeen: Date.now() })
        .then(() => onDisconnect(playerRef).remove())
        .catch(error => {
          console.error("Find the Words presence could not be updated:", error);
          if (!disposed && message) message.textContent = "Your online status could not be shared.";
        });
    }, error => {
      console.error("Find the Words connection status could not be loaded:", error);
    }));
    stopListeners.push(onValue(ref(rtdb, "couples/our-little-world/games/findTheWordsPresence"), snapshot => {
      presence = snapshot.val() || {};
      render();
    }, error => {
      console.error("Find the Words presence could not be loaded:", error);
    }));
  }
  render();

  return () => {
    disposed = true;
    stopListeners.forEach(stop => stop());
    if (rtdb) {
      const playerRef = presenceRef(user.uid);
      onDisconnect(playerRef).cancel()
        .then(() => set(playerRef, null))
        .catch(error => console.error("Find the Words presence could not be cleared:", error));
    }
    container.replaceChildren();
    document.body.classList.remove("word-search-fullscreen");
  };
}
