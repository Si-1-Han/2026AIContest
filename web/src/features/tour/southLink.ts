import type { PathGraph } from '../../types/generated/campus';

type Point = [number, number];
/** 사용자 제공 지도에서 확인한 학생회관 서측 → 이공관 앞 연결길. 시작점은 원본 교차점 n133이다. */
export const SOUTH_LINK: Point[] = [[63.08, 203.01], [64, 213], [34, 214], [24, 214]];

// 이공관 동쪽 모서리와 차도 사이에 연석 및 보도 폭을 확보한다.
export const SCIENCE_SIDE_ROAD: Point[] = [[65.2, 160.18], [67.4, 171.4], [66.9, 178.7], [65.4, 185.3], SOUTH_LINK[0]!];

export function withScienceSideRoad(graph: PathGraph): PathGraph {
  const start = graph.nodes.find(node => node.id === 'n131');
  const end = graph.nodes.find(node => node.id === 'n133');
  if (!start || !end) return graph;
  const original = graph.edges.find(edge => edge.kind === 'road' && (
    edge.a === start.id && edge.b === end.id || edge.a === end.id && edge.b === start.id
  ));
  if (!original) return graph;
  const [x, z] = SCIENCE_SIDE_ROAD[0]!;
  const roadStart = { ...start, x, z };
  const turns = SCIENCE_SIDE_ROAD.slice(1, -1).map(([x, z], i) => ({
    id: `tour_science_side_${i}`, x, z, y: 0, type: 'junction' as const, building_id: null, floor_index: null,
  }));
  const chain = [roadStart, ...turns, end];
  const roadEdges = chain.slice(1).map((to, i) => {
    const from = chain[i]!;
    return { a: from.id, b: to.id, kind: original.kind, length: Math.hypot(to.x - from.x, to.z - from.z) };
  });
  const nodes = graph.nodes.map(node => node === start ? roadStart : node);
  const edges = graph.edges.flatMap(edge => {
    if (edge === original) return roadEdges;
    if (edge.a !== start.id && edge.b !== start.id) return [edge];
    const neighbor = nodes.find(node => node.id === (edge.a === start.id ? edge.b : edge.a));
    return [neighbor ? { ...edge, length: Math.hypot(neighbor.x - x, neighbor.z - z) } : edge];
  });
  return { ...graph, nodes: [...nodes, ...turns], edges };
}

// 학생회관 서쪽 외벽의 중앙 계단과 기존 도로 쪽 보도를 잇는다.
const [wallStart, wallEnd]: [Point, Point] = [[79.22, 169.54], [81.2, 202.53]];
const dx = wallEnd[0] - wallStart[0], dz = wallEnd[1] - wallStart[1];
const wallLength = Math.hypot(dx, dz);
export function studentUnionEntryPoint(distance: number, side = 0): Point {
  return [
    (wallStart[0] + wallEnd[0]) / 2 + (dx * side - dz * distance) / wallLength,
    (wallStart[1] + wallEnd[1]) / 2 + (dz * side + dx * distance) / wallLength,
  ];
}
const sidewalkDistance = 13.2, halfWidth = 2.6;
export const STUDENT_UNION_ENTRY_WALK: Point[] = [
  studentUnionEntryPoint(0, -halfWidth), studentUnionEntryPoint(0, halfWidth),
  studentUnionEntryPoint(sidewalkDistance, halfWidth), studentUnionEntryPoint(sidewalkDistance, -halfWidth),
];
export const STUDENT_UNION_SIDEWALK = studentUnionEntryPoint(sidewalkDistance);
export const STUDENT_UNION_STEPS = studentUnionEntryPoint(3.3);
