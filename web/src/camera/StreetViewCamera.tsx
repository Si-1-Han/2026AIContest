import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTourStore } from '../store/useTourStore';

/** 카메라 위치는 연결된 인접 지점 사이에서만 이동하며 시선은 드래그로 독립 조작한다. */
export function StreetViewCamera() {
  const { camera } = useThree();
  const targetId = useTourStore(s => s.targetId);
  const nodeId = useTourStore(s => s.nodeId);
  const yaw = useTourStore(s => s.yaw);
  const positionNonce = useTourStore(s => s.positionNonce);
  const look = useRef({ yaw, pitch: 0, desiredYaw: yaw });
  const motion = useRef<{ points: THREE.Vector3[]; lengths: number[]; length: number; elapsed: number; duration: number; manual: boolean } | null>(null);
  const systemYaw = useRef(yaw);
  const reduced = useRef(false);
  useEffect(() => { reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }, []);
  useEffect(() => {
    const c = camera as THREE.PerspectiveCamera, fov = c.fov, near = c.near;
    c.fov = 72; c.near = 0.12; c.updateProjectionMatrix();
    return () => { c.fov = fov; c.near = near; c.updateProjectionMatrix(); };
  }, [camera]);
  useEffect(() => {
    if (motion.current && Math.abs(yaw - systemYaw.current) > 0.0001) motion.current.manual = true;
    look.current.desiredYaw = yaw;
  }, [yaw]);
  useEffect(() => {
    const s = useTourStore.getState(), n = s.network!.nodes[s.nodeId]!;
    motion.current = null; camera.position.set(n.x, (n.y ?? 0) + 1.8, n.z);
    systemYaw.current = s.yaw; look.current = { yaw: s.yaw, desiredYaw: s.yaw, pitch: 0 };
  }, [camera, positionNonce]);
  useEffect(() => {
    const s = useTourStore.getState(), n = s.network!.nodes[nodeId]!;
    if (targetId) {
      const next = s.network!.nodes[s.travel[1]!]!;
      const targetYaw = Math.atan2(-(next.x - n.x), -(next.z - n.z));
      systemYaw.current = targetYaw;
      useTourStore.getState().look(targetYaw);
      const points = s.travel.map(id => { const p = s.network!.nodes[id]!; return new THREE.Vector3(p.x, (p.y ?? 0) + 1.8, p.z); });
      const lengths = [0];
      for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1]! + points[i]!.distanceTo(points[i - 1]!));
      const length = lengths.at(-1)!;
      motion.current = { points, lengths, length, elapsed: 0, duration: reduced.current ? 0 : Math.max(0.65, length / 18), manual: false };
    }
  }, [camera, targetId, nodeId]);
  useEffect(() => {
    const surface = document.getElementById('tour-look-surface');
    if (!surface) return;
    let pointer: { id: number; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as Element).closest('[data-tour-ui]')) return;
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      surface.setPointerCapture(e.pointerId); surface.style.cursor = 'grabbing';
    };
    const move = (e: PointerEvent) => {
      if (!pointer || pointer.id !== e.pointerId) return;
      if (motion.current) motion.current.manual = true;
      look.current.yaw -= (e.clientX - pointer.x) * 0.004;
      look.current.desiredYaw = look.current.yaw;
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch - (e.clientY - pointer.y) * 0.0035, -1.05, 1.05);
      pointer.x = e.clientX; pointer.y = e.clientY;
      useTourStore.getState().look(look.current.yaw);
    };
    const up = () => { if (pointer && surface.hasPointerCapture(pointer.id)) surface.releasePointerCapture(pointer.id); pointer = null; surface.style.cursor = 'grab'; };
    const key = (e: KeyboardEvent) => {
      if ((e.target as Element).closest('input, select, textarea')) return;
      const amount = e.key === 'ArrowLeft' ? 0.18 : e.key === 'ArrowRight' ? -0.18 : 0;
      if (amount) { e.preventDefault(); useTourStore.getState().look(look.current.yaw + amount); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); look.current.pitch = THREE.MathUtils.clamp(look.current.pitch + (e.key === 'ArrowUp' ? 0.1 : -0.1), -1.05, 1.05); }
    };
    surface.addEventListener('pointerdown', down); surface.addEventListener('pointermove', move); surface.addEventListener('pointerup', up); surface.addEventListener('pointercancel', up); surface.addEventListener('lostpointercapture', up); window.addEventListener('keydown', key);
    return () => { surface.removeEventListener('pointerdown', down); surface.removeEventListener('pointermove', move); surface.removeEventListener('pointerup', up); surface.removeEventListener('pointercancel', up); surface.removeEventListener('lostpointercapture', up); window.removeEventListener('keydown', key); };
  }, []);
  const project = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    const m = motion.current;
    if (m) {
      m.elapsed += Math.min(dt, 0.1);
      const t = m.duration ? Math.min(1, m.elapsed / m.duration) : 1;
      const d = t * t * (3 - 2 * t) * m.length;
      let i = 1; while (i < m.lengths.length - 1 && m.lengths[i]! < d) i++;
      camera.position.lerpVectors(m.points[i - 1]!, m.points[i]!, (d - m.lengths[i - 1]!) / (m.lengths[i]! - m.lengths[i - 1]! || 1));
      if (!m.manual) look.current.desiredYaw = Math.atan2(-(m.points[i]!.x - m.points[i - 1]!.x), -(m.points[i]!.z - m.points[i - 1]!.z));
      if (t >= 1) {
        if (!m.manual) { systemYaw.current = look.current.desiredYaw; useTourStore.getState().look(systemYaw.current); }
        motion.current = null; useTourStore.getState().arrive();
      }
    }
    const l = look.current;
    const diff = Math.atan2(Math.sin(l.desiredYaw - l.yaw), Math.cos(l.desiredYaw - l.yaw));
    l.yaw += diff * (1 - Math.exp(-10 * dt));
    camera.rotation.set(l.pitch, l.yaw, 0, 'YXZ'); camera.updateMatrixWorld();
    const s = useTourStore.getState(), n = s.network!.nodes[s.nodeId]!;
    for (const id of n.neighbors) {
      const button = document.getElementById(`tour-node-${id}`);
      if (!button) continue;
      project.current.set(Number(button.dataset.x), Number(button.dataset.y ?? 0.2), Number(button.dataset.z)).project(camera);
      const v = project.current;
      const visible = !s.targetId && v.z < 1 && v.z > -1 && Math.abs(v.x) < 0.92 && v.y > -0.72 && v.y < 0.8;
      button.style.visibility = visible ? 'visible' : 'hidden';
      button.style.left = `${(v.x + 1) * 50}%`; button.style.top = `${(1 - v.y) * 50}%`;
    }
  });
  return null;
}
