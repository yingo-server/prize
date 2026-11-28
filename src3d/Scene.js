// Three.js 场景管理：常驻 renderer、按 view 切换转盘组/红包组、灯光、环境贴图、销毁
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let renderer = null, scene = null, camera = null, pmrem = null, envTex = null;
let canvas = null, raf = 0, running = false;
const updaters = new Set();          // 每帧回调 (dt, t)
const groups = {};                   // view -> THREE.Group
let activeGroup = null;
let lowPerf = false;

export function is3dAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (_) { return false; }
}

export function initScene(low = false) {
  if (renderer) return api;
  lowPerf = low;
  canvas = document.createElement('canvas');
  canvas.id = 'scene3d';
  document.body.prepend(canvas);           // z-index 由 CSS 控制
  renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: !lowPerf,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !lowPerf;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .1, 120);
  camera.position.set(0, 0.6, 11.5);

  pmrem = new THREE.PMREMGenerator(renderer);
  envTex = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.environment = envTex;

  buildEnvironment();

  onResize();
  addEventListener('resize', onResize);
  start();
  return api;
}

// ---- 抽奖亭环境（真实台面 + 体积聚光 + 灯笼氛围）----
function buildEnvironment() {
  // 1. 红地毯圆台（程序化绒面纹理 + 金色滚边）
  const carpetCv = document.createElement('canvas');
  carpetCv.width = carpetCv.height = 256;
  const cg = carpetCv.getContext('2d');
  cg.fillStyle = '#5c0a12'; cg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    cg.fillStyle = `rgba(${Math.random() < .5 ? '120,20,30' : '40,4,8'},${Math.random() * .3})`;
    cg.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  cg.strokeStyle = 'rgba(201,162,39,.8)'; cg.lineWidth = 8;
  cg.beginPath(); cg.arc(128, 128, 118, 0, 7); cg.stroke();
  const carpetTex = new THREE.CanvasTexture(carpetCv);
  carpetTex.colorSpace = THREE.SRGBColorSpace;
  const carpet = new THREE.Mesh(
    new THREE.CircleGeometry(9, 64),
    new THREE.MeshStandardMaterial({ map: carpetTex, roughness: .95, metalness: 0 }),
  );
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.y = -2.55;
  carpet.receiveShadow = true;
  scene.add(carpet);

  // 2. 台缘（木质圆环台阶）
  const rimStep = new THREE.Mesh(
    new THREE.CylinderGeometry(9.2, 9.5, .22, 64),
    new THREE.MeshStandardMaterial({ color: 0x2a1006, roughness: .7, metalness: .05 }),
  );
  rimStep.position.y = -2.66;
  scene.add(rimStep);

  // 3. 背景 + 雾
  scene.background = new THREE.Color(0x150103);
  scene.fog = new THREE.Fog(0x150103, 16, 42);

  // 4. 灯光组
  scene.add(new THREE.HemisphereLight(0xffe6b0, 0x40060e, .5));
  const key = new THREE.SpotLight(0xfff2cc, lowPerf ? 120 : 300, 40, .42, .5, 1.6);
  key.position.set(0, 13, 3);
  key.castShadow = !lowPerf;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -.0004;
  scene.add(key);
  const rimL = new THREE.DirectionalLight(0xe8c86a, 1.0);
  rimL.position.set(-6, 5, -8);
  scene.add(rimL);
  // 两侧灯笼暖光
  const lanternL = new THREE.PointLight(0xff6a3c, lowPerf ? 0 : 26, 22, 1.8);
  lanternL.position.set(-7.5, 3.5, -3);
  scene.add(lanternL);
  const lanternR = new THREE.PointLight(0xffa04c, lowPerf ? 0 : 22, 22, 1.8);
  lanternR.position.set(7.5, 3.2, -3.5);
  scene.add(lanternR);

  // 5. 可见聚光锥（体积光近似）
  if (!lowPerf) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(5.5, 13, 48, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff0c8, transparent: true, opacity: .055,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    cone.position.set(0, 6.4, 1.5);
    cone.rotation.x = .18;
    scene.add(cone);
  }

  // 6. 背景灯笼串（发光球阵列）
  if (!lowPerf) {
    const lGeo = new THREE.SphereGeometry(.32, 16, 12);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const lr = 12 + Math.random() * 3;
      const m = new THREE.Mesh(lGeo, new THREE.MeshStandardMaterial({
        color: 0xd83a20, emissive: 0xff4a20, emissiveIntensity: 1.4, roughness: .6,
      }));
      m.position.set(Math.cos(a) * lr, 1.5 + Math.sin(i * 2.4) * 1.6, -4 - Math.random() * 5);
      scene.add(m);
    }
  }
}

function onResize() {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
export function resize3d() { onResize(); }

let last = 0;
function loop(now) {
  if (!running) return;
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  for (const fn of updaters) { try { fn(dt, now / 1000); } catch (_) {} }
  renderer.render(scene, camera);
  raf = requestAnimationFrame(loop);
}
function start() {
  if (running) return;
  running = true; last = performance.now();
  raf = requestAnimationFrame(loop);
}

export function addUpdater(fn) { updaters.add(fn); return () => updaters.delete(fn); }

// ---- 视图组管理：进入 view 时旧组飞出、新组飞入（缓动插值）----
export function registerGroup(name, group) {
  groups[name] = group;
  scene.add(group);
  group.visible = false;
}
export function showGroup(name) {
  const g = groups[name];
  if (!g) return;
  if (activeGroup && activeGroup !== g) {
    // 旧组：下沉 + 淡出（材质 opacity 由组内 updater 自理，这里只切可见性）
    activeGroup.visible = false;
  }
  activeGroup = g;
  g.visible = true;
}
export function getCamera() { return camera; }
export function getScene() { return scene; }

export function set3dLowPerf(low) {
  lowPerf = low;
  if (renderer) { renderer.shadowMap.enabled = !low; }
}

export function disposeGroup(name) {
  const g = groups[name];
  if (!g) return;
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    }
  });
  scene.remove(g);
  delete groups[name];
  if (activeGroup === g) activeGroup = null;
}

export const api = { initScene, is3dAvailable, addUpdater, registerGroup, showGroup, getCamera, getScene, resize3d, set3dLowPerf, disposeGroup };
