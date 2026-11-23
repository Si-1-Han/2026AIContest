import { Box3, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Building } from '../../types/generated/campus';
import { AUTO_TOUR_FIRST_FLIGHT, AUTO_TOUR_RETURN, AUTO_TOUR_ROUTE_LENGTH } from './autoTour';
import { buildingElevation } from './elevationLevels';

// These shots interrupt the chase camera briefly. They use the same live 3D scene.
const shots = [
  { id: 'graduate', at: 34, eye: [1, 30, -120] },
  { id: 'design', at: 39, eye: [11, 31, -42] },
  { id: 'gemi', at: 44, eye: [17, 27, -19] },
  { id: 'music', at: 54, eye: [17, 25, 80] },
  { id: 'vision_center', at: 63, eye: [11, 30, 106] },
  { id: 'rodem', at: 82, eye: [101, 27, 95] },
  { id: 'student_union', at: 89, eye: [41, 30, 209] },
  { id: 'theology', at: 94, eye: [66, 31, 176] },
  { id: 'science', at: 98, eye: [52, 33, 215] },
  { id: 'vision', at: 104, eye: [-31, 34, 242] },
  { id: 'main', at: 153, eye: [-100, 40, -147] },
] as const;

const shotDuration = 4;
const fadeHalf = 0.22;
const flightDuration = 104;
// Compress flight between landmarks, keeping the opening, panorama and final approach at their authored pace.
const flightTiming = [
  { route: 0, playback: 0 },
  { route: AUTO_TOUR_FIRST_FLIGHT, playback: AUTO_TOUR_FIRST_FLIGHT },
  { route: AUTO_TOUR_RETURN.panorama, playback: 77.6 },
  { route: AUTO_TOUR_RETURN.dive, playback: 81 },
  { route: shots.at(-1)!.at, playback: 97 },
  { route: AUTO_TOUR_ROUTE_LENGTH, playback: flightDuration },
];
type Clock = 'route' | 'playback';

function mapFlightTime(seconds: number, from: Clock, to: Clock) {
  const next = flightTiming.findIndex((key, i) => i > 0 && seconds <= key[from]);
  if (next < 0) return seconds;
  const a = flightTiming[next - 1]!, b = flightTiming[next]!;
  return MathUtils.mapLinear(seconds, a[from], b[from], a[to], b[to]);
}

export const AUTO_TOUR_LENGTH = flightDuration + shots.length * shotDuration;
export const AUTO_TOUR_HIGHLIGHTS = shots.map((shot, i) => ({ ...shot, start: mapFlightTime(shot.at, 'route', 'playback') + i * shotDuration }));
type Highlight = typeof AUTO_TOUR_HIGHLIGHTS[number];

export function autoTourElapsedAt(routeTime: number) {
  return mapFlightTime(routeTime, 'route', 'playback') + shots.filter(shot => shot.at < routeTime).length * shotDuration;
}

export function autoTourFrame(elapsed: number) {
  let flightTime = elapsed;
  for (const shot of AUTO_TOUR_HIGHLIGHTS) {
    const age = elapsed - shot.start;
    if (age < 0) break;
    if (age < shotDuration) {
      const inShot = age >= fadeHalf && age < shotDuration - fadeHalf;
      const fade = Math.max(0, 1 - Math.abs(age / fadeHalf - 1), 1 - Math.abs((shotDuration - age) / fadeHalf - 1));
      const caption = MathUtils.smoothstep(age, 0.45, 0.72) * (1 - MathUtils.smoothstep(age, 3.28, 3.55));
      return { routeTime: shot.at, highlight: inShot ? shot : undefined, progress: MathUtils.clamp((age - fadeHalf) / (shotDuration - 2 * fadeHalf), 0, 1), fade, caption };
    }
    flightTime -= shotDuration;
  }
  return { routeTime: mapFlightTime(flightTime, 'playback', 'route'), highlight: undefined, progress: 0, fade: 0, caption: 0 };
}

export function highlightView(shot: Highlight, building: Building) {
  const ground = buildingElevation(building.id);
  const floorShift = building.id === 'main' ? 1 : 0;
  const outlinePoints = building.footprint.map(([x, z]) => new Vector3(x, ground, z));
  // Fit the actual floor outlines so empty corners of an L-shaped building don't shrink the shot.
  for (let level = 1; level <= building.levels; level++) {
    const outline = building.floors.find(floor => floor.level === level)?.outline ?? building.footprint;
    const bottom = Math.max(ground, ground + (level - 1 - floorShift) * building.floor_height);
    const roofAllowance = level === building.levels ? building.id === 'music' ? 4.5 : 2.8 : 0;
    const top = ground + (level - floorShift) * building.floor_height + roofAllowance;
    for (const [x, z] of outline) outlinePoints.push(new Vector3(x, bottom, z), new Vector3(x, top, z));
  }
  const center = new Box3().setFromPoints(outlinePoints).getCenter(new Vector3());
  const eye = new Vector3(...shot.eye);
  const right = new Vector3(eye.z - center.z, 0, center.x - eye.x).normalize();
  return { center, eye, right, outlinePoints };
}

export function frameHighlight(camera: PerspectiveCamera, view: ReturnType<typeof highlightView>, progress: number, scratch: Vector3) {
  camera.position.copy(view.eye).addScaledVector(view.right, (progress - 0.5) * 5);
  camera.lookAt(scratch.copy(view.center).addScaledVector(view.right, -Math.min(camera.aspect, 2) * 2.0));
  camera.updateMatrixWorld();
  const verticalSpace = camera.aspect < 1 ? 0.64 : 0.76;
  let halfAngle = Math.tan(MathUtils.degToRad(18));
  for (const point of view.outlinePoints) {
    scratch.copy(point).applyMatrix4(camera.matrixWorldInverse);
    halfAngle = Math.max(halfAngle, Math.abs(scratch.x) / (-scratch.z * camera.aspect * 0.8), Math.abs(scratch.y) / (-scratch.z * verticalSpace));
  }
  camera.fov = MathUtils.radToDeg(2 * Math.atan(halfAngle));
  camera.updateProjectionMatrix();
}
