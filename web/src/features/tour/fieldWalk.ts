import type { OutdoorArea } from '../../types/generated/campus';
import { FOUNTAIN_FIELD_LINK, fountainSurface } from './fountainSite';
import { MUSIC_FORECOURT_LEVEL } from './elevationLevels';

/** 사진·지도에서 확인한 대학원관/디자인관과 운동장 사이의 음악관 방향 보행로. */
export const FIELD_WALK = [
  [-26.8, -122], [-24.4, -111], [-19.8, -99], [-17.5, -87], [-13.3, -62], [-9.2, -37], [-6.8, -22], [-10.1, -14],
] as [number, number][];
export const FIELD_WALK_WIDTH = 1.7;
export const FIELD_GATE_OPENINGS = [0.045, 0.97];
/** 운동장 옆 사잇길은 운동장과 같은 평지. 분수→사잇길 연결부는 분수 삼각지 경사면을 그대로 따른다. */
function nearestFieldGrade(x: number, z: number) {
  let nearest = { distance: Infinity, y: 0 };
  const lengths = FOUNTAIN_FIELD_LINK.slice(1).map((p, i) => Math.hypot(p[0] - FOUNTAIN_FIELD_LINK[i]![0], p[1] - FOUNTAIN_FIELD_LINK[i]![1]));
  FOUNTAIN_FIELD_LINK.slice(1).forEach((b, i) => {
    const a = FOUNTAIN_FIELD_LINK[i]!, dx = b[0] - a[0], dz = b[1] - a[1], len = lengths[i]!;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (len * len)));
    const distance = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (distance < nearest.distance) nearest = { distance, y: fountainSurface(x, z) };
  });
  FIELD_WALK.slice(1).forEach((b,i)=>{
    const a=FIELD_WALK[i]!,dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    const distance=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
    if(distance<nearest.distance)nearest={distance,y:MUSIC_FORECOURT_LEVEL};
  });
  return nearest;
}
export function fieldWalkGrade(x: number, z: number) {
  const nearest=nearestFieldGrade(x,z);
  return nearest.distance<1.5?nearest.y:undefined;
}
export function fieldWalkGround(x: number,z:number,original:number){
  const nearest=nearestFieldGrade(x,z),t=Math.max(0,Math.min(1,(nearest.distance-1.5)/7));
  return nearest.y+(original-nearest.y)*t*t*(3-2*t);
}
/** 원본 외곽에는 보행 공간까지 포함돼 있어, 투어에서만 펜스를 안쪽으로 물린다. */
export function tourFieldFootprint(area: OutdoorArea): [number, number][] {
  if (area.kind !== 'field') return area.footprint;
  return area.footprint.map(([x, z], i) => i < 2 ? [x + 6.25, z] : [x, z]);
}
export function inFieldWalk(x: number, z: number, margin = 0) {
  return FIELD_WALK.slice(1).some((b, i) => {
    const a = FIELD_WALK[i]!, dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < FIELD_WALK_WIDTH / 2 + margin;
  });
}
