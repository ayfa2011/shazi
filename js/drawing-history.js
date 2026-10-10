export function createDrawingHistory(initialStrokes = []) {
  const strokes = initialStrokes.map(stroke => ({ ...stroke, points: [...(stroke.points || [])] }));
  const redoStack = [];
  let clearSnapshot = null;

  return {
    get strokes() { return strokes; },
    get canUndo() { return strokes.length > 0 || Boolean(clearSnapshot?.length); },
    get canRedo() { return redoStack.length > 0 || Boolean(clearSnapshot?.length); },
    add(stroke) {
      clearSnapshot = null;
      redoStack.length = 0;
      strokes.push(stroke);
    },
    undo() {
      if (!strokes.length) {
        if (clearSnapshot?.length) {
          strokes.push(...clearSnapshot);
          clearSnapshot = null;
          redoStack.length = 0;
          return { type: "restore", strokes: [...strokes] };
        }
        return null;
      }
      const stroke = strokes.pop();
      redoStack.push(stroke);
      return { type: "remove", stroke, position: strokes.length };
    },
    redo() {
      const stroke = redoStack.pop();
      if (!stroke) return null;
      clearSnapshot = null;
      strokes.push(stroke);
      return { type: "add", stroke };
    },
    clear() {
      if (!strokes.length) return null;
      clearSnapshot = strokes.slice();
      strokes.length = 0;
      redoStack.length = 0;
      return clearSnapshot;
    },
    clearHistory() {
      strokes.length = 0;
      redoStack.length = 0;
      clearSnapshot = null;
    },
    replace(strokesToRestore) {
      strokes.splice(0, strokes.length, ...strokesToRestore);
      redoStack.length = 0;
      clearSnapshot = null;
    },
    applyRemoteUndo(strokeId) {
      const index = strokes.findIndex(stroke => stroke.id === strokeId);
      if (index >= 0) strokes.splice(index, 1);
    },
    restore(strokesToRestore) {
      strokes.splice(0, strokes.length, ...strokesToRestore);
      redoStack.length = 0;
      clearSnapshot = null;
    },
    applyRemoteClear() { this.clearHistory(); }
  };
}
