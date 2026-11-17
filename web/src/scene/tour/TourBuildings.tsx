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
    {spec.roofs.map((roof, i) => <PitchedRoof key={i} {...roof} />)}
    {spec.pediments.map((part, i) => <Pediment key={i} part={part} />)}
  </group>;
}

function Exterior({ b }: { b: Building }) {
  const model = useBlenderExterior(b);
  const spec = useMemo(() => buildExteriorSpec(b), [b]);
  return <group position-y={buildingElevation(b.id)}>
    {model ? <primitive object={model} position={[b.center[0], 0, b.center[1]]} dispose={null} /> : <ProceduralBody b={b} />}
    {b.id === 'main' ? <Sign text="한세대학교  HANSEI UNIVERSITY  본관" edge={spec.front} t={spec.entrance.t} offset={2.96} y={3.2} width={12.3} compact /> : <Sign text={tourBuildingName(b)} edge={spec.front} t={spec.entrance.t} y={b.id === 'graduate' ? 7.4 : 4.0} width={Math.min(spec.front.length * 0.8, 10)} dark={b.id === 'graduate' || b.id === 'theology'} />}

  </group>;
}

export function TourBuildings({ campus }: { campus: CampusData }) {
  const bridge = useMemo(() => {
    const parts: Part[] = [];
    // 사진에서 확인된 디자인관 ↔ GEMI관의 공중 연결통로.
    const a: [number, number] = [-42, -36], b: [number, number] = [-40, -25];
    const x = (a[0] + b[0]) / 2, z = (a[1] + b[1]) / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]), angle = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (const y of [4.2, 7.4]) parts.push({ p: [x, y, z], s: [len, 0.25, 3.1], color: '#d0d7cc', ry: angle });
    for (const offset of [-1.5, 1.5]) for (let i = 0; i < 6; i++) parts.push({ p: [a[0] + (b[0] - a[0]) * i / 5 + offset, 5.8, a[1] + (b[1] - a[1]) * i / 5], s: [0.15, 3.2, 0.15], color: '#849b9e' });
    return parts;
  }, []);
  return <group>{campus.buildings.map(b => <Exterior key={b.id} b={b} />)}<group position-y={buildingElevation('design')}><Batch parts={bridge} /></group></group>;
}
