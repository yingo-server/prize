// 3D 红包墙：洗牌网格布局 + 射线拾取 + 刮刮乐 UV + 惩罚重抽（复用 WallView 逻辑契约）
import * as THREE from 'three';
import { addUpdater, registerGroup, showGroup, getCamera, disposeGroup } from './Scene.js';
import { createRedPacket3D, cardW, cardH } from './RedPacket3D.js';
import { freshSeed, shuffle, createPrng } from '../src/composables/usePrng.js';
import { sfx } from '../src/composables/useAudio.js';
import { coinBurst } from '../src/composables/useGlFx.js';

export function createWall3D(ctx) {
  const group = new THREE.Group();
  registerGroup('wall', group);
  const cards = [];
  let binds = [];
  let wallSeed = freshSeed();

  // ---- 布局：网格居中，自适应相机距离 ----
  function layoutGrid() {
    const n = cards.length;
    if (!n) return;
    const cols = n <= 6 ? 3 : n <= 8 ? 4 : 6;
    const rows = Math.ceil(n / cols);
    const gapX = cardW * 1.22, gapY = cardH * 1.2;
    const w = cols * gapX, h = rows * gapY;
    cards.forEach((c, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      c.setBase((col + .5) * gapX - w / 2, h / 2 - (row + .5) * gapY);
    });
    // 网格整体居中到相机视线
    group.position.y = 0;
    group.position.z = 0;
    // 相机自适应：保证全部卡片可见（多分辨率通用）
    const cam = getCamera();
    const aspect = cam.aspect || 1;
    const fovRad = cam.fov * Math.PI / 180;
    const distH = (h / 2 + 1.2) / Math.tan(fovRad / 2);
    const distW = (w / 2 + .9) / (Math.tan(fovRad / 2) * aspect);
    const dist = Math.max(distH, distW, 6);
    camGoal.set(0, 0, dist);
  }

  const camGoal = new THREE.Vector3(0, 0, 9);

  function rebuild() {
    for (const c of cards) { c.destroy(); group.remove(c.group); }
    cards.length = 0;
    const seed = wallSeed[0] ^ (wallSeed[1] >>> 1);
    const pool = ctx.config.奖品;
    const n = Math.min(ctx.config.红包墙设置.红包数量, Math.max(1, pool.length));
    const seq = shuffle(Array.from({ length: n }, (_, i) => i), seed);
    binds = seq.map((k, i) => ({ index: i, item: pool[k % pool.length], seed: null, done: false }));
    for (const b of binds) {
      const card = createRedPacket3D(group, ctx, b);
      cards.push(card);
      group.add(card.group);
    }
    layoutGrid();
    updateStat();
  }

  function updateStat() {
    const opened = cards.filter((c) => c.state === 'opened').length;
    if (ctx.topBar?.setStat) ctx.topBar.setStat(`已开 ${opened} / ${cards.length}`);
  }

  // ---- 抽奖逻辑（与 WallView 相同契约）----
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

  // ---- 射线拾取 + 刮刮乐 ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoverCard = null;
  let scratchCard = null;
  let pointerDown = false;
  let scratchMoves = 0;

  function pickCard(e) {
    const cam = getCamera();
    ndc.x = (e.clientX / innerWidth) * 2 - 1;
    ndc.y = -(e.clientY / innerHeight) * 2 + 1;
    ray.setFromCamera(ndc, cam);
    const hits = ray.intersectObjects(cards.map((c) => c.group), true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj.parent && !cards.some((c) => c.group === obj)) obj = obj.parent;
    return cards.find((c) => c.group === obj) || null;
  }

  function onMove(e) {
    if (ctx.view !== 'wall') return;
    const card = pickCard(e);
    if (hoverCard && hoverCard !== card) hoverCard.setHover(false);
    if (card && card.state === 'idle') {
      const mx = (ndc.x * (card.group.position.x + (innerWidth / innerHeight))) || 0;
      hoverCard = card;
      card.setHover(true, clamp(ndc.x, -1, 1) * .5, clamp(-ndc.y, -1, 1) * .5);
      document.body.style.cursor = 'pointer';
    } else if (!card) {
      document.body.style.cursor = '';
    }
    // 刮：按住时换算 UV
    if (pointerDown && scratchCard && scratchCard.state === 'scratched') {
      const hit = ray.intersectObject(scratchCard.group, true)[0];
      if (hit) {
        const uv = hit.uv;
        scratchCard.scratchAt(uv.x, uv.y);
        scratchMoves++;
        if (scratchMoves % 4 === 0) {
          sfx.scratch();
          if (scratchCard.scratchProgress() >= .6) {
            revealCard(scratchCard);
          }
        }
      }
    }
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function onDown(e) {
    if (ctx.view !== 'wall') return;
    pointerDown = true;
    const card = pickCard(e);
    if (!card) return;
    downPos = { x: e.clientX, y: e.clientY };
    if (card.state === 'idle' && ctx.phase === 'idle') {
      // 拖拽翻面：按住即开始跟踪，横移量驱动翻转（物理判定能否翻过重心）
      dragCard = card;
      card.dragFlipStart();
    } else if (card.state === 'scratched') {
      scratchCard = card;
    }
  }
  let downPos = null, dragCard = null;

  function onDragMove(e) {
    if (!dragCard) return;
    const dx = e.clientX - downPos.x;
    dragCard.dragFlipMove(dx * 0.02);   // 手指横移 → 翻转角速度
  }
  function onUp(e) {
    pointerDown = false;
    if (dragCard) {
      // 松手：轻扫（横移大）→ 物理翻过去；没过重心物理翻回
      const dx = downPos ? e.clientX - downPos.x : 0;
      if (Math.abs(dx) > 60) {
        dragCard.dragFlipEnd();
        dragCard.bind.bannedPenalty = false;
        // 翻转完成的处理走 onPacketScratchReady（物理到位后触发）
      } else {
        // 没拖到位：物理翻回，恢复 idle（无需处理，物理自动归位）
        dragCard.dragFlipEnd();
      }
      dragCard = null;
    }
    scratchCard = null;
  }

  addEventListener('pointermove', (e) => { onMove(e); onDragMove(e); });
  addEventListener('pointerdown', onDown);
  addEventListener('pointerup', onUp);

  // ---- ctx 回调接线（供 App/WallView 逻辑使用）----
  ctx.onPacketScratchReady = (bind) => {
    const card = cards.find((c) => c.bind === bind);
    if (card) scratchCard = card;
    // 拖拽翻面成功：此刻才抽奖（物理决定谁翻开，翻开的卡绑定新结果）
    const pick = drawFor(bind);
    if (pick) {
      bind.item = pick;
      bind.seed = freshSeed();
      bind.bannedPenalty = pick.isPenalty && !ctx.penaltyOn;
      card?.updatePrizeFace(pick);
    }
    ctx.setPhase('scratched');
  };

  ctx.onPacketClick = (bind, forcedItem) => {
    if (bind.done) return;
    const pick = forcedItem || drawFor(bind);
    if (!pick) { ctx.toast('没有可抽取的有效奖品', true); return; }
    bind.item = pick;
    bind.bannedPenalty = pick.isPenalty && !ctx.penaltyOn;
    const card = cards.find((c) => c.bind === bind);
    if (card) card.open();
  };

  ctx.onPacketRevealed = async (bind) => {
    const card = cards.find((c) => c.bind === bind);
    bind.done = true;
    if (card) card.markOpened();
    updateStat();
    // 惩罚项彩蛋：结果前 0.5s 人机验证（暂停结果流程）
    if (bind.item.isPenalty && ctx.config?.人机验证?.已启用) {
      ctx.setPhase('verify');
      await ctx.humanVerify?.(bind.item);
    }
    ctx.setPhase('result');
    const result = {
      name: bind.item.name, stock: bind.item.stock,
      isPenalty: bind.item.isPenalty,
      seedText: (bind.seed || freshSeed()).map((x) => (x >>> 0).toString(16).padStart(8, '0')).join(' '),
    };
    if (bind.bannedPenalty) {
      // 惩罚禁用：2s 后自动重抽（重置卡片，不扣库存）
      ctx.setPhase('penalty-hold');
      sfx.penalty();
      const modal = ctx.modal.show(result, {
        buttonLabel: '确认',
        retryTip: '已禁用惩罚项，自动重抽 · 2s',
      });
      ctx.retryStart = performance.now();
      ctx.retryTimer = setInterval(() => {
        const left = Math.max(0, Math.ceil((2000 - (performance.now() - ctx.retryStart)) / 1000));
        modal.setRetryTip(`已禁用惩罚项，自动重抽 · ${left}s`);
      }, 200);
      setTimeout(() => {
        clearInterval(ctx.retryTimer);
        doRetry(bind, card, modal);
      }, 2000);
    } else {
      if (!bind.item.isPenalty && bind.item.stock > 0) bind.item.stock--;
      ctx.notify();
      if (bind.item.isPenalty) sfx.penalty(); else { sfx.win(); sfx.coinBurst(); }
      winFxAt(card);
      ctx.shake();
      ctx.modal.show(result, {
        buttonLabel: '确认',
        onButton: () => { ctx.modal.close(); ctx.setPhase('idle'); },
        modalClosed: () => ctx.setPhase('idle'),
      });
    }
  };

  function revealCard(card) {
    if (!card || card.state !== 'scratched') return;
    sfx.coinBurst();
    card.revealAll();
    const rect = cardCenter(card);
    coinBurst(rect.x, rect.y);
    setTimeout(() => ctx.onPacketRevealed(card.bind), 350);
  }
  // 卡片中心的屏幕坐标（给 2D 特效层用）
  function cardCenter(card) {
    const v = new THREE.Vector3();
    card.group.getWorldPosition(v);
    v.project(getCamera());
    return { x: (v.x + 1) / 2 * innerWidth, y: (-v.y + 1) / 2 * innerHeight };
  }
  function winFxAt(card) {
    // 3D 空间金环冲击波
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(.4, .5, 64),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: .9, side: THREE.DoubleSide }),
    );
    card.group.add(ring);
    let t = 0;
    const stop = addUpdater((dt) => {
      t += dt;
      const p = t / .8;
      ring.scale.setScalar(1 + p * 5);
      ring.material.opacity = .9 * (1 - p);
      ring.lookAt(getCamera().position);
      if (p >= 1) { ring.removeFromParent(); ring.geometry.dispose(); ring.material.dispose(); stop(); }
    });
  }

  function doRetry(bind, card, modal) {
    ctx.setPhase('retrying');
    sfx.retry();
    const newSeed = freshSeed();
    const pick = drawFor(bind);
    if (!pick || !card) { modal.close(); ctx.setPhase('idle'); return; }
    bind.item = pick;
    bind.seed = newSeed;
    bind.bannedPenalty = pick.isPenalty && !ctx.penaltyOn;
    modal.close();
    card.reset(pick);
    setTimeout(() => {
      if (bind.bannedPenalty) {
        sfx.penalty();
        ctx.setPhase('penalty-hold');
        const m2 = ctx.modal.show({
          name: pick.name, stock: pick.stock, isPenalty: true,
          seedText: seedTextOf(newSeed),
        }, { buttonLabel: '确认', retryTip: '已禁用惩罚项，自动重抽 · 2s' });
        ctx.retryStart = performance.now();
        setTimeout(() => { m2.close(); doRetry(bind, card, m2); }, 2000);
      } else {
        if (!pick.isPenalty && pick.stock > 0) pick.stock--;
        ctx.notify();
        ctx.setPhase('result');
        card.markOpened();
        updateStat();
        if (pick.isPenalty) sfx.penalty(); else { sfx.win(); sfx.coinBurst(); }
        winFxAt(card);
        ctx.modal.show({
          name: pick.name, stock: pick.stock, isPenalty: pick.isPenalty,
          seedText: seedTextOf(newSeed),
        }, { buttonLabel: '确认', onButton: () => { ctx.modal.close(); ctx.setPhase('idle'); }, modalClosed: () => ctx.setPhase('idle') });
      }
    }, 250);
  }
  function seedTextOf(seed) {
    return Array.from(seed || []).map((x) => (x >>> 0).toString(16).padStart(8, '0')).join(' ');
  }

  // 相机跟随（弹性，仅 wall 视图时接管；转盘视图由 Wheel3D updater 控制）
  const removeCam = addUpdater((dt) => {
    if (ctx.view !== 'wall') return;
    const cam = getCamera();
    cam.position.lerp(camGoal, Math.min(1, dt * 3));
    cam.lookAt(0, 0, 0);
  });

  rebuild();
  return {
    group, rebuild, layoutGrid,
    get binds() { return binds; },
    destroy() {
      removeCam();
      for (const c of cards) c.destroy();
      disposeGroup('wall');
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerdown', onDown);
      removeEventListener('pointerup', onUp);
    },
  };
}
