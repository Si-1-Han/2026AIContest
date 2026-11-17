import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import clipping, { type MultiPolygon } from 'polygon-clipping';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RoadLayout } from './roadLayout';
import { useSurfaceMaps } from './materials';
import { tourElevation } from '../../features/tour/terrain';
import { useCampusStore } from '../../store/useCampusStore';
import { conformTerrain } from './terrainGeometry';
import { spineStrip, SPINE_LENGTH, spineLocal, spinePoint, spineGrade, spineDistanceAtZ } from '../../features/tour/campusSpine';
import { APPROACH_TOP_Z } from '../../features/tour/graduateApproach';
import { MUSIC_FORECOURT_LEVEL } from '../../features/tour/elevationLevels';

function geometry(polygons: MultiPolygon, height: number) {
  const shapes = polygons.map(([outer, ...holes]) => {
    const shape = new THREE.Shape(outer!.map(([x, z]) => new THREE.Vector2(x, -z)));
    shape.holes = holes.map(ring => new THREE.Path(ring.map(([x, z]) => new THREE.Vector2(x, -z))));
    return shape;
  });
  const g = height ? new THREE.ExtrudeGeometry(shapes, { depth: height, bevelEnabled: false }) : new THREE.ShapeGeometry(shapes);
  g.rotateX(-Math.PI / 2); return g;
}
export function useGroundTexture(kind: 'asphalt' | 'paving' | 'grass') {
  return useSurfaceMaps(kind).map;
}
export function roadGeometries(layout: RoadLayout, elevation: (x: number, z: number) => number) {
  // 합집합 경계의 부동소수점 미세 조각을 0.1mm 격자로 정리한 뒤 다시 자른다.
  const snap = (polygons: MultiPolygon): MultiPolygon => polygons.map(poly => poly.map(ring => ring.map(([x, z]) => [Math.round(x * 10000) / 10000, Math.round(z * 10000) / 10000])));
  return [layout.asphalt, layout.sidewalks, layout.curbs, layout.tactile, layout.parkingLines, layout.walkways].map(polygons => {
    let remainder = clipping.union(snap(polygons));
    const pieces: THREE.BufferGeometry[] = [];
    const append = (region: MultiPolygon, height: (x: number, z: number) => number, flatHeight?: number) => {
      if (!region.length) return;
      const source = geometry(region, 0);
      // 수평 주차장과 도색에는 경사용 중간 정점이 필요 없다.
      // 긴 주차선까지 세분화해 첫 화면 로딩과 메모리가 커지지 않게 한다.
      if (flatHeight !== undefined) {
        source.translate(0, flatHeight, 0);
        pieces.push(source.index ? source.toNonIndexed() : source);
        if (source.index) source.dispose();
        return;
      }
      pieces.push(conformTerrain(source, height)); source.dispose();
    };
    // 도로와 양쪽 보도를 먼저 잘라 높은 주차장 경계의 높이가 끌려 들어오지 않게 한다.
    // 교차로→대학원관 오르막 구간은 경사면으로, 그 뒤 영비관까지는 수평면으로 만든다.
    const rampEnd = spineDistanceAtZ(APPROACH_TOP_Z);
    const spineRamp = [spineStrip(0, rampEnd, -5.3, 5.3)];
    append(clipping.intersection(remainder, spineRamp), (x,z)=>spineGrade(spinePoint(spineLocal(x,z).along)[1]));
    remainder = clipping.union(snap(clipping.difference(remainder, spineRamp)));
    const spine = [spineStrip(rampEnd, SPINE_LENGTH, -5.3, 5.3)];
    append(clipping.intersection(remainder, spine), (x,z)=>spineGrade(spinePoint(spineLocal(x,z).along)[1]), MUSIC_FORECOURT_LEVEL);
    remainder = clipping.union(snap(clipping.difference(remainder, spine)));
    // 주차장 경계를 나눠 경사 삼각형이 평지 안으로 길게 걸치지 않게 한다.
    for (const pad of layout.flatPads) {
      append(clipping.intersection(remainder, [pad.ring]), () => pad.y, pad.y);
      remainder = clipping.union(snap(clipping.difference(remainder, [pad.ring])));
    }
    append(remainder, elevation);
    if (!pieces.length) return new THREE.BufferGeometry();
    const result = mergeGeometries(pieces)!; pieces.forEach(g => g.dispose()); return result;
  });
}
export function TourRoads({ layout }: { layout: RoadLayout }) {
  const campus = useCampusStore(s => s.campus)!;
  const asphalt = useSurfaceMaps('asphalt'), paving = useSurfaceMaps('paving'), curb = useSurfaceMaps('curb'), tactile = useSurfaceMaps('tactile');
  const geos = useMemo(() => roadGeometries(layout, tourElevation(campus)), [layout, campus]);
  useEffect(() => () => geos.forEach(g => g.dispose()), [geos]);
  return <group>
    <mesh geometry={geos[0]} position-y={0.04} receiveShadow><meshStandardMaterial color="#81898b" {...asphalt} normalScale={new THREE.Vector2(0.22, 0.22)} roughness={1} /></mesh>
    <mesh geometry={geos[1]} position-y={0.04} receiveShadow><meshStandardMaterial color="#c8a88b" {...paving} normalScale={new THREE.Vector2(0.6, 0.6)} roughness={0.95} /></mesh>
    <mesh geometry={geos[2]} position-y={0.044} receiveShadow><meshStandardMaterial color="#deded1" {...curb} normalScale={new THREE.Vector2(0.4, 0.4)} roughness={0.9} /></mesh>
    <mesh geometry={geos[3]} position-y={0.046} receiveShadow><meshStandardMaterial color="#ddbe60" {...tactile} normalScale={new THREE.Vector2(0.7, 0.7)} roughness={0.95} /></mesh>
    <mesh geometry={geos[4]} position-y={0.045} receiveShadow><meshStandardMaterial color="#f7f5e8" roughness={0.9} /></mesh>
    <mesh geometry={geos[5]} position-y={0.04} receiveShadow><meshStandardMaterial color="#c8a88b" {...paving} normalScale={new THREE.Vector2(0.6, 0.6)} roughness={0.95} /></mesh>
  </group>;
}
