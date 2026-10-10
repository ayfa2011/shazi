import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDrawingHistory } from "./drawing-history.js";

const history = createDrawingHistory();
const stroke = (id, uid = "self") => ({ id, uid, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] });

assert.equal(history.canUndo, false);
assert.equal(history.canRedo, false);
assert.equal(history.undo(), null);

history.add(stroke("a"));
history.add(stroke("b"));
assert.equal(history.strokes.length, 2);
assert.deepEqual(history.undo(), { type: "remove", stroke: stroke("b"), position: 1 });
assert.deepEqual(history.strokes.map(item => item.id), ["a"]);
assert.equal(history.canRedo, true);
history.redo();
assert.deepEqual(history.strokes.map(item => item.id), ["a", "b"]);

history.clear();
assert.equal(history.strokes.length, 0);
history.undo();
assert.deepEqual(history.strokes.map(item => item.id), ["a", "b"]);

history.add(stroke("c"));
history.undo();
history.add(stroke("d"));
assert.equal(history.canRedo, false);

history.applyRemoteUndo("d");
assert.deepEqual(history.strokes.map(item => item.id), ["a", "b"]);
history.add(stroke("clear-me"));
const clearSnapshot = history.clear();
assert.deepEqual(clearSnapshot.map(item => item.id), ["a", "b", "clear-me"]);
assert.deepEqual(history.undo(), { type: "restore", strokes: history.strokes });
history.applyRemoteClear();
assert.equal(history.strokes.length, 0);

const drawingSource = await readFile(new URL("./drawing.js", import.meta.url), "utf8");
assert.match(drawingSource, /navigator\.onLine/);
assert.match(drawingSource, /beforeunload/);
assert.match(drawingSource, /aria-valuetext/);
assert.match(drawingSource, /restoreHistory/);
console.log("Drawing history behavior and offline UI hooks pass.");
