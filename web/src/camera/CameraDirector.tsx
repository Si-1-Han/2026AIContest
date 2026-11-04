import { CameraControls } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { bounds, explodedBase, totalHeight } from '../scene/layout';
import { useCampusStore } from '../store/useCampusStore';

/** 기본 시점: 남서쪽 상공에서 캠퍼스를 내려다본다 */
const HOME = { pos: [-230, 210, 250] as const, target: [0, 0, -20] as const };

/** 경로를 볼 때의 시선 방향 (남서쪽 위) */
const ROUTE_VIEW_DIR = new THREE.Vector3(-0.5, 0.8, 0.55).normalize();

/** 오른쪽 패널에 가리지 않도록 대상을 화면 왼쪽으로 밀어 두는 비율 */
const PANEL_SHIFT = 0.16;

/**
 * 카메라 연출 담당.
 * - 데이터가 준비되면 높은 상공에서 기본 시점으로 내려오는 인트로
 * - 건물 선택 → 층 분해된 건물 전체가 보이게 / 층 선택 → 그 층을 비스듬히 내려다보기
 * - 경로가 생기면 경로 전체가 보이도록 (같은 렌더에서 겹치면 경로가 우선)
 */
export function CameraDirector() {
  const controls = useRef<CameraControls>(null);
  const status = useCampusStore((s) => s.status);
  const selectedId = useCampusStore((s) => s.selectedId);
  const floorIndex = useCampusStore((s) => s.floorIndex);
  const route = useCampusStore((s) => s.route);
  const viewNonce = useCampusStore((s) => s.viewNonce);
  const focusPoint = useCampusStore((s) => s.focusPoint);
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

  // 건물·층 선택
  const hadSelection = useRef(false);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const b = building(selectedId);
    if (!b) {
      // 선택을 해제하면 기본 시점으로 (경로가 있으면 그대로)
      if (hadSelection.current && !useCampusStore.getState().route) {
        void c.setLookAt(...HOME.pos, ...HOME.target, true);
        void c.setFocalOffset(0, 0, 0, true);
      }
      hadSelection.current = false;
      return;
    }
    hadSelection.current = true;

    if (floorIndex !== null && b.floors[floorIndex]) {
      const f = b.floors[floorIndex]!;
      const { cx, cz, size } = bounds(f.outline);
      const y = explodedBase(b, floorIndex);
      const d = Math.max(size, 30);
      void c.setLookAt(cx - d * 0.3, y + d * 1.15 + 10, cz + d * 0.55, cx, y, cz, true);
      void c.setFocalOffset(d * PANEL_SHIFT, 0, 0, true);
      return;
    }
    const [x, z] = b.center;
    const h = b.floors.length ? explodedBase(b, b.floors.length) : totalHeight(b);
    const { size } = bounds(b.footprint);
    const d = Math.max(size * 1.1, 45) + h * 0.75;
    void c.setLookAt(x - d * 0.9, h * 0.55 + d * 0.55, z + d * 1.1, x, h * 0.45, z, true);
    void c.setFocalOffset(d * PANEL_SHIFT * 1.4, 0, 0, true);
  }, [selectedId, floorIndex, viewNonce, building]);

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
    // 왼쪽 길찾기 패널과 오른쪽 건물 패널 사이 가운데에 두기
    void c.setFocalOffset(0, 0, 0, true);
  }, [route]);

  // 단계 안내에서 고른 지점으로
  useEffect(() => {
    const c = controls.current;
    if (!c || !focusPoint) return;
    const [x, y, z] = focusPoint.point;
    void c.setLookAt(x - 40, y + 55, z + 50, x, y, z, true);
    void c.setFocalOffset(0, 0, 0, true);
  }, [focusPoint]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={15}
      maxDistance={1200}
      maxPolarAngle={Math.PI * 0.46}
      dollySpeed={0.6}
    />
  );
}

export const INITIAL_CAMERA = {
  position: [-600, 900, 900] as [number, number, number],
  target: HOME.target,
};
