import type { OutdoorArea } from '../../types/generated/campus';
import { FOUNTAIN_FIELD_LINK, fountainSurface } from './fountainSite';
import { MUSIC_FORECOURT_LEVEL } from './elevationLevels';

/** 사진·지도에서 확인한 대학원관/디자인관과 운동장 사이의 음악관 방향 보행로. */
export const FIELD_WALK = [
  FOUNTAIN_FIELD_LINK.at(-1)!, [-24.4, -111], [-19.8, -99], [-17.5, -87], [-13.3, -62], [-9.2, -37], [-6.8, -22], [-10.1, -14],
] as [number, number][];
/** 차도 중심에서 시작해 보도 메시가 실제 차도 가장자리까지 이어지게 한다. */
export const FIELD_WALK_ENTRY: [number, number][] = [[-23.19, -131.78], [-25.5, -126], FIELD_WALK[0]!];
export const FIELD_ENTRY_WIDTH = 3.3;
// 분수 삼각지 경사면이 운동장 평지에 닿는 선(approachTopZ ≈ -122)에서 사잇길도 평지가 된다.
// 더 북쪽(-116)까지 경사를 끌면 길이 양옆 평지보다 최대 0.8m 낮아져 잔디 벽 사이 도랑이 된다.
export const FIELD_ENTRY_FLAT_Z = -122;
export const FIELD_ENTRY_GRADE_REGION: [number, number][] = [[-30, -129], [-22, -129], [-21, FIELD_ENTRY_FLAT_Z], [-29, FIELD_ENTRY_FLAT_Z]];
export const FIELD_WALK_WIDTH = 1.7;
export const FIELD_GATE_OPENINGS = [0.045, 0.97];
const clamp = (t: number) => Math.max(0, Math.min(1, t));
function entryLevel(x: number, z: number) {
  const start = -128.4;
  if (z <= start) return fountainSurface(x, z);
  if (z >= FIELD_ENTRY_FLAT_Z) return MUSIC_FORECOURT_LEVEL;
  const road = fountainSurface(x, start);
  return road + (MUSIC_FORECOURT_LEVEL - road) * (z - start) / (FIELD_ENTRY_FLAT_Z - start);
}
/** 차도 높이에서 출발해 사잇길 초입을 지나면서 운동장 높이에 이른다. */
function nearestFieldGrade(x: number, z: number) {
  let nearest = { distance: Infinity, fountainLink: false };
  for (const [path, fountainLink] of [[FOUNTAIN_FIELD_LINK, true], [FIELD_WALK_ENTRY, false], [FIELD_WALK, false]] as const) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!, dx = b[0] - a[0], dz = b[1] - a[1];
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz));
      const distance = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      if (distance < nearest.distance) nearest = { distance, fountainLink };
    }
  }
  return nearest;
}
function fieldGradeLevel(x: number, z: number, fountainLink: boolean) {
  const grade = entryLevel(x, z);
  if (!fountainLink) return grade;
  const entrance = FIELD_WALK[0]!;
  const blend = clamp(1 - Math.hypot(x - entrance[0], z - entrance[1]) / 8);
  const plaza = fountainSurface(x, z);
  return plaza + (grade - plaza) * blend * blend * (3 - 2 * blend);
}
export function fieldWalkGrade(x: number, z: number) {
  const nearest = nearestFieldGrade(x, z);
  if (nearest.distance >= (z < FIELD_ENTRY_FLAT_Z ? FIELD_ENTRY_WIDTH / 2 + 0.15 : 1.5)) return undefined;
  return fieldGradeLevel(x, z, nearest.fountainLink);
}
export function fieldWalkGround(x: number, z: number, original: number) {
  const nearest = nearestFieldGrade(x, z);
  const t = clamp((nearest.distance - 1.5) / 7);
  if (t === 1) return original;
  const grade = fieldGradeLevel(x, z, nearest.fountainLink);
  return grade + (original - grade) * t * t * (3 - 2 * t);
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

/**
 * 차도 → 사잇길 초입 경사 구간의 양옆 지면. 도로 단면 보정(차도 중심 6.8m) 안쪽이라 잔디가 차도 높이로 눌려,
 * 오르는 보행로 옆에 최대 0.7m 턱이 생긴다. 보행로 높이에서 시작해 높이 차에 비례한 폭으로 원지형에 잇는다.
 */
export function fieldEntryGround(x: number, z: number, original: number) {
  if (z < -129.5 || z > FIELD_ENTRY_FLAT_Z + 1 || x < -34 || x > -17) return original;
  let distance = Infinity;
  for (let i = 1; i < FIELD_WALK_ENTRY.length; i++) {
    const a = FIELD_WALK_ENTRY[i - 1]!, b = FIELD_WALK_ENTRY[i]!, dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz));
    distance = Math.min(distance, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  const target = entryLevel(x, z);
  const reach = Math.min(4, Math.max(2.5, Math.abs(target - original) * 3));
  const side = Math.max(0, distance - FIELD_ENTRY_WIDTH / 2 - 0.15);
  if (side >= reach) return original;
  const smooth = (t: number) => { const c = clamp(t); return c * c * (3 - 2 * c); };
  // 차도·보도 가장자리(z≈-128)는 건드리지 않는다.
  const w = (1 - smooth(side / reach)) * smooth((z + 128) / 1.5);
  return original + (target - original) * w;
}
