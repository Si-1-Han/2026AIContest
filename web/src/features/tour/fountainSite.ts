import { mainEntryPoint } from './mainEntrance';
import { spinePoint, spineDistanceAtZ } from './campusSpine';
import { approachLevel } from './graduateApproach';
import { PARKING_LEVEL } from './elevationLevels';

export const FOUNTAIN_CENTER = [-62.3, -132.3] as const;
// 분수 수조와 교명 받침이 놓이는 원형 평지. 경사지 중간 높이에 맞춘다.
export const FOUNTAIN_LEVEL = approachLevel(FOUNTAIN_CENTER[0], FOUNTAIN_CENTER[1]);
export const FOUNTAIN_RADIUS = 5.2;
export const FOUNTAIN_FLAT_RADIUS = 8.2;
// 넓은 광장 대신 분수와 교명 받침 둘레에 필요한 원형 보행 공간만 둔다.
export const FOUNTAIN_CLEARING: [number, number][] = Array.from({ length: 96 }, (_, i) => {
  const a = i / 96 * Math.PI * 2;
  return [FOUNTAIN_CENTER[0] + Math.cos(a) * FOUNTAIN_FLAT_RADIUS, FOUNTAIN_CENTER[1] + Math.sin(a) * FOUNTAIN_FLAT_RADIUS];
});
export const FOUNTAIN_FIELD_LINK: [number, number][] = [[-54.8, -132.3], [-47, -130.8], [-40, -128.4], [-34, -126], [-26.8, -122]];
// 표시된 분수 뒤 곡선과 사잇길의 분수 쪽 경계 사이를 잔디와 작은 나무로 채운다.
export const FOUNTAIN_PLANTING: [number, number][] = [
  [-70, -123], [-66, -117], [-60, -110], [-54, -105], [-49.6, -102.2],
  [-45, -103.5], [-42.5, -111], [-40.6, -121.7], [-34, -115], [-25, -100], [-22, -97],
  [-23.5, -106], [-26, -114], [-28.4, -126.9], [-38, -129], [-49, -128],
  [-57, -126], [-64, -124.5], [-70, -126],
];
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
export const fountainSiteDistance = (x: number, z: number) => distanceToRing(x, z, FOUNTAIN_GRADE_REGION);
// 분수 삼각지는 본관 앞 도로에서 대학원관·운동장 평지까지 이어지는 완만한 경사면이다(잔디 둔덕 없음).
export function fountainGround(x: number, z: number, original: number) {
  const d = distanceToRing(x, z, FOUNTAIN_GRADE_REGION), t = Math.max(0, Math.min(1, d / 5));
  const target = fountainSurface(x, z);
  return target + (original - target) * t * t * (3 - 2 * t);
}
// 분수 광장 포장은 오르막 방향으로 경사의 80%만 기울인 평면이다. 수조 수면은 수평을 유지하고
// 낮은 쪽은 수조 받침이 드러난다. 광장 바깥은 9m에 걸쳐 주변 경사면에 이어진다.
export const FOUNTAIN_PLAZA_TILT = 0.8 * (approachLevel(FOUNTAIN_CENTER[0], FOUNTAIN_CENTER[1] + 1) - approachLevel(FOUNTAIN_CENTER[0], FOUNTAIN_CENTER[1] - 1)) / 2;
export const fountainPlazaLevel = (_x: number, z: number) => Math.min(PARKING_LEVEL, FOUNTAIN_LEVEL + FOUNTAIN_PLAZA_TILT * (z - FOUNTAIN_CENTER[1]));
// 차도 높이를 보존하면서 분수와 교명 받침 둘레의 광장 평면은 확실하게 유지한다.
export function fountainPlaza(x: number, z: number, original: number) {
  const d = Math.hypot(x - FOUNTAIN_CENTER[0], z - FOUNTAIN_CENTER[1]);
  const spine = spinePoint(spineDistanceAtZ(z));
  if (Math.abs(x - spine[0]) < 5.4) return original;
  const t = Math.max(0, Math.min(1, (d - FOUNTAIN_FLAT_RADIUS) / 9));
  const plaza = fountainPlazaLevel(x, z);
  return plaza + (original - plaza) * t * t * (3 - 2 * t);
}

/** 분수 삼각지의 최종 지면: 경사면 위에 분수·교명 받침 둘레만 원형 평지로 둔다. 포장·지형·보행로가 함께 쓴다. */
export function fountainSurface(x: number, z: number) {
  return fountainPlaza(x, z, approachLevel(x, z));
}
