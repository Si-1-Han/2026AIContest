import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MUSIC_PARKING } from '../../features/tour/musicForecourt';
import { Batch, type Part } from './Batch';
import type { ParkingBay } from './roadLayout';

/**
 * 주차장 사진(2026-11, 영산비전센터 앞·음악관 앞·음악관 서측 펜스 주차장)을 바탕으로 한 주차 차량.
 * 흰색·은색·회색·검정 차량이 대부분이고, 세단·SUV·해치백이 섞여 있으며 대부분 후진 주차다.
 * 모든 칸에는 검은 고무 차막이가 두 개씩 있다. 실측 배치가 아닌 표현용이며, 칸마다 같은 결과가 나오도록
 * 위치로 정한 의사난수를 쓴다(새로 고침해도 차가 바뀌지 않는다).
 */

type Profile = [number, number][];
interface CarShape { length: number; width: number; body: Profile; glass: Profile; wheelBase: number; wheel: number }
/** 옆모습(x: 차 길이 방향, 앞이 +x / y: 높이). */
const SHAPES: Record<'sedan' | 'suv' | 'hatch', CarShape> = {
  sedan: {
    length: 4.85, width: 1.84, wheelBase: 2.85, wheel: 0.33,
    body: [[-2.4, 0.3], [2.4, 0.3], [2.43, 0.62], [2.28, 0.8], [0.95, 0.93], [0.15, 1.42], [-0.95, 1.42], [-1.75, 1.0], [-2.35, 0.95], [-2.45, 0.68]],
    glass: [[0.92, 0.97], [0.18, 1.37], [-0.96, 1.37], [-1.68, 0.99]],
  },
  suv: {
    length: 4.7, width: 1.9, wheelBase: 2.78, wheel: 0.37,
    body: [[-2.32, 0.38], [2.33, 0.38], [2.36, 0.75], [2.2, 0.95], [1.3, 1.04], [0.5, 1.6], [-1.75, 1.6], [-2.28, 1.36], [-2.36, 0.75]],
    glass: [[1.29, 1.07], [0.53, 1.56], [-1.73, 1.56], [-2.31, 1.34], [-2.33, 1.1], [-1.9, 1.07]],
  },
  hatch: {
    length: 4.2, width: 1.8, wheelBase: 2.6, wheel: 0.31,
    body: [[-2.06, 0.3], [2.08, 0.3], [2.1, 0.62], [1.95, 0.8], [0.85, 0.92], [0.1, 1.45], [-1.55, 1.45], [-2.05, 1.1], [-2.1, 0.65]],
    glass: [[0.83, 0.95], [0.13, 1.41], [-1.53, 1.41], [-2.08, 1.08], [-1.95, 0.98]],
  },
};
type Kind = keyof typeof SHAPES;
const KINDS: Kind[] = ['sedan', 'suv', 'hatch'];

/** 사진 속 비율에 맞춘 차량 색. [색, 누적 확률] */
const PAINT: [string, number][] = [
  ['#f1f1ec', 0.24], ['#e4e1d8', 0.34], ['#b9bdc0', 0.5], ['#83898d', 0.62], ['#4b5055', 0.71],
  ['#1b1d20', 0.88], ['#22324f', 0.93], ['#8b1d22', 0.95], ['#3d6ea6', 0.97], ['#b4a68a', 1],
];
/** 칸이 차 있을 확률. 음악관 서측 펜스 주차장은 사진처럼 거의 다 찼고 넓은 중앙 주차장은 절반 남짓이다. */
const OCCUPANCY: Record<ParkingBay['lot'], number> = { central: 0.55, music: 0.9, other: 0.6 };

const hash = (x: number, z: number, salt: number) => {
  const v = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

export interface ParkedCar { kind: Kind; x: number; y: number; z: number; heading: number; color: string }

/** 칸 목록 → 주차 차량. heading은 차 앞쪽이 향하는 방향(라디안, three.js rotation.y). */
export function parkedCars(bays: ParkingBay[], elevation: (x: number, z: number) => number): ParkedCar[] {
  const cars: ParkedCar[] = [];
  for (const bay of bays) {
    const [x, z] = bay.center, [bx, bz] = bay.back;
    if (hash(x, z, 1) > OCCUPANCY[bay.lot]) continue;
    const kind = KINDS[Math.min(2, Math.floor(hash(x, z, 2) * 2.2))]!, shape = SHAPES[kind];
    const pick = hash(x, z, 3), color = PAINT.find(([, p]) => pick <= p)![0];
    // 대부분 후진 주차(앞이 통로 쪽). 뒤 끝은 칸 안쪽 선에서 0.35m 떨어진다.
    const reversed = hash(x, z, 4) < 0.75, depth = 2.4 - 0.35 - shape.length / 2;
    const side = (hash(x, z, 5) - 0.5) * 0.24, sx = -bz, sz = bx;
    const cx = x + bx * depth + sx * side, cz = z + bz * depth + sz * side;
    const fx = reversed ? -bx : bx, fz = reversed ? -bz : bz;
    const heading = Math.atan2(-fz, fx) + (hash(x, z, 6) - 0.5) * 0.06;
    cars.push({ kind, x: cx, z: cz, y: elevation(cx, cz) + 0.04, heading, color });
  }
  return cars;
}

/** 칸마다 안쪽 선에서 0.55m 앞에 두는 검은 고무 차막이 두 개. */
export function wheelStops(bays: ParkingBay[], elevation: (x: number, z: number) => number): Part[] {
  return bays.flatMap(bay => {
    const [x, z] = bay.center, [bx, bz] = bay.back, sx = -bz, sz = bx, ry = Math.atan2(-bz, bx) + Math.PI / 2;
    return [-0.6, 0.6].map((side): Part => {
      const px = x + bx * 1.85 + sx * side, pz = z + bz * 1.85 + sz * side;
      return { p: [px, elevation(px, pz) + 0.11, pz], s: [0.72, 0.13, 0.16], color: '#1d1e20', ry };
    });
  });
}

/** 음악관 서측 주차장과 직선 차도 보도 사이의 검은 철제 펜스(사진 _04~_06). */
export function musicParkingFence(elevation: (x: number, z: number) => number): Part[] {
  const [a, , , d] = MUSIC_PARKING as [number, number][];
  const start = a!, end = d!, length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const ux = (end[0] - start[0]) / length, uz = (end[1] - start[1]) / length, ry = Math.atan2(-uz, ux);
  // 주차장 경계에서 0.15m 안쪽. 양 끝은 1m씩 비워 보행 동선과 겹치지 않게 한다.
  const inset = 0.15, from = 1, to = length - 1;
  const at = (t: number): [number, number] => [start[0] + ux * t + uz * inset, start[1] + uz * t - ux * inset];
  const parts: Part[] = [];
  const color = '#25282b';
  for (let t = from; t <= to + 0.001; t += 0.14) {
    const [x, z] = at(t), y = elevation(x, z);
    const post = Math.abs((t - from) % 2.38) < 0.07 || t > to - 0.07;
    parts.push({ p: [x, y + 0.6, z], s: post ? [0.06, 1.2, 0.06] : [0.022, 1.0, 0.022], color, ry });
  }
  for (const h of [0.14, 1.08]) for (let t = from; t < to; t += 2) {
    const seg = Math.min(2, to - t), [x, z] = at(t + seg / 2);
    parts.push({ p: [x, elevation(x, z) + h, z], s: [seg, 0.045, 0.04], color, ry });
  }
  return parts;
}

function extrude(profile: Profile, width: number, bevel: number) {
  const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
  geometry.translate(0, 0, -(width - bevel * 2) / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function Instances({ geometry, cars, color, material, matrix }: {
  geometry: THREE.BufferGeometry; cars: ParkedCar[]; color?: (car: ParkedCar) => string; material: THREE.Material;
  matrix: (car: ParkedCar, target: THREE.Matrix4, index: number) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const m = new THREE.Matrix4(), c = new THREE.Color();
    cars.forEach((car, i) => { matrix(car, m, i); mesh.setMatrixAt(i, m); if (color) mesh.setColorAt(i, c.set(color(car))); });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cars, color, matrix]);
  if (!cars.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, cars.length]} castShadow receiveShadow />;
}

const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
const placement = (car: ParkedCar, target: THREE.Matrix4) => target.compose(
  new THREE.Vector3(car.x, car.y, car.z), new THREE.Quaternion().setFromAxisAngle(UP, car.heading), ONE);

function CarKind({ kind, cars, materials }: { kind: Kind; cars: ParkedCar[]; materials: Record<'paint' | 'glass' | 'tire' | 'head' | 'tail', THREE.Material> }) {
  const shape = SHAPES[kind];
  const geometries = useMemo(() => {
    const wheel = new THREE.CylinderGeometry(shape.wheel, shape.wheel, 0.24, 14); wheel.rotateX(Math.PI / 2);
    const lamp = new THREE.BoxGeometry(0.06, 0.13, 0.36);
    return { body: extrude(shape.body, shape.width, 0.05), glass: extrude(shape.glass, shape.width + 0.02, 0), wheel, lamp };
  }, [shape]);
  useEffect(() => () => Object.values(geometries).forEach(g => g.dispose()), [geometries]);
  // 바퀴 4개와 앞뒤 등 2개씩은 차 한 대의 기준 행렬에 국소 위치를 곱해 놓는다.
  const wheels = useMemo(() => cars.flatMap(car => [-1, 1].flatMap(f => [-1, 1].map(s => ({ car, f, s })))), [cars]);
  const lamps = useMemo(() => ({ head: cars.flatMap(car => [-1, 1].map(s => ({ car, s }))), tail: cars.flatMap(car => [-1, 1].map(s => ({ car, s }))) }), [cars]);
  const local = (car: ParkedCar, target: THREE.Matrix4, offset: THREE.Vector3) => placement(car, target).multiply(new THREE.Matrix4().makeTranslation(offset));
  const wheelMatrix = useMemo(() => (_: ParkedCar, target: THREE.Matrix4, i: number) => {
    const w = wheels[i]!; return local(w.car, target, new THREE.Vector3(w.f * shape.wheelBase / 2, shape.wheel, w.s * (shape.width / 2 - 0.11)));
  }, [wheels, shape]);
  const lampMatrix = (front: boolean) => (_: ParkedCar, target: THREE.Matrix4, i: number) => {
    const l = (front ? lamps.head : lamps.tail)[i]!, x = front ? Math.max(...shape.body.map(p => p[0])) - 0.05 : Math.min(...shape.body.map(p => p[0])) + 0.04;
    return local(l.car, target, new THREE.Vector3(x, kind === 'suv' ? 0.88 : 0.7, l.s * (shape.width / 2 - 0.3)));
  };
  const head = useMemo(() => lampMatrix(true), [lamps, shape]); // eslint-disable-line react-hooks/exhaustive-deps
  const tail = useMemo(() => lampMatrix(false), [lamps, shape]); // eslint-disable-line react-hooks/exhaustive-deps
  const paint = useMemo(() => (car: ParkedCar) => car.color, []);
  return <group>
    <Instances geometry={geometries.body} cars={cars} color={paint} material={materials.paint} matrix={placement} />
    <Instances geometry={geometries.glass} cars={cars} material={materials.glass} matrix={placement} />
    <Instances geometry={geometries.wheel} cars={wheels.map(w => w.car)} material={materials.tire} matrix={wheelMatrix} />
    <Instances geometry={geometries.lamp} cars={lamps.head.map(l => l.car)} material={materials.head} matrix={head} />
    <Instances geometry={geometries.lamp} cars={lamps.tail.map(l => l.car)} material={materials.tail} matrix={tail} />
  </group>;
}

export function ParkedCars({ bays, elevation }: { bays: ParkingBay[]; elevation: (x: number, z: number) => number }) {
  const cars = useMemo(() => parkedCars(bays, elevation), [bays, elevation]);
  const stops = useMemo(() => wheelStops(bays, elevation), [bays, elevation]);
  const fence = useMemo(() => musicParkingFence(elevation), [elevation]);
  const materials = useMemo(() => ({
    // 금속감을 낮춰야 흰색·은색 차가 하늘 반사에 묻혀 어둡게 보이지 않는다.
    paint: new THREE.MeshPhysicalMaterial({ roughness: 0.42, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#3a4d5a', roughness: 0.05, metalness: 0.1, clearcoat: 1, envMapIntensity: 1.6 }),
    tire: new THREE.MeshStandardMaterial({ color: '#191a1c', roughness: 0.85 }),
    head: new THREE.MeshStandardMaterial({ color: '#f2efe2', emissive: '#6d6a5c', roughness: 0.2 }),
    tail: new THREE.MeshStandardMaterial({ color: '#a3141b', emissive: '#3a0508', roughness: 0.3 }),
  }), []);
  useEffect(() => () => Object.values(materials).forEach(m => m.dispose()), [materials]);
  const byKind = useMemo(() => KINDS.map(kind => ({ kind, cars: cars.filter(c => c.kind === kind) })), [cars]);
  return <group>
    {byKind.map(({ kind, cars }) => <CarKind key={kind} kind={kind} cars={cars} materials={materials} />)}
    <Batch parts={stops} shadow={false} />
    <Batch parts={fence} metal />
  </group>;
}
