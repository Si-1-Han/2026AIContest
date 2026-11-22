type Point = [number, number];
/** 사용자 제공 지도에서 확인한 학생회관 서측 → 이공관 앞 연결길. 시작점은 원본 교차점 n133이다. */
export const SOUTH_LINK: Point[] = [[63.08, 203.01], [64, 213], [34, 214], [24, 214]];

// 학생회관 서쪽 외벽의 중앙 계단과 기존 도로 쪽 보도를 잇는다.
const [wallStart, wallEnd]: [Point, Point] = [[79.22, 169.54], [81.2, 202.53]];
const dx = wallEnd[0] - wallStart[0], dz = wallEnd[1] - wallStart[1];
const wallLength = Math.hypot(dx, dz);
export function studentUnionEntryPoint(distance: number, side = 0): Point {
  return [
    (wallStart[0] + wallEnd[0]) / 2 + (dx * side - dz * distance) / wallLength,
    (wallStart[1] + wallEnd[1]) / 2 + (dz * side + dx * distance) / wallLength,
  ];
}
const sidewalkDistance = 13.2, halfWidth = 2.6;
export const STUDENT_UNION_ENTRY_WALK: Point[] = [
  studentUnionEntryPoint(0, -halfWidth), studentUnionEntryPoint(0, halfWidth),
  studentUnionEntryPoint(sidewalkDistance, halfWidth), studentUnionEntryPoint(sidewalkDistance, -halfWidth),
];
export const STUDENT_UNION_SIDEWALK = studentUnionEntryPoint(sidewalkDistance);
export const STUDENT_UNION_STEPS = studentUnionEntryPoint(3.3);
