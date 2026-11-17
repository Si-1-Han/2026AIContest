import { MUSIC_FORECOURT_LEVEL } from './elevationLevels';
type Point = [number, number];

/** GEMI관 서측에서 영비관 앞으로 이어지는 하나의 직선 차도와 양쪽 보도. */
export const CAMPUS_SPINE = { a: [-81.8, -131.85] as Point, b: [-32.6, 145.26] as Point, roadWidth: 7, sidewalkWidth: 1.8 };
const dx = CAMPUS_SPINE.b[0] - CAMPUS_SPINE.a[0], dz = CAMPUS_SPINE.b[1] - CAMPUS_SPINE.a[1];
export const SPINE_LENGTH = Math.hypot(dx, dz);
const ux = dx / SPINE_LENGTH, uz = dz / SPINE_LENGTH;
export const SPINE_NODES = new Set(['n30', 'n56', 'n58', 'n63', 'n70']);
export const SPINE_DRIVEWAY_Z = [61.26, 103.36];
export const SPINE_DRIVEWAY_WIDTH = 7;
export const spineDistanceAtZ = (z: number) => (z - CAMPUS_SPINE.a[1]) / uz;
export const spinePoint = (along: number, side = 0): Point => [CAMPUS_SPINE.a[0] + ux * along + uz * side, CAMPUS_SPINE.a[1] + uz * along - ux * side];
export function spineLocal(x: number, z: number) {
  const px = x - CAMPUS_SPINE.a[0], pz = z - CAMPUS_SPINE.a[1];
  return { along: px * ux + pz * uz, side: px * uz - pz * ux };
}
export function spineStrip(from: number, to: number, left: number, right: number): Point[] {
  return [spinePoint(from, left), spinePoint(to, left), spinePoint(to, right), spinePoint(from, right)];
}
export function straightenSpineNodes<T extends { id: string; x: number; z: number }>(nodes: T[]): T[] {
  return nodes.map(n => SPINE_NODES.has(n.id) ? { ...n, x: spinePoint(spineDistanceAtZ(n.z))[0] } : n);
}
export function onCampusSpine(a: Point, b: Point) {
  return [a, b].every(p => { const s = spineLocal(...p); return Math.abs(s.side) < 0.01 && s.along >= -0.01 && s.along <= SPINE_LENGTH + 0.01; });
}
export const SPINE_RESERVED = spineStrip(spineDistanceAtZ(-34), SPINE_LENGTH, -5.3, 5.3);
/** 원본 주차장 서측의 들쭉날쭉한 홈을 직선 도로 쪽까지 메우는 수평 아스팔트. */
export const CENTRAL_PARKING_APRON = spineStrip(spineDistanceAtZ(35), spineDistanceAtZ(145), 5.3, 18);
export const SPINE_DRIVEWAY_OPENINGS = SPINE_DRIVEWAY_Z.map(z => {
  const u = spineDistanceAtZ(z); return spineStrip(u - SPINE_DRIVEWAY_WIDTH / 2, u + SPINE_DRIVEWAY_WIDTH / 2, CAMPUS_SPINE.roadWidth / 2, 14);
});

/** 대학원관·GEMI·음악관·중앙 주차장과 영비관 앞을 동일한 1층 높이로 유지한다. */
export function spineGrade(_z: number) {
  return MUSIC_FORECOURT_LEVEL;
}
export const SPINE_PARKING_RAMPS = SPINE_DRIVEWAY_Z.map(z => {
  const u = spineDistanceAtZ(z); return spineStrip(u - 3.5, u + 3.5, 3.5, 17);
});
export function spineRampGrade(x: number, z: number) {
  const p = spineLocal(x, z);
  if (p.side < 3.498 || p.side > 17.002 || !SPINE_DRIVEWAY_Z.some(z => Math.abs(p.along - spineDistanceAtZ(z)) <= 3.502)) return undefined;
  return MUSIC_FORECOURT_LEVEL;
}
