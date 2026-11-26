// 3D 转盘：真实几何盘体 + 摩擦物理转动 + 指针拨钉 + 聚光阴影 + 相机动画
import * as THREE from 'three';
import { addUpdater, registerGroup, showGroup, getCamera, disposeGroup } from './Scene.js';
import { makeWheelTexture } from './textures.js';
import { createWheelPhysics } from './physics.js';
import { sfx } from '../src/composables/useAudio.js';
import { createPrng } from '../src/composables/usePrng.js';
const GOLD_RING = { color: 0xc9a227, metalness: .95, roughness: .22 };

function buildNeedle() {
  // 指针：三角锥 + 顶部金球，pivot 在冠心（12 点方向、盘外缘）
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xe8c86a, metalness: .85, roughness: .28,
    clearcoat: .6, clearcoatRoughness: .3,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(.16, .95, 24), mat);
  cone.rotation.z = Math.PI;           // 尖朝下
  cone.position.y = -.45;
  cone.castShadow = true;
  const crown = new THREE.Mesh(new THREE.SphereGeometry(.21, 24, 16), mat);
  crown.castShadow = true;
  g.add(cone, crown);
  g.position.set(0, 2.62, .3);         // 盘半径 2.4，外缘上方
  return g;
}

function buildLamps(count) {
  const grp = new THREE.Group();
  const lamps = [];
  const geo = new THREE.SphereGeometry(.085, 16, 12);
  for (let i = 0; i < count; i++) {
    const bright = i % 2 === 0;
    const m = new THREE.MeshStandardMaterial({
      color: bright ? 0xfff8dc : 0x7a0f1a,
      emissive: bright ? 0xffe9a8 : 0x38060c,
      emissiveIntensity: bright ? 2.2 : .35,
      roughness: .3,
    });
    const lamp = new THREE.Mesh(geo, m);
    const a = i / count * Math.PI * 2;
    lamp.position.set(Math.cos(a) * 2.46, Math.sin(a) * 2.46, 0);
    grp.add(lamp);
    lamps.push({ mesh: lamp, bright });
  }
  return { grp, lamps };
}

export function createWheel3D(ctx) {
  const n0 = ctx.wheelItems.length;
  const group = new THREE.Group();

  // ---- 盘体（真实厚度）----
  const discRoot = new THREE.Group();     // 旋转部分
  const n = () => ctx.wheelItems.length;

  // 扇形盘面纹理
  let faceTex = null;
  function rebuildTexture() {
    if (faceTex) faceTex.dispose();
    faceTex = new THREE.CanvasTexture(makeWheelTexture(ctx.wheelItems));
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.anisotropy = 8;
  }
  rebuildTexture();

  const thickness = .26;
  const faceMat = new THREE.MeshPhysicalMaterial({
    map: faceTex, roughness: .32, metalness: .08,
    clearcoat: .8, clearcoatRoughness: .25,
  });
  // 盘面：圆柱只当厚度体（顶/底用暗色），扇区贴图用独立 CircleGeometry（UV 与画布 1:1 对应，方向零歧义）
  const bodyGeo = new THREE.CylinderGeometry(2.4, 2.4, thickness, 128);
  const sideMat = new THREE.MeshPhysicalMaterial({
    color: 0x8a6a1f, metalness: .9, roughness: .3,
    map: goldStripeTexture(),
  });
  const capMat = new THREE.MeshPhysicalMaterial({ color: 0x4a3208, metalness: .6, roughness: .45 });
  const body = new THREE.Mesh(bodyGeo, [sideMat, capMat, capMat]);
  body.rotation.x = Math.PI / 2;         // 盘面立起（法向朝 ±z）
  body.castShadow = true; body.receiveShadow = true;
  discRoot.add(body);

  // 扇区盘面（贴在圆柱前面 +z 侧，随盘转）
  const faceGeo = new THREE.CircleGeometry(2.4, 128);
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.z = thickness / 2 + .005;
  face.receiveShadow = true;
  discRoot.add(face);

  faceTex.center.set(.5, .5);
  // CircleGeometry UV：canvas 内容需旋转 π 才与世界 12 点对齐（实测校准）
  faceTex.rotation = Math.PI - Math.PI / 2;   // 实测：π 校正倒置，再 -π/2 对齐 12 点指针

  // 金属外圈 Torus
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(2.52, .16, 32, 128),
    new THREE.MeshPhysicalMaterial({ ...GOLD_RING, clearcoat: .5 }),
  );
  rim.castShadow = true;
  discRoot.add(rim);

  // 灯泡带（贴外圈，随盘转？——规格：灯泡随盘转更真实）
  let lampSet = buildLamps(ctx.lowPerf ? 12 : 24);
  discRoot.add(lampSet.grp);

  // 中轴心按钮（不随盘转）
  const hub = new THREE.Group();
  const hubBase = new THREE.Mesh(
    new THREE.CylinderGeometry(.62, .72, .34, 64),
    new THREE.MeshPhysicalMaterial({ color: 0xc9a227, metalness: .92, roughness: .24, clearcoat: .6 }),
  );
  hubBase.rotation.x = Math.PI / 2;
  hubBase.castShadow = true;
  // "开始"文字贴到 hubFace
  const startCv = document.createElement('canvas');
  startCv.width = startCv.height = 256;
  const sc = startCv.getContext('2d');
  // 金色渐变底
  const sg = sc.createRadialGradient(128, 90, 20, 128, 128, 150);
  sg.addColorStop(0, '#fff8dc'); sg.addColorStop(.5, '#e8c86a'); sg.addColorStop(1, '#b8901f');
  sc.fillStyle = sg;
  sc.beginPath(); sc.arc(128, 128, 126, 0, 7); sc.fill();
  sc.fillStyle = '#5c3d08';
  sc.font = '900 64px "STKaiti","KaiTi",serif';
  sc.textAlign = 'center'; sc.textBaseline = 'middle';
  sc.fillText('开 始', 128, 130);
  const startTex = new THREE.CanvasTexture(startCv);
  startTex.colorSpace = THREE.SRGBColorSpace;
  const hubFace = new THREE.Mesh(
    new THREE.CircleGeometry(.55, 64),
    new THREE.MeshPhysicalMaterial({ map: startTex, color: 0xf7e3a1, roughness: .4, clearcoat: .8, emissive: 0x553c08, emissiveIntensity: .35 }),
  );
  hubFace.position.z = .18;
  hub.add(hubBase, hubFace);
  hub.position.z = .06;
  // 指针（不随盘转）
  const needle = buildNeedle();
  const needlePivot = new THREE.Group();
  needlePivot.add(needle);
  needle.position.set(0, 0, 0);
  needlePivot.position.set(0, 2.62, .3);

  // 底座（装饰 + 承接阴影）
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(2.9, 3.3, .5, 96),
    new THREE.MeshPhysicalMaterial({ color: 0x5c0a12, metalness: .4, roughness: .5 }),
  );
  pedestal.rotation.x = Math.PI / 2;
  pedestal.position.z = -.5;
  pedestal.receiveShadow = true;
  pedestal.castShadow = true;

  group.add(pedestal, discRoot, hub, needlePivot);
  registerGroup('wheel', group);

  // ---- 物理状态 ----
  const phys = createWheelPhysics({
    onPinHit: (omega) => { sfx.decelTick(); },
  });
  let spinning = false;
  let winSector = -1;
  let winPulseT = 0;
  let camShake = 0;
  let lampFlash = 0;

  // 相机入场（俯冲 + 弹性收尾）
  let camT = -1;
  function cameraIntro() {
    camT = 0;
  }

  function spin(itemIndex, seed) {
    if (spinning) return;
    spinning = true;
    winSector = -1;
    sfx.spinStart(); sfx.spinLoopStart();
    const N = n();
    const seg = Math.PI * 2 / N;
    const rnd = createPrng(seed[0] ^ (seed[1] << 1));
    const turns = ctx.config.转盘设置.最少旋转圈数 + Math.floor(rnd() * 2);
    const jitter = (rnd() - .5) * seg * .6;
    // 目标角：让扇区 i 中线停在指针（12 点 = π/2）下
    // 盘逆时针转 angle 后，扇区 i 的中线位于 i*seg + seg/2 + angle；要 = π/2 (mod 2π)
    const target = Math.PI * 2 * turns + (Math.PI / 2 - (itemIndex * seg + seg / 2)) + jitter;
    const duration = ctx.config.转盘设置.转动时长毫秒 / 1000;
    phys.launch(target, duration);
    cameraIntro();
    hubFace.material.emissiveIntensity = .15;
  }

  function clearWin() {
    winSector = -1;
    discRoot.position.z = 0;
  }
  function highlight(index) {
    winSector = index;
    winPulseT = 0;
  }

  // ---- 每帧 ----
  const cam = () => getCamera();
  const removeUpd = addUpdater((dt, t) => {
    // 物理步进（子步长保证高速时不穿钉）
    if (phys.st.spinning) {
      const sub = Math.max(1, Math.ceil(phys.st.omega * dt / .06));
      for (let i = 0; i < sub; i++) phys.step(dt / sub);
      phys.st.nAngle = Math.max(-.18, Math.min(.62, phys.st.nAngle));
      needlePivot.rotation.z = phys.st.nAngle;
      discRoot.rotation.z = -phys.st.angle;   // 逆时针为正 → three z 轴顺时针为正
      // 灯泡周期随进度
      const remain = phys.st.target - phys.st.angle;
      const total = phys.st.target - (phys.st.angle - phys.st.omega * 0);
      const p = 1 - Math.min(1, remain / (Math.PI * 2 * 7));
      lampFlash = (120 + 500 * Math.pow(1 - p, 2)) / 1000;
      // spin loop 音调
      sfx.spinLoopRate(Math.min(1, phys.st.omega / 14));
      // 相机微震随速度
      camShake = phys.st.omega * .004;
      if (phys.st.done) {
        phys.st.done = false;
        spinning = false;
        sfx.spinLoopStop();
        // 计算停在了哪个扇区
        const N2 = n();
        const seg2 = Math.PI * 2 / N2;
        let a = (Math.PI / 2 - phys.st.angle) % (Math.PI * 2);
        if (a < 0) a += Math.PI * 2;
        const idx = Math.floor(a / seg2) % N2;
        highlight(idx);
        needleBounce();
        setTimeout(() => ctx.onSpinDone(idx), 200);
      }
    } else {
      camShake = 0;
      needlePivot.rotation.z *= Math.exp(-6 * dt); // 停转后指针缓慢回正
    }

    // 灯泡闪烁
    lampFlashAcc += dt;
    if (lampFlashAcc > lampFlash) {
      lampFlashAcc = 0;
      lampPhase ^= 1;
      for (const L of lampSet.lamps) {
        const on = L.bright === (lampPhase === 0);
        L.mesh.material.emissiveIntensity = on ? 2.4 : .3;
      }
    }

    // 中奖扇区脉冲：盘面上浮 + 呼吸
    if (winSector >= 0) {
      winPulseT += dt;
      discRoot.position.z = .1 + Math.sin(winPulseT * 5) * .04;
    }

    // 相机入场动画（俯冲 + 弹性）
    if (camT >= 0) {
      camT += dt;
      const T = 1.6;
      const p = Math.min(1, camT / T);
      const e = 1 - Math.pow(1 - p, 4);
      const wob = Math.sin(p * Math.PI * 3) * (1 - p) * .18;
      cam().position.set(
        camShake ? (Math.random() - .5) * camShake : 0,
        0.6 + (1 - e) * 6 + wob,
        11.5 - (1 - e) * 2.2,
      );
      cam().lookAt(0, 0, 0);
      if (p >= 1) camT = -1;
    } else if (camShake > 0) {
      cam().position.x = (Math.random() - .5) * camShake;
      cam().position.y = 0.6 + (Math.random() - .5) * camShake;
    }
  });

  let lampFlashAcc = 0, lampPhase = 0;
  function needleBounce() {
    // 停止瞬间指针回弹动画：给一次反向冲量再衰减
    phys.st.nOmega = -2.4;
  }

  function rebuild() {
    // 奖品配置变了：重建纹理与灯泡数
    rebuildTexture();
    faceMat.map = faceTex;
    faceMat.needsUpdate = true;
    discRoot.remove(lampSet.grp);
    lampSet.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    lampSet = buildLamps(ctx.lowPerf ? 12 : 24);
    discRoot.add(lampSet.grp);
  }

  // 居中场景组
  group.position.set(0, 0, 0);

  return {
    el: null, group,
    spin, rebuild, highlight, clearWin,
    get spinning() { return spinning; },
    destroy() { removeUpd(); disposeGroup('wheel'); },
  };
}

function sideBottomMat() {
  return new THREE.MeshPhysicalMaterial({ color: 0x4a3208, metalness: .7, roughness: .45 });
}
function goldStripeTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, '#8a6a1f'); grad.addColorStop(.25, '#fff8dc');
  grad.addColorStop(.5, '#c9a227'); grad.addColorStop(.75, '#fff8dc');
  grad.addColorStop(1, '#8a6a1f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  return t;
}
