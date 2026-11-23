import { Vector3 } from 'three';
import { spineDistanceAtZ, spinePoint } from './campusSpine';
import { MAIN_FRONT_PROFILE } from './graduateApproach';
import { MAIN_ENTRY_FLOOR, mainEntryPoint } from './mainEntrance';
import { SCIENCE_SIDE_ROAD, SOUTH_LINK } from './southLink';

type Point = [number, number];
type Position = [number, number, number];
type Keyframe = [seconds: number, position: Position];

// Staging positions on the west stair tower's roof, next to the existing cross.
const roofHeight = MAIN_ENTRY_FLOOR + 12.84;
const [nestX, nestZ] = mainEntryPoint(-7.5, -18.85);
const [perchX, perchZ] = mainEntryPoint(-8.2, -17.05);
export const AUTO_TOUR_NEST: Position = [nestX, roofHeight, nestZ];
const nestBird: Position = [nestX, roofHeight + 0.46, nestZ];
const perch: Position = [perchX, roofHeight + 0.63, perchZ];
const roofCamera: Position = [nestX - 6.45, roofHeight + 2.55, nestZ + 3.4];
export const AUTO_TOUR_HATCH = 2.2;
export const AUTO_TOUR_FIRST_FLIGHT = 9.5;
export const AUTO_TOUR_LANDING = 157;
export const AUTO_TOUR_ROUTE_LENGTH = AUTO_TOUR_LANDING + 3;
export const AUTO_TOUR_ENDING = AUTO_TOUR_LANDING - 1;
export const AUTO_TOUR_STOPS = {
  gate: 17, graduate: 32, design: 37, gemi: 42, music: 51, visionCenter: 59,
  rodem: 79, studentUnion: 87, theology: 93, science: 96, vision: 101, rodemReturn: 115, field: 134, main: 142,
};
export const AUTO_TOUR_RETURN = { climb: 118, panorama: 123, dive: 126.4, pullOut: 133.3 };
export const AUTO_TOUR_ROAD_END = 150.6;

export const AUTO_TOUR_PRELOAD: Record<string, number> = {
  main: 0, graduate: 15, design: 20, gemi: 24, music: 35, vision_center: 46, rodem: 64,
  student_union: 72, theology: 80, science: 81, vision: 85,
};

const stops = AUTO_TOUR_STOPS;
export const AUTO_TOUR_CHAPTERS = [
  { at: 0, place: '본관', title: '첫 날갯짓', detail: '십자가 아래에서 시작된 작은 생명' },
  { at: stops.gate, place: '정문', title: '의', detail: '바른 방향을 잡다' },
  { at: stops.graduate, place: '대학원관', title: '', detail: '' },
  { at: stops.design, place: '디자인관', title: '진리', detail: '배움으로 시야를 넓히다' },
  { at: stops.gemi, place: 'GEMI관', title: '', detail: '' },
  { at: stops.music, place: '음악관', title: '', detail: '' },
  { at: stops.visionCenter, place: '영산비전센터', title: '', detail: '' },
  { at: stops.rodem, place: '로뎀관', title: '', detail: '' },
  { at: stops.studentUnion, place: '학생회관', title: '사랑', detail: '배운 길을 함께 날다' },
  { at: stops.theology, place: '신학관', title: '', detail: '' },
  { at: stops.science, place: '이공관', title: '', detail: '' },
  { at: stops.vision, place: '비전관', title: '', detail: '' },
  { at: stops.rodemReturn, place: '로뎀관', title: '', detail: '' },
  { at: AUTO_TOUR_RETURN.panorama, place: '캠퍼스 전경', title: '', detail: '' },
  { at: stops.field, place: '운동장 옆 도로', title: '', detail: '' },
  { at: stops.main, place: '본관', title: '', detail: '' },
  { at: AUTO_TOUR_ENDING, place: '본관', title: '한세에서 배운 것을, 세상과 나누다.', detail: '' },
] as const;

const onSpine = (time: number, z: number, y: number): Keyframe => [time, [spinePoint(spineDistanceAtZ(z))[0], y, z]];
const scienceJunction: Point = [14.6, 207.5];
const visionFrontRoad: Point[] = [scienceJunction, [7, 217.7], [7.5, 228.5]];
const rodemRoad: Point[] = [[68.14, 59.6], [75.26, 77.35], [80, 101.97], [77.85, 129.66], [67.86, 146.22], SCIENCE_SIDE_ROAD[0]!];

// The first point is the preceding keyframe. Space the rest by road distance.
function roadSection(from: number, to: number, height: number, path: Point[]): Keyframe[] {
  let length = 0;
  const distances = path.slice(1).map(([x, z], i) => {
    const [prevX, prevZ] = path[i]!;
    length += Math.hypot(x - prevX, z - prevZ);
    return length;
  });
  return path.slice(1).map(([x, z], i) => [from + (to - from) * distances[i]! / length, [x, height, z]]);
}

const eagleKeys: Keyframe[] = [
  [0, nestBird],
  [7.6, nestBird],
  [9.5, [nestX - 1.15, roofHeight + 0.71, nestZ + 0.85]],
  [12.5, [-94, 21, -225]],
  [15, [-120, 12, -224]],
  [17, [-122.13, 6.7, -217.57]],
  [20, [-113.65, 8.2, -203.64]],
  [23, [-103.37, 9.8, -186.76]],
  [25, [-98.1, 10.3, -178.1]],
  [28, [-86.38, 11, -156.4]],
  [30, [-81.8, 25, -131.85]],
  onSpine(33, -102, 34),
  onSpine(35, -78, 35),
  onSpine(37, -56, 36),
  onSpine(40, -34, 35),
  onSpine(43, -11, 32.5),
  onSpine(46, 15, 26),
  onSpine(48, 44, 19.5),
  [49.5, [-47, 17, 47.9]],
  [52.4, [-21, 15.2, 47.5]],
  [55.2, [19.6, 15.2, 45.8]],
  [57, [4.8, 17, 59.6]],
  [58.7, [-11.7, 19, 60.4]],
  [60.6, [-10, 20.5, 76]],
  [62.5, [-12.72, 22, 86.67]], // 중앙 주차장의 가운데에서 영비관을 본다.
  [63.4, [-9.3, 22, 88.2]],
  [64.8, [-2.6, 21, 85.1]],
  [66, [1, 20, 73]],
  [67.2, [4.8, 19, 59.6]],
  ...roadSection(67.2, 75.8, 19, [[4.8, 59.6], [24.9, 58.5], [35.1, 58], [47.6, 52.6], [57.4, 45.2], rodemRoad[0]!]),
  ...roadSection(75.8, 86.8, 21.4, rodemRoad),
  ...roadSection(86.8, 92, 22, SCIENCE_SIDE_ROAD),
  // 신학관과 이공관 사이 연결 도로를 한 번 지나며 양쪽 건물을 순서대로 담는다.
  ...roadSection(92, 99.2, 24, [...SOUTH_LINK, scienceJunction]),
  ...roadSection(99.2, 103.7, 24, [...visionFrontRoad, [12, 236.2], [14.05, 240.85]]),
  [104.2, [15.7, 24, 242.3]],
  [104.75, [17.22, 24, 240.35]],
  [105.4, [15.77, 24, 236.8]],
  ...roadSection(105.4, 109.8, 24, [[15.77, 236.8], ...[...visionFrontRoad].reverse()]),
  ...roadSection(109.8, AUTO_TOUR_RETURN.climb, 24, [scienceJunction, ...[...SCIENCE_SIDE_ROAD].reverse(), ...rodemRoad.slice(3, -1).reverse()]),
  [120.2, [80, 74, 101.97]],
  [123.2, [77.1, 148, 87]],
  [124.6, [75.26, 151, 77.35]],
  [AUTO_TOUR_RETURN.dive, [71.9, 151, 68.9]],
  [127.8, [68.14, 125, 59.6]],
  [129.1, [57.4, 96, 45.2]],
  [130, [58.4, 78, 36.2]],
  [131.4, [55.6, 47, 15.4]],
  [AUTO_TOUR_RETURN.pullOut, [51.7, 17, -13.2]],
  [135.1, [47, 12.6, -47]],
  [137, [43.6, 12.4, -71]],
  [139.3, [39.3, 12.1, -102]],
  [141, [36.7, 12.1, -120.1]],
  [141.7, [34, 12.4, -126]],
  ...roadSection(141.7, 149, 15.2, [[34, -126], ...[...MAIN_FRONT_PROFILE].reverse().map(([x, z]): Point => [x, z])]),
  [AUTO_TOUR_ROAD_END, [-89.5, 24, -163]],
  [152.2, [-96, 33, -187]],
  [154, [-90, 29, -214]],
  [155.5, [-77, 23, -218]],
  [156.3, [-74, 19, -214]],
  [AUTO_TOUR_LANDING, perch],
  [AUTO_TOUR_ROUTE_LENGTH, perch],
];

const cinematicCameraKeys: Keyframe[] = [
  [0, roofCamera],
  [4.8, [nestX - 4.7, roofHeight + 1.95, nestZ + 2.7]],
  [7.6, [nestX - 4.8, roofHeight + 2, nestZ + 2.7]],
  [9.5, [nestX - 5.2, roofHeight + 2.8, nestZ - 2.4]],
  [12.5, [-85, 27, -210]],
  [15, [-112, 22, -232]],
  [17, [-138, 11.7, -225.9]],
  [20.5, [-123, 15, -219]],
  [58.9, [-20, 27, 57]],
  [61, [-15, 33, 54]],
  [62.8, [-15, 34, 62]],
  [64.8, [-16, 34, 69]],
  [66.4, [-13, 31, 86]],
  [68.2, [-4, 27, 75]],
  [99.5, [21, 30, 206]],
  [101.4, [23, 33, 212]],
  [103.8, [22, 34, 220]],
  [105.2, [22, 34, 219]],
  [107.6, [19, 32, 224]],
  [109.8, [12, 31, 222]],
  [115.5, [64, 31, 161]],
  [118, [81, 41, 155]],
  [120.2, [102, 90, 143]],
  [123.2, [146, 192, 157]],
  [124.6, [151, 197, 149]],
  [126.4, [150, 193, 137]],
  [128.4, [118, 153, 102]],
  [130.2, [84, 104, 68]],
  [132.4, [66, 55, 29]],
  [134.6, [54, 23, -14]],
  [149.6, [-74, 25, -151]],
  [151.7, [-92, 40, -161]],
  [153, [-103, 39, -188]],
  [154.3, [-100, 34, -210]],
  [156, [-85, 24, -220]],
  [AUTO_TOUR_LANDING, roofCamera],
  [AUTO_TOUR_ROUTE_LENGTH, roofCamera],
];

const smooth = (start: number, end: number, time: number) => {
  const t = Math.min(1, Math.max(0, (time - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

type Axis = 0 | 1 | 2;
function tangent(before: Keyframe | undefined, key: Keyframe, after: Keyframe | undefined, axis: Axis) {
  if (!before || !after) return 0;
  const inSlope = (key[1][axis] - before[1][axis]) / (key[0] - before[0]);
  const outSlope = (after[1][axis] - key[1][axis]) / (after[0] - key[0]);
  return inSlope * outSlope > 0 ? 2 / (1 / inSlope + 1 / outSlope) : 0;
}

// A monotone cubic rounds junctions without overshooting authored positions.
function sample(keys: Keyframe[], time: number, target: Vector3) {
  const i = Math.max(0, keys.findIndex(key => key[0] >= time) - 1);
  const a = keys[i]!, b = keys[i + 1]!;
  const span = b[0] - a[0], t = (time - a[0]) / span, t2 = t * t, t3 = t2 * t;
  for (const axis of [0, 1, 2] as const) {
    const m0 = span * tangent(keys[i - 1], a, b, axis);
    const m1 = span * tangent(a, b, keys[i + 2], axis);
    target.setComponent(axis, (2 * t3 - 3 * t2 + 1) * a[1][axis] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * b[1][axis] + (t3 - t2) * m1);
  }
  return target;
}

export function autoTourPosition(seconds: number, track: 1 | 2, target: Vector3) {
  const time = Math.max(0, Math.min(AUTO_TOUR_ROUTE_LENGTH, seconds));
  if (track === 1) return sample(eagleKeys, time, target);

  const centerParkingShot = smooth(58.9, 61, time) * (1 - smooth(65.4, 68.2, time));
  const visionFrontShot = smooth(99.5, 101.4, time) * (1 - smooth(106.8, 109.8, time));
  const outwardRoad = smooth(17.8, 20.5, time) * (1 - Math.max(centerParkingShot, visionFrontShot)) * (1 - smooth(115.5, 118, time));
  const homeRoad = smooth(132.6, 135.6, time) * (1 - smooth(149, 151.7, time));
  const follow = Math.max(outwardRoad, homeRoad);
  if (!follow) return sample(cinematicCameraKeys, time, target);
  const highPass = smooth(30, 32, time) * (1 - smooth(44, 47, time));
  const rodemFacade = smooth(77, 79.6, time) * (1 - smooth(83, 86.3, time));
  sample(eagleKeys, time - 1.2 - 0.65 * highPass, target);
  target.x += 12 * rodemFacade - 8 * highPass;
  target.y += 6.8 + 2 * highPass - 2.8 * rodemFacade;
  if (follow < 1) {
    const { x, y, z } = target;
    sample(cinematicCameraKeys, time, target);
    target.set(target.x + (x - target.x) * follow, target.y + (y - target.y) * follow, target.z + (z - target.z) * follow);
  }
  return target;
}

export function autoTourGrowth(time: number) {
  const fledgling = smooth(7.4, 9.1, time), adolescent = smooth(38, 47, time);
  const adult = smooth(AUTO_TOUR_RETURN.climb, AUTO_TOUR_RETURN.panorama + 2, time);
  return {
    chick: 1 - fledgling,
    size: 0.23 + fledgling * 0.50 + adolescent * 0.13 + adult * 0.17,
    wingLength: 0.43 + fledgling * 0.56 + adolescent * 0.2 + adult * 0.19,
    tailLength: 0.33 + fledgling * 0.58 + adolescent * 0.23 + adult * 0.24,
    headSize: 1.5 - fledgling * 0.29 - adolescent * 0.09 - adult * 0.12,
    grounded: time < AUTO_TOUR_FIRST_FLIGHT || time >= AUTO_TOUR_LANDING,
  };
}

export function autoTourChapter(time: number) {
  return AUTO_TOUR_CHAPTERS.findLast(chapter => time >= chapter.at) ?? AUTO_TOUR_CHAPTERS[0];
}
