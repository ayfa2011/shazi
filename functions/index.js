import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp({ databaseURL: "https://our-little-world-e9cbb-default-rtdb.firebaseio.com" });

const database = getDatabase();
const roomRef = () => database.ref("battleshipMatches/our-little-world");
const privateBoardRef = (matchId, uid) => database.ref(`battleshipPrivate/${matchId}/${uid}`);
const playerForEmail = {
  "akabeeram@gmail.com": "Keby",
  "hizasgallery@gmail.com": "Shazy"
};
const fleet = [
  { id: "carrier", name: "Carrier", length: 5 },
  { id: "battleship", name: "Battleship", length: 4 },
  { id: "cruiser", name: "Cruiser", length: 3 },
  { id: "submarine", name: "Submarine", length: 3 },
  { id: "destroyer", name: "Destroyer", length: 2 }
];
const activeStatuses = ["waiting", "placing", "playing"];

function authenticatedPlayer(request) {
  const email = String(request.auth?.token?.email || "").toLowerCase();
  const name = playerForEmail[email];
  if (!request.auth?.uid || !name) throw new HttpsError("permission-denied", "Only the two partners can play this match.");
  return { uid: request.auth.uid, name };
}

function requireMatchId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(value)) {
    throw new HttpsError("invalid-argument", "The match ID is invalid.");
  }
  return value;
}

function validateFleet(ships) {
  if (!Array.isArray(ships) || ships.length !== fleet.length) {
    throw new HttpsError("invalid-argument", "Place all five ships before marking ready.");
  }
  const allCells = new Set();
  const normalized = fleet.map(spec => {
    const ship = ships.find(item => item?.id === spec.id);
    if (!ship || !Array.isArray(ship.cells) || ship.cells.length !== spec.length ||
        !ship.cells.every(index => Number.isInteger(index) && index >= 0 && index < 100) ||
        new Set(ship.cells).size !== ship.cells.length) {
      throw new HttpsError("invalid-argument", `Place the ${spec.name} in a straight line.`);
    }
    const rows = new Set(ship.cells.map(index => Math.floor(index / 10)));
    const columns = new Set(ship.cells.map(index => index % 10));
    const horizontal = rows.size === 1 && ship.cells.every((_, i) => i === 0 || Math.abs(ship.cells[i] % 10 - ship.cells[i - 1] % 10) === 1);
    const vertical = columns.size === 1 && ship.cells.every((_, i) => i === 0 || Math.abs(Math.floor(ship.cells[i] / 10) - Math.floor(ship.cells[i - 1] / 10)) === 1);
    const contiguous = horizontal || vertical;
    if (!contiguous || ship.cells.some(index => allCells.has(index))) {
      throw new HttpsError("invalid-argument", "Ships must be straight, in bounds, and cannot overlap.");
    }
    ship.cells.forEach(index => allCells.add(index));
    return { id: spec.id, name: spec.name, cells: [...ship.cells].sort((a, b) => a - b), hits: [] };
  });
  if (new Set(ships.map(ship => ship?.id)).size !== fleet.length) {
    throw new HttpsError("invalid-argument", "Each ship can only be placed once.");
  }
  return normalized;
}

function playerIsInRoom(room, uid) {
  return Array.isArray(room?.playerUids) && room.playerUids.includes(uid) && room.players?.[uid];
}

export const battleshipAction = onCall(async request => {
  const player = authenticatedPlayer(request);
  const action = request.data?.action;

  if (action === "startOrJoin") {
    const matchId = `${Date.now()}-${player.uid}`;
    let resultRoom;
    const result = await roomRef().transaction(current => {
      if (current && activeStatuses.includes(current.status)) {
        if (playerIsInRoom(current, player.uid)) {
          resultRoom = current;
          return current;
        }
        if (current.status === "waiting" && current.playerUids?.length === 1 && current.playerUids[0] !== player.uid) {
          resultRoom = {
            ...current,
            playerUids: [...current.playerUids, player.uid],
            players: { ...current.players, [player.uid]: { name: player.name, score: 0, shipsRemaining: 5, ready: false } },
            status: "placing",
            updatedAt: Date.now()
          };
          return resultRoom;
        }
        return;
      }
      resultRoom = {
        matchId,
        game: "battleship",
        status: "waiting",
        playerUids: [player.uid],
        players: { [player.uid]: { name: player.name, score: 0, shipsRemaining: 5, ready: false } },
        turnUid: "",
        winnerUid: "",
        shots: {},
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      return resultRoom;
    });
    if (!result.committed) throw new HttpsError("failed-precondition", "A Battleship match is already in progress.");
    return result.snapshot.val() || resultRoom;
  }

  const matchId = requireMatchId(request.data?.matchId);
  if (action === "placeFleet") {
    const ships = validateFleet(request.data?.ships);
    const currentSnapshot = await roomRef().get();
    const current = currentSnapshot.val();
    if (current?.matchId !== matchId || current.status !== "placing" || !playerIsInRoom(current, player.uid) || current.players[player.uid].ready) {
      throw new HttpsError("failed-precondition", "This fleet can no longer be placed.");
    }
    await privateBoardRef(matchId, player.uid).set({ ships, placedAt: Date.now() });
    const result = await roomRef().transaction(room => {
      if (room?.matchId !== matchId || room.status !== "placing" || !playerIsInRoom(room, player.uid) || room.players[player.uid].ready) return;
      const players = { ...room.players, [player.uid]: { ...room.players[player.uid], ready: true } };
      const bothReady = room.playerUids.every(uid => players[uid]?.ready);
      return {
        ...room,
        players,
        status: bothReady ? "playing" : "placing",
        turnUid: bothReady ? room.playerUids[0] : "",
        updatedAt: Date.now()
      };
    });
    if (!result.committed) {
      await privateBoardRef(matchId, player.uid).remove();
      throw new HttpsError("failed-precondition", "Your match changed while saving the fleet. Please try again.");
    }
    return result.snapshot.val();
  }

  if (action === "fire") {
    const index = request.data?.index;
    if (!Number.isInteger(index) || index < 0 || index >= 100) throw new HttpsError("invalid-argument", "Choose a valid grid square.");
    const operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const reserve = await roomRef().transaction(room => {
      if (room?.matchId !== matchId || room.status !== "playing" || room.turnUid !== player.uid || !playerIsInRoom(room, player.uid) ||
          room.shots?.[player.uid]?.[index]) return;
      if (room.processingShot && Date.now() - room.processingShot.startedAt < 60_000) return;
      return { ...room, processingShot: { uid: player.uid, index, operationId, startedAt: Date.now() }, updatedAt: Date.now() };
    });
    if (!reserve.committed) throw new HttpsError("failed-precondition", "It is not your turn, or the previous shot is still being saved.");

    const roomBeforeShot = reserve.snapshot.val();
    const targetUid = roomBeforeShot.playerUids.find(uid => uid !== player.uid);
    const targetBoardRef = privateBoardRef(matchId, targetUid);
    try {
      const boardResult = await targetBoardRef.transaction(board => {
        if (!board || !Array.isArray(board.ships) || !board.ships.every(ship => Array.isArray(ship.cells) && Array.isArray(ship.hits))) return;
        const hitShip = board.ships.find(ship => ship.cells.includes(index));
        if (!hitShip || hitShip.hits.includes(index)) return board;
        return {
          ...board,
          ships: board.ships.map(ship => ship.id === hitShip.id ? { ...ship, hits: [...ship.hits, index] } : ship)
        };
      });
      const updatedBoard = boardResult.snapshot.val();
      if (!boardResult.committed || !updatedBoard?.ships) throw new HttpsError("failed-precondition", "Your partner's fleet is not ready yet.");
      const hitShip = updatedBoard.ships.find(ship => ship.cells.includes(index));
      const hit = Boolean(hitShip);
      const sunk = Boolean(hitShip && hitShip.hits.length === hitShip.cells.length);
      const result = await roomRef().transaction(room => {
        if (room?.matchId !== matchId || room.status !== "playing" || room.turnUid !== player.uid ||
            room.processingShot?.operationId !== operationId || room.shots?.[player.uid]?.[index]) return;
        const players = { ...room.players };
        players[player.uid] = { ...players[player.uid], score: players[player.uid].score + (hit ? 1 : 0) };
        if (sunk) players[targetUid] = { ...players[targetUid], shipsRemaining: Math.max(0, players[targetUid].shipsRemaining - 1) };
        const shot = { index, by: player.uid, hit, sunkShip: sunk ? hitShip.name : "", at: Date.now() };
        const shots = { ...(room.shots || {}), [player.uid]: { ...(room.shots?.[player.uid] || {}), [index]: shot } };
        const finished = players[targetUid].shipsRemaining === 0;
        return {
          ...room,
          players,
          shots,
          processingShot: null,
          status: finished ? "finished" : "playing",
          winnerUid: finished ? player.uid : "",
          turnUid: finished ? "" : targetUid,
          updatedAt: Date.now()
        };
      });
      if (!result.committed) throw new HttpsError("failed-precondition", "The match changed while saving your shot.");
      return result.snapshot.val();
    } catch (error) {
      await roomRef().transaction(room => room?.processingShot?.operationId === operationId
        ? { ...room, processingShot: null, updatedAt: Date.now() }
        : undefined);
      throw error;
    }
  }

  if (action === "cancel" || action === "end") {
    const result = await roomRef().transaction(room => {
      if (room?.matchId !== matchId || !playerIsInRoom(room, player.uid) || !activeStatuses.includes(room.status)) return;
      if (action === "cancel" && room.playerUids[0] !== player.uid) return;
      if (room.processingShot && Date.now() - room.processingShot.startedAt < 60_000) return;
      return { ...room, status: "cancelled", turnUid: "", updatedAt: Date.now() };
    });
    if (!result.committed) throw new HttpsError("failed-precondition", "This match can no longer be ended.");
    await Promise.all(result.snapshot.val().playerUids.map(uid => privateBoardRef(matchId, uid).remove()));
    return result.snapshot.val();
  }

  throw new HttpsError("invalid-argument", "Unknown Battleship action.");
});
