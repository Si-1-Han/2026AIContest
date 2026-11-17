import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Building, CampusData } from '../../types/generated/campus';
import { tourBuildingName } from '../../features/tour/buildingName';
import { clearSegment, type Point } from '../../features/tour/network';
import { buildingElevation } from '../../features/tour/elevationLevels';

function BuildingName({ building, buildings }: { building: Building; buildings: Building[] }) {
  const sprite = useRef<THREE.Sprite>(null);
  const texture = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 768; c.height = 160;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fffffff0'; ctx.beginPath(); ctx.roundRect(8, 8, 752, 144, 28); ctx.fill();
    ctx.strokeStyle = '#b9cabc'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#28443b'; ctx.font = 'bold 83px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tourBuildingName(building), 384, 82, 710);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, [building.name]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ camera }) => {
    if (!sprite.current) return;
    let closest = Infinity, x = 0, z = 0;
    for (const [i, a] of building.footprint.entries()) {
      const b = building.footprint[(i + 1) % building.footprint.length]!, dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0.12, Math.min(0.88, ((camera.position.x - a[0]) * dx + (camera.position.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const px = a[0] + t * dx, pz = a[1] + t * dz, d = Math.hypot(camera.position.x - px, camera.position.z - pz);
      if (d < closest) { closest = d; x = px; z = pz; }
    }
    const anchor: Point = [x + (camera.position.x - x) / Math.max(closest, 0.01) * 0.9, z + (camera.position.z - z) / Math.max(closest, 0.01) * 0.9];
    sprite.current.visible = closest < 180 && buildings.every(other => other.id === building.id || clearSegment([camera.position.x, camera.position.z], anchor, other.footprint, 0.1));
    sprite.current.position.set(anchor[0], buildingElevation(building.id) + Math.min(building.levels * building.floor_height - 0.5, 10.5), anchor[1]);
    const width = Math.max(8, tourBuildingName(building).length * 1.65);
    sprite.current.scale.set(width, width * 160 / 768, 1);
  });
  return <sprite ref={sprite} renderOrder={100} raycast={() => null}><spriteMaterial map={texture} transparent alphaTest={0.05} depthTest={false} depthWrite={false} /></sprite>;
}

export function BuildingNames({ campus }: { campus: CampusData }) {
  return <group>{campus.buildings.map(building => <BuildingName key={building.id} building={building} buildings={campus.buildings} />)}</group>;
}
