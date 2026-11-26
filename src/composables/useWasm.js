// WASM 加载器：加载 /prize.wasm（Rust 源在 src-wasm，勿动），失败时 JS 优雅回退。
// 导出包装：randomWords / seed_with / particle_step。
import { hashSeed } from './usePrng.js';

let instance = null;
let ready = false;
let usingFallback = true;
let loadPromise = null;

function jsRandomWords(n) {
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = (Math.random() * 4294967296) >>> 0;
  return out;
}

function jsParticleStep(data, dt, gravity = 520, drag = 0.985) {
  for (let o = 0; o < data.length; o += 5) {
    data[o + 2] *= drag;
    data[o + 3] = data[o + 3] * drag + gravity * dt;
    data[o] += data[o + 2] * dt;
    data[o + 1] += data[o + 3] * dt;
    data[o + 4] -= dt;
  }
  return data;
}

// wasm-bindgen 的 Vec<i32> 返回值是线性内存指针 + 长度对；尽力读取，读不到就回退。
function readWordVector(exports, ptr, len) {
  try {
    if (typeof len !== 'number' || !exports.memory?.buffer) return null;
    const words = new Int32Array(exports.memory.buffer, ptr >>> 0, len);
    const out = new Uint32Array(len);
    for (let i = 0; i < len; i++) out[i] = words[i] >>> 0;
    return out;
  } catch (_) { return null; }
}

function tryCall(exports, name, args) {
  const fn = exports[name];
  if (typeof fn !== 'function') return undefined;
  try { return fn(...args); } catch (_) { return undefined; }
}

export function initWasm() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const res = await fetch('/prize.wasm');
      if (!res.ok) throw new Error('wasm HTTP ' + res.status);
      const bytes = await res.arrayBuffer();
      // 先尝试标准实例化（无 imports 的裸 wasm）；再尝试仅带最小 stub imports。
      let inst = null;
      try {
        inst = (await WebAssembly.instantiate(bytes, {})).instance;
      } catch (_) {
        const mod = await WebAssembly.compile(bytes);
        const imports = {};
        for (const imp of WebAssembly.Module.imports(mod)) {
          const modName = imp.module;
          imports[modName] = imports[modName] || {};
          for (const k of Object.keys(imports[modName])) void k;
          imports[modName][imp.name] = () => { throw new Error('wasm import unsupported: ' + imp.name); };
        }
        inst = await WebAssembly.instantiate(mod, imports);
      }
      const ex = inst.exports;
      // 必须至少暴露一个我们关心的函数才算可用
      if (!ex || (typeof ex.random_words !== 'function' && typeof ex.randomWords !== 'function')) {
        throw new Error('wasm exports unavailable');
      }
      instance = inst;
      usingFallback = false;
      ready = true;
    } catch (_) {
      instance = null; usingFallback = true; ready = true;
    }
    return { ok: !usingFallback, fallback: usingFallback };
  })();
  return loadPromise;
}

export function wasmReady() { return ready; }
export function isFallback() { return usingFallback; }

export function seed_with(seed) {
  const s = (seed >>> 0) || 0x9e3779b9;
  if (!usingFallback && instance) {
    const r = tryCall(instance.exports, 'seed_with', [s]);
    if (r !== undefined) return;
  }
  // JS 回退：记录全局种子，randomWords 在该种子上推进
  jsFallbackState = hashSeed(s);
}

let jsFallbackState = 0x9e3779b9;

export function randomWords(n = 4) {
  if (!usingFallback && instance) {
    const ex = instance.exports;
    let r = tryCall(ex, 'random_words', [n]);
    if (r === undefined) r = tryCall(ex, 'randomWords', [n]);
    if (typeof r === 'number') {
      const read = readWordVector(ex, r, n);
      if (read) return read;
    }
    if (r && typeof r.length === 'number') {
      const out = new Uint32Array(n);
      for (let i = 0; i < n; i++) out[i] = (r[i] >>> 0) || jsRandomWords(1)[0];
      return out;
    }
  }
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = jsFallbackState || 0x9e3779b9;
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    jsFallbackState = x;
    out[i] = x >>> 0;
  }
  return out;
}

export function particle_step(data, dt, gravity = 520, drag = 0.985) {
  if (!usingFallback && instance) {
    const before = data.slice ? data.slice(0, 5) : null;
    const r = tryCall(instance.exports, 'particle_step', [data, dt, gravity, drag]);
    if (r !== undefined && (!before || data[0] !== before[0] || data[1] !== before[1])) return data;
  }
  return jsParticleStep(data, dt, gravity, drag);
}
