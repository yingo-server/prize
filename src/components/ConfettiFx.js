// 全屏彩带/金币雨/烟花特效层：包装 useGlFx，视图切换与重置时按要求清理
import { winFx, startAmbient, stopFx, setFxLowPerf, resize, initFx } from '../composables/useGlFx.js';

export function createConfettiFx(canvas, ctx) {
  const info = initFx(canvas, ctx.lowPerf);
  window.addEventListener('resize', resize);
  setTimeout(() => { if (!ctx.lowPerf) startAmbient(); }, 200);
  ctx.subscribe(() => {
    setFxLowPerf(ctx.lowPerf);
    if (ctx.lowPerf) stopFx();
  });
  return {
    info,
    win() { if (!ctx.lowPerf) winFx(); },
    reset() { stopFx(); if (!ctx.lowPerf) startAmbient(); },
    stop() { stopFx(); },
  };
}
