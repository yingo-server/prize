// 内置默认奖品配置：8 个普通奖品 + 2 个惩罚项，惩罚项默认禁用
export const defaultConfig = {
  转盘设置: {
    转动时长毫秒: 6000,
    最少旋转圈数: 6,
  },
  红包墙设置: {
    红包数量: 12,
  },
  惩罚项: {
    已启用: false,
  },
  奖品: [
    { id: 'p1',  name: '特等奖 · 金砖一条',    stock: 1,  weight: 1,  isPenalty: false },
    { id: 'p2',  name: '一等奖 · 纯金奖牌',    stock: 2,  weight: 2,  isPenalty: false },
    { id: 'p3',  name: '二等奖 · 智能手表',    stock: 3,  weight: 3,  isPenalty: false },
    { id: 'p4',  name: '三等奖 · 蓝牙耳机',    stock: 5,  weight: 4,  isPenalty: false },
    { id: 'p5',  name: '四等奖 · 电影票两张',  stock: 8,  weight: 5,  isPenalty: false },
    { id: 'p6',  name: '五等奖 · 咖啡券',      stock: 12, weight: 6,  isPenalty: false },
    { id: 'p7',  name: '幸运奖 · 定制红包封面',stock: 20, weight: 7,  isPenalty: false },
    { id: 'p8',  name: '参与奖 · 新年福袋',    stock: 30, weight: 8,  isPenalty: false },
    { id: 'x1',  name: '惩罚 · 深蹲十个',      stock: 99, weight: 1,  isPenalty: true },
    { id: 'x2',  name: '惩罚 · 表演一段才艺',  stock: 99, weight: 1,  isPenalty: true },
  ],
};

// 深拷贝一份，避免模块级对象被业务直接改写
// 兼容旧导出
export function createConfig() {
  return JSON.parse(JSON.stringify(defaultConfig));
}
