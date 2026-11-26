// 剩余库存列表：图标 / 名称 / 库存数，库存变化数字跳动，底部提示区
import { iconGift, iconWarn } from './icons.js';

export function createStockList(host, ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'stock-panel';
  wrap.innerHTML = `<div class="stock-title">剩余库存</div><div class="stock-list"></div><div class="panel-hint"></div>`;
  host.appendChild(wrap);
  const list = wrap.querySelector('.stock-list');
  const hint = wrap.querySelector('.panel-hint');
  let prev = {};

  function render() {
    const items = ctx.wheelItems;
    const html = items.map((p) => {
      const isNew = prev[p.id] !== undefined && prev[p.id] !== p.stock;
      const badge = p.isPenalty ? `<span class="penalty-badge">[惩]</span>` : '';
      return `<div class="stock-row" data-id="${p.id}">
        ${p.isPenalty ? iconWarn() : iconGift()}
        <div class="stock-name">${badge}${p.name}</div>
        <div class="stock-count ${p.stock <= 2 ? 'low' : ''} ${isNew ? 'pop' : ''}" data-count="${p.id}">${p.stock}</div>
      </div>`;
    }).join('');
    list.innerHTML = html;
    prev = Object.fromEntries(items.map((p) => [p.id, p.stock]));

    const valid = items.filter((p) => (!p.isPenalty || ctx.penaltyOn) && p.stock > 0);
    if (items.every((p) => p.stock === 0)) {
      hint.className = 'panel-hint warn-box';
      hint.innerHTML = `<div>奖品库存已清空，请重置本场</div><button data-act="reset">重置本场</button>`;
      hint.querySelector('button').addEventListener('click', () => ctx.onTopAction('reset'));
    } else if (valid.length === 0) {
      hint.className = 'panel-hint';
      hint.textContent = '没有可抽取的非惩罚奖品，请检查 Price/ 配置或关闭惩罚项禁用';
    } else {
      hint.className = 'panel-hint';
      hint.textContent = '概率 = 权重 ÷ 有效权重总和';
    }
  }
  ctx.subscribe(render); render();
  return { el: wrap, render };
}
