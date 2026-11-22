import { MAIN_ENTRY_BASE, mainEntryPoint } from './mainEntrance';
import { spinePoint, spineDistanceAtZ, spineGrade } from './campusSpine';
import { approachLevel, spineApproachLevel } from './graduateApproach';
import { PARKING_LEVEL } from './elevationLevels';

type Point = [number, number];

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

// 분수대 앞 도로 모서리의 양끝을 기존 두 보도의 연석과 같은 접선으로 잇는다.
const frontRun = Math.hypot(10.89, -1.36), ux = 10.89 / frontRun, uz = -1.36 / frontRun;
const cornerStart: Point = [-72.35 + ux * 7.6 - uz * 4.5, -144.86 + uz * 7.6 + ux * 4.5];
const cornerEndAlong = spineDistanceAtZ(-126);
const cornerEnd = spinePoint(cornerEndAlong, 3.5);
const cornerHandleA: Point = [cornerStart[0] - ux * 8.9, cornerStart[1] - uz * 8.9];
const cornerHandleB = spinePoint(cornerEndAlong - 8.3, 3.5);

export function fountainCornerEdge(offset: number): Point[] {
  return Array.from({ length: 49 }, (_, i) => {
    const t = i / 48, u = 1 - t;
    const coord = (j: 0 | 1) => u ** 3 * cornerStart[j] + 3 * u * u * t * cornerHandleA[j] + 3 * u * t * t * cornerHandleB[j] + t ** 3 * cornerEnd[j];
    const tangent = (j: 0 | 1) => u * u * (cornerHandleA[j] - cornerStart[j]) + 2 * u * t * (cornerHandleB[j] - cornerHandleA[j]) + t * t * (cornerEnd[j] - cornerHandleB[j]);
    const dx = tangent(0), dz = tangent(1), len = Math.hypot(dx, dz);
    return [coord(0) + dz / len * offset, coord(1) - dx / len * offset];
  });
}
export function fountainCornerStrip(from: number, to: number): Point[] {
  return [...fountainCornerEdge(from), ...fountainCornerEdge(to).reverse()];
}
export function fountainCornerLimit(roadMargin: number): Point[] {
  return [...fountainCornerEdge(-roadMargin), spinePoint(cornerEndAlong, 15.5), [cornerStart[0] - uz * 12, cornerStart[1] + ux * 12]];
}

const smoothStep = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
// 평평한 본관 차도와 분수대 앞 갈림길을 한 포장면으로 묶는 영역.
export const FOUNTAIN_JUNCTION_PAVEMENT: Point[] = [[-96, -159], [-61, -159], [-61, -137], [-72, -126], [-96, -126]];
export function fountainJunctionGround(x: number, z: number, original: number) {
  if (x <= -96 || x >= -62 || z <= -159 || z >= -126) return original;
  const weight = smoothStep((x + 96) / 4) * smoothStep((-62 - x) / 10) * smoothStep((z + 159) / 4) * smoothStep((-126 - z) / 5);
  return original + (spineApproachLevel(z) - original) * weight;
}
const cornerPoints = fountainCornerEdge(0);
let cornerLength = 0;
const cornerSegments = cornerPoints.slice(1).map((b, i) => {
  const a = cornerPoints[i]!, dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
  const start = cornerLength;
  cornerLength += length;
  return { a, dx, dz, length, start };
});
const cornerEndLevel = spineGrade(spinePoint(cornerEndAlong)[1]);
const cornerEndSlope = spineGrade(spinePoint(cornerEndAlong + 0.5)[1]) - spineGrade(spinePoint(cornerEndAlong - 0.5)[1]);

/** 보도 양끝의 도로 높이와 기울기를 잇고 주변 차도·잔디에 완만하게 섞는다. */
export function fountainCornerGround(x: number, z: number, original: number) {
  if (x < -83 || x > -59 || z < -147 || z > -121) return original;
  let distance = Infinity, along = 0, roadSide = false;
  for (const { a, dx, dz, length, start } of cornerSegments) {
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (length * length)));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < distance) {
      distance = d;
      along = start + length * t;
      roadSide = (x - a[0]) * dz - (z - a[1]) * dx < 0;
    }
  }
  // 연석 가까운 차도만 보도에 맞추고, 차로 중심은 교차로·오르막 기준 높이를 따른다.
  const reach = roadSide ? 3.35 : 5;
  if (distance >= reach) return original;
  const t = along / cornerLength;
  const target = MAIN_ENTRY_BASE + (cornerEndLevel - MAIN_ENTRY_BASE) * smoothStep(t) + cornerEndSlope * cornerLength * t * t * (t - 1);
  const weight = (1 - smoothStep((distance - 2.2) / (reach - 2.2))) * smoothStep(along / 1.4) * smoothStep((cornerLength - along) / 1.4);
  return original + (target - original) * weight;
}

const FOUNTAIN_JUNCTION_ISLAND: [Point, Point, Point] = [[-80.4456, -149.1148], [-76.3934, -147.4594], [-79.6812, -145.0105]];

/** 보도섬 안의 벽돌·연석·점자블록에는 같은 경사면을 적용하고 주변 차도로 완만하게 잇는다. */
export function fountainIslandGrade(elevation: (x: number, z: number) => number) {
  const [a, b, c] = FOUNTAIN_JUNCTION_ISLAND;
  const y = elevation(...a), by = elevation(...b) - y, cy = elevation(...c) - y;
  const bx = b[0] - a[0], bz = b[1] - a[1], cx = c[0] - a[0], cz = c[1] - a[1];
  const det = bx * cz - cx * bz;
  const gx = (by * cz - cy * bz) / det, gz = (bx * cy - cx * by) / det;
  return (x: number, z: number, original: number) => {
    if (x < -82 || x > -75 || z < -150.7 || z > -143.5) return original;
    const t = smoothStep(distanceToRing(x, z, FOUNTAIN_JUNCTION_ISLAND) / 1.4);
    const target = y + gx * (x - a[0]) + gz * (z - a[1]);
    return target + (original - target) * t;
  };
}

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
