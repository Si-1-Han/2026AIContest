import { MAIN_ENTRY_BASE } from './mainEntrance';
import { MAIN_UPPER_ROAD } from './mainBuildingAccess';
import { PARKING_LEVEL, SLOPE_GAIN } from './elevationLevels';

type Anchor = [number, number, number];

/**
 * 본관 앞 교차로 → 대학원관 오르막.
 *
 * 카카오 로드뷰(2026-06 촬영)에서 본관 앞 교차로·분수 광장·대학원관 앞마당은 모두 도로와 거의 같은
 * 높이이고, 교차로에서 대학원관 북쪽 외벽까지 차도가 고르게 올라간다. 이전 모델처럼 교차로 바로 뒤
 * 교차로 안에서 바로 높이를 올리면 횡단 도로와 삼각 보도섬 사이에 혹이 생긴다.
 * 분수대 앞 갈림길을 지난 뒤부터 대학원관 북쪽 외벽 앞(z=-106)까지 오르게 한다. 측량값이 아닌 상대 고도다.
 */
export const APPROACH_START_Z = -156.4;
export const APPROACH_TOP_Z = -106;
const JUNCTION_FLAT_END_Z = -144.1;
const ROAD_BAND = 6.8;

/** 본관 앞 횡단 도로(교차로 → 당정초 방향). 지형·포장 모두 이 단면을 기준으로 한다. */
const frontBend: Anchor = [-30.7, -133.65, 3.27];
export const FIELD_ENTRY_ROAD_POINT: [number, number] = [-23.19, -131.78];
const fieldEntryProgress = (FIELD_ENTRY_ROAD_POINT[0] - frontBend[0]) / (MAIN_UPPER_ROAD.x - frontBend[0]);
export const MAIN_FRONT_PROFILE: Anchor[] = [
  [-86.38, -156.4, MAIN_ENTRY_BASE],
  [-61.46, -146.22, MAIN_ENTRY_BASE],
  frontBend,
  [...FIELD_ENTRY_ROAD_POINT, frontBend[2] + (MAIN_UPPER_ROAD.y - frontBend[2]) * fieldEntryProgress],
  [MAIN_UPPER_ROAD.x, MAIN_UPPER_ROAD.z, MAIN_UPPER_ROAD.y],
  [24.17, -130.26, 4 * SLOPE_GAIN],
];

/** 양 끝은 완만하게 시작·종료하고 가운데는 일정한 경사인 곡선. */
export function approachEase(t: number, k = 0.2) {
  const c = Math.max(0, Math.min(1, t));
  if (c < k) return c * c / (2 * k * (1 - k));
  if (c > 1 - k) return 1 - (1 - c) * (1 - c) / (2 * k * (1 - k));
  return (c - k / 2) / (1 - k);
}

/** 교차로를 지난 뒤 일정한 경사로 대학원관 평지에 닿는다. */
export function spineApproachLevel(z: number) {
  const t = (z - JUNCTION_FLAT_END_Z) / (APPROACH_TOP_Z - JUNCTION_FLAT_END_Z);
  return MAIN_ENTRY_BASE + (PARKING_LEVEL - MAIN_ENTRY_BASE) * approachEase(t, 0.05);
}

const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 운동장 쪽은 운동장 북쪽 끝과 사잇길 입구(z=-122)에서 평지가 시작된다. 꺾임 없이 이어진다. */
export function approachTopZ(x: number) {
  return APPROACH_TOP_Z + (-122 - APPROACH_TOP_Z) * smooth(-55, -28, x);
}

export function mainFrontRoadAt(x: number) {
  const p = MAIN_FRONT_PROFILE;
  if (x <= p[0]![0]) return { z: p[0]![1], y: p[0]![2] };
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!, b = p[i]!;
    if (x <= b[0]) { const t = (x - a[0]) / (b[0] - a[0]); return { z: a[1] + (b[1] - a[1]) * t, y: a[2] + (b[2] - a[2]) * t }; }
  }
  const last = p.at(-1)!; return { z: last[1], y: last[2] };
}

/**
 * 본관 앞 횡단 도로와 대학원관·운동장 평지 사이(분수 광장 삼각지)의 지면 높이.
 * 북쪽 도로 높이에서 남쪽 평지 높이까지 남북 방향으로 고르게 오른다.
 */
export function approachLevel(x: number, z: number) {
  const road = mainFrontRoadAt(x), top = approachTopZ(x);
  if (z >= top) return PARKING_LEVEL;
  if (z <= road.z) return road.y;
  // 서쪽(직선 차도 쪽)은 교차로에서 시작하는 차도 오르막과 같은 기준을 써 보도 경계에 턱이 생기지 않게 한다.
  // 동쪽은 횡단 도로와 양옆 보도가 같은 단면을 쓰는 폭(중심선에서 6.8m) 바깥부터 오르기 시작한다.
  const w = smooth(-82, -58, x), startZ = APPROACH_START_Z + (road.z + ROAD_BAND - APPROACH_START_Z) * w;
  if (z <= startZ) return road.y;
  return road.y + (PARKING_LEVEL - road.y) * approachEase((z - startZ) / (top - startZ));
}

/** 교차로(n26) → 당정역 방향 입구(g_gate) → 직선 차도 시작(n30): 실제 도로 간선 위 좌표. */
const APPROACH_ROAD: [number, number][] = [[-86.38, -156.4], [-82.99, -138.2], [-81.8, -131.85]];
/** 직선 차도가 시작되기 전 구간은 실제 도로 간선 위의 점으로 오르막을 나눠, 포장 경사가 같은 곡선을 따르게 한다. */
export function approachRoadPoint(z: number): [number, number] {
  for (let i = 1; i < APPROACH_ROAD.length; i++) {
    const a = APPROACH_ROAD[i - 1]!, b = APPROACH_ROAD[i]!;
    if (z <= b[1] || i === APPROACH_ROAD.length - 1) { const t = (z - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, z]; }
  }
  return APPROACH_ROAD.at(-1)!;
}
export const APPROACH_ROAD_END_Z = APPROACH_ROAD.at(-1)![1];
