// 32 位确定性伪随机数 + 种子洗牌（Fisher-Yates）
export function hashSeed(seed) {
  let h = seed >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

export function createPrng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  next.int32 = () => (next() * 4294967296) | 0;
  next.state = () => s >>> 0;
  return next;
}

// crypto.getRandomValues 生成 Uint32Array(4) 种子
export function freshSeed() {
  const arr = new Uint32Array(4);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 4; i++) arr[i] = (Math.random() * 4294967296) >>> 0;
  }
  return arr;
}

export function seedText(seed) {
  const arr = seed instanceof Uint32Array ? seed : new Uint32Array([seed >>> 0]);
  const groups = [];
  for (let i = 0; i < 4; i++) {
    const v = arr[i % arr.length] ^ (i * 0x9e3779b9);
    groups.push((v >>> 0).toString(16).padStart(8, '0'));
  }
  return groups.join(' ');
}

export function shuffle(list, seed) {
  const out = list.slice();
  const rnd = createPrng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

export function weightedPick(list, seed) {
  const rnd = createPrng(seed);
  const pool = list.filter((x) => x.stock > 0);
  if (!pool.length) return null;
  const total = pool.reduce((s, x) => s + (x.weight || 1), 0);
  let r = rnd() * total;
  for (const item of pool) {
    r -= item.weight || 1;
    if (r <= 0) return item;
  }
  return pool[pool.length - 1];
}
