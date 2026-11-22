import { MUSIC_ACCESS_PATH, MUSIC_DOOR } from './musicForecourt';
import { MAIN_ENTRANCE_PATH, mainEntryPoint } from './mainEntrance';
import clipping from 'polygon-clipping';
import type { Building } from '../../types/generated/campus';
import { MIDDLE_LEVEL, PARKING_LEVEL } from './elevationLevels';
import { VISION_PASSAGE_CUT, VISION_TERRACE_PATH } from './visionTerrace';
import { SCIENCE_APPROACH } from './scienceGarden';
import { STUDENT_UNION_STEPS, studentUnionEntryPoint } from './southLink';
import { GRADUATE_ENTRY_DOOR, GRADUATE_ENTRY_STOP } from './buildingFrontage';

/** 이공관의 확인된 출입구는 신학관 쪽 남향 안뜰(사각 정원)에만 둔다. 도착점은 출입문 앞마당. */
export { SCIENCE_APPROACH };
export function tourPlaceGoal(place: { id: string; center: [number, number] }): [number, number] {
  const entry = VISION_TERRACE_PATH[0]!;
  if (place.id === 'music') { const p = MUSIC_ACCESS_PATH.at(-1)!; return [p.x, p.z]; }
  if (place.id === 'main') { const p = MAIN_ENTRANCE_PATH[0]!; return [p.x, p.z]; }
  if (place.id === 'student_union') return STUDENT_UNION_STEPS;
  if (place.id === 'graduate') return GRADUATE_ENTRY_STOP;
  return place.id === 'science' ? SCIENCE_APPROACH : place.id === 'vision_center' ? [entry.x, entry.z] : place.center;
}
/** 외부 통로의 높이 범위에서만 영비관 저층의 열린 부분을 통과할 수 있다. */
export function tourCollisionOutlines(b: Building, ay = 0, by = 0): [number, number][][] {
  if (b.id !== 'vision_center' || Math.min(ay, by) < PARKING_LEVEL - 0.01 || Math.max(ay, by) > MIDDLE_LEVEL + 0.01) return [b.footprint];
  return clipping.difference([b.footprint], [VISION_PASSAGE_CUT]).flatMap(poly => poly);
}

/** 바로 이동 후 실제 출입구를 바라본다. */
export function tourPlaceLookAt(place: { id: string; center: [number, number] }): [number, number] {
  if (place.id === 'student_union') return studentUnionEntryPoint(0);
  if (place.id === 'graduate') return GRADUATE_ENTRY_DOOR;
  return place.id === 'main' ? mainEntryPoint(0) : place.id === 'music' ? [MUSIC_DOOR.x, MUSIC_DOOR.z] : place.center;
}
