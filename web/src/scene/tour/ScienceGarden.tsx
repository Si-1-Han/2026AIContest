import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import clipping, { type MultiPolygon } from 'polygon-clipping';
import type { CampusData } from '../../types/generated/campus';
import { GARDEN_BENCHES, GARDEN_HEDGES, SCIENCE_COURT, SCIENCE_GARDEN_LEVEL } from '../../features/tour/scienceGarden';
import { Batch, type Part } from './Batch';
import { shrubMaps } from './Shrubs';
import { useSurfaceMaps } from './materials';

const LEVEL = SCIENCE_GARDEN_LEVEL;
const HEDGE_HEIGHT = 0.95, HEDGE_INSET = 0.3, BEVEL = 0.2;

/** 정원 바닥: 건물·차도·보도를 뺀 나머지 전체를 벽돌 포장으로 덮는다(평지). */
export function scienceCourtPaving(campus: CampusData, pavement: MultiPolygon) {
  const polygons = clipping.difference([SCIENCE_COURT], pavement, campus.buildings.map(b => [b.footprint]));
  const shapes = polygons.map(([outer, ...holes]) => {
    const s = new THREE.Shape(outer!.map(([x, z]) => new THREE.Vector2(x, -z)));
    s.holes = holes.map(r => new THREE.Path(r.map(([x, z]) => new THREE.Vector2(x, -z)))); return s;
  });
  const g = new THREE.ShapeGeometry(shapes); g.rotateX(-Math.PI / 2); g.translate(0, LEVEL + 0.04, 0);
  const p = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
  return g;
}

/** 둥글게 다듬은 수풀 덩어리(모서리 ㄱ자는 가로·세로 두 덩어리가 겹친다). */
export function hedgeGeometry() {
  const pieces = GARDEN_HEDGES.map(h => {
    const x0 = h.x0 + HEDGE_INSET + BEVEL, x1 = h.x1 - HEDGE_INSET - BEVEL, z0 = h.z0 + HEDGE_INSET + BEVEL, z1 = h.z1 - HEDGE_INSET - BEVEL;
    const r = Math.max(0.05, Math.min(0.9, (x1 - x0) / 2 - 0.01, (z1 - z0) / 2 - 0.01));
    const s = new THREE.Shape();
    s.moveTo(x0 + r, -z0); s.lineTo(x1 - r, -z0); s.quadraticCurveTo(x1, -z0, x1, -z0 - r);
    s.lineTo(x1, -z1 + r); s.quadraticCurveTo(x1, -z1, x1 - r, -z1); s.lineTo(x0 + r, -z1);
    s.quadraticCurveTo(x0, -z1, x0, -z1 + r); s.lineTo(x0, -z0 - r); s.quadraticCurveTo(x0, -z0, x0 + r, -z0);
    const g = new THREE.ExtrudeGeometry(s, { depth: HEDGE_HEIGHT - 2 * BEVEL, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 4, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); g.translate(0, LEVEL + BEVEL, 0);
    return g;
  });
  const merged = new THREE.BufferGeometry(), position: number[] = [], normal: number[] = [], uv: number[] = [];
  for (const g of pieces) {
    const n = g.toNonIndexed(), p = n.getAttribute('position'), q = n.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      position.push(p.getX(i), p.getY(i), p.getZ(i)); normal.push(q.getX(i), q.getY(i), q.getZ(i));
      // 잎 질감은 방향과 상관없이 비슷한 크기로 보이게 월드 좌표로 투영한다.
      const side = Math.abs(q.getY(i)) < 0.5;
      uv.push(side ? (p.getX(i) + p.getZ(i)) / 1.6 : p.getX(i) / 1.6, side ? p.getY(i) / 1.6 : p.getZ(i) / 1.6);
    }
    g.dispose(); n.dispose();
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  merged.computeBoundingSphere();
  return merged;
}

/** 화단 둘레의 낮은 통나무 경계와 벤치(나무 좌판 + 석재 다리). 수풀 속 나무는 scenery 수목 목록에 함께 들어간다. */
export function makeGardenParts() {
  const wood: Part[] = [], stone: Part[] = [], log: Part[] = [];
  // 화단 경계: 모서리 ㄱ자는 두 덩어리를 합친 바깥선만 따라 두른다.
  const beds = [
    ...[0, 2, 4, 6].map(i => clipping.union([rect(GARDEN_HEDGES[i]!)], [rect(GARDEN_HEDGES[i + 1]!)])),
    [[rect(GARDEN_HEDGES[8]!)]] as MultiPolygon,
  ];
  for (const bed of beds) for (const [ring] of bed) {
    const pts = ring!.slice(0, -1);
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length]!, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.05) return;
      log.push({ p: [(a[0] + b[0]) / 2, LEVEL + 0.14, (a[1] + b[1]) / 2], s: [len + 0.12, 0.28, 0.12], color: '#7d5f43', ry: -Math.atan2(b[1] - a[1], b[0] - a[0]) });
    });
  }
  for (const b of GARDEN_BENCHES) {
    const c = Math.cos(b.angle), s = Math.sin(b.angle);
    const at = (along: number, across: number, y: number): Part['p'] => [b.x + c * along - s * across, LEVEL + y, b.z - s * along - c * across];
    for (const across of [-0.16, 0, 0.16]) wood.push({ p: at(0, across, 0.44), s: [b.length, 0.045, 0.13], color: '#8a5d3b', ry: b.angle });
    const legs = Math.max(2, Math.round(b.length / 1.3) + 1);
    for (let i = 0; i < legs; i++) stone.push({ p: at((i / (legs - 1) - 0.5) * (b.length - 0.3), 0, 0.21), s: [0.12, 0.42, 0.44], color: '#8e938b', ry: b.angle });
  }
  return { wood, stone, log };
}
function rect(h: { x0: number; x1: number; z0: number; z1: number }): [number, number][] {
  const e = 0.08; return [[h.x0 + e, h.z0 + e], [h.x1 - e, h.z0 + e], [h.x1 - e, h.z1 - e], [h.x0 + e, h.z1 - e]];
}

export function ScienceGarden({ campus, pavement }: { campus: CampusData; pavement: MultiPolygon }) {
  const paving = useMemo(() => scienceCourtPaving(campus, pavement), [campus, pavement]);
  const hedges = useMemo(hedgeGeometry, []);
  const leaves = useMemo(shrubMaps, []);
  const parts = useMemo(makeGardenParts, []);
  const brick = useSurfaceMaps('paving');
  useEffect(() => () => { paving.dispose(); hedges.dispose(); leaves.map.dispose(); leaves.normalMap.dispose(); }, [paving, hedges, leaves]);
  return <group>
    <mesh geometry={paving} receiveShadow><meshStandardMaterial color="#c49a86" {...brick} normalScale={new THREE.Vector2(0.6, 0.6)} roughness={0.95} /></mesh>
    <mesh geometry={hedges} castShadow receiveShadow><meshStandardMaterial color="#d2e6bd" map={leaves.map} normalMap={leaves.normalMap} normalScale={new THREE.Vector2(0.5, 0.5)} roughness={0.95} /></mesh>
    <Batch parts={parts.log} /><Batch parts={parts.wood} /><Batch parts={parts.stone} />
  </group>;
}
