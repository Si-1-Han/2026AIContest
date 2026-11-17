import { UPPER_CAMPUS_LEVEL } from './elevationLevels';

type Point = [number, number];
type Rect = [number, number, number, number]; // u0, u1, v0, v1 (0..1, v=0 은 이공관 쪽)

/**
 * 이공관 남향 출입구 앞 사각 정원. 카카오 로드뷰(2026-06·09)와 사용자 배치도 기준.
 * 평지 위에 네 모서리의 ㄱ자 수풀(나무 포함)과 가운데 사각 수풀, 그 사이의 벽돌 포장 통로와 벤치로 이뤄진다.
 * 치수는 사진·배치도 비례를 이공관 두 날개와 동쪽·남쪽 보도 사이 공간에 맞춘 근사값이다.
 */
export const SCIENCE_GARDEN_LEVEL = UPPER_CAMPUS_LEVEL;
/** 출입문(정면 외벽 중앙)과 같은 축. */
export const SCIENCE_GARDEN = { x0: 29.5, x1: 55.8, z0: 181, z1: 199.4 };
const W = SCIENCE_GARDEN.x1 - SCIENCE_GARDEN.x0, D = SCIENCE_GARDEN.z1 - SCIENCE_GARDEN.z0;
export const SCIENCE_DOOR_X = (SCIENCE_GARDEN.x0 + SCIENCE_GARDEN.x1) / 2;
/** 평지·벽돌 포장 범위(건물·차도·보도는 렌더링 때 빼낸다). 출입문 앞마당까지 포함한다. */
export const SCIENCE_COURT: Point[] = [[26.4, 176], [58, 176], [58, 202.5], [26.4, 202.5]];

export const gardenPoint = (u: number, v: number): Point => [SCIENCE_GARDEN.x0 + u * W, SCIENCE_GARDEN.z0 + v * D];
const toWorld = ([u0, u1, v0, v1]: Rect) => { const [x0, z0] = gardenPoint(u0, v0), [x1, z1] = gardenPoint(u1, v1); return { x0, x1, z0, z1 }; };
const mirror = ([u0, u1, v0, v1]: Rect, mu: boolean, mv: boolean): Rect => [mu ? 1 - u1 : u0, mu ? 1 - u0 : u1, mv ? 1 - v1 : v0, mv ? 1 - v0 : v1];
const corners = [[false, false], [true, false], [false, true], [true, true]] as const;

/** 모서리 ㄱ자 수풀 = 바깥쪽 가로 띠 + 세로 띠. 가운데 사각 수풀. */
export const GARDEN_HEDGES = [
  ...corners.flatMap(([mu, mv]) => [mirror([0, 0.431, 0, 0.171], mu, mv), mirror([0, 0.181, 0, 0.374], mu, mv)]),
  [0.333, 0.667, 0.364, 0.636] as Rect,
].map(toWorld);

export interface GardenBench { x: number; z: number; length: number; angle: number }
function bench(rect: Rect, maxLength: number): GardenBench {
  const r = toWorld(rect), along = r.x1 - r.x0 > r.z1 - r.z0;
  return { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, length: Math.min(maxLength, along ? r.x1 - r.x0 : r.z1 - r.z0), angle: along ? 0 : Math.PI / 2 };
}
/** 모서리마다 수풀 안쪽을 따라 두 개, 가운데 수풀 둘레에 네 개. */
export const GARDEN_BENCHES: GardenBench[] = [
  ...corners.flatMap(([mu, mv]) => [bench(mirror([0.2, 0.233, 0.19, 0.35], mu, mv), 2.6), bench(mirror([0.25, 0.357, 0.193, 0.224], mu, mv), 2.6)]),
  bench([0.41, 0.59, 0.305, 0.335], 3.4), bench([0.41, 0.59, 0.665, 0.695], 3.4),
  bench([0.275, 0.305, 0.44, 0.56], 2.4), bench([0.695, 0.725, 0.44, 0.56], 2.4),
];

/** 수풀 안의 나무: 모서리마다 소나무와 활엽수, 가운데는 큰 활엽수. */
export const GARDEN_TREES: { x: number; z: number; species: 'pine' | 'broadleaf'; scale: number; seed: number }[] = [
  ...corners.flatMap(([mu, mv], i) => {
    const [px, pz] = gardenPoint(mu ? 1 - 0.08 : 0.08, mv ? 1 - 0.1 : 0.1);
    const [bx, bz] = gardenPoint(mu ? 1 - 0.3 : 0.3, mv ? 1 - 0.085 : 0.085);
    const [cx, cz] = gardenPoint(mu ? 1 - 0.09 : 0.09, mv ? 1 - 0.28 : 0.28);
    return [
      { x: px, z: pz, species: 'pine' as const, scale: 1.05, seed: 0.71 + i * 0.05 },
      { x: bx, z: bz, species: i % 2 ? 'pine' as const : 'broadleaf' as const, scale: 0.8, seed: 0.2 + i * 0.13 },
      { x: cx, z: cz, species: i % 2 ? 'broadleaf' as const : 'pine' as const, scale: 0.75, seed: 0.4 + i * 0.11 },
    ];
  }),
  { ...(([x, z]) => ({ x, z }))(gardenPoint(0.5, 0.5)), species: 'broadleaf', scale: 1.25, seed: 0.27 },
];

/** 가운데 수풀을 돌아 출입문 앞까지 가는 벽돌 통로(거리뷰 이동 지점). */
export const SCIENCE_APPROACH: Point = [SCIENCE_DOOR_X, 179.9];
export const SCIENCE_GARDEN_ENTRY: Point = [SCIENCE_DOOR_X, 202.2];
export const SCIENCE_GARDEN_WALK: Point[] = [
  [SCIENCE_DOOR_X, 199.0], [SCIENCE_DOOR_X, 194.6], [36.1, 194.6], [36.1, 185.85], [SCIENCE_DOOR_X, 185.85],
];

function rectDistance(x: number, z: number, ring: Point[]) {
  const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
  const dx = Math.max(Math.min(...xs) - x, 0, x - Math.max(...xs)), dz = Math.max(Math.min(...zs) - z, 0, z - Math.max(...zs));
  return Math.hypot(dx, dz);
}
export const inScienceCourt = (x: number, z: number, margin = 0) => rectDistance(x, z, SCIENCE_COURT) <= margin;
/** 정원과 출입문 앞마당은 주변 도로·건물과 같은 수평면. 바깥 3m에 걸쳐 원래 지형과 이어진다. */
export function scienceCourtGround(x: number, z: number, original: number) {
  const d = rectDistance(x, z, SCIENCE_COURT);
  if (d >= 3) return original;
  const t = d / 3, w = t * t * (3 - 2 * t);
  return SCIENCE_GARDEN_LEVEL + (original - SCIENCE_GARDEN_LEVEL) * w;
}
