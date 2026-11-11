import path from "node:path";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import cors from "cors";
import { initFirebaseAdmin, getAdminDb } from "./firebaseAdmin.js";
import {
  getTelegramFileUrl,
  downloadTelegramFile,
  deleteTempFile,
  tempFilePath,
  tempFileExists
} from "./telegram.js";

const PORT = Number(process.env.PORT || 8080);
const ORIGIN = process.env.FRONTEND_ORIGIN || "*";

const app = express();
app.use(cors({ origin: ORIGIN }));
app.use(express.json());

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

// In-memory: roomCode -> { ws clients set, movieFileId, tempFilePath }
const roomState = new Map();

// ── Firebase Admin ──
initFirebaseAdmin();
const adminDb = getAdminDb();

// ── Download movie from Telegram to temp SSD (lazy, on first stream request) ──
async function ensureMovieCached(roomCode) {
  const cached = roomState.get(roomCode);
  if (cached?.tempFilePath) return cached.tempFilePath;

  const roomRef = adminDb.collection("couples").doc(process.env.FIREBASE_COUPLE_ID).collection("theaterRooms").doc(roomCode);
  const snap = await roomRef.get();
  if (!snap.exists) throw new Error("Room not found");
  const data = snap.data();
  const fileId = data.telegramFileId;
  if (!fileId) throw new Error("No movie file in room");

  const dest = await downloadTelegramFile(fileId, `${roomCode}.mp4`);
  if (!cached) roomState.set(roomCode, { clients: new Set(), movieFileId: fileId, tempFilePath: dest });
  return dest;
}

// ── REST: stream video with range request support ──
app.get("/stream/:roomCode", async (req, res) => {
  const { roomCode } = req.params;
  try {
    const filePath = await ensureMovieCached(roomCode);
    const stat = await import("node:fs/promises").then(m => m.stat(filePath));
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (start >= fileSize) {
        res.status(416).send("Requested range not satisfiable");
        return;
      }
      const chunkSize = end - start + 1;
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "video/mp4"
      };
      res.writeHead(206, head);
      const stream = await import("node:fs").then(m => m.createReadStream(filePath, { start, end }));
      stream.pipe(res);
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes"
      };
      res.writeHead(200, head);
      const stream = await import("node:fs").then(m => m.createReadStream(filePath));
      stream.pipe(res);
    }
  } catch (error) {
    console.error("Stream error:", error);
    res.status(error.message === "Room not found" ? 404 : 500).json({ error: error.message });
  }
});

// ── REST: room info (for frontend to get movie name etc.) ──
app.get("/room/:roomCode", async (req, res) => {
  try {
    const roomRef = adminDb.collection("couples").doc(process.env.FIREBASE_COUPLE_ID).collection("theaterRooms").doc(req.params.roomCode);
    const snap = await roomRef.get();
    if (!snap.exists) return res.status(404).json({ error: "Room not found" });
    res.json({ id: snap.id, ...snap.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── WebSocket: playback sync ──
wss.on("connection", (ws, req) => {
  let currentRoomCode = null;

  ws.on("message", raw => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "join") {
        currentRoomCode = msg.roomCode;
        if (!roomState.has(currentRoomCode)) {
          roomState.set(currentRoomCode, { clients: new Set(), movieFileId: null, tempFilePath: null });
        }
        roomState.get(currentRoomCode).clients.add(ws);
        ws.send(JSON.stringify({ type: "joined", roomCode: currentRoomCode }));
        return;
      }

      if (!currentRoomCode) return;

      // Broadcast playback control to all other clients in the room
      const room = roomState.get(currentRoomCode);
      if (!room) return;
      const payload = JSON.stringify({ type: msg.type, ...msg, from: msg.from || "peer" });
      room.clients.forEach(client => {
        if (client !== ws && client.readyState === ws.OPEN) {
          client.send(payload);
        }
      });
    } catch { /* ignore malformed messages */ }
  });

  ws.on("close", () => {
    if (currentRoomCode) {
      const room = roomState.get(currentRoomCode);
      if (room) {
        room.clients.delete(ws);
        if (room.clients.size === 0) {
          // Both clients left: schedule cleanup
          setTimeout(() => {
            const r = roomState.get(currentRoomCode);
            if (r && r.clients.size === 0) {
              if (r.tempFilePath) {
                deleteTempFile(path.basename(r.tempFilePath)).catch(() => {});
              }
              roomState.delete(currentRoomCode);
              adminDb.collection("couples")
                .doc(process.env.FIREBASE_COUPLE_ID)
                .collection("theaterRooms")
                .doc(currentRoomCode)
                .update({ status: "ended", updatedAt: new Date() })
                .catch(() => {});
            }
          }, 60000);
        }
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Theater backend listening on http://0.0.0.0:${PORT}`);
});
