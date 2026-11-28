// 转盘盘面 CanvasTexture：精致质感版
// 丝绒红扇区（径向渐变+噪点绒面）、凸起金钉、浮雕金线、烧金字、外圈灯座刻纹
const GOLD = ['#fff8dc', '#f7e3a1', '#e8c86a', '#c9a227', '#8a6a1f'];

function velvet(g, x0, y0, x1, y1, c0, c1, c2) {
  const grad = g.createRadialGradient(x0, y0, 0, x0, y0, Math.max(x1, y1));
  grad.addColorStop(0, c0);
  grad.addColorStop(.55, c1);
  grad.addColorStop(1, c2);
  return grad;
}

export function makeWheelTexture(items, opts = {}) {
  const S = 2048;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const C = S / 2, R = S / 2;
  const n = items.length;
  const seg = Math.PI * 2 / n;

  // ---- 底盘：深红木纹圈底 ----
  const base = g.createRadialGradient(C, C, R * .5, C, C, R);
  base.addColorStop(0, '#3a0509');
  base.addColorStop(1, '#1e0204');
  g.fillStyle = base;
  g.beginPath(); g.arc(C, C, R, 0, 7); g.fill();

  // ---- 扇区：丝绒红（明暗交替 + 绒面噪点）----
  for (let i = 0; i < n; i++) {
    const a0 = i * seg - Math.PI / 2, a1 = (i + 1) * seg - Math.PI / 2;
    g.beginPath();
    g.moveTo(C, C);
    g.arc(C, C, R * .94, a0, a1);
    g.closePath();
    // 丝绒：中心亮、外缘深（灯光打在盘心的效果）
    const isAlt = i % 2;
    const grad = g.createRadialGradient(C, C * .45, R * .08, C, C, R * .95);
    if (isAlt) { grad.addColorStop(0, '#9e1620'); grad.addColorStop(.7, '#6e0d13'); grad.addColorStop(1, '#4a070c'); }
    else { grad.addColorStop(0, '#c9192a'); grad.addColorStop(.7, '#93101c'); grad.addColorStop(1, '#630a12'); }
    g.fillStyle = grad;
    g.fill();
    // 绒面噪点（微噪，模拟织物纤维反光）
    g.save();
    g.clip();
    for (let k = 0; k < 260; k++) {
      const a = a0 + Math.random() * seg;
      const r = Math.sqrt(Math.random()) * R * .94;
      g.fillStyle = `rgba(255,220,180,${Math.random() * .045})`;
      g.fillRect(C + Math.cos(a) * r, C + Math.sin(a) * r, 2.2, 2.2);
    }
    g.restore();
  }

  // ---- 扇区分隔：双线浮雕金槽 ----
  for (let i = 0; i < n; i++) {
    const a = i * seg - Math.PI / 2;
    const x = C + Math.cos(a), y = C + Math.sin(a);
    const drawLine = (r0, r1, w, style) => {
      g.beginPath();
      g.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
      g.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1);
      g.strokeStyle = style;
      g.lineWidth = w;
      g.stroke();
    };
    // 暗槽（下）+ 亮金（上，偏移1px 产生浮雕感）
    drawLine(R * .18, R * .94, 9, 'rgba(30,4,6,.8)');
    drawLine(R * .18, R * .94, 4.5, '#b8912a');
    drawLine(R * .18, R * .94, 2, '#f7e3a1');
  }

  // ---- 分隔钉：真实金色圆钉（立体高光） ----
  const pinR = R * .925;
  for (let i = 0; i < n; i++) {
    const a = i * seg - Math.PI / 2;
    const px = C + Math.cos(a) * pinR, py = C + Math.sin(a) * pinR;
    // 钉影
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.beginPath(); g.arc(px + 5, py + 6, 22, 0, 7); g.fill();
    // 钉体（金属径向渐变）
    const pg = g.createRadialGradient(px - 7, py - 8, 2, px, py, 22);
    pg.addColorStop(0, '#fff8dc');
    pg.addColorStop(.4, '#e8c86a');
    pg.addColorStop(.75, '#c9a227');
    pg.addColorStop(1, '#7a5a10');
    g.fillStyle = pg;
    g.beginPath(); g.arc(px, py, 20, 0, 7); g.fill();
    // 高光点
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath(); g.arc(px - 7, py - 8, 5, 0, 7); g.fill();
  }

  // ---- 外缘灯座刻纹环 ----
  g.strokeStyle = 'rgba(201,162,39,.5)';
  g.lineWidth = 6;
  g.beginPath(); g.arc(C, C, R * .965, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(255,248,220,.28)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(C, C, R * .978, 0, 7); g.stroke();
  // 刻度齿
  g.strokeStyle = 'rgba(232,200,106,.4)';
  g.lineWidth = 3;
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * Math.PI * 2;
    const r0 = R * .958, r1 = R * .972;
    g.beginPath();
    g.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
    g.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1);
    g.stroke();
  }

  // ---- 烧金文字（径向排列，带压凹阴影+金色渐变）----
  const baseSize = n <= 6 ? 118 : n <= 10 ? 92 : n <= 16 ? 72 : 56;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const textGrad = g.createLinearGradient(0, C - R * .9, 0, C);
  textGrad.addColorStop(0, '#fff8dc');
  textGrad.addColorStop(.5, '#f0d98a');
  textGrad.addColorStop(1, '#c9a227');
  for (let i = 0; i < n; i++) {
    const name = items[i].name;
    const isPen = items[i].isPenalty;
    const mid = i * seg + seg / 2 - Math.PI / 2 - Math.PI / 2; // UV 校正
    const avail = R * .76;
    let size = baseSize;
    if (name.length * size * .62 > avail) size = Math.max(34, avail / (name.length * .62));
    g.save();
    g.translate(C, C);
    g.rotate(mid + Math.PI / 2);
    g.font = `900 ${size}px "STKaiti","KaiTi","Songti SC",serif`;
    const step = size * 1.04;
    for (let ci = 0; ci < name.length; ci++) {
      const y = R * .84 - ci * step;
      // 压凹阴影（下偏移暗影=烧刻感）
      g.fillStyle = 'rgba(20,2,4,.75)';
      g.fillText(name[ci], 3, y + 4);
      // 金渐变本体
      g.fillStyle = isPen ? '#ffd9d4' : textGrad;
      g.fillText(name[ci], 0, y);
      // 顶部高光（细）
      g.fillStyle = 'rgba(255,255,255,.22)';
      g.fillText(name[ci], 0, y - size * .04);
    }
    g.restore();
  }

  // ---- 中心盘毂区域（金属接环，覆盖 hub 接缝）----
  const hubRing = g.createRadialGradient(C, C, 0, C, C, R * .17);
  hubRing.addColorStop(0, '#8a6a1f');
  hubRing.addColorStop(.75, '#c9a227');
  hubRing.addColorStop(1, '#8a6a1f');
  g.fillStyle = hubRing;
  g.beginPath(); g.arc(C, C, R * .17, 0, 7); g.fill();
  g.strokeStyle = '#5c3d08';
  g.lineWidth = 8;
  g.beginPath(); g.arc(C, C, R * .17, 0, 7); g.stroke();
  // 铆钉点
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    g.fillStyle = '#fff8dc';
    g.beginPath();
    g.arc(C + Math.cos(a) * R * .13, C + Math.sin(a) * R * .13, 6, 0, 7);
    g.fill();
  }

  // ---- 全局上光：顶部柔光 + 底部暗角（灯光感）----
  const gloss = g.createRadialGradient(C, S * .26, 0, C, C, R * 1.1);
  gloss.addColorStop(0, 'rgba(255,245,220,.14)');
  gloss.addColorStop(.45, 'rgba(255,245,220,.02)');
  gloss.addColorStop(.8, 'rgba(0,0,0,.06)');
  gloss.addColorStop(1, 'rgba(0,0,0,.22)');
  g.fillStyle = gloss;
  g.beginPath(); g.arc(C, C, R * .985, 0, 7); g.fill();

  return cv;
}

// 指针贴图（保留备用）
export function makeNeedleTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S / 2; cv.height = S;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#fff8dc'); grad.addColorStop(.45, '#e8c86a');
  grad.addColorStop(.75, '#c9a227'); grad.addColorStop(1, '#8a6a1f');
  g.fillStyle = grad;
  g.beginPath(); g.arc(S / 4, S * .18, S * .16, 0, 7); g.fill();
  g.beginPath();
  g.moveTo(S / 4 - S * .13, S * .3);
  g.lineTo(S / 4 + S * .13, S * .3);
  g.lineTo(S / 4, S * .96);
  g.closePath(); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#5c3d08'; g.stroke();
  return cv;
}
