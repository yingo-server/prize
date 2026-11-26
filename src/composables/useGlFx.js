// GPU 加速特效层：WebGL2 优先（失败回退 WebGL1 → Canvas2D），
// 承载飘落金粒子 / 彩带 / 金币雨 / 烟花，以及刮开碎屑 / 金币爆出。
// 粒子物理优先调用 WASM particle_step，失败自动 JS。
import { particle_step } from './useWasm.js';

let canvas = null, gl = null, ctx2d = null, mode = 'none';
let program = null, vao = null, buffer = null;
let uRes = null, uTime = null;
let running = false, raf = 0, last = 0;
let lowPerf = false;
const particles = [];
const MAX = 1400;
const STRIDE = 13; // x,y,vx,vy,life,maxLife,type,r,g,b,size,rot,vr

const VERT = `#version 300 es
precision highp float;
in vec2 aPos; in vec4 aColor; in float aSize;
uniform vec2 uRes; uniform float uTime;
out vec4 vColor;
void main(){
  vec2 clip = (aPos / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = aSize;
  vColor = aColor;
}`;
const FRAG = `#version 300 es
precision highp float;
in vec4 vColor; out vec4 outColor;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.1, length(d));
  outColor = vec4(vColor.rgb, vColor.a * a);
}`;
const VERT1 = `
precision highp float;
attribute vec2 aPos; attribute vec4 aColor; attribute float aSize;
uniform vec2 uRes; uniform float uTime;
varying vec4 vColor;
void main(){
  vec2 clip = (aPos / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = aSize;
  vColor = aColor;
}`;
const FRAG1 = `
precision highp float;
varying vec4 vColor;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.1, length(d));
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
  return s;
}
function initGL() {
  const opts = { alpha: true, premultipliedAlpha: false, antialias: true, powerPreference: 'high-performance' };
  gl = canvas.getContext('webgl2', opts);
  if (gl) {
    const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (vs && fs) {
      program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
        vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const stride = STRIDE * 4;
        const locP = gl.getAttribLocation(program, 'aPos');
        const locC = gl.getAttribLocation(program, 'aColor');
        const locS = gl.getAttribLocation(program, 'aSize');
        gl.enableVertexAttribArray(locP); gl.vertexAttribPointer(locP, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(locC); gl.vertexAttribPointer(locC, 4, gl.FLOAT, false, stride, 8);
        gl.enableVertexAttribArray(locS); gl.vertexAttribPointer(locS, 1, gl.FLOAT, false, stride, 24);
        gl.useProgram(program);
        uRes = gl.getUniformLocation(program, 'uRes'); uTime = gl.getUniformLocation(program, 'uTime');
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        mode = 'webgl2'; return;
      }
    }
    gl = null;
  }
  gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  if (gl) {
    const vs = compile(gl.VERTEX_SHADER, VERT1), fs = compile(gl.FRAGMENT_SHADER, FRAG1);
    if (vs && fs) {
      program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
        buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const stride = STRIDE * 4;
        const locP = gl.getAttribLocation(program, 'aPos');
        const locC = gl.getAttribLocation(program, 'aColor');
        const locS = gl.getAttribLocation(program, 'aSize');
        gl.enableVertexAttribArray(locP); gl.vertexAttribPointer(locP, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(locC); gl.vertexAttribPointer(locC, 4, gl.FLOAT, false, stride, 8);
        gl.enableVertexAttribArray(locS); gl.vertexAttribPointer(locS, 1, gl.FLOAT, false, stride, 24);
        gl.useProgram(program);
        uRes = gl.getUniformLocation(program, 'uRes'); uTime = gl.getUniformLocation(program, 'uTime');
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        mode = 'webgl1'; return;
      }
    }
    gl = null;
  }
  ctx2d = canvas.getContext('2d');
  mode = ctx2d ? 'canvas2d' : 'none';
}

export function initFx(canvasEl, low = false) {
  canvas = canvasEl; lowPerf = low;
  initGL(); resize();
  return { mode, renderer: (() => { try { const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : mode; } catch (_) { return mode; } })() };
}

export function setFxLowPerf(low) {
  lowPerf = !!low;
  if (lowPerf) {
    particles.length = 0;
    for (const p of particles) void p;
    particles.splice(0);
  }
}

export function resize() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
  if (ctx2d) ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function push(p) { if (particles.length < MAX) particles.push(p); }

function makeParticle(type, x, y, vx, vy, life, color, size) {
  const [r, g, b] = color;
  return [x, y, vx, vy, life, life, type, r, g, b, size, Math.random() * 6.28, (Math.random() - .5) * 8];
}

// 常态：80 颗飘落金色粒子（低性能关闭）
export function startAmbient() {
  if (lowPerf) return;
  const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
  for (let i = 0; i < 80; i++) {
    push(makeParticle(0, Math.random() * innerWidth, -20 - Math.random() * innerHeight,
      (Math.random() - .5) * 18 * u, 18 + Math.random() * 34 * u,
      12 + Math.random() * 14, [1, .82 + Math.random() * .18, .35 + Math.random() * .3], (2 + Math.random() * 4) * u));
  }
  start();
}

// 中奖全屏特效：彩带 140 / 金币雨 60 / 烟花 3 组 × 24 射线（低性能全部关闭）
export function winFx() {
  if (lowPerf) return;
  const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
  const W = innerWidth, H = innerHeight;
  for (let i = 0; i < 140; i++) {
    const from = i % 3;
    const x = from === 0 ? W * .1 + Math.random() * W * .15 : from === 1 ? W * .45 + Math.random() * W * .1 : W * .85 - Math.random() * W * .15;
    push(makeParticle(1, x, -30 - Math.random() * 100, (Math.random() - .5) * 260 * u, 140 + Math.random() * 260 * u,
      2.6, [[.9,.15,.2],[1,.75,.25],[.95,.85,.45],[.8,.6,.95]][i % 4], (12 + Math.random() * 12) * u));
  }
  for (let i = 0; i < 60; i++) {
    push(makeParticle(2, Math.random() * W, -30 - Math.random() * H * .5, (Math.random() - .5) * 100 * u, 200 + Math.random() * 240 * u,
      2.6 + Math.random(), [1, .85 - Math.random() * .2, .2 + Math.random() * .2], (10 + Math.random() * 10) * u));
  }
  for (let k = 0; k < 3; k++) {
    const cx = W * (.2 + Math.random() * .6), cy = H * (.15 + Math.random() * .3);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, sp = (180 + Math.random() * 220) * u;
      push(makeParticle(3, cx, cy, Math.cos(a) * sp, Math.sin(a) * sp, 1.2,
        [[1,.9,.5],[1,.45,.3],[.9,.8,1]][k % 3], (4 + Math.random() * 6) * u));
    }
  }
  start();
}

// 刮开碎屑银粒子：每次移动生成 2~3 颗（低性能关闭）
export function scratchDebris(x, y) {
  if (lowPerf) return;
  const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    push(makeParticle(4, x, y, (Math.random() - .5) * 180 * u, -60 - Math.random() * 120 * u, 0.6,
      [.784, .8, .831], (3 + Math.random() * 3) * u));
  }
  start();
}

// 金币爆出：从卡片中心向四周抛射 20 枚 + 音效由调用方触发
export function coinBurst(cx, cy) {
  const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + Math.random() * .3, sp = (220 + Math.random() * 260) * u;
    push(makeParticle(2, cx, cy, Math.cos(a) * sp, Math.sin(a) * sp - 120 * u, 1.2 + Math.random() * .5,
      [1, .85, .25], (8 + Math.random() * 8) * u));
  }
  start();
}

function start() {
  if (running) return;
  running = true; last = performance.now();
  raf = requestAnimationFrame(loop);
}
export function stopFx() {
  running = false; cancelAnimationFrame(raf);
  particles.length = 0;
  if (gl) gl.clear(gl.COLOR_BUFFER_BIT);
  if (ctx2d) ctx2d.clearRect(0, 0, innerWidth, innerHeight);
}
function isFiniteParticle(p) { return Number.isFinite(p[0]) && Number.isFinite(p[1]); }

// 物理：优先 WASM particle_step（每次最多 5 个一组，用 Float32Array）
const wasmBuf = new Float32Array(5);
function physics(dt) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const gravity = p[6] === 1 ? 220 : p[6] === 3 ? 120 : p[6] === 4 ? 520 : 420;
    const drag = p[6] === 3 ? .96 : p[6] === 1 ? .995 : .99;
    wasmBuf[0] = p[0]; wasmBuf[1] = p[1]; wasmBuf[2] = p[2]; wasmBuf[3] = p[3]; wasmBuf[4] = p[4];
    particle_step(wasmBuf, dt, gravity, drag);
    if (isFiniteParticle(wasmBuf)) { p[0] = wasmBuf[0]; p[1] = wasmBuf[1]; p[2] = wasmBuf[2]; p[3] = wasmBuf[3]; p[4] = wasmBuf[4]; }
    else { p[4] -= dt; }
    p[12] += p[11] * dt;
    if (p[6] === 1) p[12] += dt * 6;
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (p[4] <= 0 || p[1] > innerHeight + 80 || p[0] < -120 || p[0] > innerWidth + 120) particles.splice(i, 1);
  }
}

function renderGL(time) {
  const data = new Float32Array(particles.length * STRIDE);
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i], o = i * STRIDE;
    const alpha = Math.min(1, p[4] / Math.min(p[5], .4));
    data[o] = p[0]; data[o + 1] = p[1];
    data[o + 2] = p[2]; data[o + 3] = p[3];
    data[o + 4] = p[7]; data[o + 5] = p[8]; data[o + 6] = p[9]; data[o + 7] = alpha;
    data[o + 8] = p[10]; data[o + 9] = p[11]; data[o + 10] = p[12]; data[o + 11] = p[11];
    data[o + 12] = time;
  }
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (!particles.length) return;
  gl.useProgram(program);
  if (vao) gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  gl.uniform2f(uRes, canvas.width, canvas.height);
  gl.uniform1f(uTime, time);
  gl.drawArrays(gl.POINTS, 0, particles.length);
}
function render2d() {
  ctx2d.clearRect(0, 0, innerWidth, innerHeight);
  for (const p of particles) {
    const alpha = Math.min(1, p[4] / Math.min(p[5], .4));
    ctx2d.save();
    ctx2d.globalAlpha = alpha;
    ctx2d.translate(p[0], p[1]);
    ctx2d.rotate(p[12]);
    ctx2d.fillStyle = `rgba(${p[7]*255|0},${p[8]*255|0},${p[9]*255|0},1)`;
    if (p[6] === 1) ctx2d.fillRect(-p[10]/2, -p[10], p[10], p[10]*2);
    else { ctx2d.beginPath(); ctx2d.arc(0, 0, p[10]/2, 0, 6.283); ctx2d.fill(); }
    ctx2d.restore();
  }
}

function loop(now) {
  if (!running) return;
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  physics(dt);
  const t = now / 1000;
  if (mode === 'webgl2' || mode === 'webgl1') renderGL(t);
  else if (mode === 'canvas2d') render2d();
  if (!particles.length) { running = false; return; }
  raf = requestAnimationFrame(loop);
}
