// js/drawing-preload.js
// Pre-warms the Drawing Canvas at app startup so the Drawing Page opens
// instantly instead of hanging while the network/Firebase RTDB connects.
//
// Warmed in the background (fire-and-forget, never blocks app launch):
//   * pre-creates the offscreen canvas + 2D context used while drawing
//
// renderDrawing.js reuses the cached context so it never has to allocate a
// fresh canvas+context on every drawing-page open. Strokes are downloaded
// only when the Drawing Page is opened (see js/drawing.js), never at app
// start, so warmDrawing() never performs network requests.
const CANVAS_W = 1200;
const CANVAS_H = 900;

export const drawingWarm = {
  ctx: null,  // offscreen 2D context (reused as the live buffer)
  ready: false,
  readyPromise: null,
};

let _started = false;

/**
 * Kick off background drawing warm-up at app startup.
 * Safe to call multiple times; resolves once warm (or gives up on error so
 * the app is never blocked and drawing still works, just warms lazily).
 */
export function warmDrawing() {
  if (_started) return drawingWarm.readyPromise;
  _started = true;
  drawingWarm.readyPromise = (async () => {
    try {
      // Pre-create the offscreen canvas + 2D context (the live buffer used
      //    while a stroke is in progress). Reused by renderDrawing instead of
      //    allocating a fresh canvas+context on every drawing-page open.
      const buffer = document.createElement("canvas");
      buffer.width = CANVAS_W;
      buffer.height = CANVAS_H;
      drawingWarm.ctx = buffer.getContext("2d");
      drawingWarm.ready = true;
    } catch (error) {
      // Never block the app: drawing still works, it just warms up lazily.
      console.warn("Drawing pre-warm skipped (warms on first open):", error);
      drawingWarm.ready = true;
    }
  })();
  return drawingWarm.readyPromise;
}
