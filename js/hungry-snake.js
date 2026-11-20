/* Hungry Snake – adapted from the supplied Box Snake Duel game. */
export function openHungrySnake(opts = {}) {
const host = document.createElement("div");
host.className = "hungry-snake-host";
const root = host.attachShadow({ mode: "open" });
document.body.appendChild(host);
const online = opts.online || null;
const playerIndex = online?.playerIndex ?? 0;
let disposed = false;
const N = 22, BOXES = 48, TICK = 140;
const DIR = { u: [0, -1], l: [-1, 0], r: [1, 0], d: [0, 1] };
const DL = Object.values(DIR);

/* ---------- CSS ---------- */
const css = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
:host{position:fixed;inset:0;z-index:1400;display:block;overflow:hidden;overscroll-behavior:none;touch-action:none;
 font-family:'Noto Sans Kannada',system-ui,sans-serif;background:linear-gradient(160deg,#bfe9ff,#d9f7c3 60%,#fff3c4);color:#25402a}
.screen{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
 padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));text-align:center}
.hidden{display:none!important}
h1{font-size:clamp(34px,9vw,56px);margin:0;color:#2f7d32;text-shadow:0 3px 0 #fff,0 6px 12px #0002}
.sub{margin:0 0 8px;font-size:16px;max-width:360px;line-height:1.6}
.help{font-size:13px;opacity:.75;max-width:360px;line-height:1.6}
.snk{font-size:78px;animation:wig 1.6s ease-in-out infinite}
@keyframes wig{0%,100%{transform:rotate(-12deg) scale(1)}50%{transform:rotate(12deg) scale(1.12)}}
.btn{border:0;border-radius:22px;padding:15px 26px;font:700 19px inherit;font-family:inherit;color:#fff;cursor:pointer;min-width:260px;
 box-shadow:0 6px 0 #0003,0 10px 18px #0002;transition:transform .08s,box-shadow .08s}
.btn:active{transform:translateY(5px);box-shadow:0 1px 0 #0003}
.btn.g{background:linear-gradient(#7ed957,#4aa83a)}.btn.o{background:linear-gradient(#ffc24d,#f08a1c)}
.btn.s{min-width:0;padding:8px 14px;font-size:20px;background:linear-gradient(#8fb8ff,#5a8ae0);border-radius:16px}
.row{display:flex;gap:12px}
#game{display:grid;gap:8px;grid-template-columns:1fr 1fr;align-content:center;justify-items:center;
 grid-template-areas:"hud hud" "board board" "pv pv" "p0 p1"}
#hud{grid-area:hud;display:flex;align-items:center;gap:8px;width:min(100%,520px);justify-content:space-between}
.pill{padding:8px 14px;border-radius:18px;font-weight:700;font-size:15px;color:#fff;box-shadow:0 4px 0 #0003;transition:transform .2s}
.pill.g{background:#4aa83a}.pill.o{background:#f0961c}.pill.pop{transform:scale(1.25)}
#board{grid-area:board;position:relative;width:min(100%,max(220px,calc(100dvh - 400px)));aspect-ratio:1;border:6px solid #3b8d3a;border-radius:22px;
 overflow:hidden;box-shadow:0 10px 30px #0003,inset 0 0 0 3px #fff8;background:#d6ecbc}
#cv{width:100%;height:100%;display:block}
#banner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:clamp(26px,8vw,44px);font-weight:800;
 color:#fff;text-shadow:0 3px 0 #0006,0 0 18px #0008;pointer-events:none;opacity:0;text-align:center;padding:10px}
#banner.show{animation:pop .5s cubic-bezier(.2,1.6,.4,1) forwards}
@keyframes pop{from{transform:scale(.2);opacity:0}to{transform:scale(1);opacity:1}}
#pv{grid-area:pv;width:min(100%,520px);background:#fffc;border-radius:18px;padding:8px 12px;box-shadow:0 4px 14px #0002;display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:700;text-align:left}
#pv .h{display:flex;justify-content:space-between;align-items:center}
.loose,.strip{display:flex;flex-wrap:wrap;gap:3px;overflow:hidden}
.loose{max-height:36px}.strip{max-height:18px}
.loose i,.strip i{width:12px;height:12px;border-radius:3px;display:block;box-shadow:inset 0 0 0 1px #0002}
.k0{background:#6cc04a}.k1{background:#f3e6c4}.m0{background:#6cc04a}.m1{background:#f3e6c4}.n0{background:#ffb74d}.n1{background:#fff1cf}
.tug{display:flex;height:10px;border-radius:6px;overflow:hidden;background:#ddd}
.tug i{display:block;height:100%;transition:width .3s}#t0{background:#4aa83a}#t1{background:#f0961c}
.pad{display:grid;grid-template-columns:repeat(3,58px);grid-template-rows:repeat(2,58px);gap:6px;grid-template-areas:". u ." "l d r"}
#pad0{grid-area:p0}#pad1{grid-area:p1}
.pad button{border:0;border-radius:18px;font-size:22px;color:#fff;box-shadow:0 5px 0 #0003;cursor:pointer}
.pad.local-pad{grid-column:1/-1}
#game.online .pad:not(.local-pad){display:none}
.pad button:active{transform:translateY(4px);box-shadow:0 1px 0 #0003}
.pad .u{grid-area:u}.pad .l{grid-area:l}.pad .d{grid-area:d}.pad .r{grid-area:r}
#pad0 button{background:#4aa83a}#pad1 button{background:#f0961c}
#game.cpu #pad1{display:none}#game.cpu #pad0{grid-column:1/-1}
@media (orientation:landscape) and (max-height:540px){
 #game{grid-template-columns:auto auto 190px auto;grid-template-areas:"hud hud hud hud" "p0 board pv p1";align-items:center}
 #board{width:min(calc(100vw - 600px),calc(100dvh - 80px))}#pv{width:100%}
 #game.online .pad.local-pad{grid-column:auto}
 #game.cpu #pad0{grid-column:auto}}
@media (hover:hover) and (pointer:fine) and (min-width:760px){
 #game{grid-template-columns:auto 270px;grid-template-areas:"hud hud" "board pv";align-items:start;gap:14px}
 #board{width:min(calc(100vw - 360px),calc(100dvh - 110px))}#hud{width:100%}
 #pv{width:270px;font-size:15px;padding:14px}.loose,.strip{max-height:none}.loose i,.strip i{width:15px;height:15px}.pad{display:none}}
#end{background:#0007;z-index:20}
.card{background:#fffdf0;border-radius:30px;padding:26px 30px;box-shadow:0 14px 40px #0006;display:flex;flex-direction:column;gap:12px;align-items:center;
 animation:pop .6s cubic-bezier(.2,1.6,.4,1) both;max-width:92vw}
#trophy{font-size:80px;animation:wig 1.2s infinite}
.card h2{margin:0;font-size:clamp(26px,7vw,36px);color:#e0701a}.card p{margin:0;font-size:19px;font-weight:600}
#fx{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:30}
`;
const st = document.createElement('style'); st.textContent = css; root.appendChild(st);

/* ---------- HTML ---------- */
const pad = p => ['u|▲', 'l|◀', 'd|▼', 'r|▶'].map(x => { const [d, s] = x.split('|'); return `<button class="${d}" data-p="${p}" data-d="${d}">${s}</button>`; }).join('');
const markup = document.createElement('template');
markup.innerHTML = `
<div id="menu" class="screen">
 <div class="snk">🐍</div><h1>ಹಾವು ಹಣಾಹಣಿ</h1>
 <p class="sub">ಬೋರ್ಡ್‌ನಲ್ಲಿರುವ ಬಾಕ್ಸ್‌ಗಳನ್ನು ತಿನ್ನಿ!<br>ನಿಮ್ಮ ಅಥವಾ ಎದುರಾಳಿಯ ಬಾಲಕ್ಕೆ ತಾಗಿದರೆ ಬಾಲದ ಭಾಗಗಳು ಕಳಚಿ ಬಾಕ್ಸ್‌ಗಳಾಗಿ ಬೀಳುತ್ತವೆ. ಅವನ್ನು ನಂತರ ಯಾರಾದರೂ ತಿನ್ನಬಹುದು.<br>ಕೊನೆಗೆ ಹೆಚ್ಚು ಬಾಕ್ಸ್ ಇರುವವರೇ ವಿಜೇತ 🏆</p>
 <button class="btn g" data-m="pvp">👥 ಇಬ್ಬರು ಆಡಿ</button>
 <button class="btn o" data-m="cpu">🤖 ಕಂಪ್ಯೂಟರ್ ಜೊತೆ ಆಡಿ</button>
 <div class="row"><button class="btn s" id="snd">🔊</button><button class="btn s" id="fs">⛶</button></div>
 <p class="help">ಆಟಗಾರ 1: W A S D &nbsp;|&nbsp; ಆಟಗಾರ 2: ← ↑ → ↓<br>ಮೊಬೈಲ್: ಬಟನ್ ಒತ್ತಿ (ಕಂಪ್ಯೂಟರ್ ಮೋಡ್‌ನಲ್ಲಿ ಸ್ವೈಪ್ ಕೂಡ)<br>ಗೋಡೆಯ ಅಂಚಿಗೆ ತಾಗಿದರೆ ಹಾವು ನಿಲ್ಲುತ್ತದೆ. ನಿಮ್ಮದೇ ಬಾಲಕ್ಕೆ ತಾಗಿದರೆ ಬಾಲದ ಭಾಗ ಕಳಚುತ್ತದೆ; ಬಿದ್ದ ಬಾಕ್ಸ್‌ಗಳನ್ನು ನಂತರ ಇಬ್ಬರೂ ತಿನ್ನಬಹುದು.</p>
</div>
<div id="game" class="screen hidden">
 <div id="hud"><button id="home" class="btn s">🏠</button><div class="pill g" id="s0"></div><div class="pill o" id="s1"></div></div>
 <div id="board"><canvas id="cv"></canvas><div id="banner"></div></div>
 <div id="pv">
  <div class="h"><span>👀 ಪ್ರಿವ್ಯೂ</span><span id="left"></span></div>
  <div class="loose" id="loose"></div>
  <div class="h"><span id="n0"></span></div><div class="strip" id="st0"></div>
  <div class="h"><span id="n1"></span></div><div class="strip" id="st1"></div>
  <div class="tug"><i id="t0"></i><i id="t1"></i></div>
 </div>
 <div class="pad" id="pad0">${pad(0)}</div><div class="pad" id="pad1">${pad(1)}</div>
</div>
<div id="end" class="screen hidden"><div class="card"><div id="trophy">🏆</div><h2 id="et"></h2><p id="es"></p>
 <button class="btn g" id="again">🔁 ಮತ್ತೆ ಆಡಿ</button><button class="btn o" id="tomenu">🏠 ಮೆನು</button></div></div>
<canvas id="fx"></canvas>`;
root.append(markup.content);
const $ = id => root.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), fx = $('fx'), fc = fx.getContext('2d'), B = $('banner');

/* ---------- ಸೌಂಡ್ ---------- */
let AC, mute = false;
function snd(f, d = .1, type = 'sine', v = .12, slide = 0, delay = 0) {
  if (mute) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d);
  } catch (e) {}
}
const buzz = ms => navigator.vibrate && navigator.vibrate(ms);
const sEat = () => { snd(520, .1, 'square', .06, 2); snd(780, .1, 'square', .05, 1.5, .06); };
const sBite = () => { snd(200, .25, 'sawtooth', .13, .4); snd(700, .15, 'square', .07, 2, .1); snd(1000, .15, 'square', .06, 1.5, .2); };
const sWin = () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => snd(f, .22, 'triangle', .13, 0, i * .13));

/* ---------- ಪಟಾಕಿ / ಕಾನ್ಫೆಟ್ಟಿ / ಕಣಗಳು ---------- */
let P = [], FW = null, fallingBoxes = [];
function burst(x, y, col, n = 20, sp = 4, g = .08, life = 45) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = Math.random() * sp + .5;
    P.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g, l: life + Math.random() * 20, m: life + 20, c: col, r: 2 + Math.random() * 3 });
  }
}
function confetti(n = 14) {
  for (let i = 0; i < n; i++) P.push({ x: Math.random() * innerWidth, y: -10, vx: Math.random() * 2 - 1, vy: 2 + Math.random() * 3, g: .02,
    l: 200, m: 200, c: `hsl(${Math.random() * 360},90%,60%)`, r: 5 + Math.random() * 4, rect: 1, rot: Math.random() * 6 });
}
function fireworks(on) {
  clearInterval(FW); FW = null;
  if (!on) return;
  const shoot = () => { burst(innerWidth * (.15 + Math.random() * .7), innerHeight * (.12 + Math.random() * .4), `hsl(${Math.random() * 360},100%,60%)`, 60, 6, .07, 55);
    snd(200 + Math.random() * 300, .35, 'sawtooth', .05, .3); };
  shoot(); FW = setInterval(() => { shoot(); confetti(); }, 380);
}
function fxLoop() {
  if (!P.length) return;
  fc.clearRect(0, 0, innerWidth, innerHeight);
  P = P.filter(p => p.l > 0);
  for (const p of P) {
    p.x += p.vx; p.y += p.vy; p.vy += p.g; p.l--;
    fc.globalAlpha = Math.max(0, Math.min(1, p.l / p.m * 1.5)); fc.fillStyle = p.c;
    if (p.rect) { p.rot += .15; p.vx += Math.sin(p.rot) * .05; fc.save(); fc.translate(p.x, p.y); fc.rotate(p.rot); fc.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); fc.restore(); }
    else { fc.beginPath(); fc.arc(p.x, p.y, p.r, 0, 6.283); fc.fill(); }
  }
  fc.globalAlpha = 1;
}

/* ---------- ಆಟದ ಸ್ಥಿತಿ ---------- */
const COL = [{ c1: '#6cc04a', c2: '#f3e6c4', h: '#7fd05a' }, { c1: '#ffb74d', c2: '#fff1cf', h: '#ffd27a' }];
const BC = ['#6cc04a', '#f3e6c4'];
let mode = 'pvp', S = null, boxes = new Map(), state = 'idle', lastTick = 0, dpr = 1, bt, timers = [], cache = [-1, -1, -1], remoteBoxesSeen = false, boardBg = null;
let countStartedAt = 0, countdownStep = -1, raf = 0, inputSeq = 0, lastRemoteInput = 0;
let resultShown = false;
const N0 = () => opts.names?.[0] || 'ಆಟಗಾರ 1';
const N1 = () => opts.names?.[1] || 'ಆಟಗಾರ 2';
const len = s => s.b.length + s.grow;
const boxCount = () => [...boxes.values()].reduce((total, box) => total + (box.count || 1), 0);
function showFallingBox(box, startedAt = performance.now()) {
  fallingBoxes.push({ ...box, startedAt });
  if (fallingBoxes.length > 240) fallingBoxes.splice(0, fallingBoxes.length - 240);
}
const later = (f, ms) => timers.push(setTimeout(f, ms));
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

function banner(t, ms) {
  B.textContent = t; B.classList.remove('show'); void B.offsetWidth; B.classList.add('show');
  clearTimeout(bt); if (ms) bt = setTimeout(() => B.classList.remove('show'), ms);
}
function hud(pulse) {
  const L = S.map(len);
  $('s0').textContent = `🟢 ${N0()} · ${L[0]}`; $('s1').textContent = `🟠 ${N1()} · ${L[1]}`;
  $('n0').textContent = `🟢 ${N0()}: ${L[0]} ಬಾಕ್ಸ್`; $('n1').textContent = `🟠 ${N1()}: ${L[1]} ಬಾಕ್ಸ್`;
  const remainingBoxes = boxCount();
  const looseSignature = [...boxes.values()].map(b => `${b.x},${b.y}:${b.k}:${b.count || 1}`).sort().join('|');
  $('left').textContent = `ಉಳಿದ: ${remainingBoxes}`;
  $('t0').style.width = (L[0] / (L[0] + L[1]) * 100) + '%'; $('t1').style.width = (L[1] / (L[0] + L[1]) * 100) + '%';
  if (cache[2] !== looseSignature) { cache[2] = looseSignature; $('loose').innerHTML = [...boxes.values()].flatMap(b => Array.from({ length: b.count || 1 }, () => `<i class="k${b.k}"></i>`)).join(''); }
  [0, 1].forEach(i => { if (cache[i] !== L[i]) { cache[i] = L[i];
    $('st' + i).innerHTML = Array.from({ length: Math.min(L[i], 80) }, (_, j) => `<i class="${i ? 'n' : 'm'}${j % 2}"></i>`).join(''); } });
  if (pulse !== undefined) { const e = $('s' + pulse); e.classList.add('pop'); setTimeout(() => e.classList.remove('pop'), 350); }
}
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = $('board').clientWidth, boardSize = Math.max(1, Math.round(w * dpr));
  if (cv.width !== boardSize || cv.height !== boardSize || !boardBg) {
    cv.width = cv.height = boardSize;
    boardBg = document.createElement('canvas'); boardBg.width = boardBg.height = boardSize;
    const bg = boardBg.getContext('2d'), cell = boardSize / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      bg.fillStyle = (x + y) % 2 ? '#e4f3cf' : '#d6ecbc';
      bg.fillRect(x * cell, y * cell, cell + 1, cell + 1);
    }
  }
  const fxWidth = Math.max(1, Math.round(innerWidth * dpr)), fxHeight = Math.max(1, Math.round(innerHeight * dpr));
  if (fx.width !== fxWidth) fx.width = fxWidth;
  if (fx.height !== fxHeight) fx.height = fxHeight;
  fc.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);

function mk(x, y, d) { const b = []; for (let i = 0; i < 3; i++) b.push([x - d[0] * i, y - d[1] * i]); return { b, prev: b.slice(), dir: d, q: [], grow: 0, t: null, blk: false }; }
function startGame(m) {
  mode = m; clearTimers(); fireworks(false); P = []; fallingBoxes = []; remoteBoxesSeen = false; cache = [-1, -1, -1];
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('game').classList.remove('hidden');
  $('game').classList.toggle('cpu', m === 'cpu'); $('game').classList.toggle('online', Boolean(online));
  $('pad0').classList.toggle('local-pad', !online || playerIndex === 0);
  $('pad1').classList.toggle('local-pad', !online || playerIndex === 1);
  resize(); resultShown = false;
  S = [mk(4, 5, DIR.r), mk(N - 5, N - 6, DIR.l)];
  boxes = new Map();
  while (boxes.size < BOXES) {
    const x = Math.random() * N | 0, y = Math.random() * N | 0, k = x + ',' + y;
    if (!boxes.has(k) && y !== 5 && y !== N - 6) boxes.set(k, { x, y, k: Math.random() < .5 ? 0 : 1 });
  }
  state = 'count'; countStartedAt = Date.now(); countdownStep = -1; lastTick = performance.now(); hud();
  publishSnapshot();
}
function snapshot() {
  return {
    state, countStartedAt,
    snakes: S?.map(s => ({ b: s.b, prev: s.prev, dir: s.dir, q: s.q, grow: s.grow })) || [],
    boxes: [...boxes.values()]
  };
}
function publishSnapshot() {
  if (online?.authoritative && S) online.publishState?.(snapshot());
}
function applySnapshot(value) {
  if (!online || online.authoritative || !value || !Array.isArray(value.snakes) || value.snakes.length !== 2) return;
  if (value.state === 'count' && state !== 'count') { remoteBoxesSeen = false; fallingBoxes = []; }
  S = value.snakes.map(s => ({
    b: Array.isArray(s.b) ? s.b.map(c => [...c]) : [],
    prev: Array.isArray(s.prev) ? s.prev.map(c => [...c]) : [],
    dir: Array.isArray(s.dir) ? [...s.dir] : DIR.r,
    q: Array.isArray(s.q) ? s.q.map(d => [...d]) : [],
    grow: Number(s.grow) || 0, t: null, blk: false
  }));
  const nextBoxes = new Map((Array.isArray(value.boxes) ? value.boxes : []).map(box => [`${box.x},${box.y}`, box]));
  if (remoteBoxesSeen) {
    const now = performance.now();
    nextBoxes.forEach((box, key) => {
      const previousCount = boxes.get(key)?.count || (boxes.has(key) ? 1 : 0);
      const added = Math.max(0, (box.count || 1) - previousCount);
      for (let i = 0; i < added; i++) showFallingBox(box, now);
    });
  }
  remoteBoxesSeen = true;
  boxes = nextBoxes;
  const oldState = state;
  state = value.state;
  countStartedAt = Number(value.countStartedAt) || 0;
  lastTick = performance.now();
  const gameWasHidden = $('game').classList.contains('hidden');
  $('menu').classList.add('hidden'); $('game').classList.remove('hidden'); $('game').classList.add('online');
  $('pad0').classList.toggle('local-pad', playerIndex === 0);
  $('pad1').classList.toggle('local-pad', playerIndex === 1);
  if (gameWasHidden) resize();
  if (oldState !== state) { cache = [-1, -1, -1]; resultShown = false; }
  hud();
  if (oldState === 'count' && state === 'play') { banner('ಹೋಗಿ! 🐍', 600); snd(880, .3, 'square', .08); }
  if (state === 'over' && !resultShown) {
    resultShown = true;
    const lengths = S.map(len), winner = lengths[0] === lengths[1] ? -1 : lengths[0] > lengths[1] ? 0 : 1;
    endMatch(winner, lengths, false);
  }
}
function toMenu() {
  if (online) { opts.onExit?.(); return; }
  clearTimers(); state = 'idle'; fireworks(false); P = []; $('game').classList.add('hidden'); $('end').classList.add('hidden'); $('menu').classList.remove('hidden');
}

/* ---------- ಇನ್‌ಪುಟ್ ---------- */
function setDir(p, d) {
  if (!S || (state !== 'play' && state !== 'count')) return;
  const s = S[p], last = s.q.length ? s.q[s.q.length - 1] : s.dir;
  if ((d[0] === -last[0] && d[1] === -last[1]) || (d[0] === last[0] && d[1] === last[1])) return;
  if (s.q.length < 2) s.q.push(d);
}
function requestDir(p, d) {
  if (!online) { setDir(p, d); return; }
  if (online.authoritative) {
    if (p === playerIndex) setDir(p, d);
    return;
  }
  if (p !== playerIndex) return;
  online.sendInput?.({ direction: Object.keys(DIR).find(key => DIR[key][0] === d[0] && DIR[key][1] === d[1]), seq: ++inputSeq });
}
const KM = { KeyW: [0, 'u'], KeyA: [0, 'l'], KeyS: [0, 'd'], KeyD: [0, 'r'], ArrowUp: [1, 'u'], ArrowLeft: [1, 'l'], ArrowDown: [1, 'd'], ArrowRight: [1, 'r'] };
const onKeyDown = e => { const k = KM[e.code]; if (!k || disposed) return; e.preventDefault(); const p = online ? playerIndex : mode === 'cpu' ? 0 : k[0]; requestDir(p, DIR[k[1]]); };
document.addEventListener('keydown', onKeyDown);
root.querySelectorAll('.pad button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); requestDir(+b.dataset.p, DIR[b.dataset.d]); buzz(8); }));
let sw = null;
$('board').addEventListener('pointerdown', e => { sw = [e.clientX, e.clientY]; });
$('board').addEventListener('pointerup', e => {
  if (!sw || mode !== 'cpu') return;
  const dx = e.clientX - sw[0], dy = e.clientY - sw[1]; sw = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  requestDir(0, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIR.r : DIR.l) : (dy > 0 ? DIR.d : DIR.u));
});

/* ---------- ಕಂಪ್ಯೂಟರ್ AI ---------- */
function ai(s) {
  const o = S[0], h = s.b[0], oh = o.b[0], own = new Set(s.b.map(c => c[0] + ',' + c[1]));
  const bodyIdx = new Map(); o.b.forEach((c, j) => bodyIdx.set(c[0] + ',' + c[1], j));
  const dist = (sx, sy) => {
    const seen = new Set([sx + ',' + sy]), q = [[sx, sy, 0]];
    while (q.length) {
      const [x, y, d] = q.shift(); if (boxes.has(x + ',' + y)) return d; if (d > 40) break;
      for (const dd of DL) { const nx = x + dd[0], ny = y + dd[1], k = nx + ',' + ny;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
        if (seen.has(k) || own.has(k) || (nx === oh[0] && ny === oh[1])) continue; seen.add(k); q.push([nx, ny, d + 1]); }
    }
    return 99;
  };
  let best = null, bs = -1e9;
  for (const d of DL) {
    if (d[0] === -s.dir[0] && d[1] === -s.dir[1]) continue;
    const nx = h[0] + d[0], ny = h[1] + d[1], k = nx + ',' + ny;
    if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
    if (own.has(k) || (nx === oh[0] && ny === oh[1])) continue;
    let sc = -dist(nx, ny); if (boxes.has(k)) sc += 50;
    const j = bodyIdx.get(k); if (j > 0) sc += (o.b.length - j) * 4 + 30;
    sc += Math.random() * 1.5; if (sc > bs) { bs = sc; best = d; }
  }
  s.q = best ? [best] : [];
}

/* ---------- ಒಂದು ಹೆಜ್ಜೆ ---------- */
function screenFx(gx, gy, col, n) {
  const r = cv.getBoundingClientRect(); burst(r.left + (gx + .5) * r.width / N, r.top + (gy + .5) * r.height / N, col, n);
}
function step() {
  if (mode === 'cpu') ai(S[1]);
  S.forEach(s => {
    s.dir = s.q.length ? s.q.shift() : s.dir;
    s.t = [s.b[0][0] + s.dir[0], s.b[0][1] + s.dir[1]];
    s.blk = s.t[0] < 0 || s.t[0] >= N || s.t[1] < 0 || s.t[1] >= N;
  });
  // Head-to-head contact still stops movement. Body contact cuts the tail.
  S.forEach((s, i) => {
    const o = S[1 - i], [tx, ty] = s.t;
    if (s.blk) return;
    if ((tx === o.b[0][0] && ty === o.b[0][1]) ||
        (o.t[0] === s.b[0][0] && o.t[1] === s.b[0][1]) ||
        (tx === o.t[0] && ty === o.t[1])) s.blk = true;
  });

  // Record every cut before moving either snake, so simultaneous contact is
  // resolved consistently on the authoritative game state.
  const cutAt = [-1, -1];
  const markCut = (snakeIndex, segmentIndex) => {
    if (segmentIndex > 0) cutAt[snakeIndex] = cutAt[snakeIndex] < 0 ? segmentIndex : Math.min(cutAt[snakeIndex], segmentIndex);
  };
  S.forEach((s, i) => {
    if (s.blk) return;
    const o = S[1 - i], [tx, ty] = s.t;
    const ownHit = s.b.findIndex((c, j) => j > 0 && !(s.grow === 0 && j === s.b.length - 1) && c[0] === tx && c[1] === ty);
    if (ownHit > 0) markCut(i, ownHit);
    const otherHit = o.b.findIndex((c, j) => j > 0 && !(o.grow === 0 && !o.blk && j === o.b.length - 1) && c[0] === tx && c[1] === ty);
    if (otherHit > 0) markCut(1 - i, otherHit);
  });

  const dropped = [], cutLengths = [0, 0];
  S.forEach((s, i) => {
    s.prev = s.b.slice();
    if (cutAt[i] > 0) {
      const cut = s.b.splice(cutAt[i]);
      cutLengths[i] = cut.length;
      s.prev = s.prev.slice(0, cutAt[i]);
      cut.forEach((cell, segmentIndex) => dropped.push({ x: cell[0], y: cell[1], k: segmentIndex % 2 }));
    }
  });
  S.forEach(s => { if (!s.blk) { s.b.unshift(s.t); if (s.grow > 0) s.grow--; else s.b.pop(); } });

  let pulse;
  S.forEach((s, i) => {
    if (s.blk) return;
    const [x, y] = s.b[0], k = x + ',' + y;
    if (boxes.has(k)) {
      const b = boxes.get(k);
      if ((b.count || 1) > 1) b.count--; else boxes.delete(k);
      s.grow++; pulse = i; screenFx(x, y, BC[b.k], 16); sEat(); buzz(10);
    }
  });
  // New cut blocks are added after this tick's pickups. If two boxes share a
  // tile, keep them as a stack so none of the cut length is lost.
  dropped.forEach(box => {
    const k = box.x + ',' + box.y, existing = boxes.get(k);
    if (existing) existing.count = (existing.count || 1) + 1;
    else boxes.set(k, { ...box, count: 1 });
    showFallingBox(box);
  });
  cutLengths.forEach((count, i) => {
    if (!count) return;
    pulse = i; const [x, y] = S[i].b[0];
    screenFx(x, y, '#ff5a4a', 28); sBite(); buzz([40, 30, 60]);
    banner(`🐍 ಬಾಲ ಕಳಚಿತು · ${count} ಬಾಕ್ಸ್ ಬಿದ್ದಿವೆ`, 900);
  });
  hud(pulse);
  if (!boxCount()) finish();
}
function finish() {
  state = 'over'; const L = S.map(len);
  const w = L[0] === L[1] ? -1 : L[0] > L[1] ? 0 : 1;
  banner('ಎಲ್ಲಾ ಬಾಕ್ಸ್ ಮುಗಿದವು! 🎬', 1500);
  publishSnapshot();
  if (online?.authoritative) online.onFinish?.({ winnerIndex: w, scores: L });
  later(() => endMatch(w, L), 1700);
}
function endMatch(w, L, notify = true) {
  const human = w < 0 || mode === 'pvp' || w === 0;
  $('trophy').textContent = w < 0 ? '🤝' : human ? '🏆' : '😅';
  $('et').textContent = w < 0 ? 'ಡ್ರಾ!' : human ? '🎉 ಅಭಿನಂದನೆಗಳು! 🎉' : 'ಈ ಬಾರಿ ಕಷ್ಟ!';
  $('es').textContent = w < 0 ? `ಇಬ್ಬರ ಬಳಿಯೂ ${L[0]} ಬಾಕ್ಸ್! 🤝`
    : human ? `${w ? N1() : N0()} ಗೆದ್ದರು! (${L[0]} – ${L[1]}) 🥳` : `ಕಂಪ್ಯೂಟರ್ ಗೆದ್ದಿತು (${L[0]} – ${L[1]}). ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ! 💪`;
  $('end').classList.remove('hidden');
  if (w >= 0 && human) { sWin(); buzz([100, 50, 100, 50, 200]); fireworks(true); } else snd(260, .5, 'triangle', .12, .6);
  if (notify && online?.authoritative) online.onFinish?.({ winnerIndex: w, scores: L });
}

/* ---------- ಚಿತ್ರಣ ---------- */
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, r); ctx.fill(); ctx.stroke(); }
function drawSnake(s, i, t, c) {
  const n = s.b.length, k = COL[i], now = performance.now();
  const pos = s.b.map((cur, j) => {
    const pv = s.prev[j] || cur, f = (Math.abs(cur[0] - pv[0]) > 1 || Math.abs(cur[1] - pv[1]) > 1) ? 1 : t;
    return [(pv[0] + (cur[0] - pv[0]) * f + .5) * c, (pv[1] + (cur[1] - pv[1]) * f + .5) * c];
  });
  ctx.lineWidth = c * .06; ctx.strokeStyle = '#0003';
  for (let j = n - 1; j >= 1; j--) {
    const z = c * (.88 - .2 * Math.min(1, j / 30)); ctx.fillStyle = j % 2 ? k.c1 : k.c2; rr(pos[j][0], pos[j][1], z, z, c * .28);
    ctx.fillStyle = '#fff4'; ctx.beginPath(); ctx.arc(pos[j][0] - z * .15, pos[j][1] - z * .15, z * .16, 0, 6.283); ctx.fill();
  }
  const [hx, hy] = pos[0], [dx, dy] = s.dir, hs = c * 1.12;
  ctx.fillStyle = k.h; rr(hx, hy, hs, hs, c * .4);
  if (Math.sin(now / 130) > .5) {
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = c * .08; ctx.beginPath();
    ctx.moveTo(hx + dx * c * .5, hy + dy * c * .5); ctx.lineTo(hx + dx * c * .85, hy + dy * c * .85); ctx.stroke();
  }
  for (const sd of [-1, 1]) {
    const ex = hx + dx * c * .1 - dy * sd * c * .27, ey = hy + dy * c * .1 + dx * sd * c * .27;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0004'; ctx.lineWidth = c * .04; ctx.beginPath(); ctx.arc(ex, ey, c * .21, 0, 6.283); ctx.fill(); ctx.stroke();
    const px = ex + dx * c * .06, py = ey + dy * c * .06;
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(px, py, c * .12, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px - c * .03, py - c * .04, c * .04, 0, 6.283); ctx.fill();
  }
}
function draw(now, t) {
  const c = cv.width / N; ctx.clearRect(0, 0, cv.width, cv.height);
  if (boardBg) ctx.drawImage(boardBg, 0, 0);
  ctx.lineWidth = c * .05; ctx.strokeStyle = '#0003';
  for (const b of boxes.values()) {
    const z = c * .6 * (1 + .06 * Math.sin(now / 300 + b.x * 3 + b.y * 2)), cx = (b.x + .5) * c, cy = (b.y + .5) * c;
    ctx.fillStyle = BC[b.k]; rr(cx, cy, z, z, c * .16);
    ctx.fillStyle = '#0002'; ctx.beginPath(); ctx.arc(cx, cy, z * .13, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#fff6'; ctx.beginPath(); ctx.arc(cx - z * .25, cy - z * .25, z * .1, 0, 6.283); ctx.fill();
    if ((b.count || 1) > 1) { ctx.fillStyle = '#25402a'; ctx.font = `700 ${c * .28}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.count, cx, cy); }
  }
  fallingBoxes = fallingBoxes.filter(box => now - box.startedAt < 240);
  for (const box of fallingBoxes) {
    const progress = Math.max(0, Math.min(1, (now - box.startedAt) / 240));
    const z = c * .6 * (1 - progress * .18), cx = (box.x + .5) * c, cy = (box.y + .5 - (1 - progress) * .7) * c;
    ctx.save(); ctx.globalAlpha = 1 - progress * .45; ctx.fillStyle = BC[box.k]; rr(cx, cy, z, z, c * .16); ctx.restore();
  }
  S.forEach((s, i) => drawSnake(s, i, t, c));
}
function frame(now) {
  if (state === 'count' && countStartedAt) {
    const index = Math.floor((Date.now() - countStartedAt) / 700);
    if (index !== countdownStep) {
      countdownStep = index;
      if (index < 3) { banner(String(3 - index), 900); snd(440, .12, 'square', .08); }
      else if (index === 3) {
        banner('ಹೋಗಿ! 🐍', 600); snd(880, .3, 'square', .08);
        if (!online || online.authoritative) { state = 'play'; lastTick = now; publishSnapshot(); }
      }
    }
  }
  if (online?.authoritative && state === 'play' && now - lastTick >= TICK) { lastTick = now; step(); publishSnapshot(); }
  if (S && !$('game').classList.contains('hidden')) draw(now, state === 'play' ? Math.min(1, (now - lastTick) / TICK) : 1);
  fxLoop(); raf = requestAnimationFrame(frame);
}
raf = requestAnimationFrame(frame);

/* ---------- ಬಟನ್‌ಗಳು ---------- */
root.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { snd(600, .1, 'square', .08); startGame(b.dataset.m); }));
$('again').onclick = () => {
  snd(600, .1, 'square', .08);
  if (!online) startGame(mode);
  else if (online.authoritative) online.onAgain?.();
  else online.sendAction?.({ action: 'again', seq: ++inputSeq });
};
$('tomenu').onclick = $('home').onclick = () => { snd(400, .1, 'square', .08); toMenu(); };
$('snd').onclick = () => { mute = !mute; $('snd').textContent = mute ? '🔇' : '🔊'; if (!mute) snd(700, .1); };
$('fs').onclick = () => { const d = host; document.fullscreenElement ? document.exitFullscreen() : (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); };
const onContextMenu = e => e.preventDefault();
root.addEventListener('contextmenu', onContextMenu);

const unsubs = [];
if (online?.subscribeState) { const stop = online.subscribeState(applySnapshot); if (typeof stop === 'function') unsubs.push(stop); }
if (online?.authoritative && online.subscribeInput) {
  const stop = online.subscribeInput(input => {
    if (!input || !Number.isInteger(input.seq) || input.seq <= lastRemoteInput || !DIR[input.direction]) return;
    lastRemoteInput = input.seq;
    setDir(1, DIR[input.direction]);
  });
  if (typeof stop === 'function') unsubs.push(stop);
}
if (online?.authoritative && online.subscribeAction) {
  const stop = online.subscribeAction(action => {
    if (action?.action === 'again') online.onAgain?.();
  });
  if (typeof stop === 'function') unsubs.push(stop);
}
if (online?.autoStart && online.authoritative) startGame('pvp');
else if (online) {
  $('menu').querySelector('h1').textContent = 'ಸಂಪರ್ಕವಾಗುತ್ತಿದೆ…';
  $('menu').querySelector('.sub').textContent = 'ನಿಮ್ಮ ಸಂಗಾತಿಯ ಬೋರ್ಡ್ ಸಿದ್ಧವಾಗುತ್ತಿದೆ. ಸ್ವಲ್ಪ ಕಾಯಿರಿ ♡';
  root.querySelectorAll('[data-m]').forEach(button => { button.disabled = true; });
}

const close = () => {
  if (disposed) return;
  disposed = true; cancelAnimationFrame(raf); clearTimers(); clearTimeout(bt); clearInterval(FW);
  document.removeEventListener('keydown', onKeyDown); window.removeEventListener('resize', resize);
  unsubs.forEach(stop => { try { stop(); } catch {} });
  try { AC?.close(); } catch {}
  host.remove();
};
return close;
}
