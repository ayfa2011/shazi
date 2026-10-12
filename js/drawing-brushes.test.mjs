import assert from "node:assert/strict";

// Mock canvas 2d context for headless verification
function createMockContext() {
  const calls = [];
  return {
    calls,
    save() { calls.push(["save"]); },
    restore() { calls.push(["restore"]); },
    beginPath() { calls.push(["beginPath"]); },
    moveTo(x, y) { calls.push(["moveTo", x, y]); },
    lineTo(x, y) { calls.push(["lineTo", x, y]); },
    quadraticCurveTo(cx, cy, x, y) { calls.push(["quadraticCurveTo", cx, cy, x, y]); },
    arc(x, y, r, sa, ea) { calls.push(["arc", x, y, r, sa, ea]); },
    stroke() { calls.push(["stroke"]); },
    fill() { calls.push(["fill"]); },
    globalCompositeOperation: "source-over",
    globalAlpha: 1.0,
    lineWidth: 1,
    strokeStyle: "#000",
    fillStyle: "#000",
    lineCap: "butt",
    lineJoin: "miter"
  };
}

// Extract drawSmoothCurve and renderSingleStroke logic
function drawSmoothCurve(targetCtx, points) {
  if (!points || points.length < 2) return;
  if (points.length === 2) {
    targetCtx.moveTo(points[0].x, points[0].y);
    targetCtx.lineTo(points[1].x, points[1].y);
    return;
  }
  targetCtx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    targetCtx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }
  targetCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
}

function renderSingleStroke(targetCtx, stroke) {
  if (!targetCtx || !stroke || !stroke.points || stroke.points.length === 0) return;
  const pts = stroke.points;
  const strokeTool = stroke.tool || "pen";
  const strokeColor = stroke.color || "#dc4d88";
  const strokeSize = stroke.size || 5;
  const strokeOpacity = typeof stroke.opacity === "number"
    ? stroke.opacity
    : (strokeTool === "marker" ? 0.8 : (strokeTool === "pencil" ? 0.75 : 1.0));

  targetCtx.save();

  if (strokeTool === "eraser") {
    targetCtx.globalCompositeOperation = "destination-out";
    targetCtx.globalAlpha = 1.0;
    targetCtx.lineWidth = strokeSize;
    targetCtx.lineCap = "round";
    targetCtx.lineJoin = "round";

    if (pts.length === 1) {
      targetCtx.beginPath();
      targetCtx.arc(pts[0].x, pts[0].y, Math.max(1, strokeSize / 2), 0, Math.PI * 2);
      targetCtx.fill();
    } else {
      targetCtx.beginPath();
      drawSmoothCurve(targetCtx, pts);
      targetCtx.stroke();
    }
    targetCtx.restore();
    return;
  }

  if (strokeTool === "marker") {
    targetCtx.globalCompositeOperation = "source-over";
    targetCtx.globalAlpha = strokeOpacity;
    targetCtx.strokeStyle = strokeColor;
    targetCtx.fillStyle = strokeColor;
    targetCtx.lineWidth = strokeSize;
    targetCtx.lineCap = "round";
    targetCtx.lineJoin = "round";

    if (pts.length === 1) {
      targetCtx.beginPath();
      targetCtx.arc(pts[0].x, pts[0].y, Math.max(1, strokeSize / 2), 0, Math.PI * 2);
      targetCtx.fill();
    } else {
      targetCtx.beginPath();
      drawSmoothCurve(targetCtx, pts);
      targetCtx.stroke();
    }
    targetCtx.restore();
    return;
  }

  if (strokeTool === "pencil") {
    targetCtx.globalCompositeOperation = "source-over";
    targetCtx.strokeStyle = strokeColor;
    targetCtx.fillStyle = strokeColor;
    targetCtx.lineCap = "round";
    targetCtx.lineJoin = "round";

    if (pts.length === 1) {
      targetCtx.globalAlpha = strokeOpacity * 0.75;
      targetCtx.beginPath();
      targetCtx.arc(pts[0].x, pts[0].y, Math.max(1, strokeSize / 2), 0, Math.PI * 2);
      targetCtx.fill();
    } else {
      targetCtx.globalAlpha = strokeOpacity * 0.55;
      targetCtx.lineWidth = strokeSize;
      targetCtx.beginPath();
      drawSmoothCurve(targetCtx, pts);
      targetCtx.stroke();

      targetCtx.globalAlpha = strokeOpacity * 0.40;
      targetCtx.lineWidth = Math.max(1, strokeSize * 0.55);
      targetCtx.beginPath();
      drawSmoothCurve(targetCtx, pts);
      targetCtx.stroke();
    }
    targetCtx.restore();
    return;
  }

  // Pen / Default
  targetCtx.globalCompositeOperation = "source-over";
  targetCtx.globalAlpha = strokeOpacity;
  targetCtx.strokeStyle = strokeColor;
  targetCtx.fillStyle = strokeColor;
  targetCtx.lineWidth = strokeSize;
  targetCtx.lineCap = "round";
  targetCtx.lineJoin = "round";

  if (pts.length === 1) {
    targetCtx.beginPath();
    targetCtx.arc(pts[0].x, pts[0].y, Math.max(1, strokeSize / 2), 0, Math.PI * 2);
    targetCtx.fill();
  } else {
    targetCtx.beginPath();
    drawSmoothCurve(targetCtx, pts);
    targetCtx.stroke();
  }
  targetCtx.restore();
}

// Tests
console.log("Testing Apple Markup brush rendering...");

// Test 1: Pen stroke with curve smoothing
{
  const mock = createMockContext();
  const stroke = {
    tool: "pen",
    color: "#ff3b30",
    size: 6,
    points: [{ x: 10, y: 10 }, { x: 20, y: 30 }, { x: 40, y: 50 }]
  };
  renderSingleStroke(mock, stroke);
  assert.equal(mock.strokeStyle, "#ff3b30");
  assert.equal(mock.lineWidth, 6);
  assert.equal(mock.globalAlpha, 1.0);
  assert.equal(mock.globalCompositeOperation, "source-over");
  // verify quadratic curve interpolation was called
  const hasQuad = mock.calls.some(call => call[0] === "quadraticCurveTo");
  assert.equal(hasQuad, true, "Pen should use quadratic curve smoothing");
}

// Test 2: Marker with opacity
{
  const mock = createMockContext();
  const stroke = {
    tool: "marker",
    color: "#ffcc00",
    size: 24,
    opacity: 0.5,
    points: [{ x: 5, y: 5 }, { x: 50, y: 50 }]
  };
  renderSingleStroke(mock, stroke);
  assert.equal(mock.strokeStyle, "#ffcc00");
  assert.equal(mock.lineWidth, 24);
  assert.equal(mock.globalAlpha, 0.5);
  assert.equal(mock.globalCompositeOperation, "source-over");
}

// Test 3: Eraser destination-out
{
  const mock = createMockContext();
  const stroke = {
    tool: "eraser",
    size: 20,
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }]
  };
  renderSingleStroke(mock, stroke);
  assert.equal(mock.globalCompositeOperation, "destination-out");
  assert.equal(mock.lineWidth, 20);
}

// Test 4: Single tap dot handling
{
  const mock = createMockContext();
  const stroke = {
    tool: "pen",
    color: "#007aff",
    size: 8,
    points: [{ x: 25, y: 35 }]
  };
  renderSingleStroke(mock, stroke);
  const hasArc = mock.calls.some(call => call[0] === "arc" && call[1] === 25 && call[2] === 35 && call[3] === 4);
  assert.equal(hasArc, true, "Single tap should draw a circle dot with half size radius");
  const hasFill = mock.calls.some(call => call[0] === "fill");
  assert.equal(hasFill, true, "Single tap dot should be filled");
}

// Test 5: Legacy backwards compatibility with tool: "brush"
{
  const mock = createMockContext();
  const stroke = {
    tool: "brush",
    color: "#222222",
    size: 5,
    points: [{ x: 1, y: 1 }, { x: 2, y: 2 }]
  };
  renderSingleStroke(mock, stroke);
  assert.equal(mock.globalCompositeOperation, "source-over");
  assert.equal(mock.strokeStyle, "#222222");
}

console.log("All Apple Markup brush rendering tests passed successfully!");

