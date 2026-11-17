import * as THREE from 'three';

export function pedimentGeometry(width: number, height: number, depth: number) {
  const shape = new THREE.Shape([new THREE.Vector2(-width / 2, -height / 2), new THREE.Vector2(0, height / 2), new THREE.Vector2(width / 2, -height / 2)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); return g;
}
export function roofGeometry(width: number, length: number) {
  const shape = new THREE.Shape([new THREE.Vector2(-width / 2, 0), new THREE.Vector2(0, 1.5), new THREE.Vector2(width / 2, 0)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false }); g.translate(0, 0, -length / 2); return g;
}
