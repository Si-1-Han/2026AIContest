import type { CampusData } from '../../types/generated/campus';
import { CAMPUS_SPINE, spineDistanceAtZ, spineLocal, spinePoint, spineStrip } from './campusSpine';
import { approachTopZ } from './graduateApproach';
import { fountainSurface } from './fountainSite';

/** 대학원관부터 영비관까지 건물 쪽 보도를 외벽/주차장 경계까지 채운다. */
// 기존 도로변 보도의 안쪽 경계에 조금 걸쳐 이어지게 한다.
const frontageEdge = CAMPUS_SPINE.roadWidth / 2 + CAMPUS_SPINE.sidewalkWidth - 0.05;
const frontageStrip = spineStrip(spineDistanceAtZ(-122), spineDistanceAtZ(35), frontageEdge, 60);
export const BUILDING_FRONTAGE: [number, number][] = [
  frontageStrip[0]!, frontageStrip[1]!, frontageStrip[2]!, [-26, -122],
];

/** 대학원관 북쪽 오목한 입구와 서측 도로변 보도를 연결한다. */
const graduateEntryAlong = spineDistanceAtZ(-103);
export const GRADUATE_ENTRY_SIDEWALK = spinePoint(graduateEntryAlong, 4.6);
export const GRADUATE_ENTRY_BEND: [number, number] = [-44.2, -100.4];
export const GRADUATE_ENTRY_DOOR: [number, number] = [-43.33, -94.96];
export const GRADUATE_ENTRY_STOP: [number, number] = [-43.64, -96.9];
export const GRADUATE_ENTRY_ROUTE = [spinePoint(graduateEntryAlong), GRADUATE_ENTRY_SIDEWALK, GRADUATE_ENTRY_BEND, GRADUATE_ENTRY_STOP];
export const GRADUATE_FORECOURT: [number, number][] = [
  [-83, -123], [-18, -123], [-18, -92.8], [-62.5, -92.8], [-64, -89], [-83, -89],
];
// 북쪽 진입로에서 외벽까지 채우고, 서쪽 모서리를 돌아 기존 보도에 붙인다.
export const GRADUATE_CORNER_WALK: [number, number][] = [
  GRADUATE_ENTRY_SIDEWALK, GRADUATE_ENTRY_BEND, [-44.7, -92.9], [-58, -87], spinePoint(spineDistanceAtZ(-87), 4.6),
];
export function onBuildingSide(x:number,z:number){
  const p=spineLocal(x,z);
  return p.along>=spineDistanceAtZ(-106)&&p.along<=spineDistanceAtZ(145)&&p.side>3.5;
}
export function inBuildingFrontage(x: number, z: number, margin = 0) {
  const p = spineLocal(x, z);
  return z >= -122 - margin && p.along <= spineDistanceAtZ(35) + margin && p.side >= 5.3 - margin && p.side <= 60 + margin;
}
/** 대학원관 북쪽 외벽 앞까지는 교차로에서 오르는 경사, 그 뒤는 1층 평지. */
export function frontageGrade(_campus: CampusData, x: number, z: number) {
  return inBuildingFrontage(x, z, 0.001) ? fountainSurface(x, z) : undefined;
}
/** 경사 구간을 뺀 수평 보도 부분(포장 메시를 평면으로 만들 수 있는 영역). */
export const FRONTAGE_FLAT_CLIP: [number, number][] = [
  [-200, approachTopZ(-200)], [-50, approachTopZ(-50)], [-30, approachTopZ(-30)], [200, approachTopZ(200)], [200, 400], [-200, 400],
];

/** 포장 경계 바깥의 땅도 같은 끝 높이에서 시작하게 해 찢어진 삼각형을 없앤다. */
export function frontageGround(campus: CampusData, x: number, z: number, original: number) {
  // 포장 안쪽은 주차장 수평면·차량 진입 경사를 이미 적용한 값을 보존한다.
  if (inBuildingFrontage(x, z, 0.001)) return original;
  const p = spineLocal(x, z);
  if (p.side > 60 && z > 36) return original;
  const along = Math.max(spineDistanceAtZ(-122.2), Math.min(spineDistanceAtZ(35), p.along));
  const side = Math.max(5.3, Math.min(60, p.side)), distance = Math.hypot(p.along - along, p.side - side);
  if (distance >= 5) return original;
  const point = spinePoint(along, side), target = frontageGrade(campus, ...point);
  if (target === undefined) return original;
  const t = distance / 5, blend = t * t * (3 - 2 * t);
  return target + (original - target) * blend;
}
