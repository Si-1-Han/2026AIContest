import * as THREE from 'three';
import type { Building, CampusData } from '../../types/generated/campus';
import { tourBuildingName } from './buildingName';
import { buildingElevation } from './elevationLevels';
import { MAIN_ENTRY_FLOOR, mainEntryPoint } from './mainEntrance';
import { tourElevation } from './terrain';

/**
 * 새의 시점 자동 투어.
 * 본관 2층 정문 캐노피 턱에 앉은 새가 날아올라
 * 대학원관 → 디자인관 → 음악관 → 영산비전센터 → 비전관 → 신학관 → 이공관을 차례로 들른 뒤 본관 캐노피로 돌아온다.
 * 건물마다 고도를 낮춰 화면에 담고 8초 머문 뒤, 다음 건물까지 거리가 멀면 원래 순항 고도로 올라갔다가 내려온다.
 * 전체 길이에 맞춰 이동 속도를 자동으로 정한다.
 *
 * 모든 값은 시간 t(초)의 순수 함수다. 되감기·건너뛰기·녹화를 해도 같은 화면이 나온다.
 */

type Point = [number, number];

/** 발표에 맞춘 전체 길이(초). 이동 속도는 이 길이에 맞춰 자동으로 정해진다. */
export const BIRD_TOUR_SECONDS = 119;
/** 하이라이트 건물을 화면에 담고 머무는 시간(초). */
export const BIRD_HOLD_SECONDS = 8;
/** 앞에 띄우는 제목. 팀 테마가 정해지면 여기만 바꾼다. */
export const BIRD_TOUR_TITLE = {
  eyebrow: 'HANSEI UNIVERSITY',
  title: '한세 3D 캠퍼스',
  subtitle: '본관 정문에서 날아올라 캠퍼스를 한 바퀴',
};

/**
 * 들르는 건물(순서대로).
 * - bearing: 건물 중심에서 새가 머무는 쪽(지도 기준 [동, 남])
 * - orbit: 머무는 동안 건물 둘레를 도는 방향(1 = 지도에서 시계 반대 방향, -1 = 시계 방향). 다음 건물 쪽으로 돈다.
 * - via: 이 건물로 오는 길에 지나는 지점(건물·캠퍼스 밖을 피해 도로 위로 돌아간다)
 */
export const BIRD_STOPS: { id: string; bearing: Point; orbit: 1 | -1; reach?: number; via: Point[] }[] = [
  // 정문에서 날아올라 서쪽 도로로 내려가다 왼쪽으로 돌아 본관 앞에서 대학원관을 바라본다
  { id: 'graduate', bearing: [0, -1], orbit: -1, via: [[-92, -172], [-84, -152]] },
  // 운동장 위를 가로질러 동쪽에서 바라본다
  { id: 'design', bearing: [1, 0.1], orbit: -1, via: [[-5, -95]] },
  // 음악관은 주차장 쪽 남측 정면(박공·곡면 유리 계단실)을 본다. 동쪽 순환 도로로 돌아 들어간다
  { id: 'music', bearing: [0, 1], orbit: -1, reach: 1.8, via: [[48, -5], [57, 30], [45, 62]] },
  { id: 'vision_center', bearing: [-0.64, -0.77], orbit: 1, via: [] },
  // 서쪽 가장자리를 따라 내려가 비전관 남쪽으로 돌아 들어간다
  { id: 'vision', bearing: [0, 1], orbit: 1, reach: 1.8, via: [[-45, 170], [-30, 215], [-18, 245], [-8, 290]] },
  { id: 'theology', bearing: [0.15, 1], orbit: -1, via: [] },
  // 신학관 남쪽 주차장을 지나 동쪽 순환 도로로 올라가 로뎀관 쪽 상공에서 이공관 정원을 내려다본다
  { id: 'science', bearing: [0.64, -0.77], orbit: 1, via: [[62, 266], [76, 240], [71, 215], [69, 185], [70, 160]] },
];
/** 마지막 건물에서 본관 정문 캐노피로 돌아오는 길: 음악관·운동장 위를 가로질러 본관 앞 도로 → 정문 */
const HOME_VIA: Point[] = [[45, 60], [25, -20], [0, -110], [-40, -140], [-62, -147], [-86, -156], [-100, -170], [-97, -182]];

const PERCH_SECONDS = 2.6;
const SETTLE_SECONDS = 0.9;
const TURN_SECONDS = 2.2;
/** 지면 위 순항 고도(m). */
const CRUISE_HEIGHT = 44;
/** 이 길이보다 긴 구간에서는 순항 고도까지 올라간다. 짧으면 그만큼만 오른다. */
const FULL_CLIMB_LENGTH = 150;
const CLIMB_LENGTH = 70;
const LANDING_LENGTH = 95;
const LOOK_AHEAD = 35;
const LOOK_DROP = 11;
const PERCH_PITCH = -0.2;
const MAX_LOOK_UP = Math.tan(THREE.MathUtils.degToRad(3));
const MAX_LOOK_DOWN = Math.tan(THREE.MathUtils.degToRad(40));
const ORBIT = 0.32;
const FLAP_HZ = 2.2;
/** 구간 시작에서 앞 건물을, 끝에서 다음 건물을 바라보도록 시선을 넘기는 시간 */
const LOOK_BACK_SECONDS = 1.6;
const LOOK_NEXT_SECONDS = 2.2;
/** 이보다 짧은 구간은 순항하지 않고 이웃 건물로 낮게 옮겨 간다 */
const SHORT_LEG = 80;

/** 본관 2층 정문 캐노피(정문 바닥 기준 중심 3.2m, 두께 0.55m, 바깥 끝 v=2.9). mainBuildingSpec과 같은 치수다. */
const CANOPY_TOP = MAIN_ENTRY_FLOOR + 3.2 + 0.55 / 2;
const PERCH_V = 2.62;
const PERCH_U = 2.4;
const EYE_HEIGHT = 0.17;

export type BirdPhase = 'perch' | 'fly' | 'hold' | 'settle' | 'turn' | 'done';
export interface BirdCaption { kind: 'title' | 'highlight'; id: string; title: string; detail: string }
export interface BirdChapter { t: number; label: string; id: string }
export interface BirdPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** 0 = 활공, 1 = 힘찬 날갯짓 */
  flap: number;
  /** 날갯짓 위상(rad). sin > 0 일 때 날개가 위에 있다. */
  wingPhase: number;
  phase: BirdPhase;
  caption: BirdCaption | null;
}
export interface BirdTour {
  duration: number;
  chapters: BirdChapter[];
  /** 건물마다 화면에 담고 머무는 구간 [시작, 끝] */
  holds: { id: string; t0: number; t1: number; focus: THREE.Vector3 }[];
  /** 건물 사이 이동 구간 */
  legs: { t0: number; t1: number; length: number }[];
  perch: THREE.Vector3;
  pose: (t: number, out?: BirdPose) => BirdPose;
  /** 전체 비행 경로(검증용) */
  path: THREE.Vector3[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smoother = (x: number) => { const t = clamp01(x); return t * t * t * (t * (t * 6 - 15) + 10); };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const UP = new THREE.Vector3(0, 1, 0);

function buildingTop(b: Building) {
  return buildingElevation(b.id) + b.levels * b.floor_height + (b.id === 'main' ? 7 : 2.5);
}
function footprintDistance([x, z]: Point, polygon: Point[]) {
  let inside = false, best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[i]!, [bx, bz] = polygon[j]!;
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
    const dx = bx - ax, dz = bz - az, t = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return inside ? 0 : best;
}
function lookQuaternion(eye: THREE.Vector3, target: THREE.Vector3, out = new THREE.Quaternion()) {
  return out.setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, target, UP));
}
function yawPitch(q: THREE.Quaternion) {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return { yaw: Math.atan2(-f.x, -f.z), pitch: Math.asin(THREE.MathUtils.clamp(f.y, -1, 1)) };
}
function fromYawPitch(yaw: number, pitch: number, out = new THREE.Quaternion()) {
  return out.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
}
function smoothValues(values: number[], radius: number) {
  return values.map((_, i) => {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) { sum += values[j]!; count++; }
    return sum / count;
  });
}

export function birdPerchPoint(): THREE.Vector3 {
  const [x, z] = mainEntryPoint(PERCH_V, PERCH_U);
  return new THREE.Vector3(x, CANOPY_TOP + EYE_HEIGHT, z);
}

interface Frame { building: Building; center: Point; focus: THREE.Vector3; dir: Point; dist: number; height: number; orbit: 1 | -1 }
function stopFrame(b: Building, stop: typeof BIRD_STOPS[number], elevation: (x: number, z: number) => number): Frame {
  const center = b.center as Point, elev = buildingElevation(b.id), h = b.levels * b.floor_height;
  const radius = Math.max(...b.footprint.map(([x, z]) => Math.hypot(x - center[0], z - center[1])));
  const dist = Math.max(55, radius * (stop.reach ?? 2.1), h * 1.6);
  const length = Math.hypot(...stop.bearing) || 1;
  const dir: Point = [stop.bearing[0] / length, stop.bearing[1] / length];
  const at: Point = [center[0] + dir[0] * dist, center[1] + dir[1] * dist];
  const height = Math.max(elev + Math.max(h * 0.8, 18), elevation(...at) + 10);
  return { building: b, center, focus: new THREE.Vector3(center[0], elev + h * 0.4, center[1]), dir, dist, height, orbit: stop.orbit };
}
/** 머무는 동안 건물 둘레를 조금 돈다. u: 0→1 */
function frameEye(f: Frame, u: number, out = new THREE.Vector3()) {
  const a = ORBIT * f.orbit * smoother(u), c = Math.cos(a), s = Math.sin(a);
  // 지도(북쪽 위)에서 시계 반대 방향 = +y축 회전
  const dx = f.dir[0] * c + f.dir[1] * s, dz = -f.dir[0] * s + f.dir[1] * c;
  return out.set(f.center[0] + dx * f.dist, f.height - 1.5 * smoother(u), f.center[1] + dz * f.dist);
}

/** 두 지점 사이 비행 구간. 경로·고도·거리별 시간표를 미리 계산한다. */
interface Leg {
  path: THREE.Vector3[];
  S: number[];
  heights: number[];
  ground: number[];
  length: number;
  /** 기준 속도 1m/s일 때의 누적 시간(속도 배율은 나중에 정한다) */
  C: number[];
  t0: number;
  T: number;
  from: Frame | null;
  to: Frame | null;
  endTangent: THREE.Vector3;
}

function buildTour(campus: CampusData): BirdTour {
  const elevation = tourElevation(campus);
  const perch = birdPerchPoint();
  const outward = new THREE.Vector2(mainEntryPoint(1)[0] - mainEntryPoint(0)[0], mainEntryPoint(1)[1] - mainEntryPoint(0)[1]).normalize();
  const perchQuaternion = fromYawPitch(Math.atan2(-outward.x, -outward.y), PERCH_PITCH);
  const roofAt = (x: number, z: number, near: number, extra: number) => Math.max(-Infinity, ...campus.buildings.map(b => footprintDistance([x, z], b.footprint as Point[]) < near ? buildingTop(b) + extra : -Infinity));

  const frames: Frame[] = [];
  const vias: Point[][] = [];
  for (const stop of BIRD_STOPS) {
    const b = campus.buildings.find(x => x.id === stop.id);
    if (!b) { vias.at(-1)?.push(...stop.via); continue; }
    frames.push(stopFrame(b, stop, elevation));
    vias.push([...stop.via]);
  }

  // 1) 구간: 본관 → 건물1 → … → 건물N → 본관
  const makeLeg = (from: Frame | null, to: Frame | null, via: Point[]): Leg => {
    const start = from ? frameEye(from, 1) : perch.clone();
    const end = to ? frameEye(to, 0) : perch.clone();
    const takeoff = !from, landing = !to;
    const controls: Point[] = [
      [start.x, start.z],
      ...(takeoff ? [mainEntryPoint(16, 1.8)] : []),
      ...via,
      ...(landing ? [mainEntryPoint(24, 1.2), mainEntryPoint(11, 2.2)] : []),
      [end.x, end.z],
    ];
    const curve = new THREE.CatmullRomCurve3(controls.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    curve.arcLengthDivisions = 4000;
    const flatLength = curve.getLength();
    const n = Math.max(4, Math.ceil(flatLength / 1.5));
    const flat = curve.getSpacedPoints(n);
    const ground = flat.map(p => elevation(p.x, p.z));
    const s2 = flat.map((_, i) => i * flatLength / n);
    let cruise = smoothValues(ground, 20).map((g, i) => Math.max(g + CRUISE_HEIGHT, roofAt(flat[i]!.x, flat[i]!.z, 18, 10)));
    cruise = smoothValues(smoothValues(cruise, 16), 8);
    const climb = Math.min(1, flatLength / FULL_CLIMB_LENGTH);
    const up = takeoff ? 85 : CLIMB_LENGTH, down = landing ? LANDING_LENGTH : CLIMB_LENGTH;
    const ys = s2.map((s, i) => {
      const u = s / flatLength;
      const base = THREE.MathUtils.lerp(start.y, end.y, smoother(u));
      // 짧은 구간은 낮게 건너가고, 긴 구간은 원래 순항 고도로 올라갔다가 다음 건물 앞에서 내려온다
      const plateau = (landing || takeoff ? 1 : climb) * smoother(s / up) * smoother((flatLength - s) / down);
      let y = THREE.MathUtils.lerp(base, cruise[i]!, plateau);
      if (takeoff) y -= 0.8 * Math.sin(Math.PI * clamp01(s / 10)); // 턱에서 몸을 던지듯 살짝 떨어졌다가 오른다
      if (landing) y += 0.6 * Math.sin(Math.PI * clamp01((flatLength - s) / 6)); // 캐노피 위로 넘어와 내려앉는다
      // 낮게 지나는 구간에서도 건물 지붕 위로는 넉넉히 넘는다
      return Math.max(y, roofAt(flat[i]!.x, flat[i]!.z, 1.5, 8));
    });
    const path = flat.map((p, i) => new THREE.Vector3(p.x, ys[i]!, p.z));
    path[0]!.copy(start); path[n]!.copy(end);
    const S = [0];
    for (let i = 1; i <= n; i++) S.push(S[i - 1]! + path[i]!.distanceTo(path[i - 1]!));
    const length = S[n]!;
    // 속도 배율: 곡선에서 늦추고, 구간 양끝에서는 서서히 출발·정지한다
    const heading = flat.map((_, i) => { const a = flat[Math.max(0, i - 5)]!, b = flat[Math.min(n, i + 5)]!; return Math.atan2(b.z - a.z, b.x - a.x); });
    const turn = smoothValues(heading.map((_, i) => {
      const a = heading[Math.max(0, i - 5)]!, b = heading[Math.min(n, i + 5)]!;
      return Math.max(0.75, 1 / (1 + 9 * Math.abs(wrap(b - a)) / Math.max(1e-3, S[Math.min(n, i + 5)]! - S[Math.max(0, i - 5)]!)));
    }), 7);
    const accel = takeoff ? 45 : Math.min(32, length / 3), brake = landing ? 60 : Math.min(32, length / 3);
    const profile = S.map((s, i) => Math.min(turn[i]!, Math.max(0.1, Math.sqrt(clamp01(s / accel))), Math.max(landing ? 0.07 : 0.1, Math.sqrt(clamp01((length - s) / brake)))));
    const C = [0];
    for (let i = 1; i <= n; i++) C.push(C[i - 1]! + (S[i]! - S[i - 1]!) * 2 / (profile[i]! + profile[i - 1]!));
    return { path, S, heights: path.map(p => p.y), ground, length, C, t0: 0, T: 0, from, to, endTangent: new THREE.Vector3().subVectors(path[n]!, path[Math.max(0, n - 4)]!).setY(0).normalize() };
  };
  const legs: Leg[] = [];
  for (let i = 0; i <= frames.length; i++) legs.push(makeLeg(frames[i - 1] ?? null, frames[i] ?? null, i < frames.length ? vias[i]! : HOME_VIA));

  const index = (arr: number[], value: number) => {
    let lo = 0, hi = arr.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arr[mid]! <= value) lo = mid; else hi = mid; }
    return { i: lo, j: hi, f: clamp01((value - arr[lo]!) / ((arr[hi]! - arr[lo]!) || 1)) };
  };
  const legSample = (leg: Leg, arr: number[], s: number) => { const { i, j, f } = index(leg.S, s); return arr[i]! + (arr[j]! - arr[i]!) * f; };
  const legPosition = (leg: Leg, s: number, out = new THREE.Vector3()) => { const { i, j, f } = index(leg.S, Math.max(0, Math.min(leg.length, s))); return out.lerpVectors(leg.path[i]!, leg.path[j]!, f); };
  const legS = (leg: Leg, time: number) => { const { i, j, f } = index(leg.C, time / leg.T * leg.C.at(-1)!); return leg.S[i]! + (leg.S[j]! - leg.S[i]!) * f; };
  const target = new THREE.Vector3();
  const legLook = (leg: Leg, s: number, eye: THREE.Vector3, out: THREE.Quaternion) => {
    const ahead = s + LOOK_AHEAD;
    if (ahead <= leg.length) legPosition(leg, ahead, target); else target.copy(leg.path.at(-1)!).addScaledVector(leg.endTangent, ahead - leg.length);
    target.y -= LOOK_DROP * clamp01((eye.y - legSample(leg, leg.ground, s)) / CRUISE_HEIGHT);
    // 날아오를 때도 하늘만 보지 않도록 시선은 수평에서 조금 위까지만 든다
    const horizontal = Math.hypot(target.x - eye.x, target.z - eye.z);
    target.y = eye.y + THREE.MathUtils.clamp(target.y - eye.y, -horizontal * MAX_LOOK_DOWN, horizontal * MAX_LOOK_UP);
    return lookQuaternion(eye, target, out);
  };
  // 구간 양끝에서 시선을 돌려야 하는 각도. 회전이 너무 빠르지 않도록 시선 전환 시간을 정한다(최대 약 2.2rad/s).
  const forward = (q: THREE.Quaternion) => new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const turnSeconds = (a: THREE.Quaternion, b: THREE.Quaternion) => 1.875 * forward(a).angleTo(forward(b)) / 2.2;
  const lookTimes = legs.map(leg => {
    const start = leg.path[0]!, end = leg.path.at(-1)!;
    const from = leg.from ? lookQuaternion(start, leg.from.focus) : perchQuaternion;
    const to = leg.to ? lookQuaternion(end, leg.to.focus) : null;
    if (leg.from && leg.to && leg.length < SHORT_LEG) return { back: 0, next: 0, whole: turnSeconds(from, to!) };
    return {
      back: Math.max(LOOK_BACK_SECONDS, turnSeconds(from, legLook(leg, 0, start, new THREE.Quaternion()))),
      next: to ? Math.max(LOOK_NEXT_SECONDS, turnSeconds(legLook(leg, leg.length, end, new THREE.Quaternion()), to)) : 0,
      whole: 0,
    };
  });

  // 2) 이동 속도: 정해진 전체 길이에서 머무는 시간을 뺀 만큼을 거리에 비례해 나눈다
  const flySeconds = BIRD_TOUR_SECONDS - PERCH_SECONDS - SETTLE_SECONDS - TURN_SECONDS - frames.length * BIRD_HOLD_SECONDS;
  // 짧은 구간도 순간이동처럼 보이지 않게 최소 시간을 둔다
  const minimum = (leg: Leg) => { const look = lookTimes[legs.indexOf(leg)]!; return Math.max(2.8 + leg.length / 45, look.whole, (look.back + look.next) / 0.85); };
  const flyTime = (b: number) => legs.reduce((sum, leg) => sum + Math.max(leg.C.at(-1)! / b, minimum(leg)), 0);
  let lo = 0.01, hi = 1000;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (flyTime(mid) > Math.max(20, flySeconds)) lo = mid; else hi = mid; }
  const base = hi;

  type Segment = { kind: 'perch' | 'settle' | 'turn'; t0: number; t1: number } | { kind: 'fly'; t0: number; t1: number; leg: Leg; index: number } | { kind: 'hold'; t0: number; t1: number; frame: Frame };
  const segments: Segment[] = [{ kind: 'perch', t0: 0, t1: PERCH_SECONDS }];
  const holds: BirdTour['holds'] = [];
  const chapters: BirdChapter[] = [{ t: 0, label: '본관 출발', id: 'main' }];
  let t = PERCH_SECONDS;
  legs.forEach((leg, index) => {
    leg.t0 = t; leg.T = Math.max(leg.C.at(-1)! / base, minimum(leg));
    segments.push({ kind: 'fly', t0: t, t1: t + leg.T, leg, index });
    t += leg.T;
    const frame = frames[index];
    if (frame) {
      chapters.push({ t: Math.max(leg.t0, t - LOOK_NEXT_SECONDS), label: tourBuildingName(frame.building), id: frame.building.id });
      segments.push({ kind: 'hold', t0: t, t1: t + BIRD_HOLD_SECONDS, frame });
      holds.push({ id: frame.building.id, t0: t, t1: t + BIRD_HOLD_SECONDS, focus: frame.focus.clone() });
      t += BIRD_HOLD_SECONDS;
    } else chapters.push({ t: leg.t0, label: '본관 귀환', id: 'main' });
  });
  segments.push({ kind: 'settle', t0: t, t1: t + SETTLE_SECONDS });
  t += SETTLE_SECONDS;
  segments.push({ kind: 'turn', t0: t, t1: t + TURN_SECONDS });
  t += TURN_SECONDS;
  const duration = t;

  const lastLeg = legs.at(-1)!;
  const landedQuaternion = legLook(lastLeg, lastLeg.length, perch.clone(), new THREE.Quaternion());
  const landed = yawPitch(landedQuaternion);
  const titleWindow = [PERCH_SECONDS + 0.6, PERCH_SECONDS + 7.5] as const;
  const flapBurst = (time: number) => { const x = time % 5.6; return smoother(x / 0.35) * (1 - smoother((x - 1.9) / 0.35)); };
  const caption = (f: Frame): BirdCaption => ({ kind: 'highlight', id: f.building.id, title: tourBuildingName(f.building), detail: f.building.description });
  const qTmp = new THREE.Quaternion();

  type Base = { position: THREE.Vector3; quaternion: THREE.Quaternion; flap: number; phase: BirdPhase; caption: BirdCaption | null; airborne: number };
  function basePose(time: number, out: Base): Base {
    const tt = Math.max(0, Math.min(duration, time));
    const seg = segments.find(x => tt >= x.t0 && tt <= x.t1) ?? segments.at(-1)!;
    const local = tt - seg.t0, u = local / Math.max(1e-6, seg.t1 - seg.t0);
    out.phase = seg.kind; out.caption = null; out.airborne = 1; out.flap = 0;
    switch (seg.kind) {
      case 'perch': {
        out.position.copy(perch);
        // 고개를 까딱이며 주변을 살핀 뒤 몸을 낮추고 뛰어오른다
        const look = (a: number, b: number, at: number) => smoother((tt - at) / 0.24) * (b - a);
        const yaw = look(0, 0.26, 0.3) + look(0.26, -0.16, 0.9) + look(-0.16, 0, 1.55);
        const pitch = look(0, 0.07, 0.3) + look(0.07, -0.05, 0.9) + look(-0.05, 0, 1.55);
        const { yaw: y0, pitch: p0 } = yawPitch(perchQuaternion);
        fromYawPitch(y0 + yaw, p0 + pitch, out.quaternion);
        out.position.y -= 0.05 * smoother((tt - 2.0) / 0.3);
        out.flap = 0.65 * smoother((tt - 2.25) / 0.3);
        out.airborne = 0;
        break;
      }
      case 'fly': {
        const leg = seg.leg, s = legS(leg, local);
        legPosition(leg, s, out.position);
        legLook(leg, s, out.position, out.quaternion);
        // 다음 건물이 가까워지면 그 건물로, 출발할 때는 앞 건물에서 시선을 거둔다
        if (leg.from && leg.to && leg.length < SHORT_LEG) {
          // 가까운 이웃 건물로 옮겨 갈 때는 앞 건물에서 다음 건물로 시선을 한 번에 넘긴다
          lookQuaternion(out.position, leg.from.focus, out.quaternion).slerp(lookQuaternion(out.position, leg.to.focus, qTmp), smoother(u));
        } else {
          const look = lookTimes[seg.index]!, lookNext = Math.min(look.next, leg.T * 0.5), lookBack = Math.min(look.back, leg.T * 0.4);
          if (leg.to) out.quaternion.slerp(lookQuaternion(out.position, leg.to.focus, qTmp), smoother((local - (leg.T - lookNext)) / lookNext));
          const back = 1 - smoother(local / lookBack);
          if (back > 0) out.quaternion.slerp(leg.from ? lookQuaternion(out.position, leg.from.focus, qTmp) : qTmp.copy(perchQuaternion), back);
        }
        const climb = clamp01((legSample(leg, leg.heights, Math.min(leg.length, s + 6)) - legSample(leg, leg.heights, Math.max(0, s - 6))) / 12 * 3);
        const pushOff = 1 - smoother((local - (leg.from ? 1.2 : 4)) / 0.8);
        const braking = leg.to ? 0 : smoother((LANDING_LENGTH * 0.25 - (leg.length - s)) / 12);
        out.flap = Math.max(flapBurst(tt), climb, pushOff, braking);
        // 다음 건물에 다가가며 활공한다
        if (leg.to) out.flap *= 1 - smoother((local - (leg.T - 1.6)) / 1.2);
        if (leg.from && local < 0.7) out.caption = caption(leg.from);
        if (leg.to && local > leg.T - 1.2) out.caption = caption(leg.to);
        if (tt >= titleWindow[0] && tt <= titleWindow[1]) out.caption = { kind: 'title', id: 'title', title: BIRD_TOUR_TITLE.title, detail: BIRD_TOUR_TITLE.subtitle };
        break;
      }
      case 'hold': {
        frameEye(seg.frame, u, out.position);
        lookQuaternion(out.position, seg.frame.focus, out.quaternion);
        out.flap = 0.35 * flapBurst(tt + 2);
        out.caption = caption(seg.frame);
        break;
      }
      case 'settle': {
        out.position.copy(perch);
        out.position.y += 0.05 * Math.sin(Math.PI * u) * (1 - u);
        out.quaternion.copy(landedQuaternion);
        out.flap = 1 - smoother(u / 0.6);
        out.airborne = 0;
        break;
      }
      case 'turn': {
        out.position.copy(perch);
        // 내려앉은 뒤 왼쪽으로 돌아 처음처럼 캠퍼스 쪽을 바라본다
        fromYawPitch(landed.yaw + Math.PI * smoother(u), THREE.MathUtils.lerp(landed.pitch, PERCH_PITCH, smoother(u)), out.quaternion);
        out.position.y += 0.04 * Math.sin(Math.PI * smoother(u));
        out.airborne = 0;
        out.phase = tt >= duration ? 'done' : 'turn';
        break;
      }
    }
    return out;
  }

  const tmpA: Base = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), flap: 0, phase: 'fly', caption: null, airborne: 1 };
  const tmpB: Base = { ...tmpA, position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  const pose = (time: number, out?: BirdPose): BirdPose => {
    const result = out ?? { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), flap: 0, wingPhase: 0, phase: 'perch', caption: null };
    const b: Base = { position: result.position, quaternion: result.quaternion, flap: 0, phase: 'perch', caption: null, airborne: 1 };
    basePose(time, b);
    // 선회 방향으로 몸을 기울인다(좌회전 → 왼쪽으로 기울임)
    const dt = 0.35;
    const yawRate = wrap(yawPitch(basePose(time + dt, tmpB).quaternion).yaw - yawPitch(basePose(time - dt, tmpA).quaternion).yaw) / (2 * dt);
    const roll = THREE.MathUtils.clamp(yawRate * 0.42, -0.42, 0.42) * b.airborne;
    const wingPhase = 2 * Math.PI * FLAP_HZ * time;
    // 날개를 내려칠 때 몸이 떠오르고, 올릴 때 살짝 가라앉는다
    result.position.y += b.flap * 0.12 * -Math.cos(wingPhase) * b.airborne;
    const bob = b.flap * 0.012 * Math.sin(wingPhase) * b.airborne;
    result.quaternion.multiply(qTmp.setFromEuler(new THREE.Euler(bob, 0, roll)));
    result.flap = b.flap; result.wingPhase = wingPhase; result.phase = b.phase; result.caption = b.caption;
    return result;
  };

  return {
    duration, chapters, holds, perch, pose,
    legs: legs.map(l => ({ t0: l.t0, t1: l.t0 + l.T, length: l.length })),
    path: legs.flatMap(l => l.path),
  };
}

const cache = new WeakMap<CampusData, BirdTour>();
/** 캠퍼스 데이터마다 한 번만 만든다. */
export function birdTourFor(campus: CampusData): BirdTour {
  let tour = cache.get(campus);
  if (!tour) { tour = buildTour(campus); cache.set(campus, tour); }
  return tour;
}
