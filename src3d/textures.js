// 转盘盘面 CanvasTexture 生成：扇区、金分隔线、弧排文字、高光、灯泡刻度环
// 全部程序化绘制，2048px 高清，保证文字锐利
const GOLD = ['#fff8dc', '#f7e3a1', '#e8c86a', '#c9a227', '#8a6a1f'];

export function makeWheelTexture(items, opts = {}) {
  const S = 2048;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const C = S / 2, R = S / 2;
  const n = items.length;
  const seg = Math.PI * 2 / n;

  // 底色盘面
  for (let i = 0; i < n; i++) {
    const a0 = i * seg - Math.PI / 2, a1 = (i + 1) * seg - Math.PI / 2;
    g.beginPath();
    g.moveTo(C, C);
    g.arc(C, C, R * .985, a0, a1);
    g.closePath();
    const grad = g.createRadialGradient(C, C * .6, R * .1, C, C, R);
    if (i % 2) { grad.addColorStop(0, '#8a1018'); grad.addColorStop(1, '#4a060c'); }
    else { grad.addColorStop(0, '#d01624'); grad.addColorStop(1, '#9a1019'); }
    g.fillStyle = grad;
    g.fill();
  }

  // 扇区之间金分隔线（带微光晕）
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = i * seg - Math.PI / 2;
    const x = C + Math.cos(a) * R * .985, y = C + Math.sin(a) * R * .985;
    g.beginPath(); g.moveTo(C, C); g.lineTo(x, y);
    g.strokeStyle = 'rgba(232,200,106,.22)'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = '#c9a227'; g.lineWidth = 2.5; g.stroke();
  }

  // 外缘刻度环（细密金点，呼应灯泡）
  g.fillStyle = 'rgba(247,227,161,.5)';
  for (let i = 0; i < 120; i++) {
    const a = i / 120 * Math.PI * 2;
    const r = R * .955;
    g.beginPath();
    g.arc(C + Math.cos(a) * r, C + Math.sin(a) * r, 3, 0, 7);
    g.fill();
  }

  // 弧排文字（固化版：经典转盘放射式——整列文字随扇区中线旋转，字符沿半径方向排列，
  // 不做逐字独立旋转，杜绝偏移/歪斜）
  const rText = R * .58;
  const baseSize = n <= 6 ? 118 : n <= 10 ? 92 : n <= 16 ? 72 : 56;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const name = items[i].name;
    const isPen = items[i].isPenalty;
    const mid = i * seg + seg / 2 - Math.PI / 2;
    const avail = R - rText - R * .06;
    let size = baseSize;
    if (name.length * size * .62 > avail) size = Math.max(34, avail / (name.length * .62));
    g.save();
    g.translate(C, C);
    g.rotate(mid + Math.PI / 2);          // 扇区中线朝上
    g.font = `900 ${size}px "STKaiti","KaiTi","Songti SC",serif`;
    g.lineWidth = size * .14;
    g.strokeStyle = 'rgba(42,4,8,.9)';
    g.fillStyle = isPen ? '#ffd9d4' : '#fff8dc';
    // 从外向内逐字排列（沿半径，字面朝切线方向=阅读方向一致）
    const step = size * 1.04;
    const total = (name.length - 1) * step;
    for (let ci = 0; ci < name.length; ci++) {
      const y = R * .88 - ci * step;      // 起点：靠近外缘，向心排列
      g.strokeText(name[ci], 0, y);
      g.fillText(name[ci], 0, y);
    }
    g.restore();
  }

  // 中心径向高光（玻璃感，弱化避免盖住扇区）
  const hi = g.createRadialGradient(C, S * .34, 0, C, C, R);
  hi.addColorStop(0, 'rgba(255,255,255,.10)');
  hi.addColorStop(.5, 'rgba(255,255,255,.02)');
  hi.addColorStop(1, 'rgba(0,0,0,.10)');
  g.fillStyle = hi;
  g.beginPath(); g.arc(C, C, R * .985, 0, 7); g.fill();

  return cv;
}

// 指针 CanvasTexture（金冠+尖，用于 ShapeGeometry UV 贴图，也可直接建 mesh 涂色）
export function makeNeedleTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S / 2; cv.height = S;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#fff8dc'); grad.addColorStop(.45, '#e8c86a');
  grad.addColorStop(.75, '#c9a227'); grad.addColorStop(1, '#8a6a1f');
  g.fillStyle = grad;
  // 顶部圆冠
  g.beginPath(); g.arc(S / 4, S * .18, S * .16, 0, 7); g.fill();
  // 三角尖
  g.beginPath();
  g.moveTo(S / 4 - S * .13, S * .3);
  g.lineTo(S / 4 + S * .13, S * .3);
  g.lineTo(S / 4, S * .96);
  g.closePath(); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#5c3d08'; g.stroke();
  return cv;
}
