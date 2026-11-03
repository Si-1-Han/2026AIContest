import { useMemo } from 'react';
import * as THREE from 'three';
import { COLORS } from '../config';
import { useCampusStore } from '../store/useCampusStore';

/** 보행로 그래프 전체를 얇은 선으로 표시 */
export function Paths() {
  const graph = useCampusStore((s) => s.graph);

  const geometry = useMemo(() => {
    if (!graph) return null;
    const pos = new Map(graph.nodes.map((n) => [n.id, n]));
    const arr: number[] = [];
    for (const e of graph.edges) {
      const a = pos.get(e.a);
      const b = pos.get(e.b);
      if (a && b) arr.push(a.x, 0.25, a.z, b.x, 0.25, b.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return geo;
  }, [graph]);

  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={COLORS.path} transparent opacity={0.9} />
    </lineSegments>
  );
}
