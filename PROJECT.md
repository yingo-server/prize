# 抽奖应用（prize）——项目技术描述

> 复现范围：架构、模块、物理模型、构建链路、配置格式。不含 UI 样式细节。

## 一句话

纯前端抽奖应用：3D 转盘（手势甩动）+ 3D 红包墙刮刮乐，完全物理模拟驱动，Rust/WASM 加速，单 JSON 文件配置，零后端，CI 构建发布静态产物。

## 技术栈

| 层 | 选型 |
|---|---|
| 渲染 | Three.js ^0.170（WebGL2，降级 WebGL1） |
| 物理 | 自研刚体引擎（纯力学积分，无缓动曲线） |
| 加速计算 | Rust → wasm32-unknown-unknown（PRNG + 粒子物理步进） |
| 特效层 | 2D Canvas 粒子系统（WebGL 不可用时回退） |
| 音效 | WebAudio 全程序化合成（12 种音效 + 双振荡器背景乐，无音频文件） |
| 构建 | Vite 5，双入口（2D 版 `src/main.js` / 3D 版 `src3d/main3d.js`，`BUILD_3D=1` 切换） |
| 依赖 | 运行时仅 `three`；零其他 npm 依赖 |

## 目录结构

```
├── public/config.json        # 运行时配置（奖品/开关/验证文案），改它即改业务，无需构建
├── src-wasm/                 # Rust crate：lib.rs 导出 random_words/seed_with/particle_step
├── src/                      # 2.5D 版（Canvas/SVG 实现，与 3D 共享 composables）
│   ├── main.js               # 入口
│   ├── App.js                # 状态机：view(home/wheel/wall) × phase(idle/spinning/verify/result/penalty-hold/retrying)
│   ├── components/           # TopBar/Wheel/RedPacket/StockList/PenaltySwitch/PrizeResultModal/ConfettiFx/icons
│   ├── composables/
│   │   ├── useAudio.js       # WebAudio 合成音效（playTone/playNoise 原语 + sfx 字典）
│   │   ├── useConfig.js      # 内置默认配置
│   │   ├── useGlFx.js        # 粒子特效（彩带/金币/烟花/碎屑），物理调 WASM particle_step
│   │   ├── usePrng.js        # 可复现随机：freshSeed(Uint32Array×4)/createPrng(xorshift)/shuffle/weightedPick
│   │   └── useWasm.js        # WASM 加载器，失败自动 JS 回退
│   └── views/                # HomeView/WheelView/WallView
├── src3d/                    # 3D 版（当前主线）
│   ├── main3d.js             # 入口 + 全局状态 + HUD + 流程编排
│   ├── Scene.js              # Three 常驻场景：renderer/相机/灯光/环境（地毯台缘/聚光锥/灯笼）/视图组切换/资源销毁
│   ├── physics.js            # 物理引擎（见下）
│   ├── Wheel3D.js            # 3D 转盘：几何构建 + 拖拽手势 + 每帧积分
│   ├── Wall3D.js             # 3D 红包墙：射线拾取 + 刮层 UV + 惩罚重抽编排
│   ├── RedPacket3D.js        # 3D 红包：盒体 + 翻转刚体 + 刮层 CanvasTexture
│   ├── textures.js           # 盘面 CanvasTexture 程序化绘制（2048px）
│   ├── HumanVerify.js        # 人机验证弹窗（惩罚彩蛋）
│   └── useConfigJson.js      # config.json 运行时加载 + 归一化合并
├── vite.config.js
└── .github/workflows/ci.yml  # 唯一构建入口
```

## 物理模型（无缓动，全部力学积分）

### 转盘（刚体定轴转动）
- 转动惯量 `I = ½mr²`（均匀盘，m=12kg，r=2.4m）
- 减速力矩：轴承摩擦 `τ = μ·m·g·r/2`（常数）+ 空气阻力 `τ ∝ ρ·Cd·r³·ω²`
- **手势直驱**：pointerdown 捕获（射线求交盘面 z 平面取方位角）→ 拖拽中 `θ += Δfinger`（严格跟手），指尖角速度经低通滤波（k=18）；pointerup 时指尖速度成为初速 ω₀（钳制 ±46 rad/s）
- 停止判定：摩擦将 ω 精确积分到 0（静摩擦不反转）+ 指针动能低于阈值，持续 120ms
- 中奖结果 = 停止位置的自然扇区（`sectorAtPointer()`），力度决定结果，无预设

### 指针（弹簧-阻尼摆 + 碰撞）
- 动力学：`I_n·θ'' = -kθ - cθ' - mg(l/2)·sinθ`
- 限位挡块：超过 ±0.9 rad 时按恢复系数反弹
- 拨钉：盘面每跨一枚分隔钉，按钉线速度施加冲量到指针角速度（几何驱动，非计数）

### 红包（绕底边刚体翻转）
- 手指横移 → 翻转角速度；重力力矩 `-mg(h/2)sin(θ+π/2)` 作用
- 重心判定：翻过 0.51π 才被"卡扣"（临界弹簧）吸到 π；没过重心物理自动翻回
- 落地压缩：竖直质量-弹簧-阻尼（k=320, c=9），体积守恒 squash
- hover：扭转弹簧跟随（k=14, c=1.2）

### 抽奖时机
- 红包**翻面成功那一刻**才 `drawFor()` 加权抽取并绑定到该卡（物理决定哪张被打开）

## 随机与公平性

- 每次抽取生成 4×u32 种子（WASM xorshift 或 Math.random 回退），全程可复现（`seedText` 展示给用户）
- 加权抽取 `weightedPick(list, seed)`；红包墙网格用种子 Fisher-Yates 洗牌

## 业务规则

- 惩罚项开关：禁用时惩罚项从奖池剔除；若奖池仅剩被禁用惩罚 → 自动关开关
- 惩罚彩蛋（人机验证）：抽中惩罚 → 结果前 500ms 弹"你是人类吗？"加减法，答对放行、答错提示重试；文案/数值范围可配置
- 红包墙惩罚禁用重抽：抽中被禁惩罚 → 弹窗 2s 倒计时 → 该卡物理重置 → 自动重抽（不扣库存）
- 库存：非惩罚奖品抽出后 stock-1，0 后不再入池

## 配置格式（public/config.json）

```json
{
  "转盘设置": { "转动时长毫秒": 6000, "最少旋转圈数": 6 },
  "红包墙设置": { "红包数量": 12 },
  "惩罚项": { "已启用": false },
  "人机验证": {
    "已启用": true, "时长毫秒": 500,
    "问候语": ["你是人类吗？"], "通过语": ["嗯，像个人类。"], "范围": [2, 9]
  },
  "奖品": [
    { "id": "p1", "name": "…", "stock": 1, "weight": 1, "isPenalty": false },
    { "id": "x1", "name": "…", "stock": 99, "weight": 1, "isPenalty": true }
  ]
}
```
运行时 `fetch('config.json', {cache:'no-store'})`，字段级归一化合并默认值；fetch 失败（file:// 或缺失）回退内置默认。**改奖品只编辑此文件，零构建零后端。**

## 构建与发布（仅 CI，本地禁止构建）

1. push 到 `main` 触发 GitHub Actions
2. Job 步骤：rustup (wasm32 target) → `cargo build --release` → 产物 `prize.wasm` 拷入 `public/` → npm install → `BUILD_3D=1 vite build`
3. 产物（dist/：index.html + assets/*.js|css + prize.wasm + config.json）**force-push 覆盖到 `3d` 分支根目录**（产物分支，带 5 次网络重试）
4. 部署目标 = `3d` 分支（GitHub Pages 指向它即为线上地址）；`main` 纯源码

## 降级链

- WASM 加载失败 → JS 等价实现（PRNG/particle_step）
- WebGL 不可用 → 整个 3D 版提示不可用（2D 分支版本作为无 WebGL 回退）
- 音频：AudioContext 需用户手势解锁（首次 pointerdown 初始化），全部合成无网络请求
- 低性能模式（HUD 开关）：阴影/体积光锥/灯笼阵列/背景灯笼关闭、灯泡减半

## 复现步骤

```bash
git clone https://github.com/yingo-server/prize && cd prize
git checkout main
# 本地试玩（不构建）：直接静态起服会因 bare import 'three' 失败，需构建或用 CI 产物
# CI 产物（推荐）：
#   直接取 3d 分支根目录（index.html/assets/prize.wasm/config.json）静态托管即可
# 本地开发构建（如允许）：
npm install
BUILD_3D=1 npm run build   # 产物在 dist/
# 业务配置：编辑 public/config.json（或托管后直接改托管路径下的 config.json）
```

## 版本

- v1.1.0-3d（tag + Release，含源码包）：JSON 配置 + 人机验证彩蛋 + 全物理操作重构
