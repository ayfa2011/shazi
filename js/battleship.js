import { APP_CONFIG } from "../config/app-config.js";
import { rtdb } from "./firebase.js";
import { getDisplayName } from "./profile-data.js";
import { esc, toast } from "./utils.js";
import { celebrateWin } from "./celebration.js";
import { get, onValue, ref, remove, runTransaction, set } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

export const BATTLESHIP_FLEET = [
  { id: "carrier", name: "Carrier", emoji: "🚢", length: 2 },
  { id: "battleship", name: "Battleship", emoji: "🛳️", length: 2 },
  { id: "cruiser", name: "Cruiser", emoji: "🚤", length: 2 },
  { id: "submarine", name: "Submarine", emoji: "🤿", length: 1 },
  { id: "destroyer", name: "Destroyer", emoji: "⛴️", length: 1 },
  { id: "patrol-boat", name: "Patrol Boat", emoji: "🛥️", length: 1 },
  { id: "scout", name: "Scout", emoji: "⚓", length: 1 }
];

const BATTLESHIP_FLEET_VERSION = 2;
const BATTLESHIP_TOTAL_CELLS = BATTLESHIP_FLEET.reduce((total, ship) => total + ship.length, 0);
const activeStatuses = ["waiting", "placing", "playing"];
export const battleshipRoomRef = () => ref(rtdb, `couples/${APP_CONFIG.coupleId}/games/battleshipMatches/our-little-world`);
const battleshipBoardRef = (matchId, uid) => ref(rtdb, `couples/${APP_CONFIG.coupleId}/games/battleshipPrivate/${matchId}/${uid}`);

export function normalizeBattleshipShots(shots) {
  if (!shots || typeof shots !== "object") return shots;
  const normalized = {};
  for (const [uid, list] of Object.entries(shots)) {
    const entries = Array.isArray(list) ? list.map((shot, index) => [index, shot]) : Object.entries(list || {});
    normalized[uid] = Object.fromEntries(entries.filter(([, shot]) => shot));
  }
  return normalized;
}

export function isValidBattleshipRoom(room) {
  const players = room.players || {};
  const shots = room.shots || {};
  if (!shots || typeof shots !== "object" || Array.isArray(shots) ||
      (room.processingShot != null && (!room.processingShot || !room.playerUids.includes(room.processingShot.uid) ||
        !Number.isInteger(room.processingShot.index) || room.processingShot.index < 0 || room.processingShot.index >= 100 ||
        typeof room.processingShot.operationId !== "string" || !Number.isFinite(room.processingShot.startedAt))) ||
      room.fleetVersion !== BATTLESHIP_FLEET_VERSION ||
      room.playerUids.some(uid => !Number.isInteger(players[uid]?.score) || players[uid].score < 0 || players[uid].score > BATTLESHIP_TOTAL_CELLS ||
        !Number.isInteger(players[uid]?.shipsRemaining) || players[uid].shipsRemaining < 0 || players[uid].shipsRemaining > BATTLESHIP_FLEET.length ||
        typeof players[uid]?.ready !== "boolean") ||
      Object.entries(shots).some(([uid, playerShots]) => !room.playerUids.includes(uid) || !playerShots || typeof playerShots !== "object" || Array.isArray(playerShots) ||
        Object.entries(playerShots).some(([index, shot]) => !Number.isInteger(Number(index)) || Number(index) < 0 || Number(index) >= 100 ||
          !shot || shot.index !== Number(index) || shot.by !== uid || typeof shot.hit !== "boolean" ||
          typeof shot.sunkShip !== "string" || !Number.isFinite(shot.at)))) return false;
  if (room.status === "waiting") return room.playerUids.length === 1 && !room.turnUid;
  if (room.status === "placing") return room.playerUids.length === 2 && !room.turnUid;
  if (room.status === "playing") return room.playerUids.length === 2 && room.playerUids.includes(room.turnUid) &&
    room.playerUids.every(uid => players[uid]?.ready);
  if (room.status === "finished") return room.playerUids.length === 2 && !room.turnUid &&
    (!room.winnerUid || room.playerUids.includes(room.winnerUid));
  return room.status === "cancelled";
}

export function validateBattleshipFleet(ships) {
  if (!Array.isArray(ships) || ships.length !== BATTLESHIP_FLEET.length) {
    throw new Error("Place all five ships before marking ready.");
  }
  const allCells = new Set();
  const normalized = BATTLESHIP_FLEET.map(spec => {
    const ship = ships.find(item => item?.id === spec.id);
    if (!ship || !Array.isArray(ship.cells) || ship.cells.length !== spec.length ||
        !ship.cells.every(index => Number.isInteger(index) && index >= 0 && index < 100) ||
        new Set(ship.cells).size !== ship.cells.length) {
      throw new Error(`Place the ${spec.name} in a straight line.`);
    }
    const rows = new Set(ship.cells.map(index => Math.floor(index / 10)));
    const columns = new Set(ship.cells.map(index => index % 10));
    const horizontal = rows.size === 1 && ship.cells.every((_, i) => i === 0 || Math.abs(ship.cells[i] % 10 - ship.cells[i - 1] % 10) === 1);
    const vertical = columns.size === 1 && ship.cells.every((_, i) => i === 0 || Math.abs(Math.floor(ship.cells[i] / 10) - Math.floor(ship.cells[i - 1] / 10)) === 1);
    if (!(horizontal || vertical) || ship.cells.some(index => allCells.has(index))) {
      throw new Error("Ships must be straight, in bounds, and cannot overlap.");
    }
    ship.cells.forEach(index => allCells.add(index));
    return { id: spec.id, name: spec.name, cells: [...ship.cells].sort((a, b) => a - b), hits: [] };
  });
  if (new Set(ships.map(ship => ship?.id)).size !== BATTLESHIP_FLEET.length) {
    throw new Error("Each ship can only be placed once.");
  }
  return normalized;
}

/**
 * Mount the Battleship controller inside the host Games shell. The returned
 * controller owns Battleship state and exposes render/click/change/dispose hooks.
 */
export function createBattleshipGame({ el, user, profile, getRoom, isActive, renderCurrentGame, gamePlayerAvatar }) {
  let stopBoard = null;
  let board = null;
  let boardMatchId = "";
  let draftShips = [];
  let orientation = "horizontal";
  let selectedShipId = BATTLESHIP_FLEET[0].id;
  let audioContext = null;
  let soundEnabled = true;
  let lastShotCue = "";
  let partnerAttackCue = "";
  let celebratedMatchId = "";
  let resolvingOp = "";
  let actionPending = false;

  function unlockAudio() {
    if (!soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioContext ||= new AudioContextClass();
      if (audioContext.state === "suspended") void audioContext.resume();
    } catch (error) { console.debug("Battleship audio is unavailable:", error); }
  }

  function playSound(kind) {
    if (!soundEnabled) return;
    unlockAudio();
    const context = audioContext;
    if (!context || context.state !== "running") return;
    const patterns = {
      place: [[440, 0, .08], [660, .09, .12]], launch: [[190, 0, .12], [115, .08, .18]],
      hit: [[620, 0, .1], [880, .09, .13], [1040, .2, .16]], miss: [[330, 0, .12], [245, .12, .2]],
      sink: [[520, 0, .12], [660, .1, .12], [880, .2, .18], [1175, .34, .24]],
      win: [[523, 0, .14], [659, .13, .14], [784, .26, .16], [1047, .4, .34]],
      lose: [[392, 0, .18], [330, .18, .18], [262, .36, .32]], turn: [[740, 0, .09], [988, .1, .12]]
    };
    (patterns[kind] || []).forEach(([frequency, delay, duration]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + delay;
      oscillator.type = kind === "miss" || kind === "lose" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(.13, start + .018);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(start); oscillator.stop(start + duration + .02);
    });
  }

  function renderGrid({ room, own = false, clickable = false, ships = [], shots = {} }) {
    const shipByCell = new Map();
    for (const ship of ships || []) for (const index of ship.cells || []) shipByCell.set(index, ship);
    const cells = Array.from({ length: 100 }, (_, index) => {
      const row = Math.floor(index / 10), column = index % 10;
      const coordinate = `${String.fromCharCode(65 + row)}${column + 1}`;
      const ship = shipByCell.get(index), shot = shots?.[index];
      const isHit = own ? Boolean(ship?.hits?.includes(index) || shot?.hit) : shot?.hit;
      const isMiss = shot && !shot.hit;
      const classes = ["battleship-cell", ship ? "has-ship" : "", isHit ? "is-hit" : "", isMiss ? "is-miss" : ""].filter(Boolean).join(" ");
      const contentText = isHit ? "💥" : isMiss ? "🌊" : ship ? "🚢" : "";
      const action = clickable ? own ? `data-bs-place="${index}"` : `data-bs-fire="${index}"` : "";
      const disabled = !clickable || shot ? " disabled" : "";
      return `<button type="button" class="${classes}" ${action} title="${coordinate}" aria-label="${coordinate}${ship ? `, ${ship.name}` : ""}${isHit ? ", hit" : isMiss ? ", miss" : ""}"${disabled}>${contentText}</button>`;
    }).join("");
    const columnLabels = Array.from({ length: 10 }, (_, column) => `<span>${column + 1}</span>`).join("");
    const rowLabels = Array.from({ length: 10 }, (_, row) => `<span>${String.fromCharCode(65 + row)}</span>`).join("");
    return `<div class="battleship-grid-wrap"><div class="battleship-axis-corner" aria-hidden="true">♡</div><div class="battleship-axis columns" aria-hidden="true">${columnLabels}</div><div class="battleship-axis rows" aria-hidden="true">${rowLabels}</div><div class="battleship-grid" role="grid" aria-label="Battleship ${own ? "fleet" : "target"} grid">${cells}</div></div>`;
  }

  function playerIsInRoom(room, uid) { return Array.isArray(room?.playerUids) && room.playerUids.includes(uid) && room.players?.[uid]; }
  const isPermissionDenied = error => /permission[_ ]denied/i.test(`${error?.code || ""} ${error?.message || ""}`);

  async function resolveShotAgainstBoard(matchId, ownerUid, index) {
    const boardRef = battleshipBoardRef(matchId, ownerUid);
    const savedBoard = (await get(boardRef)).val();
    if (!savedBoard || !Array.isArray(savedBoard.ships) || !savedBoard.ships.every(ship => Array.isArray(ship?.cells))) throw new Error("Your partner's fleet is not ready yet.");
    const ships = savedBoard.ships.map(ship => ({ ...ship, hits: Array.isArray(ship.hits) ? ship.hits : [] }));
    const hitShip = ships.find(ship => ship.cells.includes(index));
    if (!hitShip) return { hit: false, sunk: false, shipName: "" };
    if (!hitShip.hits.includes(index)) hitShip.hits = [...hitShip.hits, index];
    await set(boardRef, { ...savedBoard, ships });
    return { hit: true, sunk: hitShip.hits.length === hitShip.cells.length, shipName: hitShip.name || "" };
  }

  function finalizeShot({ matchId, shooterUid, targetUid, index, operationId, outcome }) {
    return runTransaction(battleshipRoomRef(), room => {
      if (room?.matchId !== matchId || room.status !== "playing" || room.turnUid !== shooterUid || room.processingShot?.operationId !== operationId || room.shots?.[shooterUid]?.[index]) return;
      const players = { ...room.players };
      players[shooterUid] = { ...players[shooterUid], score: players[shooterUid].score + (outcome.hit ? 1 : 0) };
      if (outcome.sunk) players[targetUid] = { ...players[targetUid], shipsRemaining: Math.max(0, players[targetUid].shipsRemaining - 1) };
      const shot = { index, by: shooterUid, hit: outcome.hit, sunkShip: outcome.sunk ? outcome.shipName : "", at: Date.now() };
      const shots = { ...(room.shots || {}), [shooterUid]: { ...(room.shots?.[shooterUid] || {}), [index]: shot } };
      const finished = players[targetUid].shipsRemaining === 0;
      return { ...room, players, shots, processingShot: null, status: finished ? "finished" : "playing", winnerUid: finished ? shooterUid : "", turnUid: finished ? "" : targetUid, updatedAt: Date.now() };
    });
  }

  function releaseReservedShot(matchId, operationId) {
    return runTransaction(battleshipRoomRef(), room => {
      if (room?.matchId !== matchId || room.processingShot?.operationId !== operationId) return;
      return { ...room, processingShot: null, updatedAt: Date.now() };
    }).catch(error => console.warn("Could not release the pending Battleship shot:", error));
  }

  async function resolveIncomingShot(room) {
    const shot = room?.processingShot;
    if (!shot?.needsDefender || shot.uid === user.uid || room.status !== "playing" || room.turnUid !== shot.uid || !playerIsInRoom(room, user.uid) || resolvingOp === shot.operationId) return;
    resolvingOp = shot.operationId;
    try {
      const outcome = await resolveShotAgainstBoard(room.matchId, user.uid, shot.index);
      await finalizeShot({ matchId: room.matchId, shooterUid: shot.uid, targetUid: user.uid, index: shot.index, operationId: shot.operationId, outcome });
    } catch (error) { console.error("Could not answer your partner's Battleship shot:", error); }
    finally { setTimeout(() => { if (resolvingOp === shot.operationId) resolvingOp = ""; }, 4000); }
  }

  function updateActionUi() {
    const status = el.querySelector("#games-room-status");
    if (!status) return;
    status.setAttribute("aria-busy", String(actionPending));
    el.querySelectorAll("#games-room-status button, [data-bs-fire], [data-bs-ready]").forEach(button => { if (actionPending) button.disabled = true; });
    let notice = status.querySelector(".battleship-request-status");
    if (actionPending && !notice) {
      notice = document.createElement("p");
      notice.className = "battleship-request-status";
      notice.setAttribute("role", "status");
      notice.innerHTML = `<span class="battleship-request-spinner" aria-hidden="true"></span>Connecting to the game server… The first request may take a few seconds.`;
      (status.querySelector(".battleship-status") || status).append(notice);
    } else if (!actionPending) notice?.remove();
  }

  async function callAction(payload) {
    if (!rtdb) throw new Error("Firebase Realtime Database is not configured.");
    if (actionPending) throw new Error("A Battleship action is already in progress.");
    actionPending = true;
    updateActionUi();
    try {
      const action = payload?.action;
      if (action === "startOrJoin") {
        const matchRef = battleshipRoomRef();
        const previous = (await get(matchRef)).val();
        const result = await runTransaction(matchRef, current => {
          if (current && activeStatuses.includes(current.status)) {
            if (current.fleetVersion === BATTLESHIP_FLEET_VERSION && current.playerUids.includes(user.uid)) return current;
            if (current.fleetVersion !== BATTLESHIP_FLEET_VERSION) {
              const now = Date.now(), matchId = `${now}-${user.uid}`;
              return { matchId, fleetVersion: BATTLESHIP_FLEET_VERSION, game: "battleship", status: "waiting", playerUids: [user.uid],
                players: { [user.uid]: { name: getDisplayName(user.uid, profile?.name || ""), score: 0, shipsRemaining: BATTLESHIP_FLEET.length, ready: false } },
                turnUid: "", winnerUid: "", shots: {}, createdAt: now, updatedAt: now };
            }
            if (current.status === "waiting" && current.playerUids?.length === 1 && current.playerUids[0] !== user.uid) return {
              ...current, playerUids: [...current.playerUids, user.uid],
              players: { ...current.players, [user.uid]: { name: getDisplayName(user.uid, profile?.name || ""), score: 0, shipsRemaining: BATTLESHIP_FLEET.length, ready: false } },
              status: "placing", updatedAt: Date.now()
            };
            return;
          }
          const now = Date.now(), matchId = `${now}-${user.uid}`;
          return { matchId, fleetVersion: BATTLESHIP_FLEET_VERSION, game: "battleship", status: "waiting", playerUids: [user.uid],
            players: { [user.uid]: { name: getDisplayName(user.uid, profile?.name || ""), score: 0, shipsRemaining: BATTLESHIP_FLEET.length, ready: false } },
            turnUid: "", winnerUid: "", shots: {}, createdAt: now, updatedAt: now };
        });
        if (!result.committed) throw new Error("A Battleship match is already in progress.");
        const nextRoom = result.snapshot.val();
        if (previous?.matchId && previous.matchId !== nextRoom?.matchId && Array.isArray(previous.playerUids)) {
          await Promise.all(previous.playerUids.map(uid => remove(battleshipBoardRef(previous.matchId, uid))));
        }
        return nextRoom;
      }

      const matchId = payload?.matchId;
      if (typeof matchId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(matchId)) throw new Error("The match ID is invalid.");
      if (action === "placeFleet") {
        const ships = validateBattleshipFleet(payload?.ships), boardRef = battleshipBoardRef(matchId, user.uid);
        await set(boardRef, { ships, placedAt: Date.now() });
        const result = await runTransaction(battleshipRoomRef(), room => {
          if (room?.matchId !== matchId || room.status !== "placing" || !playerIsInRoom(room, user.uid) || room.players[user.uid].ready) return;
          const players = { ...room.players, [user.uid]: { ...room.players[user.uid], ready: true } };
          const bothReady = room.playerUids.every(uid => players[uid]?.ready);
          return { ...room, players, status: bothReady ? "playing" : "placing", turnUid: bothReady ? room.playerUids[0] : "", updatedAt: Date.now() };
        });
        if (!result.committed) { await remove(boardRef); throw new Error("Your match changed while saving the fleet. Please try again."); }
        return result.snapshot.val();
      }
      if (action === "fire") {
        const index = payload?.index;
        if (!Number.isInteger(index) || index < 0 || index >= 100) throw new Error("Choose a valid grid square.");
        const operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const matchRef = battleshipRoomRef();
        const reserve = await runTransaction(matchRef, room => {
          if (room?.matchId !== matchId || room.status !== "playing" || room.turnUid !== user.uid || !playerIsInRoom(room, user.uid) || room.shots?.[user.uid]?.[index]) return;
          if (room.processingShot && Date.now() - room.processingShot.startedAt < 60_000) return;
          return { ...room, processingShot: { uid: user.uid, index, operationId, startedAt: Date.now() }, updatedAt: Date.now() };
        });
        if (!reserve.committed) throw new Error("It is not your turn, or the previous shot is still being saved.");
        const roomBeforeShot = reserve.snapshot.val(), targetUid = roomBeforeShot.playerUids.find(uid => uid !== user.uid);
        let outcome;
        try { outcome = await resolveShotAgainstBoard(matchId, targetUid, index); }
        catch (error) {
          if (isPermissionDenied(error)) {
            await runTransaction(matchRef, room => room?.matchId === matchId && room.processingShot?.operationId === operationId
              ? { ...room, processingShot: { ...room.processingShot, needsDefender: true }, updatedAt: Date.now() } : undefined);
            return roomBeforeShot;
          }
          await releaseReservedShot(matchId, operationId); throw error;
        }
        const fireResult = await finalizeShot({ matchId, shooterUid: user.uid, targetUid, index, operationId, outcome });
        if (!fireResult.committed) { await releaseReservedShot(matchId, operationId); throw new Error("The match changed while saving your shot."); }
        return fireResult.snapshot.val();
      }
      if (action === "cancel" || action === "end") {
        const result = await runTransaction(battleshipRoomRef(), room => {
          if (room?.matchId !== matchId || !playerIsInRoom(room, user.uid) || !activeStatuses.includes(room.status)) return;
          if (action === "cancel" && room.playerUids[0] !== user.uid) return;
          if (room.processingShot && Date.now() - room.processingShot.startedAt < 60_000) return;
          return { ...room, status: "cancelled", turnUid: "", updatedAt: Date.now() };
        });
        if (!result.committed) throw new Error("This match can no longer be ended.");
        const roomVal = result.snapshot.val();
        if (roomVal?.playerUids) await Promise.all(roomVal.playerUids.map(uid => remove(battleshipBoardRef(matchId, uid))));
        return roomVal;
      }
      throw new Error("Unknown Battleship action.");
    } finally {
      actionPending = false;
      if (isActive()) renderCurrentGame(); else updateActionUi();
    }
  }

  function placeDraftShip(index) {
    const ship = BATTLESHIP_FLEET.find(item => item.id === selectedShipId);
    if (!ship || draftShips.some(item => item.id === ship.id)) return;
    const row = Math.floor(index / 10), column = index % 10;
    const cells = Array.from({ length: ship.length }, (_, offset) => orientation === "horizontal" ? row * 10 + column + offset : (row + offset) * 10 + column);
    if (cells.some(cell => cell >= 100 || (orientation === "horizontal" && Math.floor(cell / 10) !== row))) { toast("That ship does not fit on the board."); return; }
    if (draftShips.some(placed => placed.cells.some(cell => cells.includes(cell)))) { toast("Ships cannot overlap."); return; }
    draftShips.push({ id: ship.id, name: ship.name, cells });
    playSound("place");
    selectedShipId = BATTLESHIP_FLEET.find(item => !draftShips.some(placed => placed.id === item.id))?.id || "";
    try { localStorage.setItem(`olw-battleship-draft:${getRoom()?.matchId}:${user.uid}`, JSON.stringify(draftShips)); } catch { /* Optional placement recovery. */ }
    renderCurrentGame();
  }

  function partnerAttackOverlay(room, players) {
    const latestShot = Object.values(room?.shots || {}).flatMap(playerShots => Object.values(playerShots || {})).sort((left, right) => right.at - left.at)[0];
    if (!latestShot || latestShot.by === user.uid) return "";
    const cue = `${room.matchId}:${latestShot.by}:${latestShot.index}:${latestShot.at}`;
    if (partnerAttackCue === cue) return "";
    partnerAttackCue = cue;
    const name = esc(getDisplayName(latestShot.by, players[latestShot.by]?.name || "Your partner"));
    return `<div class="battleship-attack-overlay" role="status" aria-live="assertive"><div class="battleship-attack-fire" aria-hidden="true"><span>🔥</span><span>🔥</span><span>🔥</span></div><strong>${name} Attacked Ship</strong></div>`;
  }

  function dismissAttackOverlay(content) {
    const attackOverlay = content.querySelector(".battleship-attack-overlay");
    if (attackOverlay) setTimeout(() => attackOverlay.remove(), 2600);
  }

  function render(room, statusEl, content) {
    if (room?.matchId && room.playerUids?.includes(user.uid) && boardMatchId !== room.matchId) {
      stopBoard?.(); stopBoard = null;
      boardMatchId = room.matchId; lastShotCue = ""; board = null; draftShips = []; selectedShipId = BATTLESHIP_FLEET[0].id;
      try {
        const savedDraft = JSON.parse(localStorage.getItem(`olw-battleship-draft:${room.matchId}:${user.uid}`) || "[]");
        draftShips = Array.isArray(savedDraft) ? savedDraft.filter(ship => BATTLESHIP_FLEET.some(spec => spec.id === ship?.id && Array.isArray(ship.cells) && ship.cells.length === spec.length && ship.cells.every(index => Number.isInteger(index) && index >= 0 && index < 100))) : [];
        selectedShipId = BATTLESHIP_FLEET.find(ship => !draftShips.some(placed => placed.id === ship.id))?.id || "";
      } catch { draftShips = []; }
      stopBoard = onValue(battleshipBoardRef(room.matchId, user.uid), snapshot => {
        board = snapshot.val();
        if (isActive()) renderCurrentGame();
      }, error => { console.error("Your Battleship fleet could not be loaded:", error); toast("Your private fleet could not be loaded. Please reconnect."); });
    }
    if (!room?.matchId || !room.playerUids?.includes(user.uid)) {
      stopBoard?.(); stopBoard = null; boardMatchId = ""; board = null;
    }

    const players = room?.players || {}, playerUids = room?.playerUids || [];
    const opponentUid = playerUids.find(uid => uid !== user.uid);
    const scoreRow = room ? `<div class="battleship-score-row">${playerUids.map(uid => `<div class="battleship-player-card">${gamePlayerAvatar(uid, players[uid]?.name)}<span>${esc(getDisplayName(uid, players[uid]?.name || "Partner"))}</span><strong>${players[uid]?.score || 0}</strong><small>hits</small><em>${players[uid]?.shipsRemaining ?? BATTLESHIP_FLEET.length} ships left</em></div>`).join("")}${playerUids.length < 2 ? `<div class="battleship-player-card waiting">${gamePlayerAvatar("", "Partner")}<span>Waiting for partner</span><strong>—</strong><small>hits</small></div>` : ""}</div>` : "";
    if (!room || room.status === "finished" || room.status === "cancelled") {
      const result = room?.status === "finished" ? room.winnerUid === user.uid ? "You sank the fleet — you win! 🎉" : `${esc(getDisplayName(room.winnerUid, players[room.winnerUid]?.name || "Your partner"))} sank your fleet. Better luck next time! ♡` : room?.status === "cancelled" ? "This Battleship match ended." : "Hide your fleet, take turns, and find all seven ships.";
      statusEl.innerHTML = `<div class="game-panel game-room-panel battleship-status"><p class="tic-tac-toe-status">${result}</p>${scoreRow}<button type="button" class="primary" data-room-start>${room ? "Play again" : "Start a match"}</button></div>`;
      const finalAttackMessage = partnerAttackOverlay(room, players);
      content.innerHTML = `${finalAttackMessage}<article class="game-panel battleship-panel"><div class="battleship-hero" aria-hidden="true">🚢 🛳️ 🚤</div><h2>Ready, captain?</h2><p class="games-instructions">Place your fleet of seven ships on a private 10 × 10 board, then take turns firing at your partner's hidden ships. Each hit earns one point.</p><div class="battleship-fleet-list">${BATTLESHIP_FLEET.map(ship => `<span>${ship.emoji} ${ship.name} · ${ship.length}</span>`).join("")}</div></article>`;
      dismissAttackOverlay(content);
      if (room?.winnerUid && room.matchId !== celebratedMatchId) {
        celebratedMatchId = room.matchId;
        const won = room.winnerUid === user.uid; playSound(won ? "win" : "lose");
        const winnerName = getDisplayName(room.winnerUid, players[room.winnerUid]?.name || "Your partner");
        const details = `${players[user.uid]?.score || 0} hits · ${players[opponentUid]?.score || 0} hits`;
        void celebrateWin({ game: "Battleship", won, draw: !room.winnerUid, winnerName, details, actions: [{ label: "Play again ♡", primary: true, onClick: () => document.querySelector("[data-room-start]")?.click() }] });
      }
      return;
    }
    const isMember = room.playerUids.includes(user.uid);
    if (room.status === "waiting") {
      statusEl.innerHTML = `<div class="game-panel game-room-panel battleship-status"><p class="tic-tac-toe-status">${room.playerUids[0] === user.uid ? "Waiting for your partner to join…" : `${esc(getDisplayName(room.playerUids[0], players[room.playerUids[0]]?.name || "Your partner"))} is waiting. Join the fleet!`}</p>${scoreRow}${room.playerUids[0] === user.uid ? `<button type="button" class="secondary" data-room-cancel>Cancel match</button>` : `<button type="button" class="primary" data-room-start>Join match</button>`}</div>`;
      content.innerHTML = `<article class="game-panel battleship-panel"><div class="battleship-hero" aria-hidden="true">⚓ 🌊 ⚓</div><p class="games-instructions">Once your partner joins, both of you will place ships on your own hidden boards.</p></article>`;
      return;
    }
    if (!isMember) { statusEl.innerHTML = `<div class="game-panel game-room-panel battleship-status"><p class="tic-tac-toe-status">This match is already in progress.</p></div>`; content.replaceChildren(); return; }
    if (room.status === "placing") {
      const ready = players[user.uid]?.ready, nextShip = BATTLESHIP_FLEET.find(ship => !draftShips.some(placed => placed.id === ship.id));
      const draftMap = board?.ships || draftShips;
      statusEl.innerHTML = `<div class="game-panel game-room-panel battleship-status"><p class="tic-tac-toe-status">${ready ? "Fleet ready! Waiting for your partner to finish placing ships…" : "Place your fleet on your private board."}</p>${scoreRow}</div>`;
      if (ready) { content.innerHTML = `<article class="game-panel battleship-panel"><p class="games-instructions">Your ships are hidden and saved. The match begins as soon as your partner marks ready.</p>${renderGrid({ room, own: true, ships: board?.ships || [], shots: room.shots?.[opponentUid] || {} })}</article>`; return; }
      if (!nextShip && selectedShipId) selectedShipId = "";
      content.innerHTML = `<article class="game-panel battleship-panel"><p class="battleship-step">PLACE YOUR FLEET <span>${draftShips.length} / ${BATTLESHIP_FLEET.length}</span></p><p class="games-instructions">Place 3 ships of length 2 and 4 ships of length 1. Choose a ship and orientation, then tap its starting square. Ships cannot overlap.</p><div class="battleship-placement-controls"><select data-bs-ship ${nextShip ? "" : "disabled"}>${BATTLESHIP_FLEET.map(ship => `<option value="${ship.id}" ${ship.id === selectedShipId ? "selected" : ""} ${draftShips.some(item => item.id === ship.id) ? "disabled" : ""}>${ship.emoji} ${ship.name} · ${ship.length}</option>`).join("")}</select><button type="button" class="secondary" data-bs-orientation>${orientation === "horizontal" ? "↔ Horizontal" : "↕ Vertical"}</button></div>${renderGrid({ room, own: true, clickable: Boolean(nextShip), ships: draftMap })}<div class="battleship-placement-actions"><button type="button" class="secondary" data-bs-reset-layout ${draftShips.length ? "" : "disabled"}>Reset ships</button><button type="button" class="secondary" data-bs-sound>${soundEnabled ? "🔊 Sound" : "🔇 Muted"}</button><button type="button" class="primary" data-bs-ready ${draftShips.length === BATTLESHIP_FLEET.length ? "" : "disabled"}>Ready to play ♡</button></div></article>`;
      return;
    }
    const hasTurn = room.turnUid === user.uid;
    void resolveIncomingShot(room);
    const isTurn = hasTurn && !room.processingShot, myShots = room.shots?.[user.uid] || {}, incomingShots = room.shots?.[opponentUid] || {};
    const latestShot = Object.values(room.shots || {}).flatMap(playerShots => Object.values(playerShots || {})).sort((left, right) => right.at - left.at)[0];
    if (latestShot) {
      const cueKey = `${room.matchId}:${latestShot.by}:${latestShot.index}:${latestShot.at}`;
      if (lastShotCue !== cueKey) playSound(latestShot.sunkShip ? "sink" : latestShot.hit ? "hit" : "miss");
      lastShotCue = cueKey;
    }
    const latestCoordinate = latestShot ? `${String.fromCharCode(65 + Math.floor(latestShot.index / 10))}${latestShot.index % 10 + 1}` : "";
    const latestShotMessage = latestShot ? `<p class="battleship-last-shot" aria-live="polite"><strong>${latestShot.by === user.uid ? "Your shot" : "Your partner's shot"} · ${latestCoordinate}</strong><span>${latestShot.hit ? `HIT! 💥${latestShot.sunkShip ? ` ${esc(latestShot.sunkShip)} sunk! 🚢` : ""}` : "MISS 🌊"}</span></p>` : "";
    const partnerAttackMessage = partnerAttackOverlay(room, players);
    statusEl.innerHTML = `<div class="game-panel game-room-panel battleship-status"><p class="tic-tac-toe-status">${isTurn ? "Your turn — choose a target square!" : hasTurn ? (room.processingShot?.needsDefender ? "Waiting for your partner's device to confirm the shot…" : "Saving your shot…") : `${esc(getDisplayName(room.turnUid, players[room.turnUid]?.name || "Your partner"))} is taking aim…`}</p>${scoreRow}<p class="battleship-turn-note">${isTurn ? "Tap a square on the target board to fire." : "Your fleet is hidden. Your turn starts after the shot."}</p></div>`;
    const ownBoard = `<section class="battleship-board-card"><h3>Your fleet <span>PRIVATE</span></h3>${renderGrid({ room, own: true, ships: board?.ships || [], shots: incomingShots })}<p class="battleship-legend"><span>🚢 Ship</span><span>💥 Hit</span><span>🌊 Miss</span></p></section>`;
    const targetBoard = `<section class="battleship-board-card"><h3>${esc(getDisplayName(opponentUid, players[opponentUid]?.name || "Partner"))}'s waters <span>${isTurn ? "YOUR TURN" : "WAITING"}</span></h3>${renderGrid({ room, own: false, clickable: isTurn, shots: myShots })}<p class="battleship-legend"><span>💥 Hit</span><span>🌊 Miss</span><span>☞ Fire</span></p></section>`;
    content.innerHTML = `${partnerAttackMessage}${latestShotMessage}<div class="battleship-boards">${ownBoard}${targetBoard}</div><div class="battleship-actions"><button type="button" class="secondary" data-bs-sound>${soundEnabled ? "🔊 Sound ON" : "🔇 Sound OFF"}</button><button type="button" class="secondary" data-room-end>End match</button></div>`;
    if (partnerAttackMessage) dismissAttackOverlay(content);
  }

  async function handleClick(target, room) {
    if (actionPending) return true;
    const action = async payload => { try { await callAction(payload); } catch (error) { console.error("Battleship action failed:", error); toast(error.message || "The Battleship action could not be completed."); } };
    if (target.hasAttribute("data-room-start")) { unlockAudio(); await action({ action: "startOrJoin" }); return true; }
    if (target.hasAttribute("data-room-cancel") || target.hasAttribute("data-room-end")) { await action({ action: target.hasAttribute("data-room-cancel") ? "cancel" : "end", matchId: room?.matchId }); return true; }
    if (target.hasAttribute("data-bs-sound")) { soundEnabled = !soundEnabled; if (soundEnabled) { unlockAudio(); playSound("turn"); } renderCurrentGame(); return true; }
    if (target.hasAttribute("data-bs-place")) { unlockAudio(); placeDraftShip(Number(target.dataset.bsPlace)); return true; }
    if (target.hasAttribute("data-bs-orientation")) { unlockAudio(); playSound("place"); orientation = orientation === "horizontal" ? "vertical" : "horizontal"; renderCurrentGame(); return true; }
    if (target.hasAttribute("data-bs-reset-layout")) { draftShips = []; selectedShipId = BATTLESHIP_FLEET[0].id; try { localStorage.removeItem(`olw-battleship-draft:${room?.matchId}:${user.uid}`); } catch { /* Optional placement recovery. */ } renderCurrentGame(); return true; }
    if (target.hasAttribute("data-bs-ready")) {
      if (draftShips.length === BATTLESHIP_FLEET.length) { await action({ action: "placeFleet", matchId: room?.matchId, ships: draftShips }); try { localStorage.removeItem(`olw-battleship-draft:${room?.matchId}:${user.uid}`); } catch { /* Fleet is stored in Realtime Database. */ } toast("Your fleet is hidden and ready! ⚓"); }
      return true;
    }
    if (target.hasAttribute("data-bs-fire")) { unlockAudio(); playSound("launch"); target.classList.add("is-firing"); await action({ action: "fire", matchId: room?.matchId, index: Number(target.dataset.bsFire) }); return true; }
    return false;
  }

  function handleChange(target) {
    const selector = target.closest("[data-bs-ship]");
    if (!selector) return false;
    selectedShipId = selector.value;
    return true;
  }

  function reset() { stopBoard?.(); stopBoard = null; board = null; boardMatchId = ""; draftShips = []; orientation = "horizontal"; selectedShipId = BATTLESHIP_FLEET[0].id; lastShotCue = ""; partnerAttackCue = ""; }
  function dispose() { reset(); }
  return { render, handleClick, handleChange, reset, dispose, get actionPending() { return actionPending; }, updateActionUi };
}


