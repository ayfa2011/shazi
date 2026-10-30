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
 * Map a raw client coordinate to a canvas-space point using a bounding rect
 * and the canvas's intrinsic dimensions. Pure: all inputs are passed in.
 */
export function clientToCanvasPoint(clientX, clientY, rect, canvasW, canvasH) {
  const x = ((clientX - rect.left) / rect.width) * canvasW;
  const y = ((clientY - rect.top) / rect.height) * canvasH;
  return roundPoint(x, y);
}

/**
 * Clamp a point to the canvas bounds so out-of-range pointer events (e.g.
 * dragging past the edge while zoomed) never produce off-canvas coordinates
 * that can look like wrapping or offset under CSS transforms.
 */
export function clampPoint(p, canvasW, canvasH) {
  return {
    x: Math.max(0, Math.min(canvasW, p.x)),
    y: Math.max(0, Math.min(canvasH, p.y)),
  };
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
