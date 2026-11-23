import { MIDDLE_LEVEL } from './elevationLevels';

type Point = [number, number];

/** 도로를 향한 로뎀관 연결동 벽면의 사진 표시 지점. */
export const RODEM_ENTRY_WALL: [Point, Point] = [[52.48, 128.83], [51.63, 113.5]];
export const RODEM_ENTRY_T = 0.17;
export const RODEM_DOOR_WIDTH = 2.76;
const [a, b] = RODEM_ENTRY_WALL;
const dx = b[0] - a[0], dz = b[1] - a[1];
const length = Math.hypot(dx, dz), ux = dx / length, uz = dz / length;
export const RODEM_ENTRY_DOOR: Point = [a[0] + dx * RODEM_ENTRY_T, a[1] + dz * RODEM_ENTRY_T];
const [doorX, doorZ] = RODEM_ENTRY_DOOR;

export function rodemEntryPoint(distance: number, side = 0): Point {
  return [doorX - uz * distance + ux * side, doorZ + ux * distance + uz * side];
}

export function rodemEntryLocal(x: number, z: number) {
  return { distance: -(x - doorX) * uz + (z - doorZ) * ux, side: (x - doorX) * ux + (z - doorZ) * uz };
}

const halfWidth = 1.55;
const sidewalkDistance = 21.4;
export const RODEM_ENTRY_WALK: Point[] = [
  rodemEntryPoint(-0.15, -halfWidth), rodemEntryPoint(19.5, -halfWidth), rodemEntryPoint(22.15, -1.85),
  rodemEntryPoint(22.15, 1.85), rodemEntryPoint(19.5, halfWidth), rodemEntryPoint(-0.15, halfWidth),
];
export const RODEM_ENTRY_STOP = rodemEntryPoint(3.5);
export const RODEM_ENTRY_NODES = [
  { id: 'tour_rodem_entry_sidewalk', point: rodemEntryPoint(sidewalkDistance) },
  { id: 'tour_rodem_entry_ramp', point: rodemEntryPoint(11) },
  { id: 'tour_rodem_entry_door', point: RODEM_ENTRY_STOP },
];

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (t: number) => t * t * (3 - 2 * t);

export function rodemEntryGround(x: number, z: number, original: number, roadGrade: (x: number, z: number, original: number) => number) {
  const { distance, side } = rodemEntryLocal(x, z);
  const finish = 19.8;
  if (distance < -0.01 || distance >= sidewalkDistance || Math.abs(side) > 4.5) return original;
  const [sx, sz] = rodemEntryPoint(sidewalkDistance, side);
  const road = roadGrade(sx, sz, original);
  const t = clamp((distance - 0.4) / (finish - 0.4));
  const y = MIDDLE_LEVEL + (road - MIDDLE_LEVEL) * (0.7 * t + 0.3 * ease(t));
  const shoulders = 1 - ease(clamp((Math.abs(side) - 1.85) / 2.65));
  const join = 1 - ease(clamp((distance - finish) / (sidewalkDistance - finish)));
  return original + (y - original) * shoulders * join;
}
