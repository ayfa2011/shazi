import { APP_CONFIG } from "../config/app-config.js";
import { recordGameMatchResult, notifyPartnerSafely } from "./firestore.js";
import { findProfileForAuthor, getDisplayName, getProfileKey } from "./profile-data.js";
import { onValue, ref, runTransaction } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { rtdb } from "./firebase.js";
import { $, esc, toast } from "./utils.js";

const matchRef = () => ref(rtdb, `couples/${APP_CONFIG.coupleId}/games/matches/ludo`);
const colorInfo = {
  red: { name: "Red", local: "ಕೆಂಪು", css: "red", start: 39, emoji: "❤️" },
  blue: { name: "Blue", local: "ನೀಲಿ", css: "blue", start: 26, emoji: "💙" },
  green: { name: "Green", local: "ಹಸಿರು", css: "green", start: 0, emoji: "💚" },
  yellow: { name: "Yellow", local: "ಹಳದಿ", css: "yellow", start: 13, emoji: "💛" }
};
const colorOrder = ["red", "blue", "green", "yellow"];
// The supplied board is a 15×15 Ludo cross; the 52-cell route wraps around its four arms.
const track = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0]
];
const trackIndex = new Map(track.map(([row, column], index) => [`${row},${column}`, index]));
// Standard Ludo safe spaces: the four stars and each color's entry square.
const safeTrackCells = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const yardSpots = {
  green: [[2, 2], [2, 4], [4, 2], [4, 4]],
  yellow: [[2, 10], [2, 12], [4, 10], [4, 12]],
  red: [[10, 2], [10, 4], [12, 2], [12, 4]],
  blue: [[10, 10], [10, 12], [12, 10], [12, 12]]
};
const homeLanes = {
  red: Array.from({ length: 6 }, (_, index) => [13 - index, 7]),
  green: Array.from({ length: 6 }, (_, index) => [7, index + 1]),
  yellow: Array.from({ length: 6 }, (_, index) => [index + 1, 7]),
  blue: Array.from({ length: 6 }, (_, index) => [7, 13 - index])
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

function targetForMove(position, dice) {
  if (!Number.isInteger(dice) || dice < 1 || dice > 6 || !Number.isInteger(position) || position < -1 || position > 57) return null;
  if (position === -1) return dice === 6 ? 0 : null;
  if (position >= 52) return position + dice <= 57 ? position + dice : null;
  const next = position + dice;
  // Complete the lap into the home lane, and require an exact roll to finish.
  return next <= 57 ? next : null;
}

function legalPieces(player, dice) {
  return (player?.pieces || []).flatMap((position, index) => targetForMove(position, dice) == null ? [] : [index]);
}

function appendHistory(room, entry) {
  return [...(Array.isArray(room.history) ? room.history : []), { ...entry, at: Date.now() }].slice(-40);
}

function completeMoveState(room, move) {
  const player = room.players?.[move.uid];
  const opponentUid = room.playerUids.find(uid => uid !== move.uid);
  if (!player || !opponentUid || !Number.isInteger(move.pieceIndex) || move.pieceIndex < 0 || move.pieceIndex > 3 ||
      !Number.isInteger(move.to) || move.to < 0 || move.to > 57) return null;

  const pieces = [...player.pieces];
  pieces[move.pieceIndex] = move.to;
  const players = { ...room.players, [move.uid]: { ...player, pieces } };
  let captured = [];
  if (move.to < 52) {
    const landingSquare = getTrackPosition(player.color, move.to);
    if (!safeTrackCells.has(landingSquare)) {
      const opponent = players[opponentUid];
      const opponentPieces = [...(opponent.pieces || [])];
      captured = opponentPieces.flatMap((position, index) =>
        position >= 0 && position < 52 && getTrackPosition(opponent.color, position) === landingSquare ? [index] : []
      );
      if (captured.length) {
        captured.forEach(index => { opponentPieces[index] = -1; });
        players[opponentUid] = { ...opponent, pieces: opponentPieces };
        players[move.uid] = { ...players[move.uid], captures: (player.captures || 0) + captured.length };
      }
    }
  }

  const finished = pieces.every(position => position === 57);
  const extraTurn = room.dice === 6 || captured.length > 0 || move.to === 57;
  const description = captured.length
    ? `${player.name} captured ${captured.length} ${captured.length === 1 ? "coin" : "coins"}! 🎉`
    : move.to === 57 ? `${player.name} brought a coin home! 🏠` : `${player.name} moved a coin.`;
  return {
    ...room,
    players,
    activeMove: null,
    lastMove: {
      id: move.id,
      uid: move.uid,
      pieceIndex: move.pieceIndex,
      from: move.from,
      to: move.to,
      captured: captured.map(pieceIndex => ({ uid: opponentUid, pieceIndex })),
      message: description
    },
    history: appendHistory(room, { text: description }),
    status: finished ? "finished" : "playing",
    winnerUid: finished ? move.uid : "",
    turnUid: finished ? "" : extraTurn ? move.uid : opponentUid,
    phase: "roll",
    dice: null,
    updatedAt: Date.now()
  };
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
    const tokens = tokensAt.get(key) || [];
    const classes = ["ludo-cell", tokens.length ? "has-token" : ""].filter(Boolean).join(" ");
    const tokenMarkup = tokens.map(token => {
      const canMove = token.uid === uid && selected.has(token.pieceIndex) && room.turnUid === uid && room.phase === "move";
      const color = colorInfo[token.player.color]?.css || "red";
      const animation = room.lastMove?.uid === token.uid && room.lastMove?.pieceIndex === token.pieceIndex && room.lastMove?.to === token.progress
        ? " ludo-token-arrive" : room.lastMove?.captured?.some(capture => capture.uid === token.uid && capture.pieceIndex === token.pieceIndex) && token.progress === -1 ? " ludo-token-captured" : "";
      const mark = avatar(token.uid, token.player.name, token.player.color);
      const title = `${playerName(room, token.uid)} · piece ${token.pieceIndex + 1}`;
      const yardToken = token.progress === -1 ? " yard-token" : "";
      return canMove
        ? `<button type="button" class="ludo-token ${color}${yardToken}${animation}" data-ludo-piece="${token.pieceIndex}" aria-label="Move ${esc(title)}">${mark}</button>`
        : `<span class="ludo-token ${color}${yardToken}${animation}" title="${esc(title)}">${mark}</span>`;
    }).join("");
    const isSingleYardToken = tokens.length === 1 && tokens[0].progress === -1;
    return tokens.length ? `<div class="${classes}" style="grid-row:${row + 1};grid-column:${column + 1}" ${position != null ? `data-track-index="${position}"` : ""}><div class="ludo-cell-tokens${tokens.length === 1 ? " single-token" : ""}${isSingleYardToken ? " yard-token-cell" : ""}">${tokenMarkup}</div></div>` : "";
  }).join("");
  return `<div class="ludo-board-frame"><div class="ludo-board" role="grid" aria-label="Live Ludo board">${cells}</div></div>`;
}

function makeRoom(uid, name, color) {
  return {
    matchId: `${Date.now()}-${uid}`,
    game: "ludo",
    status: "waiting",
    playerUids: [uid],
    players: { [uid]: { name, color, ready: false, pieces: [-1, -1, -1, -1], captures: 0, sixStreak: 0 } },
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
  let lastAnimatedRollId = "";
  let finishingMoveId = "";
  let lastAutoMoveKey = "";
  let autoMoveTimer = null;
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
      statusEl.innerHTML = `<div class="game-panel game-room-panel ludo-status"><p class="tic-tac-toe-status">${summary}</p>${playerCards}<button type="button" class="primary" data-ludo-start>${room ? "Play again" : "Start a private match"}</button></div>`;
      content.innerHTML = `<article class="game-panel ludo-panel"><div class="ludo-intro-icon" aria-hidden="true">🎲</div><p class="ludo-overline">OUR LITTLE GAMES · 2 PLAYERS</p><h2>${room?.status === "finished" ? "A sweet match together" : "Choose your color"}</h2><p class="games-instructions">Roll a six to bring a coin out, race around the board, capture coins on unsafe squares, and reach home with an exact roll. A six earns another turn.</p>${room?.status === "finished" ? `<h3 class="ludo-final-score">${esc(playerName(room, room.winnerUid))} wins · ${room.playerUids.map(uid => `${esc(playerName(room, uid))}: ${room.players[uid].captures || 0} captures`).join(" · ")}</h3>` : colorPicker}</article>`;
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
    const turnName = room.turnUid ? playerName(room, room.turnUid) : "";
    const lastMove = room.lastMove;
    const message = room.phase === "moving"
      ? isTurn ? "Your coin is moving one square at a time…" : `${turnName}'s coin is moving…`
      : room.phase === "move"
      ? isTurn ? available.length === 1 ? `You rolled ${room.dice}. Your only movable coin will move automatically.` : `You rolled ${room.dice}. Tap a glowing coin to move.` : `${turnName} rolled ${room.dice} and is choosing a coin…`
      : isTurn ? "Your turn — roll the dice!" : `${turnName} is rolling…`;
    const diceValue = room.dice || room.lastRoll?.value;
    const dice = diceValue ? diceFaces[diceValue - 1] : "🎲";
    const animateRoll = Boolean(room.lastRoll?.id && room.lastRoll.id !== lastAnimatedRollId);
    if (animateRoll) lastAnimatedRollId = room.lastRoll.id;
    const statusPlayers = `<div class="ludo-players-row">${room.playerUids.map(uid => playerCard(room, uid, room.turnUid === uid)).join("")}</div>`;
    const diceAction = isTurn && room.phase === "roll"
      ? `<button type="button" class="ludo-roll-button" data-ludo-roll aria-label="Roll dice"><span class="ludo-die-face">${dice}</span><span>Roll dice</span></button>`
      : `<div class="ludo-dice-display ${diceValue ? "rolled" : ""}" aria-label="Dice showing ${diceValue || "waiting"}"><span class="ludo-die-face">${dice}</span></div>`;
    const rulesNote = `<p class="ludo-lock-note unlocked"><span>🏁</span> Roll a 6 to start a coin. Complete the lap, then roll the exact number to reach home.</p>`;
    const lastMoveMessage = lastMove
      ? `<p class="ludo-last-move ${lastMove.captured?.length ? "captured" : ""}" aria-live="polite">${esc(lastMove.message || "A coin moved.")}</p>`
      : "";
    statusEl.innerHTML = `<div class="game-panel game-room-panel ludo-status"><p class="tic-tac-toe-status">${esc(message)}</p>${statusPlayers}<button type="button" class="secondary ludo-end-button" data-ludo-end>End match</button></div>`;
    content.innerHTML = `<div class="ludo-game-layout"><div class="ludo-main-column">${renderBoard(room, user.uid, available)}<div class="ludo-controls"><div class="ludo-turn-tools">${diceAction}<span class="ludo-roll-count">${room.phase === "move" ? `${available.length} coin${available.length === 1 ? "" : "s"} can move` : isTurn ? "Roll to begin your turn" : "Waiting for your turn"}</span></div>${rulesNote}${lastMoveMessage}</div></div></div>`;
    if (room.phase === "moving" && room.activeMove) {
      finishInterruptedMove(room.activeMove.id);
    } else if (room.phase !== "move") {
      clearTimeout(autoMoveTimer);
      autoMoveTimer = null;
    }
    if (room.phase === "move" && isTurn && available.length === 1) {
      const autoMoveKey = `${room.matchId}:${room.lastRoll?.id || room.dice}:${available[0]}`;
      if (autoMoveKey !== lastAutoMoveKey) {
        lastAutoMoveKey = autoMoveKey;
        autoMoveTimer = setTimeout(() => {
          if (room?.phase === "move" && room.turnUid === user.uid && legalPieces(room.players[user.uid], room.dice).length === 1) {
            void movePiece(available[0]);
          }
        }, 250);
      }
    } else if (room.phase === "move") {
      clearTimeout(autoMoveTimer);
      autoMoveTimer = null;
    }
    if (animateRoll) requestAnimationFrame(() => {
      const face = content.querySelector(".ludo-die-face");
      face?.classList.add("rolling");
      setTimeout(() => face?.classList.remove("rolling"), 760);
    });
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
              players: { ...current.players, [user.uid]: { name: profile?.name || getDisplayName(user.uid, "Player 2"), color: available, ready: false, pieces: [-1, -1, -1, -1], captures: 0, sixStreak: 0 } },
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
    try {
      const transaction = await runTransaction(matchRef(), current => {
        if (current?.game !== "ludo" || current.status !== "playing" || current.turnUid !== user.uid || current.phase !== "roll") return;
        const randomWord = new Uint32Array(1);
        crypto.getRandomValues(randomWord);
        const dice = Math.floor(randomWord[0] / 0x100000000 * 6) + 1;
        const player = current.players[user.uid];
        const streak = dice === 6 ? (player.sixStreak || 0) + 1 : 0;
        if (streak >= 3) {
          const nextUid = current.playerUids.find(uid => uid !== user.uid);
          return {
            ...current,
            players: { ...current.players, [user.uid]: { ...player, sixStreak: 0 } },
            turnUid: nextUid,
            dice: null,
            lastRoll: { id: `${Date.now()}-${user.uid}`, uid: user.uid, value: dice },
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
            lastRoll: { id: `${Date.now()}-${user.uid}`, uid: user.uid, value: dice },
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
          lastRoll: { id: `${Date.now()}-${user.uid}`, uid: user.uid, value: dice },
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

  function finishInterruptedMove(moveId) {
    if (!moveId || finishingMoveId === moveId || disposed) return;
    finishingMoveId = moveId;
    void runTransaction(matchRef(), current => {
      const move = current?.activeMove;
      if (current?.game !== "ludo" || current.status !== "playing" || current.phase !== "moving" || move?.id !== moveId) return;
      return completeMoveState(current, move);
    }).catch(error => {
      console.error("Could not finish the pending Ludo move:", error);
      showError("The coin move could not be saved. Please reconnect.");
    }).finally(() => {
      if (finishingMoveId === moveId) finishingMoveId = "";
    });
  }

  async function movePiece(pieceIndex) {
    const moveId = `${Date.now()}-${user.uid}-${pieceIndex}`;
    try {
      const transaction = await runTransaction(matchRef(), current => {
        if (current?.game !== "ludo" || current.status !== "playing" || current.turnUid !== user.uid || current.phase !== "move" ||
            !Number.isInteger(pieceIndex) || pieceIndex < 0 || pieceIndex > 3) return;
        const player = current.players[user.uid];
        const oldPosition = player.pieces[pieceIndex];
        const targetPosition = targetForMove(oldPosition, current.dice);
        if (targetPosition == null) return;
        return completeMoveState(current, { id: moveId, uid: user.uid, pieceIndex, from: oldPosition, to: targetPosition });
      });
      if (!transaction.committed) showError("That coin cannot move with this roll.");
    } catch (error) {
      console.error("Could not move Ludo coin:", error);
      showError("Your coin could not be moved. Please try again.");
    }
  }

  async function endMatch() {
    if (!window.confirm("End this Ludo match for both players?")) return;
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
