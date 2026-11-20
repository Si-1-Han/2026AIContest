import { MUSIC_FORECOURT_LEVEL } from './elevationLevels';
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

/**
 * GEMI관 앞 막다른 차도 끝(n79)에서 GEMI관 남동쪽 모서리와 음악관 북서쪽 모서리 사이 틈을 지나 음악관 앞 주차장으로 이어지는 보행선.
 * 이 틈은 이미 벽돌 보도와 주차장 포장으로 덮여 있어, 거리뷰 이동선만 잇고 별도 포장 띠는 그리지 않는다.
 * 두 건물 외벽과 4m 이상 떨어지게 꺾었다.
 */
export const GEMI_MUSIC_GAP_PATH = [
  { id: 'tour_gemi_gap_0', x: -17.5, z: 2.5, y: MUSIC_FORECOURT_LEVEL },
  { id: 'tour_gemi_gap_1', x: -25, z: 7.5, y: MUSIC_FORECOURT_LEVEL },
];
export const GEMI_MUSIC_GAP_CHAIN = ['n79', ...GEMI_MUSIC_GAP_PATH.map(p => p.id), 'tour_music_parking'];
const gapPoints = [[-11.8, -8.5], ...GEMI_MUSIC_GAP_PATH.map(p => [p.x, p.z]), [MUSIC_ACCESS_PATH[2]!.x, MUSIC_ACCESS_PATH[2]!.z]] as [number, number][];
/** 거리뷰 이동선이 GEMI관–음악관 틈 보행선 위에 있는지(포장 띠를 새로 만들지 않기 위한 판별). */
export function onGemiMusicGap(a: [number, number], b: [number, number]) {
  return [a, b].every(p => gapPoints.slice(1).some((q, i) => {
    const o = gapPoints[i]!, dx = q[0] - o[0], dz = q[1] - o[1];
    const t = Math.max(0, Math.min(1, ((p[0] - o[0]) * dx + (p[1] - o[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(p[0] - o[0] - dx * t, p[1] - o[1] - dz * t) < 0.6;
  }));
}
