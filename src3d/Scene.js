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
  camera.position.set(0, 3.2, 9);

  pmrem = new THREE.PMREMGenerator(renderer);
  envTex = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.environment = envTex;

  // 氛围：底部红色地平面承接阴影 + 顶部聚光
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshStandardMaterial({ color: 0x2a0408, roughness: .85, metalness: .1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.6;
  floor.receiveShadow = true;
  scene.add(floor);

  const amb = new THREE.HemisphereLight(0xffe6b0, 0x40060e, .55);
  scene.add(amb);
  const key = new THREE.SpotLight(0xfff2cc, lowPerf ? 120 : 260, 40, .5, .45, 1.6);
  key.position.set(3, 12, 6);
  key.castShadow = !lowPerf;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -.0004;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe8c86a, 1.1);
  rim.position.set(-6, 5, -8);
  scene.add(rim);

  onResize();
  addEventListener('resize', onResize);
  start();
  return api;
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
