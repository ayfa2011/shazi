/* ------------------------------------------------------------------ *
 *  celebration.js — shared "someone won!" moment for every game.
 *
 *    import { celebrateWin, closeCelebration } from "./celebration.js";
 *
 *    celebrateWin({
 *      game: "Battleship",            // small label on the card
 *      won: true,                     // did *this* player win?
 *      draw: false,                   // true for a tie (gentle confetti only)
 *      winnerName: "Priya",           // shown when this player lost
 *      details: "17 hits · 3 misses", // optional line under the title
 *      actions: [{ label: "Play again ♡", primary: true, onClick: () => {} }]
 *    });
 *
 *  Sounds are synthesised with the Web Audio API, so there are no audio
 *  files to host. Everything (sound, fireworks, card styles) lives here.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 *  SOUND  — everything is synthesised with the Web Audio API,
 *  so there are no audio files to host or download.
 * ------------------------------------------------------------------ */
const SOUND_KEY = "olw-games-sound-off";
const LEGACY_SOUND_KEY = "olw-ludo-sound-off";
export const GameSound = (() => {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  try { muted = (localStorage.getItem(SOUND_KEY) ?? localStorage.getItem(LEGACY_SOUND_KEY)) === "1"; } catch { /* storage unavailable */ }

  function ensure() {
    try {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        ctx = new AudioCtx();
        master = ctx.createGain();
        master.gain.value = 0.9;
        const compressor = ctx.createDynamicsCompressor();
        master.connect(compressor);
        compressor.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    } catch { return null; }
  }

  function noise() {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  function tone(freq, { to, type = "sine", at = 0, dur = 0.15, vol = 0.25, attack = 0.004 } = {}) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function hiss({ at = 0, dur = 0.1, vol = 0.2, type = "bandpass", freq = 1500, to, q = 1 } = {}) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime + at;
    const source = ctx.createBufferSource();
    source.buffer = noise();
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t, Math.random() * 0.5);
    source.stop(t + dur + 0.05);
  }

  const scale = [523.25, 587.33, 659.25, 783.99, 880, 987.77];
  const api = {
    unlock() { ensure(); },
    isMuted: () => muted,
    setMuted(value) {
      muted = Boolean(value);
      try { localStorage.setItem(SOUND_KEY, muted ? "1" : "0"); } catch { /* ignore */ }
    },
    roll() {
      for (let index = 0; index < 11; index += 1) {
        const at = index * 0.052 + index * index * 0.0028;
        hiss({ at, dur: 0.035, vol: 0.2, type: "highpass", freq: 2200 + Math.random() * 2200 });
        tone(170 + Math.random() * 140, { at, dur: 0.05, vol: 0.14, type: "triangle" });
      }
    },
    land(value) {
      tone(150, { to: 62, dur: 0.14, vol: 0.34 });
      hiss({ dur: 0.05, vol: 0.18, freq: 1800 });
      if (value === 6) [880, 1175, 1568].forEach((f, i) => tone(f, { at: 0.08 + i * 0.07, dur: 0.22, vol: 0.12, type: "triangle" }));
    },
    step(index = 0) {
      tone(scale[index % scale.length] * 0.5, { to: scale[index % scale.length] * 0.32, dur: 0.085, vol: 0.26, type: "triangle" });
      hiss({ dur: 0.025, vol: 0.09, freq: 3200 });
    },
    capture() {
      tone(560, { to: 70, type: "sawtooth", dur: 0.38, vol: 0.16 });
      tone(130, { to: 45, dur: 0.3, vol: 0.4 });
      hiss({ dur: 0.32, vol: 0.28, freq: 1600, to: 180 });
    },
    gate() {
      hiss({ dur: 0.025, vol: 0.3, freq: 4200, type: "highpass" });
      hiss({ at: 0.1, dur: 0.025, vol: 0.3, freq: 3000, type: "highpass" });
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { at: 0.22 + i * 0.09, dur: 0.4, vol: 0.2, type: "triangle" }));
    },
    home() {
      [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => {
        tone(f, { at: i * 0.1, dur: 0.55, vol: 0.22, type: "triangle" });
        tone(f * 2, { at: i * 0.1, dur: 0.4, vol: 0.07 });
      });
      hiss({ at: 0.3, dur: 0.5, vol: 0.05, type: "highpass", freq: 6000 });
    },
    rocket() { tone(420, { to: 1900, dur: 0.55, vol: 0.06 }); },
    cracker() {
      tone(160, { to: 38, dur: 0.22, vol: 0.5 });
      hiss({ dur: 0.2, vol: 0.5, type: "lowpass", freq: 3200, to: 300 });
      for (let index = 0; index < 6; index += 1) {
        hiss({ at: 0.06 + index * 0.045 + Math.random() * 0.03, dur: 0.03, vol: 0.2, type: "highpass", freq: 4200 + Math.random() * 2000 });
      }
    },
    applause(seconds = 2.4) {
      for (let index = 0; index < seconds * 16; index += 1) {
        hiss({ at: Math.random() * seconds, dur: 0.035, vol: 0.12 + Math.random() * 0.1, type: "bandpass", freq: 1400 + Math.random() * 2800, q: 0.7 });
      }
    },
    win() {
      const melody = [[523.25, 0], [523.25, 0.15], [523.25, 0.3], [659.25, 0.5], [783.99, 0.8], [659.25, 1.1], [783.99, 1.3], [1046.5, 1.6]];
      melody.forEach(([f, at]) => {
        tone(f, { at, dur: 0.38, vol: 0.14, type: "square" });
        tone(f / 2, { at, dur: 0.38, vol: 0.14, type: "triangle" });
      });
      api.applause(3);
    }
  };
  return api;
})();

export function buzz(pattern) {
  if (GameSound.isMuted()) return;
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

/* ------------------------------------------------------------------ *
 *  FX  — confetti and firework "crackers" on a full-screen canvas.
 * ------------------------------------------------------------------ */
export const GameFX = (() => {
  const palette = ["#ff4d8d", "#ffd166", "#06d6a0", "#4cc9f0", "#c77dff", "#ff9f1c", "#ffffff", "#ef476f"];
  const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let canvas = null;
  let ctx2d = null;
  let particles = [];
  let frame = 0;
  let lastTime = 0;
  let width = 0;
  let height = 0;
  let timers = [];
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = list => list[Math.floor(Math.random() * list.length)];

  function resize() {
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx2d.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function ensure() {
    if (canvas) return true;
    canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;z-index:3000";
    ctx2d = canvas.getContext("2d");
    if (!ctx2d) { canvas = null; return false; }
    document.body.appendChild(canvas);
    window.addEventListener("resize", resize);
    resize();
    return true;
  }

  function add(items) {
    if (!ensure()) return;
    particles.push(...items);
    if (!frame) { lastTime = performance.now(); frame = requestAnimationFrame(loop); }
  }

  function loop(now) {
    const dt = Math.min(0.04, (now - lastTime) / 1000);
    lastTime = now;
    ctx2d.clearRect(0, 0, width, height);
    const next = [];
    for (const p of particles) {
      p.age += dt;
      if (p.kind === "rocket") {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.trail.push([p.x, p.y]); if (p.trail.length > 9) p.trail.shift();
        if (p.y <= p.targetY) { burst(p.x, p.y, p.color, p.count); GameSound.cracker(); continue; }
        ctx2d.globalAlpha = 1;
        p.trail.forEach(([tx, ty], index) => {
          ctx2d.globalAlpha = (index + 1) / p.trail.length * 0.8;
          ctx2d.fillStyle = "#ffe9a8";
          ctx2d.fillRect(tx - 1.5, ty - 1.5, 3, 3);
        });
        next.push(p);
        continue;
      }
      if (p.age > p.life) continue;
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const fade = Math.max(0, 1 - p.age / p.life);
      if (p.kind === "spark") {
        p.trail.push([p.x, p.y]); if (p.trail.length > 5) p.trail.shift();
        p.trail.forEach(([tx, ty], index) => {
          ctx2d.globalAlpha = fade * (index + 1) / p.trail.length * 0.5;
          ctx2d.fillStyle = p.color;
          ctx2d.beginPath(); ctx2d.arc(tx, ty, p.size * 0.7, 0, 6.3); ctx2d.fill();
        });
        ctx2d.globalAlpha = fade;
        ctx2d.fillStyle = p.color;
        ctx2d.beginPath(); ctx2d.arc(p.x, p.y, p.size, 0, 6.3); ctx2d.fill();
      } else {
        p.rot += p.vr * dt;
        ctx2d.save();
        ctx2d.globalAlpha = Math.min(1, fade * 2);
        ctx2d.translate(p.x, p.y);
        ctx2d.rotate(p.rot);
        ctx2d.scale(1, Math.abs(Math.cos(p.age * p.flip)));
        ctx2d.fillStyle = p.color;
        ctx2d.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
        ctx2d.restore();
      }
      if (p.y < height + 40) next.push(p);
    }
    ctx2d.globalAlpha = 1;
    particles = next;
    if (particles.length || timers.length) frame = requestAnimationFrame(loop);
    else { frame = 0; ctx2d.clearRect(0, 0, width, height); }
  }

  function burst(x, y, color, count = 70) {
    const items = [];
    const second = pick(palette);
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + rand(-0.08, 0.08);
      const speed = rand(90, 330);
      items.push({ kind: "spark", x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 150, drag: 0.985,
        age: 0, life: rand(0.9, 1.7), size: rand(1.6, 3.2), color: index % 3 === 0 ? second : color, trail: [] });
    }
    add(items);
  }

  function confetti(x, y, count = 70, power = 1) {
    if (reduced()) return;
    const items = [];
    for (let index = 0; index < count; index += 1) {
      const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const speed = rand(220, 620) * power;
      items.push({ kind: "paper", x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 780, drag: 0.985,
        age: 0, life: rand(1.6, 2.8), size: rand(7, 13), rot: rand(0, 6.3), vr: rand(-9, 9), flip: rand(4, 11), color: pick(palette) });
    }
    add(items);
  }

  function rainConfetti(count = 60) {
    const items = [];
    for (let index = 0; index < count; index += 1) {
      items.push({ kind: "paper", x: rand(0, width), y: rand(-60, -10), vx: rand(-40, 40), vy: rand(60, 200), gravity: 90, drag: 0.995,
        age: 0, life: rand(2.2, 3.6), size: rand(7, 12), rot: rand(0, 6.3), vr: rand(-6, 6), flip: rand(4, 10), color: pick(palette) });
    }
    add(items);
  }

  function rocket() {
    if (!canvas) return;
    const x = rand(width * 0.12, width * 0.88);
    GameSound.rocket();
    add([{ kind: "rocket", x, y: height + 10, vx: rand(-25, 25), vy: -rand(520, 700), targetY: rand(height * 0.12, height * 0.5),
      color: pick(palette), count: Math.round(rand(55, 95)), trail: [], age: 0 }]);
  }

  function show(ms = 7000) {
    if (reduced()) return;
    ensure();
    const started = performance.now();
    confetti(width * 0.2, height * 0.9, 70, 1.15);
    confetti(width * 0.8, height * 0.9, 70, 1.15);
    rainConfetti(70);
    const launch = () => {
      if (!canvas) return;
      const elapsed = performance.now() - started;
      if (elapsed > ms) { timers = timers.filter(t => t !== handle); return; }
      rocket();
      if (Math.random() > 0.55) setTimeout(rocket, 140);
      if (Math.random() > 0.7) rainConfetti(18);
      handle = setTimeout(launch, rand(260, 520));
      timers = [handle];
    };
    let handle = setTimeout(launch, 150);
    timers = [handle];
    if (!frame) { lastTime = performance.now(); frame = requestAnimationFrame(loop); }
  }

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    particles = [];
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener("resize", resize);
    canvas?.remove();
    canvas = null;
    ctx2d = null;
  }

  return { confetti, burst, show, stop };
})();

/* ------------------------------------------------------------------ *
 *  Win card + show
 * ------------------------------------------------------------------ */
const GC_STYLE_ID = "gc-celebration-styles";
const GC_CSS = `
.gc-overlay{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;padding:18px;background:#2a101e8a;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);animation:gc-fade .35s ease both}
.gc-card{position:relative;width:min(420px,100%);padding:26px 22px 20px;border-radius:28px;text-align:center;background:linear-gradient(160deg,#fffdf4,#ffe9f2);box-shadow:0 24px 70px #000000aa,0 0 0 4px #ffffffcc;animation:gc-pop .7s cubic-bezier(.2,.9,.3,1.3) both;font-family:inherit}
.gc-card.lost{background:linear-gradient(160deg,#fff,#f4ecff)}
.gc-card.draw{background:linear-gradient(160deg,#fff,#eaf6ff)}
.gc-eyebrow{margin:0 0 4px;color:#b06a8a;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.gc-trophy{font-size:68px;line-height:1;animation:gc-trophy 1.4s ease-in-out infinite}
.gc-card h2{margin:8px 0 2px;color:#8f315d;font-size:clamp(28px,8vw,40px);line-height:1.1;overflow-wrap:anywhere}
.gc-kn{margin:0;color:#c2417b;font-size:20px;font-weight:800}
.gc-sub{margin:10px 0 16px;color:#8c737d;font-size:12px;line-height:1.5}
.gc-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
.gc-actions button{min-height:44px;padding:10px 20px;border:0;border-radius:999px;background:#ffe3ee;color:#8f315d;font:inherit;font-size:14px;font-weight:800;cursor:pointer;transition:transform .15s}
.gc-actions button:active{transform:scale(.95)}
.gc-actions button.primary{background:linear-gradient(145deg,#f07aa5,#d44c80);color:#fff;box-shadow:0 8px 20px #d44c8055}
.gc-sound{position:absolute;right:12px;top:12px;width:36px;height:36px;border:0;border-radius:50%;background:#ffffffb0;font-size:16px;cursor:pointer}
@keyframes gc-fade{from{opacity:0}}
@keyframes gc-pop{0%{opacity:0;transform:scale(.4) rotate(-6deg)}100%{opacity:1;transform:scale(1) rotate(0)}}
@keyframes gc-trophy{50%{transform:translateY(-8px) rotate(-6deg) scale(1.08)}}
@media(prefers-reduced-motion:reduce){.gc-overlay,.gc-card,.gc-trophy{animation:none!important}}
`;
function ensureCelebrationStyles() {
  if (document.getElementById(GC_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = GC_STYLE_ID;
  style.textContent = GC_CSS;
  document.head.appendChild(style);
}
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

let current = null;

export function closeCelebration({ silent = false } = {}) {
  const active = current;
  current = null;
  if (!active) return;
  GameFX.stop();
  active.overlay.remove();
  document.removeEventListener("keydown", active.onKey);
  if (!silent) active.onClose?.();
}

/**
 * Plays the win sound, fires the crackers and shows the winner card.
 * Returns { close() }. A tie only gets a soft chime and a little confetti.
 */
export function celebrateWin({ game = "", won = true, draw = false, winnerName = "Your partner", details = "", actions = [], onClose } = {}) {
  closeCelebration({ silent: true });
  ensureCelebrationStyles();

  if (draw) {
    GameSound.home();
    const [cx, cy] = [window.innerWidth / 2, window.innerHeight * 0.4];
    GameFX.confetti(cx, cy, 60, 0.9);
  } else {
    GameSound.win();
    buzz([120, 60, 120, 60, 240]);
    GameFX.show(7500);
  }

  const overlay = document.createElement("div");
  overlay.className = "gc-overlay";
  const mood = draw ? "draw" : won ? "won" : "lost";
  const title = draw ? "It's a tie!" : won ? "You won!" : `${escapeHtml(winnerName)} wins!`;
  const kannada = draw ? "ಸಮ ಸಮ! 💞" : won ? "ಅಭಿನಂದನೆಗಳು! 🎉" : "ಚೆನ್ನಾಗಿ ಆಡಿದ್ರಿ! 💖";
  const buttons = (actions.length ? actions : [{ label: "Close" }]);
  overlay.innerHTML = `<div class="gc-card ${mood}" role="dialog" aria-live="assertive" aria-label="Game finished">
    <button type="button" class="gc-sound" data-gc-sound aria-label="Toggle sound">${GameSound.isMuted() ? "🔇" : "🔊"}</button>
    ${game ? `<p class="gc-eyebrow">${escapeHtml(game)}</p>` : ""}
    <div class="gc-trophy" aria-hidden="true">${draw ? "🤝" : "🏆"}</div>
    <h2>${title}</h2>
    <p class="gc-kn">${kannada}</p>
    ${details ? `<p class="gc-sub">${escapeHtml(details)}</p>` : `<p class="gc-sub"></p>`}
    <div class="gc-actions">${buttons.map((button, index) => `<button type="button" data-gc-action="${index}" class="${button.primary ? "primary" : ""}">${escapeHtml(button.label)}</button>`).join("")}</div>
  </div>`;
  document.body.appendChild(overlay);

  const handle = { overlay, onClose, close: () => { if (current === handle) closeCelebration(); } };
  handle.onKey = event => { if (event.key === "Escape") handle.close(); };
  document.addEventListener("keydown", handle.onKey);
  current = handle;

  overlay.addEventListener("click", event => {
    const sound = event.target.closest("[data-gc-sound]");
    if (sound) {
      GameSound.setMuted(!GameSound.isMuted());
      sound.textContent = GameSound.isMuted() ? "🔇" : "🔊";
      return;
    }
    const button = event.target.closest("[data-gc-action]");
    if (!button) return;
    const action = buttons[Number(button.dataset.gcAction)];
    handle.close();
    try { action?.onClick?.(); } catch (error) { console.error("Celebration action failed:", error); }
  });
  overlay.querySelector(".gc-actions button")?.focus({ preventScroll: true });
  return handle;
}

// Browsers only allow sound after a tap, so unlock audio on the first touch anywhere.
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", () => GameSound.unlock(), { passive: true });
  document.addEventListener("keydown", () => GameSound.unlock(), { passive: true });
}
