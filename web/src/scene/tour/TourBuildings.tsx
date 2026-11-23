import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { extrudeFootprint } from '../../lib/geometry';
import type { Building, CampusData } from '../../types/generated/campus';
import { Batch, type Part } from './Batch';
import { buildExteriorSpec, onEdge, themes, type Edge } from './exteriorSpec';
import { tourBuildingName } from '../../features/tour/buildingName';
import { useSurfaceMaps } from './materials';
import { pedimentGeometry, roofGeometry } from './detailGeometry';
import { useBlenderExterior } from './BlenderExterior';
import { buildingElevation } from '../../features/tour/elevationLevels';
import { roofCrossLightFinish } from './mainBuildingSpec';

function PitchedRoof({ x, z, y, length, width, angle, color }: { x: number; z: number; y: number; length: number; width: number; angle: number; color: string }) {
  const geometry = useMemo(() => {
    return roofGeometry(width, length);
  }, [length, width]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={[x, y, z]} rotation-y={angle + Math.PI / 2} castShadow receiveShadow><meshStandardMaterial color={color} roughness={0.9} /></mesh>;
}

function Pediment({ part }: { part: Part }) {
  const geometry = useMemo(() => pedimentGeometry(...part.s), [part]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={part.p} rotation-y={part.ry ?? 0} castShadow receiveShadow><meshStandardMaterial color={part.color} roughness={0.82} /></mesh>;
}

function Sign({ text, edge, y, width, dark = false, t = 0.5, offset = 0.28, compact = false }: { text: string; edge: Edge; y: number; width: number; dark?: boolean; t?: number; offset?: number; compact?: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = compact ? 2048 : 1024; canvas.height = compact ? 128 : 192;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = compact ? '#d4d1c2' : dark ? '#303d46' : '#e7e9de'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = compact ? '#997b42' : dark ? '#ecd09a' : '#244b70'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = compact ? 'bold 76px sans-serif' : 'bold 84px sans-serif'; ctx.fillText(text, canvas.width / 2, compact ? 64 : 82, canvas.width - 80);
    if (!compact) { ctx.font = '24px sans-serif'; ctx.fillText('HANSEI UNIVERSITY', 512, 150); }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
  }, [text, dark, compact]);
  useEffect(() => () => texture.dispose(), [texture]);
  const p = onEdge(edge, t, offset);
  return <mesh position={[p[0], y, p[1]]} rotation-y={Math.atan2(edge.nx, edge.nz)}>
    <planeGeometry args={[width, compact ? 0.44 : width * 192 / 1024]} /><meshStandardMaterial map={texture} roughness={0.85} />
  </mesh>;
}

function ProceduralBody({ b }: { b: Building }) {
  const theme = themes[b.id] ?? themes.main!;
  const wallMaps = useSurfaceMaps(b.id === 'music' || b.id === 'rodem' ? 'brick' : 'stone');
  const spec = useMemo(() => buildExteriorSpec(b), [b]);
  const geometries = useMemo(() => spec.levels.map(f => extrudeFootprint(f.outline, b.floor_height)), [spec, b.floor_height]);
  useEffect(() => () => geometries.forEach(g => g.dispose()), [geometries]);
  return <group>
    {geometries.map((g, i) => <mesh key={i} geometry={g} position-y={spec.levels[i]!.level * b.floor_height} castShadow receiveShadow><meshStandardMaterial color={b.id === 'graduate' && spec.levels[i]!.level < 2 ? '#475052' : theme.wall} {...wallMaps} normalScale={new THREE.Vector2(0.35, 0.35)} roughness={0.94} /></mesh>)}
    <Batch parts={spec.stone} /><Batch parts={spec.frames} metal /><Batch parts={spec.glass} glass /><Batch parts={spec.round} shape="cylinder" /><Batch parts={spec.cones} shape="cone" />
    {spec.roofCrossLights.map((part, i) => <mesh key={i} position={part.p} rotation-y={part.ry ?? 0}>
      <boxGeometry args={part.s} /><meshStandardMaterial color={part.color} {...roofCrossLightFinish} />
    </mesh>)}
    {spec.roofs.map((roof, i) => <PitchedRoof key={i} {...roof} />)}
    {spec.pediments.map((part, i) => <Pediment key={i} part={part} />)}
  </group>;
}

function Exterior({ b }: { b: Building }) {
  const model = useBlenderExterior(b);
  const spec = useMemo(() => buildExteriorSpec(b), [b]);
  const smallSign = b.id === 'rodem' || b.id === 'vision';
  return <group position-y={buildingElevation(b.id)}>
    {model ? <primitive object={model} position={[b.center[0], 0, b.center[1]]} dispose={null} /> : <ProceduralBody b={b} />}
    {b.id === 'main' ? <Sign text="한세대학교  HANSEI UNIVERSITY  본관" edge={spec.front} t={spec.entrance.t} offset={2.96} y={3.2} width={12.3} compact /> : <Sign text={tourBuildingName(b)} edge={spec.front} t={spec.entrance.t} y={b.id === 'graduate' ? 7.4 : smallSign ? 3.65 : 4.0} width={smallSign ? 3.4 : Math.min(spec.front.length * 0.8, 10)} dark={b.id === 'graduate' || b.id === 'theology'} />}
    {spec.musicFieldFront && <Sign text={tourBuildingName(b)} edge={spec.musicFieldFront} y={3.66} width={4.2} />}

  </group>;
}

export function designGemiBridgeParts(campus: CampusData): Part[] {
  if (!campus.buildings.some(b => b.id === 'design') || !campus.buildings.some(b => b.id === 'gemi')) return [];
  // 양쪽 외벽 안으로 양끝을 물려 기울어진 외벽과 슬래브 사이의 틈을 막는다.
  const designEnd = [-42.6, -39.4] as const;
  const gemiEnd = [-39.8, -24.2] as const;
  const dx = gemiEnd[0] - designEnd[0], dz = gemiEnd[1] - designEnd[1];
  const length = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx);
  const x = (designEnd[0] + gemiEnd[0]) / 2, z = (designEnd[1] + gemiEnd[1]) / 2;
  const width = 3.1, post = 0.15, sideOffset = (width - post) / 2;
  const parts: Part[] = [4.2, 7.4].map(y => ({
    p: [x, y, z], s: [length, 0.25, width], color: '#d0d7cc', ry: angle,
  }));
  for (const offset of [-sideOffset, sideOffset]) for (let i = 0; i < 6; i++) {
    const along = (i / 5 - 0.5) * (length - post);
    parts.push({
      p: [x + (dx * along - dz * offset) / length, 5.8, z + (dz * along + dx * offset) / length],
      s: [post, 3.2, post], color: '#849b9e', ry: angle,
    });
  }
  return parts;
}

export function TourBuildings({ campus }: { campus: CampusData }) {
  const bridge = useMemo(() => designGemiBridgeParts(campus), [campus]);
  return <group>{campus.buildings.map(b => <Exterior key={b.id} b={b} />)}<group position-y={buildingElevation('design')}><Batch parts={bridge} /></group></group>;
}
