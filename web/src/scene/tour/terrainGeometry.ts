import { cutTerrain, siteTerrainCutouts } from './terrainCuts';
import * as THREE from 'three';
import type { MultiPolygon } from 'polygon-clipping';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CampusData } from '../../types/generated/campus';
import { tourElevation } from '../../features/tour/terrain';
import { inVisionTerrace } from '../../features/tour/visionTerrace';

/** 긴 도로 폴리곤에도 경사의 중간 정점을 만들고 지면과 같은 높이에 맞춘다. */
export function conformTerrain(source: THREE.BufferGeometry, elevation: (x: number, z: number) => number, offset = 0) {
  const geometry = new TessellateModifier(1, 16).modify(source);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) + elevation(positions.getX(i), positions.getZ(i)) + offset);
  // 테셀레이션으로 분리된 삼각형의 법선을 이어 평평한 길의 주름 음영을 없앤다.
  // 연석의 수직 모서리는 날카롭게 유지한다.
  positions.needsUpdate = true; geometry.deleteAttribute('normal');
  const welded = mergeVertices(geometry, 0.00001);
  const result = toCreasedNormals(welded, Math.PI / 3);
  geometry.dispose(); welded.dispose(); result.computeBoundingSphere();
  return result;
}

export function campusTerrain(campus: CampusData, pavement: MultiPolygon = []) {
  const xs = campus.boundary.map(p => p[0]), zs = campus.boundary.map(p => p[1]);
  const minX = Math.min(...xs) - 40, maxX = Math.max(...xs) + 40, minZ = Math.min(...zs) - 40, maxZ = Math.max(...zs) + 40;
  const geometry = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, Math.ceil(maxX - minX), Math.ceil(maxZ - minZ));
  geometry.rotateX(-Math.PI / 2); geometry.translate((minX + maxX) / 2, -0.015, (minZ + maxZ) / 2);
  const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), elevation = tourElevation(campus);
  for (let i = 0; i < positions.count; i++) { const x = positions.getX(i), z = positions.getZ(i); positions.setY(i, elevation(x, z) - (inVisionTerrace(x, z, 1) ? 0.3 : 0.015)); uv.setXY(i, positions.getX(i), positions.getZ(i)); }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const result = cutTerrain(geometry, siteTerrainCutouts(pavement, campus.buildings.map(b => [b.footprint])), (x, z) => elevation(x, z) - (inVisionTerrace(x, z, 1) ? 0.3 : 0.015)); geometry.dispose(); return result;
}
