import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

export interface Part {
  p: [number, number, number];
  s: [number, number, number];
  color: string;
  ry?: number;
  rz?: number;
}
/** 반복되는 창문·나무·차선은 종류별 인스턴스로 묶는다. */
export function Batch({ parts, shape = 'box', glass = false, metal = false, unlit = false, shadow = true }: { parts: Part[]; shape?: 'box' | 'sphere' | 'cylinder' | 'cone'; glass?: boolean; metal?: boolean; unlit?: boolean; shadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D(), color = new THREE.Color();
    parts.forEach((part, i) => {
      dummy.position.set(...part.p); dummy.scale.set(...part.s); dummy.rotation.set(0, part.ry ?? 0, part.rz ?? 0); dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix); ref.current!.setColorAt(i, color.set(part.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [parts]);
  if (!parts.length) return null;
  return <instancedMesh ref={ref} args={[undefined, undefined, parts.length]} castShadow={shadow && !unlit} receiveShadow={!unlit}>
    {shape === 'box' ? <boxGeometry /> : shape === 'sphere' ? <sphereGeometry args={[1, 24, 16]} /> : shape === 'cone' ? <coneGeometry args={[1, 1, 12]} /> : <cylinderGeometry args={[1, 1, 1, 12]} />}
    {unlit ? <meshBasicMaterial /> : glass ? <meshPhysicalMaterial roughness={0.16} metalness={0.05} clearcoat={1} clearcoatRoughness={0.1} ior={1.5} envMapIntensity={1.2} /> : <meshStandardMaterial roughness={metal ? 0.32 : 0.88} metalness={metal ? 0.65 : 0} />}
  </instancedMesh>;
}
