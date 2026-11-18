import { inMusicForecourt } from '../../features/tour/musicForecourt';
import { inMainEntrance } from '../../features/tour/mainEntrance';
import { inMainSite } from '../../features/tour/mainBuildingAccess';
import { FIELD_WALK, FIELD_GATE_OPENINGS, inFieldWalk, tourFieldFootprint } from '../../features/tour/fieldWalk';
import { inGateWall, inGateApproach } from '../../features/tour/gateWalls';
import { inside, segmentDistance, type Point } from '../../features/tour/network';
import type { CampusData } from '../../types/generated/campus';
import type { Part } from './Batch';
import { inSurface, type RoadLayout } from './roadLayout';
import { inVisionTerrace } from '../../features/tour/visionTerrace';
import { tourElevation } from '../../features/tour/terrain';
import { inFountainSite } from '../../features/tour/fountainSite';
import { inScienceCourt, GARDEN_TREES } from '../../features/tour/scienceGarden';
import { onBuildingSide } from '../../features/tour/buildingFrontage';

export interface TreePlacement { x: number; y?: number; z: number; seed: number; species: 'pine' | 'broadleaf' | 'flowering' | 'ginkgo'; scale: number; shrub?: boolean }
export interface Scenery { stone: Part[]; metal: Part[]; leaves: Part[]; trunks: Part[]; paving: Part[]; paint: Part[]; drains: Part[]; trees: TreePlacement[] }
export function makeScenery(campus: CampusData, layout: RoadLayout): Scenery {
  const s: Scenery = { stone: [], metal: [], leaves: [], trunks: [], paving: [], paint: [], drains: [], trees: [] };
  const box = (list: Part[], p: Part['p'], scale: Part['s'], color: string, ry = 0) => list.push({ p, s: scale, color, ry });
  const polygons = [...campus.buildings.map(b => b.footprint), ...(campus.outdoor_areas ?? []).filter(a => a.kind !== 'gate').map(a => a.footprint)];
  const free = (p: Point, margin = 2.4) => inside(p, campus.boundary) && !inSurface(p, layout.asphalt) && !inSurface(p, layout.sidewalks) && !polygons.some(poly => inside(p, poly) || poly.some((v, i) => segmentDistance(p, v, poly[(i + 1) % poly.length]!) < margin)) && layout.corridors.every(c => segmentDistance(p, c.a, c.b) > c.width / 2 + 3.2);
  const tree = (x: number, z: number, seed: number, shrub = false) => {
    if (onBuildingSide(x, z) || inGateApproach(x, z) || inMusicForecourt(x, z, 2) || inFountainSite(x, z, 7) || inScienceCourt(x, z, shrub ? 1 : 2.4) || inFieldWalk(x, z, 2) || inMainEntrance(x, z, shrub ? 7 : 9) || inMainSite(x, z, 2) || inGateWall(x, z, shrub ? 1 : 2.4) || inVisionTerrace(x, z, shrub ? 1 : 2.4) || !free([x, z], shrub ? 1 : 2.4) || s.trees.some(t => Math.hypot(t.x - x, t.z - z) < (shrub ? 2 : 5.8))) return;
    s.trees.push({ x, z, seed, species: shrub ? 'broadleaf' : seed > 0.63 ? 'pine' : seed < 0.07 ? 'flowering' : seed > 0.32 && seed < 0.48 ? 'ginkgo' : 'broadleaf', scale: 0.7 + seed * 0.65, shrub });
  };
  const lamps: Point[] = [];
  for (const [index, c] of layout.corridors.entries()) {
    const dx = c.b[0] - c.a[0], dz = c.b[1] - c.a[1], len = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx), nx = dz / len, nz = -dx / len;
    for (let d = 5; d < len - 2; d += 7) {
      const x = c.a[0] + dx * d / len, z = c.a[1] + dz * d / len;
      const otherRoad = layout.corridors.some((other, i) => i !== index && segmentDistance([x, z], other.a, other.b) < other.width / 2 + 0.2);
      if (c.width > 5 && !otherRoad && !(campus.outdoor_areas ?? []).some(a => a.kind === 'parking' && inside([x, z], a.footprint))) box(s.paint, [x, 0.05, z], [2.6, 0.012, 0.12], '#eeeee4', angle);
    }
    for (let d = 7; d < len; d += 15) for (const side of [-1, 1]) {
      const offset = (c.width / 2 + 4.7) * side, x = c.a[0] + dx * d / len + nx * offset, z = c.a[1] + dz * d / len + nz * offset;
      const seed = (Math.sin(index * 37 + d * 11 + side) + 1) / 2;
      tree(x, z, seed);
      tree(x + nx * side * 2.6, z + nz * side * 2.6, seed * 0.8, true);
    }
    // 배수구는 통행 면 위로 솟지 않는 얇은 금속 격자로 표현한다.
    if (c.kind === 'road' && len > 24) for (let d = 10; d < len - 3; d += 24) {
      const x = c.a[0] + dx * d / len + nx * (c.width / 2 - 0.25), z = c.a[1] + dz * d / len + nz * (c.width / 2 - 0.25);
      if (!inSurface([x, z], layout.asphalt)) continue;
      box(s.drains, [x, 0.048, z], [1, 1, 1], '#74837a', angle);
    }
    if (c.kind !== 'road' || len < 12) continue;
    const x = (c.a[0] + c.b[0]) / 2 + nx * (c.width / 2 + 1.2), z = (c.a[1] + c.b[1]) / 2 + nz * (c.width / 2 + 1.2);
    if (inGateApproach(x, z, 2) || !inSurface([x, z], layout.sidewalks) || lamps.some(p => Math.hypot(p[0] - x, p[1] - z) < 24)) continue;
    lamps.push([x, z]);
    s.trunks.push({ p: [x, 3, z], s: [0.065, 6, 0.065], color: '#7a8584' });
    box(s.stone, [x, 5.9, z], [2.4, 0.09, 0.1], '#87918e', angle);
    for (const side of [-1, 1]) s.leaves.push({ p: [x + dx / len * side, 5.8, z + dz / len * side], s: [0.38, 0.12, 0.32], color: '#eee9d5' });
    box(s.stone, [x + 0.3, 4.65, z], [0.6, 1.4, 0.035], '#8c6bb1');
  }
  for (let x = -110; x < 120; x += 13) for (let z = -220; z < 330; z += 14) {
    const seed = (Math.sin(x * 1.77 + z * 0.77) + 1) / 2;
    if (seed > 0.48) tree(x + Math.sin(z * 0.8) * 4, z + Math.cos(x) * 4, seed);
  }
  // 주차장은 도로와 흰 주차선만 표시하며 차량/직육면체 모형을 생성하지 않는다.
  for (const area of campus.outdoor_areas ?? []) {
    if (area.kind === 'gate') continue;
    const poly = tourFieldFootprint(area);
    if (area.kind === 'field' || area.kind === 'tennis') {
      const a = poly[0]!, b = poly[1]!, d = poly[poly.length - 1]!;
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), width = Math.hypot(d[0] - a[0], d[1] - a[1]), angle = -Math.atan2(dz, dx);
      const point = (u: number, v: number, y: number): Part['p'] => [a[0] + dx * u + (d[0] - a[0]) * v, y, a[1] + dz * u + (d[1] - a[1]) * v];
      const stripes = area.kind === 'field' ? 12 : 1;
      for (let i = 0; i < stripes; i++) box(s.paving, point((i + 0.5) / stripes, 0.5, 0.12), [len / stripes + 0.1, 0.12, width], area.kind === 'tennis' ? '#528fab' : i % 2 ? '#6fa64e' : '#55923e', angle);
      for (const u of [0.04, 0.5, 0.96]) box(s.paint, point(u, 0.5, 0.205), [0.13, 0.025, width * 0.9], '#f0efe1', angle);
      for (const v of [0.05, 0.95]) box(s.paint, point(0.5, v, 0.205), [len * 0.92, 0.025, 0.14], '#f0efe1', angle);
      // 운동장의 센터 서클과 페널티 구역.
      if (area.kind === 'field') {
        for (let i = 0; i < 32; i++) { const t = i / 32 * Math.PI * 2; box(s.paint, point(0.5 + Math.cos(t) * 7 / len, 0.5 + Math.sin(t) * 7 / width, 0.21), [1.45, 0.025, 0.12], '#f0efe1', angle - t - Math.PI / 2); }
        for (const u of [0.12, 0.88]) {
          box(s.paint, point(u, 0.5, 0.21), [0.14, 0.025, width * 0.48], '#f0efe1', angle);
          for (const v of [0.26, 0.74]) box(s.paint, point(u < 0.5 ? 0.08 : 0.92, v, 0.21), [len * 0.08, 0.025, 0.13], '#f0efe1', angle);
        }
        for (const u of [0.04, 0.96]) {
          for (const v of [0.44, 0.56]) box(s.stone, point(u, v, 1.3), [0.14, 2.5, 0.14], '#eceee1', angle);
          box(s.stone, point(u, 0.5, 2.5), [0.14, 0.14, width * 0.12], '#eceee1', angle);
        }
      } else box(s.stone, point(0.5, 0.5, 1.05), [0.08, 0.8, width * 0.9], '#c4cec6', angle);
      for (const [i, p] of poly.entries()) {
        const q = poly[(i + 1) % poly.length]!, ex = q[0] - p[0], ez = q[1] - p[1], length = Math.hypot(ex, ez), ry = -Math.atan2(ez, ex);
        const intervals: [number, number][] = area.kind === 'field' && i === 0 ? [[0, FIELD_GATE_OPENINGS[0]! - 1.5 / length], [FIELD_GATE_OPENINGS[0]! + 1.5 / length, FIELD_GATE_OPENINGS[1]! - 1.5 / length], [FIELD_GATE_OPENINGS[1]! + 1.5 / length, 1]] : [[0, 1]];
        for (const [start, end] of intervals) {
          for (let t = start * length; t <= end * length; t += 3.3) s.trunks.push({ p: [p[0] + ex * t / length, 2.8, p[1] + ez * t / length], s: [0.07, 5.6, 0.07], color: '#5d9d79' });
          for (let y = 0.5; y < 5.6; y += 0.38) box(s.stone, [p[0] + ex * (start + end) / 2, y, p[1] + ez * (start + end) / 2], [length * (end - start), 0.025, 0.025], '#6f9f83', ry);
        }
      }
    }
  }
  // 좁은 보행로의 입구는 낮은 안내 기둥만 두어 통행 폭을 확보한다.
  for (const [x, z] of [FIELD_WALK[0]!, FIELD_WALK.at(-1)!]) for (const side of [-1, 1]) {
    s.trunks.push({ p: [x + side * 1.1, 0.65, z], s: [0.065, 1.3, 0.065], color: '#647c70' });
  }
  const elevation = tourElevation(campus);
  for (const parts of [s.stone, s.metal, s.leaves, s.trunks, s.paving, s.paint, s.drains]) for (const p of parts) p.p[1] += elevation(p.p[0], p.p[2]);
  for (const p of s.drains) {
    const angle = p.ry ?? 0;
    p.rz = Math.atan2(elevation(p.p[0] + Math.cos(angle) * 0.425, p.p[2] - Math.sin(angle) * 0.425) - elevation(p.p[0] - Math.cos(angle) * 0.425, p.p[2] + Math.sin(angle) * 0.425), 0.85);
  }
  for (const p of [...s.paving, ...s.paint]) {
    const ry = p.ry ?? 0, half = p.s[0] / 2;
    const dy = elevation(p.p[0] + Math.cos(ry) * half, p.p[2] - Math.sin(ry) * half) - elevation(p.p[0] - Math.cos(ry) * half, p.p[2] + Math.sin(ry) * half);
    p.rz = Math.atan2(dy, p.s[0]); p.s[0] = Math.hypot(p.s[0], dy);
  }
  // 이공관 앞 정원의 수풀 속 나무(소나무·활엽수)는 배치도대로 고정 위치에 둔다.
  s.trees.push(...GARDEN_TREES.map(t => ({ ...t })));
  for (const t of s.trees) t.y = elevation(t.x, t.z);
  return s;
}
