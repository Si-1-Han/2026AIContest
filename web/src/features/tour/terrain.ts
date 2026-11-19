import { musicForecourtGround } from './musicForecourt';
import { mainEntryGround } from './mainEntrance';
import { mainSiteGround, mainUpperFootGround } from './mainBuildingAccess';
import { MAIN_ENTRY_BASE } from './mainEntrance';
import { pavementGrade } from './pavementGrade';
import { baseTerrain } from './baseTerrain';
import { FOUNTAIN_CENTER, FOUNTAIN_RADIUS, fountainGround, fountainPlaza, fountainPlazaLevel, fountainSurface, fountainSiteDistance } from './fountainSite';
import { spineDistanceAtZ, spinePoint, spineLocal } from './campusSpine';
import { frontageGround } from './buildingFrontage';
import { fieldWalkGround, fieldEntryGround } from './fieldWalk';
import type { CampusData } from '../../types/generated/campus';
import { buildingElevation, PARKING_LEVEL, UPPER_CAMPUS_LEVEL, SLOPE_GAIN } from './elevationLevels';
import { VISION_TERRACE_PATH, VISION_TERRACE, TERRACE_PATHS, isTerraceStair } from './visionTerrace';
import { scienceCourtGround } from './scienceGarden';
import { scienceSideGround } from './visionTerrace';
import { MAIN_FRONT_PROFILE, APPROACH_START_Z, APPROACH_TOP_Z, APPROACH_ROAD_END_Z, approachRoadPoint, spineApproachLevel } from './graduateApproach';

type Point = [number, number];
const CAMPUS_SPINE_WALK_EDGE = 5.3;
type Anchor = [number, number, number];
const eastSlopeHeight = (t: number) => 6.2 * SLOPE_GAIN + (UPPER_CAMPUS_LEVEL - 6.2 * SLOPE_GAIN) * t;
/** 빨간 표시를 기존 보행 그래프의 교차점에 대조한 경사 구간. [x,z,상대높이] */
export const SLOPE_PROFILES: { id: string; points: Anchor[] }[] = [
  { id: 'main-west', points: [[-122.13, -217.57, 0], [-110, -197.64, MAIN_ENTRY_BASE], [-88.15, -160.65, MAIN_ENTRY_BASE]] },
  { id: 'main-front', points: MAIN_FRONT_PROFILE },
  // 본관 교차로 → 대학원관 북쪽 외벽: 로드뷰처럼 한 번에 고르게 오르는 차도(혹 없음).
  { id: 'graduate-approach', points: [[-86.38, -156.4, MAIN_ENTRY_BASE], ...[-153, -150, -147, -144, -141, -138.2, -135, APPROACH_ROAD_END_Z].map((z): Anchor => [...approachRoadPoint(z), spineApproachLevel(z)]),
    ...Array.from({ length: 6 }, (_, i): Anchor => {
      const z = APPROACH_ROAD_END_Z + (APPROACH_TOP_Z - APPROACH_ROAD_END_Z) * (i + 1) / 6;
      return [...spinePoint(spineDistanceAtZ(z)), spineApproachLevel(z)];
    })] },
  { id: 'music-west', points: [[...spinePoint(spineDistanceAtZ(APPROACH_TOP_Z)), PARKING_LEVEL], [...spinePoint(spineDistanceAtZ(-4)), PARKING_LEVEL], [...spinePoint(spineDistanceAtZ(35)), PARKING_LEVEL], [...spinePoint(spineDistanceAtZ(145.26)), PARKING_LEVEL]] },
  { id: 'music-east-link', points: [[27.38, 62.85, PARKING_LEVEL], [68.14, 59.6, 6.2 * SLOPE_GAIN]] },
  { id: 'rodem-east', points: [[68.14, 59.6, 6.2 * SLOPE_GAIN], [75.26, 77.35, eastSlopeHeight(0.15)], [80, 101.97, eastSlopeHeight(0.43)], [77.85, 129.66, eastSlopeHeight(0.68)], [67.86, 146.22, eastSlopeHeight(0.86)], [61.43, 160.18, UPPER_CAMPUS_LEVEL]] },
];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const blend = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, value: number) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };
function along(x: number, z: number, a: Anchor, b: Anchor) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz));
  return { distance: Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), y: blend(a[2], b[2], t), t };
}
function polygonDistance(x: number, z: number, polygon: Point[]) {
  let inside = false, distance = Infinity;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    distance = Math.min(distance, along(x, z, [a[0], a[1], 0], [b[0], b[1], 0]).distance);
  });
  return inside ? 0 : distance;
}
const cache = new WeakMap<CampusData, (x: number, z: number) => number>();
export function tourElevation(campus: CampusData) {
  const cached = cache.get(campus); if (cached) return cached;
  const pads = campus.buildings.filter(b => b.id !== 'main').map(b => ({ polygon: b.footprint, y: buildingElevation(b.id) }));
  for (const area of campus.outdoor_areas ?? []) if (area.kind !== 'gate') pads.push({ polygon: area.footprint, y: area.kind === 'field' ? 4 * SLOPE_GAIN : area.id === 'parking_970298862' ? 0.8 * SLOPE_GAIN : area.kind === 'tennis' || area.center[1] > 180 ? UPPER_CAMPUS_LEVEL : PARKING_LEVEL });
  const rest = VISION_TERRACE.rest;
  pads.push({ polygon: [[rest.x - rest.width / 2, rest.z - rest.depth / 2], [rest.x + rest.width / 2, rest.z - rest.depth / 2], [rest.x + rest.width / 2, rest.z + rest.depth / 2], [rest.x - rest.width / 2, rest.z + rest.depth / 2]], y: UPPER_CAMPUS_LEVEL });
  const paths = [...TERRACE_PATHS.slice(1), [...VISION_TERRACE_PATH, { id: 'n99', x: 14.59, y: UPPER_CAMPUS_LEVEL, z: 207.48 }]];
  const grade = pavementGrade(campus, SLOPE_PROFILES);
  const height = (x: number, z: number): number => {
    let y = baseTerrain(x, z);
    let nearest = { distance: Infinity, y, gate: false };
    for (const profile of SLOPE_PROFILES) for (let i = 1; i < profile.points.length; i++) {
      const sample = along(x, z, profile.points[i - 1]!, profile.points[i]!);
      if (sample.distance < nearest.distance) nearest = { ...sample, gate: profile.id === 'main-west' };
    }
    y = blend(y, nearest.y, 1 - smooth(4.8, 13, nearest.distance));
    let padDistance = Infinity, padHeight = y;
    for (const pad of pads) {
      const distance = polygonDistance(x, z, pad.polygon);
      if (distance < padDistance) { padDistance = distance; padHeight = pad.y; }
    }
    y = blend(y, padHeight, 1 - smooth(0.5, 4, padDistance));
    // 정문 진입로는 차도와 양옆 보도를 같은 횡단면에 놓아 울렁이는 틈을 없앤다.
    if (nearest.gate && padDistance > 0) y = blend(y, nearest.y, 1 - smooth(7.2, 9.1, nearest.distance));
    // 계단 옆 좁은 연결로는 해당 보행면을 유지하고 주변 지면만 자연스럽게 연결한다.
    let terrace = { distance: Infinity, y };
    for (const path of paths) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!;
      const sample = along(x, z, [a.x, a.z, a.y], [b.x, b.z, b.y]);
      if (sample.distance < terrace.distance) terrace = { ...sample, y: sample.y - (isTerraceStair(a.id, b.id) ? 0.18 * Math.sin(sample.t * Math.PI) : 0) };
    }
    // 건물 자체가 놓이는 면은 수평을 유지한다.
    if (padDistance > 0) y = blend(y, terrace.y, 1 - smooth(VISION_TERRACE.width / 2 + 0.1, 4, terrace.distance));
    const ground = fountainGround(x, z, musicForecourtGround(x, z, mainSiteGround(x, z, mainEntryGround(x, z, y))));
    // 통행면의 경사는 건물 기초·조경용 지형 보정과 분리한다.
    // 건물 기초와 전용 계단·외부 데크는 각자의 높이를 유지한다.
    const building = campus.buildings.find(b => b.id !== 'main' && polygonDistance(x, z, b.footprint) < 0.00001);
    if (building) return buildingElevation(building.id);
    const field=campus.outdoor_areas?.find(a=>a.kind==='field'&&polygonDistance(x,z,a.footprint)<.00001);
    if(field)return 4*SLOPE_GAIN;
    // 조경 보정이 이미 정리된 차도 높이를 다시 끌어올리지 않게 포장 고도를 마지막에 적용한다.
    const detail = fountainPlaza(x, z, fieldWalkGround(x,z,frontageGround(campus, x, z, grade(x, z, ground))));
    let result = z < -100 && x < 0 ? grade(x, z, detail) : detail;
    // 본관 교차로 → 대학원관 오르막: 분수 삼각지는 하나의 경사면이 최종 높이다. 도로 단면만 그 위에 유지한다.
    const site = fountainSiteDistance(x, z);
    if (site < 5) { const surface = grade(x, z, fountainSurface(x, z)); result = surface + (result - surface) * smooth(0, 5, site); }
    const basinDistance = Math.hypot(x - FOUNTAIN_CENTER[0], z - FOUNTAIN_CENTER[1]);
    const basinRim = FOUNTAIN_RADIUS + 0.2;
    if (basinDistance < basinRim + 0.8) {
      result = blend(fountainPlazaLevel(x, z), result, smooth(basinRim, basinRim + 0.8, basinDistance));
    }
    // 서측 직선 차도 바깥(주택가 쪽) 지면도 로드뷰처럼 차도 오르막과 나란히 오른다.
    const west = spineLocal(x, z);
    if (-west.side > 5.3 && -west.side < 32 && z > APPROACH_START_Z - 12 && z < APPROACH_TOP_Z + 8) {
      const along = (1 - smooth(APPROACH_START_Z - 12, APPROACH_START_Z, z)) + smooth(APPROACH_TOP_Z, APPROACH_TOP_Z + 8, z);
      const w = (1 - smooth(18, 32, -west.side)) * (1 - Math.min(1, along));
      result += (grade(x, z, spineApproachLevel(z)) - result) * w;
    }
    // 이공관 앞 사각 정원은 주변 도로·건물과 같은 평지다(언덕 없음).
    // 이공관 서쪽 길(영비관 계단 위)·쉼터·경비실 일대도 같은 평지다.
    // 서측 직선 차도 동쪽 보도 → 분수 광장: 도로 단면 보정(중심 6.8m)과 3m 혼합 때문에 보도 바로 옆 3m 안에서
    // 1m 넘게 꺼지는 잔디 단이 생긴다. 보도 끝 높이에서 6m에 걸쳐 고르게 분수 광장 높이로 내려가게 다시 깎는다.
    const east = spineLocal(x, z), bank = 6;
    if (east.side > CAMPUS_SPINE_WALK_EDGE && east.side < CAMPUS_SPINE_WALK_EDGE + bank && east.along > spineDistanceAtZ(-140) && east.along < spineDistanceAtZ(-112)) {
      const edge = spineApproachLevel(spinePoint(east.along)[1]);
      const far: number = height(...spinePoint(east.along, CAMPUS_SPINE_WALK_EDGE + bank + 0.05));
      // 직선·완화 곡선을 반씩 섞어 최대 경사를 낮추고(높이 차의 1.25/6) 양 끝도 부드럽게 잇는다.
      const t = (east.side - CAMPUS_SPINE_WALK_EDGE) / bank, w = 0.5 * t + 0.5 * t * t * (3 - 2 * t);
      return fieldEntryGround(x, z, edge + (far - edge) * w);
    }
    // 본관 3층 진입로 시작부는 도로 단면 보정보다 나중에 적용해 경사로 옆면이 드러나지 않게 한다.
    return fieldEntryGround(x, z, mainUpperFootGround(x, z, scienceSideGround(x, z, scienceCourtGround(x, z, result))));
  };
  const samples = new Map<string, number>();
  const memoized = (x: number, z: number) => {
    const key = `${x.toFixed(3)}/${z.toFixed(3)}`;
    const found = samples.get(key); if (found !== undefined) return found;
    const value = height(x, z); samples.set(key, value); return value;
  };
  cache.set(campus, memoized); return memoized;
}
