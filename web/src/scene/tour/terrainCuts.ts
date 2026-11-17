import * as THREE from 'three';
import clipping, { type MultiPolygon } from 'polygon-clipping';
import { MAIN_PAVED_CUTS } from '../../features/tour/mainBuildingAccess';
import { spinePoint, spineDistanceAtZ } from '../../features/tour/campusSpine';
import { FOUNTAIN_CLEARING } from '../../features/tour/fountainSite';
import { MUSIC_SITE, MUSIC_ACCESS_PATH } from '../../features/tour/musicForecourt';
import { FIELD_WALK, FIELD_WALK_WIDTH } from '../../features/tour/fieldWalk';
import { gateWallSections } from '../../features/tour/gateWalls';

type P = [number, number];
export function siteTerrainCutouts(pavement: MultiPolygon = [], buildings: MultiPolygon = []): MultiPolygon {
  const walk = [...FIELD_WALK];
  const music = [spinePoint(spineDistanceAtZ(35)), ...MUSIC_ACCESS_PATH.map(p => [p.x, p.z])] as P[];
  const sections = [...walk.slice(1).map((b, i) => ({ a: walk[i]!, b, width: FIELD_WALK_WIDTH })), ...music.slice(1).map((b, i) => ({ a: music[i]!, b, width: 2.6 }))];
  const paths = sections.map(({ a, b, width }) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), nx = -dz / len * (width / 2 + 0.01), nz = dx / len * (width / 2 + 0.01);
    return [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]] as P[];
  });
  const walls = gateWallSections().map(w => {
    const nx = w.nx * 0.51, nz = w.nz * 0.51;
    return [[w.a[0]+nx,w.a[2]+nz],[w.b[0]+nx,w.b[2]+nz],[w.b[0]-nx,w.b[2]-nz],[w.a[0]-nx,w.a[2]-nz]] as P[];
  });
  const polygons = [...MAIN_PAVED_CUTS, FOUNTAIN_CLEARING, MUSIC_SITE, ...paths, ...walls].map(p => [p]);
  return clipping.union(polygons[0]!, ...polygons.slice(1), pavement, buildings);
}
const inside = ([x, z]: P, ring: P[]) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};
/** 보행면 아래의 잔디를 정확히 잘라낸다. 문 앞·계단 가장자리의 높은 삼각형도 남지 않는다. */
export function cutTerrain(source: THREE.BufferGeometry, cutouts: MultiPolygon, boundaryHeight?: (x: number, z: number) => number) {
  const position = source.getAttribute('position'), index = source.index!;
  const vertices = Array.from(position.array), indices: number[] = [];
  // 포장 경계를 공간 타일로 나눠 큰 도로 다각형도 매 삼각형마다 전체를 검사하지 않는다.
  const size = 24, buckets = new Map<string, ReturnType<typeof mask>[] >();
  function mask(poly: typeof cutouts[number]) {
    const points = poly.flat();
    return { poly, minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])), minZ: Math.min(...points.map(p => p[1])), maxZ: Math.max(...points.map(p => p[1])), edges: poly.flatMap(ring => ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length]!; return { minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minZ: Math.min(a[1], b[1]), maxZ: Math.max(a[1], b[1]) };
    })) };
  }
  const all = cutouts.flat(2);
  const minTileX = Math.floor(Math.min(...all.map(p => p[0])) / size), maxTileX = Math.floor(Math.max(...all.map(p => p[0])) / size);
  const minTileZ = Math.floor(Math.min(...all.map(p => p[1])) / size), maxTileZ = Math.floor(Math.max(...all.map(p => p[1])) / size);
  for (let tx = minTileX; tx <= maxTileX; tx++) for (let tz = minTileZ; tz <= maxTileZ; tz++) {
    const x = tx * size, z = tz * size;
    const clipped = clipping.intersection(cutouts, [[[x, z], [x + size, z], [x + size, z + size], [x, z + size]]]);
    if (clipped.length) buckets.set(`${tx}/${tz}`, clipped.map(mask));
  }
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const tri = ids.map(id => [position.getX(id), position.getZ(id)] as P);
    const minX = Math.min(...tri.map(p => p[0])), maxX = Math.max(...tri.map(p => p[0])), minZ = Math.min(...tri.map(p => p[1])), maxZ = Math.max(...tri.map(p => p[1]));
    const overlap = (b: { minX: number; maxX: number; minZ: number; maxZ: number }) => b.minX <= maxX && b.maxX >= minX && b.minZ <= maxZ && b.maxZ >= minZ;
    const candidates: ReturnType<typeof mask>[] = [];
    for (let tx = Math.floor(minX / size); tx <= Math.floor(maxX / size); tx++) for (let tz = Math.floor(minZ / size); tz <= Math.floor(maxZ / size); tz++) {
      candidates.push(...(buckets.get(`${tx}/${tz}`) ?? []).filter(overlap));
    }
    if (!candidates.length) { indices.push(...ids); continue; }
    let removed = false, boundary = false;
    for (const m of candidates) {
      const hits = tri.map(p => inside(p, m.poly[0]!) && !m.poly.slice(1).some(h => inside(p, h)));
      const edge = m.edges.some(overlap);
      if (hits.every(Boolean) && !edge) { removed = true; break; }
      boundary ||= edge || hits.some(Boolean);
    }
    if (removed) continue;
    if (!boundary) { indices.push(...ids); continue; }
    const remainder = clipping.difference([tri], ...candidates.map(m => m.poly));
    for (const [outer, ...holes] of remainder) {
      const rings = [outer!, ...holes].map(r => r.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, -z)));
      const faces = THREE.ShapeUtils.triangulateShape(rings[0]!, rings.slice(1));
      const offset = vertices.length / 3;
      // 포장 경계는 동일한 고도 함수로 다시 평가한다. 보도 끝에 보간된 잔디 봉우리를 남기지 않는다.
      const [a, b, c] = tri as [P, P, P];
      const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      for (const p of rings.flat()) {
        const z = -p.y, u = ((b[1] - c[1]) * (p.x - c[0]) + (c[0] - b[0]) * (z - c[1])) / det;
        const v = ((c[1] - a[1]) * (p.x - c[0]) + (a[0] - c[0]) * (z - c[1])) / det;
        vertices.push(p.x, boundaryHeight ? boundaryHeight(p.x, z) : u * position.getY(ids[0]!) + v * position.getY(ids[1]!) + (1 - u - v) * position.getY(ids[2]!), z);
      }
      for (const f of faces) indices.push(...f.map(n => n + offset));
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: vertices.length / 3 }, (_, i) => [vertices[i * 3]!, vertices[i * 3 + 2]!]).flat(), 2));
  result.setIndex(indices); result.computeVertexNormals(); result.computeBoundingSphere(); return result;
}
