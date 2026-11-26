// WebAudio 全合成音效系统：不加载任何音频文件。
// 初始化：首次 pointerdown 后创建 AudioContext；masterGain 0.35 → destination。
let ctx = null;
let master = null;
let enabled = true;
let initBound = false;

let musicTimer = null;
let musicGain = null;
let musicNodes = [];
let musicOn = false;

function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.35 : 0;
    master.connect(ctx.destination);
  } catch (_) { ctx = null; }
  return ctx;
}

export function initAudio() {
  if (initBound) return;
  initBound = true;
  const initOnce = () => {
    const c = ensure();
    if (c?.state === 'suspended') c.resume().catch(() => {});
  };
  document.addEventListener('pointerdown', initOnce, { once: true });
}

export function setAudioEnabled(on) {
  enabled = !!on;
  if (master && ctx) master.gain.setTargetAtTime(enabled ? 0.35 : 0, ctx.currentTime, 0.02);
}

export function isAudioEnabled() { return enabled; }

// 振荡器 + 增益包络（每个音效独立 GainNode，避免互相截断）
export function playTone({ freq = 440, type = 'sine', dur = 0.1, gain = 0.1, attack = 0.005, release = 0.04, sweepTo = null, filterType = null, filterFreq = 1000, q = 1, delay = 0, dest = null } = {}) {
  const c = ensure(); if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(attack, dur * 0.4));
  g.gain.setValueAtTime(Math.max(0.0002, gain), t0 + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = osc;
  if (filterType) {
    const f = c.createBiquadFilter();
    f.type = filterType; f.frequency.value = filterFreq; f.Q.value = q;
    osc.connect(f); node = f;
  }
  node.connect(g); g.connect(dest || master || c.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

// 白噪声 BufferSource + BiquadFilter
export function playNoise({ dur = 0.08, gain = 0.08, filterType = 'bandpass', filterFreq = 1400, q = 4, delay = 0, dest = null } = {}) {
  const c = ensure(); if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.ceil(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = filterFreq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(Math.max(0.0002, gain), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(dest || master || c.destination);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

// ---------- 音效清单（逐条按规格参数） ----------
export const sfx = {
  click() {
    playTone({ freq: 880, sweepTo: 660, type: 'square', dur: 0.06, gain: 0.18, attack: 0.004, release: 0.05 });
  },
  toggleOn() {
    playTone({ freq: 660, type: 'triangle', dur: 0.06, gain: 0.15, attack: 0.004, release: 0.03 });
    playTone({ freq: 880, type: 'triangle', dur: 0.08, gain: 0.15, attack: 0.004, release: 0.04, delay: 0.11 });
  },
  toggleOff() {
    playTone({ freq: 880, type: 'triangle', dur: 0.06, gain: 0.15, attack: 0.004, release: 0.03 });
    playTone({ freq: 660, type: 'triangle', dur: 0.08, gain: 0.15, attack: 0.004, release: 0.04, delay: 0.11 });
  },
  spinStart() {
    playTone({ freq: 220, sweepTo: 440, type: 'sawtooth', dur: 0.5, gain: 0.12, attack: 0.02, release: 0.15, filterType: 'lowpass', filterFreq: 1200 });
  },
  _loopNodes: null,
  spinLoopStart() {
    const c = ensure(); if (!c || sfx._loopNodes) return;
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 60;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.5), c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 400; nf.Q.value = 2;
    const g = c.createGain(); g.gain.value = 0.05;
    osc.connect(g); noise.connect(nf); nf.connect(g); g.connect(master || c.destination);
    osc.start(); noise.start();
    sfx._loopNodes = { osc, noise, g };
  },
  spinLoopRate(p) {
    const n = sfx._loopNodes; if (!n || !ctx) return;
    n.osc.frequency.setTargetAtTime(60 + 30 * p, ctx.currentTime, 0.08);
    n.g.gain.setTargetAtTime(0.05 * (1 - p * 0.55), ctx.currentTime, 0.1);
  },
  spinLoopStop() {
    const n = sfx._loopNodes; if (!n) return;
    try { n.osc.stop(); n.noise.stop(); } catch (_) {}
    sfx._loopNodes = null;
  },
  decelTick() {
    playNoise({ dur: 0.03, gain: 0.1, filterType: 'bandpass', filterFreq: 1400, q: 4 });
    playTone({ freq: 1000, type: 'sine', dur: 0.02, gain: 0.1, attack: 0.002, release: 0.01 });
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => playTone({ freq: f, type: 'triangle', dur: 0.12, gain: 0.16, attack: 0.006, release: 0.05, delay: i * 0.10 }));
    playTone({ freq: 1200, type: 'triangle', dur: 0.4, gain: 0.16, attack: 0.02, release: 0.3, delay: 0.4 });
  },
  penalty() {
    playTone({ freq: 220, sweepTo: 180, type: 'sawtooth', dur: 0.5, gain: 0.2, attack: 0.01, release: 0.15, filterType: 'lowpass', filterFreq: 600 });
    playTone({ freq: 110, type: 'square', dur: 0.3, gain: 0.2, attack: 0.01, release: 0.12, delay: 0.05 });
  },
  retry() {
    playTone({ freq: 523, type: 'triangle', dur: 0.08, gain: 0.14, attack: 0.004, release: 0.03 });
    playTone({ freq: 784, type: 'triangle', dur: 0.08, gain: 0.14, attack: 0.004, release: 0.03, delay: 0.18 });
  },
  _lastScratch: 0,
  scratch() {
    const now = performance.now();
    if (now - sfx._lastScratch < 60) return;
    sfx._lastScratch = now;
    playNoise({ dur: 0.08, gain: 0.08, filterType: 'bandpass', filterFreq: 800 + Math.random() * 1400, q: 3 });
  },
  coinBurst() {
    for (let i = 0; i < 8; i++) {
      playTone({ freq: 1400 + Math.random() * 1000, type: 'triangle', dur: 0.04, gain: 0.12, attack: 0.003, release: 0.02, delay: i * (0.03 + Math.random() * 0.05) });
    }
  },
  reset() {
    [880, 660, 440].forEach((f, i) => playTone({ freq: f, type: 'triangle', dur: 0.1, gain: 0.15, attack: 0.005, release: 0.05, delay: i * 0.12 }));
  },
};

// ---------- 背景音乐（默认关闭，独立增益，五声音阶 3s 循环） ----------
export function setMusicEnabled(on) {
  const want = !!on;
  if (want === musicOn) return;
  musicOn = want;
  if (musicOn) {
    const c = ensure(); if (!c) return;
    musicGain = c.createGain(); musicGain.gain.value = 1; musicGain.connect(c.destination);
    // 低八度持续低音 C3
    const drone = c.createOscillator(); drone.type = 'sine'; drone.frequency.value = 130.81;
    const dg = c.createGain(); dg.gain.value = 0.03;
    drone.connect(dg); dg.connect(musicGain); drone.start();
    musicNodes = [drone];
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0];
    let step = 0;
    const tick = () => {
      if (!musicOn || !ctx) return;
      playTone({ freq: scale[step % 5], type: 'triangle', dur: 0.6, gain: 0.04, attack: 0.05, release: 0.25, dest: musicGain });
      step++;
    };
    tick();
    musicTimer = setInterval(tick, 600);
  } else {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    for (const n of musicNodes) { try { n.stop(); } catch (_) {} }
    musicNodes = [];
    if (musicGain) { try { musicGain.disconnect(); } catch (_) {} }
    musicGain = null;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!musicOn) return;
    if (document.hidden) {
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = null;
      if (ctx) ctx.suspend().catch(() => {});
    } else {
      if (ctx) ctx.resume().catch(() => {});
      const scale = [261.63, 293.66, 329.63, 392.0, 440.0];
      let step = 0;
      musicTimer = setInterval(() => {
        if (!musicOn || !ctx) return;
        playTone({ freq: scale[step++ % 5], type: 'triangle', dur: 0.6, gain: 0.04, attack: 0.05, release: 0.25, dest: musicGain });
      }, 600);
    }
  });
}
