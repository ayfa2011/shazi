import { APP_CONFIG } from "../config/app-config.js";
import { recordGameMatchResult, notifyPartnerSafely } from "./firestore.js";
import { findProfileForAuthor, getDisplayName, getProfileKey } from "./profile-data.js";
import { onValue, ref, runTransaction } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { rtdb } from "./firebase.js";
import { $, esc, toast } from "./utils.js";

const matchRef = () => ref(rtdb, `couples/${APP_CONFIG.coupleId}/games/matches/ludo`);
const colorInfo = {
  red: { name: "Red", local: "ಕೆಂಪು", css: "red", start: 6, emoji: "❤️" },
  blue: { name: "Blue", local: "ನೀಲಿ", css: "blue", start: 45, emoji: "💙" },
  green: { name: "Green", local: "ಹಸಿರು", css: "green", start: 19, emoji: "💚" },
  yellow: { name: "Yellow", local: "ಹಳದಿ", css: "yellow", start: 32, emoji: "💛" }
};
const colorOrder = ["red", "blue", "green", "yellow"];
const track = [];
for (let column = 1; column <= 13; column++) track.push([0, column]);
for (let row = 1; row <= 13; row++) track.push([row, 14]);
for (let column = 13; column >= 1; column--) track.push([14, column]);
for (let row = 13; row >= 1; row--) track.push([row, 0]);
const trackIndex = new Map(track.map(([row, column], index) => [`${row},${column}`, index]));
const safeTrackCells = new Set([0, 6, 13, 19, 26, 32, 39, 45]);
const yardSpots = {
  red: [[2, 2], [2, 4], [4, 2], [4, 4]],
  green: [[2, 10], [2, 12], [4, 10], [4, 12]],
  blue: [[10, 2], [10, 4], [12, 2], [12, 4]],
  yellow: [[10, 10], [10, 12], [12, 10], [12, 12]]
};
const homeLanes = {
  red: Array.from({ length: 6 }, (_, index) => [index + 1, 6]),
  green: Array.from({ length: 6 }, (_, index) => [6, 13 - index]),
  yellow: Array.from({ length: 6 }, (_, index) => [13 - index, 8]),
  blue: Array.from({ length: 6 }, (_, index) => [8, index + 1])
};
const diceFaces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
let stopRoom = null;

function profileForUid(uid, fallbackName = "") {
  const configured = Object.values(APP_CONFIG.profiles).find(profile => profile.authUid === uid || profile.id === uid);
  return configured || findProfileForAuthor(uid, fallbackName) || {};
}

function avatar(uid, name, color = "") {
  const profile = profileForUid(uid, name);
  const displayName = getDisplayName(uid, profile.name || name || "Partner");
  const avatarMarkup = profile.avatar
    ? `<img src="${esc(profile.avatar)}" alt="${esc(displayName)}" loading="lazy">`
    : `<span class="ludo-avatar-fallback" aria-hidden="true">${esc(displayName.slice(0, 1))}</span>`;
  return `<span class="ludo-avatar ${colorInfo[color] ? `color-${colorInfo[color].css}` : ""}">${avatarMarkup}</span>`;
}

function currentColorMap(room) {
  return Object.fromEntries((room?.playerUids || []).map(uid => [room.players?.[uid]?.color, uid]));
}

function playerName(room, uid) {
  return getDisplayName(uid, room?.players?.[uid]?.name || "Partner");
}

function getTrackPosition(color, progress) {
  return (colorInfo[color].start + progress) % track.length;
}

function targetForMove(player, position, dice) {
  if (position === -1) return dice === 6 ? 0 : null;
  if (position >= 52) return position + dice <= 57 ? position + dice : null;
  const next = position + dice;
  if (next <= 51) return next;
  const homeUnlocked = player.hasCaptured && (player.completedLap || next > 51);
  if (homeUnlocked && next <= 57) return next;
  return next - 52;
}

function legalPieces(player, dice) {
  return (player?.pieces || []).flatMap((position, index) => targetForMove(player, position, dice) == null ? [] : [index]);
}

function appendHistory(room, entry) {
  return [...(Array.isArray(room.history) ? room.history : []), { ...entry, at: Date.now() }].slice(-40);
}

function ensurePlayer(room, uid) {
  return room && room.game === "ludo" && Array.isArray(room.playerUids) && room.playerUids.includes(uid) && room.players?.[uid];
}

function playerCard(room, uid, isTurn = false) {
  const player = room.players[uid];
  const color = colorInfo[player.color];
  const homeCount = player.pieces?.filter(position => position === 57).length || 0;
  return `<div class="ludo-player-card ${color?.css || ""}${isTurn ? " active-turn" : ""}">${avatar(uid, player.name, player.color)}<div class="ludo-player-copy"><strong>${esc(playerName(room, uid))}</strong><span>${color ? `${color.emoji} ${color.name}` : "Choosing color"}</span><small>${player.captures || 0} captures</small></div><span class="ludo-home-count" aria-label="${homeCount} of 4 pieces home">🏠 ${homeCount}<small>/ 4</small></span></div>`;
}

function getCellBaseColor(row, column) {
  if (row < 6 && column < 6) return "red";
  if (row < 6 && column > 8) return "green";
  if (row > 8 && column < 6) return "blue";
  if (row > 8 && column > 8) return "yellow";
  return "";
}

function getTokenCoordinate(player, progress, pieceIndex) {
  if (progress === -1) return yardSpots[player.color][pieceIndex];
  if (progress >= 52) return homeLanes[player.color][progress - 52];
  return track[getTrackPosition(player.color, progress)];
}

function renderBoard(room, uid, selectedPieces = []) {
  const tokensAt = new Map();
  for (const playerUid of room.playerUids) {
    const player = room.players[playerUid];
    (player.pieces || []).forEach((progress, pieceIndex) => {
      const [row, column] = getTokenCoordinate(player, progress, pieceIndex);
      const key = `${row},${column}`;
      if (!tokensAt.has(key)) tokensAt.set(key, []);
      tokensAt.get(key).push({ uid: playerUid, player, pieceIndex, progress });
    });
  }
  const selected = new Set(selectedPieces);
  const cells = Array.from({ length: 225 }, (_, index) => {
    const row = Math.floor(index / 15);
    const column = index % 15;
    const key = `${row},${column}`;
    const position = trackIndex.get(key);
    const laneColor = Object.entries(homeLanes).find(([, cellsInLane]) => cellsInLane.some(([laneRow, laneColumn]) => laneRow === row && laneColumn === column))?.[0] || "";
    const baseColor = getCellBaseColor(row, column);
    const inCenter = row >= 6 && row <= 8 && column >= 6 && column <= 8;
    const isSafe = Number.isInteger(position) && safeTrackCells.has(position);
    const isStart = Number.isInteger(position) && Object.values(colorInfo).some(color => color.start === position);
    const tokens = tokensAt.get(key) || [];
    const classes = ["ludo-cell", position != null ? "track-cell" : "", baseColor ? `base-${baseColor}` : "", laneColor ? `lane-${laneColor}` : "", inCenter ? "center-cell" : "", isSafe ? "safe-cell" : "", isStart ? "start-cell" : "", tokens.some(token => token.progress === 57) ? "home-cell" : ""].filter(Boolean).join(" ");
    const lanePlayer = laneColor ? room.playerUids.map(playerUid => room.players[playerUid]).find(player => player.color === laneColor) : null;
    const homeLocked = lanePlayer && !(lanePlayer.hasCaptured && lanePlayer.completedLap);
    const centerIcon = inCenter && row === 7 && column === 7 ? `<span class="ludo-center-mark" aria-hidden="true">🏆</span>` : "";
    const lockIcon = homeLocked && row === homeLanes[laneColor][0][0] && column === homeLanes[laneColor][0][1]
      ? `<span class="ludo-path-lock" title="Capture a piece and complete a lap to unlock home">🔒</span>` : "";
    const tokenMarkup = tokens.map(token => {
      const canMove = token.uid === uid && selected.has(token.pieceIndex) && room.turnUid === uid && room.phase === "move";
      const color = colorInfo[token.player.color]?.css || "red";
      const animation = room.lastMove?.uid === token.uid && room.lastMove?.pieceIndex === token.pieceIndex && room.lastMove?.to === token.progress
        ? " ludo-token-arrive" : room.lastMove?.captured?.some(capture => capture.uid === token.uid && capture.pieceIndex === token.pieceIndex) && token.progress === -1 ? " ludo-token-captured" : "";
      const mark = avatar(token.uid, token.player.name, token.player.color);
      const title = `${playerName(room, token.uid)} · piece ${token.pieceIndex + 1}`;
      return canMove
        ? `<button type="button" class="ludo-token ${color}${animation}" data-ludo-piece="${token.pieceIndex}" aria-label="Move ${esc(title)}">${mark}</button>`
        : `<span class="ludo-token ${color}${animation}" title="${esc(title)}">${mark}</span>`;
    }).join("");
    return `<div class="${classes}" style="grid-row:${row + 1};grid-column:${column + 1}" ${position != null ? `data-track-index="${position}"` : ""}>${isSafe ? `<span class="ludo-safe-star" aria-hidden="true">★</span>` : ""}${centerIcon}${lockIcon}${tokens.length ? `<div class="ludo-cell-tokens">${tokenMarkup}</div>` : ""}</div>`;
  }).join("");
  return `<div class="ludo-board-frame"><div class="ludo-board" role="grid" aria-label="Live Ludo board">${cells}</div></div>`;
}

function makeRoom(uid, name, color) {
  return {
    matchId: `${Date.now()}-${uid}`,
    game: "ludo",
    status: "waiting",
    playerUids: [uid],
    players: { [uid]: { name, color, ready: false, pieces: [-1, -1, -1, -1], captures: 0, hasCaptured: false, completedLap: false, sixStreak: 0 } },
    turnUid: "",
    phase: "roll",
    dice: null,
    winnerUid: "",
    history: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function mountLudoGame(el, user, profile) {
  const statusEl = $("#games-room-status", el);
  const content = $("#games-active-content", el);
  if (!statusEl || !content) return () => {};

  let room = null;
  let lastAnimatedMoveId = "";
  let selectedColor = "red";
  let disposed = false;
  const savedResults = new Set();

  function showError(message) {
    toast(message);
  }

  function renderLobby() {
    const occupied = currentColorMap(room);
    const ownColor = room?.players?.[user.uid]?.color || selectedColor;
    const colorPicker = `<div class="ludo-color-picker">${colorOrder.map(color => {
      const info = colorInfo[color];
      const occupiedByOther = occupied[color] && occupied[color] !== user.uid;
      return `<button type="button" class="ludo-color-option color-${info.css}${ownColor === color ? " selected" : ""}" data-ludo-color="${color}" ${occupiedByOther ? "disabled" : ""}><i></i><span>${info.name}<small>${info.local}</small></span>${ownColor === color ? `<b>✓</b>` : ""}</button>`;
    }).join("")}</div>`;
    const playerCards = room
      ? `<div class="ludo-players-row">${room.playerUids.map(uid => playerCard(room, uid, room.turnUid === uid)).join("")}${room.playerUids.length < 2 ? `<div class="ludo-player-card waiting">${avatar("", "Partner")}<div class="ludo-player-copy"><strong>Player 2</strong><span>Waiting to join…</span></div></div>` : ""}</div>`
      : "";
    if (!room || ["finished", "cancelled"].includes(room.status)) {
      const summary = room?.status === "finished"
        ? room.winnerUid === user.uid ? "You brought all four coins home! 🎉" : `${esc(playerName(room, room.winnerUid))} won this round. Play again? ♡`
        : room?.status === "cancelled" ? "This Ludo match ended." : "Choose your color, roll the dice, and bring all four coins home.";
      const previousHistory = room?.history?.length
        ? `<details class="ludo-history ludo-previous-history"><summary>Previous match history <span>${room.history.length} moves</span></summary><ol>${room.history.slice(-16).reverse().map(item => `<li><span>${esc(item.text || "A move was made")}</span><time>${new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></li>`).join("")}</ol></details>`
        : "";
      statusEl.innerHTML = `<div class="game-panel game-room-panel ludo-status"><p class="tic-tac-toe-status">${summary}</p>${playerCards}<button type="button" class="primary" data-ludo-start>${room ? "Play again" : "Start a private match"}</button></div>`;
      content.innerHTML = `<article class="game-panel ludo-panel"><div class="ludo-intro-icon" aria-hidden="true">🎲</div><p class="ludo-overline">OUR LITTLE GAMES · 2 PLAYERS</p><h2>${room?.status === "finished" ? "A sweet match together" : "Choose your color"}</h2><p class="games-instructions">Your four coins each carry your profile photo. Pick different colors before the match begins.</p>${room?.status === "finished" ? `${previousHistory}<h3 class="ludo-final-score">${esc(playerName(room, room.winnerUid))} wins · ${room.playerUids.map(uid => `${esc(playerName(room, uid))}: ${room.players[uid].captures || 0} captures`).join(" · ")}</h3>` : colorPicker}<p class="ludo-special-rule"><strong>Our home-path rule</strong><span>Capture at least one opponent coin and complete a full lap to unlock your home lane.</span></p></article>`;
      return;
    }

    if (room.status === "waiting") {
      const creator = room.playerUids[0] === user.uid;
      statusEl.innerHTML = `<div class="game-panel game-room-panel ludo-status"><p class="tic-tac-toe-status">${creator ? "Waiting for your partner to join…" : `${esc(playerName(room, room.playerUids[0]))} invited you to Ludo.`}</p>${playerCards}${creator ? `<button type="button" class="secondary" data-ludo-cancel>Cancel match</button>` : `<button type="button" class="primary" data-ludo-start>Join match</button>`}</div>`;
      content.innerHTML = `<article class="game-panel ludo-panel"><div class="ludo-intro-icon" aria-hidden="true">⚓ 🎲 ♡</div><p class="games-instructions">Your partner will join from their device, then you will each choose a color and mark ready.</p>${creator ? colorPicker : ""}</article>`;
      return;
    }

    if (room.status === "setup") {
      const player = room.players[user.uid];
      const ready = player?.ready;
      statusEl.innerHTML = `<div class="game-panel game-room-panel ludo-status"><p class="tic-tac-toe-status">${ready ? "Color locked in! Waiting for your partner…" : "Choose a color, then mark ready."}</p>${playerCards}</div>`;
      content.innerHTML = `<article class="game-panel ludo-panel"><p class="ludo-overline">PICK YOUR COIN COLOR</p><h2>Player 1 &amp; Player 2</h2><p class="games-instructions">Each player needs a different color. You can change it until both players are ready.</p>${colorPicker}<button type="button" class="primary ludo-ready-button" data-ludo-ready ${ready ? "disabled" : ""}>${ready ? "Ready ✓" : "Ready to play ♡"}</button></article>`;
      return;
    }

    const player = room.players[user.uid];
    const isTurn = room.turnUid === user.uid;
    const available = room.phase === "move" && isTurn ? legalPieces(player, room.dice) : [];
    const unlocked = player.hasCaptured && player.completedLap;
    const turnName = room.turnUid ? playerName(room, room.turnUid) : "";
    const lastMove = room.lastMove;
    const message = room.phase === "move"
      ? isTurn ? `You rolled ${room.dice}. Tap a glowing coin to move.` : `${turnName} rolled ${room.dice} and is choosing a coin…`
      : isTurn ? "Your turn — roll the dice!" : `${turnName} is rolling…`;
    const dice = room.dice ? diceFaces[room.dice - 1] : "🎲";
    const statusPlayers = `<div class="ludo-players-row">${room.playerUids.map(uid => playerCard(room, uid, room.turnUid === uid)).join("")}</div>`;
    const diceAction = isTurn && room.phase === "roll"
      ? `<button type="button" class="ludo-roll-button" data-ludo-roll aria-label="Roll dice">${dice}<span>Roll dice</span></button>`
      : `<div class="ludo-dice-display ${room.dice ? "rolled" : ""}" aria-label="Dice showing ${room.dice || "waiting"}">${dice}</div>`;
    const lockNotice = !unlocked
      ? `<p class="ludo-lock-note"><span>🔒</span> Home lane locked — capture a coin and complete one full lap to open it.</p>`
      : `<p class="ludo-lock-note unlocked"><span>🏁</span> Home lane unlocked! Roll the exact number to finish.</p>`;
    const lastMoveMessage = lastMove
      ? `<p class="ludo-last-move ${lastMove.captured?.length ? "captured" : ""}" aria-live="polite">${esc(lastMove.message || "A coin moved.")}</p>`
      : "";
    const historyMarkup = `<details class="ludo-history"><summary>Match history <span>${room.history?.length || 0} moves</span></summary><ol>${(room.history || []).slice(-12).reverse().map(item => `<li><span>${esc(item.text || "A move was made")}</span><time>${new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></li>`).join("") || `<li class="empty">The first roll is waiting ♡</li>`}</ol></details>`;
    statusEl.innerHTML = `<div class="game-panel game-room-panel ludo-status"><p class="tic-tac-toe-status">${esc(message)}</p>${statusPlayers}<div class="ludo-turn-tools">${diceAction}<span class="ludo-roll-count">${room.phase === "move" ? `${available.length} coin${available.length === 1 ? "" : "s"} can move` : isTurn ? "Roll to begin your turn" : "Waiting for the next roll"}</span></div>${lockNotice}${lastMoveMessage}<button type="button" class="secondary ludo-end-button" data-ludo-end>End match</button></div>`;
    content.innerHTML = `<div class="ludo-game-layout">${renderBoard(room, user.uid, available)}<aside class="ludo-side-panel"><p class="ludo-board-hint">${room.phase === "move" && isTurn ? "Tap one of your highlighted coins on the board." : "Each roll and coin move syncs live between your devices."}</p>${historyMarkup}</aside></div>`;
    if (lastMove?.captured?.length && lastMove.id !== lastAnimatedMoveId) {
      lastAnimatedMoveId = lastMove.id;
      requestAnimationFrame(() => content.querySelector(".ludo-last-move")?.classList.add("show"));
    }
  }

  function recordFinished(roomToSave) {
    if (!roomToSave?.matchId || savedResults.has(roomToSave.matchId)) return;
    savedResults.add(roomToSave.matchId);
    const scores = Object.fromEntries(roomToSave.playerUids.map(uid => [uid, roomToSave.players[uid]?.captures || 0]));
    const profileKey = getProfileKey(profile) || Object.keys(APP_CONFIG.profiles).find(key => APP_CONFIG.profiles[key].authUid === user.uid) || "";
    recordGameMatchResult({
      uid: user.uid,
      authorId: profile?.id || user.uid,
      matchId: roomToSave.matchId,
      game: "Ludo",
      winnerUid: roomToSave.winnerUid,
      players: roomToSave.playerUids,
      scores
    }).then(() => {
      if (roomToSave.winnerUid === user.uid && profileKey) {
        void notifyPartnerSafely(profileKey, "game", `${profile?.name || playerName(roomToSave, user.uid)} won a game of Ludo!`, roomToSave.matchId, "games");
      }
    }).catch(error => {
      savedResults.delete(roomToSave.matchId);
      console.error("Could not save Ludo result:", error);
    });
  }

  function render() {
    if (disposed) return;
    if (!rtdb) {
      statusEl.innerHTML = `<p class="error">Online Ludo needs Firebase Realtime Database.</p>`;
      content.replaceChildren();
      return;
    }
    if (room?.status === "finished") recordFinished(room);
    renderLobby();
  }

  async function startOrJoin() {
    try {
      const color = colorInfo[selectedColor] ? selectedColor : "red";
      const transaction = await runTransaction(matchRef(), current => {
        if (current && ["waiting", "setup", "playing"].includes(current.status)) {
          if (ensurePlayer(current, user.uid)) return current;
          if (current.status === "waiting" && current.playerUids.length === 1) {
            const available = colorOrder.find(option => option !== current.players[current.playerUids[0]].color) || "blue";
            return {
              ...current,
              status: "setup",
              playerUids: [...current.playerUids, user.uid],
              players: { ...current.players, [user.uid]: { name: profile?.name || getDisplayName(user.uid, "Player 2"), color: available, ready: false, pieces: [-1, -1, -1, -1], captures: 0, hasCaptured: false, completedLap: false, sixStreak: 0 } },
              updatedAt: Date.now()
            };
          }
          return;
        }
        return makeRoom(user.uid, profile?.name || getDisplayName(user.uid, "Player 1"), color);
      });
      if (!transaction.committed) showError("A Ludo match is already in progress with your partner.");
    } catch (error) {
      console.error("Could not start or join Ludo:", error);
      showError("Could not start Ludo. Please reconnect and try again.");
    }
  }

  async function chooseColor(color) {
    if (!colorInfo[color]) return;
    selectedColor = color;
    if (!room || ["finished", "cancelled"].includes(room.status)) {
      renderLobby();
      return;
    }
    try {
      const transaction = await runTransaction(matchRef(), current => {
      if (!["waiting", "setup"].includes(current?.status) || !ensurePlayer(current, user.uid)) return;
        if (current.playerUids.some(uid => uid !== user.uid && current.players[uid].color === color)) return;
        return { ...current, players: { ...current.players, [user.uid]: { ...current.players[user.uid], color, ready: false } }, updatedAt: Date.now() };
      });
      if (!transaction.committed) showError("That color is already chosen. Pick another one.");
    } catch (error) {
      console.error("Could not select a Ludo color:", error);
      showError("Your color could not be saved.");
    }
  }

  async function readyUp() {
    try {
      const transaction = await runTransaction(matchRef(), current => {
        if (current?.status !== "setup" || !ensurePlayer(current, user.uid)) return;
        if (current.playerUids.some(uid => uid !== user.uid && current.players[uid].color === current.players[user.uid].color)) return;
        const players = { ...current.players, [user.uid]: { ...current.players[user.uid], ready: true } };
        const allReady = current.playerUids.length === 2 && current.playerUids.every(uid => players[uid].ready);
        return {
          ...current,
          players,
          status: allReady ? "playing" : "setup",
          turnUid: allReady ? current.playerUids[0] : "",
          phase: "roll",
          dice: null,
          updatedAt: Date.now()
        };
      });
      if (!transaction.committed) showError("Choose an available color before marking ready.");
    } catch (error) {
      console.error("Could not ready Ludo player:", error);
      showError("Your ready status could not be saved.");
    }
  }

  async function rollDice() {
    const dice = Math.floor(Math.random() * 6) + 1;
    try {
      const transaction = await runTransaction(matchRef(), current => {
        if (current?.game !== "ludo" || current.status !== "playing" || current.turnUid !== user.uid || current.phase !== "roll") return;
        const player = current.players[user.uid];
        const streak = dice === 6 ? (player.sixStreak || 0) + 1 : 0;
        if (streak >= 3) {
          const nextUid = current.playerUids.find(uid => uid !== user.uid);
          return {
            ...current,
            players: { ...current.players, [user.uid]: { ...player, sixStreak: 0 } },
            turnUid: nextUid,
            dice: null,
            phase: "roll",
            lastMove: { uid: user.uid, message: `${player.name} rolled three sixes. Turn passes to the other player.` },
            history: appendHistory(current, { text: `${player.name} rolled three sixes — turn passed.` }),
            updatedAt: Date.now()
          };
        }
        const movable = legalPieces(player, dice);
        const nextUid = current.playerUids.find(uid => uid !== user.uid);
        if (!movable.length) {
          return {
            ...current,
            players: { ...current.players, [user.uid]: { ...player, sixStreak: streak } },
            turnUid: dice === 6 ? user.uid : nextUid,
            dice: null,
            phase: "roll",
            lastMove: { uid: user.uid, message: `${player.name} rolled ${dice}; no coin can move${dice === 6 ? ", roll again" : "."}` },
            history: appendHistory(current, { text: `${player.name} rolled ${dice}; no legal move.` }),
            updatedAt: Date.now()
          };
        }
        return {
          ...current,
          players: { ...current.players, [user.uid]: { ...player, sixStreak: streak } },
          dice,
          phase: "move",
          updatedAt: Date.now()
        };
      });
      if (!transaction.committed) showError("It is not your turn to roll.");
    } catch (error) {
      console.error("Could not roll Ludo dice:", error);
      showError("The dice could not be rolled. Please try again.");
    }
  }

  async function movePiece(pieceIndex) {
    try {
      const transaction = await runTransaction(matchRef(), current => {
        if (current?.game !== "ludo" || current.status !== "playing" || current.turnUid !== user.uid || current.phase !== "move" ||
            !Number.isInteger(pieceIndex) || pieceIndex < 0 || pieceIndex > 3) return;
        const player = current.players[user.uid];
        const oldPosition = player.pieces[pieceIndex];
        const nextPosition = targetForMove(player, oldPosition, current.dice);
        if (nextPosition == null) return;
        const pieces = [...player.pieces];
        pieces[pieceIndex] = nextPosition;
        const completedLap = player.completedLap || (oldPosition >= 0 && oldPosition < 52 && oldPosition + current.dice > 51);
        const updatedPlayer = { ...player, pieces, completedLap };
        const players = { ...current.players, [user.uid]: updatedPlayer };
        let captured = [];
        if (nextPosition < 52) {
          const globalPosition = getTrackPosition(player.color, nextPosition);
          if (!safeTrackCells.has(globalPosition)) {
            const opponentUid = current.playerUids.find(uid => uid !== user.uid);
            const opponent = players[opponentUid];
            const opponentPieces = [...opponent.pieces];
            captured = opponentPieces.flatMap((position, index) => position >= 0 && position < 52 && getTrackPosition(opponent.color, position) === globalPosition ? [index] : []);
            if (captured.length) {
              captured.forEach(index => { opponentPieces[index] = -1; });
              players[opponentUid] = { ...opponent, pieces: opponentPieces };
              players[user.uid] = { ...updatedPlayer, captures: (updatedPlayer.captures || 0) + captured.length, hasCaptured: true };
            }
          }
        }
        const finished = pieces.every(position => position === 57);
        const extraTurn = current.dice === 6 || captured.length > 0;
        const nextUid = current.playerUids.find(uid => uid !== user.uid);
        const destinationName = nextPosition === 57 ? "home" : nextPosition >= 52 ? "the home lane" : "the track";
        const moveDescription = captured.length
          ? `${player.name} captured ${captured.length} ${captured.length === 1 ? "coin" : "coins"}! 🎉`
          : nextPosition === 57 ? `${player.name} brought a coin home! 🏠` : `${player.name} moved a coin to ${destinationName}.`;
        const lastMove = { id: `${Date.now()}-${pieceIndex}`, uid: user.uid, pieceIndex, from: oldPosition, to: nextPosition, captured: captured.map(index => ({ uid: nextUid, pieceIndex: index })), message: moveDescription };
        const updated = {
          ...current,
          players,
          lastMove,
          history: appendHistory(current, { text: moveDescription }),
          status: finished ? "finished" : "playing",
          winnerUid: finished ? user.uid : "",
          turnUid: finished ? "" : extraTurn ? user.uid : nextUid,
          phase: "roll",
          dice: null,
          updatedAt: Date.now()
        };
        return updated;
      });
      if (!transaction.committed) showError("That coin cannot move with this roll.");
    } catch (error) {
      console.error("Could not move Ludo coin:", error);
      showError("Your coin could not be moved. Please try again.");
    }
  }

  async function endMatch() {
    try {
      const transaction = await runTransaction(matchRef(), current => {
        if (!ensurePlayer(current, user.uid) || !["waiting", "setup", "playing"].includes(current.status)) return;
        return { ...current, status: "cancelled", turnUid: "", updatedAt: Date.now() };
      });
      if (!transaction.committed) showError("This match has already ended.");
    } catch (error) {
      console.error("Could not end Ludo match:", error);
      showError("The match could not be ended.");
    }
  }

  async function onClick(event) {
    const target = event.target.closest("button");
    if (!target || !el.contains(target)) return;
    if (target.hasAttribute("data-ludo-start")) { await startOrJoin(); return; }
    if (target.hasAttribute("data-ludo-color")) { await chooseColor(target.dataset.ludoColor); return; }
    if (target.hasAttribute("data-ludo-ready")) { await readyUp(); return; }
    if (target.hasAttribute("data-ludo-roll")) { await rollDice(); return; }
    if (target.hasAttribute("data-ludo-piece")) { await movePiece(Number(target.dataset.ludoPiece)); return; }
    if (target.hasAttribute("data-ludo-cancel") || target.hasAttribute("data-ludo-end")) { await endMatch(); }
  }

  el.addEventListener("click", onClick);
  stopRoom = onValue(matchRef(), snapshot => {
    room = snapshot.val();
    render();
  }, error => {
    console.error("Ludo match could not be loaded:", error);
    statusEl.innerHTML = `<p class="error">The live Ludo match could not be loaded. Please reconnect.</p>`;
  });
  render();

  return () => {
    disposed = true;
    stopRoom?.();
    stopRoom = null;
    el.removeEventListener("click", onClick);
  };
}
