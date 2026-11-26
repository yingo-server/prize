// 转盘页 view==='wheel'：左转盘舞台 + 右库存面板 / 惩罚开关
import { createWheel } from '../components/Wheel.js';
import { createPenaltySwitch } from '../components/PenaltySwitch.js';
import { createStockList } from '../components/StockList.js';

export function createWheelView(host, ctx) {
  const el = document.createElement('section');
  el.className = 'view-root wheel-view';
  const stage = document.createElement('div');
  const panel = document.createElement('div');
  panel.className = 'wheel-panel';
  el.appendChild(stage); el.appendChild(panel);
  host.appendChild(el);
  const wheel = createWheel(stage, ctx);
  createPenaltySwitch(panel, ctx);
  createStockList(panel, ctx);
  return { el, wheel, destroy() { wheel.destroy(); } };
}
