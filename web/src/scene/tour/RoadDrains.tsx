import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Part } from './Batch';

/** Blender의 베벨·실제 격자 틈·체결 볼트를 가진 배수구를 인스턴싱한다. */
export function RoadDrains({ parts }: { parts: Part[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const [model, setModel] = useState<THREE.BufferGeometry | null>(null);
  const fallback = useMemo(() => {
    const slats = Array.from({ length: 9 }, (_, i) => new THREE.BoxGeometry(0.032, 0.018, 0.26).translate((i - 4) * 0.085, -0.008, 0));
    const g = mergeGeometries(slats)!; slats.forEach(g => g.dispose()); return g;
  }, []);
  useEffect(() => () => fallback.dispose(), [fallback]);
  useEffect(() => {
    let cancelled = false, owned: THREE.BufferGeometry | null = null;
    void new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/tour/drain-grate.glb`).then(gltf => {
      const geometries: THREE.BufferGeometry[] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        // 재질은 공통 금속으로 렌더링하고 메시의 실제 베벨 법선을 유지한다.
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
        geometries.push(g.index ? g.toNonIndexed() : g);
        if (g.index) g.dispose();
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
      const merged = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
      if (!merged) return;
      if (cancelled) { merged.dispose(); return; }
      owned = merged; setModel(merged);
    }).catch(() => { /* 로딩 중과 실패 시에도 격자 메시를 유지한다. */ });
    return () => { cancelled = true; owned?.dispose(); };
  }, []);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    parts.forEach((p, i) => {
      dummy.position.set(...p.p); dummy.scale.set(...p.s); dummy.rotation.set(0, p.ry ?? 0, p.rz ?? 0); dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true; ref.current.computeBoundingSphere();
  }, [parts, model]);
  return parts.length ? <instancedMesh ref={ref} args={[model ?? fallback, undefined, parts.length]} receiveShadow>
    <meshStandardMaterial color="#74837a" roughness={0.65} metalness={0.65} />
  </instancedMesh> : null;
}
