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

/* ------------------------------------------------------------------ *
 *  BOARD GEOMETRY
 *  The board is a 15×15 Ludo cross. The outer route has 52 cells.
 * ------------------------------------------------------------------ */
const track = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0]
];
// Standard Ludo safe spaces: the four stars and each colour's entry square.
const safeTrackCells = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
// Centres of the white circles painted on the board artwork (measured from the real board image).
const yardSpots = {
  green: [[1.64, 1.64], [1.64, 3.36], [3.36, 1.64], [3.36, 3.36]],
  yellow: [[1.64, 10.64], [1.64, 12.36], [3.36, 10.64], [3.36, 12.36]],
  red: [[10.64, 1.64], [10.64, 3.36], [12.36, 1.64], [12.36, 3.36]],
  blue: [[10.64, 10.64], [10.64, 12.36], [12.36, 10.64], [12.36, 12.36]]
};
const homeLanes = {
  red: Array.from({ length: 6 }, (_, index) => [13 - index, 7]),
  green: Array.from({ length: 6 }, (_, index) => [7, index + 1]),
  yellow: Array.from({ length: 6 }, (_, index) => [index + 1, 7]),
  blue: Array.from({ length: 6 }, (_, index) => [7, 13 - index])
};

/* ------------------------------------------------------------------ *
 *  GAME ENGINE (pure rules, no DOM)
 *
 *  A coin's progress:  -1  = in the yard
 *                      0‥51 = on the 52-cell route (0 = its start square)
 *                      52‥57 = home lane (57 = home)
 *  The home gate sits after progress 50. A player whose gate is still
 *  LOCKED (no capture yet) cannot turn into the lane: the coin simply keeps
 *  circling the board (50 → 51 → 0 → 1 …) until a capture opens the gate.
 *  Moving one square at a time means a coin always walks box by box.
 * ------------------------------------------------------------------ */
const TRACK_LEN = 52;
const GATE = 50;
const LANE_START = 52;
const FINISH = 57;
const RULES_VERSION = 2;

const trackPos = (color, progress) => (colorInfo[color].start + progress) % TRACK_LEN;
const isGateOpen = player => (player?.captures || 0) > 0;

function stepOnce(progress, gateOpen) {
  if (progress === -1) return 0;
  if (progress === GATE) return gateOpen ? LANE_START : 51;
  if (progress === 51) return 0;
  if (progress >= LANE_START) return progress < FINISH ? progress + 1 : null;
  return progress + 1;
}

// Every square the coin lands on, in order; null if the roll is not allowed.
function movePath(progress, dice, gateOpen) {
  if (!Number.isInteger(dice) || dice < 1 || dice > 6 || !Number.isInteger(progress) || progress < -1 || progress > FINISH) return null;
  if (progress === -1) return dice === 6 ? [0] : null;
  if (progress === FINISH) return null;
  const path = [];
  let current = progress;
  for (let step = 0; step < dice; step += 1) {
    current = stepOnce(current, gateOpen);
    if (current == null) return null; // exact roll needed to reach home
    path.push(current);
  }
  return path;
}

function legalPieces(player, dice) {
  const gateOpen = isGateOpen(player);
  return (player?.pieces || []).flatMap((position, index) => movePath(position, dice, gateOpen) ? [index] : []);
}

// Matches saved by the first version had a stray 51st square before the gate (a coin there jumped
// diagonally into the lane). Move such a coin back onto the gate square so it can enter the lane normally.
function upgradeRoom(room) {
  if (!room || room.v === RULES_VERSION) return room;
  if (!["waiting", "setup", "playing"].includes(room.status)) return room;
  const players = {};
  for (const [uid, player] of Object.entries(room.players || {})) {
    players[uid] = { ...player, pieces: (player.pieces || []).map(position => (position === 51 ? GATE : position)) };
  }
  return { ...room, v: RULES_VERSION, players, activeMove: null, phase: room.phase === "moving" ? "roll" : room.phase };
}

function appendHistory(room, entry) {
  return [...(Array.isArray(room.history) ? room.history : []), { ...entry, at: Date.now() }].slice(-40);
}

function completeMoveState(room, move) {
  const player = room.players?.[move.uid];
  const opponentUid = room.playerUids.find(uid => uid !== move.uid);
  if (!player || !opponentUid || !Number.isInteger(move.pieceIndex) || move.pieceIndex < 0 || move.pieceIndex > 3 ||
      !Number.isInteger(move.to) || move.to < 0 || move.to > FINISH || !Array.isArray(move.path) || !move.path.length) return null;

  const pieces = [...player.pieces];
  pieces[move.pieceIndex] = move.to;
  const players = { ...room.players, [move.uid]: { ...player, pieces } };
  let captured = [];
  if (move.to < LANE_START) {
    const landingSquare = trackPos(player.color, move.to);
    if (!safeTrackCells.has(landingSquare)) {
      const opponent = players[opponentUid];
      const opponentPieces = [...(opponent.pieces || [])];
      captured = opponentPieces.flatMap((position, index) =>
        position >= 0 && position < LANE_START && trackPos(opponent.color, position) === landingSquare ? [index] : []
      );
      if (captured.length) {
        captured.forEach(index => { opponentPieces[index] = -1; });
        players[opponentUid] = { ...opponent, pieces: opponentPieces };
        players[move.uid] = { ...players[move.uid], captures: (player.captures || 0) + captured.length };
      }
    }
  }

  const gateOpened = captured.length > 0 && !isGateOpen(player);
  const homed = move.to === FINISH;
  const finished = pieces.every(position => position === FINISH);
  const extraTurn = room.dice === 6 || captured.length > 0 || homed;
  const description = captured.length
    ? `${player.name} captured ${captured.length === 1 ? "a coin" : `${captured.length} coins`}! 🎉${gateOpened ? " Home gate unlocked 🔓" : ""}`
    : homed ? `${player.name} brought a coin home! 🏠` : `${player.name} moved a coin.`;
  return {
    ...room,
    v: RULES_VERSION,
    players,
    activeMove: null,
    lastMove: {
      id: move.id,
      uid: move.uid,
      pieceIndex: move.pieceIndex,
      from: move.from,
      to: move.to,
      path: move.path,
      dice: room.dice,
      captured: captured.map(pieceIndex => ({ uid: opponentUid, pieceIndex })),
      gateOpened,
      homed,
      capturesAfter: players[move.uid].captures || 0,
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

function makeRoom(uid, name, color) {
  return {
    v: RULES_VERSION,
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

function coordinateFor(color, progress, pieceIndex) {
  if (progress === -1) return yardSpots[color][pieceIndex];
  if (progress >= LANE_START) return homeLanes[color][progress - LANE_START];
  return track[trackPos(color, progress)];
}


/* ------------------------------------------------------------------ *
 *  STYLES  — shipped inside this file so the Ludo board always renders
 *  correctly, whatever version of styles.css is deployed.
 * ------------------------------------------------------------------ */
const LUDO_STYLE_ID = "lv-ludo-styles";
const LUDO_CSS = `.ludo-board.lv-board{touch-action:manipulation;user-select:none;-webkit-user-select:none}
.lv-token.red{--ludo-color:#e64e73}.lv-token.blue{--ludo-color:#3396d5}.lv-token.green{--ludo-color:#4aaf82}.lv-token.yellow{--ludo-color:#e9ac32}
.lv-token-layer,.lv-hints,.lv-gates { position:absolute;inset:0;pointer-events:none; }

/* Coins: one persistent element per coin that glides square by square. */
.lv-token { --x:0;--y:0;--dx:0;--dy:0;--s:1;position:absolute;left:calc(var(--x) * 6.6667%);top:calc(var(--y) * 6.6667%);width:6.6667%;height:6.6667%;
  transform:translate(calc(var(--dx) * 100%),calc(var(--dy) * 100%)) scale(var(--s));
  transition:left .2s linear,top .2s linear,transform .2s ease;will-change:left,top,transform;pointer-events:none; }
.lv-token.returning { transition:left .65s cubic-bezier(.45,.05,.25,1),top .65s cubic-bezier(.45,.05,.25,1),transform .65s ease; }
.lv-token-face { width:100%;height:100%;box-sizing:border-box;border:2px solid #fff;border-radius:50%;background:var(--ludo-color);overflow:hidden;
  box-shadow:0 0 0 1.5px var(--ludo-color),0 2px 5px #38202a55; }
.lv-token .ludo-avatar { width:100%;height:100%;border:0;border-radius:50%; }
.lv-token .ludo-avatar img { display:block;width:100%;height:100%;object-fit:cover;pointer-events:none; }
.lv-token .ludo-avatar-fallback { font-size:clamp(8px,2.2vw,13px); }
.lv-token-face.hop { animation:lv-hop .2s ease-out; }
.lv-token.hit .lv-token-face { animation:lv-hit .6s ease-out; }
.lv-token.movable { pointer-events:auto;cursor:pointer; }
.lv-token.movable::after { content:"";position:absolute;inset:-40%;border-radius:50%; }
.lv-token.movable .lv-token-face { animation:lv-pulse 1s ease-in-out infinite;box-shadow:0 0 0 2px #fff,0 0 0 4px var(--ludo-color),0 0 14px 4px color-mix(in srgb,var(--ludo-color) 55%,transparent); }
.lv-token.movable:focus-visible { outline:none; }
.lv-token.movable:focus-visible .lv-token-face { box-shadow:0 0 0 2px #fff,0 0 0 5px #34242c; }
.lv-token.at-home .lv-token-face { box-shadow:0 0 0 1.5px #f4c24d,0 0 8px 2px #f4c24d99; }
@keyframes lv-pulse { 50% { transform:scale(1.14); } }
@keyframes lv-hop { 0% { transform:translateY(0) scale(1); } 45% { transform:translateY(-38%) scale(1.22); } 100% { transform:translateY(0) scale(1); } }
@keyframes lv-hit { 0% { transform:scale(1); } 25% { transform:scale(1.5) rotate(-18deg); filter:brightness(1.5); } 60% { transform:scale(.7) rotate(18deg); opacity:.6; } 100% { transform:scale(1); opacity:1; } }

/* Landing hints + home gates */
.lv-hint { --x:0;--y:0;position:absolute;left:calc(var(--x) * 6.6667% + .6%);top:calc(var(--y) * 6.6667% + .6%);width:5.4%;height:5.4%;box-sizing:border-box;border:2px dashed var(--ludo-color,#e64e73);border-radius:50%;background:#ffffff88;animation:lv-hint 1s ease-in-out infinite; }
.lv-hint.red { --ludo-color:#e64e73; } .lv-hint.blue { --ludo-color:#3396d5; } .lv-hint.green { --ludo-color:#4aaf82; } .lv-hint.yellow { --ludo-color:#e9ac32; }
@keyframes lv-hint { 50% { transform:scale(1.18);opacity:.55; } }
.lv-gate { --x:0;--y:0;position:absolute;left:calc(var(--x) * 6.6667%);top:calc(var(--y) * 6.6667%);width:6.6667%;height:6.6667%;display:grid;place-items:center;z-index:2; }
.lv-gate span { display:grid;place-items:center;width:78%;height:78%;border-radius:50%;background:#fffffff0;box-shadow:0 1px 4px #38202a40;font-size:clamp(7px,2vw,12px);line-height:1;transition:transform .3s; }
.lv-gate.open span { background:#eefaf2; }
.lv-gate.unlocking span { animation:lv-gate-open 1.2s ease-out; }
@keyframes lv-gate-open { 0% { transform:scale(1) rotate(0); } 20% { transform:scale(1.9) rotate(-25deg); } 45% { transform:scale(1.9) rotate(25deg); } 100% { transform:scale(1) rotate(0); } }

/* Big banners: congratulations, captures, gate */
.lv-banner { --ms:1900ms;position:absolute;left:50%;top:44%;z-index:60;max-width:92%;padding:12px 20px;border-radius:22px;text-align:center;pointer-events:none;opacity:0;
  transform:translate(-50%,-50%) scale(.5);background:linear-gradient(145deg,#fff,#fff1f7);color:#8f315d;box-shadow:0 14px 40px #6e184666,0 0 0 3px #fff; }
.lv-banner h3 { margin:0;font-size:clamp(22px,7.2vw,42px);line-height:1.1;font-weight:900;letter-spacing:-.01em; }
.lv-banner p { margin:5px 0 0;font-size:clamp(12px,3.4vw,17px);font-weight:700;opacity:.85; }
.lv-banner.show { animation:lv-banner var(--ms) cubic-bezier(.2,.9,.3,1.2) both; }
.lv-banner.home { background:linear-gradient(145deg,#fff9df,#ffe28a);color:#7a4a00;box-shadow:0 14px 44px #c98a0066,0 0 0 3px #fff7c2; }
.lv-banner.capture { background:linear-gradient(145deg,#fff4ee,#ffd3c4);color:#a8321c; }
.lv-banner.gate { background:linear-gradient(145deg,#f2fff6,#bdf0cf);color:#1f6b3d; }
@keyframes lv-banner { 0% { opacity:0;transform:translate(-50%,-50%) scale(.4) rotate(-4deg); } 14% { opacity:1;transform:translate(-50%,-50%) scale(1.12) rotate(1.5deg); } 24% { transform:translate(-50%,-50%) scale(1) rotate(0); }
  86% { opacity:1;transform:translate(-50%,-50%) scale(1); } 100% { opacity:0;transform:translate(-50%,-62%) scale(.92); } }

/* Controls and dice */
.lv-controls { display:grid;gap:8px;padding:10px 12px;border:1px solid #f0d6e2;border-radius:17px;background:linear-gradient(145deg,#fff,#fff7fa); }
.lv-turn-tools { display:flex;align-items:center;justify-content:center;gap:16px;margin:2px 0; }
.lv-turn-side { display:grid;gap:8px;justify-items:start; }
.lv-dice-btn { min-width:104px;display:grid;justify-items:center;gap:6px;padding:10px 14px 8px;border:1px solid #edd6e0;border-radius:22px;background:#fff5f9;color:#ac4771;cursor:default;transition:transform .15s,box-shadow .2s; }
.lv-dice-btn:disabled { opacity:1;cursor:default; }
.lv-dice-btn.ready { cursor:pointer;border-color:transparent;background:linear-gradient(145deg,#f06c9e,#c94e7e);color:#fff;box-shadow:0 6px 18px #c94e7e55;animation:lv-ready 1.3s ease-in-out infinite; }
.lv-dice-btn.ready:active { transform:scale(.94); }
.lv-dice-label { font-size:11px;font-weight:800;letter-spacing:.02em; }
@keyframes lv-ready { 50% { transform:scale(1.05);box-shadow:0 8px 24px #c94e7e77; } }
.lv-dice { position:relative;width:54px;height:54px;display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);padding:8px;box-sizing:border-box;border-radius:14px;background:linear-gradient(145deg,#fff,#f1e4ea);box-shadow:inset 0 -3px 0 #e5d0da,0 3px 8px #38202a33; }
.lv-dice i { place-self:center;width:9px;height:9px;border-radius:50%;background:#3a2530;opacity:0;transform:scale(.4);transition:opacity .08s,transform .12s; }
.lv-dice[data-v="0"]::after { content:"🎲";position:absolute;inset:0;display:grid;place-items:center;font-size:28px; }
.lv-dice[data-v="1"] i:nth-child(5),
.lv-dice[data-v="2"] i:nth-child(1),.lv-dice[data-v="2"] i:nth-child(9),
.lv-dice[data-v="3"] i:nth-child(1),.lv-dice[data-v="3"] i:nth-child(5),.lv-dice[data-v="3"] i:nth-child(9),
.lv-dice[data-v="4"] i:nth-child(1),.lv-dice[data-v="4"] i:nth-child(3),.lv-dice[data-v="4"] i:nth-child(7),.lv-dice[data-v="4"] i:nth-child(9),
.lv-dice[data-v="5"] i:nth-child(1),.lv-dice[data-v="5"] i:nth-child(3),.lv-dice[data-v="5"] i:nth-child(5),.lv-dice[data-v="5"] i:nth-child(7),.lv-dice[data-v="5"] i:nth-child(9),
.lv-dice[data-v="6"] i:nth-child(1),.lv-dice[data-v="6"] i:nth-child(3),.lv-dice[data-v="6"] i:nth-child(4),.lv-dice[data-v="6"] i:nth-child(6),.lv-dice[data-v="6"] i:nth-child(7),.lv-dice[data-v="6"] i:nth-child(9) { opacity:1;transform:scale(1); }
.lv-dice-btn.rolling .lv-dice { animation:lv-dice-tumble .5s linear infinite; }
.lv-dice-btn.landed .lv-dice { animation:lv-dice-land .45s cubic-bezier(.2,.9,.3,1.4); }
@keyframes lv-dice-tumble { 0% { transform:rotate(0) translateY(0); } 25% { transform:rotate(90deg) translateY(-9px); } 50% { transform:rotate(180deg) translateY(0); } 75% { transform:rotate(270deg) translateY(-6px); } 100% { transform:rotate(360deg) translateY(0); } }
@keyframes lv-dice-land { 0% { transform:scale(1.35) rotate(-14deg); } 60% { transform:scale(.94) rotate(4deg); } 100% { transform:scale(1) rotate(0); } }
.lv-roll-count { color:#987888;font-size:11px;min-height:1.2em; }
.lv-sound-btn { padding:6px 11px;border:1px solid #efd5e1;border-radius:999px;background:#fff;color:#8b4261;font-size:11px;font-weight:800;cursor:pointer; }
.lv-lock-note,.lv-last-move { display:flex;align-items:center;justify-content:center;gap:7px;margin:0;padding:9px;border-radius:13px;font-size:11px;line-height:1.4;text-align:center; }
.lv-lock-note.locked { background:#fff7ec;color:#8b6941; }
.lv-lock-note.unlocked { background:#eefaf2;color:#43845b; }
.lv-last-move { background:#fff1f6;color:#9b3e69; }
.lv-last-move[hidden] { display:none; }
.lv-gate-chip { flex:none;font-size:14px;filter:grayscale(.3); }
.lv-gate-chip.open { filter:none; }
.ludo-end-button { margin-top:5px; }
.lv-rules { font-size:11px;color:#80596a; }
.lv-rules summary { cursor:pointer;font-weight:800;color:#9e3567; }
.lv-rules ul { margin:8px 0 0;padding-left:18px;display:grid;gap:5px;line-height:1.45; }

/* Victory */
.lv-win-overlay { position:fixed;inset:0;z-index:2000;display:grid;place-items:center;padding:18px;background:#2a101e8a;backdrop-filter:blur(2px);animation:lv-fade .35s ease both; }
.lv-win-card { width:min(420px,100%);padding:26px 22px 20px;border-radius:28px;text-align:center;background:linear-gradient(160deg,#fffdf4,#ffe9f2);box-shadow:0 24px 70px #000000aa,0 0 0 4px #ffffffcc;animation:lv-win-pop .7s cubic-bezier(.2,.9,.3,1.3) both; }
.lv-win-card.lost { background:linear-gradient(160deg,#fff,#f4ecff); }
.lv-win-trophy { font-size:68px;line-height:1;animation:lv-trophy 1.4s ease-in-out infinite; }
.lv-win-card h2 { margin:8px 0 2px;color:#8f315d;font-size:clamp(28px,8vw,40px); }
.lv-win-kn { margin:0;color:#c2417b;font-size:20px;font-weight:800; }
.lv-win-sub { margin:10px 0 16px;color:#8c737d;font-size:12px; }
.lv-win-actions { display:flex;flex-wrap:wrap;justify-content:center;gap:10px; }
@keyframes lv-fade { from { opacity:0; } }
@keyframes lv-win-pop { 0% { opacity:0;transform:scale(.4) rotate(-6deg); } 100% { opacity:1;transform:scale(1) rotate(0); } }
@keyframes lv-trophy { 50% { transform:translateY(-8px) rotate(-6deg) scale(1.08); } }

@media(prefers-reduced-motion:reduce) {
  .lv-token,.lv-token.returning { transition-duration:.01s!important; }
  .lv-token-face,.lv-dice-btn .lv-dice,.lv-dice-btn.ready,.lv-hint,.lv-win-trophy,.lv-gate span { animation:none!important; }
  .lv-banner.show { animation:lv-fade .2s ease both,none; opacity:1;transform:translate(-50%,-50%); }
}
`;
function ensureLudoStyles() {
  let style = document.getElementById(LUDO_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = LUDO_STYLE_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== LUDO_CSS) style.textContent = LUDO_CSS;
}

/* ------------------------------------------------------------------ *
 *  PROFILE / AVATAR HELPERS
 * ------------------------------------------------------------------ */
function profileForUid(uid, fallbackName = "") {
  const configured = Object.values(APP_CONFIG.profiles).find(profile => profile.authUid === uid || profile.id === uid);
  return configured || findProfileForAuthor(uid, fallbackName) || {};
}

function avatar(uid, name, color = "") {
  const profile = profileForUid(uid, name);
  const displayName = getDisplayName(uid, profile.name || name || "Partner");
  const avatarMarkup = profile.avatar
    ? `<img src="${esc(profile.avatar)}" alt="${esc(displayName)}" loading="lazy" draggable="false">`
    : `<span class="ludo-avatar-fallback" aria-hidden="true">${esc(displayName.slice(0, 1))}</span>`;
  return `<span class="ludo-avatar ${colorInfo[color] ? `color-${colorInfo[color].css}` : ""}">${avatarMarkup}</span>`;
}

function currentColorMap(room) {
  return Object.fromEntries((room?.playerUids || []).map(uid => [room.players?.[uid]?.color, uid]));
}

function playerName(room, uid) {
  return getDisplayName(uid, room?.players?.[uid]?.name || "Partner");
}

/* ------------------------------------------------------------------ *
 *  SOUND  — everything is synthesised with the Web Audio API,
 *  so there are no audio files to host or download.
 * ------------------------------------------------------------------ */
const SOUND_KEY = "olw-ludo-sound-off";
const Sound = (() => {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  try { muted = localStorage.getItem(SOUND_KEY) === "1"; } catch { /* storage unavailable */ }

  function ensure() {
    try {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        ctx = new AudioCtx();
        master = ctx.createGain();
        master.gain.value = 0.9;
        const compressor = ctx.createDynamicsCompressor();
        master.connect(compressor);
        compressor.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    } catch { return null; }
  }

  function noise() {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  function tone(freq, { to, type = "sine", at = 0, dur = 0.15, vol = 0.25, attack = 0.004 } = {}) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function hiss({ at = 0, dur = 0.1, vol = 0.2, type = "bandpass", freq = 1500, to, q = 1 } = {}) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime + at;
    const source = ctx.createBufferSource();
    source.buffer = noise();
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t, Math.random() * 0.5);
    source.stop(t + dur + 0.05);
  }

  const scale = [523.25, 587.33, 659.25, 783.99, 880, 987.77];
  const api = {
    unlock() { ensure(); },
    isMuted: () => muted,
    setMuted(value) {
      muted = Boolean(value);
      try { localStorage.setItem(SOUND_KEY, muted ? "1" : "0"); } catch { /* ignore */ }
    },
    // Dice rattling around, slowing down.
    roll() {
      for (let index = 0; index < 11; index += 1) {
        const at = index * 0.052 + index * index * 0.0028;
        hiss({ at, dur: 0.035, vol: 0.2, type: "highpass", freq: 2200 + Math.random() * 2200 });
        tone(170 + Math.random() * 140, { at, dur: 0.05, vol: 0.14, type: "triangle" });
      }
    },
    land(value) {
      tone(150, { to: 62, dur: 0.14, vol: 0.34 });
      hiss({ dur: 0.05, vol: 0.18, freq: 1800 });
      if (value === 6) [880, 1175, 1568].forEach((f, i) => tone(f, { at: 0.08 + i * 0.07, dur: 0.22, vol: 0.12, type: "triangle" }));
    },
    // A soft wooden "tok" for every square the coin walks.
    step(index = 0) {
      tone(scale[index % scale.length] * 0.5, { to: scale[index % scale.length] * 0.32, dur: 0.085, vol: 0.26, type: "triangle" });
      hiss({ dur: 0.025, vol: 0.09, freq: 3200 });
    },
    capture() {
      tone(560, { to: 70, type: "sawtooth", dur: 0.38, vol: 0.16 });
      tone(130, { to: 45, dur: 0.3, vol: 0.4 });
      hiss({ dur: 0.32, vol: 0.28, freq: 1600, to: 180 });
    },
    gate() {
      hiss({ dur: 0.025, vol: 0.3, freq: 4200, type: "highpass" });
      hiss({ at: 0.1, dur: 0.025, vol: 0.3, freq: 3000, type: "highpass" });
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { at: 0.22 + i * 0.09, dur: 0.4, vol: 0.2, type: "triangle" }));
    },
    home() {
      [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => {
        tone(f, { at: i * 0.1, dur: 0.55, vol: 0.22, type: "triangle" });
        tone(f * 2, { at: i * 0.1, dur: 0.4, vol: 0.07 });
      });
      hiss({ at: 0.3, dur: 0.5, vol: 0.05, type: "highpass", freq: 6000 });
    },
    rocket() { tone(420, { to: 1900, dur: 0.55, vol: 0.06 }); },
    cracker() {
      tone(160, { to: 38, dur: 0.22, vol: 0.5 });
      hiss({ dur: 0.2, vol: 0.5, type: "lowpass", freq: 3200, to: 300 });
      for (let index = 0; index < 6; index += 1) {
        hiss({ at: 0.06 + index * 0.045 + Math.random() * 0.03, dur: 0.03, vol: 0.2, type: "highpass", freq: 4200 + Math.random() * 2000 });
      }
    },
    applause(seconds = 2.4) {
      for (let index = 0; index < seconds * 16; index += 1) {
        hiss({ at: Math.random() * seconds, dur: 0.035, vol: 0.12 + Math.random() * 0.1, type: "bandpass", freq: 1400 + Math.random() * 2800, q: 0.7 });
      }
    },
    win() {
      const melody = [[523.25, 0], [523.25, 0.15], [523.25, 0.3], [659.25, 0.5], [783.99, 0.8], [659.25, 1.1], [783.99, 1.3], [1046.5, 1.6]];
      melody.forEach(([f, at]) => {
        tone(f, { at, dur: 0.38, vol: 0.14, type: "square" });
        tone(f / 2, { at, dur: 0.38, vol: 0.14, type: "triangle" });
      });
      api.applause(3);
    }
  };
  return api;
})();

function buzz(pattern) {
  if (Sound.isMuted()) return;
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

/* ------------------------------------------------------------------ *
 *  FX  — confetti and firework "crackers" on a full-screen canvas.
 * ------------------------------------------------------------------ */
const FX = (() => {
  const palette = ["#ff4d8d", "#ffd166", "#06d6a0", "#4cc9f0", "#c77dff", "#ff9f1c", "#ffffff", "#ef476f"];
  const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let canvas = null;
  let ctx2d = null;
  let particles = [];
  let frame = 0;
  let lastTime = 0;
  let width = 0;
  let height = 0;
  let timers = [];
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = list => list[Math.floor(Math.random() * list.length)];

  function resize() {
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx2d.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function ensure() {
    if (canvas) return true;
    canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;z-index:3000";
    ctx2d = canvas.getContext("2d");
    if (!ctx2d) { canvas = null; return false; }
    document.body.appendChild(canvas);
    window.addEventListener("resize", resize);
    resize();
    return true;
  }

  function add(items) {
    if (!ensure()) return;
    particles.push(...items);
    if (!frame) { lastTime = performance.now(); frame = requestAnimationFrame(loop); }
  }

  function loop(now) {
    const dt = Math.min(0.04, (now - lastTime) / 1000);
    lastTime = now;
    ctx2d.clearRect(0, 0, width, height);
    const next = [];
    for (const p of particles) {
      p.age += dt;
      if (p.kind === "rocket") {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.trail.push([p.x, p.y]); if (p.trail.length > 9) p.trail.shift();
        if (p.y <= p.targetY) { burst(p.x, p.y, p.color, p.count); Sound.cracker(); continue; }
        ctx2d.globalAlpha = 1;
        p.trail.forEach(([tx, ty], index) => {
          ctx2d.globalAlpha = (index + 1) / p.trail.length * 0.8;
          ctx2d.fillStyle = "#ffe9a8";
          ctx2d.fillRect(tx - 1.5, ty - 1.5, 3, 3);
        });
        next.push(p);
        continue;
      }
      if (p.age > p.life) continue;
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const fade = Math.max(0, 1 - p.age / p.life);
      if (p.kind === "spark") {
        p.trail.push([p.x, p.y]); if (p.trail.length > 5) p.trail.shift();
        p.trail.forEach(([tx, ty], index) => {
          ctx2d.globalAlpha = fade * (index + 1) / p.trail.length * 0.5;
          ctx2d.fillStyle = p.color;
          ctx2d.beginPath(); ctx2d.arc(tx, ty, p.size * 0.7, 0, 6.3); ctx2d.fill();
        });
        ctx2d.globalAlpha = fade;
        ctx2d.fillStyle = p.color;
        ctx2d.beginPath(); ctx2d.arc(p.x, p.y, p.size, 0, 6.3); ctx2d.fill();
      } else {
        p.rot += p.vr * dt;
        ctx2d.save();
        ctx2d.globalAlpha = Math.min(1, fade * 2);
        ctx2d.translate(p.x, p.y);
        ctx2d.rotate(p.rot);
        ctx2d.scale(1, Math.abs(Math.cos(p.age * p.flip)));
        ctx2d.fillStyle = p.color;
        ctx2d.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
        ctx2d.restore();
      }
      if (p.y < height + 40) next.push(p);
    }
    ctx2d.globalAlpha = 1;
    particles = next;
    if (particles.length || timers.length) frame = requestAnimationFrame(loop);
    else { frame = 0; ctx2d.clearRect(0, 0, width, height); }
  }

  function burst(x, y, color, count = 70) {
    const items = [];
    const second = pick(palette);
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + rand(-0.08, 0.08);
      const speed = rand(90, 330);
      items.push({ kind: "spark", x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 150, drag: 0.985,
        age: 0, life: rand(0.9, 1.7), size: rand(1.6, 3.2), color: index % 3 === 0 ? second : color, trail: [] });
    }
    add(items);
  }

  function confetti(x, y, count = 70, power = 1) {
    if (reduced()) return;
    const items = [];
    for (let index = 0; index < count; index += 1) {
      const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const speed = rand(220, 620) * power;
      items.push({ kind: "paper", x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 780, drag: 0.985,
        age: 0, life: rand(1.6, 2.8), size: rand(7, 13), rot: rand(0, 6.3), vr: rand(-9, 9), flip: rand(4, 11), color: pick(palette) });
    }
    add(items);
  }

  function rainConfetti(count = 60) {
    const items = [];
    for (let index = 0; index < count; index += 1) {
      items.push({ kind: "paper", x: rand(0, width), y: rand(-60, -10), vx: rand(-40, 40), vy: rand(60, 200), gravity: 90, drag: 0.995,
        age: 0, life: rand(2.2, 3.6), size: rand(7, 12), rot: rand(0, 6.3), vr: rand(-6, 6), flip: rand(4, 10), color: pick(palette) });
    }
    add(items);
  }

  function rocket() {
    if (!ensure()) return;
    const x = rand(width * 0.12, width * 0.88);
    Sound.rocket();
    add([{ kind: "rocket", x, y: height + 10, vx: rand(-25, 25), vy: -rand(520, 700), targetY: rand(height * 0.12, height * 0.5),
      color: pick(palette), count: Math.round(rand(55, 95)), trail: [], age: 0 }]);
  }

  function show(ms = 7000) {
    if (reduced()) return;
    ensure();
    const started = performance.now();
    confetti(width * 0.2, height * 0.9, 70, 1.15);
    confetti(width * 0.8, height * 0.9, 70, 1.15);
    rainConfetti(70);
    const launch = () => {
      if (!canvas) return;
      const elapsed = performance.now() - started;
      if (elapsed > ms) { timers = timers.filter(t => t !== handle); return; }
      rocket();
      if (Math.random() > 0.55) setTimeout(rocket, 140);
      if (Math.random() > 0.7) rainConfetti(18);
      handle = setTimeout(launch, rand(260, 520));
      timers = [handle];
    };
    let handle = setTimeout(launch, 150);
    timers = [handle];
    if (!frame) { lastTime = performance.now(); frame = requestAnimationFrame(loop); }
  }

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    particles = [];
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener("resize", resize);
    canvas?.remove();
    canvas = null;
    ctx2d = null;
  }

  return { confetti, burst, show, stop };
})();

/* ------------------------------------------------------------------ *
 *  UI
 * ------------------------------------------------------------------ */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const diceMarkup = value => `<span class="lv-dice" data-v="${value || 0}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>`;
const CELL = 100 / 15;

function stackLayout(count, isYard) {
  if (count === 1) return [{ dx: 0, dy: 0, s: isYard ? 1.08 : 0.92 }];
  if (count === 2) return [{ dx: -0.24, dy: 0, s: 0.62 }, { dx: 0.24, dy: 0, s: 0.62 }];
  if (count === 3) return [{ dx: -0.24, dy: -0.2, s: 0.58 }, { dx: 0.24, dy: -0.2, s: 0.58 }, { dx: 0, dy: 0.25, s: 0.58 }];
  if (count === 4) return [{ dx: -0.24, dy: -0.24, s: 0.56 }, { dx: 0.24, dy: -0.24, s: 0.56 }, { dx: -0.24, dy: 0.24, s: 0.56 }, { dx: 0.24, dy: 0.24, s: 0.56 }];
  return Array.from({ length: count }, (_, index) => ({ dx: ((index % 3) - 1) * 0.3, dy: (Math.floor(index / 3) - 1) * 0.3, s: 0.42 }));
}

// Coins on the same progress are interchangeable, so there is nothing to choose between them.
function distinctChoices(player, indexes) {
  const seen = new Map();
  indexes.forEach(index => { const progress = player.pieces[index]; if (!seen.has(progress)) seen.set(progress, index); });
  return [...seen.values()];
}

export function mountLudoGame(el, user, profile) {
  ensureLudoStyles();
  const statusEl = $("#games-room-status", el);
  const content = $("#games-active-content", el);
  if (!statusEl || !content) return () => {};

  let room = null;
  let disposed = false;
  let selectedColor = "red";
  let stopRoom = null;
  const savedResults = new Set();

  // Live-game state
  let gv = null;
  let seenMatchId = null;
  let seenRollId = "";
  let seenMoveId = "";
  const queue = [];
  let running = false;
  let rollPending = false;
  let movePending = false;
  let autoMoveTimer = null;
  let lastAutoKey = "";
  let celebratedMatch = "";
  let winOverlay = null;

  const showError = message => toast(message);

  /* ---------------- lobby (unchanged flow) ---------------- */
  function renderLobby() {
    const occupied = currentColorMap(room);
    const ownColor = room?.players?.[user.uid]?.color || selectedColor;
    const colorPicker = `<div class="ludo-color-picker">${colorOrder.map(color => {
      const info = colorInfo[color];
      const occupiedByOther = occupied[color] && occupied[color] !== user.uid;
      return `<button type="button" class="ludo-color-option color-${info.css}${ownColor === color ? " selected" : ""}" data-ludo-color="${color}" ${occupiedByOther ? "disabled" : ""}><i></i><span>${info.name}<small>${info.local}</small></span>${ownColor === color ? `<b>✓</b>` : ""}</button>`;
    }).join("")}</div>`;
    const lobbyCard = (uid, isTurn) => {
      const player = room.players[uid];
      const color = colorInfo[player.color];
      const homeCount = player.pieces?.filter(position => position === FINISH).length || 0;
      return `<div class="ludo-player-card ${color?.css || ""}${isTurn ? " active-turn" : ""}">${avatar(uid, player.name, player.color)}<div class="ludo-player-copy"><strong>${esc(playerName(room, uid))}</strong><span>${color ? `${color.emoji} ${color.name}` : "Choosing color"}</span><small>${player.captures || 0} captures</small></div><span class="ludo-home-count" aria-label="${homeCount} of 4 pieces home">🏠 ${homeCount}<small>/ 4</small></span></div>`;
    };
    const playerCards = room
      ? `<div class="ludo-players-row">${room.playerUids.map(uid => lobbyCard(uid, room.turnUid === uid)).join("")}${room.playerUids.length < 2 ? `<div class="ludo-player-card waiting">${avatar("", "Partner")}<div class="ludo-player-copy"><strong>Player 2</strong><span>Waiting to join…</span></div></div>` : ""}</div>`
      : "";
    const rulesText = "Roll a six to bring a coin out. Coins walk square by square — land on your partner's coin (outside ⭐ and start squares) to send it home. Your home gate stays 🔒 locked until you capture at least one coin! A six, a capture or a coin reaching home earns another roll.";

    if (!room || ["finished", "cancelled"].includes(room.status)) {
      const summary = room?.status === "finished"
        ? room.winnerUid === user.uid ? "You brought all four coins home! 🎉" : `${esc(playerName(room, room.winnerUid))} won this round. Play again? ♡`
        : room?.status === "cancelled" ? "This Ludo match ended." : "Choose your color, roll the dice, and bring all four coins home.";
      statusEl.innerHTML = `<div class="game-panel game-room-panel ludo-status"><p class="tic-tac-toe-status">${summary}</p>${playerCards}<button type="button" class="primary" data-ludo-start>${room ? "Play again" : "Start a private match"}</button></div>`;
      content.innerHTML = `<article class="game-panel ludo-panel"><div class="ludo-intro-icon" aria-hidden="true">🎲</div><p class="ludo-overline">OUR LITTLE GAMES · 2 PLAYERS</p><h2>${room?.status === "finished" ? "A sweet match together" : "Choose your color"}</h2><p class="games-instructions">${rulesText}</p>${room?.status === "finished" ? `<h3 class="ludo-final-score">${esc(playerName(room, room.winnerUid))} wins · ${room.playerUids.map(uid => `${esc(playerName(room, uid))}: ${room.players[uid].captures || 0} captures`).join(" · ")}</h3>` : colorPicker}</article>`;
      return;
    }

    if (room.status === "waiting") {
      const creator = room.playerUids[0] === user.uid;
      statusEl.innerHTML = `<div class="game-panel game-room-panel ludo-status"><p class="tic-tac-toe-status">${creator ? "Waiting for your partner to join…" : `${esc(playerName(room, room.playerUids[0]))} invited you to Ludo.`}</p>${playerCards}${creator ? `<button type="button" class="secondary" data-ludo-cancel>Cancel match</button>` : `<button type="button" class="primary" data-ludo-start>Join match</button>`}</div>`;
      content.innerHTML = `<article class="game-panel ludo-panel"><div class="ludo-intro-icon" aria-hidden="true">⚓ 🎲 ♡</div><p class="games-instructions">Your partner will join from their device, then you will each choose a color and mark ready.</p>${creator ? colorPicker : ""}</article>`;
      return;
    }

    // setup
    const player = room.players[user.uid];
    const ready = player?.ready;
    statusEl.innerHTML = `<div class="game-panel game-room-panel ludo-status"><p class="tic-tac-toe-status">${ready ? "Color locked in! Waiting for your partner…" : "Choose a color, then mark ready."}</p>${playerCards}</div>`;
    content.innerHTML = `<article class="game-panel ludo-panel"><p class="ludo-overline">PICK YOUR COIN COLOR</p><h2>Player 1 &amp; Player 2</h2><p class="games-instructions">Each player needs a different color. You can change it until both players are ready.</p>${colorPicker}<button type="button" class="primary ludo-ready-button" data-ludo-ready ${ready ? "disabled" : ""}>${ready ? "Ready ✓" : "Ready to play ♡"}</button></article>`;
  }

  /* ---------------- live game view (built once, then patched) ---------------- */
  function buildGame() {
    teardownGameView();
    const tokens = [];
    const display = {};
    const captures = {};
    room.playerUids.forEach(uid => {
      const player = room.players[uid];
      captures[uid] = player.captures || 0;
      (player.pieces || []).forEach((progress, idx) => {
        const key = `${uid}:${idx}`;
        display[key] = progress;
        tokens.push({ uid, idx, key, color: player.color, n: tokens.length });
      });
    });

    const cards = room.playerUids.map(uid => {
      const player = room.players[uid];
      const info = colorInfo[player.color];
      return `<div class="ludo-player-card ${info?.css || ""}" data-card="${esc(uid)}">${avatar(uid, player.name, player.color)}<div class="ludo-player-copy"><strong>${esc(playerName(room, uid))}${uid === user.uid ? " (you)" : ""}</strong><span>${info ? `${info.emoji} ${info.name}` : ""}</span><small data-captures>0 captures</small></div><span class="lv-gate-chip" data-gate title="Home gate">🔒</span><span class="ludo-home-count" data-home>🏠 0<small>/ 4</small></span></div>`;
    }).join("");
    statusEl.innerHTML = `<div class="game-panel game-room-panel ludo-status"><p class="tic-tac-toe-status" data-ludo-msg aria-live="polite"></p><div class="ludo-players-row">${cards}</div><button type="button" class="secondary ludo-end-button" data-ludo-end>End match</button></div>`;

    const tokenMarkup = tokens.map(token => `<div class="lv-token ${colorInfo[token.color]?.css || "red"}" data-t="${token.n}"><div class="lv-token-face">${avatar(token.uid, room.players[token.uid].name, token.color)}</div></div>`).join("");
    const gateMarkup = room.playerUids.map(uid => {
      const color = room.players[uid].color;
      const [row, column] = homeLanes[color][0];
      return `<div class="lv-gate ${colorInfo[color].css}" data-gate-uid="${esc(uid)}" style="--x:${column};--y:${row}"><span>🔒</span></div>`;
    }).join("");
    content.innerHTML = `<div class="ludo-game-layout"><div class="ludo-main-column">
      <div class="ludo-board-frame"><div class="ludo-board lv-board" role="img" aria-label="Live Ludo board"><div class="lv-gates">${gateMarkup}</div><div class="lv-hints"></div><div class="lv-token-layer">${tokenMarkup}</div><div class="lv-banner" aria-live="assertive"></div></div></div>
      <div class="lv-controls">
        <div class="lv-turn-tools"><button type="button" class="lv-dice-btn" disabled>${diceMarkup(0)}<span class="lv-dice-label">Roll</span></button><div class="lv-turn-side"><span class="lv-roll-count"></span><button type="button" class="lv-sound-btn" data-ludo-sound aria-pressed="false"></button></div></div>
        <p class="lv-lock-note" data-ludo-note></p>
        <p class="lv-last-move" data-ludo-last aria-live="polite"></p>
        <details class="lv-rules"><summary>How to play</summary><ul>
          <li>Roll a <b>6</b> to bring a coin out of the yard. A 6, a capture, or a coin reaching home gives you another roll (three 6s in a row passes the turn).</li>
          <li>Coins walk <b>square by square</b>. Land on your partner's coin to send it back to the yard — except on ⭐ and start squares, which are safe.</li>
          <li><b>🔒 Home gate:</b> you can't enter your home lane until you capture at least one of your partner's coins. Until then your coins keep circling the board. Capture once and the gate opens 🔓.</li>
          <li>You need the <b>exact roll</b> to reach home. Bring all four coins home to win!</li>
        </ul></details>
      </div></div></div>`;

    gv = {
      matchId: room.matchId,
      tokens: tokens.map(token => ({ ...token, el: content.querySelector(`[data-t="${token.n}"]`) })),
      display, captures,
      cards: Object.fromEntries([...statusEl.querySelectorAll("[data-card]")].map(node => [node.dataset.card, node])),
      gates: Object.fromEntries([...content.querySelectorAll("[data-gate-uid]")].map(node => [node.dataset.gateUid, node])),
      msgEl: statusEl.querySelector("[data-ludo-msg]"),
      boardEl: content.querySelector(".ludo-board"),
      hintsEl: content.querySelector(".lv-hints"),
      bannerEl: content.querySelector(".lv-banner"),
      diceBtn: content.querySelector(".lv-dice-btn"),
      diceEl: content.querySelector(".lv-dice"),
      diceLabel: content.querySelector(".lv-dice-label"),
      countEl: content.querySelector(".lv-roll-count"),
      soundBtn: content.querySelector("[data-ludo-sound]"),
      noteEl: content.querySelector("[data-ludo-note]"),
      lastEl: content.querySelector("[data-ludo-last]"),
      diceValue: room.dice || room.lastRoll?.value || 0,
      lastMessage: room.lastMove?.message || "",
      activity: "", focusKey: "", hintKey: "", bannerTimer: null
    };
    gv.tokens.forEach(token => { token.el.style.transition = "none"; });
    layoutTokens();
    void gv.boardEl.offsetWidth;
    gv.tokens.forEach(token => { token.el.style.transition = ""; });
  }

  function teardownGameView() {
    clearTimeout(autoMoveTimer);
    autoMoveTimer = null;
    lastAutoKey = "";
    if (gv?.bannerTimer) clearTimeout(gv.bannerTimer);
    closeWinOverlay();
    FX.stop();
    gv = null;
  }

  function coordinate(token) {
    return coordinateFor(token.color, gv.display[token.key], token.idx);
  }

  function layoutTokens() {
    if (!gv) return;
    const groups = new Map();
    gv.tokens.forEach(token => {
      const [row, column] = coordinate(token);
      const key = `${row},${column}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(token);
    });
    groups.forEach(list => {
      const layout = stackLayout(list.length, gv.display[list[0].key] === -1);
      list.forEach((token, index) => {
        const [row, column] = coordinate(token);
        const spot = layout[index];
        const style = token.el.style;
        style.setProperty("--x", column);
        style.setProperty("--y", row);
        style.setProperty("--dx", spot.dx);
        style.setProperty("--dy", spot.dy);
        style.setProperty("--s", spot.s);
        style.zIndex = token.key === gv.focusKey ? 30 : gv.display[token.key] === -1 ? 6 : 12 + index;
        token.el.classList.toggle("in-yard", gv.display[token.key] === -1);
        token.el.classList.toggle("at-home", gv.display[token.key] === FINISH);
      });
    });
  }

  function setDisplay(key, progress, { hop = false, returning = false } = {}) {
    if (!gv) return;
    gv.display[key] = progress;
    const token = gv.tokens.find(item => item.key === key);
    if (token) {
      token.el.classList.toggle("returning", returning);
      if (hop && !prefersReducedMotion()) {
        const face = token.el.firstElementChild;
        face.classList.remove("hop");
        void face.offsetWidth;
        face.classList.add("hop");
      }
    }
    layoutTokens();
  }

  function syncDisplayFromRoom() {
    if (!gv || !room) return;
    room.playerUids.forEach(uid => {
      gv.captures[uid] = room.players[uid].captures || 0;
      (room.players[uid].pieces || []).forEach((progress, idx) => { gv.display[`${uid}:${idx}`] = progress; });
    });
    gv.tokens.forEach(token => token.el.classList.remove("returning"));
    gv.focusKey = "";
    layoutTokens();
  }

  function showBanner({ kind, title, sub = "", ms = 1900 }) {
    if (!gv) return;
    const banner = gv.bannerEl;
    banner.className = `lv-banner ${kind}`;
    banner.innerHTML = `<h3>${title}</h3>${sub ? `<p>${sub}</p>` : ""}`;
    banner.style.setProperty("--ms", `${ms}ms`);
    void banner.offsetWidth;
    banner.classList.add("show");
    clearTimeout(gv.bannerTimer);
    gv.bannerTimer = setTimeout(() => banner.classList.remove("show"), ms);
  }

  function boardCenter() {
    const rect = gv.boardEl.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height * 0.45];
  }

  function homeCountFor(uid) {
    return gv.tokens.filter(token => token.uid === uid && gv.display[token.key] === FINISH).length;
  }

  /* ---------------- view patching ---------------- */
  function updateView() {
    if (!gv || !room || disposed) return;
    const busy = running || queue.length > 0;
    const playing = room.status === "playing";
    const me = room.players?.[user.uid];
    const isTurn = playing && room.turnUid === user.uid;
    const moveTurn = playing && isTurn && room.phase === "move" && Boolean(me);
    const available = moveTurn && !busy && !movePending ? legalPieces(me, room.dice) : [];
    const choices = available.length ? distinctChoices(me, available) : [];
    const canRoll = playing && isTurn && room.phase === "roll" && !busy && !rollPending;
    const turnName = room.turnUid ? playerName(room, room.turnUid) : "";

    let message;
    if (room.status === "finished") message = `${playerName(room, room.winnerUid)} brought all four coins home! 🏆`;
    else if (gv.activity) message = gv.activity;
    else if (room.phase === "move") message = isTurn
      ? choices.length === 1 ? `You rolled ${room.dice}. Moving your coin…` : `You rolled ${room.dice}. Tap a glowing coin to move.`
      : `${turnName} rolled ${room.dice} and is choosing a coin…`;
    else message = isTurn ? "Your turn — roll the dice! 🎲" : `${turnName} is rolling…`;
    gv.msgEl.textContent = message;

    room.playerUids.forEach(uid => {
      const card = gv.cards[uid];
      if (!card) return;
      card.classList.toggle("active-turn", playing && room.turnUid === uid);
      const count = gv.captures[uid] || 0;
      card.querySelector("[data-captures]").textContent = `${count} ${count === 1 ? "capture" : "captures"}`;
      const open = count > 0;
      const chip = card.querySelector("[data-gate]");
      chip.textContent = open ? "🔓" : "🔒";
      chip.classList.toggle("open", open);
      chip.title = open ? "Home gate open" : "Home gate locked — capture a coin to open it";
      card.querySelector("[data-home]").innerHTML = `🏠 ${homeCountFor(uid)}<small>/ 4</small>`;
      const gate = gv.gates[uid];
      if (gate) {
        gate.classList.toggle("open", open);
        gate.firstElementChild.textContent = open ? "🔓" : "🔒";
      }
    });

    // dice
    gv.diceEl.dataset.v = gv.diceValue || 0;
    gv.diceBtn.disabled = !canRoll;
    gv.diceBtn.classList.toggle("ready", canRoll);
    if (canRoll) gv.diceBtn.setAttribute("data-ludo-roll", ""); else gv.diceBtn.removeAttribute("data-ludo-roll");
    gv.diceBtn.setAttribute("aria-label", canRoll ? "Roll dice" : `Dice showing ${gv.diceValue || "nothing yet"}`);
    gv.diceLabel.textContent = canRoll ? "Tap to roll" : isTurn ? "Roll" : "Dice";
    gv.countEl.textContent = busy ? "…"
      : moveTurn ? `${available.length} coin${available.length === 1 ? "" : "s"} can move`
      : isTurn && playing ? "Roll to begin your turn" : playing ? `Waiting for ${turnName}` : "";

    const muted = Sound.isMuted();
    gv.soundBtn.textContent = muted ? "🔇 Sound off" : "🔊 Sound on";
    gv.soundBtn.setAttribute("aria-pressed", String(!muted));

    // gate note + last message
    const myOpen = (gv.captures[user.uid] || 0) > 0;
    gv.noteEl.className = `lv-lock-note ${myOpen ? "unlocked" : "locked"}`;
    gv.noteEl.innerHTML = myOpen
      ? `<span>🔓</span> Home gate open — bring your coins home with an exact roll.`
      : `<span>🔒</span> Home gate locked — capture one of your partner's coins to open it. Until then your coins keep circling.`;
    gv.lastEl.textContent = gv.lastMessage || "";
    gv.lastEl.hidden = !gv.lastMessage;

    // movable coins + landing hints
    const movable = new Set(available);
    gv.tokens.forEach(token => {
      const can = token.uid === user.uid && movable.has(token.idx);
      token.el.classList.toggle("movable", can);
      if (can) {
        token.el.setAttribute("data-ludo-piece", token.idx);
        token.el.setAttribute("role", "button");
        token.el.setAttribute("tabindex", "0");
        token.el.setAttribute("aria-label", `Move coin ${token.idx + 1}`);
      } else {
        token.el.removeAttribute("data-ludo-piece");
        token.el.removeAttribute("role");
        token.el.removeAttribute("tabindex");
        token.el.removeAttribute("aria-label");
      }
    });
    const hintKey = `${room.matchId}:${room.dice}:${available.join(",")}`;
    if (hintKey !== gv.hintKey) {
      gv.hintKey = hintKey;
      gv.hintsEl.innerHTML = available.map(index => {
        const path = movePath(me.pieces[index], room.dice, isGateOpen(me));
        const [row, column] = coordinateFor(me.color, path.at(-1), index);
        return `<div class="lv-hint ${colorInfo[me.color].css}" style="--x:${column};--y:${row}"></div>`;
      }).join("");
    }

    // when there is nothing to choose between, move automatically
    if (choices.length === 1) {
      const key = `${room.matchId}:${room.lastRoll?.id || room.dice}:${choices[0]}`;
      if (key !== lastAutoKey) {
        lastAutoKey = key;
        clearTimeout(autoMoveTimer);
        autoMoveTimer = setTimeout(() => {
          if (disposed || !room || room.phase !== "move" || room.turnUid !== user.uid || running || queue.length) return;
          void movePiece(choices[0]);
        }, 420);
      }
    }
  }

  /* ---------------- animated events ---------------- */
  const stepDelay = () => (document.hidden ? 0 : prefersReducedMotion() ? 90 : 210);

  async function playRoll(event) {
    if (!gv) return;
    const value = event.roll.value;
    gv.activity = event.roll.uid === user.uid ? "Rolling…" : `${playerName(room, event.roll.uid)} is rolling…`;
    updateView();
    Sound.roll();
    buzz(25);
    gv.diceBtn.classList.add("rolling");
    const frames = document.hidden || prefersReducedMotion() ? 1 : 9;
    for (let frame = 0; frame < frames; frame += 1) {
      gv.diceEl.dataset.v = 1 + Math.floor(Math.random() * 6);
      await sleep(78);
    }
    gv.diceValue = value;
    gv.diceEl.dataset.v = value;
    gv.diceBtn.classList.remove("rolling");
    gv.diceBtn.classList.remove("landed");
    void gv.diceBtn.offsetWidth;
    gv.diceBtn.classList.add("landed");
    Sound.land(value);
    gv.activity = "";
    await sleep(document.hidden ? 0 : value === 6 ? 520 : 300);
  }

  async function playMove(event) {
    if (!gv) return;
    const move = event.move;
    if (!Array.isArray(move.path) || !move.path.length) {
      gv.lastMessage = move.message || "";
      updateView();
      await sleep(document.hidden ? 0 : 650);
      return;
    }
    const key = `${move.uid}:${move.pieceIndex}`;
    const mover = playerName(room, move.uid);
    const own = move.uid === user.uid;
    gv.activity = own ? "Your coin is on the move…" : `${mover}'s coin is moving…`;
    gv.focusKey = key;
    updateView();
    const delay = stepDelay();
    for (let index = 0; index < move.path.length; index += 1) {
      setDisplay(key, move.path[index], { hop: true });
      Sound.step(index);
      if (own) buzz(8);
      await sleep(delay);
      if (disposed || !gv) return;
    }
    gv.focusKey = "";

    const captured = move.captured || [];
    if (captured.length) {
      Sound.capture();
      buzz([40, 30, 80]);
      const victimUid = captured[0].uid;
      showBanner({
        kind: "capture",
        title: own ? "💥 You captured a coin!" : victimUid === user.uid ? `😢 ${esc(mover)} captured your coin!` : `💥 ${esc(mover)} captured a coin!`,
        sub: "Back to the yard it goes",
        ms: 1500
      });
      captured.forEach(item => {
        const victim = gv.tokens.find(token => token.uid === item.uid && token.idx === item.pieceIndex);
        victim?.el.classList.add("hit");
        setDisplay(`${item.uid}:${item.pieceIndex}`, -1, { returning: true });
      });
      await sleep(document.hidden ? 0 : 750);
      gv.tokens.forEach(token => token.el.classList.remove("hit", "returning"));
    }
    gv.captures[move.uid] = move.capturesAfter ?? gv.captures[move.uid];
    updateView();

    if (move.gateOpened) {
      Sound.gate();
      buzz([30, 60, 30]);
      showBanner({
        kind: "gate",
        title: own ? "🔓 Your home gate is open!" : `🔓 ${esc(mover)}'s home gate is open!`,
        sub: own ? "Now you can take your coins home" : "They can take their coins home now",
        ms: 1900
      });
      gv.gates[move.uid]?.classList.add("unlocking");
      await sleep(document.hidden ? 0 : 1300);
      gv.gates[move.uid]?.classList.remove("unlocking");
    }

    if (move.homed) {
      const homeNow = homeCountFor(move.uid);
      const last = event.status === "finished";
      Sound.home();
      buzz([60, 40, 60, 40, 120]);
      const [cx, cy] = boardCenter();
      FX.confetti(cx, cy, last ? 40 : 90, 0.9);
      showBanner({
        kind: "home",
        title: own ? "🎉 Congratulations!" : `🎉 ${esc(mover)}'s coin reached home!`,
        sub: own ? `ಅಭಿನಂದನೆಗಳು! Coin ${homeNow} of 4 is home 🏠` : `${homeNow} of 4 coins are home 🏠`,
        ms: last ? 1500 : 2300
      });
      await sleep(document.hidden ? 0 : last ? 1500 : 2200);
    }

    gv.lastMessage = move.message || gv.lastMessage;
    gv.activity = "";
  }

  async function playEvent(event) {
    if (event.type === "roll") await playRoll(event);
    else if (event.type === "move") await playMove(event);
  }

  async function pump() {
    if (running || disposed) return;
    running = true;
    try {
      while (queue.length && !disposed) {
        const event = queue.shift();
        try { await playEvent(event); } catch (error) { console.error("Ludo animation failed:", error); }
      }
    } finally {
      running = false;
    }
    if (!disposed) settle();
  }

  function settle() {
    if (!gv || !room) return;
    gv.activity = "";
    syncDisplayFromRoom();
    gv.diceValue = room.dice || room.lastRoll?.value || gv.diceValue;
    updateView();
    if (room.status === "finished" && celebratedMatch !== room.matchId) celebrate();
  }

  function ingest(value) {
    room = upgradeRoom(value);
    if (!room) { seenMatchId = null; seenRollId = ""; seenMoveId = ""; queue.length = 0; return; }
    if (room.matchId !== seenMatchId) {
      seenMatchId = room.matchId;
      seenRollId = room.lastRoll?.id || "";
      seenMoveId = room.lastMove?.id || "";
      queue.length = 0;
      return;
    }
    if (room.lastRoll?.id && room.lastRoll.id !== seenRollId) {
      seenRollId = room.lastRoll.id;
      queue.push({ type: "roll", roll: room.lastRoll });
    }
    if (room.lastMove?.id && room.lastMove.id !== seenMoveId) {
      seenMoveId = room.lastMove.id;
      queue.push({ type: "move", move: room.lastMove, status: room.status });
    }
  }

  /* ---------------- victory ---------------- */
  function closeWinOverlay() {
    winOverlay?.remove();
    winOverlay = null;
  }

  function celebrate() {
    if (!gv || !room || celebratedMatch === room.matchId) return;
    celebratedMatch = room.matchId;
    const won = room.winnerUid === user.uid;
    const winner = esc(playerName(room, room.winnerUid));
    Sound.win();
    buzz([120, 60, 120, 60, 240]);
    FX.show(7500);
    winOverlay = document.createElement("div");
    winOverlay.className = "lv-win-overlay";
    winOverlay.innerHTML = `<div class="lv-win-card ${won ? "won" : "lost"}" role="dialog" aria-live="assertive" aria-label="Match finished">
      <div class="lv-win-trophy" aria-hidden="true">🏆</div>
      <h2>${won ? "You won!" : `${winner} wins!`}</h2>
      <p class="lv-win-kn">${won ? "ಅಭಿನಂದನೆಗಳು! 🎉" : "ಚೆನ್ನಾಗಿ ಆಡಿದ್ರಿ! 💖"}</p>
      <p class="lv-win-sub">${room.playerUids.map(uid => `${esc(playerName(room, uid))}: ${room.players[uid].captures || 0} captures`).join(" · ")}</p>
      <div class="lv-win-actions"><button type="button" class="primary" data-ludo-start>Play again ♡</button><button type="button" class="secondary" data-ludo-closewin>See result</button></div>
    </div>`;
    el.appendChild(winOverlay);
    winOverlay.querySelector("[data-ludo-start]")?.focus({ preventScroll: true });
  }

  /* ---------------- results ---------------- */
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
    const playing = room?.status === "playing";
    const holding = Boolean(gv && room && gv.matchId === room.matchId && room.status === "finished" && (running || queue.length || winOverlay));
    if (playing || holding) {
      if (!gv || gv.matchId !== room.matchId) buildGame();
      updateView();
      return;
    }
    if (gv) teardownGameView();
    renderLobby();
  }

  /* ---------------- actions (Realtime Database transactions) ---------------- */
  async function startOrJoin() {
    try {
      const color = colorInfo[selectedColor] ? selectedColor : "red";
      const transaction = await runTransaction(matchRef(), stored => {
        const current = upgradeRoom(stored);
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
      const transaction = await runTransaction(matchRef(), stored => {
        const current = upgradeRoom(stored);
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
      const transaction = await runTransaction(matchRef(), stored => {
        const current = upgradeRoom(stored);
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
    if (rollPending) return;
    rollPending = true;
    updateView();
    try {
      const transaction = await runTransaction(matchRef(), stored => {
        const current = upgradeRoom(stored);
        if (current?.game !== "ludo" || current.status !== "playing" || current.turnUid !== user.uid || current.phase !== "roll") return;
        const randomWord = new Uint32Array(1);
        crypto.getRandomValues(randomWord);
        const dice = Math.floor(randomWord[0] / 0x100000000 * 6) + 1;
        const player = current.players[user.uid];
        const streak = dice === 6 ? (player.sixStreak || 0) + 1 : 0;
        const nextUid = current.playerUids.find(uid => uid !== user.uid);
        const rollId = `${Date.now()}-${user.uid}`;
        if (streak >= 3) {
          return {
            ...current,
            players: { ...current.players, [user.uid]: { ...player, sixStreak: 0 } },
            turnUid: nextUid,
            dice: null,
            lastRoll: { id: rollId, uid: user.uid, value: dice },
            phase: "roll",
            lastMove: { id: `${rollId}-info`, uid: user.uid, message: `${player.name} rolled three sixes. Turn passes to the other player.` },
            history: appendHistory(current, { text: `${player.name} rolled three sixes — turn passed.` }),
            updatedAt: Date.now()
          };
        }
        const movable = legalPieces(player, dice);
        if (!movable.length) {
          return {
            ...current,
            players: { ...current.players, [user.uid]: { ...player, sixStreak: streak } },
            turnUid: dice === 6 ? user.uid : nextUid,
            dice: null,
            lastRoll: { id: rollId, uid: user.uid, value: dice },
            phase: "roll",
            lastMove: { id: `${rollId}-info`, uid: user.uid, message: `${player.name} rolled ${dice}; no coin can move${dice === 6 ? ", roll again" : "."}` },
            history: appendHistory(current, { text: `${player.name} rolled ${dice}; no legal move.` }),
            updatedAt: Date.now()
          };
        }
        return {
          ...current,
          players: { ...current.players, [user.uid]: { ...player, sixStreak: streak } },
          dice,
          lastRoll: { id: rollId, uid: user.uid, value: dice },
          phase: "move",
          updatedAt: Date.now()
        };
      });
      if (!transaction.committed) showError("It is not your turn to roll.");
    } catch (error) {
      console.error("Could not roll Ludo dice:", error);
      showError("The dice could not be rolled. Please try again.");
    } finally {
      rollPending = false;
      if (!disposed) updateView();
    }
  }

  async function movePiece(pieceIndex) {
    if (movePending) return;
    movePending = true;
    const moveId = `${Date.now()}-${user.uid}-${pieceIndex}`;
    try {
      const transaction = await runTransaction(matchRef(), stored => {
        const current = upgradeRoom(stored);
        if (current?.game !== "ludo" || current.status !== "playing" || current.turnUid !== user.uid || current.phase !== "move" ||
            !Number.isInteger(pieceIndex) || pieceIndex < 0 || pieceIndex > 3) return;
        const player = current.players[user.uid];
        const from = player.pieces[pieceIndex];
        const path = movePath(from, current.dice, isGateOpen(player));
        if (!path) return;
        return completeMoveState(current, { id: moveId, uid: user.uid, pieceIndex, from, to: path[path.length - 1], path });
      });
      if (!transaction.committed) showError("That coin cannot move with this roll.");
    } catch (error) {
      console.error("Could not move Ludo coin:", error);
      showError("Your coin could not be moved. Please try again.");
    } finally {
      movePending = false;
      if (!disposed) updateView();
    }
  }

  async function endMatch() {
    if (!window.confirm("End this Ludo match for both players?")) return;
    try {
      const transaction = await runTransaction(matchRef(), stored => {
        const current = upgradeRoom(stored);
        if (!ensurePlayer(current, user.uid) || !["waiting", "setup", "playing"].includes(current.status)) return;
        return { ...current, status: "cancelled", turnUid: "", updatedAt: Date.now() };
      });
      if (!transaction.committed) showError("This match has already ended.");
    } catch (error) {
      console.error("Could not end Ludo match:", error);
      showError("The match could not be ended.");
    }
  }

  /* ---------------- events ---------------- */
  async function onClick(event) {
    Sound.unlock();
    const piece = event.target.closest("[data-ludo-piece]");
    if (piece && el.contains(piece)) { await movePiece(Number(piece.dataset.ludoPiece)); return; }
    const target = event.target.closest("button");
    if (!target || !el.contains(target)) return;
    if (target.hasAttribute("data-ludo-sound")) {
      Sound.setMuted(!Sound.isMuted());
      Sound.step(2);
      updateView();
      return;
    }
    if (target.hasAttribute("data-ludo-closewin")) { closeWinOverlay(); FX.stop(); render(); return; }
    if (target.hasAttribute("data-ludo-start")) {
      const fromOverlay = Boolean(winOverlay && winOverlay.contains(target));
      await startOrJoin();
      if (fromOverlay) { closeWinOverlay(); FX.stop(); render(); }
      return;
    }
    if (target.hasAttribute("data-ludo-color")) { await chooseColor(target.dataset.ludoColor); return; }
    if (target.hasAttribute("data-ludo-ready")) { await readyUp(); return; }
    if (target.hasAttribute("data-ludo-roll")) { await rollDice(); return; }
    if (target.hasAttribute("data-ludo-cancel") || target.hasAttribute("data-ludo-end")) { await endMatch(); }
  }

  function onKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const piece = event.target.closest?.("[data-ludo-piece]");
    if (piece && el.contains(piece)) { event.preventDefault(); void movePiece(Number(piece.dataset.ludoPiece)); }
  }

  const unlockAudio = () => Sound.unlock();
  el.addEventListener("click", onClick);
  el.addEventListener("keydown", onKeydown);
  el.addEventListener("pointerdown", unlockAudio, { passive: true });
  stopRoom = onValue(matchRef(), snapshot => {
    ingest(snapshot.val());
    render();
    if (queue.length) void pump();
  }, error => {
    console.error("Ludo match could not be loaded:", error);
    statusEl.innerHTML = `<p class="error">The live Ludo match could not be loaded. Please reconnect.</p>`;
  });
  render();

  return () => {
    disposed = true;
    stopRoom?.();
    stopRoom = null;
    queue.length = 0;
    teardownGameView();
    el.removeEventListener("click", onClick);
    el.removeEventListener("keydown", onKeydown);
    el.removeEventListener("pointerdown", unlockAudio);
  };
}
