import { gemiMusicWall, inMusicForecourt } from '../../features/tour/musicForecourt';
import { inMainEntrance } from '../../features/tour/mainEntrance';
import { inMainSite } from '../../features/tour/mainBuildingAccess';
import { FIELD_WALK, FIELD_GATE_OPENINGS, inFieldWalk, tourFieldFootprint } from '../../features/tour/fieldWalk';
import { inGateWall, inGateApproach } from '../../features/tour/gateWalls';
import { inside, segmentDistance, type Point } from '../../features/tour/network';
import type { CampusData } from '../../types/generated/campus';
import type { Part } from './Batch';
import { inSurface, type RoadLayout } from './roadLayout';
import { inVisionTerrace } from '../../features/tour/visionTerrace';
import { SLOPE_PROFILES, tourElevation } from '../../features/tour/terrain';
import { FOUNTAIN_CENTER, FOUNTAIN_FLAT_RADIUS, FOUNTAIN_PLANTING, inFountainSite } from '../../features/tour/fountainSite';
import { inScienceCourt, GARDEN_TREES } from '../../features/tour/scienceGarden';
import { GRADUATE_FORECOURT, onBuildingSide } from '../../features/tour/buildingFrontage';
import { CAMPUS_SPINE, spineDistanceAtZ, spinePoint } from '../../features/tour/campusSpine';
import { approachRoadPoint, APPROACH_START_Z } from '../../features/tour/graduateApproach';
import { STUDENT_UNION_ENTRY_WALK } from '../../features/tour/southLink';

// 로뎀관 앞, 중앙 주차장과 막다른 진입로 사이 잔디.
const RODEM_LAWN: Point[] = [[27, 62], [55, 49], [69, 65], [77, 98], [68, 103], [35, 107], [34, 140], [23, 146], [12, 140], [9, 97], [22, 82]];

export interface TreePlacement { x: number; y?: number; z: number; seed: number; species: 'pine' | 'broadleaf' | 'flowering' | 'ginkgo'; scale: number; shrub?: boolean }
export interface Scenery { stone: Part[]; metal: Part[]; leaves: Part[]; trunks: Part[]; paving: Part[]; paint: Part[]; drains: Part[]; trees: TreePlacement[] }
export function makeScenery(campus: CampusData, layout: RoadLayout): Scenery {
  const s: Scenery = { stone: [], metal: [], leaves: [], trunks: [], paving: [], paint: [], drains: [], trees: [] };
  const box = (list: Part[], p: Part['p'], scale: Part['s'], color: string, ry = 0) => list.push({ p, s: scale, color, ry });
  const wall = gemiMusicWall(campus);
  if (wall) {
    box(s.stone, [wall.x, wall.baseOffset + wall.height / 2, wall.z], [wall.length, wall.height, wall.thickness], '#ded8c7', wall.rotation);
    box(s.stone, [wall.x, wall.baseOffset + wall.height + 0.07, wall.z], [wall.length, 0.14, wall.thickness + 0.13], '#c8c1ae', wall.rotation);
  }
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
  const field = campus.outdoor_areas?.find(area => area.kind === 'field');
  const pavement = [layout.asphalt, layout.sidewalks, layout.walkways, layout.curbs];
  const plantingObstacles = [...polygons, ...campus.context.map(b => b.footprint)];
  const nearEdge = (p: Point, ring: Point[], margin: number) =>
    ring.some((a, i) => segmentDistance(p, a, ring[(i + 1) % ring.length]!) < margin);
  const canPlant = (p: Point, scale: number, allowFountainSite = false, crownClearance = 0) => {
    const [x, z] = p;
    if ((!allowFountainSite && inFountainSite(x, z, 7)) || inGateApproach(x, z, 2) || inMainSite(x, z, 2)) return false;
    const clearance = Math.max(1.5 + scale, crownClearance);
    if (pavement.some(surface => inSurface(p, surface) || surface.some(poly => poly.some(ring => nearEdge(p, ring, clearance))))) return false;
    if (plantingObstacles.some(ring => inside(p, ring) || nearEdge(p, ring, Math.max(1.5 + 2 * scale, crownClearance)))) return false;
    return s.trees.every(t => Math.hypot(t.x - x, t.z - z) >= (t.shrub ? 2 : 1.2 + 1.6 * (t.scale + scale)));
  };
  // 보도 가까이 작은 나무와 꽃나무를, 그 뒤에는 키와 수관 폭이 다른 나무를 엇갈려 심는다.
  const roadsideRows = [
    { offset: 8.4, start: 2.5, spacing: 5.6, low: true, spread: 2.1 },
    { offset: 14.5, start: 5, spacing: 7.2, low: false, spread: 2.1 },
  ];
  const plantRows = (road: Point[], side: -1 | 1, rows = roadsideRows) => {
    for (const row of rows) {
      // 굽은 도로에서도 식재 간격을 다음 구간까지 이어 간다.
      let distance = row.start;
      let index = 0;
      for (let i = 1; i < road.length; i++) {
        const a = road[i - 1]!, b = road[i]!;
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const length = Math.hypot(dx, dz);
        for (; distance < length; index++) {
          const seed = (1 + Math.sin(index * 2.39996 + row.offset + side)) / 2;
          const flowering = row.low ? index % 4 === 1 || index % 7 === 4 : index % 9 === 6;
          const species = flowering ? 'flowering' : seed < 0.19 ? 'pine' : seed > 0.82 ? 'ginkgo' : 'broadleaf';
          const small = row.low ? index % 5 !== 3 : index % 5 === 2;
          const scale = flowering ? 0.61 + seed * 0.19 : small ? 0.43 + seed * 0.23 : 0.79 + seed * 0.33;
          const offset = row.offset + (seed - 0.5) * row.spread;
          // 진출입로·외벽을 만나면 가까운 녹지 쪽으로 옮겨 빈 구간을 줄인다.
          for (const shift of [0, -1.7, 2.2]) {
            const lateral = side * (offset + shift);
            const p: Point = [a[0] + (dx * distance + dz * lateral) / length, a[1] + (dz * distance - dx * lateral) / length];
            if (!canPlant(p, scale)) continue;
            s.trees.push({ x: p[0], z: p[1], seed, species, scale });
            break;
          }
          distance += row.spacing + (seed - 0.5) * 2;
        }
        distance -= length;
      }
    }
  };
  const graduate = campus.buildings.find(b => b.id === 'graduate');
  if (graduate) {
    // 대학원관 옆에서 영산비전센터 앞 주차장 끝까지 아파트 쪽 녹지를 이어 채운다.
    plantRows([approachRoadPoint(APPROACH_START_Z), CAMPUS_SPINE.a, spinePoint(spineDistanceAtZ(153))], -1);
  }
  if (field) {
    // 운동장 골대 뒤 북쪽 잔디. 넓은 곳에는 큰 나무를 두고, 도로가 굽어 잔디가 좁아지는 쪽은 낮게 심는다.
    const fieldFrontTrees: [number, number, TreePlacement['species'], number][] = [
      [-22.1, -120.2, 'flowering', 0.62],
      [-18.6, -123.7, 'broadleaf', 0.43],
      [-16.3, -120.15, 'broadleaf', 0.99],
      [-12.5, -122.9, 'flowering', 0.70],
      [-11.4, -118.9, 'broadleaf', 0.39],
      [-7.75, -121.25, 'ginkgo', 1.0],
      [-4.4, -123.55, 'flowering', 0.52],
      [-2.95, -119.9, 'broadleaf', 0.47],
      [1, -121.55, 'broadleaf', 0.91],
      [5.25, -123.15, 'flowering', 0.52],
      [7.15, -120.85, 'broadleaf', 0.44],
      [10.35, -121.94, 'pine', 0.76],
      [14.55, -122.25, 'flowering', 0.65],
      [18.35, -122.5, 'broadleaf', 0.55],
      [21.45, -122.58, 'flowering', 0.50],
      [24.08, -122.45, 'ginkgo', 0.36],
    ];
    for (const [x, z, species, scale] of fieldFrontTrees) {
      const seed = (1 + Math.sin(x * 2.41 + z * 1.67)) / 2;
      if (canPlant([x, z], scale, true, 4.3 * scale)) s.trees.push({ x, z, seed, species, scale });
    }
    // 운동장 동쪽에서 로뎀관의 굽은 오르막을 지나 학생회관 교차로까지 이어진다.
    const eastBend = SLOPE_PROFILES.find(profile => profile.id === 'rodem-east')!.points.map(([x, z]): Point => [x, z]);
    plantRows([[33.97, -125.96], [36.72, -120.1], [51.66, -13.18], [58.37, 36.18], [57.42, 45.17], ...eastBend, [63.08, 203.01]], 1);
    // 커브 바깥 넓은 잔디는 보도 옆보다 느슨하게 심어 보도 쪽 수관과 자연스럽게 이어지게 한다.
    plantRows(eastBend.slice(1), 1, [{ offset: 26, start: 6, spacing: 10.5, low: false, spread: 9 }]);
  }
  if (field && graduate) {
    for (let row = 0; row < 11; row++) {
      const z = -128 + row * 2.9;
      for (let x = -70 + (row % 2) * 1.5; x < -22; x += 3.2) {
        const seed = (1 + Math.sin(x * 2.41 + z * 1.67)) / 2;
        const p: Point = [x + Math.cos(z + x * 0.43) * 0.7, z + seed - 0.5];
        const scale = 0.27 + seed * 0.12;
        if (!inside(p, FOUNTAIN_PLANTING) || Math.hypot(p[0] - FOUNTAIN_CENTER[0], p[1] - FOUNTAIN_CENTER[1]) < FOUNTAIN_FLAT_RADIUS + 1.4) continue;
        if (canPlant(p, scale, true)) s.trees.push({ x: p[0], z: p[1], seed, scale, species: seed < 0.2 ? 'pine' : 'broadleaf' });
      }
    }
  }
  if (graduate) {
    // 진입로 양옆의 새 잔디를 분수대 녹지와 비슷한 높이의 나무로 채운다.
    for (let row = 0, z = -119; z < -97; row++, z += 4.2) {
      for (let x = -72 + (row % 2) * 2.25; x < -24; x += 4.5) {
        const seed = (1 + Math.sin(x * 2.17 + z * 1.49)) / 2;
        const p: Point = [x + Math.cos(x * 0.47 + z) * 0.95, z + (seed - 0.5) * 1.55];
        if (!inside(p, GRADUATE_FORECOURT) || inside(p, FOUNTAIN_PLANTING) || nearEdge(p, graduate.footprint, 4)) continue;
        const scale = 0.34 + seed * 0.28;
        if (!canPlant(p, scale, true, 4.3 * scale)) continue;
        s.trees.push({ x: p[0], z: p[1], seed, scale, species: seed < 0.18 ? 'flowering' : seed > 0.8 ? 'ginkgo' : 'broadleaf' });
      }
    }
  }
  const rodem = campus.buildings.find(b => b.id === 'rodem');
  if (rodem) {
    const plantSmallTree = (p: Point, seed: number) => {
      const scale = 0.27 + seed * 0.12;
      if (!inside(p, RODEM_LAWN) || inVisionTerrace(...p, 2.1) || !canPlant(p, scale)) return;
      s.trees.push({ x: p[0], z: p[1], seed, scale, species: seed < 0.2 ? 'pine' : 'broadleaf' });
    };
    for (let row = 0; row < 19; row++) {
      const z = 53 + row * 4.9;
      for (let x = 11 + (row % 2) * 2.5; x < 77; x += 5.1) {
        const seed = (1 + Math.sin(x * 2.41 + z * 1.67)) / 2;
        plantSmallTree([x + Math.cos(z * 1.35 + x * 0.43) * 1.25, z + (seed - 0.5) * 2.5], seed);
      }
    }
    // 도로를 따라 보도에 가까운 빈 틈만 채우고 건물 앞 잔디의 간격은 유지한다.
    for (let row = 0; row < 18; row++) {
      const z = 51 + row * 2.8;
      for (let x = 23 + (row % 2) * 1.45; x < 77; x += 2.9) {
        const seed = (1 + Math.sin(x * 1.77 + z * 2.41)) / 2;
        const p: Point = [x + Math.cos(x + z * 0.9) * 0.65, z + seed - 0.5];
        if (nearEdge(p, rodem.footprint, 10)) continue;
        if (!layout.sidewalks.some(poly => poly.some(ring => nearEdge(p, ring, 4.5)))) continue;
        plantSmallTree(p, seed);
      }
    }
    // 로뎀관 앞 도로와 주차장 사이의 빈 곳에 낮은 꽃나무를 엇갈려 배치한다.
    for (let row = 0, z = 54.4; z < 143; row++, z += 4.2) {
      for (let x = 13.2 + (row % 2) * 2.2; x < 76; x += 4.4) {
        const seed = (1 + Math.sin(x * 2.17 + z * 1.49)) / 2;
        const p: Point = [x + Math.cos(x * 0.47 + z) * 0.7, z + (seed - 0.5) * 1.4];
        const scale = 0.4 + seed * 0.12;
        if (!inside(p, RODEM_LAWN) || inVisionTerrace(...p, 2.1)) continue;
        if (campus.buildings.some(b => nearEdge(p, b.footprint, 10))) continue;
        if (canPlant(p, scale)) s.trees.push({ x: p[0], z: p[1], seed, species: 'flowering', scale });
      }
    }
  }
  if (campus.buildings.some(b => b.id === 'music')) {
    // 음악관 남측과 중앙 주차장 사이의 잔디 띠. 중앙 계단 앞은 비운다.
    const west = -31.4, east = 50, stairX = 11.65;
    for (let i = 0, x = west; x <= east; i++) {
      const seed = (1 + Math.sin(i * 2.39996 + 0.7)) / 2;
      const z = 37.04 - (x - west) * 0.039 + (seed - 0.5) * 0.4;
      const scale = 0.27 + seed * 0.1;
      if (Math.abs(x - stairX) >= 3.6) {
        for (const offset of [0, -0.1, 0.1, -0.25, 0.25, -0.45, 0.45, -0.65, 0.65, -0.85, 0.85]) {
          const p: Point = [x, z + offset];
          if (!canPlant(p, scale)) continue;
          s.trees.push({ x: p[0], z: p[1], seed, scale, species: seed < 0.18 ? 'pine' : 'broadleaf' });
          break;
        }
      }
      x += 4.0 + (seed - 0.5) * 1.35;
    }
    // 음악관 끝에서 도로가 굽는 쪽으로 넓어지는 잔디. 큰 나무는 가운데에 둔다.
    const cornerTrees: [number, number, TreePlacement['species'], number][] = [
      [28.7, 39.8, 'broadleaf', 0.42],
      [33.4, 39.7, 'flowering', 0.6],
      [39.4, 39.8, 'broadleaf', 0.86],
      [45.1, 39.35, 'flowering', 0.62],
      [49.8, 37.6, 'broadleaf', 0.43],
      [31.7, 43.9, 'pine', 0.77],
      [35.9, 44.6, 'flowering', 0.64],
      [41.6, 44.65, 'broadleaf', 0.81],
      [48.55, 41.45, 'broadleaf', 0.45],
      [33.2, 48.2, 'broadleaf', 0.42],
      [37.9, 48.05, 'flowering', 0.54],
      [45.1, 44, 'flowering', 0.52],
    ];
    for (const [x, z, species, scale] of cornerTrees) {
      const seed = (1 + Math.sin(x * 2.41 + z * 1.67)) / 2;
      if (canPlant([x, z], scale)) s.trees.push({ x, z, seed, species, scale });
    }
  }
  // 주차장 바닥은 도로와 흰 주차선만 표시한다. 주차 차량·차막이·펜스는 ParkedCars가 주차 칸 위에 따로 놓는다.
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
  const [southX, southZ] = FIELD_WALK.at(-1)!;
  for (const side of [-1, 1]) {
    s.trunks.push({ p: [southX + side * 1.1, 0.65, southZ], s: [0.065, 1.3, 0.065], color: '#647c70' });
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
  if (campus.buildings.some(b => b.id === 'student_union')) {
    s.trees = s.trees.filter(t => {
      const p: Point = [t.x, t.z], crown = t.scale * (t.shrub ? 2.15 : 4.3);
      return !inside(p, STUDENT_UNION_ENTRY_WALK) && !nearEdge(p, STUDENT_UNION_ENTRY_WALK, crown);
    });
  }
  for (const t of s.trees) t.y = elevation(t.x, t.z);
  return s;
}
