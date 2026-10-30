// Pure helpers for the drawing canvas rendering pipeline.
// These have no DOM/Canvas dependencies so they can be unit tested headless.

/** Round a point to the same precision used by the canvas point() mapper. */
export function roundPoint(x, y) {
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

/** Squared distance between two points. */
export function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Map a raw client coordinate to a canvas-space point using a bounding rect.
 * Pure: all inputs are passed in, no DOM state is read.
 */
export function clientToCanvasPoint(clientX, clientY, rect) {
  const x = ((clientX - rect.left) / rect.width) * 1200;
  const y = ((clientY - rect.top) / rect.height) * 900;
  return roundPoint(x, y);
}

/**
 * Extract raw client points from a PointerEvent, using getCoalescedEvents()
 * when available so fast movement keeps its curve, falling back to the single
 * event otherwise. Returns raw (unmapped) client points.
 */
export function coalescedClientPoints(event) {
  const raw = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
  return raw.map(ev => ({ x: ev.clientX, y: ev.clientY }));
}

/**
 * Filter a sequence of canvas points by a minimum-distance threshold relative
 * to a starting `last` point, mirroring the pointermove distance filter.
 * Returns { points, last } where `points` are the accepted points and `last`
 * is the final accepted point (or the original `last` if none were accepted).
 */
export function filterPointsByMinDist(points, last, minDistSquared) {
  const accepted = [];
  let prev = last;
  for (const p of points) {
    if (distanceSquared(p, prev) >= minDistSquared) {
      accepted.push(p);
      prev = p;
    }
  }
  return { points: accepted, last: prev };
}
