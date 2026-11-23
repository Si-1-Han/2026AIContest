import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { DoubleSide, ExtrudeGeometry, Group, MathUtils, Shape, SphereGeometry } from 'three';
import { AUTO_TOUR_HATCH, AUTO_TOUR_NEST, AUTO_TOUR_LANDING, AUTO_TOUR_RETURN, AUTO_TOUR_STOPS, autoTourGrowth } from '../../features/tour/autoTour';
import { Batch, type Part } from './Batch';

export interface EaglePose {
  time: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
}

function featherGeometry() {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.28, 0.075, 0.82, 0.106, 1, 0.024);
  shape.bezierCurveTo(1.02, -0.048, 0.73, -0.13, 0.41, -0.102);
  shape.quadraticCurveTo(0.15, -0.066, 0, 0);
  const geometry = new ExtrudeGeometry(shape, { depth: 0.022, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 1, curveSegments: 5 });
  return geometry.rotateX(Math.PI / 2);
}

function wingGeometry() {
  const shape = new Shape();
  shape.moveTo(-0.08, 0.18);
  shape.bezierCurveTo(0.36, 0.39, 0.84, 0.27, 1.04, 0.18);
  shape.quadraticCurveTo(1.33, 0.14, 1.52, 0.04);
  shape.quadraticCurveTo(1.51, -0.35, 1.18, -0.45);
  shape.quadraticCurveTo(0.66, -0.52, 0.02, -0.28);
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth: 0.052, bevelThickness: 0.032, bevelSize: 0.039, bevelSegments: 2, curveSegments: 6 }).rotateX(Math.PI / 2);
}

type Vec = [number, number, number];
const plume = '#fffaf3', coverts = '#f2f4f9', featherTips = '#c2cde0';
const eyeBlue = '#194da9', eyeHighlight = '#4f8dde';
const primaryFeathers = Array.from({ length: 7 }, (_, i) => ({
  x: 0.98 + i * 0.064,
  z: -0.38 + i * 0.058,
  sweep: 1.04 - i * 0.19,
  length: 0.65 + i * 0.066,
}));
const secondaryFeathers = Array.from({ length: 7 }, (_, i) => ({ x: 0.17 + i * 0.12, z: -0.16 - i * 0.014 }));

export function TourEagle({ pose, companion = false }: { pose: RefObject<EaglePose>; companion?: boolean }) {
  const root = useRef<Group>(null);
  const leftWing = useRef<Group>(null), rightWing = useRef<Group>(null);
  const leftFeathers = useRef<Group>(null), rightFeathers = useRef<Group>(null);
  const tail = useRef<Group>(null), head = useRef<Group>(null), feet = useRef<Group>(null);
  const body = useRef<Group>(null), down = useRef<Group>(null), beak = useRef<Group>(null);
  const leftEye = useRef<Group>(null), rightEye = useRef<Group>(null);
  const sphere = useMemo(() => new SphereGeometry(1, 16, 12), []);
  const feather = useMemo(featherGeometry, []), wing = useMemo(wingGeometry, []);
  useEffect(() => () => { sphere.dispose(); feather.dispose(); wing.dispose(); }, [sphere, feather, wing]);
  const white = companion ? '#deb995' : plume;
  const accent = companion ? '#997353' : coverts;

  useFrame(() => {
    const bird = root.current!;
    const { time, x, y, z, pitch, yaw, roll } = pose.current;
    const pairTime = time - AUTO_TOUR_STOPS.studentUnion;
    const pairDuration = AUTO_TOUR_STOPS.theology - AUTO_TOUR_STOPS.studentUnion;
    if (companion ? pairTime < 0 || pairTime > pairDuration : time < AUTO_TOUR_HATCH + 0.15) {
      bird.visible = false;
      return;
    }
    bird.visible = true;
    const growth = autoTourGrowth(time);
    const chick = companion ? 0 : growth.chick;
    const firstSteps = MathUtils.smoothstep(time, 7.6, 9.1);
    const onRoof = time >= AUTO_TOUR_LANDING;
    const ending = MathUtils.smoothstep(time, AUTO_TOUR_LANDING + 0.25, AUTO_TOUR_LANDING + 2.05);
    const hatching = 1 - MathUtils.smoothstep(time, AUTO_TOUR_HATCH, 3.45);
    const outOfShell = MathUtils.smoothstep(time, 3.2, 4.2) * chick;
    const duet = MathUtils.smoothstep(pairTime, 0, 3);
    const leave = MathUtils.smoothstep(pairTime, pairDuration - 2.4, pairDuration);
    const flutter = Math.sin(time * 3.5);
    bird.position.set(
      x + (companion ? 7.8 - duet * 4.3 + leave * 4 : -0.04 * outOfShell),
      y - (companion ? 0.7 + 2.6 * (1 - duet) + leave * 2.6 : hatching * 0.19 + chick * 0.055),
      z + (companion ? -5.5 + duet * 3.65 + leave * 7 : 0.095 * outOfShell),
    );
    bird.rotation.set(pitch * (companion ? 0.5 : 1), yaw + (companion ? leave * 0.85 : 0), roll * (companion ? 0.55 : 1), 'YXZ');
    bird.scale.setScalar(companion ? Math.max(0.01, 0.38 * MathUtils.smoothstep(pairTime, 0, 1) * (1 - MathUtils.smoothstep(pairTime, pairDuration - 1.2, pairDuration))) : growth.size);
    const attack = Math.max(0, Math.sin(time * 0.93 + 1.35));
    const { climb, panorama, dive, pullOut } = AUTO_TOUR_RETURN;
    const climbing = MathUtils.smoothstep(time, climb, climb + 1.5) * (1 - MathUtils.smoothstep(time, panorama - 1, panorama + 0.6));
    const diving = MathUtils.smoothstep(time, dive, dive + 1.6) * (1 - MathUtils.smoothstep(time, pullOut - 1.8, pullOut));
    const flightFlap = ((0.2 + (1 - MathUtils.smoothstep(time, 29, 46)) * 0.58) * (0.3 + 0.7 * attack) + climbing * 0.49) * (1 - diving * 0.89);
    const earlyFlightTime = Math.min(time, climb);
    const flightPhase = earlyFlightTime * (10 - 0.045 * earlyFlightTime) + Math.max(0, time - climb) * 4.7;
    const flap = companion ? 0.48 * Math.sin(time * 13) : onRoof ? 0.31 - ending * 0.13 : growth.grounded
      ? 0.24 + 0.19 * Math.sin(time * 16) * Math.max(firstSteps, 0.42)
      : 0.07 + Math.sin(flightPhase) * flightFlap;
    const fold = companion ? 0.05 : onRoof ? 0.72 * (1 - ending) : growth.grounded ? 0.94 - firstSteps * 0.69 : 0.045 + Math.abs(flap) * 0.21 + diving * 0.5;
    leftWing.current!.rotation.set(0, -fold, -flap);
    rightWing.current!.rotation.set(0, fold, flap);
    leftFeathers.current!.scale.set(growth.wingLength, 1, 1 - 0.34 * chick);
    rightFeathers.current!.scale.copy(leftFeathers.current!.scale);
    tail.current!.scale.set(0.77 + growth.wingLength * 0.29, 1, growth.tailLength);
    tail.current!.position.z = -0.44 + 0.15 * chick;
    tail.current!.rotation.x = 0.04 + 0.12 * Math.abs(pitch) + ending * 0.15;
    body.current!.scale.set(1 + 0.27 * chick, 1 + 0.18 * chick, 1 - 0.34 * chick);
    const headSize = companion ? 1.18 : growth.headSize;
    head.current!.scale.set(headSize * (1 + 0.12 * chick), headSize * (1 + 0.14 * chick), headSize * (1 - 0.12 * chick));
    head.current!.position.set(0, 0.2 + 0.07 * chick, 0.45 - 0.16 * chick);
    head.current!.rotation.x = hatching * 0.29 + 0.055 * flutter;
    const gateTime = time - AUTO_TOUR_STOPS.gate;
    head.current!.rotation.y = 0.14 * flutter - 0.28 * Math.sin(MathUtils.clamp(gateTime / 5, 0, 1) * Math.PI);
    head.current!.rotation.z = 0.12 * chick * Math.sin(time * 2.4);
    beak.current!.scale.setScalar(1 - 0.32 * chick);
    leftEye.current!.scale.set(1, 1 + 0.16 * chick, 1 + 0.22 * chick);
    rightEye.current!.scale.copy(leftEye.current!.scale);
    if (down.current) {
      down.current.visible = chick > 0.01;
      down.current.scale.setScalar(chick);
    }
    const landing = MathUtils.smoothstep(time, AUTO_TOUR_LANDING - 1.2, AUTO_TOUR_LANDING);
    feet.current!.rotation.x = growth.grounded ? 0 : 1.18 * (1 - landing);
    feet.current!.scale.y = 1 - 0.52 * chick;
    feet.current!.visible = !companion;
  }, -1);

  const oval = (position: Vec, scale: Vec, color: string, rotation: Vec = [0, 0, 0]) => (
    <mesh geometry={sphere} position={position} scale={scale} rotation={rotation} castShadow>
      <meshStandardMaterial color={color} roughness={0.83} />
    </mesh>
  );
  const renderWing = (side: number, pivot: RefObject<Group | null>, feathers: RefObject<Group | null>) => (
    <group ref={pivot} position={[side * 0.22, 0.075, 0.14]}>
      <group scale={[side, 1, 1]}>
        <group ref={feathers}>
          <mesh geometry={wing} castShadow><meshStandardMaterial color={white} roughness={0.86} /></mesh>
          {primaryFeathers.map(({ x, z, sweep, length }, i) => (
            <mesh key={i} geometry={feather} position={[x, -0.035 + i * 0.007, z]} scale={[length, 1, 1.04]} rotation-y={sweep} castShadow>
              <meshStandardMaterial color={companion ? accent : i % 3 === 0 ? featherTips : coverts} roughness={0.85} />
            </mesh>
          ))}
          {secondaryFeathers.map(({ x, z }, i) => (
            <mesh key={i} geometry={feather} position={[x, -0.035, z]} scale={[0.44 + i * 0.035, 1, 1.05]} rotation-y={1.53 - i * 0.061} castShadow>
              <meshStandardMaterial color={i % 2 === 0 ? white : accent} roughness={0.86} />
            </mesh>
          ))}
          {secondaryFeathers.slice(1).map(({ x, z }, i) => (
            <mesh key={i} geometry={feather} position={[x, 0.035, z + 0.15]} scale={[0.32, 0.9, 0.81]} rotation-y={1.22 - i * 0.07} castShadow>
              <meshStandardMaterial color={accent} roughness={0.86} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
  return <group ref={root} visible={false}>
    <group ref={body}>
      {oval([0, 0, -0.02], [0.31, 0.27, 0.64], white, [-0.08, 0, 0])}
      {oval([0, -0.085, 0.22], [0.267, 0.225, 0.46], white)}
    </group>
    <group ref={head} position={[0, 0.2, 0.45]}>
      {oval([0, -0.07, -0.13], [0.215, 0.21, 0.296], white, [0.28, 0, 0])}
      {oval([0, 0, 0.025], [0.25, 0.222, 0.285], white)}
      {!companion && <group ref={down} position={[0, 0.11, 0]}>
        {oval([-0.12, 0.07, 0.03], [0.13, 0.109, 0.153], '#fff8ec', [0, 0, -0.28])}
        {oval([0.12, 0.081, 0.015], [0.13, 0.111, 0.153], '#fff8ec', [0, 0, 0.24])}
        {oval([-0.078, 0.118, -0.025], [0.080, 0.069, 0.093], white, [-0.25, 0, 0.27])}
        {oval([0.014, 0.139, -0.044], [0.075, 0.084, 0.087], white, [-0.31, 0, -0.29])}
        {oval([0.096, 0.106, -0.064], [0.076, 0.066, 0.09], white, [-0.2, 0, -0.31])}
      </group>}
      <group ref={beak} position={[0, -0.016, 0.268]}>
        {oval([0, 0, 0.029], [0.128, 0.094, 0.162], '#e7a846', [-0.16, 0, 0])}
        {oval([0, -0.052, 0.139], [0.077, 0.101, 0.059], '#cc841e', [0.26, 0, 0])}
      </group>
      {[-1, 1].map(side => <group key={side}>
        {oval([side * 0.192, 0.035, 0.099], [0.085, 0.117, 0.174], companion ? '#745b41' : eyeBlue, [0.08, side * 0.18, side * 0.13])}
        <group ref={side === -1 ? leftEye : rightEye} position={[side * 0.243, 0.036, 0.16]}>
          {oval([0, 0, 0], [0.038, 0.073, 0.083], companion ? '#ac865d' : eyeHighlight)}
          {oval([side * 0.029, 0.008, 0.004], [0.02, 0.051, 0.049], '#101b31')}
          {oval([side * 0.044, 0.024, 0.017], [0.011, 0.014, 0.015], '#ffffff')}
        </group>
        {oval([side * 0.202, 0.129, 0.155], [0.07, 0.036, 0.131], white, [-0.2, side * 0.18, 0])}
      </group>)}
    </group>
    {renderWing(-1, leftWing, leftFeathers)}
    {renderWing(1, rightWing, rightFeathers)}
    <group ref={tail} position={[0, -0.04, -0.44]}>
      {[-2, -1, 0, 1, 2].map(i => <mesh key={i} geometry={feather} castShadow position={[i * 0.072, 0.008 * Math.abs(i), 0]} scale={[0.88 - Math.abs(i) * 0.1, 1, 1.12]} rotation-y={Math.PI / 2 - i * 0.125}>
        <meshStandardMaterial color={i % 2 === 0 ? white : accent} roughness={0.9} />
      </mesh>)}
    </group>
    <group ref={feet} position={[0, -0.2, 0.05]}>
      {[-1, 1].map(side => <group key={side} position={[side * 0.14, 0, 0]}>
        {oval([0, -0.11, 0], [0.065, 0.18, 0.063], '#c99448', [-0.16, 0, 0])}
        {[-1, 0, 1].map(toe => <group key={toe} position={[toe * 0.041, -0.276, 0.058]} rotation-y={toe * 0.23}>
          {oval([0, 0, 0.05], [0.026, 0.027, 0.084], '#ce9b53')}
          {oval([0, -0.006, 0.124], [0.022, 0.026, 0.033], '#513f30', [0.39, 0, 0])}
        </group>)}
      </group>)}
    </group>
  </group>;
}

const sticks = ['#544035', '#76553b', '#957455', '#ac895f'];
const nestTwigs: Part[] = Array.from({ length: 84 }, (_, i) => {
  const a = i * 2.39996, ring = i % 3;
  const r = 0.38 + ring * 0.135 + Math.sin(i * 8.17) * 0.079;
  const radius = 0.015 + i % 4 * 0.004;
  return {
    p: [Math.cos(a) * r, 0.086 + ring * 0.084 + Math.cos(i * 6.5) * 0.039, Math.sin(a) * r * 0.87],
    s: [radius, 0.31 + i % 8 * 0.045, radius],
    color: sticks[i % sticks.length]!,
    ry: Math.PI / 2 - a + Math.sin(i) * 0.46,
    rz: Math.PI / 2 + Math.sin(i * 3.3) * 0.17,
  };
});

export function EagleNest({ pose }: { pose: RefObject<EaglePose> }) {
  const egg = useRef<Group>(null), lid = useRef<Group>(null), shell = useRef<Group>(null);
  useFrame(() => {
    const time = pose.current.time;
    const crack = MathUtils.smoothstep(time, AUTO_TOUR_HATCH, AUTO_TOUR_HATCH + 0.57);
    const settle = MathUtils.smoothstep(time, 2.85, 3.9);
    egg.current!.rotation.z = Math.sin(time * 24) * MathUtils.smoothstep(time, 0.8, 2) * (1 - crack) * 0.135;
    lid.current!.position.set(0.33 * crack, 0.15 * crack - 0.26 * settle, -0.21 * crack);
    lid.current!.rotation.set(-0.34 * crack - 1.35 * settle, 0.24 * crack, -0.42 * crack - 0.6 * settle);
    const shellShift = MathUtils.smoothstep(time, 3.05, 4.2);
    shell.current!.rotation.z = 0.56 * shellShift;
    shell.current!.position.set(-0.18 * shellShift, -0.05 * shellShift, -0.31 * shellShift);
  }, -1);

  return <group position={AUTO_TOUR_NEST}>
    <mesh position-y={0.115} scale={[0.54, 0.1, 0.46]} castShadow receiveShadow>
      <sphereGeometry args={[1, 16, 8]} /><meshStandardMaterial color="#654933" roughness={1} />
    </mesh>
    <Batch parts={nestTwigs} shape="cylinder" />
    <group ref={egg} position={[0, 0.38, 0]}>
      <group ref={shell}>
        <mesh scale={[0.25, 0.34, 0.242]} castShadow>
          <sphereGeometry args={[1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <meshStandardMaterial color="#e8decb" side={DoubleSide} roughness={0.77} />
        </mesh>
      </group>
      <group ref={lid}>
        <mesh scale={[0.25, 0.34, 0.242]} castShadow>
          <sphereGeometry args={[1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#f5ebdb" side={DoubleSide} roughness={0.77} />
        </mesh>
      </group>
    </group>
  </group>;
}
