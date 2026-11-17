import * as THREE from 'three';
import type { Polygon } from 'polygon-clipping';

/** 외곽과 안쪽 구멍을 함께 유지하는 닫힌 대지 구조물. 상판과 옹벽은 재질을 나눈다. */
export function siteSolid(polygon: Polygon, height: (x: number, z: number) => number, base: number) {
  const [outer, ...holes] = polygon;
  const shape = new THREE.Shape(outer!.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes = holes.map(ring => new THREE.Path(ring.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, p.getY(i) > 0.5 ? height(x, z) : base); uv.setXY(i, x, z);
  }
  g.setIndex(Array.from({ length: p.count }, (_, i) => i));
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
