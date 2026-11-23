import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { COLORS } from '../config';
import { inside, type Point } from '../features/tour/network';
import { useCampusStore } from '../store/useCampusStore';

const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;

// 화면에서 시점을 돌려도 시설 안으로 배경 보행로가 비치지 않도록 평면에서 자른다.
function appendVisiblePath(points: number[], [x, z]: Point, [endX, endZ]: Point, surfaces: Point[][]) {
  const dx = endX - x, dz = endZ - z;
  const cuts = [0, 1];
  for (const ring of surfaces) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i]!, [bx, bz] = ring[(i + 1) % ring.length]!;
      const edgeX = bx - ax, edgeZ = bz - az;
      const det = cross(dx, dz, edgeX, edgeZ);
      if (Math.abs(det) < 1e-9) continue;
      const t = cross(ax - x, az - z, edgeX, edgeZ) / det;
      const u = cross(ax - x, az - z, dx, dz) / det;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
    }
  }
  cuts.sort((a, b) => a - b);
  const point = (t: number): Point => [x + t * dx, z + t * dz];
  for (let i = 1; i < cuts.length; i++) {
    const start = cuts[i - 1]!, end = cuts[i]!;
    if (end - start < 1e-9 || surfaces.some(ring => inside(point((start + end) / 2), ring))) continue;
    const [startX, startZ] = point(start), [endX, endZ] = point(end);
    points.push(startX, 0.25, startZ, endX, 0.25, endZ);
  }
}

export function Paths() {
  const graph = useCampusStore((s) => s.graph);
  const areas = useCampusStore((s) => s.campus?.outdoor_areas);

  const geometry = useMemo(() => {
    if (!graph) return null;
    const surfaces = (areas ?? []).filter((area) => area.kind !== 'gate').map((area) => area.footprint);
    const pos = new Map(graph.nodes.map((n) => [n.id, n]));
    const arr: number[] = [];
    for (const e of graph.edges) {
      const a = pos.get(e.a);
      const b = pos.get(e.b);
      if (a && b) appendVisiblePath(arr, [a.x, a.z], [b.x, b.z], surfaces);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return geo;
  }, [graph, areas]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={COLORS.path} transparent opacity={0.9} />
    </lineSegments>
  );
}
