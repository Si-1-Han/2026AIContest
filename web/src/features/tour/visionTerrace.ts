import { PARKING_LEVEL, MIDDLE_LEVEL, UPPER_CAMPUS_LEVEL, STAIR_RISE } from './elevationLevels';

/** 사용자 사진/지도 기준 배치. 계단 높이와 쉼터 치수는 실측 전의 표현용 근사치다. */
export const VISION_TERRACE = {
  x: 9.7,
  bottomZ: 128.5,
  width: 3.2,
  stepsPerFlight: 10,
  riser: 0.18,
  tread: 0.32,
  landing: 1.4,
  // 길 서쪽의 벤치 쉼터(벤치 4개가 가운데 쓰레기통을 둘러싼 배치, 사용자 배치도 기준).
  rest: { x: 4.6, z: 186.5, width: 6.6, depth: 7.2 },
};
export const TERRACE_HEIGHT = UPPER_CAMPUS_LEVEL;
export const STAIR_TOP_Z = VISION_TERRACE.bottomZ + VISION_TERRACE.stepsPerFlight * 2 * VISION_TERRACE.tread + VISION_TERRACE.landing;

export interface TerracePoint { id: string; x: number; y: number; z: number; stop?: boolean }
export const VISION_TERRACE_PATH: TerracePoint[] = [
  { id: 'tour_vision_approach', x: VISION_TERRACE.x, y: PARKING_LEVEL, z: 121.5 },
  { id: 'tour_vision_stairs_bottom', x: VISION_TERRACE.x, y: PARKING_LEVEL, z: VISION_TERRACE.bottomZ, stop: true },
  { id: 'tour_vision_landing_start', x: VISION_TERRACE.x, y: PARKING_LEVEL + STAIR_RISE / 2, z: VISION_TERRACE.bottomZ + VISION_TERRACE.stepsPerFlight * VISION_TERRACE.tread },
  { id: 'tour_vision_landing_end', x: VISION_TERRACE.x, y: PARKING_LEVEL + STAIR_RISE / 2, z: STAIR_TOP_Z - VISION_TERRACE.stepsPerFlight * VISION_TERRACE.tread },
  { id: 'tour_vision_stairs_top', x: VISION_TERRACE.x, y: MIDDLE_LEVEL, z: STAIR_TOP_Z, stop: true },
  { id: 'tour_vision_side', x: VISION_TERRACE.x, y: MIDDLE_LEVEL, z: 145 },
  { id: 'tour_vision_rear', x: VISION_TERRACE.x, y: MIDDLE_LEVEL, z: 168.5, stop: true },
  { id: 'tour_vision_rest_entry', x: VISION_TERRACE.x, y: TERRACE_HEIGHT, z: 176.5, stop: true },
  // 계단 꼭대기에서 이공관 서쪽 외벽을 따라 남쪽 도로까지 곧게 내려가는 포장길. 쉼터와 경비실은 길 서쪽에 있다.
  { id: 'tour_vision_rest', x: VISION_TERRACE.x, y: TERRACE_HEIGHT, z: 186.5, stop: true },
  { id: 'tour_vision_rest_exit', x: VISION_TERRACE.x, y: TERRACE_HEIGHT, z: 197 },
  { id: 'tour_vision_path_end', x: VISION_TERRACE.x, y: TERRACE_HEIGHT, z: 205.6 },
];
/**
 * 경비실: 이공관 남쪽 면 라인을 벗어나 동서 도로 건너편(벤치 구역의 맞은편), 곧은 보행로 연장선의 서쪽,
 * 비전관 쪽으로 꺾이는 도로의 보도 옆. 카카오 로드뷰(2026-06, 꺾이는 도로 지점)와 사용자 설명 기준 근사 치수.
 */
export const GUARD_BOOTH = { x0: -0.5, x1: 4.3, z0: 205.8, z1: 210.6, height: 2.9 };
/** 이공관 서쪽 길·쉼터·경비실 일대는 이공관·남쪽 도로와 같은 평지. 계단 옆(동쪽)은 계단 높이를 건드리지 않는다. */
const SIDE_FLAT = { x0: -8, x1: 15.3, z0: 178.5, z1: 212 };
export function scienceSideGround(x: number, z: number, original: number) {
  const dx = Math.max(SIDE_FLAT.x0 - x, 0, x - SIDE_FLAT.x1), dz = Math.max(SIDE_FLAT.z0 - z, 0, z - SIDE_FLAT.z1);
  // 계단(폭 3.2m) 양옆 0.4m 안쪽만 계단 높이를 유지한다.
  if (dz > 0 && z < SIDE_FLAT.z0 && Math.abs(x - VISION_TERRACE.x) < VISION_TERRACE.width / 2 + 0.4) return original;
  const d = Math.hypot(dx, dz);
  if (d >= 6) return original;
  const t = d / 6, w = t * t * (3 - 2 * t);
  return TERRACE_HEIGHT + (original - TERRACE_HEIGHT) * w;
}
/** 2층 외부 통로에서 동쪽으로 나온 후 북쪽, 다시 동쪽으로 꺾어 로뎀관으로 향한다. */
export const RODEM_ACCESS_PATH: TerracePoint[] = [
  VISION_TERRACE_PATH.find(p => p.id === 'tour_vision_side')!,
  { id: 'tour_rodem_turn', x: 20.5, y: MIDDLE_LEVEL, z: 145, stop: true },
  { id: 'tour_rodem_north', x: 20.5, y: MIDDLE_LEVEL, z: 121.5, stop: true },
  { id: 'tour_rodem_court', x: 34.5, y: MIDDLE_LEVEL, z: 121.5, stop: true },
];
/** 이 사각형만 저층 외벽에서 열어 두는, 사진으로 확인된 외부 계단·통과 공간. */
export const VISION_PASSAGE_CUT: [number, number][] = [[7.8, 132], [11.6, 132], [11.6, 143.2], [20, 143.2], [20, 146.8], [11.6, 146.8], [11.6, 168], [7.8, 168]];
export const VISION_FRONT_PATH: TerracePoint[] = [
  { id: 'tour_vision_front', x: -4, y: PARKING_LEVEL, z: 116.5 },
  VISION_TERRACE_PATH[0]!,
];
export const TERRACE_PATHS = [VISION_TERRACE_PATH, RODEM_ACCESS_PATH, VISION_FRONT_PATH];
export const TERRACE_STOPS = new Set(TERRACE_PATHS.flat().filter(p => p.stop).map(p => p.id));
export function isTerraceStair(a: string, b: string) {
  return a === 'tour_vision_stairs_bottom' && b === 'tour_vision_landing_start'
    || a === 'tour_vision_landing_end' && b === 'tour_vision_stairs_top'
    || a === 'tour_vision_rear' && b === 'tour_vision_rest_entry';
}

/** 계단/쉼터 위와 진입 동선에 자동 수목이 배치되지 않게 한다. */
export function inVisionTerrace(x: number, z: number, margin = 0) {
  const r = VISION_TERRACE.rest, g = GUARD_BOOTH;
  if (Math.abs(x - r.x) < r.width / 2 + margin && Math.abs(z - r.z) < r.depth / 2 + margin) return true;
  if (x > g.x0 - margin && x < g.x1 + margin && z > g.z0 - margin && z < g.z1 + margin) return true;
  return [...TERRACE_PATHS, [...VISION_TERRACE_PATH.slice(-1), { x: 14.59, z: 207.48 }]].some(path => path.slice(1).some((b, i) => {
    const a = path[i]!, dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < VISION_TERRACE.width / 2 + margin;
  }));
}

