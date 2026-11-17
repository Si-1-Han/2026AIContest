import type { CampusData } from '../../types/generated/campus';
import { spineDistanceAtZ, spineLocal, spinePoint, spineStrip } from './campusSpine';
import { MUSIC_FORECOURT_LEVEL } from './elevationLevels';

/** 대학원관부터 영비관까지 건물 쪽 보도를 외벽/주차장 경계까지 채운다. */
const frontageStrip = spineStrip(spineDistanceAtZ(-106), spineDistanceAtZ(35), 5.3, 60);
export const BUILDING_FRONTAGE: [number, number][] = [
  [-72, -122], frontageStrip[1]!, frontageStrip[2]!, [-26, -122],
];
export function onBuildingSide(x:number,z:number){
  const p=spineLocal(x,z);
  return p.along>=spineDistanceAtZ(-106)&&p.along<=spineDistanceAtZ(145)&&p.side>3.5;
}
export function inBuildingFrontage(x: number, z: number, margin = 0) {
  const p = spineLocal(x, z);
  return z >= -122 - margin && p.along <= spineDistanceAtZ(35) + margin && p.side >= 5.3 - margin && p.side <= 60 + margin;
}
export function frontageGrade(_campus: CampusData, x: number, z: number) {
  return inBuildingFrontage(x, z, 0.001) ? MUSIC_FORECOURT_LEVEL : undefined;
}

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
