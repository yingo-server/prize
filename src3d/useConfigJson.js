// 奖品配置：运行时加载 /config.json（单文件、无构建依赖、改奖品只编辑该文件）
// 加载失败（本地 file:// 或缺失）时回退到内置默认
import { defaultConfig } from './defaults.js';

export async function loadConfig() {
  try {
    const res = await fetch('config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('http ' + res.status);
    const json = await res.json();
    return normalize(json);
  } catch (_) {
    return normalize(JSON.parse(JSON.stringify(defaultConfig)));
  }
}

// 宽容归一化：缺字段用默认补齐，奖品数组必须存在
function normalize(cfg) {
  const d = defaultConfig;
  const out = {
    转盘设置: { ...d.转盘设置, ...(cfg.转盘设置 || {}) },
    红包墙设置: { ...d.红包墙设置, ...(cfg.红包墙设置 || {}) },
    惩罚项: { ...d.惩罚项, ...(cfg.惩罚项 || {}) },
    人机验证: { ...人机验证默认(), ...(cfg.人机验证 || {}) },
    奖品: Array.isArray(cfg.奖品) && cfg.奖品.length
      ? cfg.奖品.map((p, i) => ({
          id: p.id || 'p' + (i + 1),
          name: String(p.name || '奖品' + (i + 1)),
          stock: Number(p.stock ?? 1),
          weight: Number(p.weight ?? 1),
          isPenalty: !!p.isPenalty,
        }))
      : JSON.parse(JSON.stringify(d.奖品)),
  };
  return out;
}

export function 人机验证默认() {
  return {
    已启用: true,
    时长毫秒: 500,       // 结果前 0.5s 出弹窗
    问候语: ['你是人类吗？', '先证明一下你不是机器人～', '等等，人类验证时间！'],
    通过语: ['嗯，像个人类。', '验证通过，欢迎回来～', '好吧，相信你。'],
    范围: [2, 9],        // 加减法操作数范围
  };
}
