// 顶部公共栏（全视图常驻，z30）：六按钮、视图名、统计、胶囊开关、全屏
import { TB_ICONS } from '../components/icons.js';
import { sfx } from '../composables/useAudio.js';

export function createTopBar(root, ctx) {
  const el = document.createElement('header');
  el.className = 'topbar';
  el.innerHTML = `
    <div class="topbar-side left"></div>
    <div class="topbar-title"></div>
    <div class="topbar-side right"></div>`;
  root.appendChild(el);
  const left = el.querySelector('.left');
  const titleEl = el.querySelector('.topbar-title');
  const right = el.querySelector('.right');

  function btn(key, label, icon, extra = '') {
    return `<button class="tb-btn ${extra}" data-key="${key}" title="${label}">${icon}<span class="tb-label">${label}</span></button>`;
  }
  function capsule(key, on, icon) {
    return `<button class="capsule ${on ? 'on' : 'off'}" data-key="${key}" role="switch" aria-checked="${on}">
      <span class="capsule-knob">${icon}</span></button>`;
  }

  function render() {
    const v = ctx.view;
    left.innerHTML = [
      btn('back', '返回首页', TB_ICONS.back, v === 'home' ? 'hidden-slot' : ''),
      btn('swap', v === 'wheel' ? '切到红包墙' : '切到转盘', TB_ICONS.swap, v === 'home' ? 'hidden-slot' : ''),
      btn('full', '全屏', document.fullscreenElement ? TB_ICONS.exitFull : TB_ICONS.full),
      capsule('sound', ctx.soundOn, ctx.soundOn ? TB_ICONS.sound : TB_ICONS.mute),
      capsule('low', ctx.lowPerf, TB_ICONS.battery),
      btn('reset', '重置本场', TB_ICONS.reset),
    ].join('');
    titleEl.textContent = v === 'wheel' ? '转盘抽奖' : v === 'wall' ? '红包墙刮刮乐' : '';
    const valid = ctx.config.奖品.filter((p) => !p.isPenalty || ctx.penaltyOn).filter((p) => p.stock > 0).length;
    const stock = ctx.config.奖品.reduce((s, p) => s + p.stock, 0);
    right.innerHTML = `<span class="tb-stats ${stock === 0 ? 'warn' : ''}">有效奖品 ${valid} 项 · 总库存 ${stock}${stock === 0 ? ' · 库存已清空' : ''}</span>`;
  }

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-key]');
    if (!t) return;
    const key = t.dataset.key;
    if (key === 'back' || key === 'swap' || key === 'full' || key === 'reset') sfx.click();
    ctx.onTopAction(key);
  });
  document.addEventListener('fullscreenchange', render);

  ctx.subscribe(render);
  render();
  return { el, render };
}
