// 惩罚项开关（转盘右栏顶部）：整块点击切换，联动音效
import { iconBan } from './icons.js';
import { sfx } from '../composables/useAudio.js';

export function createPenaltySwitch(host, ctx) {
  const el = document.createElement('button');
  el.className = 'penalty-box';
  el.setAttribute('role', 'switch');
  el.innerHTML = `
    <span class="penalty-icon">${iconBan()}</span>
    <span class="penalty-text"><b>惩罚项</b><small></small></span>
    <span class="penalty-slider"><i></i></span>`;
  const status = document.createElement('div');
  status.className = 'penalty-status gold-text';
  host.appendChild(el); host.appendChild(status);

  function render() {
    const on = ctx.penaltyOn;
    el.classList.toggle('enabled', on);
    el.setAttribute('aria-checked', String(on));
    el.querySelector('small').textContent = on ? '已启用 · 抽中正常生效' : '已禁用 · 抽中自动重抽';
    status.textContent = on ? '惩罚项已启用' : '惩罚项已禁用';
  }
  el.addEventListener('click', () => {
    sfx.click();
    const on = !ctx.penaltyOn;
    if (on) sfx.toggleOn(); else sfx.toggleOff();
    ctx.setPenalty(on);
  });
  ctx.subscribe(render); render();
  return { el, render };
}
