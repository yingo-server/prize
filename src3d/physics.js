// 转盘物理引擎：摩擦转动 + 指针弹簧拨钉（真实物理，非缓动曲线）
// 盘面：ω' = -(μ·g_eff + c·ω²)，库仑摩擦保证有限时间停转，空气阻尼保证高速段平滑
// 指针：θ'' = -k·θ - c·θ' + 钉冲量；盘每跨过一个分隔钉给指针一次与相对线速度成正比的冲量

export const wheelPhys = {
  mu: 1.9,            // 库仑摩擦等效角减速 rad/s²（调参：约 3.2s 从 ω0 摩到停止）
  cDrag: 0.028,       // 空气阻尼系数 ω' -= c·ω²
  omegaMin: 0.14,     // 低于此角速度进入收敛段
  // 收敛段：剩余角度小弹道，用临界阻尼滑到目标
  settleK: 26, settleC: 10.2,
};

export const needlePhys = {
  k: 340,             // 弹簧刚度（回中）
  c: 14,              // 阻尼
  maxAngle: 0.62,     // 最大偏转 rad (~35°)
  impulsScale: 0.85,  // 钉冲量强度（× 钉相对线速度）
  restitution: 0.55,  // 撞钉后能量保留
};

// 单个盘面物理状态
export function createWheelPhysics({ onPinHit }) {
  const st = {
    angle: 0,          // 盘当前角 rad（累计）
    omega: 0,
    spinning: false,
    settling: false,
    target: 0,         // 收敛目标角
    pins: 10,          // 钉数（扇区数）
    lastPin: 0,
    // 指针状态（指针在 12 点，即盘角 mod 2π = π/2 处读数）
    nAngle: 0, nOmega: 0,
    done: false,
    onPinHit: onPinHit || (() => {}),
  };

  // 发射：给定总目标角 targetAngle（含圈数）与时长预算 → 反解初始 ω0
  // 用摩擦模型积分估算：ω0 满足大约 duration 后停止在 target
  function launch(targetAngle, duration) {
    st.spinning = true; st.done = false; st.settling = false;
    st.angle = st.angle % (Math.PI * 2);
    st.target = targetAngle;
    // 粗解：恒定近似减速 a = wheelPhys.mu → ω0 ≈ a·T（再乘阻尼补偿 1.18）
    const w0 = wheelPhys.mu * duration * 1.18;
    st.omega = w0;
    st.lastPin = Math.floor(st.angle / (Math.PI * 2 / st.pins));
    return w0;
  }

  // 每帧步进；返回 true 表示本次帧跨过了钉
  function step(dt) {
    if (!st.spinning) return false;
    let hit = false;
    if (!st.settling) {
      // 库仑摩擦 + 平方阻尼
      const a = wheelPhys.mu + wheelPhys.cDrag * st.omega * st.omega;
      st.omega -= a * dt;
      if (st.omega <= wheelPhys.omegaMin) {
        st.settling = true;
        // 收敛段目标：把剩余角补到 target（取最近的同向路径）
        st.settleStart = st.angle;
      }
    } else {
      // 临界阻尼滑向 target（target 随实际位置每帧重算，保证单调前进）
      const remain = st.target - st.angle;
      if (remain <= 0.0012 && Math.abs(st.nAngle) < .04 && Math.abs(st.nOmega) < .02) {
        st.spinning = false; st.done = true;
        st.omega = 0;
        return hit;
      }
      const k = wheelPhys.settleK, c = wheelPhys.settleC;
      st.omega = remain * k * 0.06 + st.omega * Math.exp(-c * dt);
      // 简化为速度跟随：ω → remain · settleK·.06（比例控制，无过冲）
      if (remain <= 0.0012) st.omega = 0;
    }
    st.angle += st.omega * dt;

    // 指针：弹簧回中 + 阻尼
    st.nOmega += (-needlePhys.k * st.nAngle - needlePhys.c * st.nOmega) * dt;
    st.nAngle += st.nOmega * dt;
    if (st.nAngle > needlePhys.maxAngle) { st.nAngle = needlePhys.maxAngle; st.nOmega *= -needlePhys.restitution; }
    if (st.nAngle < -needlePhys.maxAngle * .25) { st.nAngle = -needlePhys.maxAngle * .25; st.nOmega *= -needlePhys.restitution; }

    // 跨钉检测：盘角每跨过 2π/pins 给指针冲量
    const pinSpan = Math.PI * 2 / st.pins;
    const pin = Math.floor(st.angle / pinSpan);
    if (pin !== st.lastPin) {
      const pinSpeed = st.omega * pinSpan; // 相对线速度（近似）
      st.lastPin = pin;
      st.nOmega += Math.min(pinSpeed, 9) * needlePhys.impulsScale;
      hit = true;
      st.onPinHit(st.omega);
    }
    return hit;
  }

  function reset() {
    st.spinning = false; st.done = false; st.settling = false;
    st.omega = 0; st.nAngle = 0; st.nOmega = 0;
  }

  return { st, launch, step, reset };
}

// 弹性缓动（红包翻面落地的 squash-stretch 用）
export function elasticOut(t, amp = .28, freq = 6.5) {
  if (t >= 1) return 1;
  return 1 - Math.cos(t * freq * Math.PI) * Math.exp(-t * 4.2) * amp * (1 - t);
}

// 简易临界阻尼跟随（hover 倾斜）
export function dampFollow(cur, target, vel, k, c, dt) {
  vel += (k * (target - cur) - c * vel) * dt;
  return [cur + vel * dt, vel];
}
