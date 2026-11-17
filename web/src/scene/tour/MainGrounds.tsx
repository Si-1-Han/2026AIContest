import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import clipping, { type MultiPolygon } from 'polygon-clipping';
import { MAIN_ENTRANCE, MAIN_ENTRY_BASE, mainEntryLocal } from '../../features/tour/mainEntrance';
import { accessStrip, MAIN_FRONT_PLAZA, MAIN_GARDEN, MAIN_GARDEN_LEVEL, MAIN_FIRST_FLOOR, MAIN_STAIR_PLANTERS, mainPlanterHeight, MAIN_SITE_PATHS, MAIN_WALK_SURFACES, mainAccessWidth, isMainAccessStair, mainSitePoint } from '../../features/tour/mainBuildingAccess';
import { siteSolid } from './siteGeometry';
import { Batch, type Part } from './Batch';
import { Trees } from './Trees';
import { Shrubs, type ShrubPlacement } from './Shrubs';
import type { TreePlacement } from './scenery';
import { useSurfaceMaps } from './materials';

const angle = -Math.atan2(MAIN_ENTRANCE.uz, MAIN_ENTRANCE.ux);
type Node = { x: number; y: number; z: number; id: string };
export function mainAccessDecks(roadMask: MultiPolygon = []) {
  const upper = MAIN_WALK_SURFACES[1]!;
  const gardenJunction = clipping.union([MAIN_GARDEN], ...upper.slice(1).map((b, i) => [accessStrip(upper[i]!, b, mainAccessWidth(upper))]));
  return MAIN_WALK_SURFACES.flatMap(path => path.slice(1).flatMap((b, i) => {
    const a = path[i]!, dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    if (isMainAccessStair(a.id, b.id)) return [];
    const strip = accessStrip(a, b, mainAccessWidth(path));
    const gardenLink = path.some(p => p.id === 'tour_main_garden');
    const polygons = clipping.difference([strip], roadMask, gardenLink ? gardenJunction : []);
    return polygons.map(([outer, ...holes]) => {
      const height = (x: number, z: number) => {
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
        return a.y + (b.y - a.y) * t + 0.045;
      };
      // 진입로를 지면까지 채우고 콘크리트 옹벽으로 닫아 공중에 뜬 다리를 없앤다.
      const g = siteSolid([outer!, ...holes], height, MAIN_FIRST_FLOOR - 0.35);
      g.userData.surface = path.some(p => p.id.includes('upper_')) && !path.some(p => p.id === 'tour_main_garden') ? 'asphalt' : 'paving';
      g.computeVertexNormals(); return g;
    });
  }));
}
export function makeMainGroundsParts() {
  const stone: Part[] = [], metal: Part[] = [], wood: Part[] = [], hedges: Part[] = [], trees: TreePlacement[] = [], shrubs: ShrubPlacement[] = [];
  const point = (u: number, v: number, y: number): Part['p'] => { const [x, z] = mainSitePoint(u, v); return [x, y, z]; };
  const box = (list: Part[], u: number, v: number, y: number, s: Part['s'], color: string, ry = angle) => list.push({ p: point(u, v, y), s, color, ry });
  const rail = (a: Node, b: Node, offset: number) => {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ry = -Math.atan2(dz, dx);
    const nx = -dz / len * offset, nz = dx / len * offset, dy = b.y - a.y;
    for (const h of [0.53, 1.02]) metal.push({ p: [(a.x + b.x) / 2 + nx, (a.y + b.y) / 2 + h, (a.z + b.z) / 2 + nz], s: [Math.hypot(len, dy), 0.045, 0.045], color: '#afb9b7', ry, rz: Math.atan2(dy, len) });
    for (let i = 0, count = Math.ceil(len / 1.2); i <= count; i++) metal.push({ p: [a.x + dx * i / count + nx, a.y + dy * i / count + 0.5, a.z + dz * i / count + nz], s: [0.045, 1, 0.045], color: '#afb9b7' });
  };
  for (const path of MAIN_SITE_PATHS.slice(1)) for (let k = 1; k < path.length; k++) {
    const a = path[k - 1]!, b = path[k]!, dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ry = -Math.atan2(dz, dx);
    if (isMainAccessStair(a.id, b.id)) {
      const count = Math.ceil(Math.abs(b.y - a.y) / 0.15), base = Math.min(a.y, b.y) - 0.12;
      for (let i = 0; i < count; i++) {
        const top = a.y + (b.y - a.y) * (b.y > a.y ? (i + 1) / count : i / count);
        stone.push({ p: [a.x + dx * (i + 0.5) / count, (base + top) / 2 + 0.04, a.z + dz * (i + 0.5) / count], s: [len / count + 0.008, top - base, mainAccessWidth(path)], color: '#c4c9c5', ry });
      }
    }
    // 공원과 연결되는 평지 쪽은 난간으로 막지 않는다.
    if (!path.some(p => p.id === 'tour_main_garden')) for (const side of [-1, 1]) {
      if (path.some(p => p.id.includes('upper_')) && side === 1 && (a.id === 'tour_main_upper_turn' || a.id === 'tour_main_upper_ramp')) continue;
      rail(a, b, side * (mainAccessWidth(path) / 2 - 0.1));
    }
  }
  // 사진의 계단 양옆 두 식재 섬 안에만 관목과 소교목을 둔다.
  for (const side of [-1,1]) {
    for (const [u,v] of [[8.3,1.5],[10.4,1.5],[12.5,1.5],[14.3,2.3],[14.7,4.3],[14.7,6.4],[14.5,8.2],[12.6,8],[10.6,7.6],[8.4,7.2],[8.4,4.5]]) {
      const [x,z]=mainSitePoint(side*u!,v!);
      shrubs.push({x,z,y:mainPlanterHeight(v!)-.04,radius:.72,height:.68,seed:(u!*v!%11)/11});
    }
    const [x,z]=mainSitePoint(side*12,4.7);
    trees.push({x,z,y:mainPlanterHeight(4.7),species:'pine',scale:.62,seed:side>0?.7:.8});
  }
  // 3층 입구 옆 작은 공원: 포장 산책로와 양쪽 벤치, 낮은 식재.
  for (const v of [-36, -27]) {
    for (const u of [61, 72]) {
      for (let i = -2; i <= 2; i++) box(wood, u, v + i * 0.1, MAIN_GARDEN_LEVEL + 0.46, [3, 0.07, 0.085], '#92613e');
      for (let i = 0; i < 3; i++) box(wood, u, v - 0.28, MAIN_GARDEN_LEVEL + 0.64 + i * 0.13, [3, 0.1, 0.07], '#92613e');
      for (const side of [-1, 1]) box(metal, u + side * 1.1, v, MAIN_GARDEN_LEVEL + 0.22, [0.09, 0.42, 0.55], '#4a5550');
    }
  }
  for (const [u, v] of [[59, -36], [75, -36], [75, -26]]) {
    const [x, z] = mainSitePoint(u!, v!); trees.push({ x, z, y: MAIN_GARDEN_LEVEL - 0.04, species: 'broadleaf', scale: 0.82, seed: u! / 100 });
  }
  return { stone, metal, wood, hedges, trees, shrubs };
}

export function mainRetainingWalls(roadMask: MultiPolygon = []) {
  const geometries: THREE.BufferGeometry[] = [];
  const point = (u: number, v: number, y: number) => { const [x, z] = mainSitePoint(u, v); return [x, y, z]; };
  for (const u of [16.65, 21.35]) for (const [v0, v1, y0, y1] of [[-.1, 8, MAIN_ENTRY_BASE+.12, MAIN_ENTRY_BASE+.12], [8, 14.5, MAIN_ENTRY_BASE+.12, MAIN_ENTRY_BASE+.12], [14.5, 16.2, MAIN_ENTRY_BASE+.12, MAIN_ENTRY_BASE+.04]]) {
    const w = 0.25, base = -0.6;
    const positions = [point(u - w, v0!, base), point(u + w, v0!, base), point(u + w, v1!, base), point(u - w, v1!, base), point(u - w, v0!, y0!), point(u + w, v0!, y0!), point(u + w, v1!, y1!), point(u - w, v1!, y1!)];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3));
    g.setIndex([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]); g.computeVertexNormals(); geometries.push(g);
  }
  // 계단 디딤판 아래도 지면까지 닫는다. 경사 상판은 디딤면보다 한 단 낮춘다.
  for (const path of MAIN_SITE_PATHS) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!;
    if (!isMainAccessStair(a.id, b.id)) continue;
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    geometries.push(siteSolid([accessStrip(a, b, mainAccessWidth(path))], (x, z) => {
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      return a.y + (b.y - a.y) * t - 0.16;
    }, MAIN_FIRST_FLOOR - 0.35));
  }
  const upper = MAIN_WALK_SURFACES[1]!;
  for (let i = 1; i < upper.length; i++) {
    const a = upper[i-1]!, b = upper[i]!;
    if (isMainAccessStair(a.id,b.id)) continue;
    const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    for (const side of [-1,1]) {
      const offset = side * (mainAccessWidth(upper)/2 - .08);
      const pa={...a,x:a.x-dz/len*offset,z:a.z+dx/len*offset}, pb={...b,x:b.x-dz/len*offset,z:b.z+dx/len*offset};
      const branch = MAIN_WALK_SURFACES[2]!;
      const openings = branch.slice(1).map((end,i) => [accessStrip(branch[i]!,end,mainAccessWidth(branch))]);
      for (const poly of clipping.difference([accessStrip(pa,pb,.16)], ...openings, roadMask)) geometries.push(siteSolid(poly,(x,z)=>{
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(len*len)));
        return a.y+(b.y-a.y)*t+.24;
      }, Math.min(a.y,b.y)-.25));
    }
  }
  return geometries;
}

export function mainPlazaDecks(_roadMask: MultiPolygon = []) {
  const garden = siteSolid([MAIN_GARDEN], () => MAIN_GARDEN_LEVEL + .045, MAIN_FIRST_FLOOR - .35);
  const plaza = siteSolid([MAIN_FRONT_PLAZA], () => MAIN_ENTRY_BASE + .045, MAIN_FIRST_FLOOR - .35);
  const stairBase = siteSolid([[mainSitePoint(-7.05,-.1),mainSitePoint(7.05,-.1),mainSitePoint(7.05,8.35),mainSitePoint(-7.05,8.35)]], () => MAIN_ENTRY_BASE - .025, MAIN_FIRST_FLOOR - .35);
  const soil = MAIN_STAIR_PLANTERS.map(r => {
    const g=siteSolid([r], (x,z)=>mainPlanterHeight(mainEntryLocal(x,z).v), MAIN_ENTRY_BASE-.12);g.userData.surface='grass';return g;
  });
  const edges=MAIN_STAIR_PLANTERS.flatMap(r=>r.map((p,i)=>{
    const q=r[(i+1)%r.length]!,a={id:'edge',x:p[0],z:p[1],y:0},b={id:'edge',x:q[0],z:q[1],y:0};
    return siteSolid([accessStrip(a,b,.14)],(x,z)=>mainPlanterHeight(mainEntryLocal(x,z).v)+.1, MAIN_ENTRY_BASE-.12);
  }));
  return [garden, plaza, stairBase, ...soil, ...edges];
}

export function MainGrounds({ roadMask, pavementMask = roadMask }: { roadMask: MultiPolygon; pavementMask?: MultiPolygon }) {
  const parts = useMemo(makeMainGroundsParts, []), decks = useMemo(() => [...mainAccessDecks(roadMask), ...mainPlazaDecks(pavementMask)], [roadMask, pavementMask]);
  const walls = useMemo(() => mainRetainingWalls(roadMask), [roadMask]);
  useEffect(() => () => walls.forEach(g => g.dispose()), [walls]);
  const paving = useSurfaceMaps('paving'), asphalt = useSurfaceMaps('asphalt'), grass = useSurfaceMaps('grass');
  useEffect(() => () => decks.forEach(g => g.dispose()), [decks]);
  return <group>
    {decks.map((g, i) => <mesh key={i} geometry={g} receiveShadow><meshStandardMaterial color={g.userData.surface === 'grass' ? '#79a950' : g.userData.surface === 'asphalt' ? '#697278' : '#aaa89e'} {...(g.userData.surface === 'grass' ? grass : g.userData.surface === 'asphalt' ? asphalt : paving)} normalScale={new THREE.Vector2(0.22, 0.22)} roughness={0.95} side={THREE.DoubleSide} attach="material-0" /><meshStandardMaterial color="#b4bab2" roughness={0.94} attach="material-1" /></mesh>)}
    {walls.map((g, i) => <mesh key={`wall-${i}`} geometry={g} castShadow receiveShadow><meshStandardMaterial color="#bfc5bc" roughness={0.87} side={THREE.DoubleSide} /></mesh>)}
    <Batch parts={parts.stone} /><Batch parts={parts.metal} metal /><Batch parts={parts.wood} /><Batch parts={parts.hedges} shape="sphere" />
    <Trees trees={parts.trees} /><Shrubs shrubs={parts.shrubs} />
  </group>;
}
