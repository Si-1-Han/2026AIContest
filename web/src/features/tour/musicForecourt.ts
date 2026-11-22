import { MUSIC_FORECOURT_LEVEL } from './elevationLevels';
import type { CampusData } from '../../types/generated/campus';
export const MUSIC_SITE: [number, number][] = [[-52, 3.9], [-22.6, 1.95], [-20.4, 34.55], [-49.8, 36.5]];
export const MUSIC_PARKING: [number, number][] = [[-50.2, 5.6], [-22.48, 3.76], [-20.55, 32.75], [-48.1, 34.58]];
export const MUSIC_DOOR = { x: -20.49, z: 21.87, y: MUSIC_FORECOURT_LEVEL };
// 지도 네모의 남측 인도에서 들어온다. 운동장 뒤로 뚫린 지름길은 없다.
export const MUSIC_ACCESS_PATH = [
  { id: 'tour_music_sidewalk', x: -41.5, z: 35.7, y: MUSIC_FORECOURT_LEVEL, stop: true },
  { id: 'tour_music_entry', x: -41.5, z: 31.5, y: MUSIC_FORECOURT_LEVEL, stop: true },
  { id: 'tour_music_parking', x: -35, z: 20.4, y: MUSIC_FORECOURT_LEVEL, stop: true },
  { id: 'tour_music_west_door', x: -22.2, z: 21.98, y: MUSIC_FORECOURT_LEVEL, stop: true },
];
export function inMusicForecourt(x: number, z: number, margin = 0) { return x > -56 - margin && x < -19 + margin && z > -1 - margin && z < 40 + margin; }
export function musicForecourtGround(x: number, z: number, original: number) {
  if (!inMusicForecourt(x, z, 0)) return original;
  let hit = false, distance = Infinity;
  MUSIC_SITE.forEach((a, i) => {
    const b = MUSIC_SITE[(i + 1) % MUSIC_SITE.length]!, dx = b[0] - a[0], dz = b[1] - a[1];
    if ((a[1] > z) !== (b[1] > z) && x < dx * (z - a[1]) / dz + a[0]) hit = !hit;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  });
  if (hit) return MUSIC_FORECOURT_LEVEL;
  // 북쪽 GEMI관의 기초 높이는 올리지 않는다. 이쪽에는 통행 연결도 없다.
  const north = 3.9 - (x + 52) * 1.95 / 29.4;
  if (z <= north) return original;
  const t = Math.max(0, Math.min(1, 1 - distance / 4));
  return original + (MUSIC_FORECOURT_LEVEL - original) * t * t * (3 - 2 * t);
}

/** 음악관 주차장 뒤의 옹벽. 양 끝을 두 건물 외벽에 물려 운동장 쪽 틈을 가린다. */
export function gemiMusicWall(campus: CampusData) {
  if (!campus.buildings.some(b => b.id === 'gemi') || !campus.buildings.some(b => b.id === 'music')) return;
  const a: [number, number] = [-24.35, 0.95], b: [number, number] = [-20.6, 12.85];
  const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
  const thickness = 0.65, nx = dz * thickness / (2 * length), nz = -dx * thickness / (2 * length);
  const footprint: [number, number][] = [
    [a[0] - nx, a[1] - nz], [b[0] - nx, b[1] - nz],
    [b[0] + nx, b[1] + nz], [a[0] + nx, a[1] + nz],
  ];
  return {
    x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2,
    length, thickness, rotation: -Math.atan2(dz, dx), footprint,
    baseOffset: -0.15, height: 5.3,
  };
}
