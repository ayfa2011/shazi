/**
 * tools/compact-drawing-log.mjs
 *
 * One-time admin script to compact the Realtime Database strokes log:
 *   couples/our-little-world/drawing/strokes
 *
 * A saved drawing is already exported as an image (Telegram + Firestore
 * drawing message), so the live RTDB log only needs to represent the CURRENT
 * canvas. This script keeps only operations at or after the last `clear`
 * operation and removes everything older.
 *
 * It is intentionally separate from the app and does NOT run automatically.
 *
 * Prerequisites:
 *   npm install firebase-admin   # run once (not a runtime dependency of the app)
 *   A Firebase service account JSON with database access.
 *
 * Usage:
 *   # Dry run (default): prints counts only, does NOT delete anything.
 *   node tools/compact-drawing-log.mjs
 *
 *   # Actually delete (requires the explicit --confirm flag).
 *   node tools/compact-drawing-log.mjs --confirm
 *
 * Options:
 *   --db-url <URL>      RTDB URL (default from firebase/firebase-config.js)
 *   --credential <path> Service account JSON path
 *                       (default: $GOOGLE_APPLICATION_CREDENTIALS)
 *   --backup-dir <dir>  Backup output dir (default ./drawing-strokes-backups)
 *   --batch-size <n>    Delete batch size (default 500)
 *   --dry-run           Print counts only (default when --confirm is absent)
 *   --confirm           Actually perform the deletions
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import admin from "firebase-admin";

const STROKES_PATH = "couples/our-little-world/drawing/strokes";
const DEFAULT_BATCH_SIZE = 500;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--confirm") { args.confirm = true; continue; }
    if (a === "--dry-run") { args.dryRun = true; continue; }
    if (a === "--db-url" && argv[i + 1] !== undefined) { args.dbUrl = argv[++i]; continue; }
    if (a === "--credential" && argv[i + 1] !== undefined) { args.credential = argv[++i]; continue; }
    if (a === "--backup-dir" && argv[i + 1] !== undefined) { args.backupDir = argv[++i]; continue; }
    if (a === "--batch-size" && argv[i + 1] !== undefined) { args.batchSize = Number(argv[++i]); continue; }
    args._.push(a);
  }
  return args;
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const confirm = args.confirm === true;
  const dryRun = !confirm;

  if (!confirm && !args.dryRun) {
    // default mode is dry-run
  }

  // Resolve database URL.
  let dbUrl = args.dbUrl;
  if (!dbUrl) {
    try {
      const configPath = join(process.cwd(), "firebase", "firebase-config.js");
      const configText = readFileSync(configPath, "utf8");
      const match = configText.match(/databaseURL:\s*"([^"]+)"/);
      if (match) dbUrl = match[1];
    } catch { /* ignore */ }
  }
  if (!dbUrl) {
    console.error("Error: could not determine RTDB databaseURL. Pass --db-url.");
    process.exit(1);
  }

  // Resolve service account credential.
  let credential = null;
  const credPath = args.credential || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    try {
      credential = admin.credential.cert(JSON.parse(readFileSync(credPath, "utf8")));
    } catch (err) {
      console.error(`Error: could not load service account from ${credPath}:`, err.message);
      process.exit(1);
    }
  } else {
    console.error("Error: no service account credential provided.");
    console.error("  Pass --credential <service-account.json> or set GOOGLE_APPLICATION_CREDENTIALS.");
    process.exit(1);
  }

  // Initialize the Admin SDK (bypasses RTDB rules).
  try {
    admin.initializeApp({ credential, databaseURL: dbUrl });
  } catch (err) {
    if (err.code === "already-exists") { /* already initialized */ }
    else throw err;
  }

  const db = admin.database();
  const strokesRef = db.ref(STROKES_PATH);

  // 1) Export the current strokes node to a timestamped JSON backup first.
  const backupDir = args.backupDir || join(process.cwd(), "drawing-strokes-backups");
  mkdirSync(backupDir, { recursive: true });
  const snapshot = await strokesRef.once("value");
  const data = snapshot.val() || {};
  const keys = Object.keys(data);
  const backupPayload = {
    exportedAt: new Date().toISOString(),
    path: STROKES_PATH,
    totalOperations: keys.length,
    data
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = join(backupDir, `drawing-strokes-backup-${stamp}.json`);
  writeFileSync(backupFile, JSON.stringify(backupPayload, null, 2));
  const backupBytes = Buffer.byteLength(JSON.stringify(data), "utf8");

  console.log(`Backed up ${keys.length} operations (${formatBytes(backupBytes)}) to ${backupFile}`);

  // 2) Find the last `clear` operation key.
  let lastClearKey = null;
  for (const key of keys) {
    const op = data[key];
    if (op && op.type === "clear") lastClearKey = key; // keys are iterated in sorted order
  }

  if (!lastClearKey) {
    console.log("No `clear` operation found in the log. Nothing to compact.");
    console.log(`Keeping all ${keys.length} operations.`);
    return;
  }

  // RTDB push keys are lexicographically increasing, so keys sorted before
  // lastClearKey are older operations that can be removed.
  const allKeys = keys.slice().sort();
  const keepFromIndex = allKeys.indexOf(lastClearKey);
  const toRemove = allKeys.slice(0, keepFromIndex);
  const toKeep = allKeys.slice(keepFromIndex);

  const totalBytes = backupBytes;
  const removeBytesEstimate = toRemove.length > 0 ? Math.round((toRemove.length / keys.length) * totalBytes) : 0;

  console.log(`Last \`clear\` operation key: ${lastClearKey}`);
  console.log(`Total operations: ${keys.length} (${formatBytes(totalBytes)})`);
  console.log(`Operations to keep (at/after last clear): ${toKeep.length}`);
  console.log(`Operations that WOULD be removed (older than last clear): ${toRemove.length} (~${formatBytes(removeBytesEstimate)})`);

  if (dryRun) {
    console.log("DRY RUN: no deletions performed. Re-run with --confirm to delete.");
    return;
  }

  // 3) Delete older operations in small batches via multi-path update(null).
  let removed = 0;
  const batchSize = Math.max(1, args.batchSize || DEFAULT_BATCH_SIZE);
  for (let i = 0; i < toRemove.length; i += batchSize) {
    const batch = toRemove.slice(i, i + batchSize);
    const updates = {};
    for (const k of batch) updates[k] = null;
    await strokesRef.update(updates);
    removed += batch.length;
    process.stdout.write(`\rRemoved ${removed} / ${toRemove.length} operations...`);
  }
  console.log(`\nDone. Removed ${removed} older operations. Log now contains ${toKeep.length} operation(s) (the last clear and anything after it).`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
