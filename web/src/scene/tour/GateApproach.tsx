import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { gateWallSections } from '../../features/tour/gateWalls';
import { useSurfaceMaps } from './materials';

/** 정문 진입로 양쪽의 교명 석재 옹벽. 도로 경사를 따라 하부와 상단이 함께 오른다. */
export function GateApproach() {
  const sections = useMemo(gateWallSections, []), stone = useSurfaceMaps('stone');
  const texture = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 1536; c.height = 384;
    const ctx = c.getContext('2d')!;
    ctx.shadowColor = '#53656c'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#193e68'; ctx.textAlign = 'center'; ctx.font = '900 160px sans-serif'; ctx.fillText('한세대학교', 768, 190);
    ctx.font = 'bold 63px sans-serif'; ctx.fillText('HANSEI UNIVERSITY', 768, 298);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);
  const walls = useMemo(() => sections.map(s => {
    const g = new THREE.BoxGeometry(s.length, 3.3, 1);
    const p = g.getAttribute('position'), slope = (s.b[1] - s.a[1]) / s.length;
    // 기울어진 도로에서도 벽의 세로 모서리는 수직을 유지한다.
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + p.getX(i) * slope);
    const uv = g.getAttribute('uv'); for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getY(i));
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }), [sections]);
  useEffect(() => () => { texture.dispose(); walls.forEach(g => g.dispose()); }, [texture, walls]);
  return <group>{sections.map((s, i) => {
    const x = (s.a[0] + s.b[0]) / 2, z = (s.a[2] + s.b[2]) / 2, y = (s.a[1] + s.b[1]) / 2;
    const slope = (s.b[1] - s.a[1]) / s.length;
    return <group key={i} position={[x, y, z]} rotation-y={s.angle}>
      <mesh geometry={walls[i]} position-y={1.65} castShadow receiveShadow><meshStandardMaterial color="#d2d0c6" {...stone} roughness={0.9} /></mesh>
      <mesh position-y={3.36} rotation-z={Math.atan(slope)} castShadow><boxGeometry args={[Math.hypot(s.length, s.b[1] - s.a[1]), 0.14, 1.14]} /><meshStandardMaterial color="#aeb9b4" roughness={0.8} /></mesh>
      {s.length > 30 && <group position={[0, 1.85, s.side * 0.51]} rotation-y={s.side > 0 ? 0 : Math.PI}>
        <mesh><planeGeometry args={[15, 3.75]} /><meshStandardMaterial map={texture} transparent alphaTest={0.1} roughness={0.75} /></mesh>
      </group>}
      {[0.5, 1].map(height => <mesh key={height} position-y={3.4 + height} rotation-z={Math.atan(slope)}><boxGeometry args={[s.length, 0.045, 0.045]} /><meshStandardMaterial color="#aebbbd" metalness={0.65} roughness={0.3} /></mesh>)}
      {Array.from({ length: Math.ceil(s.length / 2.2) + 1 }, (_, j) => { const x = (j / Math.ceil(s.length / 2.2) - 0.5) * s.length; return <mesh key={j} position={[x, 3.9 + x * slope, 0]}><boxGeometry args={[0.045, 1.05, 0.045]} /><meshStandardMaterial color="#aebbbd" metalness={0.65} roughness={0.3} /></mesh>; })}
    </group>;
  })}</group>;
}
