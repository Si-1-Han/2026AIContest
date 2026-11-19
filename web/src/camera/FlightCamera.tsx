import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { tourElevation } from '../features/tour/terrain';
import { useCampusStore } from '../store/useCampusStore';
import { useTourStore } from '../store/useTourStore';

const flightKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const flightSpeed = 26;
const pitchLimit = Math.PI / 2 - 0.02;

export function FlightCamera() {
  const camera = useThree(s => s.camera);
  const campus = useCampusStore(s => s.campus)!;
  const look = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef(new Set<string>());
  const movement = useRef(new Vector3());
  const elevation = useMemo(() => tourElevation(campus), [campus]);
  const bounds = useMemo(() => {
    const xs = campus.boundary.map(([x]) => x);
    const zs = campus.boundary.map(([, z]) => z);
    const margin = 36;
    return { minX: Math.min(...xs) - margin, maxX: Math.max(...xs) + margin, minZ: Math.min(...zs) - margin, maxZ: Math.max(...zs) + margin };
  }, [campus]);

  useEffect(() => {
    const { network, nodeId, yaw } = useTourStore.getState();
    const node = network!.nodes[nodeId]!;
    look.current = { yaw, pitch: -0.28 };
    camera.position.set(node.x, (node.y ?? 0) + 28, node.z);
    if (!(camera instanceof PerspectiveCamera)) return;
    const { fov, near } = camera;
    camera.fov = 72;
    camera.near = 0.12;
    camera.updateProjectionMatrix();
    return () => {
      camera.fov = fov;
      camera.near = near;
      camera.updateProjectionMatrix();
    };
  }, [camera]);

  useEffect(() => {
    const surface = document.getElementById('flight-look-surface');
    if (!surface) return;
    const held = keys.current;
    let drag: { id: number; x: number; y: number; travel: number } | null = null;
    const rotate = (dx: number, dy: number) => {
      look.current.yaw -= dx * 0.0035;
      look.current.pitch = MathUtils.clamp(look.current.pitch - dy * 0.0035, -pitchLimit, pitchLimit);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!flightKeys.has(event.code) || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return;
      event.preventDefault();
      held.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => held.delete(event.code);
    const clearKeys = () => held.clear();
    const onLockChange = () => {
      if (document.pointerLockElement !== surface) clearKeys();
    };
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement === surface) rotate(event.movementX, event.movementY);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || document.pointerLockElement === surface) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, travel: 0 };
      surface.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.travel += Math.hypot(dx, dy);
      rotate(dx, dy);
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      const click = event.type === 'pointerup' && event.pointerType === 'mouse' && drag.travel < 4;
      drag = null;
      if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
      if (!click || !surface.requestPointerLock) return;
      // 포인터 잠금을 지원하지 않거나 허용하지 않는 환경에서도 드래그로 조작할 수 있다.
      try { void surface.requestPointerLock()?.catch(() => {}); } catch { /* 드래그로 계속 조작 */ }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', clearKeys);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMouseMove);
    surface.addEventListener('pointerdown', onPointerDown);
    surface.addEventListener('pointermove', onPointerMove);
    surface.addEventListener('pointerup', onPointerEnd);
    surface.addEventListener('pointercancel', onPointerEnd);
    surface.addEventListener('lostpointercapture', onPointerEnd);
    return () => {
      clearKeys();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', clearKeys);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      surface.removeEventListener('pointerdown', onPointerDown);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerup', onPointerEnd);
      surface.removeEventListener('pointercancel', onPointerEnd);
      surface.removeEventListener('lostpointercapture', onPointerEnd);
      if (document.pointerLockElement === surface) document.exitPointerLock();
    };
  }, []);

  useFrame((_, delta) => {
    const { yaw, pitch } = look.current;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    const held = keys.current;
    const ahead = Number(held.has('KeyW')) - Number(held.has('KeyS'));
    const sideways = Number(held.has('KeyD')) - Number(held.has('KeyA'));
    if (!ahead && !sideways) return;

    // 전후 이동은 카메라의 피치까지 따르고, 좌우 이동은 수평을 유지한다.
    const direction = movement.current.set(sideways, 0, -ahead).normalize().applyQuaternion(camera.quaternion);
    const position = camera.position;
    position.addScaledVector(direction, flightSpeed * Math.min(delta, 0.05));
    position.x = MathUtils.clamp(position.x, bounds.minX, bounds.maxX);
    position.z = MathUtils.clamp(position.z, bounds.minZ, bounds.maxZ);
    const floor = elevation(position.x, position.z) + 3;
    position.y = MathUtils.clamp(position.y, floor, 160);
  });
  return null;
}
