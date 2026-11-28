// ============================================================================
// 完全物理模拟模块（无缓动曲线、无比例控制、无目标插值）
// 所有运动由牛顿力学驱动：力/冲量 → 加速度 → 积分 → 位置/速度
// 交互：手势直驱（拖拽=盘跟手，松手=惯性成为初速度）
// 单位：米、秒、弧度、千克（场景尺度 1 unit = 1m）
// ============================================================================

// ---------------- 转盘（刚体定轴转动） ----------------
export const wheelPhys = {
  mass: 12,             // 盘质量 kg
  radius: 2.4,          // 盘半径 m
  bearingFriction: 0.055, // 轴承滚动摩擦系数（决定减速快慢）
  airDensity: 1.225,
  dragCoef: 1.0,
  gravity: 9.81,
  needle: {              // 拨针（单摆 + 弹簧回位 + 限位挡块）
    length: 0.95, mass: 0.08, pivotToTip: 0.62,
    k: 34, c: 1.6,
    maxAngle: 0.9, stopRestitution: 0.42,
    pinRestitution: 0.38,
  },
};

export function createWheelPhysics({ onPinHit, onDragStart, onDragEnd } = {}) {
  const P = wheelPhys;
  const N = P.needle;
  const I = 0.5 * P.mass * P.radius * P.radius;         // 均匀盘转动惯量
  const I_n = 0.5 * N.mass * N.length * N.length;       // 指针绕轴转动惯量
  const tauFric = P.bearingFriction * P.mass * P.gravity * P.radius / 2; // 轴承摩擦力矩
  const kAir = 0.5 * P.airDensity * P.dragCoef * Math.pow(P.radius, 3) * 0.66 / I; // 空气阻力矩系数

  const st = {
    theta: 0, omega: 0,
    nTheta: 0, nOmega: 0,
    pins: 10, lastPinIdx: 0,
    dragging: false,      // 手指按住中：盘角直接跟随手指
    spinning: false,
    done: false, doneTimer: 0,
    _fingerPrev: 0, _fingerVel: 0,
    onPinHit: onPinHit || (() => {}),
  };

  const pinSpan = () => (Math.PI * 2) / st.pins;
  const mod2pi = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  // ---- 手势直驱 ----
  function dragStart(fingerAngle) {
    st.dragging = true;
    st.spinning = false;
    st.done = false;
    st.omega = 0;
    st._fingerPrev = fingerAngle;
    st._fingerVel = 0;
    onDragStart?.();
  }

  function dragMove(fingerAngle, dt) {
    if (!st.dragging) return;
    let d = fingerAngle - st._fingerPrev;
    d = ((d + Math.PI) % (Math.PI * 2)) - Math.PI;   // 角度最短路径
    st.theta += d;                                    // 盘严格跟手
    const inst = d / Math.max(dt, 1e-4);              // 指尖瞬时角速度（低通）
    st._fingerVel += (inst - st._fingerVel) * Math.min(1, dt * 18);
    st._fingerPrev = fingerAngle;
    checkPinHit();
  }

  function dragEnd() {
    if (!st.dragging) return;
    st.dragging = false;
    st.omega = Math.max(-46, Math.min(46, st._fingerVel)); // 手速成为初速（物理极限钳制）
    if (Math.abs(st.omega) > 1.2) {
      st.spinning = true;
      st.doneTimer = 0;
      onDragEnd?.(st.omega);
    }
  }

  function checkPinHit() {
    const idx = Math.floor(mod2pi(st.theta) / pinSpan());
    if (idx !== st.lastPinIdx) {
      const omegaEff = st.dragging ? (st._fingerVel || 0) : st.omega;
      const vPin = Math.abs(omegaEff) * P.radius;
      const J = Math.min(vPin, 7) * 0.02;
      st.nOmega += Math.sign(omegaEff || 1) * J * N.pivotToTip / I_n * N.pinRestitution * 12;
      st.lastPinIdx = idx;
      st.onPinHit(Math.abs(omegaEff));
    }
  }

  // ---- 积分步 ----
  function step(dt) {
    // 指针动力学（始终运行：拖拽中钉也拨针）
    const nTorque = -N.k * st.nTheta - N.c * st.nOmega
      - N.mass * P.gravity * N.length * 0.5 * Math.sin(st.nTheta);
    st.nOmega += (nTorque / I_n) * dt;
    st.nTheta += st.nOmega * dt;
    if (Math.abs(st.nTheta) > N.maxAngle) {           // 限位挡块碰撞
      st.nTheta = Math.sign(st.nTheta) * N.maxAngle;
      st.nOmega *= -N.stopRestitution;
    }

    if (st.dragging) return;

    if (st.spinning) {
      // 盘面自由演化：轴承摩擦（常数力矩）+ 空气阻力（∝ω²）
      const dir = Math.sign(st.omega);
      const torque = dir * tauFric + dir * kAir * I * st.omega * st.omega;
      st.omega -= (torque / I) * dt;
      if (Math.sign(st.omega) !== dir) st.omega = 0;   // 静摩擦精确刹停，不反转
      st.theta += st.omega * dt;
      checkPinHit();

      // 停止判定：纯物理（摩擦将 ω 精确降到 0 + 指针静止）
      if (st.omega === 0) {
        st.doneTimer += dt;
        if (st.doneTimer > 0.12 && Math.abs(st.nOmega) < 0.05) {
          st.spinning = false;
          st.done = true;
        }
      } else {
        st.doneTimer = 0;
      }
    }
  }

  function sectorAtPointer() {
    const seg = Math.PI * 2 / st.pins;
    let a = (Math.PI / 2 - st.theta) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return Math.floor(a / seg) % st.pins;
  }

  function reset() {
    st.spinning = false; st.done = false; st.dragging = false;
    st.omega = 0; st.nTheta = 0; st.nOmega = 0; st.doneTimer = 0;
  }

  return { st, dragStart, dragMove, dragEnd, step, reset, sectorAtPointer, I, I_n };
}

// ---------------- 红包刚体（绕底边翻转 + 落地 squash + 掉落） ----------------
export const packetPhys = {
  mass: 0.09,
  flip: {
    I: 0.032,             // 绕底边转动惯量 kg·m²
    impulse: 0.34,        // 点开角冲量 N·m·s
    damp: 0.22,           // 轴阻尼 N·m·s/rad
    catchK: 26,           // 到位卡扣弹簧（翻过 92° 才"吸住"，否则重力翻回）
    catchC: 4.2,
    catchAngle: Math.PI * 0.51,  // 越过重心角
    limit: Math.PI,       // 物理限位（平贴背面）
    limitRestitution: 0.3,
  },
  squash: { k: 320, c: 9, max: 0.30 },   // 落地压缩（质量-弹簧-阻尼）
  tilt: { k: 14, c: 1.2, max: 0.26 },    // hover 扭转弹簧
  drop: { g: 9.81, bounce: 0.34, airDamp: 0.995 },
};

// 红包刚体物理状态
export function createPacketPhysics() {
  const F = packetPhys.flip;
  const S = packetPhys.squash;
  const st = {
    // 翻转
    flipAng: 0, flipVel: 0, flipping: false, caught: false,
    // 落地 squash（沿法向的压缩量，质量弹簧）
    comp: 0, compV: 0,
    // 掉落
    z: 0, vz: 0, dropping: false,
    // hover
    tiltX: 0, tiltXV: 0, tiltY: 0, tiltYV: 0,
  };

  function startFlip() {
    st.flipping = true;
    st.caught = false;
    st.flipVel = F.impulse / F.I;   // 冲量 → 角速度
  }

  function stepFlip(dt) {
    if (!st.flipping) return;
    let tau;
    if (st.caught) {
      // 越过重心后被卡扣吸到 π（背面贴平）
      tau = -F.catchK * (st.flipAng - Math.PI) - F.catchC * st.flipVel;
    } else {
      // 自由翻：重力回复力矩（绕底边，重心在半高处）——翻过 catchAngle 前！
      // 重力力矩方向取决于当前角：< catchAngle 时重力往回拉，> 之后往前推
      tau = -packetPhys.mass * packetPhys.drop.g * 0.5 * Math.sin(st.flipAng + Math.PI / 2);
      tau += -F.damp * st.flipVel;
    }
    st.flipVel += (tau / F.I) * dt;
    st.flipAng += st.flipVel * dt;

    // 越过重心 → 捕获
    if (!st.caught && st.flipAng > F.catchAngle) st.caught = true;

    // 物理限位（翻到底）
    if (st.flipAng > F.limit) {
      st.flipAng = F.limit;
      st.flipVel *= -F.limitRestitution;
    }
    // 未捕获且翻回来过 0 → 完全落回正面
    if (st.flipAng <= 0 && st.flipVel < 0) {
      st.flipAng = 0; st.flipVel = 0; st.flipping = false;
    }
  }

  // 落地冲击 → squash 弹簧
  function impact(v) {
    st.compV -= v * 0.05;
  }
  function stepSquash(dt) {
    // 压缩弹簧向 0 恢复
    const a = -S.k * st.comp - S.c * st.compV;
    st.compV += a * dt;
    st.comp += st.compV * dt;
    st.comp = Math.max(-S.max, Math.min(S.max, st.comp));
  }

  // hover 扭转弹簧（目标角由外部注入）
  function stepTilt(dt, tx, ty) {
    st.tiltXV += (packetPhys.tilt.k * (tx - st.tiltX) - packetPhys.tilt.c * st.tiltXV) * dt;
    st.tiltX += st.tiltXV * dt;
    st.tiltYV += (packetPhys.tilt.k * (ty - st.tiltY) - packetPhys.tilt.c * st.tiltYV) * dt;
    st.tiltY += st.tiltYV * dt;
  }

  function stepDrop(dt, floorZ) {
    if (!st.dropping) return;
    st.vz -= packetPhys.drop.g * dt;
    st.z += st.vz * dt;
    st.vz *= packetPhys.drop.airDamp;
    if (st.z <= floorZ) {
      st.z = floorZ;
      if (Math.abs(st.vz) > 0.4) {
        st.vz *= -packetPhys.drop.bounce;      // 弹跳
        impact(Math.abs(st.vz));               // 落地压缩
      } else {
        st.vz = 0;
        st.dropping = false;
      }
    }
  }

  return { st, startFlip, stepFlip, stepSquash, stepTilt, stepDrop, impact };
}
