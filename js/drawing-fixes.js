export function createOfflineQueue(uid, storage = globalThis.localStorage) {
  const key = `our-little-world-drawing-outbox-${uid}`;
  let items = [];
  const persist = () => {
    try { storage?.setItem(key, JSON.stringify(items)); } catch { /* Continue drawing if storage is unavailable. */ }
  };
  try {
    const saved = JSON.parse(storage?.getItem(key) || "[]");
    if (Array.isArray(saved)) items = saved;
  } catch { items = []; }
  return {
    get length() { return items.length; },
    add(item) {
      if (!items.some(entry => entry.id === item.id)) items.push(item);
      persist();
    },
    getAll() { return items.map(item => ({ ...item })); },
    remove(id) { items = items.filter(item => item.id !== id); persist(); },
    clear() { items = []; persist(); },
    persist
  };
}

export function createDrawingHistory(maxUndo = 30) {
  let strokes = [];
  let undone = [];
  let cleared = null;
  const undoStack = [];
  return {
    get strokes() { return strokes; },
    get canUndo() { return undoStack.length > 0 || Boolean(cleared?.length); },
    get canRedo() { return undone.length > 0; },
    add(stroke) {
      if (strokes.some(item => item.id === stroke.id)) return;
      const redoIndex = undone.findIndex(item => item.id === stroke.id);
      if (redoIndex >= 0) undone.splice(redoIndex, 1);
      strokes.push(stroke);
      undoStack.push(stroke);
      if (undoStack.length > maxUndo) undoStack.shift();
      cleared = null;
      undone = [];
    },
    undo() {
      if (!strokes.length && cleared?.length) {
        strokes = [...cleared];
        cleared = null;
        undone = [];
        undoStack.splice(0, undoStack.length, ...strokes.slice(-maxUndo));
        return { type: "restore", strokes: [...strokes] };
      }
      const stroke = undoStack.pop();
      if (!stroke) return null;
      const index = strokes.findIndex(item => item.id === stroke.id);
      if (index >= 0) strokes.splice(index, 1);
      undone.push(stroke);
      return { type: "undo", stroke };
    },
    redo() {
      const stroke = undone.pop();
      if (!stroke) return null;
      strokes.push(stroke);
      undoStack.push(stroke);
      if (undoStack.length > maxUndo) undoStack.shift();
      cleared = null;
      return stroke;
    },
    clear() {
      if (!strokes.length) return null;
      cleared = [...strokes];
      strokes = [];
      undone = [];
      undoStack.length = 0;
      return [...cleared];
    },
    restoreClearSnapshot() {
      if (!cleared?.length || strokes.length) return null;
      strokes = [...cleared];
      cleared = null;
      undone = [];
      undoStack.splice(0, undoStack.length, ...strokes.slice(-maxUndo));
      return [...strokes];
    },
    get canRestoreClear() { return Boolean(cleared?.length && !strokes.length); },
    setClearedSnapshot(snapshot) { cleared = snapshot ? [...snapshot] : null; },
    applyUndo(id) {
      const removed = strokes.find(stroke => stroke.id === id);
      strokes = strokes.filter(stroke => stroke.id !== id);
      if (removed && !undone.some(stroke => stroke.id === id)) undone.push(removed);
      const index = undoStack.findIndex(stroke => stroke.id === id);
      if (index >= 0) undoStack.splice(index, 1);
    },
    applyRedo(stroke) {
      if (!strokes.some(item => item.id === stroke.id)) strokes.push(stroke);
      if (!undoStack.some(item => item.id === stroke.id)) undoStack.push(stroke);
      undone = undone.filter(item => item.id !== stroke.id);
    },
    replace(next) {
      strokes = [...next];
      undone = [];
      cleared = null;
      undoStack.splice(0, undoStack.length, ...strokes.slice(-maxUndo));
    },
    reset() { strokes = []; undone = []; cleared = null; undoStack.length = 0; }
  };
}

export function operationsSinceKnown(snapshot, knownKeys = new Set()) {
  return Object.entries(snapshot || {})
    .filter(([key]) => !knownKeys.has(key))
    .map(([key, value]) => ({ key, ...value }));
}

/**
 * Simplify a stroke's points so the stored log stays small while the visible
 * result is unchanged.
 *
 * 1) Drop points closer than `minDist` to the last kept point.
 * 2) Ramer-Douglas-Peucker with `rdpTolerance`.
 *
 * Always keeps the first and last point so stroke endpoints are preserved.
 */
export function simplifyPoints(points, minDist = 1.5, rdpTolerance = 0.6) {
  if (!points || points.length === 0) return [];
  // Distance filter: keep first point, drop points too close to the last kept.
  const filtered = [];
  for (const p of points) {
    const last = filtered[filtered.length - 1];
    if (!last) { filtered.push(p); continue; }
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx * dx + dy * dy < minDist * minDist) continue;
    filtered.push(p);
  }
  if (filtered.length <= 2) return filtered;
  return rdp(filtered, rdpTolerance);
}

function perpendicularDistance(pt, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(pt.x - lineStart.x, pt.y - lineStart.y);
  const t = ((pt.x - lineStart.x) * dx + (pt.y - lineStart.y) * dy) / len2;
  const closest = { x: lineStart.x + t * dx, y: lineStart.y + t * dy };
  return Math.hypot(pt.x - closest.x, pt.y - closest.y);
}

function rdp(points, tolerance) {
  if (points.length <= 2) return points.slice();
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > tolerance) {
    const left = rdp(points.slice(0, maxIdx + 1), tolerance);
    const right = rdp(points.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}
