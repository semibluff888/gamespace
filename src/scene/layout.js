import { Vector3 } from 'three';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** 星球基础半径（世界单位）；world.size 是它的倍数 */
export const BASE_RADIUS = 3.4;

/** FNV-1a → [0, 1) */
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * 黄金角螺旋自动布局：第 i 个作品的位置只取决于它的序号和 id，
 * 所以在末尾新增作品不会挪动已有作品。写了 position 的作品使用手动坐标。
 * 高度：所有星球都浮在星系盘上方（自身半径 + 1.2），再加 0~1.4 的细微高低差。
 */
export function layoutWorlds(games) {
  let idx = 0;
  return games.map((g) => {
    if (Array.isArray(g.position) && g.position.length === 3) return new Vector3(...g.position);
    const i = idx++;
    const theta = i * GOLDEN + 0.95;
    const r = 24 + 10 * Math.sqrt(i);
    const y = BASE_RADIUS * (g.world?.size || 1) + 1.2 + hashString(g.id) * 1.4;
    return new Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);
  });
}
