// 入口：样式 → 背景 Canvas → 实例化 App → 初始化 WASM / 音频 / 粒子特效
import './styles/main.css';
import './styles/views.css';
import { App } from './App.js';
import { initWasm } from './composables/useWasm.js';
import { initAudio } from './composables/useAudio.js';

const root = document.getElementById('app');

const particleCanvas = document.createElement('canvas');
particleCanvas.id = 'particle-layer';
document.body.appendChild(particleCanvas);

const fxCanvas = document.createElement('canvas');
fxCanvas.id = 'fx-layer';
document.body.appendChild(fxCanvas);

const app = new App(root, { fxCanvas, particleCanvas });
window.__prizeApp = app;

initWasm();      // /prize.wasm 加载失败自动 JS 回退
initAudio();     // 首次 pointerdown 创建 AudioContext

window.addEventListener('resize', () => {
  // 视口变化后 Canvas 由 useGlFx 自行 resize
});
