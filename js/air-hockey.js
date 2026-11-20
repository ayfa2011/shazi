// js/air-hockey.js — 2-player Air Hockey for "Our Little World"
// Usage:  import { openAirHockey, closeAirHockey } from "./air-hockey.js";
//         openAirHockey({ names: ["You", "Partner"], onExit: () => {} });
// No assets needed: sounds are synthesized (WebAudio), graphics drawn on <canvas>.

const TEMPLATE = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Quicksand:wght@500;600;700&family=Noto+Sans+Kannada:wght@400;600&display=swap');
  .ah-root { --ui: "Quicksand","Noto Sans Kannada",system-ui,sans-serif; --hand: "Caveat","Noto Sans Kannada",cursive; --ink:#5b3447; --rasp:#d6457a;
    position: fixed; inset: 0; z-index: 1400; overflow: hidden; font-family: var(--ui); color: var(--ink); user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; overscroll-behavior: none; touch-action: none;
    background: radial-gradient(circle at 15% 10%, #ffd6e6 0, transparent 45%), radial-gradient(circle at 90% 90%, #dcd0ff 0, transparent 45%), linear-gradient(160deg, #fff0f6, #ffe1ee 55%, #efe6ff); }
  .ah-root *, .ah-root *::before, .ah-root *::after { box-sizing: border-box; }
  .ah-root canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
  .ah-fx { pointer-events: none; }
  .ah-hud { position: absolute; top: max(10px, env(safe-area-inset-top)); right: 12px; left: 12px; z-index: 5; display: flex; justify-content: space-between; pointer-events: none; }
  .ah-hud > div { display: flex; gap: 8px; }
  .ah-ibtn { display: grid; width: 42px; height: 42px; place-items: center; border: 0; border-radius: 50%; background: #fff; color: var(--rasp); font-size: 17px; font-weight: 700; box-shadow: 0 8px 18px -8px #d6457a99; cursor: pointer; pointer-events: auto; transition: transform .2s cubic-bezier(.34,1.56,.64,1); }
  .ah-ibtn:active { transform: scale(.88); }
  .ah-count, .ah-toast { position: absolute; left: 0; right: 0; top: 50%; z-index: 4; text-align: center; pointer-events: none; font: 700 clamp(80px, 26vw, 150px)/1 var(--hand); color: #fff; text-shadow: 0 6px 0 #d6457a, 0 14px 30px #d6457a88; opacity: 0; translate: 0 -50%; }
  .ah-toast { font-size: clamp(54px, 17vw, 96px); }
  .ah-pop { animation: ah-pop .9s cubic-bezier(.2,.9,.3,1.2) both; }
  @keyframes ah-pop { 0% { opacity: 0; transform: scale(.4) rotate(-6deg); } 25% { opacity: 1; transform: scale(1.15) rotate(2deg); } 70% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.2); } }
  .ah-panel { position: absolute; inset: 0; z-index: 6; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(91,52,71,.38); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); animation: ah-fade .3s ease both; }
  .ah-panel[hidden] { display: none; }
  .ah-card { width: min(360px, 100%); padding: 26px 22px 22px; border: 1px solid #ffd6e4; border-radius: 30px; background: linear-gradient(170deg, #fff, #fff2f7); box-shadow: 0 30px 80px #5b34476b; text-align: center; animation: ah-card .5s cubic-bezier(.2,.9,.3,1.15) both; }
  .ah-card h1 { margin: 0; color: var(--rasp); font: 700 clamp(46px, 14vw, 62px)/.95 var(--hand); }
  .ah-card p { margin: 8px 0 16px; color: #8a6577; font-size: 13px; font-weight: 600; line-height: 1.5; }
  .ah-trophy { font-size: 64px; line-height: 1; animation: ah-bob 1.6s ease-in-out infinite; }
  .ah-stack { display: grid; gap: 10px; }
  .ah-btn { padding: 14px 18px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #ff8fb3, #d6457a); color: #fff; font: 700 15px var(--ui); box-shadow: 0 12px 22px -8px #d6457acc; cursor: pointer; transition: transform .25s cubic-bezier(.34,1.56,.64,1); }
  .ah-btn.blue { background: linear-gradient(135deg, #7cc0ff, #3a8be0); box-shadow: 0 12px 22px -8px #3a8be0cc; }
  .ah-btn.ghost { border: 1.5px solid #ffd0df; background: #fff; color: #8a6577; box-shadow: none; }
  .ah-btn:active { transform: scale(.95); }
  .ah-chips { display: flex; justify-content: center; align-items: center; gap: 8px; margin: 4px 0 16px; color: #8a6577; font-size: 12px; font-weight: 700; }
  .ah-chip { min-width: 40px; padding: 8px 12px; border: 1.5px solid #ffd0df; border-radius: 999px; background: #fff; color: #8a6577; font: 700 13px var(--ui); cursor: pointer; }
  .ah-chip.on { border-color: transparent; background: linear-gradient(135deg, #ff8fb3, #d6457a); color: #fff; }
  @keyframes ah-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ah-card { from { opacity: 0; transform: translateY(26px) scale(.92); } to { opacity: 1; transform: none; } }
  @keyframes ah-bob { 0%,100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-8px) rotate(4deg); } }
  @media (prefers-reduced-motion: reduce) { .ah-trophy, .ah-card { animation: none; } }
</style>
<div class="ah-root">
  <canvas class="ah-board"></canvas>
  <canvas class="ah-fx"></canvas>
  <div class="ah-hud"><button class="ah-ibtn" data-a="exit" aria-label="Close game">✕</button><div><button class="ah-ibtn" data-a="sound" aria-label="Sound">🔊</button><button class="ah-ibtn" data-a="pause" aria-label="Pause">❚❚</button></div></div>
  <div class="ah-count"></div>
  <div class="ah-toast"></div>
  <section class="ah-panel" data-p="menu"><div class="ah-card">
    <h1>Air Hockey ♡</h1><p>Eradu jana, ondu phone! Prati yobbaru avara half nalli ball hode.</p>
    <div class="ah-chips"><span>First to</span><button class="ah-chip" data-g="3">3</button><button class="ah-chip on" data-g="5">5</button><button class="ah-chip" data-g="7">7</button></div>
    <div class="ah-stack"><button class="ah-btn" data-mode="2p">👭 2 Players</button><button class="ah-btn blue" data-mode="ai">🤖 vs Computer</button><button class="ah-btn ghost" data-a="exit">Back</button></div></div></section>
  <section class="ah-panel" data-p="pause" hidden><div class="ah-card"><h1>Paused</h1><p>Rest tegolli, ready aadmele continue madi ♡</p>
    <div class="ah-stack"><button class="ah-btn" data-a="resume">▶ Resume</button><button class="ah-btn ghost" data-a="menu">Menu</button></div></div></section>
  <section class="ah-panel" data-p="win" hidden><div class="ah-card"><div class="ah-trophy">🏆</div><h1 data-w="title"></h1><p data-w="sub"></p>
    <div class="ah-stack"><button class="ah-btn" data-a="again">🔁 Play again</button><button class="ah-btn ghost" data-a="menu">Menu</button></div></div></section>
</div>`;

let closeCurrent = null;
export function closeAirHockey() { closeCurrent?.(); }

export function openAirHockey(opts = {}) {
  closeAirHockey();
  const names = [String(opts.names?.[0] || "Player 1"), String(opts.names?.[1] || "Player 2")]; // [bottom, top]
  const online = opts.online || null;
  const host = document.createElement("div");
  host.innerHTML = TEMPLATE;
  (opts.mount || document.body).appendChild(host);
  const $ = (s) => host.querySelector(s);
  const root = $(".ah-root"), boardCv = $(".ah-board"), fxCv = $(".ah-fx");
  const bctx = boardCv.getContext("2d"), fctx = fxCv.getContext("2d");
  const countEl = $(".ah-count"), toastEl = $(".ah-toast");
  const panel = (n) => $(`[data-p="${n}"]`);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  // ───────── constants (logical board units) ─────────
  const W = 360, H = 640, CX = W / 2, CY = H / 2, PR = 33, R = 19, GOAL = 64, POST = 5;
  const STEP = 1 / 120, MAX_PUCK = 1500, REST = 0.92, PAD_SPEED = 3000, AI_SPEED = 1250;
  const COLORS = [{ a: "#ff7fa8", b: "#d6457a" }, { a: "#7cc0ff", b: "#2f7fd6" }]; // bottom pink, top blue
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ───────── state ─────────
  let mode = "2p", target = 5, state = "menu", prevState = "playing", stateT = 0, time = 0, lastHit = 0;
  let score = [0, 0], shake = 0, flash = 0, lastScorer = 0, cdStep = -1, celebrateT = 0, winTimer = 0;
  const puck = { x: CX, y: CY, vx: 0, vy: 0 };
  const pads = [0, 1].map((i) => ({ idx: i, x: CX, y: i ? H * 0.15 : H * 0.85, tx: CX, ty: i ? H * 0.15 : H * 0.85, vx: 0, vy: 0, pointer: null, pulse: 0 }));
  let trail = [], vw = 0, vh = 0, dpr = 1, S = 1, ox = 0, oy = 0, cache = null, raf = 0, last = performance.now(), acc = 0;
  let muted = false;
  let lastOnlineSnapshotAt = 0, lastOnlineInputAt = 0, lastOnlineInput = 0, onlineInputSeq = 0, onlineActionSeq = 0, lastOnlineActionSeq = 0, onlineWon = false;
  const onlineUnsubs = [];
  try { muted = localStorage.getItem("olw-ah-muted") === "1"; } catch {}

  // ───────── sound (WebAudio synth) ─────────
  let ac = null, master = null, noiseBuf = null;
  function audio() {
    if (muted) return null;
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ac = new C(); master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(f, d, type = "sine", v = 0.2, slide = 0, delay = 0) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.03);
  }
  function noise(d, v = 0.2, freq = 2000, q = 1, delay = 0) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.03);
  }
  const sfx = {
    hit(sp) { const k = Math.min(1, sp / 1200); tone(240 + k * 260, 0.09, "triangle", 0.2 + k * 0.2, -110); noise(0.05, 0.12 + k * 0.1, 1800 + k * 2200); },
    wall(sp) { const k = Math.min(1, sp / 1200); tone(150, 0.07, "sine", 0.1 + k * 0.12, -40); noise(0.03, 0.05 + k * 0.05, 900); },
    click() { tone(520, 0.05, "triangle", 0.1); },
    beep(hi) { tone(hi ? 990 : 660, hi ? 0.28 : 0.14, "square", 0.1); },
    goal() { [784, 659, 523, 392].forEach((f, i) => tone(f, 0.18, "sawtooth", 0.1, 0, i * 0.09)); noise(0.4, 0.15, 700, 0.6); },
    pop() { noise(0.14, 0.35, 1200, 0.8); tone(95, 0.16, "sine", 0.32, -55); for (let i = 0; i < 5; i++) noise(0.025, 0.12, 3500 + rnd(0, 3500), 1, 0.04 * i + rnd(0.03, 0.09)); },
    whistle() { tone(1400, 0.5, "sine", 0.06, 500); },
    fanfare() { [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(f, 0.24, "square", 0.09, 0, i * 0.12); tone(f / 2, 0.24, "triangle", 0.12, 0, i * 0.12); }); [523, 659, 784, 1047].forEach((f) => tone(f, 0.9, "triangle", 0.1, 0, 0.7)); },
  };
  const buzz = (p) => { try { navigator.vibrate?.(p); } catch {} };

  // ───────── celebration (crackers, fireworks, confetti) ─────────
  const parts = [], rockets = [];
  const PALETTE = ["#ff7fa8", "#ffd166", "#7cc0ff", "#b9a4f2", "#ff5d9a", "#7ee0b5", "#fff"];
  function burst(x, y, n = 48, pal = PALETTE) {
    const c1 = pal[(Math.random() * pal.length) | 0], c2 = pal[(Math.random() * pal.length) | 0];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rnd(-0.1, 0.1), sp = rnd(70, 300);
      parts.push({ k: "s", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rnd(0.8, 1.5), c: i % 2 ? c1 : c2, s: rnd(1.8, 3.4), g: 200, d: 1.6 }); }
    sfx.pop(); if (parts.length > 900) parts.splice(0, parts.length - 900);
  }
  function confetti(n, x, y, spread, up = 0) {
    for (let i = 0; i < n; i++) parts.push({ k: "c", x: x + rnd(-spread, spread), y, vx: rnd(-90, 90), vy: rnd(-up, 90), life: 0, max: rnd(3, 5), c: PALETTE[(Math.random() * PALETTE.length) | 0], s: rnd(5, 9), g: 140, d: 0.6, r: rnd(0, 6), vr: rnd(-8, 8), ph: rnd(0, 6) });
  }
  function launch() { rockets.push({ x: rnd(0.15, 0.85) * vw, y: vh + 10, vx: rnd(-40, 40), vy: -rnd(520, 760), fuse: rnd(0.65, 1.1) }); }
  function updateFX(dt) {
    for (let i = rockets.length - 1; i >= 0; i--) { const r = rockets[i];
      r.x += r.vx * dt; r.y += r.vy * dt; r.vy += 260 * dt; r.fuse -= dt;
      parts.push({ k: "s", x: r.x, y: r.y, vx: rnd(-20, 20), vy: rnd(10, 60), life: 0, max: 0.45, c: "#ffd9a8", s: 1.8, g: 0, d: 2 });
      if (r.fuse <= 0 || r.vy > -60) { burst(r.x, r.y, 56); rockets.splice(i, 1); } }
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i];
      p.life += dt; if (p.life >= p.max) { parts.splice(i, 1); continue; }
      const dr = Math.exp(-p.d * dt); p.vx *= dr; p.vy = p.vy * dr + p.g * dt;
      p.x += p.vx * dt + (p.k === "c" ? Math.sin(p.life * 6 + p.ph) * 0.9 : 0); p.y += p.vy * dt; if (p.k === "c") p.r += p.vr * dt; }
    if (state === "won") { celebrateT += dt;
      if (celebrateT > 0.42) { celebrateT = 0; launch(); if (Math.random() < 0.6) launch(); }
      if (Math.random() < dt * 14) confetti(3, rnd(0, vw), -10, 0); }
    flash = Math.max(0, flash - dt * 2.2);
  }
  function drawFX() {
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0); fctx.clearRect(0, 0, vw, vh);
    if (flash > 0) { fctx.fillStyle = `rgba(255,205,228,${flash * 0.4})`; fctx.fillRect(0, 0, vw, vh); }
    for (const p of parts) { const a = 1 - p.life / p.max; fctx.globalAlpha = Math.max(0, a); fctx.fillStyle = p.c;
      if (p.k === "s") { fctx.globalCompositeOperation = "lighter"; fctx.beginPath(); fctx.arc(p.x, p.y, p.s * (0.6 + a * 0.6), 0, 6.283); fctx.fill(); fctx.globalCompositeOperation = "source-over"; }
      else { fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.r); fctx.fillRect(-p.s / 2, -p.s * 0.3, p.s, p.s * 0.6); fctx.restore(); } }
    fctx.globalAlpha = 1;
  }

  // ───────── board rendering ─────────
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  const PAD = 18;
  function buildCache() {
    cache = document.createElement("canvas"); const k = S * dpr;
    cache.width = Math.ceil((W + PAD * 2) * k); cache.height = Math.ceil((H + PAD * 2) * k);
    const c = cache.getContext("2d"); c.scale(k, k); c.translate(PAD, PAD);
    c.save(); c.shadowColor = "rgba(214,69,122,.35)"; c.shadowBlur = 22; c.shadowOffsetY = 8; rr(c, 0, 0, W, H, 34); c.fillStyle = "#fff"; c.fill(); c.restore();
    c.save(); rr(c, 0, 0, W, H, 34); c.clip();
    let g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#eef5ff"); g.addColorStop(0.5, "#fffafd"); g.addColorStop(1, "#ffe9f2"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.5; c.fillStyle = "#ff8fb3"; c.font = "18px sans-serif"; c.textAlign = "center";
    [[50, 110], [310, 190], [70, 270], [300, 460], [60, 540], [250, 590], [180, 40], [180, 600]].forEach(([x, y]) => c.fillText("♡", x, y)); c.globalAlpha = 1;
    c.strokeStyle = "#ff9fbd"; c.lineWidth = 4; c.setLineDash([14, 10]); c.beginPath(); c.moveTo(0, CY); c.lineTo(W, CY); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(CX, CY, 58, 0, 6.283); c.stroke(); c.fillStyle = "#ff9fbd"; c.beginPath(); c.arc(CX, CY, 7, 0, 6.283); c.fill();
    c.fillStyle = "rgba(91,52,71,.2)"; [0, H].forEach((y) => { c.beginPath(); c.arc(CX, y, GOAL + 6, 0, 6.283); c.fill(); }); c.lineWidth = 3; c.strokeStyle = "rgba(214,69,122,.5)";
    [0, H].forEach((y) => { c.beginPath(); c.arc(CX, y, GOAL + 6, 0, 6.283); c.stroke(); });
    c.restore();
    c.lineWidth = 11; c.strokeStyle = "#ff8fb3"; rr(c, -5.5, -5.5, W + 11, H + 11, 38); c.stroke();
    c.fillStyle = "#6b3a52"; c.fillRect(CX - GOAL, -12, GOAL * 2, 12); c.fillRect(CX - GOAL, H, GOAL * 2, 12);
    c.fillStyle = "#fff"; [[CX - GOAL, 0], [CX + GOAL, 0], [CX - GOAL, H], [CX + GOAL, H]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, POST + 1, 0, 6.283); c.fill(); c.strokeStyle = "#d6457a"; c.lineWidth = 2; c.stroke(); });
  }
  function resize() {
    const r = root.getBoundingClientRect(); vw = r.width; vh = r.height; dpr = Math.min(2.5, window.devicePixelRatio || 1);
    S = Math.max(0.3, Math.min((vw - 28) / W, (vh - 120) / H)); ox = (vw - W * S) / 2; oy = (vh - H * S) / 2;
    [boardCv, fxCv].forEach((cv) => { cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); });
    buildCache();
  }
  function drawPad(c, p) {
    const col = COLORS[p.idx];
    c.save(); c.translate(p.x, p.y);
    c.fillStyle = "rgba(91,52,71,.22)"; c.beginPath(); c.ellipse(4, 9, PR, PR * 0.92, 0, 0, 6.283); c.fill();
    const g = c.createRadialGradient(-PR * 0.3, -PR * 0.35, 4, 0, 0, PR); g.addColorStop(0, col.a); g.addColorStop(1, col.b);
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, PR, 0, 6.283); c.fill();
    c.lineWidth = 5; c.strokeStyle = "rgba(255,255,255,.9)"; c.beginPath(); c.arc(0, 0, PR * 0.72, 0, 6.283); c.stroke();
    c.fillStyle = col.b; c.beginPath(); c.arc(0, 0, PR * 0.46, 0, 6.283); c.fill();
    c.fillStyle = "rgba(255,255,255,.85)"; c.beginPath(); c.arc(-PR * 0.12, -PR * 0.14, PR * 0.2, 0, 6.283); c.fill();
    if (p.pulse > 0) { c.globalAlpha = p.pulse; c.lineWidth = 4; c.strokeStyle = "#fff"; c.beginPath(); c.arc(0, 0, PR + (1 - p.pulse) * 22, 0, 6.283); c.stroke(); }
    c.restore();
  }
  function draw() {
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0); bctx.clearRect(0, 0, vw, vh);
    const sx = (Math.random() - 0.5) * shake * 10, sy = (Math.random() - 0.5) * shake * 10;
    bctx.save(); bctx.translate(ox + sx, oy + sy); bctx.scale(S, S);
    if (cache) bctx.drawImage(cache, -PAD, -PAD, W + PAD * 2, H + PAD * 2);
    bctx.textAlign = "center"; bctx.textBaseline = "middle";
    const label = (i) => { const top = i === 1; bctx.save(); bctx.translate(CX, top ? CY - 118 : CY + 118); if (top) bctx.rotate(Math.PI);
      bctx.fillStyle = COLORS[i].b; bctx.globalAlpha = 0.16; bctx.font = "700 110px Quicksand, sans-serif"; bctx.fillText(score[i], 0, 0);
      bctx.globalAlpha = 0.6; bctx.font = "700 14px Quicksand, 'Noto Sans Kannada', sans-serif"; bctx.fillText(names[i], 0, 66); bctx.restore(); };
    label(0); label(1);
    if (trail.length > 1) trail.forEach((t, i) => { bctx.globalAlpha = (i / trail.length) * 0.3; bctx.fillStyle = "#d6457a"; bctx.beginPath(); bctx.arc(t.x, t.y, R * (0.4 + (i / trail.length) * 0.6), 0, 6.283); bctx.fill(); });
    bctx.globalAlpha = 1;
    const sp = Math.hypot(puck.vx, puck.vy);
    bctx.fillStyle = "rgba(91,52,71,.25)"; bctx.beginPath(); bctx.ellipse(puck.x + 3, puck.y + 6, R, R * 0.9, 0, 0, 6.283); bctx.fill();
    bctx.save(); if (sp > 650) { bctx.shadowColor = "#ff5d9a"; bctx.shadowBlur = 14 * Math.min(1, sp / 1200); }
    const pg = bctx.createRadialGradient(puck.x - 5, puck.y - 6, 2, puck.x, puck.y, R); pg.addColorStop(0, "#7a4a60"); pg.addColorStop(1, "#2e1621");
    bctx.fillStyle = pg; bctx.beginPath(); bctx.arc(puck.x, puck.y, R, 0, 6.283); bctx.fill(); bctx.restore();
    bctx.strokeStyle = "rgba(255,255,255,.35)"; bctx.lineWidth = 2.5; bctx.beginPath(); bctx.arc(puck.x, puck.y, R * 0.62, 0, 6.283); bctx.stroke();
    pads.forEach((p) => drawPad(bctx, p));
    bctx.restore();
  }

  // ───────── game logic ─────────
  function setTarget(p, x, y) {
    const top = p.idx === 1;
    p.tx = clamp(x, PR, W - PR); p.ty = top ? clamp(y, PR, CY - PR) : clamp(y, CY + PR, H - PR);
  }
  function movePads(dt) {
    pads.forEach((p) => {
      const ai = mode === "ai" && p.idx === 1, maxS = (ai ? AI_SPEED : PAD_SPEED) * dt, k = Math.min(1, 30 * dt);
      let dx = (p.tx - p.x) * k, dy = (p.ty - p.y) * k; const d = Math.hypot(dx, dy);
      if (d > maxS) { dx *= maxS / d; dy *= maxS / d; }
      p.vx = dx / dt; p.vy = dy / dt; p.x += dx; p.y += dy;
    });
  }
  function aiThink() {
    const ai = pads[1];
    if (puck.y < CY - 6 && ai.y < puck.y - 2) setTarget(ai, puck.x, puck.y + PR * 1.2);
    else setTarget(ai, CX + (puck.x - CX) * 0.55, PR + 16 + (puck.vy > 0 ? 0 : 36));
  }
  function bounceOff(nx, ny, e, sp) { const vn = puck.vx * nx + puck.vy * ny; if (vn < 0) { puck.vx -= (1 + e) * vn * nx; puck.vy -= (1 + e) * vn * ny; if (time - lastHit > 0.05) { sfx.wall(sp); lastHit = time; } } }
  function step(dt) {
    time += dt;
    if (mode === "ai") aiThink();
    movePads(dt);
    const f = Math.exp(-0.45 * dt); puck.vx *= f; puck.vy *= f; puck.x += puck.vx * dt; puck.y += puck.vy * dt;
    for (const p of pads) {
      const dx = puck.x - p.x, dy = puck.y - p.y, d = Math.hypot(dx, dy), min = PR + R;
      if (d < min && d > 0.001) {
        const nx = dx / d, ny = dy / d; puck.x = p.x + nx * min; puck.y = p.y + ny * min;
        const rvx = puck.vx - p.vx, rvy = puck.vy - p.vy, vn = rvx * nx + rvy * ny;
        if (vn < 0) { puck.vx -= 1.9 * vn * nx; puck.vy -= 1.9 * vn * ny;
          let sp = Math.hypot(puck.vx, puck.vy); if (sp < 240) { puck.vx = (puck.vx / (sp || 1)) * 240 || nx * 240; puck.vy = (puck.vy / (sp || 1)) * 240 || ny * 240; sp = 240; }
          // Avoid vibrating the whole phone on every puck collision. Android
          // honors the Vibration API here, while iOS generally ignores it.
          if (time - lastHit > 0.05) { sfx.hit(sp); lastHit = time; } p.pulse = 1; }
      }
    }
    const sp0 = Math.hypot(puck.vx, puck.vy); if (sp0 > MAX_PUCK) { puck.vx *= MAX_PUCK / sp0; puck.vy *= MAX_PUCK / sp0; }
    const sp = Math.hypot(puck.vx, puck.vy);
    for (const [px, py] of [[CX - GOAL, 0], [CX + GOAL, 0], [CX - GOAL, H], [CX + GOAL, H]]) {
      const dx = puck.x - px, dy = puck.y - py, d = Math.hypot(dx, dy);
      if (d < R + POST && d > 0.001) { puck.x = px + (dx / d) * (R + POST); puck.y = py + (dy / d) * (R + POST); bounceOff(dx / d, dy / d, REST, sp); }
    }
    if (puck.x < R) { puck.x = R; bounceOff(1, 0, REST, sp); } else if (puck.x > W - R) { puck.x = W - R; bounceOff(-1, 0, REST, sp); }
    const mouth = Math.abs(puck.x - CX) < GOAL;
    if (puck.y < R && !mouth) { puck.y = R; bounceOff(0, 1, REST, sp); } else if (puck.y > H - R && !mouth) { puck.y = H - R; bounceOff(0, -1, REST, sp); }
    if (puck.y < -R * 0.4) scored(0); else if (puck.y > H + R * 0.4) scored(1);
  }
  function toScreen(x, y) { return [ox + x * S, oy + y * S]; }
  function scored(i) {
    score[i]++; lastScorer = i; state = "goal"; stateT = 0; puck.vx = puck.vy = 0; trail = [];
    const [sx, sy] = toScreen(CX, i === 0 ? 0 : H);
    sfx.goal(); buzz([30, 40, 60]); shake = 1; flash = 1; burst(sx, sy, 40); confetti(30, sx, sy, 50, 260);
    showToast("GOAL! ♡");
    if (score[i] >= target) { win(i); }
  }
  function win(i) {
    state = "won"; stateT = 0; celebrateT = 0; buzz([80, 60, 80, 60, 200]);
    if (online?.authoritative && !onlineWon) { onlineWon = true; online.onWin?.({ winnerIndex: i, scores: [...score] }); }
    setTimeout(() => { sfx.fanfare(); }, 350);
    for (let k = 0; k < 4; k++) setTimeout(() => { if (state === "won") launch(); }, 250 + k * 260);
    confetti(120, vw / 2, -10, vw / 2);
    winTimer = setTimeout(() => {
      $('[data-w="title"]').textContent = `${names[i]} wins!`;
      $('[data-w="sub"]').textContent = `${names[0]} ${score[0]} – ${score[1]} ${names[1]} · Super game ♡`;
      panel("win").hidden = false; sfx.click();
    }, 1100);
  }
  function serve() {
    const side = lastScorer === 0 ? 1 : 0; // conceding player's half
    puck.x = CX; puck.y = side === 1 ? H * 0.3 : H * 0.7; puck.vx = puck.vy = 0; state = "playing"; acc = 0;
  }
  function showToast(t) { toastEl.textContent = t; toastEl.classList.remove("ah-pop"); void toastEl.offsetWidth; toastEl.classList.add("ah-pop"); }
  function startMatch() {
    ["menu", "pause", "win"].forEach((n) => (panel(n).hidden = true));
    clearTimeout(winTimer); score = [0, 0]; trail = []; parts.length = 0; rockets.length = 0;
    pads.forEach((p, i) => { p.x = p.tx = CX; p.y = p.ty = i ? H * 0.15 : H * 0.85; p.vx = p.vy = 0; });
    puck.x = CX; puck.y = Math.random() < 0.5 ? H * 0.3 : H * 0.7; puck.vx = puck.vy = 0;
    state = "countdown"; stateT = 0; cdStep = -1; acc = 0;
  }

  function onlineSnapshot() {
    return {
      at: Date.now(), state, prevState, stateT, target, score: [...score], lastScorer,
      puck: { x: puck.x, y: puck.y, vx: puck.vx, vy: puck.vy },
      pads: pads.map(({ x, y, tx, ty, vx, vy, pulse }) => ({ x, y, tx, ty, vx, vy, pulse })),
      trail: trail.slice(-12), shake, flash
    };
  }
  function syncPanels(nextState) {
    panel("menu").hidden = nextState !== "menu";
    panel("pause").hidden = nextState !== "paused";
    if (nextState !== "won") panel("win").hidden = true;
  }
  function applyOnlineSnapshot(snapshot) {
    if (!snapshot || online?.authoritative) return;
    const oldScore = [...score], oldState = state;
    target = snapshot.target || target;
    score = Array.isArray(snapshot.score) ? [...snapshot.score] : score;
    lastScorer = Number.isInteger(snapshot.lastScorer) ? snapshot.lastScorer : lastScorer;
    if (snapshot.puck) Object.assign(puck, snapshot.puck);
    if (Array.isArray(snapshot.pads)) snapshot.pads.forEach((pad, index) => { if (pads[index] && pad) Object.assign(pads[index], pad); });
    if (Array.isArray(snapshot.trail)) trail = snapshot.trail;
    if (Number.isFinite(snapshot.shake)) shake = snapshot.shake;
    if (Number.isFinite(snapshot.flash)) flash = snapshot.flash;
    if (score.some((value, index) => value > oldScore[index])) {
      const [sx, sy] = toScreen(CX, lastScorer === 0 ? 0 : H);
      sfx.goal(); shake = 1; flash = 1; burst(sx, sy, 40); confetti(30, sx, sy, 50, 260); showToast("GOAL! ♡");
    }
    prevState = snapshot.prevState || prevState;
    stateT = Number.isFinite(snapshot.stateT) ? snapshot.stateT : 0;
    if (snapshot.state === "won" && oldState !== "won") {
      onlineWon = true;
      win(lastScorer);
    } else {
      state = snapshot.state || state;
      syncPanels(state);
      if (state === "countdown") {
        const s = Math.floor(stateT / 0.8);
        if (s !== cdStep) {
          cdStep = s;
          if (s <= 2) { countEl.textContent = 3 - s; sfx.beep(false); }
          else if (s === 3) { countEl.textContent = "GO!"; sfx.beep(true); sfx.whistle(); }
          countEl.classList.remove("ah-pop"); void countEl.offsetWidth; countEl.classList.add("ah-pop");
        }
      }
    }
    last = performance.now();
  }

  function applyRemoteInput(input) {
    if (!online?.authoritative || !input || !Number.isFinite(input.x) || !Number.isFinite(input.y) ||
        !Number.isInteger(input.seq) || input.seq <= lastOnlineInput) return;
    lastOnlineInput = input.seq;
    setTarget(pads[1], input.x, input.y);
  }
  function applyRemoteAction(message) {
    if (!online?.authoritative || !message || !Number.isInteger(message.seq) || message.seq <= lastOnlineActionSeq) return;
    lastOnlineActionSeq = message.seq;
    if (message.action === "pause") pause();
    else if (message.action === "resume") resume();
    else if (message.action === "menu") toMenu();
    else if (message.action === "again") online.onAgain?.();
    else if (message.action === "target" && [3, 5, 7].includes(message.target)) target = message.target;
  }
  function sendOnlineInput(p) {
    if (!online || online.authoritative || p.idx !== online.playerIndex) return;
    const now = performance.now();
    if (now - lastOnlineInputAt < 40) return;
    lastOnlineInputAt = now;
    online.sendInput?.({ x: p.tx, y: p.ty, seq: ++onlineInputSeq });
  }
  function sendOnlineAction(action, extra = {}) { online?.sendAction?.({ action, ...extra, seq: ++onlineActionSeq }); }

  function updateCountdown() {
    const s = Math.floor(stateT / 0.8);
    if (s !== cdStep) { cdStep = s;
      if (s <= 2) { countEl.textContent = 3 - s; sfx.beep(false); } else if (s === 3) { countEl.textContent = "GO!"; sfx.beep(true); sfx.whistle(); } else { state = "playing"; stateT = 0; acc = 0; return; }
      countEl.classList.remove("ah-pop"); void countEl.offsetWidth; countEl.classList.add("ah-pop"); }
  }
  function pause() { if (state !== "playing" && state !== "countdown") return; prevState = state; state = "paused"; panel("pause").hidden = false; }
  function resume() { panel("pause").hidden = true; state = prevState; last = performance.now(); }
  function toMenu() { clearTimeout(winTimer); ["pause", "win"].forEach((n) => (panel(n).hidden = true)); panel("menu").hidden = false; state = "menu"; parts.length = 0; rockets.length = 0; }
  function exit() { closeAirHockey(); opts.onExit?.(); }

  // ───────── input (multi-touch: one finger per player) ─────────
  const pos = (e) => { const r = root.getBoundingClientRect(); return [(e.clientX - r.left - ox) / S, (e.clientY - r.top - oy) / S]; };
  boardCv.addEventListener("pointerdown", (e) => {
    audio(); if (state === "menu" || state === "paused" || state === "won") return;
    const [x, y] = pos(e); const p = pads[online ? online.playerIndex : mode === "ai" ? 0 : y < CY ? 1 : 0];
    if (p.pointer !== null) return; p.pointer = e.pointerId; try { boardCv.setPointerCapture(e.pointerId); } catch {} setTarget(p, x, y); sendOnlineInput(p);
  });
  boardCv.addEventListener("pointermove", (e) => { const p = pads.find((q) => q.pointer === e.pointerId); if (!p) return; const [x, y] = pos(e); setTarget(p, x, y); sendOnlineInput(p); });
  const release = (e) => pads.forEach((p) => { if (p.pointer === e.pointerId) p.pointer = null; });
  boardCv.addEventListener("pointerup", release); boardCv.addEventListener("pointercancel", release);
  boardCv.addEventListener("contextmenu", (e) => e.preventDefault());

  // ───────── UI wiring ─────────
  const soundBtn = $('[data-a="sound"]'); const syncSound = () => (soundBtn.textContent = muted ? "🔇" : "🔊"); syncSound();
  host.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return; audio(); sfx.click();
    if (b.dataset.g) { target = +b.dataset.g; if (online && !online.authoritative) sendOnlineAction("target", { target }); host.querySelectorAll(".ah-chip").forEach((c) => c.classList.toggle("on", c === b)); return; }
    if (b.dataset.mode) { if (online) { if (online.authoritative) online.onAgain?.(); else sendOnlineAction("again"); } else { mode = b.dataset.mode; startMatch(); } return; }
    switch (b.dataset.a) {
      case "exit": exit(); break;
      case "pause": if (online && !online.authoritative) sendOnlineAction("pause"); else pause(); break;
      case "resume": if (online && !online.authoritative) sendOnlineAction("resume"); else resume(); break;
      case "menu": if (online && !online.authoritative) sendOnlineAction("menu"); else toMenu(); break;
      case "again": if (online) { if (online.authoritative) online.onAgain?.(); else sendOnlineAction("again"); } else startMatch(); break;
      case "sound": muted = !muted; try { localStorage.setItem("olw-ah-muted", muted ? "1" : "0"); } catch {} syncSound(); break;
    }
  });
  const onVis = () => { if (document.hidden) { if (online && !online.authoritative) sendOnlineAction("pause"); else pause(); } };
  document.addEventListener("visibilitychange", onVis);
  if (online?.subscribeState) { const unsubscribe = online.subscribeState(applyOnlineSnapshot); if (typeof unsubscribe === "function") onlineUnsubs.push(unsubscribe); }
  if (online?.authoritative && online.subscribeInput) { const unsubscribe = online.subscribeInput(applyRemoteInput); if (typeof unsubscribe === "function") onlineUnsubs.push(unsubscribe); }
  if (online?.authoritative && online.subscribeAction) { const unsubscribe = online.subscribeAction(applyRemoteAction); if (typeof unsubscribe === "function") onlineUnsubs.push(unsubscribe); }
  if (online?.autoStart) { mode = "2p"; startMatch(); }
  let ro = null; if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(root); } else window.addEventListener("resize", resize);

  // ───────── main loop (fixed 120 Hz physics, rAF render) ─────────
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; stateT += dt;
    if (!online || online.authoritative) {
      if (state === "countdown") { updateCountdown(); movePads(dt); }
      else if (state === "playing") { acc += dt; while (acc >= STEP && state === "playing") { step(STEP); acc -= STEP; } trail.push({ x: puck.x, y: puck.y }); if (trail.length > 12) trail.shift(); }
      else if (state === "goal") { movePads(dt); if (stateT > 1.15) serve(); }
      else if (state === "won" || state === "menu") movePads(dt);
    } else if (state !== "paused") movePads(dt);
    pads.forEach((p) => (p.pulse = Math.max(0, p.pulse - dt * 3.2))); shake = Math.max(0, shake - dt * 3);
    if (state !== "paused") updateFX(dt);
    if (online?.authoritative && now - lastOnlineSnapshotAt >= 50) { lastOnlineSnapshotAt = now; online.publishState?.(onlineSnapshot()); }
    draw(); drawFX();
  }
  resize(); raf = requestAnimationFrame(frame);

  closeCurrent = () => {
    closeCurrent = null; cancelAnimationFrame(raf); clearTimeout(winTimer);
    onlineUnsubs.splice(0).forEach((unsubscribe) => { try { unsubscribe(); } catch {} });
    document.removeEventListener("visibilitychange", onVis); ro ? ro.disconnect() : window.removeEventListener("resize", resize);
    document.body.style.overflow = prevOverflow; host.remove(); try { ac?.close(); } catch {}
  };
  return closeAirHockey;
}
