// 转盘组件：2.5D 盘面、24 灯泡、SVG 扇区 textPath、指针、倒影、rAF 缓动转动
import { iconNeedle } from './icons.js';
import { sfx } from '../composables/useAudio.js';
import { createPrng } from '../composables/usePrng.js';

const C = 250, R = 250;
const polar = (r, deg) => {
  const a = (deg - 90) * Math.PI / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const f = (n) => Math.round(n * 100) / 100;

function fontSizeFor(n, u) {
  const base = n <= 6 ? 30 : n <= 10 ? 24 : n <= 16 ? 19 : 15;
  return base * u;
}

function sectorSvg(items, u) {
  const n = items.length;
  const seg = 360 / n;
  let parts = [];
  for (let i = 0; i < n; i++) {
    const a0 = i * seg, a1 = (i + 1) * seg;
    const [x0, y0] = polar(R, a0), [x1, y1] = polar(R, a1);
    parts.push(`<path class="sector" data-i="${i}" d="M ${C} ${C} L ${f(x0)} ${f(y0)} A ${R} ${R} 0 0 1 ${f(x1)} ${f(y1)} Z" fill="${i % 2 ? '#6b0d16' : '#a31120'}" stroke="#c9a227" stroke-width="${f(2 * u)}"/>`);
  }
  const rText = R * .62;
  let fs = fontSizeFor(n, u);
  for (let i = 0; i < n; i++) {
    const a0 = i * seg + seg * .06, a1 = (i + 1) * seg - seg * .06;
    const mid = (i + .5) * seg;
    const flip = mid > 90 && mid < 270;
    const [sx, sy] = polar(rText, flip ? a1 : a0);
    const [ex, ey] = polar(rText, flip ? a0 : a1);
    const sweep = flip ? 0 : 1;
    const pathId = `arc${i}`;
    const arcLen = rText * (a1 - a0) * Math.PI / 180;
    const name = items[i].name;
    let size = fs;
    if (name.length * size > arcLen * .82 * u * 4.2) size = Math.max(13 * u, size);
    const twoLines = name.length * size > arcLen * .82 * u * 4.2;
    const lines = twoLines ? [name.slice(0, Math.ceil(name.length / 2)), name.slice(Math.ceil(name.length / 2))] : [name];
    let text = '';
    for (let k = 0; k < lines.length; k++) {
      text += `<text class="sector-text" style="font-size:${f(size)}px"><textPath href="#${pathId}" startOffset="50%" text-anchor="middle"${k ? ` dy="${f(1.2 * size)}"` : ''}>${lines[k]}</textPath></text>`;
    }
    parts.push(`<path id="${pathId}" d="M ${f(sx)} ${f(sy)} A ${f(rText)} ${f(rText)} 0 0 ${sweep} ${f(ex)} ${f(ey)}" fill="none" stroke="none"/>` + text);
  }
  return parts.join('');
}

export function createWheel(host, ctx) {
  const wrapper = document.createElement('div');
  wrapper.className = 'wheel-stage';
  wrapper.innerHTML = `
    <div class="wheel-3d">
      <div class="wheel-plane">
        <div class="wheel-halo"></div>
        <div class="wheel-side"></div>
        <div class="wheel-spin">
          <div class="wheel-lamps"></div>
          <div class="wheel-rim"></div>
          <div class="wheel-disc"><svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg"></svg></div>
        </div>
        <button class="wheel-center" aria-label="开始抽奖">开始</button>
        <div class="wheel-needle">${iconNeedle()}</div>
      </div>
      <div class="wheel-reflection"></div>
      <div class="wheel-floor-shadow"></div>
    </div>`;
  host.appendChild(wrapper);

  const plane = wrapper.querySelector('.wheel-plane');
  const discBox = wrapper.querySelector('.wheel-spin');
  const discSvg = wrapper.querySelector('.wheel-disc svg');
  const lampBox = wrapper.querySelector('.wheel-lamps');
  const centerBtn = wrapper.querySelector('.wheel-center');
  const needle = wrapper.querySelector('.wheel-needle');
  const reflection = wrapper.querySelector('.wheel-reflection');

  let spinning = false;
  let raf = 0;
  let currentAngle = 0;
  let lamps = [];
  let winOverlay = null;

  function rebuild() {
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
    const n = ctx.wheelItems.length;
    const d = `min(calc(100vh - 340*var(--u)), calc((100vw - 560*var(--u)) * 0.78))`;
    plane.style.setProperty('--wheel-d', `max(calc(520*var(--u)), ${d})`);
    wrapper.querySelector('.wheel-3d').style.width = plane.style.getPropertyValue('--wheel-d');
    wrapper.querySelector('.wheel-3d').style.height = plane.style.getPropertyValue('--wheel-d');
    discSvg.innerHTML = sectorSvg(ctx.wheelItems, u);
    reflection.innerHTML = `<div style="position:absolute;inset:0;width:100%;height:100%;border-radius:50%;overflow:hidden">${discSvg.innerHTML}</div>`;
    const lampCount = ctx.lowPerf ? 12 : 24;
    lampBox.innerHTML = '';
    lamps = [];
    const lampR = .94; // 灯泡圆周半径 = (D - 18u)/2，落在环带中央
    for (let i = 0; i < lampCount; i++) {
      const lamp = document.createElement('i');
      lamp.className = 'wheel-lamp' + (i % 2 ? ' dark' : '');
      const a = (i / lampCount) * 2 * Math.PI;
      lamp.style.left = `calc(${50 + Math.cos(a) * 50 * lampR}% + ${Math.cos(a) * 7 * u}px)`;
      lamp.style.top = `calc(${50 + Math.sin(a) * 50 * lampR}% + ${Math.sin(a) * 7 * u}px)`;
      lamp.style.animationDelay = `${(i % lampCount) * (ctx.lowPerf ? 20 : 5)}ms`;
      lampBox.appendChild(lamp); lamps.push(lamp);
    }
    if (winOverlay) winOverlay = null;
    setLampDur(120);
  }

  function setLampDur(ms) {
    plane.style.setProperty('--lamp-dur', `${Math.round(ms)}ms`);
  }

  function clearWin() {
    if (winOverlay) { winOverlay.remove(); winOverlay = null; }
  }
  function highlight(index) {
    const p = discSvg.querySelector(`.sector[data-i="${index}"]`);
    if (!p) return;
    winOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    winOverlay.setAttribute('d', p.getAttribute('d'));
    winOverlay.setAttribute('class', 'sector-win-overlay');
    discSvg.appendChild(winOverlay);
  }

  function spin(itemIndex, seed) {
    if (spinning) return;
    spinning = true;
    sfx.click(); sfx.spinStart(); sfx.spinLoopStart();
    clearWin();
    centerBtn.classList.add('spinning');
    centerBtn.textContent = '转动中';
    needle.classList.remove('bouncing'); needle.classList.add('shaking');
    const n = ctx.wheelItems.length;
    const seg = 360 / n;
    const rnd = createPrng(seed[0] ^ (seed[1] << 1));
    const turns = ctx.config.转盘设置.最少旋转圈数 + Math.floor(rnd() * 2);
    const jitter = (rnd() - .5) * seg * .6;
    const target = 360 * turns - (itemIndex * seg + seg / 2) + jitter;
    const start = currentAngle;
    const duration = ctx.config.转盘设置.转动时长毫秒;
    const t0 = performance.now();
    let lastStep = Math.floor(((start % 360) + 360) % 360 / seg);
    let lastTick = 0;

    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 5);
      currentAngle = start + (target - start) * eased;
      discBox.style.transform = `rotate(${currentAngle}deg)`;
      discBox.style.willChange = 'transform';
      sfx.spinLoopRate(p);
      setLampDur(ctx.lowPerf ? 240 + 660 * p * p : 120 + 500 * p * p);
      if (!ctx.lowPerf) {
        if (p <= .62) plane.classList.add('blurring');
        else { plane.classList.remove('blurring'); }
      }
      if (p > .5) {
        const step = Math.floor((((currentAngle % 360) + 360) % 360) / seg);
        if (step !== lastStep) {
          lastStep = step;
          if (now - lastTick > 60) { sfx.decelTick(); lastTick = now; }
        }
      }
      if (p < 1) { raf = requestAnimationFrame(tick); return; }
      finish();
    };
    const finish = () => {
      cancelAnimationFrame(raf);
      plane.classList.remove('blurring');
      setLampDur(120);
      sfx.spinLoopStop();
      needle.classList.remove('shaking');
      needle.classList.add('bouncing');
      centerBtn.classList.remove('spinning');
      centerBtn.textContent = '开始';
      highlight(itemIndex);
      spinning = false;
      setTimeout(() => ctx.onSpinDone(itemIndex), 200);
    };
    raf = requestAnimationFrame(tick);
  }

  centerBtn.addEventListener('click', () => {
    if (spinning) return;
    ctx.onStartWheel();
  });

  ctx.subscribe(() => { if (!spinning) rebuild(); });
  rebuild();
  return { el: wrapper, spin, rebuild, highlight, clearWin, get spinning() { return spinning; }, destroy() { cancelAnimationFrame(raf); } };
}
