// 3D 入口：精简 UI（转盘/红包墙 + 音量开关 + 惩罚ban开关），多分辨率自适应
// 复用 useAudio / usePrng / useWasm / useGlFx / useConfig / 结果弹窗
import '../src/styles/main.css';
import '../src/styles/views.css';
import './styles3d/app3d.css';
import * as THREE from 'three';
import { initScene, is3dAvailable, showGroup, addUpdater, resize3d, getCamera, set3dLowPerf } from './Scene.js';
import { createWheel3D } from './Wheel3D.js';
import { createWall3D } from './Wall3D.js';
import { createPrizeResultModal } from '../src/components/PrizeResultModal.js';
import { createConfig } from '../src/composables/useConfig.js';
import { freshSeed, seedText, createPrng } from '../src/composables/usePrng.js';
import { sfx, setAudioEnabled, initAudio } from '../src/composables/useAudio.js';
import { initFx, startAmbient, winFx, resize as fxResize } from '../src/composables/useGlFx.js';
import { initWasm } from '../src/composables/useWasm.js';

const appRoot = document.getElementById('app');

// ---- 全局状态 ----
const S = {
  view: 'home',
  phase: 'idle',
  config: createConfig(),
  penaltyOn: createConfig().惩罚项.已启用,
  soundOn: true,
  lowPerf: false,
  seed: null,
  drawCount: 0,
  listeners: new Set(),
};
const notify = () => { for (const fn of S.listeners) { try { fn(); } catch (_) {} } };
const setPhase = (p) => { S.phase = p; notify(); };
S.setPhase = setPhase; S.notify = notify;
S.subscribe = (fn) => S.listeners.add(fn);
S.toast = (msg) => showToast(msg);
Object.defineProperty(S, 'wheelItems', { get: () => S.config.奖品 });
Object.defineProperty(S, 'view', { get: () => S._view, set: (v) => { S._view = v; } });
S.view = 'home';

// ---- WASM / 音频 / 2D 特效层 ----
initWasm();
initAudio();
const fxCanvas = document.createElement('canvas');
fxCanvas.id = 'fx-layer';
document.body.appendChild(fxCanvas);
initFx(fxCanvas, false);
startAmbient();

// ---- 3D 场景 ----
if (!is3dAvailable()) {
  showToast('当前环境不支持 WebGL，请更换浏览器', 5000);
}
initScene(false);

// ---- 顶栏（精简：音量 + 惩罚 ban + 全屏）----
const topBar = document.createElement('header');
topBar.className = 'bar3d';
topBar.innerHTML = `
  <div class="bar-left">
    <button class="chip" data-a="back" hidden>‹ 首页</button>
    <button class="chip" data-a="swap" hidden>切换</button>
  </div>
  <div class="bar-title" id="bar-title"></div>
  <div class="bar-right">
    <button class="chip pill" data-a="sound" aria-label="音量">
      <span class="ico">🔊</span><span class="track"><i class="knob"></i></span>
    </button>
    <button class="chip pill" data-a="penalty" aria-label="惩罚开关">
      <span class="ico">⛔</span><span class="track"><i class="knob"></i></span>
    </button>
    <button class="chip" data-a="full">⛶</button>
  </div>`;
appRoot.appendChild(topBar);

function renderBar() {
  topBar.querySelector('[data-a=back]').hidden = S.view === 'home';
  topBar.querySelector('[data-a=swap]').hidden = S.view === 'home';
  topBar.querySelector('[data-a=swap]').textContent = S.view === 'wheel' ? '切到红包墙' : '切到转盘';
  document.getElementById('bar-title').textContent =
    S.view === 'wheel' ? '转盘抽奖' : S.view === 'wall' ? '红包墙刮刮乐' : '';
  syncPills();
}
function syncPills() {
  const snd = topBar.querySelector('[data-a=sound]');
  const pen = topBar.querySelector('[data-a=penalty]');
  snd.classList.toggle('on', S.soundOn);
  pen.classList.toggle('on', !S.penaltyOn);   // ban 开关：开=禁用惩罚（默认）
}
topBar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a;
  if (a === 'back') go('home');
  else if (a === 'swap') go(S.view === 'wheel' ? 'wall' : 'wheel');
  else if (a === 'full') {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  } else if (a === 'sound') {
    S.soundOn = !S.soundOn;
    setAudioEnabled(S.soundOn);
    if (S.soundOn) sfx.click();
    syncPills();
  } else if (a === 'penalty') {
    S.penaltyOn = !S.penaltyOn;
    S.config.惩罚项.已启用 = S.penaltyOn;
    (S.penaltyOn ? sfx.toggleOn : sfx.toggleOff)();
    syncPills();
    showToast(S.penaltyOn ? '惩罚项已启用' : '惩罚项已禁用 · 抽中自动重抽');
  }
});

// ---- toast ----
const toastLayer = document.createElement('div');
toastLayer.className = 'toast3d';
appRoot.appendChild(toastLayer);
function showToast(msg, dur = 2200) {
  const t = document.createElement('div');
  t.className = 'toast-item';
  t.textContent = msg;
  toastLayer.appendChild(t);
  setTimeout(() => t.remove(), dur);
}
S.toast = showToast;

// ---- 结果弹窗（复用）----
const modalHost = document.createElement('div');
appRoot.appendChild(modalHost);
const modal = createPrizeResultModal(modalHost, S);
S.modal = modal;
S.onModalClosed = () => {};

// ---- 3D 组件 ----
let wheel3d = null, wall3d = null;

// 首页 3D：标题 + 双入口（DOM 层，转盘在 3D 场景中展示为背景焦点）
const homeEl = document.createElement('section');
homeEl.className = 'home3d';
homeEl.innerHTML = `
  <h1 class="home-title gold-text">抽奖</h1>
  <div class="home-divider"></div>
  <div class="home-btns">
    <button class="entry3d" data-go="wheel"><span class="ico">🎡</span><span class="gold-text">幸运转盘</span></button>
    <button class="entry3d" data-go="wall"><span class="ico">🧧</span><span class="gold-text">红包墙</span></button>
  </div>`;
homeEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) { sfx.click(); go(b.dataset.go); }
});
appRoot.appendChild(homeEl);

// 转盘页：只有 3D 转盘（+ 隐藏的开始由 3D 盘中心触发？——精简：中央浮动开始按钮由 3D 内 hub 提供，
// 这里挂一个透明点击层替代 3D hub 点击）
const wheelUi = document.createElement('section');
wheelUi.className = 'wheel-ui3d';
wheelUi.style.display = 'none';
wheelUi.innerHTML = `<button class="start-btn gold-btn">开 始</button>`;
wheelUi.querySelector('.start-btn').addEventListener('click', () => startWheel());
appRoot.appendChild(wheelUi);

// 红包墙页：无 DOM 面板（3D 卡片全屏交互）
const wallUi = document.createElement('section');
wallUi.className = 'wall-ui3d';
wallUi.style.display = 'none';
appRoot.appendChild(wallUi);

function startWheel() {
  if (S.phase === 'spinning' || !wheel3d) return;
  const seed = freshSeed(); S.seed = seed;
  const pool = S.config.奖品.filter((p) => (p.stock > 0) && (!p.isPenalty || S.penaltyOn));
  if (!pool.length) { showToast('没有可抽取的有效奖品', true); return; }
  const total = pool.reduce((s, p) => s + (p.weight || 1), 0);
  const rnd = createPrng(seed[0] ^ (seed[1] << 1));
  let r = rnd() * total, pick = pool[pool.length - 1];
  for (const p of pool) { r -= p.weight || 1; if (r <= 0) { pick = p; break; } }
  S.pending = pick;
  setPhase('spinning');
  wheelUi.querySelector('.start-btn').disabled = true;
  wheelUi.querySelector('.start-btn').textContent = '转动中';
  const idx = S.config.奖品.indexOf(pick);
  wheel3d.spin(idx, seed);
}

// onSpinDone（由 Wheel3D 调）
S.onSpinDone = (idx) => {
  const item = S.config.奖品[idx] || S.pending;
  if (item && !item.isPenalty && item.stock > 0) item.stock--;
  S.drawCount++;
  notify();
  setPhase('result');
  if (item.isPenalty) sfx.penalty(); else sfx.win();
  winFx();
  const result = { name: item.name, stock: item.stock, isPenalty: item.isPenalty, seedText: seedText(S.seed) };
  if (item.isPenalty && !S.penaltyOn) {
    // 不可能到这（pool 已过滤），保险
  }
  modal.show(result, {
    buttonLabel: '继续抽奖',
    onButton: () => {
      modal.close();
      setPhase('idle');
      wheel3d?.clearWin();
      const b = wheelUi.querySelector('.start-btn');
      b.disabled = false; b.textContent = '开 始';
    },
    modalClosed: () => {
      setPhase('idle');
      wheel3d?.clearWin();
      const b = wheelUi.querySelector('.start-btn');
      b.disabled = false; b.textContent = '开 始';
    },
  });
};

// 红包墙回调由 createWall3D 内部挂到 S（onPacketClick / onPacketRevealed / setPhase / toast / shake / fx）
S.fx = { win: winFx };
S.shake = () => {
  appRoot.classList.remove('shake');
  void appRoot.offsetWidth;
  appRoot.classList.add('shake');
  setTimeout(() => appRoot.classList.remove('shake'), 460);
};

// ---- 视图切换（3D 组切换 + DOM 显隐）----
function ensureWheel() {
  if (!wheel3d) wheel3d = createWheel3D(S);
  return wheel3d;
}
function ensureWall() {
  if (!wall3d) wall3d = createWall3D(S);
  return wall3d;
}

function go(view) {
  if (S.view === view) return;
  if (modal.visible) modal.close();
  S.view = view;
  setPhase('idle');
  homeEl.style.display = view === 'home' ? '' : 'none';
  wheelUi.style.display = view === 'wheel' ? '' : 'none';
  wallUi.style.display = view === 'wall' ? '' : 'none';
  if (view === 'home') { showGroup('wheel'); ensureWheel(); }
  if (view === 'wheel') { ensureWheel(); showGroup('wheel'); }
  if (view === 'wall') { ensureWall(); showGroup('wall'); }
  renderBar();
}

// 初始：首页（背景展示转盘 3D）
ensureWheel();
showGroup('wheel');
renderBar();

// ---- resize / 低性能 ----
addEventListener('resize', () => { resize3d(); fxResize(); });

window.__prize3d = S;
