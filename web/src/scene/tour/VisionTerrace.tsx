import { useEffect, useMemo } from 'react';
import clipping, { type Polygon } from 'polygon-clipping';
import { VISION_TERRACE as SITE, VISION_TERRACE_PATH as PATH, TERRACE_HEIGHT, TERRACE_PATHS, RODEM_ACCESS_PATH, isTerraceStair } from '../../features/tour/visionTerrace';
import { PARKING_LEVEL, MIDDLE_LEVEL, STAIR_RISE, UPPER_CAMPUS_LEVEL } from '../../features/tour/elevationLevels';
import { extrudeFootprint, flatShape } from '../../lib/geometry';
import { Batch, type Part } from './Batch';
import { useSurfaceMaps } from './materials';

type P3 = [number, number, number];
const point = (p: { x: number; y: number; z: number }): P3 => [p.x, p.y + 0.04, p.z];

/** 사진의 두 구간 계단·직사각형 벤치를 이동 경로와 같은 높이로 만든다. */
export function makeTerraceParts() {
  const stone: Part[] = [], wood: Part[] = [], metal: Part[] = [];
  const box = (parts: Part[], p: P3, s: P3, color: string, ry = 0) => parts.push({ p, s, color, ry });
  const rail = (a: P3, b: P3, radius = 0.035) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    metal.push({ p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], s: [radius, Math.hypot(dx, dy, dz), radius], color: '#b5c0c0', rz: -Math.atan2(Math.hypot(dx, dz), dy), ry: Math.atan2(-dz, dx) });
  };
  const handrail = (a: P3, b: P3, offset: number) => {
    const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
    const shift = (p: P3, y: number): P3 => [p[0] + dz / len * offset, p[1] + y, p[2] - dx / len * offset];
    for (const y of [0.5, 1]) rail(shift(a, y), shift(b, y));
    const count = Math.ceil(len / 0.9);
    for (let i = 0; i <= count; i++) {
      const t = i / count, p: P3 = [a[0] + dx * t, a[1] + (b[1] - a[1]) * t, a[2] + dz * t];
      rail(shift(p, 0), shift(p, 1), 0.025);
    }
  };
  const firstStairs = PATH.slice(1, 5);
  for (let k = 1; k < firstStairs.length; k++) {
    const a = firstStairs[k - 1]!, b = firstStairs[k]!, dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx);
    if (isTerraceStair(a.id, b.id)) for (let i = 0; i < SITE.stepsPerFlight; i++) {
      const t = (i + 0.5) / SITE.stepsPerFlight, top = a.y + (b.y - a.y) * (i + 1) / SITE.stepsPerFlight, height = top - PARKING_LEVEL;
      box(stone, [a.x + dx * t, PARKING_LEVEL + 0.04 + height / 2, a.z + dz * t], [length / SITE.stepsPerFlight, height, SITE.width], i % 2 ? '#bec3be' : '#c8ccc6', angle);
    } else {
      const height = a.y - PARKING_LEVEL;
      box(stone, [(a.x + b.x) / 2, PARKING_LEVEL + 0.04 + height / 2, (a.z + b.z) / 2], [length, height, SITE.width], '#b7beb6', angle);
    }
  }
  // 첫 계단 뒤의 평지를 지나, 쉼터 직전에 한 번 더 높은 구역으로 오른다.
  const lower = PATH.find(p => p.id === 'tour_vision_rear')!, upperLanding = PATH.find(p => p.id === 'tour_vision_rest_entry')!;
  const dx = upperLanding.x - lower.x, dz = upperLanding.z - lower.z, run = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx), count = SITE.stepsPerFlight * 2;
  for (let i = 0; i < count; i++) {
    const rise = (i + 1) * STAIR_RISE / count;
    box(stone, [lower.x + dx * (i + 0.5) / count, MIDDLE_LEVEL + 0.04 + rise / 2, lower.z + dz * (i + 0.5) / count], [run / count, rise, SITE.width], i % 2 ? '#bec3be' : '#c8ccc6', angle);
  }
  const stairs = PATH.slice(1, 5);
  for (let i = 1; i < stairs.length; i++) for (const side of [-1, 1]) handrail(point(stairs[i - 1]!), point(stairs[i]!), side * (SITE.width / 2 - 0.08));
  // 상부 연결로의 난간은 쉼터 안으로 진입하기 전까지만 이어진다.
  for (const upper of [PATH.slice(4, PATH.findIndex(p => p.id === 'tour_vision_rest_entry') + 1), RODEM_ACCESS_PATH]) for (let i = 1; i < upper.length; i++) {
    const p = upper[i - 1]!, q = upper[i]!, dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz);
    if (len < 2.5) continue;
    const a = point(p), b = point(q);
    // 로뎀관 갈림길에는 난간을 끊어 실제로 옆길로 나갈 수 있게 한다.
    const junction = (id: string) => ['tour_vision_side', 'tour_rodem_turn', 'tour_rodem_north'].includes(id);
    if (junction(p.id)) { a[0] += dx / len * 2; a[2] += dz / len * 2; }
    if (junction(q.id)) { b[0] -= dx / len * 2; b[2] -= dz / len * 2; }
    for (const side of [-1, 1]) handrail(a, b, side * (SITE.width / 2 - 0.08));
  }
  const r = SITE.rest, floor = TERRACE_HEIGHT + 0.04;
  const bench = (x: number, z: number, length: number, angle: number) => {
    const place = (dx: number, dy: number, dz: number): P3 => [x + Math.cos(angle) * dx + Math.sin(angle) * dz, floor + dy, z - Math.sin(angle) * dx + Math.cos(angle) * dz];
    for (let i = 0; i < 5; i++) box(wood, place(0, 0.46, (i - 2) * 0.11), [length, 0.075, 0.095], i % 2 ? '#986134' : '#ad7745', angle);
    for (let i = 0; i < 3; i++) box(wood, place(0, 0.68 + i * 0.12, -0.26), [length, 0.09, 0.06], '#986134', angle);
    for (const side of [-1, 1]) {
      const x = side * (length / 2 - 0.3);
      box(stone, place(x, 0.22, 0), [0.12, 0.44, 0.48], '#4a5557', angle);
      box(stone, place(x, 0.63, -0.26), [0.065, 0.60, 0.065], '#4a5557', angle);
    }
  };
  // 네 변이 안쪽을 향하고 북·남측 중앙은 통행을 위해 비운다.
  for (const x of [-2.7, 2.7]) {
    bench(r.x + x, r.z - 4.7, 3.2, 0);
    bench(r.x + x, r.z + 4.7, 3.2, Math.PI);
  }
  bench(r.x - 4.3, r.z, 6.2, Math.PI / 2);
  bench(r.x + 4.3, r.z, 6.2, -Math.PI / 2);
  // 쉼터와 이공관은 같은 지면이므로 별도의 내려가는 계단/경사교를 만들지 않는다.
  return { stone, wood, metal };
}

export function terraceGeometry() {
  const stairEnds = new Set(PATH.slice(1).flatMap((p, i) => isTerraceStair(PATH[i]!.id, p.id) ? [PATH[i]!.id, p.id] : []));
  const r = SITE.rest;
  const levels = new Map<number, Polygon[]>([[UPPER_CAMPUS_LEVEL, [[[[r.x - r.width / 2, r.z - r.depth / 2], [r.x + r.width / 2, r.z - r.depth / 2], [r.x + r.width / 2, r.z + r.depth / 2], [r.x - r.width / 2, r.z + r.depth / 2]]]]]]);
  const paths = [[...PATH, { id: 'n99', x: 14.59, y: UPPER_CAMPUS_LEVEL, z: 207.48 }], ...TERRACE_PATHS.slice(1)];
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (isTerraceStair(a.id, b.id)) continue;
    // 영비관 앞 주차장 평지에는 별도 보도 상판을 겹쳐 놓지 않는다.
    if (a.y === PARKING_LEVEL && b.y === PARKING_LEVEL) continue;
    const polygons = levels.get(a.y) ?? [];
    const x = dz / len * SITE.width / 2, z = -dx / len * SITE.width / 2;
    polygons.push([[[a.x + x, a.z + z], [b.x + x, b.z + z], [b.x - x, b.z - z], [a.x - x, a.z - z]]]);
    // 계단과 평지가 만나는 모서리도 수평 참으로 채워 틈을 없앤다.
    for (const p of [a, b].filter(p => !stairEnds.has(p.id))) polygons.push([Array.from({ length: 24 }, (_, j): [number, number] => [p.x + Math.cos(j / 24 * Math.PI * 2) * SITE.width / 2, p.z + Math.sin(j / 24 * Math.PI * 2) * SITE.width / 2])]);
    levels.set(a.y, polygons);
  }
  return [...levels].flatMap(([height, polygons]) => clipping.union(polygons[0]!, ...polygons.slice(1)).map(([outline]) => {
    const base = extrudeFootprint(outline!, 0.1), top = flatShape(outline!);
    base.translate(0, height - 0.06, 0); top.translate(0, height + 0.045, 0);
    return { base, top };
  }));
}

export function VisionTerrace() {
  const parts = useMemo(makeTerraceParts, []), deck = useMemo(terraceGeometry, []);
  const paving = useSurfaceMaps('paving'), stone = useSurfaceMaps('stone'), wood = useSurfaceMaps('bark');
  useEffect(() => () => { deck.forEach(g => { g.base.dispose(); g.top.dispose(); }); }, [deck]);
  return <group>
    {deck.map((g, i) => <group key={i}>
      <mesh geometry={g.base} castShadow receiveShadow><meshStandardMaterial color="#b1b5ac" {...stone} roughness={0.95} /></mesh>
      <mesh geometry={g.top} receiveShadow><meshStandardMaterial color="#cbb69a" {...paving} roughness={0.95} /></mesh>
    </group>)}
    <Batch parts={parts.stone} />
    <group>{parts.wood.map((p, i) => <mesh key={i} position={p.p} rotation-y={p.ry ?? 0} castShadow receiveShadow><boxGeometry args={p.s} /><meshStandardMaterial color={p.color} {...wood} roughness={0.8} /></mesh>)}</group>
    <Batch parts={parts.metal} metal shape="cylinder" />
  </group>;
}
