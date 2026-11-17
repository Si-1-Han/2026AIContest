import { MUSIC_ACCESS_PATH } from './musicForecourt';
import { FIELD_WALK } from './fieldWalk';
import { FOUNTAIN_WALK } from './fountainSite';
import { straightenSpineNodes, spinePoint, spineDistanceAtZ } from './campusSpine';
import { MAIN_ENTRANCE_PATH, MAIN_ENTRY_FOOTPRINT, mainEntryLocal, isMainEntryStair } from './mainEntrance';
import { MAIN_SITE_PATHS, MAIN_ACCESS_NODES, MAIN_PARKING_PATH, MAIN_LOWER_PATH, MAIN_UPPER_PATH, MAIN_GARDEN_PATH, MAIN_LOWER_ROAD, MAIN_UPPER_ROAD, isMainAccessStair } from './mainBuildingAccess';
import type { CampusData, PathGraph } from '../../types/generated/campus';
import { TERRACE_STOPS, VISION_TERRACE_PATH, TERRACE_PATHS, RODEM_ACCESS_PATH, VISION_FRONT_PATH, isTerraceStair } from './visionTerrace';
import { tourElevation } from './terrain';
import { tourCollisionOutlines, SCIENCE_APPROACH } from './buildingAccess';

export type Point = [number, number];
export interface TourNode { id: string; x: number; y?: number; z: number; stop?: boolean; neighbors: string[] }
export interface TourCorridor { a: Point; b: Point; ay?: number; by?: number; structure?: boolean; kind: 'road' | 'walk' | 'stairs' }
export interface TourNetwork { nodes: Record<string, TourNode>; start: string; segments: [string, string][]; kinds: Record<string, TourCorridor['kind']>; corridors: TourCorridor[] }
export const TOUR_STEP_METERS = 30;

/** 사용자 제공 지도에서 확인한 학생회관 서측 → 이공관 앞 연결길. */
export const SOUTH_LINK: Point[] = [[63.08, 203.01], [64, 213], [34, 214], [24, 214]];

function withConfirmedRoad(graph: PathGraph): PathGraph {
  graph = { ...graph, nodes: straightenSpineNodes(graph.nodes) };
  if (!graph.nodes.some(n => n.id === 'n133') || !graph.nodes.some(n => n.id === 'n99')) return graph;
  const nodes = [...SOUTH_LINK.slice(1).map(([x, z], i) => ({ id: `tour_south_${i}`, x, y: 0, z, type: 'junction' as const, building_id: null, floor_index: null })), ...[[40, 202], SCIENCE_APPROACH].map(([x, z], i) => ({ id: `tour_science_${i}`, x: x!, y: 0, z: z!, type: 'junction' as const, building_id: null, floor_index: null }))];
  nodes.push(...FIELD_WALK.map(([x, z], i) => ({ id: `tour_field_walk_${i}`, x, z, y: 0, type: 'junction' as const, building_id: null, floor_index: null })));
  const [mx, mz] = spinePoint(spineDistanceAtZ(35));
  nodes.push({ id: 'tour_music_road', x: mx, z: mz, y: 0, type: 'junction', building_id: null, floor_index: null });
  nodes.push(...FOUNTAIN_WALK.slice(0, -1).map(([x, z], i) => ({ id: `tour_fountain_${i}`, x, z, y: 0, type: 'junction' as const, building_id: null, floor_index: null })));
  const chains = [['n30', 'tour_fountain_0', 'tour_music_road', 'n56'], ['n133', ...nodes.slice(0, 3).map(n => n.id), 'n99'], ['tour_south_1', 'tour_science_0', 'tour_science_1'], [...FOUNTAIN_WALK.slice(0, -1).map((_, i) => `tour_fountain_${i}`), ...FIELD_WALK.map((_, i) => `tour_field_walk_${i}`), 'n79']];
  const all = new Map([...graph.nodes, ...nodes].map(n => [n.id, n]));
  return { ...graph, nodes: [...graph.nodes, ...nodes], edges: [...graph.edges.filter(e => !([e.a, e.b].includes('n30') && [e.a, e.b].includes('n56')) && !([e.a, e.b].includes('n58') && [e.a, e.b].includes('n66')) && !([e.a, e.b].includes('n79') && [e.a, e.b].includes('n64'))), ...chains.flatMap(ids => ids.slice(1).map((b, i) => {
    const a = ids[i]!, p = all.get(a)!, q = all.get(b)!;
    return { a, b, kind: a.startsWith('tour_field_walk_') || b.startsWith('tour_field_walk_') || a.startsWith('tour_fountain_') && b !== 'tour_music_road' || b.startsWith('tour_fountain_') && a !== 'n30' ? 'walk' as const : 'road' as const, length: Math.hypot(q.x - p.x, q.z - p.z) };
  }))] };
}

function withVisionStairs(campus: CampusData, graph: PathGraph): PathGraph {
  if (!['vision_center', 'science'].every(id => campus.buildings.some(b => b.id === id)) || !['n84', 'n99'].every(id => graph.nodes.some(n => n.id === id))) return graph;
  const points = [...VISION_TERRACE_PATH, ...RODEM_ACCESS_PATH.slice(1), VISION_FRONT_PATH[0]!];
  const nodes = points.map(p => ({ ...p, type: 'junction' as const, building_id: null, floor_index: null }));
  const chains = [['n84', 'tour_vision_front', ...VISION_TERRACE_PATH.map(n => n.id), 'n99'], RODEM_ACCESS_PATH.map(n => n.id)];
  const all = new Map([...graph.nodes, ...nodes].map(n => [n.id, n]));
  return { ...graph, nodes: [...graph.nodes, ...nodes], edges: [...graph.edges, ...chains.flatMap(ids => ids.slice(1).map((b, i) => {
    const a = ids[i]!, p = all.get(a)!, q = all.get(b)!;
    return { a, b, kind: isTerraceStair(a, b) ? 'stairs' as const : 'walk' as const, length: Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) };
  }))] };

}

function withMainEntrance(campus: CampusData, graph: PathGraph): PathGraph {
  if (!campus.buildings.some(b => b.id === 'main') || !graph.nodes.some(n => n.id === 'n25')) return graph;
  const nodes = [...new Map([...MAIN_ENTRANCE_PATH, ...MAIN_ACCESS_NODES, ...MUSIC_ACCESS_PATH].map(p => [p.id, p])).values()].map(p => ({ ...p, type: 'junction' as const, building_id: null, floor_index: null }));
  const all = new Map([...graph.nodes, ...nodes].map(n => [n.id, n]));
  // 기존 잔디 언덕으로 들어가던 접근선을 새 계단 진입로로 대체한다.
  const edges = graph.edges.filter(e => {
    const a = all.get(e.a)!, b = all.get(e.b)!;
    if (e.kind !== 'road') {
      const points = [a, b].map(p => mainEntryLocal(p.x, p.z));
      if (points.some(p => p.u > -43 && p.u < 44 && p.v > -1 && p.v < 26)) return false;
    }
    return clearSegment([a.x, a.z], [b.x, b.z], MAIN_ENTRY_FOOTPRINT, 0.2);
  });
  for (const [a, b, entry] of [['n104', 'n74', MAIN_UPPER_ROAD]] as const) {
    const index = edges.findIndex(e => e.a === a && e.b === b || e.a === b && e.b === a);
    if (index < 0) continue;
    const [edge] = edges.splice(index, 1);
    for (const [from, to] of [[a, entry.id], [entry.id, b]]) {
      const p = all.get(from!)!, q = all.get(to!)!;
      edges.push({ ...edge!, a: from!, b: to!, length: Math.hypot(q.x - p.x, q.z - p.z) });
    }
  }
  const chains = [
    ['n25', ...MAIN_ENTRANCE_PATH.map(p => p.id)],
    ['n28', ...MAIN_PARKING_PATH.map(p => p.id)],
    ['n31', MAIN_LOWER_ROAD.id, ...MAIN_LOWER_PATH.map(p => p.id)],
    [MAIN_UPPER_ROAD.id, ...MAIN_UPPER_PATH.map(p => p.id)],
    MAIN_GARDEN_PATH.map(p => p.id),
    ['tour_music_road', ...MUSIC_ACCESS_PATH.map(p => p.id)],
  ];
  return { ...graph, nodes: [...graph.nodes, ...nodes], edges: [...edges, ...chains.flatMap(ids => ids.slice(1).flatMap((b, i) => {
    const a = ids[i]!, p = all.get(a), q = all.get(b);
    if (!p || !q) return [];
    return [{ a, b, kind: isMainEntryStair(a, b) || isMainAccessStair(a, b) ? 'stairs' as const : 'walk' as const, length: Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) }];
  }))] };
}

export function inside(p: Point, polygon: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
}
const cross = (a: Point, b: Point, p: Point) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
export function clearSegment(a: Point, b: Point, polygon: Point[], margin = 1.4): boolean {
  if (inside(a, polygon) || inside(b, polygon)) return false;
  return polygon.every((c, i) => {
    const d = polygon[(i + 1) % polygon.length]!;
    if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return false;
    return Math.min(segmentDistance(a, c, d), segmentDistance(b, c, d), segmentDistance(c, a, b), segmentDistance(d, a, b)) >= margin;
  });
}

/** 실내 접근선·건물 관통선·교외 구간을 제외하고 정문에서 이어지는 보행망만 사용한다. */
export function buildTourNetwork(campus: CampusData, graph: PathGraph): TourNetwork {
  const elevation = tourElevation(campus);
  graph = withConfirmedRoad(graph);
  graph = withVisionStairs(campus, { ...graph, nodes: graph.nodes.map(n => ({ ...n, y: elevation(n.x, n.z) })) });
  graph = withMainEntrance(campus, graph);
  const source = new Map(graph.nodes.map(n => [n.id, n]));
  const nodes: TourNetwork['nodes'] = {};
  const segments: TourNetwork['segments'] = [];
  const kinds: TourNetwork['kinds'] = {};
  const corridors: TourCorridor[] = [];
  const add = (id: string, x: number, z: number, y = 0) => nodes[id] ??= { id, x, y, z, stop: TERRACE_STOPS.has(id) || MAIN_ACCESS_NODES.some(p => p.id === id) || MAIN_ENTRANCE_PATH.some(p => p.id === id && p.stop) || id === 'tour_science_1', neighbors: [] };
  const nearCampus = (p: Point) => inside(p, campus.boundary) || campus.boundary.some((v, i) => segmentDistance(p, v, campus.boundary[(i + 1) % campus.boundary.length]!) < 8);
  for (const [ei, e] of graph.edges.entries()) {
    const a = source.get(e.a), b = source.get(e.b);
    if (!a || !b || a.type === 'entrance' || b.type === 'entrance' || e.kind === 'stairs' && !a.id.startsWith('tour_vision_') && !a.id.startsWith('tour_main_')) continue;
    const pa: Point = [a.x, a.z], pb: Point = [b.x, b.z];
    if (!campus.buildings.every(v => tourCollisionOutlines(v, a.y, b.y).every(outline => clearSegment(pa, pb, outline)))) continue;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 10));
    if (!Array.from({ length: steps + 1 }, (_, i): Point => [a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps]).every(nearCampus)) continue;
    const structure = e.kind !== 'road' && (a.id === MAIN_LOWER_ROAD.id || a.id === MAIN_UPPER_ROAD.id || MAIN_ENTRANCE_PATH.some(p => p.id === a.id || p.id === b.id) || MAIN_SITE_PATHS.slice(1).some(path => path.some(p => p.id === a.id)) || TERRACE_PATHS.some(path => path.some(p => p.id === a.id) && (path.some(p => p.id === b.id) || b.id === 'n99')));
    corridors.push({ a: pa, b: pb, ay: a.y, by: b.y, structure, kind: e.kind });
    let last = add(a.id, a.x, a.z, a.y);
    for (let i = 1; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps;
      const next = add(i === steps ? b.id : `tour_${ei}_${i}`, x, z, i === steps ? b.y : structure ? a.y + (b.y - a.y) * i / steps : elevation(x, z));
      if (!last.neighbors.includes(next.id)) {
        last.neighbors.push(next.id); next.neighbors.push(last.id); segments.push([last.id, next.id]); kinds[`${last.id}/${next.id}`] = e.kind;
      }
      last = next;
    }
  }
  const gate = campus.outdoor_areas?.find(v => v.id === 'gate_main')?.center ?? [-122.13, -217.57];
  const candidates = Object.values(nodes);
  if (!candidates.length) throw new Error('투어에 사용할 연결된 보행로가 없습니다.');
  const start = candidates.reduce((best, n) => Math.hypot(n.x - gate[0]!, n.z - gate[1]!) < Math.hypot(best.x - gate[0]!, best.z - gate[1]!) ? n : best).id;
  const reached = new Set([start]), queue = [start];
  for (let i = 0; i < queue.length; i++) for (const id of nodes[queue[i]!]!.neighbors) if (!reached.has(id)) { reached.add(id); queue.push(id); }
  const connected = segments.filter(([a, b]) => reached.has(a) && reached.has(b));
  return { nodes: Object.fromEntries(candidates.filter(n => reached.has(n.id)).map(n => [n.id, n])), start, segments: connected, kinds, corridors: corridors.filter(c => candidates.some(n => reached.has(n.id) && Math.hypot(n.x - c.a[0], n.z - c.a[1]) < 0.01)) };
}

export function nearestTourNode(network: TourNetwork, goal: Point): TourNode {
  return Object.values(network.nodes).reduce((a, b) => Math.hypot(b.x - goal[0], b.z - goal[1]) < Math.hypot(a.x - goal[0], a.z - goal[1]) ? b : a);
}

/** 최대 30m를 연결선을 따라 이동한다. 갈림길에서는 멈춰 모든 분기를 선택하게 한다. */
export function planTourMove(network: TourNetwork, from: string, first: string, meters = TOUR_STEP_METERS, guide?: string[]) {
  const path = [from]; let distance = 0, previous = from, next = first;
  if (!network.nodes[from]?.neighbors.includes(first) || meters <= 0) return { network, path, distance };
  for (let limit = 0; limit < 80; limit++) {
    const a = network.nodes[previous]!, b = network.nodes[next]!;
    const length = Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z);
    if (distance + length > meters + 0.001) {
      const t = (meters - distance) / length;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t;
      const id = `step_${x.toFixed(4)}_${z.toFixed(4)}`;
      const kind = network.kinds[`${previous}/${next}`] ?? network.kinds[`${next}/${previous}`] ?? 'road';
      const nodes = { ...network.nodes,
        [previous]: { ...a, neighbors: a.neighbors.map(n => n === next ? id : n) },
        [next]: { ...b, neighbors: b.neighbors.map(n => n === previous ? id : n) },
        [id]: { id, x, y, z, neighbors: [previous, next] },
      };
      const segments = network.segments.filter(([u, v]) => !(u === previous && v === next || u === next && v === previous));
      segments.push([previous, id], [id, next]);
      return { network: { ...network, nodes, segments, kinds: { ...network.kinds, [`${previous}/${id}`]: kind, [`${id}/${next}`]: kind } }, path: [...path, id], distance: meters };
    }
    distance += length; path.push(next);
    if (distance >= meters - 0.001) break;
    // 직진이 뚜렷해도 갈림길을 통과하면 옆길 화살표를 선택할 기회가 사라진다.
    if (b.neighbors.length > 2 || b.stop) break;
    if (guide?.[0] === from && guide[1] === first) {
      const guided = guide[guide.indexOf(next) + 1];
      if (!guided || !b.neighbors.includes(guided)) break;
      previous = next; next = guided; continue;
    }
    const options = b.neighbors.filter(id => id !== previous && !path.includes(id));
    if (!options.length) break;
    previous = next; next = options[0]!;
  }
  return { network, path, distance };
}

/** 선택한 건물 근처까지의 안내선. 이동은 항상 사용자가 인접 지점을 눌러 수행한다. */
export function tourPath(network: TourNetwork, from: string, goal: Point): string[] {
  const target = nearestTourNode(network, goal);
  const queue = new Set([from]), parent = new Map<string, string | null>([[from, null]]);
  const distances = new Map([[from, 0]]);
  while (queue.size) {
    const id = [...queue].reduce((a, b) => distances.get(a)! < distances.get(b)! ? a : b);
    queue.delete(id);
    if (id === target.id) {
      const route = [id]; let prev = parent.get(id);
      while (prev) { route.unshift(prev); prev = parent.get(prev); }
      return route;
    }
    const node = network.nodes[id]!;
    for (const next of node.neighbors) {
      const p = network.nodes[next]!, distance = distances.get(id)! + Math.hypot(p.x - node.x, (p.y ?? 0) - (node.y ?? 0), p.z - node.z);
      if (distance < (distances.get(next) ?? Infinity)) { distances.set(next, distance); parent.set(next, id); queue.add(next); }
    }
  }
  return [];
}
