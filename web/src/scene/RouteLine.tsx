import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { COLORS } from '../config';
import { useCampusStore } from '../store/useCampusStore';

const LIFT = 1.2; // 지면 위로 띄우는 높이
const RUNNER_SPEED = 40; // m/s (연출용)

/** 길찾기 결과: 흐르는 발광 경로 + 경로를 따라 달리는 빛 + 출발/도착 표시 */
export function RouteLine() {
  const route = useCampusStore((s) => s.route);

  const { points, curve } = useMemo(() => {
    if (!route) return { points: null, curve: null };
    const pts = route.points.map(([x, y, z]) => new THREE.Vector3(x, y + LIFT, z));
    return { points: pts, curve: pts.length > 1 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.2) : null };
  }, [route]);

  const lineRef = useRef<{ material: { dashOffset: number } } | null>(null);
  const runner = useRef<THREE.Mesh>(null);
  const progress = useRef(0);

  useFrame((_, delta) => {
    if (lineRef.current) lineRef.current.material.dashOffset -= delta * 12;
    if (runner.current && curve && route) {
      progress.current = (progress.current + (delta * RUNNER_SPEED) / Math.max(route.length, 1)) % 1;
      runner.current.position.copy(curve.getPointAt(progress.current));
    }
  });

  if (!route || !points || points.length < 2) return null;
  const start = points[0]!;
  const end = points[points.length - 1]!;

  return (
    <group>
      {/* 바닥의 넓고 흐린 광선 + 위의 흐르는 점선 */}
      <Line points={points} color={COLORS.route} lineWidth={10} transparent opacity={0.18} toneMapped={false} />
      <Line
        ref={lineRef as never}
        points={points}
        color={COLORS.route}
        lineWidth={4}
        dashed
        dashSize={5}
        gapSize={3}
        toneMapped={false}
      />
      <mesh ref={runner}>
        <sphereGeometry args={[1.6, 16, 16]} />
        <meshBasicMaterial color={'#e9fffa'} toneMapped={false} />
      </mesh>
      <Marker position={start} color={COLORS.origin} />
      <Marker position={end} color={COLORS.route} />
    </group>
  );
}

function Marker({ position, color }: { position: THREE.Vector3; color: string }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const s = 1 + ((clock.elapsedTime * 0.8) % 1) * 2.5;
    ring.current.scale.setScalar(s);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = 1 - ((clock.elapsedTime * 0.8) % 1);
  });
  return (
    <group position={position}>
      <mesh position-y={6}>
        <cylinderGeometry args={[0.35, 0.35, 12, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[2.2, 2.8, 32]} />
        <meshBasicMaterial color={color} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}
