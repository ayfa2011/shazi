import assert from "node:assert/strict";
import {
  roundPoint,
  distanceSquared,
  clientToCanvasPoint,
  coalescedClientPoints,
  filterPointsByMinDist,
} from "./drawing-helpers.js";

const pt = (x, y) => ({ x, y });

// roundPoint
assert.deepEqual(roundPoint(1.23, 4.56), { x: 1.2, y: 4.6 });
assert.deepEqual(roundPoint(1.25, 4.55), { x: 1.3, y: 4.6 }); // Math.round rounds half up

// distanceSquared
assert.equal(distanceSquared(pt(0, 0), pt(3, 4)), 25);
assert.equal(distanceSquared(pt(1, 1), pt(1, 1)), 0);

// clientToCanvasPoint
const rect = { left: 100, top: 100, width: 200, height: 150 };
// client at left+100 (half width) -> 600 (half of 1200)
assert.deepEqual(clientToCanvasPoint(200, 175, rect), { x: 600, y: 450 });

// coalescedClientPoints falls back to single event when getCoalescedEvents absent
const single = { clientX: 10, clientY: 20 };
assert.deepEqual(coalescedClientPoints(single), [{ x: 10, y: 20 }]);

// coalescedClientPoints uses getCoalescedEvents when present
const multi = {
  clientX: 100,
  clientY: 100,
  getCoalescedEvents: () => [
    { clientX: 1, clientY: 1 },
    { clientX: 2, clientY: 2 },
    { clientX: 100, clientY: 100 },
  ],
};
assert.deepEqual(coalescedClientPoints(multi), [
  { x: 1, y: 1 },
  { x: 2, y: 2 },
  { x: 100, y: 100 },
]);

// filterPointsByMinDist: minDistSquared = 2.25 (1.5px)
const last = pt(0, 0);
const res = filterPointsByMinDist([pt(2, 0), pt(3, 0), pt(5, 0)], last, 2.25);
assert.deepEqual(res.points.map(p => [p.x, p.y]), [[2, 0], [5, 0]]);
assert.deepEqual([res.last.x, res.last.y], [5, 0]);

// no points accepted -> last unchanged
const empty = filterPointsByMinDist([pt(0.5, 0)], last, 2.25);
assert.equal(empty.points.length, 0);
assert.deepEqual([empty.last.x, empty.last.y], [0, 0]);

// empty input
assert.deepEqual(filterPointsByMinDist([], last, 2.25).points, []);

console.log("drawing-helpers tests passed.");
