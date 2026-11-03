import { CameraControls } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildingHeight } from '../lib/geometry';
import { useCampusStore } from '../store/useCampusStore';

/** 기본 시점: 남서쪽 상공에서 캠퍼스를 내려다본다 */
const HOME = { pos: [-230, 210, 250] as const, target: [0, 0, -20] as const };

/** 경로를 볼 때의 시선 방향 (남서쪽 위) */
const ROUTE_VIEW_DIR = new THREE.Vector3(-0.5, 0.8, 0.55).normalize();

/**
 * 카메라 연출 담당.
 * - 데이터가 준비되면 높은 상공에서 기본 시점으로 내려오는 인트로
 * - 건물 선택 시 그 건물로 비행
 * - 경로가 생기면 경로 전체가 보이도록 화면 맞춤
 */
export function CameraDirector() {
  const controls = useRef<CameraControls>(null);
  const status = useCampusStore((s) => s.status);
  const selectedId = useCampusStore((s) => s.selectedId);
  const route = useCampusStore((s) => s.route);
  const building = useCampusStore((s) => s.building);

  // 인트로: 데이터 준비 후 하강
  useEffect(() => {
    const c = controls.current;
    if (!c || status !== 'ready') return;
    c.smoothTime = 1.4;
    void c.setLookAt(...HOME.pos, ...HOME.target, true).then(() => {
      c.smoothTime = 0.6;
    });
  }, [status]);

  // 건물 선택 → 비행 (경로가 있으면 경로 맞춤이 우선)
  useEffect(() => {
    const c = controls.current;
    const b = building(selectedId);
    if (!c || !b || route) return;
    const [x, z] = b.center;
    const h = buildingHeight(b.levels, b.floor_height);
    void c.setLookAt(x - 60, h + 55, z + 75, x, h * 0.4, z, true);
  }, [selectedId, route, building]);

  // 경로 → 경로 전체가 보이도록 비스듬한 상공에서 내려다본다
  useEffect(() => {
    const c = controls.current;
    if (!c || !route) return;
    const sphere = new THREE.Box3()
      .setFromPoints(route.points.map((p) => new THREE.Vector3(...p)))
      .getBoundingSphere(new THREE.Sphere());
    const dist = Math.max(sphere.radius * 3.2, 140);
    const eye = ROUTE_VIEW_DIR.clone().multiplyScalar(dist).add(sphere.center);
    const { x, y, z } = sphere.center;
    void c.setLookAt(eye.x, eye.y, eye.z, x, y, z, true);
  }, [route]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={30}
      maxDistance={1200}
      maxPolarAngle={Math.PI * 0.46}
      dollySpeed={0.6}
    />
  );
}

export const INITIAL_CAMERA = { position: [-600, 900, 900] as [number, number, number], target: HOME.target };
