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
    if (i % 2) { grad.addColorStop(0, '#7d1019'); grad.addColorStop(1, '#5c0a12'); }
    else { grad.addColorStop(0, '#b01320'); grad.addColorStop(1, '#8a0e19'); }
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

  // 弧排文字
  const rText = R * .58;
  const baseSize = n <= 6 ? 118 : n <= 10 ? 92 : n <= 16 ? 72 : 56;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const name = items[i].name;
    const isPen = items[i].isPenalty;
    const mid = i * seg + seg / 2 - Math.PI / 2;
    // 弧长
    const arcLen = rText * seg * .82;
    let size = baseSize;
    // 粗略宽度估算（中文字宽≈size）
    const est = name.length * size;
    if (est > arcLen) size = Math.max(34, size * arcLen / est);
    const twoLines = name.length * size > arcLen;
    const lines = twoLines
      ? [name.slice(0, Math.ceil(name.length / 2)), name.slice(Math.ceil(name.length / 2))]
      : [name];

    for (let k = 0; k < lines.length; k++) {
      const rr = rText - (k ? size * 1.15 : 0);
      const spread = Math.min(seg * .72, (lines[k].length * size) / rr);
      const start = mid - spread / 2;
      g.save();
      g.translate(C, C);
      g.rotate(start);
      g.font = `900 ${size}px "STKaiti","KaiTi","Songti SC",serif`;
      const chars = lines[k].split('');
      for (let ci = 0; ci < chars.length; ci++) {
        const ca = (ci + .5) * (spread / chars.length);
        g.save();
        g.rotate(ca);
        g.translate(0, -rr);
        g.lineWidth = size * .14;
        g.strokeStyle = 'rgba(42,4,8,.9)';
        g.strokeText(chars[ci], 0, 0);
        g.fillStyle = isPen ? '#ffd9d4' : '#fff8dc';
        g.fillText(chars[ci], 0, 0);
        g.restore();
      }
      g.restore();
    }
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
