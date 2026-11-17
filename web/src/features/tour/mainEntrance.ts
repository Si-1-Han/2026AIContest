import { buildingElevation } from './elevationLevels';

/** 본관 저층동의 정문 진입로 쪽 출입구. 사진 비례를 적용한 근사 치수(m). */
const a = [-74.68, -206] as const, b = [-56.99, -175.19] as const;
const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
export const MAIN_ENTRANCE = {
  a, b, length, t: 0.38, ux: (b[0] - a[0]) / length, uz: (b[1] - a[1]) / length,
  nx: -(b[1] - a[1]) / length, nz: (b[0] - a[0]) / length,
  lowerSteps: 7, upperSteps: 5, riser: 0.15, tread: 0.4,
  upperLanding: 1.8, landing: 1.6, width: 12.5, upperWidth: 11.5,
};
export const MAIN_ENTRY_RISE = (MAIN_ENTRANCE.lowerSteps + MAIN_ENTRANCE.upperSteps) * MAIN_ENTRANCE.riser;
export const MAIN_ENTRY_FLOOR = buildingElevation('main');
export const MAIN_ENTRY_BASE = MAIN_ENTRY_FLOOR - MAIN_ENTRY_RISE;
export function mainEntryPoint(offset: number, sideways = 0): [number, number] {
  const e = MAIN_ENTRANCE;
  return [a[0] + (b[0] - a[0]) * e.t + e.nx * offset + e.ux * sideways, a[1] + (b[1] - a[1]) * e.t + e.nz * offset + e.uz * sideways];
}
export function mainEntryLocal(x: number, z: number) {
  const [cx, cz] = mainEntryPoint(0), e = MAIN_ENTRANCE;
  return { u: (x - cx) * e.ux + (z - cz) * e.uz, v: (x - cx) * e.nx + (z - cz) * e.nz };
}
const point = (id: string, offset: number, y: number, stop = false) => { const [x, z] = mainEntryPoint(offset); return { id, x, z, y, stop }; };
export const MAIN_ENTRANCE_PATH = [
  point('tour_main_approach', 10, MAIN_ENTRY_BASE, true),
  point('tour_main_stairs_bottom', 8.2, MAIN_ENTRY_BASE, true),
  point('tour_main_landing_start', 5.4, MAIN_ENTRY_FLOOR - 0.75),
  point('tour_main_landing_end', 3.8, MAIN_ENTRY_FLOOR - 0.75),
  point('tour_main_stairs_top', 1.8, MAIN_ENTRY_FLOOR, true),
];
export const MAIN_ENTRY_FOOTPRINT: [number, number][] = [mainEntryPoint(0, -7), mainEntryPoint(8.4, -7), mainEntryPoint(8.4, 7), mainEntryPoint(0, 7)];
export const isMainEntryStair = (a: string, b: string) => a === 'tour_main_stairs_bottom' && b === 'tour_main_landing_start' || a === 'tour_main_landing_end' && b === 'tour_main_stairs_top';
export function inMainEntrance(x: number, z: number, margin = 0) {
  const { u, v } = mainEntryLocal(x, z); return Math.abs(u) < 7 + margin && v > -0.1 && v < 10.5 + margin;
}
/** 본관 앞과 주차장은 같은 평지. 낮은 지면은 1층 진입로의 좁은 구역에만 만든다. */
export function mainEntryGround(x: number, z: number, original: number) {
  const { u, v } = mainEntryLocal(x, z);
  const weight = Math.max(0, Math.min(1, (u + 44) / 4, (46 - u) / 4, (v + 52) / 4, (32 - v) / 4));
  return original + (MAIN_ENTRY_BASE - original) * weight;
}
