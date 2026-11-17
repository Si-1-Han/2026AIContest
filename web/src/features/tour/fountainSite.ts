import { mainEntryPoint } from './mainEntrance';
import { spinePoint, spineDistanceAtZ } from './campusSpine';
import { MUSIC_FORECOURT_LEVEL } from './elevationLevels';

export const FOUNTAIN_CENTER = [-65, -114] as const;
export const FOUNTAIN_LEVEL = MUSIC_FORECOURT_LEVEL;
export const FOUNTAIN_RADIUS = 5.2;
export const FOUNTAIN_FLAT_RADIUS = 8.2;
// 넓은 광장 대신 분수와 교명 받침 둘레에 필요한 원형 보행 공간만 둔다.
export const FOUNTAIN_CLEARING: [number, number][] = Array.from({ length: 96 }, (_, i) => {
  const a = i / 96 * Math.PI * 2;
  return [FOUNTAIN_CENTER[0] + Math.cos(a) * FOUNTAIN_FLAT_RADIUS, FOUNTAIN_CENTER[1] + Math.sin(a) * FOUNTAIN_FLAT_RADIUS];
});
export const FOUNTAIN_FIELD_LINK: [number, number][] = [[-57, -114], [-51, -116], [-43, -120], [-34, -122], [-26.8, -122]];
// 포장 면적과 지형 보정 범위는 다르다. 접근 방향에 분수를 가리는 잔디 언덕을 만들지 않는다.
const FOUNTAIN_GRADE_REGION: [number, number][] = [[-79,-144],[-61,-145],[-31,-133],[24,-131],[36,-124],[38,-104],[-72,-104]];
export const FOUNTAIN_WALK: [number, number][] = [spinePoint(spineDistanceAtZ(-114)), ...Array.from({ length: 7 }, (_, i): [number, number] => {
  const a = Math.PI - i / 6 * Math.PI;
  return [FOUNTAIN_CENTER[0] + Math.cos(a) * 7.1, FOUNTAIN_CENTER[1] + Math.sin(a) * 7.1];
}), ...FOUNTAIN_FIELD_LINK];
export function onFountainWalk(a: [number, number], b: [number, number]) {
  return [a, b].every(p => FOUNTAIN_WALK.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01));
}
function distanceToRing(x: number, z: number, ring: [number, number][]) {
  let inside = false, distance = Infinity;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]!, dx = b[0] - a[0], dz = b[1] - a[1];
    if ((a[1] > z) !== (b[1] > z) && x < dx * (z - a[1]) / dz + a[0]) inside = !inside;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  });
  return inside ? 0 : distance;
}
const main = mainEntryPoint(0), dx = main[0] - FOUNTAIN_CENTER[0], dz = main[1] - FOUNTAIN_CENTER[1], length = Math.hypot(dx, dz);
export const FOUNTAIN_SIGN = { x: dx / length * 6.6, z: dz / length * 6.6, rotation: Math.atan2(dx, dz), nx: dx / length, nz: dz / length };
export function inFountainSite(x: number, z: number, margin = 0) { return distanceToRing(x, z, FOUNTAIN_GRADE_REGION) <= margin; }
export function fountainGround(x: number, z: number, original: number) {
  const d = distanceToRing(x, z, FOUNTAIN_GRADE_REGION), t = Math.max(0, Math.min(1, d / 5));
  return FOUNTAIN_LEVEL + (original - FOUNTAIN_LEVEL) * t * t * (3 - 2 * t);
}
// 차도 높이를 보존하면서 분수와 교명 앞의 수평면은 확실하게 유지한다.
export function fountainPlaza(x: number, z: number, original: number) {
  const d = Math.hypot(x - FOUNTAIN_CENTER[0], z - FOUNTAIN_CENTER[1]);
  const spine = spinePoint(spineDistanceAtZ(z));
  if (Math.abs(x - spine[0]) < 5.4) return original;
  const t = Math.max(0, Math.min(1, (d - FOUNTAIN_FLAT_RADIUS) / 6));
  return FOUNTAIN_LEVEL + (original - FOUNTAIN_LEVEL) * t * t * (3 - 2 * t);
}
