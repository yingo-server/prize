// 单个红包卡片：未开 / 刮开（2D destination-out 涂层 + dpr）/ 已开 / 惩罚重抽
import { iconGift, iconWarn } from './icons.js';
import { sfx } from '../composables/useAudio.js';
import { scratchDebris, coinBurst } from '../composables/useGlFx.js';

export function createRedPacket(host, ctx, bind) {
  const item = bind.item;
  const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
  const el = document.createElement('div');
  el.className = 'rp-card';
  const rz = (Math.random() * 3 - 1.5).toFixed(2);
  el.style.setProperty('--rz', `${rz}deg`);
  el.style.setProperty('--ry', '0deg');
  el.innerHTML = `
    <div class="rp-inner">
      <div class="rp-front">
        <div class="rp-flap"><span class="rp-fu">福</span></div>
        <div class="rp-symbol">¥</div>
        <div class="rp-hint">点击开启</div>
      </div>
      <div class="rp-prize" style="display:none">
        ${item.isPenalty ? iconWarn() : iconGift()}
        <div class="rp-prize-name">${item.isPenalty ? '<span class="penalty-badge">惩罚</span>' : ''}${item.name}</div>
      </div>
      <canvas class="rp-cover" style="display:none"></canvas>
    </div>`;
  host.appendChild(el);

  const cover = el.querySelector('.rp-cover');
  const prize = el.querySelector('.rp-prize');
  const front = el.querySelector('.rp-front');
  const cctx = cover.getContext('2d', { willReadFrequently: true });
  let state = 'closed'; // closed | scratching | opened | holding
  let moves = 0, drawing = false, confirmBtn = null;

  function drawCover() {
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, rect.width || 200 * u), h = Math.max(1, rect.height || 252 * u);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cover.width = Math.round(w * dpr); cover.height = Math.round(h * dpr);
    cover.style.width = w + 'px'; cover.style.height = h + 'px';
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cctx.globalCompositeOperation = 'source-over';
    cctx.clearRect(0, 0, w, h);
    const g = cctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#9aa0ab'); g.addColorStop(.25, '#e6e9ee'); g.addColorStop(.45, '#8d939e');
    g.addColorStop(.65, '#d9dde3'); g.addColorStop(1, '#7f858f');
    cctx.fillStyle = g; cctx.fillRect(0, 0, w, h);
    // 每 4×4 像素随机亮度 ±8% 噪点
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
      const d = (Math.random() - .5) * .16;
      cctx.fillStyle = `rgba(255,255,255,${Math.max(0, d)})`;
      cctx.fillRect(x, y, 4, 4);
      cctx.fillStyle = `rgba(0,0,0,${Math.max(0, -d)})`;
      cctx.fillRect(x, y, 4, 4);
    }
    // 三道斜向高光条
    cctx.strokeStyle = 'rgba(255,255,255,.28)'; cctx.lineWidth = 14 * u;
    for (let i = 0; i < 3; i++) {
      cctx.beginPath(); cctx.moveTo(-w + i * w * .55, h); cctx.lineTo(i * w * .55, 0); cctx.stroke();
    }
    cctx.fillStyle = 'rgba(60,60,70,.5)';
    cctx.font = `bold ${26 * u}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    cctx.textAlign = 'center'; cctx.textBaseline = 'middle';
    cctx.fillText('刮开', w / 2, h / 2);
  }

  function pointerPos(e) {
    const r = cover.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  function scratchAt(x, y) {
    cctx.globalCompositeOperation = 'destination-out';
    cctx.beginPath(); cctx.arc(x, y, 26 * u, 0, Math.PI * 2); cctx.fill();
    sfx.scratch();
    scratchDebris(eClientXLast, eClientYLast);
    moves++;
    if (moves % 8 === 0) checkProgress();
  }
  let eClientXLast = 0, eClientYLast = 0;

  cover.addEventListener('pointerdown', (e) => {
    if (state !== 'scratching') return;
    drawing = true; cover.setPointerCapture(e.pointerId);
    eClientXLast = e.clientX; eClientYLast = e.clientY;
    const [x, y] = pointerPos(e); scratchAt(x, y);
  });
  cover.addEventListener('pointermove', (e) => {
    if (!drawing || state !== 'scratching') return;
    eClientXLast = e.clientX; eClientYLast = e.clientY;
    const [x, y] = pointerPos(e); scratchAt(x, y);
    if (!ctx.lowPerf && !ctx.cardTiltBound) { /* 视差由 wall 视图统一绑定 */ }
  });
  cover.addEventListener('pointerup', () => { drawing = false; });
  cover.addEventListener('pointercancel', () => { drawing = false; });

  function checkProgress() {
    const w = cover.width, h = cover.height;
    let data;
    try { data = cctx.getImageData(0, 0, w, h).data; } catch (_) { return; }
    let clear = 0, total = 0;
    for (let i = 3; i < data.length; i += 4 * 16) { total++; if (data[i] < 128) clear++; }
    if (total && clear / total >= .6) reveal(true);
  }

  function reveal(withFx) {
    if (state !== 'scratching') return;
    state = 'opened';
    cover.classList.add('clear');
    if (confirmBtn) { confirmBtn.remove(); confirmBtn = null; }
    if (withFx && !ctx.lowPerf) {
      const r = el.getBoundingClientRect();
      coinBurst(r.left + r.width / 2, r.top + r.height / 2);
      sfx.coinBurst();
    }
    ctx.onPacketRevealed(bind);
  }

  function addConfirm() {
    if (confirmBtn || state !== 'scratching') return;
    confirmBtn = document.createElement('button');
    confirmBtn.className = 'rp-confirm'; confirmBtn.textContent = '确认全部显示';
    confirmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sfx.click();
      reveal(false);
    });
    el.appendChild(confirmBtn);
  }

  function open() {
    if (state !== 'closed') return;
    state = 'scratching';
    front.style.display = 'none';
    prize.style.display = 'flex';
    cover.style.display = 'block';
    drawCover();
    addConfirm();
  }

  function markOpened() {
    state = 'opened';
    el.classList.add('opened');
    cover.style.display = 'none';
    if (confirmBtn) { confirmBtn.remove(); confirmBtn = null; }
    if (!el.querySelector('.rp-stamp')) {
      const stamp = document.createElement('div'); stamp.className = 'rp-stamp'; stamp.textContent = '已开';
      el.appendChild(stamp);
    }
  }

  function reset(newItem) {
    bind.item = newItem || bind.item;
    state = 'closed';
    el.classList.remove('opened');
    const stamp = el.querySelector('.rp-stamp'); if (stamp) stamp.remove();
    cover.classList.remove('clear');
    cover.style.display = 'none';
    front.style.display = 'flex';
    prize.style.display = 'none';
    prize.innerHTML = `${bind.item.isPenalty ? iconWarn() : iconGift()}<div class="rp-prize-name">${bind.item.isPenalty ? '<span class="penalty-badge">惩罚</span>' : ''}${bind.item.name}</div>`;
    if (confirmBtn) { confirmBtn.remove(); confirmBtn = null; }
    moves = 0; drawing = false;
  }

  el.addEventListener('click', (e) => {
    if (state !== 'closed') return;
    if (e.target.closest('.rp-confirm')) return;
    sfx.click();
    ctx.onPacketClick(bind);
  });

  el.addEventListener('pointermove', (e) => {
    if (ctx.lowPerf || state !== 'closed') return;
    const r = el.getBoundingClientRect();
    const ry = ((e.clientX - r.left) / r.width - .5) * 12;
    el.style.setProperty('--ry', ry.toFixed(2) + 'deg');
  });
  el.addEventListener('pointerleave', () => el.style.setProperty('--ry', '0deg'));

  return { el, bind, open, markOpened, reset, reveal, get state() { return state; }, get item() { return bind.item; } };
}
