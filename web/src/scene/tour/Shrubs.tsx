import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
export interface ShrubPlacement { x: number; y: number; z: number; radius: number; height: number; seed: number }
export function shrubGeometry() {
  const geometry = new THREE.SphereGeometry(1, 48, 32), positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const ripple = 1 + 0.035 * Math.sin(x * 29 + z * 21) * Math.sin(y * 25 - z * 17) + 0.02 * Math.sin(x * 63 + z * 41);
    positions.setXYZ(i, x * ripple, (y * ripple + 1) / 2, z * ripple);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
}
export function shrubMaps() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d')!; c.fillStyle = '#234c25'; c.fillRect(0, 0, 512, 512);
  let seed = 9371; const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 3600; i++) {
    c.save(); c.translate(random() * 512, random() * 512); c.rotate(random() * Math.PI * 2);
    const w = 2 + random() * 3, h = 4 + random() * 4;
    c.fillStyle = ['#467d32', '#5c8a3a', '#376c2b', '#718e43', '#285c2b'][Math.floor(random() * 5)]!;
    c.beginPath(); c.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#92a368'; c.lineWidth = 0.45; c.beginPath(); c.moveTo(0, -h * 0.75); c.lineTo(0, h * 0.75); c.stroke(); c.restore();
  }
  const image = c.getImageData(0, 0, 512, 512), normal = new Uint8Array(512 * 512 * 4);
  const value = (x: number, y: number) => image.data[((y + 512) % 512 * 512 + (x + 512) % 512) * 4 + 1]! / 255;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4;
    const n = new THREE.Vector3((value(x - 1, y) - value(x + 1, y)) * 2, (value(x, y - 1) - value(x, y + 1)) * 2, 1).normalize();
    normal[i] = (n.x * 0.5 + 0.5) * 255; normal[i + 1] = (n.y * 0.5 + 0.5) * 255; normal[i + 2] = (n.z * 0.5 + 0.5) * 255; normal[i + 3] = 255;
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.DataTexture(normal, 512, 512); normalMap.needsUpdate = true;
  for (const texture of [map, normalMap]) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2, 1.5); texture.anisotropy = 8; }
  return { map, normalMap };
}
export function Shrubs({ shrubs }: { shrubs: ShrubPlacement[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null), geometry = useMemo(shrubGeometry, []), maps = useMemo(shrubMaps, []);
  useEffect(() => () => { geometry.dispose(); maps.map.dispose(); maps.normalMap.dispose(); }, [geometry, maps]);
  useLayoutEffect(() => {
    const matrix = new THREE.Object3D(), color = new THREE.Color();
    shrubs.forEach((p, i) => {
      matrix.position.set(p.x, p.y, p.z); matrix.scale.set(p.radius, p.height, p.radius * (0.9 + p.seed * 0.12)); matrix.rotation.y = p.seed * 19; matrix.updateMatrix();
      mesh.current!.setMatrixAt(i, matrix.matrix); mesh.current!.setColorAt(i, color.setHSL(0.27 + p.seed * 0.025, 0.28, 0.72 + p.seed * 0.12));
    });
    mesh.current!.instanceMatrix.needsUpdate = true; mesh.current!.instanceColor!.needsUpdate = true; mesh.current!.computeBoundingSphere();
  }, [shrubs]);
  return <instancedMesh ref={mesh} args={[geometry, undefined, shrubs.length]} castShadow receiveShadow><meshStandardMaterial {...maps} normalScale={new THREE.Vector2(0.38, 0.38)} roughness={0.94} /></instancedMesh>;
}
