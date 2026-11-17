import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import clipping, { type MultiPolygon } from 'polygon-clipping';
import type { CampusData } from '../../types/generated/campus';
import { FOUNTAIN_CLEARING } from '../../features/tour/fountainSite';
import { tourElevation } from '../../features/tour/terrain';
import { conformTerrain } from './terrainGeometry';
import { useSurfaceMaps } from './materials';

export function fountainCourtGeometry(campus: CampusData, pavement: MultiPolygon) {
  const polygons = clipping.difference([FOUNTAIN_CLEARING], pavement, campus.buildings.map(b => [b.footprint]));
  const shapes = polygons.map(([outer, ...holes]) => {
    const s = new THREE.Shape(outer!.map(([x, z]) => new THREE.Vector2(x, -z)));
    s.holes = holes.map(r => new THREE.Path(r.map(([x, z]) => new THREE.Vector2(x, -z)))); return s;
  });
  const source = new THREE.ShapeGeometry(shapes), elevation = tourElevation(campus); source.rotateX(-Math.PI / 2);
  const g = conformTerrain(source, elevation, 0.04); source.dispose(); return g;
}
export function FountainCourt({ campus, pavement }: { campus: CampusData; pavement: MultiPolygon }) {
  const g = useMemo(() => fountainCourtGeometry(campus, pavement), [campus, pavement]);
  const stone = useSurfaceMaps('paving');
  useEffect(() => () => g.dispose(), [g]);
  return <mesh geometry={g} receiveShadow><meshStandardMaterial color="#c8a88b" {...stone} normalScale={new THREE.Vector2(0.6, 0.6)} roughness={0.95} /></mesh>;
}
