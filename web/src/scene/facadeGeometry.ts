import * as THREE from 'three';

export type FacadeEdge = {
  start: [number, number];
  dx: number;
  dz: number;
  length: number;
  nx: number;
  nz: number;
};

export function placeFacadePart(
  edge: FacadeEdge, source: THREE.BufferGeometry,
  [along, y, outward]: [number, number, number], color: THREE.Color, slope = 0,
) {
  const geometry = colorFacadeGeometry(source, color);
  geometry.rotateZ(slope);
  geometry.rotateY(-Math.atan2(edge.dz, edge.dx));
  geometry.translate(edge.start[0] + along * edge.dx + outward * edge.nx, y,
    edge.start[1] + along * edge.dz + outward * edge.nz);
  return geometry;
}

export function colorFacadeGeometry(source: THREE.BufferGeometry, color: THREE.Color) {
  const geometry = source.index ? source.toNonIndexed() : source;
  if (geometry !== source) source.dispose();
  geometry.deleteAttribute('uv');
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
