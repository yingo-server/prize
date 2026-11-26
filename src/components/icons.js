// 公共图标库：纯手绘 SVG path，金/红主题。返回 SVG 字符串。
const GOLD = 'url(#goldGrad)';

function defs(id) {
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff8dc"/><stop offset=".45" stop-color="#e8c86a"/>
    <stop offset="1" stop-color="#8a6a1f"/></linearGradient></defs>`;
}

export function iconWheel(size = '100%') {
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${defs('wheelGold')}
    <circle cx="50" cy="50" r="42" stroke="${GOLD.replace('goldGrad','wheelGold')}" stroke-width="6" fill="rgba(122,15,26,.55)"/>
    <path d="M50 14 A36 36 0 0 1 82 38 L50 50 Z" fill="#b3121f" stroke="#e8c86a" stroke-width="2"/>
    <path d="M82 38 A36 36 0 0 1 70 78 L50 50 Z" fill="#7a0f1a" stroke="#e8c86a" stroke-width="2"/>
    <path d="M70 78 A36 36 0 0 1 22 72 L50 50 Z" fill="#b3121f" stroke="#e8c86a" stroke-width="2"/>
    <path d="M22 72 A36 36 0 0 1 50 14 L50 50 Z" fill="#7a0f1a" stroke="#e8c86a" stroke-width="2"/>
    <circle cx="50" cy="50" r="8" fill="url(#wheelGold)" stroke="#5c3d08" stroke-width="2"/>
    <circle cx="50" cy="4" r="6" fill="url(#wheelGold)" stroke="#5c3d08" stroke-width="2"/>
  </svg>`;
}

export function iconPacket(size = '100%') {
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${defs('packetGold')}
    <path d="M14 30 Q50 54 86 30 L86 84 Q50 92 14 84 Z" fill="#e01e2b" stroke="url(#packetGold)" stroke-width="6" stroke-linejoin="round"/>
    <path d="M14 30 Q50 6 86 30 Q50 54 14 30 Z" fill="#b3121f" stroke="url(#packetGold)" stroke-width="5"/>
    <circle cx="50" cy="31" r="11" fill="url(#packetGold)" stroke="#5c3d08" stroke-width="2"/>
    <path d="M45 27h10v8h-10z M47 31h6 M50 27v8" stroke="#7a0f1a" stroke-width="2"/>
  </svg>`;
}

export function iconGift(color = '#e8c86a') {
  return `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M7 19h34v22H7z" fill="${color}" stroke="#5c3d08" stroke-width="2"/>
    <path d="M5 14h38v8H5z" fill="#fff8dc" stroke="#5c3d08" stroke-width="2"/>
    <path d="M24 14v27" stroke="#b3121f" stroke-width="3"/>
    <path d="M24 14c-8-2-12-6-9-9 3-3 8 1 9 9zm0 0c8-2 12-6 9-9-3-3-8 1-9 9z" fill="${color}" stroke="#5c3d08" stroke-width="2"/>
  </svg>`;
}
export function iconWarn() {
  return `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M24 4 45 42H3Z" fill="#b3121f" stroke="#ff3b30" stroke-width="3" stroke-linejoin="round"/>
    <path d="M24 17v12" stroke="#fff8dc" stroke-width="4" stroke-linecap="round"/>
    <circle cx="24" cy="35" r="2.4" fill="#fff8dc"/>
  </svg>`;
}
export function iconNeedle() {
  return `<svg viewBox="0 0 80 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><linearGradient id="needleG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8dc"/><stop offset=".5" stop-color="#c9a227"/><stop offset="1" stop-color="#8a6a1f"/></linearGradient></defs>
    <circle cx="40" cy="24" r="22" fill="url(#needleG)" stroke="#5c3d08" stroke-width="2"/>
    <circle cx="40" cy="24" r="8" fill="#7a0f1a" stroke="#fff8dc" stroke-width="2"/>
    <path d="M24 34 L40 116 L56 34 Z" fill="url(#needleG)" stroke="#5c3d08" stroke-width="2" stroke-linejoin="round"/>
    <path d="M40 46 L40 108" stroke="#fff8dc" stroke-width="2" opacity=".7"/>
  </svg>`;
}
export function iconBan() {
  return `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="8"/><path d="M11 37 37 11" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
  </svg>`;
}
export const TB_ICONS = {
  back: `<svg viewBox="0 0 24 24" fill="none"><path d="M15 5 8 12l7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  swap: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 8h14m0 0-4-4m4 4-4 4M20 16H6m0 0 4-4m-4 4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  full: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  exitFull: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  sound: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  mute: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m17 9 5 6m0-6-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  battery: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="16" height="10" rx="2" stroke="currentColor" stroke-width="2"/><path d="M21 10v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 10h6" stroke="currentColor" stroke-width="2"/></svg>`,
  reset: `<svg viewBox="0 0 24 24" fill="none"><path d="M20 11a8 8 0 1 0-2.3 6M20 5v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
