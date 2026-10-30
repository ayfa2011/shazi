import assert from "node:assert/strict";
import { simplifyPoints } from "./drawing-fixes.js";

const pt = (x, y) => ({ x, y });

// Empty / trivial inputs.
assert.deepEqual(simplifyPoints([]), []);
assert.deepEqual(simplifyPoints([pt(1, 2)]), [pt(1, 2)]);
assert.deepEqual(simplifyPoints([pt(1, 2), pt(3, 4)]), [pt(1, 2), pt(3, 4)]);

// Distance filter: points closer than minDist to the last kept point are dropped.
// minDist = 1.5; (0,0)->(1,0) is 1.0 apart (dropped), (1,0)->(3,0) is 2.0 apart (kept).
const filtered = simplifyPoints([pt(0, 0), pt(1, 0), pt(3, 0)], 1.5, 0.6);
assert.deepEqual(filtered.map(p => [p.x, p.y]), [[0, 0], [3, 0]]);

// Ramer-Douglas-Peucker: collinear intermediate points collapse to endpoints.
const collinear = simplifyPoints([pt(0, 0), pt(1, 0), pt(2, 0), pt(3, 0)], 0.1, 0.6);
assert.deepEqual(collinear.map(p => [p.x, p.y]), [[0, 0], [3, 0]]);

// First and last points are always preserved even for a bent stroke.
const bent = simplifyPoints([pt(0, 0), pt(1, 1), pt(2, 0)], 0.1, 0.6);
assert.equal(bent[0].x, 0); assert.equal(bent[0].y, 0);
assert.equal(bent[bent.length - 1].x, 2); assert.equal(bent[bent.length - 1].y, 0);

// Default parameters are used when omitted.
const defaults = simplifyPoints([pt(0, 0), pt(0.5, 0), pt(10, 0)]);
assert.deepEqual(defaults.map(p => [p.x, p.y]), [[0, 0], [10, 0]]);

// A stroke with genuine bends keeps the corner points.
const angled = simplifyPoints([pt(0, 0), pt(5, 0), pt(5, 5), pt(10, 5)], 0.1, 0.6);
assert.equal(angled.length, 4);

console.log("simplifyPoints tests passed.");
