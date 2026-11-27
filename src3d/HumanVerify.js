// 人机验证彩蛋弹窗：抽中惩罚项时，结果展示前 0.5s 弹出，验证通过才放行结果
// 简单加减法 + 拟人问候语（"你是人类吗？"）
import { sfx } from '../src/composables/useAudio.js';

export function createHumanVerify(host) {
  let el = null;
  let resolver = null;

  function show(cfg) {
    return new Promise((resolve) => {
      resolver = resolve;
      const opts = cfg.人机验证 || {};
      const hi = opts.问候语 || ['你是人类吗？'];
      const pass = opts.通过语 || ['嗯，像个人类。'];
      const [lo, hiN] = opts.范围 || [2, 9];
      const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
      const greeting = hi[Math.floor(Math.random() * hi.length)];
      const passMsg = pass[Math.floor(Math.random() * pass.length)];
      // 随机加减法（保证非负）
      let a = rnd(lo, hiN), b = rnd(lo, hiN);
      const isAdd = Math.random() < .5;
      if (!isAdd && b > a) [a, b] = [b, a];
      const answer = isAdd ? a + b : a - b;
      const expr = `${a} ${isAdd ? '+' : '−'} ${b} = ?`;

      el = document.createElement('div');
      el.className = 'hv-mask';
      el.innerHTML = `
        <div class="hv-card">
          <div class="hv-bot">🤖</div>
          <div class="hv-greet">${greeting}</div>
          <div class="hv-expr">${expr}</div>
          <div class="hv-row">
            <input class="hv-input" inputmode="numeric" autocomplete="off" placeholder="答案" />
            <button class="hv-ok">确认</button>
          </div>
          <div class="hv-tip">通过后继续 · 就差一步</div>
        </div>`;
      host.appendChild(el);
      sfx.retry?.();

      const input = el.querySelector('.hv-input');
      const ok = el.querySelector('.hv-ok');
      const tip = el.querySelector('.hv-tip');
      setTimeout(() => input.focus(), 80);

      const fail = () => {
        tip.textContent = '不对哦，再想想？（机器人检测 +1）';
        tip.classList.add('warn');
        el.classList.add('hv-shake');
        setTimeout(() => el.classList.remove('hv-shake'), 420);
        input.select();
      };
      const succeed = () => {
        tip.textContent = passMsg;
        tip.classList.remove('warn');
        el.classList.add('hv-pass');
        sfx.win?.();
        setTimeout(finish, 700);
      };
      const check = () => {
        if (parseInt(input.value, 10) === answer) succeed();
        else fail();
      };
      ok.addEventListener('click', check);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    });
  }

  function finish() {
    if (!el) return;
    el.classList.add('closing');
    setTimeout(() => el?.remove(), 300);
    el = null;
    const r = resolver; resolver = null;
    r?.();
  }

  return { show };
}
