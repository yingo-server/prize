// 结果弹窗（遮罩 z50 / 内容 z51）：丝带、大图标、奖品名、种子、惩罚重抽提示、关闭动画
import { iconGift, iconWarn } from './icons.js';
import { sfx } from '../composables/useAudio.js';

export function createPrizeResultModal(root, ctx) {
  let el = null, timer = null, currentClosed = null;

  function close() {
    if (!el) return;
    if (timer) clearTimeout(timer);
    const closed = currentClosed;
    const node = el;
    currentClosed = null;
    el = null;
    node.classList.add('closing');
    setTimeout(() => { node.remove(); }, 300);
    if (closed) closed();
    ctx.onModalClosed();
  }

  function show(result, opts = {}) {
    const { retryTip = '', buttonLabel = '继续抽奖', onButton = null, modalClosed = null } = opts;
    if (el) { el.remove(); el = null; }
    el = document.createElement('div');
    el.className = 'modal-mask';
    const penalty = !!result.isPenalty;
    el.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-beam"></div>
        <div class="modal-shockwave"></div>
        <div class="modal-ribbon ${penalty ? 'penalty' : ''}">${penalty ? '很遗憾' : '恭喜中奖'}</div>
        <div class="modal-icon-wrap">
          <span class="modal-ring"></span><span class="modal-ring two"></span>
          ${penalty ? iconWarn() : iconGift()}
        </div>
        <div class="modal-name ${penalty ? 'penalty' : ''}">${result.name}</div>
        ${penalty ? '<div class="modal-tag">惩罚项目</div>' : ''}
        <div class="modal-stock">剩余库存：${result.stock}</div>
        <button class="modal-btn">${buttonLabel}</button>
        <div class="modal-seed">本次种子：${result.seedText}</div>
        ${retryTip ? `<div class="modal-retry-tip">${retryTip}</div>` : ''}
      </div>`;
    root.appendChild(el);
    currentClosed = modalClosed;
    el.querySelector('.modal-btn').addEventListener('click', () => {
      sfx.click();
      if (onButton) onButton(); else close();
    });
    el.addEventListener('click', (e) => { if (e.target === el && !retryTip) close(); });
    return { close, setRetryTip(text) { const t = el?.querySelector('.modal-retry-tip'); if (t) t.textContent = text; } };
  }

  function setSeed(text) {
    const t = el?.querySelector('.modal-seed');
    if (t) t.textContent = '本次种子：' + text;
  }

  return { show, close, setSeed, get visible() { return !!el; } };
}
