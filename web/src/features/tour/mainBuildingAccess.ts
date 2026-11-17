import { MAIN_ENTRY_BASE, MAIN_ENTRY_FLOOR, mainEntryLocal, mainEntryPoint } from './mainEntrance';

type Point = [number, number];
export interface MainAccessNode { id: string; x: number; z: number; y: number; stop?: boolean }
export const MAIN_FIRST_FLOOR = MAIN_ENTRY_FLOOR - 3.6;
export const MAIN_THIRD_FLOOR = MAIN_ENTRY_FLOOR + 3.6;
export const MAIN_GARDEN_LEVEL = 5.4;
export const MAIN_PARKING_LEVEL = MAIN_ENTRY_BASE;
export const mainSitePoint = (u: number, v: number): Point => mainEntryPoint(v, u);
const node = (id: string, u: number, v: number, y: number): MainAccessNode => {
  const [x, z] = mainSitePoint(u, v); return { id: `tour_main_${id}`, x, z, y, stop: true };
};
export const MAIN_PARKING_PATH = [node('parking_turn', -29, 4, MAIN_PARKING_LEVEL), node('parking_middle', -29, -19, MAIN_PARKING_LEVEL), node('parking_end', -29, -40, MAIN_PARKING_LEVEL)];
// 두 입구 모두 문 중심과 같은 축이다. 도로 위에는 별도의 데크를 그리지 않는다.
export const MAIN_LOWER_ROAD = node('lower_road', 19, 22.8, MAIN_ENTRY_BASE);
export const MAIN_UPPER_ROAD = node('upper_road', 83.48402485945883, -19, 4.64);
export const MAIN_LOWER_PATH = [
  node('lower_turn', 19, 16.2, MAIN_ENTRY_BASE),
  node('lower_approach', 19, 14.5, MAIN_ENTRY_BASE),
  node('lower_slope', 19, 11, MAIN_ENTRY_BASE - 0.45),
  node('lower_stairs', 19, 9, MAIN_ENTRY_BASE - 0.45),
  node('lower_landing', 19, 5, MAIN_FIRST_FLOOR),
  node('first_floor_door', 19, 1.65, MAIN_FIRST_FLOOR),
];
export const MAIN_UPPER_PATH = [
  node('upper_turn', 77.5, -19, 4.9),
  node('upper_ramp', 66, -19, MAIN_GARDEN_LEVEL),
  node('upper_stairs', 48, -19, MAIN_THIRD_FLOOR - 0.6),
  node('upper_landing', 46, -19, MAIN_THIRD_FLOOR),
  node('third_floor_door', 43.7, -19, MAIN_THIRD_FLOOR),
];
export const MAIN_GARDEN_PATH = [MAIN_UPPER_PATH[1]!, node('garden', 66, -28, MAIN_GARDEN_LEVEL)];
export const MAIN_SITE_PATHS = [MAIN_PARKING_PATH, MAIN_LOWER_PATH, MAIN_UPPER_PATH, MAIN_GARDEN_PATH];
export const MAIN_ACCESS_NODES = [...MAIN_SITE_PATHS.flat(), MAIN_LOWER_ROAD, MAIN_UPPER_ROAD];
export const MAIN_ACCESS_CONNECTIONS = [
  [MAIN_UPPER_ROAD, MAIN_UPPER_PATH[0]!],
  [MAIN_LOWER_ROAD, MAIN_LOWER_PATH[0]!],
];
export const MAIN_WALK_SURFACES = [
  [...MAIN_LOWER_PATH, node('first_floor_threshold', 19, -0.1, MAIN_FIRST_FLOOR)],
  [...MAIN_UPPER_PATH, node('third_floor_threshold', 42, -19, MAIN_THIRD_FLOOR)],
  MAIN_GARDEN_PATH, ...MAIN_ACCESS_CONNECTIONS,
];
export function mainAccessWidth(path: MainAccessNode[]) { return path.some(p => p.id.includes('lower_') || p.id.includes('first_floor')) ? 4.2 : path.some(p => p.id === 'tour_main_garden') ? 2.8 : 6.6; }
export function isMainAccessStair(a: string, b: string) {
  return [a, b].includes('tour_main_lower_stairs') && [a, b].includes('tour_main_lower_landing')
    || [a, b].includes('tour_main_upper_stairs') && [a, b].includes('tour_main_upper_landing');
}
export const mainSitePolygon = (points: Point[]) => points.map(([u, v]) => mainSitePoint(u, v));
export const MAIN_PARKING = mainSitePolygon([[-39, -44], [-21.6, -44], [-21.6, 1], [-24, 9], [-34, 9], [-39, 1]]);
export const MAIN_GARDEN = mainSitePolygon([[58, -38], [76, -38], [76, -25], [58, -25]]);
export function accessStrip(a: MainAccessNode, b: MainAccessNode, width: number): Point[] {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), nx = -dz / len * width / 2, nz = dx / len * width / 2;
  return [[a.x + nx, a.z + nz], [b.x + nx, b.z + nz], [b.x - nx, b.z - nz], [a.x - nx, a.z - nz]];
}
export const MAIN_FRONT_PLAZA = mainSitePolygon([[-7, 8.2], [7, 8.2], [7, 10.2], [-7, 10.2]]);
// 아스팔트 대지는 외벽까지 붙고, 오른쪽 1층 진입부만 별도의 낮은 길로 판다.
export const MAIN_STREET = mainSitePolygon([[-40, -48], [42, -48], [42, 28], [-40, 28]]);
export const MAIN_LOWER_CUT = mainSitePolygon([[16.4, -.15], [21.6, -.15], [21.6, 16.25], [16.4, 16.25]]);
export const MAIN_STAIR_SITE = mainSitePolygon([[-7.05, -.1], [7.05, -.1], [7.05, 8.35], [-7.05, 8.35]]);
export const MAIN_STAIR_PLANTERS = [-1, 1].map(side => mainSitePolygon([[side * 7.05, .6], [side * 14.8, .6], [side * 16.2, 2], [side * 16.2, 8.4], [side * 14.8, 10.2], [side * 7.05, 8.35]]));
export const mainPlanterHeight = (v: number) => MAIN_ENTRY_FLOOR - .15 + (MAIN_ENTRY_BASE + .12 - MAIN_ENTRY_FLOOR + .15) * (v - .6) / 9.6;
export function inMainStreet(x: number, z: number, margin = 0) {
  const {u,v}=mainEntryLocal(x,z); return u >= -40-margin && u <= 42+margin && v >= -48-margin && v <= 28+margin;
}
export function mainLowerGrade(x: number, z: number) {
  const {u,v}=mainEntryLocal(x,z);
  if (u < 16.4 || u > 21.6 || v < -.15 || v > 16.25) return undefined;
  const path=MAIN_WALK_SURFACES[0]!;
  return samplePath(x,z,path).y;
}
export const MAIN_PAVED_CUTS = [
  MAIN_FRONT_PLAZA, MAIN_STREET,
  MAIN_PARKING, MAIN_GARDEN,
  mainSitePolygon([[-7.05, -0.1], [7.05, -0.1], [7.05, 12.2], [-7.05, 12.2]]),
  ...MAIN_WALK_SURFACES.flatMap(path => path.slice(1).map((b, i) => accessStrip(path[i]!, b, mainAccessWidth(path) + 0.02))),
];
// 보도 개구부를 출입구 축에 맞춰 끊고, 차도 위로 별도 포장면을 연장하지 않는다.
export const MAIN_ROAD_OPENINGS = [
  mainSitePolygon([[16.85, 16.1], [21.15, 16.1], [21.15, 21], [16.85, 21]]),
  mainSitePolygon([[78, -22.35], [80.3, -22.35], [80.3, -15.65], [78, -15.65]]),
];
function samplePath(x: number, z: number, path: MainAccessNode[]) {
  let nearest = { distance: Infinity, y: 0 };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const distance = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (distance < nearest.distance) nearest = { distance, y: a.y + (b.y - a.y) * t };
  }
  return nearest;
}
export function mainSiteGround(x: number, z: number, original: number) {
  const { u, v } = mainEntryLocal(x, z);
  if (u < -45 || u > 87 || v < -49 || v > 33) return original;
  let y = original;
  const mix = (target: number, w: number) => { y += (target - y) * Math.max(0, Math.min(1, w)); };
  if (u < -18 && u > -44 && v > -49 && v < 16) mix(MAIN_PARKING_LEVEL, Math.min((u + 44) / 4, (-18 - u) / 3, (v + 49) / 4, (16 - v) / 4));
  if (u > 42.2) {
    const p = samplePath(x, z, [MAIN_UPPER_ROAD, ...MAIN_UPPER_PATH]); mix(p.y, Math.min((7 - p.distance) / 3.5, (87 - u) / 8));
  }
  if (u > 51 && u < 82 && v > -44 && v < -21) mix(MAIN_GARDEN_LEVEL - 0.05, Math.min((u - 51) / 6, (82 - u) / 5, (v + 44) / 5, (-21 - v) / 3));
  return y;
}
export function inMainSite(x: number, z: number, margin = 0) {
  const { u, v } = mainEntryLocal(x, z);
  return inMainStreet(x,z,margin) || Math.abs(u) < 16 + margin && v > -0.1 && v < 14 + margin
    || u > -20 - margin && u < 42 + margin && v > -0.1 && v < 9 + margin
    || u > -43 - margin && u < -20 + margin && v > -48 && v < 12 + margin
    || u > 14 - margin && u < 24 + margin && v > -0.8 && v < 33
    || u > 42 && u < 82 + margin && v > -40 - margin && v < -12 + margin;
}
