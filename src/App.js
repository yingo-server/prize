// 根应用：view / phase / seed / result / drawCount 状态机、全局粒子层、屏幕震动、重置
import { createConfig } from './composables/useConfig.js';
import { createTopBar } from './components/TopBar.js';
import { createHomeView } from './views/HomeView.js';
import { createWheelView } from './views/WheelView.js';
import { createWallView } from './views/WallView.js';
import { createPrizeResultModal } from './components/PrizeResultModal.js';
import { createConfettiFx } from './components/ConfettiFx.js';
import { freshSeed, seedText, createPrng } from './composables/usePrng.js';
import { sfx, setAudioEnabled } from './composables/useAudio.js';

export class App {
  constructor(root, { fxCanvas, particleCanvas } = {}) {
    this.root = root;
    this.config = createConfig();
    this.view = 'home';
    this.phase = 'idle';
    this.seed = null;
    this.result = null;
    this.drawCount = 0;
    this.soundOn = true;
    this.lowPerf = false;
    this.penaltyOn = this.config.惩罚项.已启用;
    this.listeners = new Set();
    this.particleCanvas = particleCanvas;

    // 背景层（z1~3）
    const pattern = document.createElement('div'); pattern.className = 'bg-pattern';
    const spot = document.createElement('div'); spot.className = 'bg-spotlight';
    const decor = document.createElement('div'); decor.className = 'bg-decor';
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
    for (const cls of ['l1', 'l2', 'l3', 'l4']) {
      const l = document.createElement('i'); l.className = 'lantern ' + cls; decor.appendChild(l);
    }
    root.append(pattern, spot, decor);

    this.content = document.createElement('div');
    root.appendChild(this.content);

    const frame = document.createElement('div'); frame.className = 'marquee-frame'; root.appendChild(frame);
    const toastLayer = document.createElement('div'); toastLayer.className = 'toast-layer'; root.appendChild(toastLayer);
    this.toastLayer = toastLayer;

    this.modalHost = document.createElement('div'); root.appendChild(this.modalHost);
    this.modal = createPrizeResultModal(this.modalHost, this);
    this.modalClosedHandler = () => {};
    this.onModalClosed = () => this.modalClosedHandler();

    this.fx = createConfettiFx(fxCanvas, this);
    this.topBar = createTopBar(root, this);
    this.home = createHomeView(this.content, this);
    this.wheel = null;
    this.wall = null;
    this.onModalClosed = () => {};
    this.onPacketClick = () => {};
    this.onPacketRevealed = () => {};
    this.retryTimer = null;
    this.retryStart = 0;
    this.renderView();
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  get wheelItems() { return this.config.奖品; }
  notify() { for (const fn of this.listeners) { try { fn(); } catch (_) {} } }
  setPhase(p) { this.phase = p; this.notify(); }
  toast(msg, warn = false) {
    const t = document.createElement('div'); t.className = 'toast' + (warn ? ' warn' : ''); t.textContent = msg;
    this.toastLayer.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  renderView() {
    this.content.innerHTML = '';
    if (this.view === 'home') { this.home = createHomeView(this.content, this); }
    else if (this.view === 'wheel') { this.wheel = createWheelView(this.content, this); }
    else if (this.view === 'wall') { this.wall = createWallView(this.content, this); }
    this.notify();
  }

  go(view) {
    if (this.view === view) return;
    if (this.modal.visible) this.modal.close();
    clearInterval(this.retryTimer);
    this.view = view;
    this.phase = 'idle';
    this.renderView();
  }

  setPenalty(on) {
    this.penaltyOn = !!on;
    this.config.惩罚项.已启用 = this.penaltyOn;
    this.notify();
  }

  shake() {
    if (this.lowPerf) return;
    this.root.classList.remove('shake');
    void this.root.offsetWidth;
    this.root.classList.add('shake');
    setTimeout(() => this.root.classList.remove('shake'), 460);
  }

  // 转盘：点击开始 → 按权重选奖品（含库存）→ 启动转盘
  onStartWheel() {
    if (this.phase === 'spinning') return;
    const seed = freshSeed(); this.seed = seed;
    const pool = this.config.奖品.filter((p) => (p.stock > 0) && (!p.isPenalty || this.penaltyOn));
    if (!pool.length) {
      this.toast('没有可抽取的有效奖品，请重置本场', true);
      if (this.penaltyOn) {
        this.penaltyOn = false; this.config.惩罚项.已启用 = false; this.notify();
      }
      return;
    }
    const total = pool.reduce((s, p) => s + (p.weight || 1), 0);
    const rnd = createPrng(seed[0] ^ (seed[1] << 1));
    let r = rnd() * total, pick = pool[pool.length - 1];
    for (const p of pool) { r -= p.weight || 1; if (r <= 0) { pick = p; break; } }
    this.pendingPrize = pick;
    this.phase = 'spinning';
    const idx = this.config.奖品.indexOf(pick);
    this.wheel?.wheel.spin(idx, seed);
  }

  onSpinDone(itemIndex) {
    const item = this.config.奖品[itemIndex] || this.pendingPrize;
    if (item && !item.isPenalty && item.stock > 0) item.stock--;
    this.drawCount++;
    this.notify();
    const result = {
      name: item.name, stock: item.stock, isPenalty: item.isPenalty,
      seedText: seedText(this.seed || freshSeed()),
    };
    this.result = result;
    this.phase = 'result';
    if (item.isPenalty) sfx.penalty(); else sfx.win();
    this.fx.win();
    this.shake();
    this.modalClosedHandler = () => { this.phase = 'idle'; this.wheel?.wheel.clearWin(); };
    this.modal.show(result, {
      buttonLabel: '继续抽奖',
      onButton: () => {
        this.modalClosedHandler = () => {};
        this.modal.close();
      },
      modalClosed: () => { this.phase = 'idle'; this.wheel?.wheel.clearWin(); },
    });
  }

  onModalClosed() { this.notify(); }

  reset() {
    sfx.reset();
    clearInterval(this.retryTimer);
    if (this.modal.visible) this.modal.close();
    this.config = createConfig();
    this.penaltyOn = this.config.惩罚项.已启用;
    this.seed = null; this.result = null; this.drawCount = 0;
    this.phase = 'idle';
    this.fx.reset();
    this.renderView();
    this.topBar.render();
    this.toast('本场已重置');
  }

  onTopAction(key) {
    switch (key) {
      case 'back': this.go('home'); break;
      case 'swap': this.go(this.view === 'wheel' ? 'wall' : 'wheel'); break;
      case 'full':
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.().catch(() => this.toast('全屏请求被拒绝', true));
        break;
      case 'sound':
        this.soundOn = !this.soundOn;
        setAudioEnabled(this.soundOn);
        if (this.soundOn) sfx.click();
        this.notify();
        break;
      case 'low':
        this.lowPerf = !this.lowPerf;
        document.body.classList.toggle('low-perf', this.lowPerf);
        this.fx.reset();
        this.notify();
        this.toast(this.lowPerf ? '低性能模式已开启' : '低性能模式已关闭');
        break;
      case 'reset': this.reset(); break;
    }
  }
}
