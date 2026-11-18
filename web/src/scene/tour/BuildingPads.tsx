import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CampusData } from '../../types/generated/campus';
import { buildingElevation } from '../../features/tour/elevationLevels';
import { useSurfaceMaps } from './materials';

/**
 * 건물 외곽선 아래는 지형이 잘려 나가 있다. 저층부가 외곽선보다 안쪽으로 들어간 건물(대학원관의 돌출 상부 아래 등)에서
 * 그 틈으로 지하의 배경면이 연녹색 판처럼 보이지 않도록, 건물 바닥 높이에 포장 슬래브를 깐다.
 * 본관은 층별 진입부를 따로 모델링하므로 제외한다.
 */
export function buildingPadGeometry(campus: CampusData) {
  const pieces = campus.buildings.filter(b => b.id !== 'main').map(b => {
    const shape = new THREE.Shape(b.footprint.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); g.translate(0, buildingElevation(b.id) + 0.02, 0);
    return g;
  });
  const merged = new THREE.BufferGeometry();
  const positions: number[] = [], indices: number[] = [];
  for (const g of pieces) {
    const offset = positions.length / 3, p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) positions.push(p.getX(i), p.getY(i), p.getZ(i));
    const index = g.index!; for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + offset);
    g.dispose();
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(positions.flatMap((v, i) => i % 3 === 1 ? [] : [v]), 2));
  merged.setIndex(indices); merged.computeVertexNormals();
  return merged;
}

export function BuildingPads({ campus }: { campus: CampusData }) {
  const geometry = useMemo(() => buildingPadGeometry(campus), [campus]);
  const paving = useSurfaceMaps('paving');
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} receiveShadow><meshStandardMaterial color="#b9b4a8" {...paving} normalScale={new THREE.Vector2(0.4, 0.4)} roughness={0.95} /></mesh>;
}
