// 首页 view==='home'：主标题、金色菱形分隔线、双入口按钮、底部信息条
import { iconWheel, iconPacket } from '../components/icons.js';
import { sfx } from '../composables/useAudio.js';

export function createHomeView(host, ctx) {
  const el = document.createElement('section');
  el.className = 'view-root home';
  el.innerHTML = `
    <h1 class="home-title gold-text">抽奖</h1>
    <div class="home-divider"></div>
    <div class="home-buttons">
      <button class="entry-btn" data-go="wheel">
        <span class="entry-dots"></span>${iconWheel()}
        <span class="entry-label gold-text">幸运转盘</span>
      </button>
      <button class="entry-btn" data-go="wall">
        <span class="entry-dots"></span>${iconPacket()}
        <span class="entry-label gold-text">红包墙</span>
      </button>
    </div>
    <div class="home-info"></div>`;

  // 按钮外圈跑马灯点（沿矩形周界每 60u 一颗，延迟递增 80ms）
  const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
  el.querySelectorAll('.entry-dots').forEach((box, bi) => {
    const w = 460 * u, h = 220 * u, inset = -14 * u, step = 60 * u;
    const perimeter = 2 * (w + h);
    const count = Math.max(4, Math.round(perimeter / step));
    let idx = 0;
    for (let i = 0; i < count; i++) {
      const t = (i / count) * perimeter;
      let x, y;
      if (t < w) { x = t; y = 0; }
      else if (t < w + h) { x = w; y = t - w; }
      else if (t < 2 * w + h) { x = w - (t - w - h); y = h; }
      else { x = 0; y = h - (t - 2 * w - h); }
      const dot = document.createElement('i');
      dot.style.left = (x + inset + 14 * u) + 'px';
      dot.style.top = (y + inset + 14 * u) + 'px';
      dot.style.animationDelay = ((idx++ + bi * 8) * 80) + 'ms';
      box.appendChild(dot);
    }
  });

  function renderInfo() {
    const drawCount = ctx.drawCount;
    const valid = ctx.config.奖品.filter((p) => (!p.isPenalty || ctx.penaltyOn) && p.stock > 0).length;
    el.querySelector('.home-info').innerHTML =
      `当前场次抽取 <span>·</span> ${drawCount} 次 <span>·</span> 有效奖品 ${valid} 项 <span>·</span> 惩罚项${ctx.penaltyOn ? '已启用' : '已禁用'}`;
  }
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-go]');
    if (!btn) return;
    sfx.click();
    ctx.go(btn.dataset.go);
  });
  ctx.subscribe(renderInfo); renderInfo();
  host.appendChild(el);
  return { el, renderInfo };
}
