// 3D 红包：带厚度盒体 + CanvasTexture 正面 + 弹簧 hover 倾斜 + 刚体翻转开包 + 质量弹簧落地
// 全物理：翻转由角冲量+恢复力矩驱动，squash 由线性质量-弹簧-阻尼模型驱动，无缓动曲线
import * as THREE from 'three';
import { addUpdater } from './Scene.js';
import { createPacketPhysics } from './physics.js';
import { sfx } from '../src/composables/useAudio.js';

function drawFront(item, opts = {}) {
  const W = 512, H = 645; // 1:1.26
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  // 本体红渐变
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#e01e2b'); grad.addColorStop(.45, '#b3121f'); grad.addColorStop(1, '#7a0f1a');
  g.fillStyle = grad;
  roundRect(g, 0, 0, W, H, 36);
  g.fill();
  // 金边
  g.lineWidth = 10;
  const edge = g.createLinearGradient(0, 0, W, H);
  edge.addColorStop(0, '#fff8dc'); edge.addColorStop(.5, '#c9a227'); edge.addColorStop(1, '#8a6a1f');
  g.strokeStyle = edge;
  roundRect(g, 5, 5, W - 10, H - 10, 32);
  g.stroke();
  // 封口弧形金带（顶部 18%）
  const capH = H * .18;
  const capGrad = g.createLinearGradient(0, 0, 0, capH);
  capGrad.addColorStop(0, '#f7e3a1'); capGrad.addColorStop(1, '#c9a227');
  g.fillStyle = capGrad;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, capH * .62);
  g.quadraticCurveTo(W / 2, capH * 1.35, 0, capH * .62);
  g.closePath(); g.fill();
  // "福"印章
  g.fillStyle = '#8a0e19';
  g.beginPath(); g.arc(W / 2, capH * .58, 34, 0, 7); g.fill();
  g.fillStyle = '#fff8dc';
  g.font = '900 44px "STKaiti","KaiTi",serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('福', W / 2, capH * .6);
  // 中部金圆 + ¥
  const cy = H * .46;
  const cg = g.createRadialGradient(W / 2, cy, 8, W / 2, cy, 76);
  cg.addColorStop(0, '#fff8dc'); cg.addColorStop(1, '#c9a227');
  g.fillStyle = cg;
  g.beginPath(); g.arc(W / 2, cy, 72, 0, 7); g.fill();
  g.fillStyle = '#7a0f1a';
  g.font = '900 72px Georgia,serif';
  g.fillText('¥', W / 2, cy + 4);
  // 底部文字
  g.fillStyle = 'rgba(255,248,220,.78)';
  g.font = '500 34px "PingFang SC","Microsoft YaHei",sans-serif';
  g.fillText(opts.label || '点击开启', W / 2, H * .84);
  return cv;
}

function drawPrizeFace(item) {
  const W = 512, H = 645;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(W / 2, H * .4, 40, W / 2, H / 2, W);
  grad.addColorStop(0, '#fff8dc'); grad.addColorStop(.3, '#e8c86a');
  grad.addColorStop(.55, '#c9a227'); grad.addColorStop(1, '#7a0f1a');
  g.fillStyle = grad;
  roundRect(g, 0, 0, W, H, 36); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // 图标：礼物 / 警示
  g.font = '900 150px serif';
  g.fillStyle = item.isPenalty ? '#8a0e19' : '#7a5a10';
  g.fillText(item.isPenalty ? '⚠' : '🎁', W / 2, H * .38);
  // 奖名（自动换行）
  g.fillStyle = item.isPenalty ? '#8a0e19' : '#5c3d08';
  g.font = '900 44px "STKaiti","KaiTi",serif';
  const chars = item.name.split('');
  const perLine = 8;
  const lines = [];
  for (let i = 0; i < chars.length; i += perLine) lines.push(chars.slice(i, i + perLine).join(''));
  lines.slice(0, 3).forEach((ln, i) => g.fillText(ln, W / 2, H * .62 + i * 56));
  if (item.isPenalty) {
    g.fillStyle = '#8a0e19';
    roundRect(g, W / 2 - 110, H * .86, 220, 56, 28);
    g.fill();
    g.fillStyle = '#fff8dc';
    g.font = '700 30px sans-serif';
    g.fillText('惩罚项目', W / 2, H * .86 + 30);
  }
  return cv;
}

function drawCoat() {
  // 刮层：银灰渐变 + 噪点 + 斜高光 + "刮开"
  const W = 512, H = 645;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#9aa0ab'); grad.addColorStop(.25, '#e6e9ee');
  grad.addColorStop(.45, '#8d939e'); grad.addColorStop(.65, '#d9dde3');
  grad.addColorStop(1, '#7f858f');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // 噪点
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      if (Math.random() < .5) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * .08})`;
        g.fillRect(x, y, 4, 4);
      }
    }
  }
  // 三道斜高光
  g.fillStyle = 'rgba(255,255,255,.18)';
  for (const off of [-.25, .05, .35]) {
    g.save();
    g.translate(W * off, 0);
    g.rotate(.35);
    g.fillRect(0, -H, 60, H * 3);
    g.restore();
  }
  g.fillStyle = 'rgba(60,60,70,.55)';
  g.font = '900 64px "STKaiti",serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('刮 开', W / 2, H / 2);
  return cv;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const cardW = 1.5, cardH = 1.89, cardT = .1;

export function createRedPacket3D(sceneRoot, ctx, bind) {
  const group = new THREE.Group();

  // 盒体：六面材质（前后 + 四侧）
  const frontCv = drawFront(bind.item);
  const frontTex = new THREE.CanvasTexture(frontCv);
  frontTex.colorSpace = THREE.SRGBColorSpace;
  frontTex.anisotropy = 8;
  const frontMat = new THREE.MeshPhysicalMaterial({ map: frontTex, roughness: .4, clearcoat: .5, clearcoatRoughness: .3 });
  const backMat = new THREE.MeshPhysicalMaterial({ color: 0x8a0e19, roughness: .55 });
  const sideMat = new THREE.MeshPhysicalMaterial({ color: 0x5c0a12, roughness: .5 });
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(cardW, cardH, cardT, 2, 2, 1),
    [sideMat, sideMat, sideMat, sideMat, frontMat, backMat],
  );
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);

  // 刮层（翻转后显示，初始隐藏）
  const coatCv = drawCoat();
  const coatTex = new THREE.CanvasTexture(coatCv);
  coatTex.colorSpace = THREE.SRGBColorSpace;
  const coatMat = new THREE.MeshPhysicalMaterial({
    map: coatTex, roughness: .35, metalness: .15, transparent: true, opacity: 1,
  });
  const coat = new THREE.Mesh(new THREE.PlaneGeometry(cardW * .92, cardH * .92), coatMat);
  coat.position.z = -cardT / 2 - .012;   // 背面（翻转后朝向相机）
  coat.rotation.y = Math.PI;
  coat.visible = false;
  group.add(coat);

  // 奖品面（涂层下）
  const prizeCv = drawPrizeFace(bind.item);
  const prizeTex = new THREE.CanvasTexture(prizeCv);
  prizeTex.colorSpace = THREE.SRGBColorSpace;
  const prizeMat = new THREE.MeshPhysicalMaterial({ map: prizeTex, roughness: .35, clearcoat: .6 });
  const prizeFace = new THREE.Mesh(new THREE.PlaneGeometry(cardW * .92, cardH * .92), prizeMat);
  prizeFace.position.z = -cardT / 2 - .01;  // 背面
  prizeFace.rotation.y = Math.PI;
  prizeFace.visible = false;
  group.add(prizeFace);

  // 已开印章
  const sealCv = document.createElement('canvas');
  sealCv.width = sealCv.height = 128;
  const sg = sealCv.getContext('2d');
  sg.strokeStyle = '#c8161e'; sg.lineWidth = 8;
  sg.beginPath(); sg.arc(64, 64, 52, 0, 7); sg.stroke();
  sg.fillStyle = '#c8161e';
  sg.font = '900 52px "STKaiti",serif';
  sg.textAlign = 'center'; sg.textBaseline = 'middle';
  sg.fillText('已开', 64, 66);
  const sealTex = new THREE.CanvasTexture(sealCv);
  const seal = new THREE.Mesh(
    new THREE.PlaneGeometry(.7, .7),
    new THREE.MeshBasicMaterial({ map: sealTex, transparent: true, opacity: .85 }),
  );
  seal.position.set(cardW * .3, cardH * .3, cardT / 2 + .02);
  seal.rotation.z = -.21;
  seal.visible = false;
  group.add(seal);

  // ---- 刚体物理（翻转/落地压缩/hover 扭转）----
  const phys = createPacketPhysics();

  // 状态
  const st = {
    state: 'idle', // idle | flipped | scratched | opened
    baseRotZ: (Math.random() - .5) * .05,
    fade: 1,
  };
  let draggingFlip = false;   // 拖拽翻面中（Wall3D 通过 dragFlip 驱动）

  // hover（Wall3D 射线驱动）
  function setHover(h, mx, my) {
    st.hoverT = h;
    st.mx = mx; st.my = my;
  }
  // 拖拽翻面：外部注入拖拽角速度（手指横向速度映射）
  function dragFlipStart() { draggingFlip = true; }
  function dragFlipMove(dragOmega) {
    if (!draggingFlip) return;
    phys.st.flipVel = dragOmega;
  }
  function dragFlipEnd() {
    draggingFlip = false;
    // 松手：翻过重心自然翻完，没过则物理翻回（无需干预）
  }

  // 网格布局基准位置
  function setBase(x, y) {
    group.position.x = x;
    st.baseY = y;
    group.position.y = y;
  }

  function open() {
    if (st.state !== 'idle') return;
    st.state = 'flipped';
    phys.startFlip();
    sfx.click();
  }

  function showScratch() {
    coat.visible = true;
    prizeFace.visible = true;
    coatMat.opacity = 1;
  }
  function markOpened() {
    st.state = 'opened';
    coat.visible = false;
    seal.visible = true;
    frontMat.color.set(0x999999);
    backMat.color.set(0x666666);
    sideMat.color.set(0x555555);
    st.fade = .55;
  }

  function showScratch() {
    coat.visible = true;
    prizeFace.visible = true;
    coatMat.opacity = 1;
  }
  function reset(item) {
    st.state = 'idle';
    coat.visible = false; prizeFace.visible = false; seal.visible = false;
    frontMat.color.set(0xffffff); backMat.color.set(0xffffff); sideMat.color.set(0xffffff);
    phys.st.flipAng = 0; phys.st.flipVel = 0; phys.st.flipping = false; phys.st.caught = false;
    group.rotation.y = st.baseRotZ;
    updatePrizeFace(item);
    // 重置刮层
    const c2 = drawCoat();
    coatTex.image = c2;
    coatTex.needsUpdate = true;
    coatMat.opacity = 1;
  }

  // 重新绑定奖品（物理翻面后才抽奖——翻开哪张，哪张出结果）
  function updatePrizeFace(item) {
    prizeMat.map?.dispose();
    const cv = drawPrizeFace(item);
    prizeMat.map = new THREE.CanvasTexture(cv);
    prizeMat.map.colorSpace = THREE.SRGBColorSpace;
    prizeMat.needsUpdate = true;
  }

  // 刮层刮除：暴露 canvas + UV 换算
  function scratchAt(u, v) {
    const g = coatCv.getContext('2d');
    const x = u * coatCv.width, y = (1 - v) * coatCv.height;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(x, y, 34, 0, 7); g.fill();
    g.restore();
    coatTex.needsUpdate = true;
  }
  function scratchProgress() {
    const g = coatCv.getContext('2d');
    const d = g.getImageData(0, 0, coatCv.width, coatCv.height).data;
    let clear = 0, total = 0;
    for (let i = 3; i < d.length; i += 4 * 37) { total++; if (d[i] < 128) clear++; }
    return clear / Math.max(1, total);
  }
  function revealAll() {
    coatMat.opacity = 0;
    coat.visible = false;
  }

  // 每帧：纯物理积分（无缓动曲线）
  const removeUpd = addUpdater((dt) => {
    // 翻转刚体
    phys.stepFlip(dt);
    // 落地压缩弹簧
    phys.stepSquash(dt);
    // hover 扭转弹簧（目标角由 hover 状态给出）
    const targetY = (st.hoverT ? (st.mx || 0) * .22 : 0) + st.baseRotZ;
    const targetX = st.hoverT ? (st.my || 0) * .16 : 0;
    phys.stepTilt(dt, targetX, targetY);

    // 翻转状态推进：物理角到位（>3.05 rad 即接近 π）时进入刮开
    if (st.state === 'flipped' && !phys.st.flipping && phys.st.flipAng > 3.0) {
      st.state = 'scratched';
      showScratch();
      ctx.onPacketScratchReady?.(bind);
    }
    // 未翻过重心：物理自动翻回 → 回到 idle
    if (st.state === 'flipped' && !phys.st.flipping && phys.st.flipAng <= 0.02) {
      st.state = 'idle';
    }

    // 应用物理到渲染
    const flipY = phys.st.flipAng;
    const comp = phys.st.comp;
    mesh.scale.set(1 + comp * .7, 1 - comp, 1 + comp * .7);   // squash：体积守恒
    group.rotation.x = phys.st.tiltX;
    group.rotation.y = flipY + phys.st.tiltY;

    // 抬起量 = 翻转离心（绕底边翻，重心抬升 ∝ sin）
    const lift = Math.sin(Math.min(flipY, Math.PI)) * .45;
    if (st.baseY === undefined) st.baseY = group.position.y;
    group.position.y = st.baseY + (st.hoverT && st.state === 'idle' ? .18 : 0) + lift * (st.state === 'opened' ? 0 : 1);

    // 已开淡出
    const targetOp = st.state === 'opened' ? .5 : 1;
    for (const m of [frontMat, backMat, sideMat, prizeMat]) {
      m.transparent = true;
      m.opacity += (targetOp - m.opacity) * Math.min(1, dt * 5);
    }
  });

  return {
    group, bind, st, phys,
    setHover, setBase, open, reset, markOpened, showScratch, updatePrizeFace,
    dragFlipStart, dragFlipMove, dragFlipEnd,
    scratchAt, scratchProgress, revealAll,
    get state() { return st.state; },
    destroy() { removeUpd(); },
  };
}

export { drawFront, drawPrizeFace, drawCoat, cardW, cardH };
