// 3D 转盘：真实几何盘体 + 摩擦物理转动 + 指针拨钉 + 聚光阴影 + 相机动画
import * as THREE from 'three';
import { addUpdater, registerGroup, showGroup, getCamera, disposeGroup } from './Scene.js';
import { makeWheelTexture } from './textures.js';
import { createWheelPhysics } from './physics.js';
import { sfx } from '../src/composables/useAudio.js';

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
  // 灯泡：玻璃壳（透光）+ 灯座（黄铜）+ 内部 PointLight（仅低密度时）
  const bulbGeo = new THREE.SphereGeometry(.085, 16, 12);
  const socketGeo = new THREE.CylinderGeometry(.05, .06, .1, 12);
  const socketMat = new THREE.MeshPhysicalMaterial({ color: 0xb8912a, metalness: .9, roughness: .3 });
  for (let i = 0; i < count; i++) {
    const bright = i % 2 === 0;
    const m = new THREE.MeshStandardMaterial({
      color: bright ? 0xfff2cc : 0x7a0f1a,
      emissive: bright ? 0xffe9a8 : 0x38060c,
      emissiveIntensity: bright ? 2.4 : .35,
      roughness: .15,           // 玻璃光滑
      metalness: .05,
    });
    const lamp = new THREE.Mesh(bulbGeo, m);
    const a = i / count * Math.PI * 2;
    const lx = Math.cos(a) * 2.46, ly = Math.sin(a) * 2.46;
    lamp.position.set(lx, ly, 0);
    // 灯座（朝盘心的短圆柱）
    const socket = new THREE.Mesh(socketGeo, socketMat);
    socket.position.set(lx * .965, ly * .965, 0);
    socket.rotation.z = a + Math.PI / 2;
    grp.add(lamp, socket);
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
  faceTex.rotation = Math.PI;   // 校正倒置（12 点起画时文字倒 → 转 π 后正立）

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

  // ---- 拖拽物理 ----
  const phys = createWheelPhysics({
    onPinHit: (omega) => { sfx.decelTick(); },
    onDragEnd: (omega) => { sfx.spinStart(); sfx.spinLoopStart(); },
  });

  // 屏幕坐标 → 盘面角度（射线到盘面 z 平面，取相对盘心的方位角）
  function screenToWheelAngle(clientX, clientY) {
    const ndc = new THREE.Vector2(
      (clientX / innerWidth) * 2 - 1,
      -(clientY / innerHeight) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, getCamera());
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const pt = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, pt)) return null;
    return Math.atan2(pt.y, pt.x);
  }

  function onPointerDown(e) {
    if (ctx.view !== 'wheel' || spinning) return;
    // 只在盘面附近响应（中心 hub 和指针除外——粗略用屏幕中心距离判断）
    const angle = screenToWheelAngle(e.clientX, e.clientY);
    if (angle === null) return;
    dragging = true;
    phys.dragStart(angle);
    hubFace.material.emissiveIntensity = .12;
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const angle = screenToWheelAngle(e.clientX, e.clientY);
    if (angle === null) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - (lastMoveT || now - 16)) / 1000);
    lastMoveT = now;
    phys.dragMove(angle, dt);
  }
  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    phys.dragEnd();
    if (phys.st.spinning) {
      spinning = true;
      hubFace.material.emissiveIntensity = .15;
      const b = document.querySelector('.start-btn');
      if (b) { b.disabled = true; b.textContent = '转动中'; }
    }
  }
  let dragging = false, lastMoveT = 0;
  addEventListener('pointerdown', onPointerDown);
  addEventListener('pointermove', onPointerMove);
  addEventListener('pointerup', onPointerUp);
  addEventListener('pointercancel', onPointerUp);
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

  // spin 已由手势拖拽取代（见上方 pointer handlers）——结果由物理自然停在某个扇区，
  // 中奖结果 = 停止位置的扇区（完全公平：力度决定结果，无预设）
  function spin(_itemIndex, _seed) { /* 兼容旧接口：无操作 */ }

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
    // 物理步进（子步长保证高速不穿钉）
    if (phys.st.dragging || phys.st.spinning) {
      const sub = Math.max(1, Math.ceil(Math.abs(phys.st.omega) * dt / .05));
      for (let i = 0; i < sub; i++) phys.step(dt / sub);
      needlePivot.rotation.z = phys.st.nTheta;
      discRoot.rotation.z = -phys.st.theta;
      // 灯泡周期随速度（真实转速驱动）
      const speed = Math.abs(phys.st.dragging ? phys.st._fingerVel : phys.st.omega);
      const p = Math.min(1, speed / 30);
      lampFlash = (0.12 + 0.5 * p * p);
      sfx.spinLoopRate(Math.min(1, speed / 30));
      camShake = speed * .004;
      if (phys.st.done) {
        phys.st.done = false;
        spinning = false;
        sfx.spinLoopStop();
        const idx = phys.sectorAtPointer();
        highlight(idx);
        phys.st.nOmega = -2.4;   // 指针最后回弹（真实弹簧受到的扰动）
        setTimeout(() => ctx.onSpinDone(idx), 200);
      }
    } else {
      phys.step(dt);             // 指针弹簧仍需积分
      camShake = 0;
      needlePivot.rotation.z = phys.st.nTheta;
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
