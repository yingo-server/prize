// 红包墙页 view==='wall'：洗牌网格、红包卡片、已开统计、惩罚重抽流程
import { createRedPacket } from '../components/RedPacket.js';
import { freshSeed, shuffle, seedText, createPrng, hashSeed } from '../composables/usePrng.js';
import { sfx } from '../composables/useAudio.js';

export function createWallView(host, ctx) {
  const el = document.createElement('section');
  el.className = 'view-root wall-view';
  el.innerHTML = `<div class="wall-head"><h2 class="gold-text">红包墙</h2><div class="wall-stat">已开 0 / 12</div></div><div class="wall-grid"></div>`;
  host.appendChild(el);
  const grid = el.querySelector('.wall-grid');
  const stat = el.querySelector('.wall-stat');
  let binds = [];
  let cards = [];
  let wallSeed = freshSeed();

  function columns(n) {
    if (n <= 6) return 3;
    if (n <= 8) return 4;
    return 6;
  }

  function layout() {
    const n = binds.length;
    if (!n) return;
    const cols = Math.min(columns(n), ctx.lowPerf && innerWidth < 900 ? 3 : columns(n));
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    const gap = 32 * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1);
    const avail = grid.getBoundingClientRect().width || innerWidth - 128;
    const W = Math.min(280 * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1), (avail - gap * (cols - 1)) / cols);
    grid.style.setProperty('--rp-w', Math.max(80, W) + 'px');
    grid.style.setProperty('--rp-h', Math.max(100, W * 1.26) + 'px');
  }

  function rebuild() {
    cards = [];
    grid.innerHTML = '';
    const seed = wallSeed[0] ^ (wallSeed[1] >>> 1);
    const abs = ctx.config.奖品.filter((p) => p.stock !== 0 || p.isPenalty);
    const n = Math.min(ctx.config.红包墙设置.红包数量, Math.max(1, abs.length));
    const pool = ctx.config.奖品.slice();
    const seq = shuffle(Array.from({ length: n }, (_, i) => i), seed);
    binds = seq.map((k, i) => ({ index: i, item: pool[k % pool.length], seed: null, done: false }));
    for (const b of binds) {
      cards.push(createRedPacket(grid, ctx, b));
    }
    layout();
    updateStat();
  }

  function updateStat() {
    const opened = cards.filter((c) => c.state === 'opened').length;
    stat.textContent = `已开 ${opened} / ${cards.length}`;
  }

  function drawFor(bind) {
    const seed = freshSeed();
    bind.seed = seed;
    const rnd = createPrng(seed[0] ^ (seed[1] << 1));
    const candidates = ctx.config.奖品.filter((p) => (p.stock > 0) && (!p.isPenalty || ctx.penaltyOn));
    if (!candidates.length && ctx.penaltyOn) {
      ctx.penaltyOn = false; ctx.config.惩罚项.已启用 = false; ctx.notify();
    }
    if (!candidates.length) return null;
    const total = candidates.reduce((s, p) => s + (p.weight || 1), 0);
    let r = rnd() * total;
    let pick = candidates[candidates.length - 1];
    for (const p of candidates) { r -= p.weight || 1; if (r <= 0) { pick = p; break; } }
    return pick;
  }

  // 红包点击 → 抽结果 → 进入刮开
  ctx.onPacketClick = (bind, forcedItem) => {
    if (bind.done) return;
    const pick = forcedItem || drawFor(bind);
    if (!pick) { ctx.toast('没有可抽取的有效奖品', true); return; }
    if (!forcedItem) bind.seed = freshSeed();
    bind.item = pick;
    bind.bannedPenalty = pick.isPenalty && !ctx.penaltyOn;
    const card = cards.find((c) => c.bind === bind);
    if (card) card.open();
  };

  // 刮开全显 → 进 result（惩罚禁用则弹窗并 2s 后自动重抽）
  ctx.onPacketRevealed = (bind) => {
    const card = cards.find((c) => c.bind === bind);
    bind.done = true;
    if (card) card.markOpened();
    updateStat();
    ctx.setPhase('result');
    const result = {
      name: bind.item.name,
      stock: bind.item.stock,
      isPenalty: bind.item.isPenalty,
      seedText: seedText(bind.seed || freshSeed()),
    };
    if (bind.bannedPenalty) {
      ctx.setPhase('penalty-hold');
      ctx.retryStart = performance.now();
      sfx.penalty();
      const modal = ctx.modal.show(result, {
        buttonLabel: '确认',
        retryTip: '已禁用惩罚项，自动重抽 · 2s',
      });
      ctx.retryTimer = setInterval(() => {
        const left = Math.max(0, Math.ceil((2000 - (performance.now() - ctx.retryStart)) / 1000));
        modal.setRetryTip(`已禁用惩罚项，自动重抽 · ${left}s`);
      }, 200);
      setTimeout(() => {
        clearInterval(ctx.retryTimer);
        doRetry(bind, card, modal);
      }, 2000);
    } else {
      commitStock(bind.item);
      if (bind.item.isPenalty) sfx.penalty(); else sfx.win();
      ctx.fx.win();
      ctx.shake();
      ctx.modal.show(result, {
        buttonLabel: '确认',
        onButton: () => { ctx.modal.close(); ctx.setPhase('idle'); },
        modalClosed: () => ctx.setPhase('idle'),
      });
    }
  };

  function commitStock(item) {
    if (item.isPenalty || item.stock <= 0) return;
    item.stock--;
    ctx.notify();
  }

  function doRetry(bind, card, modal) {
    ctx.setPhase('retrying');
    sfx.retry();
    const newSeed = freshSeed();
    const pick = drawFor(bind);
    if (!pick) { modal.close(); ctx.setPhase('idle'); return; }
    bind.item = pick;
    bind.seed = newSeed;
    bind.bannedPenalty = pick.isPenalty && !ctx.penaltyOn;
    card.reset(pick);
    // 被 ban 的惩罚项全程不扣库存；仅非惩罚项正常扣减
    const fresh = {
      name: pick.name, stock: pick.stock, isPenalty: pick.isPenalty,
      seedText: seedText(newSeed),
    };
    modal.close();
    setTimeout(() => {
      ctx.setPhase('result');
      if (bind.bannedPenalty) {
        // 极端情况再次抽到禁用惩罚：重新进入 2s 重抽流程，不调 onPacketRevealed 避免重复标记
        sfx.penalty();
        ctx.setPhase('penalty-hold');
        const m2 = ctx.modal.show(fresh, { buttonLabel: '确认', retryTip: '已禁用惩罚项，自动重抽 · 2s' });
        ctx.retryStart = performance.now();
        setTimeout(() => {
          m2.close();
          doRetry(bind, card, m2);
        }, 2000);
      } else {
        commitStock(pick);
        fresh.stock = pick.stock;
        if (pick.isPenalty) sfx.penalty(); else sfx.win();
        ctx.fx.win();
        card.markOpened();
        updateStat();
        ctx.modal.show(fresh, { buttonLabel: '确认', onButton: () => { ctx.modal.close(); ctx.setPhase('idle'); }, modalClosed: () => ctx.setPhase('idle') });
      }
    }, 120);
  }

  window.addEventListener('resize', layout);
  ctx.subscribe(() => { if (ctx.view === 'wall') { layout(); updateStat(); } });
  // 供测试与特殊场景检查：底层绑定列表
  ctx.wallBinds = binds;
  rebuild();
  return { el, rebuild, layout, get binds() { return binds; } };
}
