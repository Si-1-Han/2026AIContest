import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSurfaceMaps } from './materials';
import { FOUNTAIN_CENTER, FOUNTAIN_SIGN, FOUNTAIN_LEVEL, FOUNTAIN_RADIUS } from '../../features/tour/fountainSite';

export { FOUNTAIN_CENTER } from '../../features/tour/fountainSite';
export function CampusFountain() {
  const stone = useSurfaceMaps('stone');
  const ripple = useRef<THREE.Mesh>(null);
  const basin = useMemo(() => {
    const outer = new THREE.Shape(); outer.absarc(0, 0, FOUNTAIN_RADIUS, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, FOUNTAIN_RADIUS - 0.4, 0, Math.PI * 2, true); outer.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(outer, { depth: 0.44, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2, steps: 1, curveSegments: 64 });
    geometry.rotateX(-Math.PI / 2); return geometry;
  }, []);
  const sign = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 384;
    const ctx = canvas.getContext('2d')!; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 280px sans-serif';
    ctx.shadowColor = '#35413c'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 7; ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#faf9ed'; ctx.fillText('한세대학교', 1024, 178, 1950);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
  }, []);
  useEffect(() => () => { basin.dispose(); sign.dispose(); }, [basin, sign]);
  useFrame(({ clock }) => { if (ripple.current) { const t = (clock.elapsedTime * 0.15) % 1; ripple.current.scale.setScalar(0.55 + t * 0.5); (ripple.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.23; } });
  return <group position={[FOUNTAIN_CENTER[0], FOUNTAIN_LEVEL, FOUNTAIN_CENTER[1]]}>
    <mesh position-y={0.05} receiveShadow><cylinderGeometry args={[FOUNTAIN_RADIUS + 0.2, FOUNTAIN_RADIUS + 0.2, 0.1, 96]} /><meshStandardMaterial color="#b3b7ad" {...stone} roughness={0.95} /></mesh>
    <mesh geometry={basin} position-y={0.1} castShadow receiveShadow><meshStandardMaterial color="#626961" {...stone} roughness={0.75} /></mesh>
    <mesh rotation-x={-Math.PI / 2} position-y={0.42} receiveShadow><circleGeometry args={[FOUNTAIN_RADIUS - 0.4, 96]} /><meshPhysicalMaterial color="#527e82" roughness={0.17} metalness={0.1} transparent opacity={0.88} clearcoat={1} /></mesh>
    <mesh ref={ripple} rotation-x={-Math.PI / 2} position-y={0.435}><ringGeometry args={[2.1, 2.14, 96]} /><meshBasicMaterial color="#b3d1cc" transparent opacity={0.18} depthWrite={false} /></mesh>
    <group position={[FOUNTAIN_SIGN.x, 0, FOUNTAIN_SIGN.z]} rotation-y={FOUNTAIN_SIGN.rotation}>
      <mesh position={[0, 1.03, 0.02]} castShadow><planeGeometry args={[6.4, 1.2]} /><meshStandardMaterial map={sign} transparent alphaTest={0.4} side={THREE.FrontSide} /></mesh>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow><boxGeometry args={[6.7, 0.5, 0.35]} /><meshStandardMaterial color="#a5afa0" {...stone} roughness={0.85} /></mesh>
      {[-2.5, 0, 2.5].map(x => <mesh key={x} position={[x, 0.57, -0.04]}><boxGeometry args={[0.055, 0.65, 0.055]} /><meshStandardMaterial color="#5e655e" metalness={0.5} roughness={0.5} /></mesh>)}
    </group>
  </group>;
}
